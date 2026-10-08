// the device session (services/api/src/sessions.ts): the passkey signs one message, the server returns a
// token kept in SecureStore for a week. trades, closes, margin and settings send it, so they still fill in
// about a second with no prompt. when it is missing or the server says so, one fingerprint opens a new one
import * as SecureStore from 'expo-secure-store'
import * as Device from 'expo-device'
import { ruleMessage, SIGN_TTL_MS } from '@pehra/perpl'
import type { Session } from './account'
import { API } from './trade'

type Stored = { token: string; exp: number }
const KEY = (address: string) => `pehra.session.${address.toLowerCase()}`
const cache = new Map<string, Stored>()
// renew a day before it runs out, so a session never dies in the middle of a trade
const SPARE = 86_400_000

// how the app gets a signed in passkey session when it has none, set once by the store
let signer: ((address: string) => Promise<Session>) | null = null
export const setSigner = (fn: (address: string) => Promise<Session>) => { signer = fn }

async function stored(address: string): Promise<Stored | null> {
  const hit = cache.get(address.toLowerCase())
  if (hit) return hit
  const raw = await SecureStore.getItemAsync(KEY(address)).catch(() => null)
  const s = raw ? (JSON.parse(raw) as Stored) : null
  if (s) cache.set(address.toLowerCase(), s)
  return s
}

const device = () => [Device.manufacturer, Device.modelName].filter(Boolean).join(' ').toLowerCase().slice(0, 64) || 'a phone'

export async function openSession(s: Session): Promise<string> {
  const d = device()
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('')
  const exp = Date.now() + SIGN_TTL_MS
  const sig = await s.account.signMessage({ message: ruleMessage(s.address, { action: 'session', device: d }, nonce, exp) })
  const r = await fetch(`${API}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: s.address, device: d, nonce, exp, sig }) })
  const j = (await r.json()) as { token?: string; exp?: number; error?: string }
  if (!r.ok || !j.token || !j.exp) throw new Error(j.error ?? `session ${r.status}`)
  const st = { token: j.token, exp: j.exp }
  cache.set(s.address.toLowerCase(), st)
  await SecureStore.setItemAsync(KEY(s.address), JSON.stringify(st))
  return st.token
}

// a token for this address, opening a session (one fingerprint) only when there is none left
export async function token(address: string, renew = false): Promise<string> {
  const s = renew ? null : await stored(address)
  if (s && s.exp - SPARE > Date.now()) return s.token
  if (!signer) throw new Error('sign in again')
  return openSession(await signer(address))
}

// the token if one is already here, for reads, never prompts
export async function quietToken(address: string): Promise<string | null> {
  const s = await stored(address)
  return s && s.exp > Date.now() ? s.token : null
}

export async function forget(address: string) {
  cache.delete(address.toLowerCase())
  await SecureStore.deleteItemAsync(KEY(address)).catch(() => {})
}

// a write that needs the session. a 401 from the server (expired, signed out elsewhere) opens a fresh one
// and tries once more
export async function authedPost<T>(path: string, address: string, body: unknown): Promise<T> {
  const send = async (t: string) => fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify(body) })
  let r = await send(await token(address))
  if (r.status === 401) r = await send(await token(address, true))
  const j = (await r.json()) as T & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `${path} ${r.status}`)
  return j
}

// a read that shows more to the owner (settings, events, rule levels) and still works for anyone
export async function authedGet(path: string, address: string): Promise<Response> {
  const t = await quietToken(address)
  return fetch(`${API}${path}`, { headers: t ? { authorization: `Bearer ${t}` } : {} })
}
