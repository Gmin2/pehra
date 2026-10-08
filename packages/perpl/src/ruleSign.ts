// what the owner signs to create, cancel or pause rules. the phone shows the same lines it signs, and the
// server rebuilds them from the rule it received before checking the signature, so the app cannot sign
// one rule and send another. a nonce and an expiry make every signature good once, for five minutes
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from 'viem'
import type { Rule } from './rule'

export const SIGN_TTL_MS = 5 * 60_000

// json with sorted keys at every level, so the same rule always hashes the same
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v)
}

export const ruleHash = (r: Rule) => bytesToHex(sha256(new TextEncoder().encode(canonicalJson(r)))).slice(2)

// one plain line a person can check before signing
export function summary(r: Rule, symbol = `market ${r.mkt}`): string {
  // a stop's floor sits past its price on the side the position loses: under it for a long, over it for a short
  if (r.kind === 'stop') return `hidden stop on ${symbol} at ${r.px}, never ${r.floor < r.px ? 'below' : 'above'} ${r.floor}, backstop ${r.backstopPx} on perpl`
  if (r.kind === 'funding') return `close the ${symbol} position when funding turns against it, never more than ${r.floorPct}% from the price`
  if (r.kind === 'entry') return `open a ${r.side} on ${symbol} when it ${r.when === 'below' ? 'falls' : 'rises'} to ${r.px}, ${r.margin} ausd at ${r.leverage}x, never ${r.side === 'long' ? 'above' : 'below'} ${r.limit}${r.stop ? `, then a hidden stop at ${r.stop.px}, never ${r.side === 'long' ? 'below' : 'above'} ${r.stop.floor}, backstop ${r.stop.backstopPx} on perpl` : ''}`
  if (r.kind === 'ladder') return `take profit on ${symbol}: ${r.steps.map(s => `${s.share}% at ${s.px}`).join(', ')}`
  if (r.kind === 'guard') return `guard on ${symbol}: add margin under ${r.threshold}% from liquidation, back to ${r.target}%, at most ${r.maxAddDay} ausd a day`
  return `ping when ${symbol} goes above ${r.above}`
}

export type SignedAction = { action: 'create'; rule: Rule; symbol?: string } | { action: 'cancel'; id: string } | { action: 'pause' } | { action: 'hold'; id: string } | { action: 'resume'; id: string }

export function ruleMessage(address: string, a: SignedAction, nonce: string, exp: number): string {
  const head = `pehra rules for ${address.toLowerCase()}`
  const what = a.action === 'create'
    ? [summary(a.rule, a.symbol), `id ${a.rule.id} v${a.rule.v}`, `sha256 ${ruleHash(a.rule)}`]
    : a.action === 'cancel' ? [`cancel rule ${a.id}`]
    : a.action === 'hold' ? [`pause rule ${a.id}`]
    : a.action === 'resume' ? [`resume rule ${a.id}`]
    : ['pause every rule']
  return [head, ...what, `nonce ${nonce}`, `expires ${new Date(exp).toISOString()}`].join('\n')
}
