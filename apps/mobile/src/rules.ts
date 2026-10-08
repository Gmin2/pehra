// the app's side of rules: every write is signed by the passkey over the same plain lines the screen
// shows (packages/perpl/src/ruleSign.ts), the server rebuilds them before it accepts anything
import { Rule as RuleSchema, ruleMessage, summary, SIGN_TTL_MS, type Rule, type SignedAction, type Report, type Profile } from '@pehra/perpl'
import type { Session } from './account'
import { API } from './trade'
import { authedGet } from './session'

export type RuleRow = { id: string; kind: Rule['kind']; state: string; mode: 'pehra' | 'perpl' | 'both'; by: string; fires: number; rule: Rule; live?: { px: number; floor: number; backstopPx: number }; lastRun: number | null; created: number }

async function signed(s: Session, a: SignedAction) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('')
  const exp = Date.now() + SIGN_TTL_MS
  const sig = await s.account.signMessage({ message: ruleMessage(s.address, a, nonce, exp) })
  return { nonce, exp, sig }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json()) as T & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `rules ${r.status}`)
  return j
}

// the line the confirm sheet shows is the line that gets signed
export const describeRule = (r: Rule, symbol: string) => summary(r, symbol)

export async function createRule(s: Session, draft: Rule, symbol: string) {
  // the server rebuilds the signed message from the parsed rule, so the phone signs the parsed one too
  const rule = RuleSchema.parse(draft)
  return post<{ rule: { id: string; state: string; mode: string } }>(`/rules/${s.address}`, { rule, ...(await signed(s, { action: 'create', rule, symbol })) })
}

// a recipe: several rules, one fingerprint over every one of them
export async function createRules(s: Session, name: string, drafts: Rule[], symbol: string) {
  const rules = drafts.map(d => RuleSchema.parse(d))
  return post<{ rules: { id: string; state: string; mode: string }[] }>(`/rules/${s.address}/many`, { name, rules, ...(await signed(s, { action: 'createMany', name, rules, symbol })) })
}

export async function cancelRule(s: Session, id: string) {
  return post<{ ok: true }>(`/rules/${s.address}/${id}/cancel`, await signed(s, { action: 'cancel', id }))
}

export async function holdRule(s: Session, id: string, hold: boolean) {
  return post<{ state: string }>(`/rules/${s.address}/${id}/${hold ? 'hold' : 'resume'}`, await signed(s, hold ? { action: 'hold', id } : { action: 'resume', id }))
}

export async function pauseRules(s: Session) {
  return post<{ paused: number }>(`/rules/${s.address}/pause`, await signed(s, { action: 'pause' }))
}

export async function listRules(address: string): Promise<RuleRow[]> {
  const r = await authedGet(`/rules/${address}`, address)
  if (!r.ok) throw new Error(`rules ${r.status}`)
  return ((await r.json()) as { rules: RuleRow[] }).rules
}

// what the rule would have done on the last days of perpl candles, read only
export type ReplayResult = Report & { days: number; ms: number }
export async function replayRule(address: string, rule: Rule, days = 30) {
  return post<ReplayResult>('/replay', { address, rule, days })
}

// how the account trades, from its perpl history, and the rules that would fit its open positions
export async function readProfile(address: string): Promise<Profile> {
  const r = await fetch(`${API}/profile/${address}`)
  const j = (await r.json()) as Profile & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `profile ${r.status}`)
  return j
}
