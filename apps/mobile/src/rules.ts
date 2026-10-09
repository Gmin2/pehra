// the app's side of rules: every write is signed by the passkey over the same plain lines the screen
// shows (packages/perpl/src/ruleSign.ts), the server rebuilds them before it accepts anything
import { Rule as RuleSchema, ruleMessage, summary, SIGN_TTL_MS, type Rule, type SignedAction, type Report, type Profile, type ManyReport } from '@pehra/perpl'
import type { Session } from './account'
import { API } from './trade'
import { authedGet, authedPost } from './session'

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

// several rules replayed together: from the open position they protect, or flat for an entry recipe
export type ManyResult = ManyReport & { days: number; ms: number }
export async function replayMany(address: string, rules: Rule[], entry: { side: 'long' | 'short'; margin: number; leverage: number } | null, days = 30) {
  return post<ManyResult>('/replay', { address, rules, entry, days })
}

// a recipe as a link: the server keeps which recipe, the market and the sizes, the link is a short id
export const LINK_HOST = 'https://pehra-passkeys.vercel.app'
export type SharedRecipe = { id: string; recipe: string; symbol: string; margin: number; leverage: number; author: string; created: number; copies: number; name: string; blurb: string; needs: 'position' | 'none' }
export async function shareRecipe(address: string, s: { recipe: string; symbol: string; margin: number; leverage: number }) {
  const r = await authedPost<{ id: string }>('/recipes', address, { address, ...s })
  return { id: r.id, url: `${LINK_HOST}/r/${r.id}` }
}
export async function readShared(id: string): Promise<SharedRecipe> {
  const r = await fetch(`${API}/recipes/${id}`)
  const j = (await r.json()) as SharedRecipe & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `recipe ${r.status}`)
  return j
}
export const markCopied = (id: string) => fetch(`${API}/recipes/${id}/copied`, { method: 'POST' }).catch(() => null)

// any address: positions from the chain, recent trades from the indexer, how it trades, and whether it
// runs pehra. the watch list lives on the server so a watched account can push
export type WatchedPos = { pid: number; mkt: number; symbol: string; side: 'long' | 'short'; entry: number; mark: number; liq: number; distance: number; collateral: number; size: number; pnl: number }
export type WatchRead = { address: string; accountId: number | null; balance: number; positions: WatchedPos[]; recent: { kind: string; perpId: string | null; side: string | null; timestamp: number; tx?: string }[]; profile: Profile; onPehra: boolean; receipts: number; stopsKnown: false }
export async function readWatch(address: string): Promise<WatchRead> {
  const r = await fetch(`${API}/watch/${address}`)
  const j = (await r.json()) as WatchRead & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `watch ${r.status}`)
  return j
}
export async function setWatch(owner: string, target: string, on: boolean) {
  return authedPost<{ watching: { target: string; created: number }[] }>(on ? '/watch' : '/unwatch', owner, { address: owner, target })
}
export async function myWatches(owner: string) {
  const r = await authedGet(`/watches/${owner}`, owner)
  if (!r.ok) return []
  return ((await r.json()) as { watching: { target: string; created: number }[] }).watching
}

// the leaderboard: realized pnl per perpl account over the last days, from the indexer
export type Leader = { address: string; accountId: string; pnl: number; trades: number; closed: number; wins: number; liquidations: number; lastAt: number }
export async function readLeaders(days = 7): Promise<Leader[]> {
  const r = await fetch(`${API}/leaderboard?days=${days}`)
  const j = (await r.json()) as { leaders?: Leader[]; error?: string }
  if (!r.ok || !j.leaders) throw new Error(j.error ?? `leaderboard ${r.status}`)
  return j.leaders
}
