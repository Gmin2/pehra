// the web try page: the first write asks for the drawn fingerprint and opens a pretend device session, like
// the phone does once a week. writes then go to the in browser copy of the account (web/sim.ts)
import type { Session } from './account'
import { API } from './trade'
import { fingerprint } from './web/demo'

let session: string | null = null
export const setSigner = (_fn: (address: string) => Promise<Session>) => {}
export async function openSession(_s: Session): Promise<string> { return (session = 'demo') }
export async function token(_address: string, _renew = false): Promise<string> {
  if (!session) { await fingerprint(); session = 'demo' }
  return session
}
export async function quietToken(_address: string): Promise<string | null> { return session }
export async function forget(_address: string) { session = null }
export async function authedPost<T>(path: string, address: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await token(address)}` }, body: JSON.stringify(body) })
  const j = (await r.json()) as T & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `${path} ${r.status}`)
  return j
}
export async function authedGet(path: string, _address: string): Promise<Response> { return fetch(`${API}${path}`) }
