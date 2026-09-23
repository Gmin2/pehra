// the guard lives on the server. the passkey signs one delegation so the server can hold a trading
// session for this account, then the phone reads health and events and sends its orders on that session.
import type { TypedDataDefinition } from 'viem'
import type { Session } from './account'
import { API } from './trade'

type Wire = { types: Record<string, { name: string; type: string }[]>; domain: { name: string; version: string; chainId: string; verifyingContract?: `0x${string}`; salt?: `0x${string}` }; primaryType: string; message: Record<string, unknown> }
export type PositionHealth = { pid: number; side: string; entry: number; mark: number; liq: number; distance: number; collateral: number; size: number; symbol: string; lv: number; mkt: number; stop?: number; take?: number }
export type GuardEvent = { at: number; pid?: number; symbol?: string; kind: 'watch' | 'warn' | 'add' | 'added' | 'failed' | 'session' | 'opened' | 'closed' | 'bracket' | 'manual'; text: string; distancePct?: number; addAusd?: number; price?: number }
export type GuardState = { enrolled: boolean; live?: boolean; balance?: number; settings?: { enabled: boolean; thresholdPct: number; targetPct: number; minAddAusd: number; maxAddAusdPerDay: number }; health?: PositionHealth[]; events?: GuardEvent[] }

const post = async <T,>(path: string, body: unknown): Promise<T> => {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json()) as T & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `${path} ${r.status}`)
  return j
}

export async function enrollGuard(s: Session) {
  const { typed_data } = await post<{ typed_data: Wire }>('/guard/start', { address: s.address })
  const { EIP712Domain: _d, ...types } = typed_data.types
  const td: TypedDataDefinition = { domain: { ...typed_data.domain, chainId: BigInt(typed_data.domain.chainId) }, types: types as unknown as TypedDataDefinition['types'], primaryType: typed_data.primaryType, message: typed_data.message }
  const signature = await s.account.signTypedData(td)
  return post<{ ok: boolean; account: number }>('/guard/finish', { address: s.address, signature })
}

export async function guardState(address: string): Promise<GuardState> {
  const r = await fetch(`${API}/guard/${address}`)
  return (await r.json()) as GuardState
}

export const relayOrder = (address: string, symbol: string, side: 'long' | 'short', size: number, leverage: number) =>
  post<{ filled: boolean; status?: number; reason?: unknown; size: number; price: number }>('/order', { address, symbol, side, size, leverage })

export const relayCloseAll = (address: string) => post<{ closed: number }>('/close-all', { address })
export const relayClose = (address: string, pid: number) => post<{ price: number; pnl: number; collateral: number }>('/close', { address, pid })
export const relayBrackets = (address: string, pid: number, b: { stop?: number; take?: number }) => post<{ stop?: number; take?: number }>('/brackets', { address, pid, ...b })
export const relayAddMargin = (address: string, pid: number, ausd: number) => post<{ health?: { distance: number; collateral: number } }>('/guard/add', { address, pid, ausd })
