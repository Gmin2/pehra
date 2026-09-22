import { hashTypedData, hexToBytes, toHex, type Hex, type TypedDataDefinition } from 'viem'
import { NETWORKS, type Network } from './config'
import { newApiKeyPair, signBytes, type ApiKeyPair } from './crypto'

export type Market = {
  id: number; symbol: string; name: string; size_units: string
  order_ttl_blocks: number; order_max_market_slippage_bps: number; order_max_neg_pnl_collat_bps: number
  config: { is_open: boolean; price_decimals: number; size_decimals: number; initial_margin: number; maintenance_margin: number; maker_fee: number; taker_fee: number; contract_version: number[] }
  state: { orl: number; mrk: number; lst: number; mid: number; bid: number; ask: number; prv: number; oi: number; dva: string; tvl: string }
  funding: { rate: number; idx: number; sum: number; div: number }
}

export type Context = {
  chain: { chain_id: number; name: string }
  instances: { id: number; address: string; min_account_open_amount: string; min_deposit_amount: string; max_account_trigger_orders: number }[]
  tokens: { id: number; address: string; symbol: string; decimals: number }[]
  markets: Market[]
}

const contextCache = new Map<Network, { at: number; ctx: Promise<Context> }>()

// market config changes rarely, prices in it are a snapshot anyway. cached a minute, shared by callers.
export function getContext(net: Network = 'testnet'): Promise<Context> {
  const hit = contextCache.get(net)
  if (hit && Date.now() - hit.at < 60_000) return hit.ctx
  const ctx = fetch(`${NETWORKS[net].rest}/v1/pub/context`).then(r => {
    if (!r.ok) throw new Error(`context ${r.status}`)
    return r.json() as Promise<Context>
  })
  ctx.catch(() => contextCache.delete(net))
  contextCache.set(net, { at: Date.now(), ctx })
  return ctx
}

export function marketBySymbol(ctx: Context, symbol: string) {
  const m = ctx.markets.find(m => m.symbol === symbol)
  if (!m) throw new Error(`no market ${symbol}`)
  return m
}

// the evm side of enrollment is one eip 712 signature from the account that owns the perpl account.
// pass any signer that can do it, a viem account or the mera session account both fit.
export type TypedDataSigner = { address: Hex; signTypedData: (td: TypedDataDefinition) => Promise<Hex> }

type EnrollTypedData = {
  types: Record<string, { name: string; type: string }[]>
  domain: { name: string; version: string; chainId: string; verifyingContract?: Hex; salt?: Hex }
  primaryType: string
  message: Record<string, unknown>
}
type EnrollResponse = { api_key: string; expires_at?: string; scope_mask: number; builder_id?: number }

export type Enrolled = { apiKey: string; secret: Hex; publicKey: Hex; expiresAt?: string; scope: number; builderId?: number }

export type EnrollPayload = { typed_data: EnrollTypedData; mac: string; td: TypedDataDefinition; pair: ApiKeyPair }

// step one: perpl hands back the typed data the account owner has to sign for this public key
export async function enrollPayload(address: Hex, opts: { net?: Network; label?: string; scopeMask?: number; pair?: ApiKeyPair } = {}): Promise<EnrollPayload> {
  const cfg = NETWORKS[opts.net ?? 'testnet']
  const pair = opts.pair ?? newApiKeyPair()
  const body = { chain_id: cfg.chainId, address, public_key: pair.publicKey, scope_mask: opts.scopeMask ?? 3, label: opts.label ?? 'pehra' }
  const r1 = await fetch(`${cfg.rest}/v1/api-key/payload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r1.ok) throw new Error(`enroll payload ${r1.status} ${await r1.text()}`)
  const { typed_data, mac } = await r1.json() as { typed_data: EnrollTypedData; mac: string }
  const { EIP712Domain: _domain, ...types } = typed_data.types
  // chainId arrives as a hex string and viem hashes that wrong, so widen it first
  const td: TypedDataDefinition = { domain: { ...typed_data.domain, chainId: BigInt(typed_data.domain.chainId) }, types: types as unknown as TypedDataDefinition['types'], primaryType: typed_data.primaryType, message: typed_data.message }
  return { typed_data, mac, td, pair }
}

// step two: the owner's signature plus the key's own proof of possession over the same digest
export async function enrollFinish(address: Hex, payload: EnrollPayload, signature: Hex, net: Network = 'testnet'): Promise<Enrolled> {
  const cfg = NETWORKS[net]
  const pop = signBytes(payload.pair.secret, hexToBytes(hashTypedData(payload.td)))
  const r2 = await fetch(`${cfg.rest}/v1/api-key/enroll`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chain_id: cfg.chainId, address, typed_data: payload.typed_data, mac: payload.mac, signature, pop_signature: toHex(pop) }),
  })
  if (!r2.ok) throw new Error(`enroll ${r2.status} ${await r2.text()}`)
  const res = await r2.json() as EnrollResponse | { api_key: EnrollResponse }
  const info = typeof res.api_key === 'object' ? res.api_key : res as EnrollResponse
  return { apiKey: info.api_key, secret: payload.pair.secret, publicKey: payload.pair.publicKey, expiresAt: info.expires_at, scope: info.scope_mask, builderId: info.builder_id }
}

export async function enrollApiKey(signer: TypedDataSigner, opts: { net?: Network; label?: string; scopeMask?: number } = {}): Promise<Enrolled> {
  const payload = await enrollPayload(signer.address, opts)
  const signature = await signer.signTypedData(payload.td)
  return enrollFinish(signer.address, payload, signature, opts.net)
}
