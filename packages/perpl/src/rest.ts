import { hashTypedData, hexToBytes, toHex, type Hex, type TypedDataDefinition } from 'viem'
import { NETWORKS, type Network } from './config'
import { newApiKeyPair, signBytes } from './crypto'

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

export async function getContext(net: Network = 'testnet'): Promise<Context> {
  const r = await fetch(`${NETWORKS[net].rest}/v1/pub/context`)
  if (!r.ok) throw new Error(`context ${r.status}`)
  return r.json()
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

export async function enrollApiKey(signer: TypedDataSigner, opts: { net?: Network; label?: string; scopeMask?: number } = {}): Promise<Enrolled> {
  const net = opts.net ?? 'testnet'
  const cfg = NETWORKS[net]
  const pair = newApiKeyPair()
  const headers = { 'content-type': 'application/json' }
  const body = { chain_id: cfg.chainId, address: signer.address, public_key: pair.publicKey, scope_mask: opts.scopeMask ?? 3, label: opts.label ?? 'pehra' }
  const r1 = await fetch(`${cfg.rest}/v1/api-key/payload`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!r1.ok) throw new Error(`enroll payload ${r1.status} ${await r1.text()}`)
  const { typed_data, mac } = await r1.json() as { typed_data: EnrollTypedData; mac: string }
  const { EIP712Domain: _domain, ...types } = typed_data.types
  // chainId arrives as a hex string and viem hashes that wrong, so widen it first
  const td: TypedDataDefinition = { domain: { ...typed_data.domain, chainId: BigInt(typed_data.domain.chainId) }, types: types as unknown as TypedDataDefinition['types'], primaryType: typed_data.primaryType, message: typed_data.message }
  const signature = await signer.signTypedData(td)
  const pop = signBytes(pair.secret, hexToBytes(hashTypedData(td)))
  const r2 = await fetch(`${cfg.rest}/v1/api-key/enroll`, {
    method: 'POST', headers,
    body: JSON.stringify({ chain_id: cfg.chainId, address: signer.address, typed_data, mac, signature, pop_signature: toHex(pop) }),
  })
  if (!r2.ok) throw new Error(`enroll ${r2.status} ${await r2.text()}`)
  const res = await r2.json() as EnrollResponse | { api_key: EnrollResponse }
  const info = typeof res.api_key === 'object' ? res.api_key : res as EnrollResponse
  return { apiKey: info.api_key, secret: pair.secret, publicKey: pair.publicKey, expiresAt: info.expires_at, scope: info.scope_mask, builderId: info.builder_id }
}
