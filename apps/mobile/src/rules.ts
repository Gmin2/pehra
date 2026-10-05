// the app's side of rules: every write is signed by the passkey over the same plain lines the screen
// shows (packages/perpl/src/ruleSign.ts), the server rebuilds them before it accepts anything
import { ruleMessage, summary, SIGN_TTL_MS, type Rule, type SignedAction } from '@pehra/perpl'
import type { Session } from './account'
import { API } from './trade'

export type RuleRow = { id: string; kind: Rule['kind']; state: string; mode: 'pehra' | 'perpl' | 'both'; by: string; fires: number; rule: Rule; lastRun: number | null; created: number }

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

export async function createRule(s: Session, rule: Rule, symbol: string) {
  return post<{ rule: { id: string; state: string; mode: string } }>(`/rules/${s.address}`, { rule, ...(await signed(s, { action: 'create', rule, symbol })) })
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
  const r = await fetch(`${API}/rules/${address}`)
  if (!r.ok) throw new Error(`rules ${r.status}`)
  return ((await r.json()) as { rules: RuleRow[] }).rules
}
