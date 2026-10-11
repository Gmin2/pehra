// helpers for the chain spikes: a signed rule post as the dev account, rule rows, the mark
import { privateKeyToAccount } from 'viem/accounts'
import { ruleMessage, type SignedAction, type Rule } from '../packages/perpl/src/index'
import { env } from './perplws'
export const me = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
export const api = process.env.PEHRA_API ?? 'http://localhost:8787'
const sign = async (a: SignedAction) => { const nonce = crypto.randomUUID(), exp = Date.now() + 120_000; return { nonce, exp, sig: await me.signMessage({ message: ruleMessage(me.address, a, nonce, exp) }) } }
export const arm = async (rule: Rule) => { const r = await fetch(`${api}/rules/${me.address}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rule, ...(await sign({ action: 'create', rule, symbol: 'MON' })) }) }); return `${r.status} ${(await r.text()).slice(0, 140)}` }
export const cancel = async (id: string) => { const r = await fetch(`${api}/rules/${me.address}/${id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await sign({ action: 'cancel', id })) }); return r.status }
export const rows = async () => ((await (await fetch(`${api}/rules/${me.address}`, { headers: { authorization: `Bearer ${await token()}` } })).json()) as { rules: { id: string; state: string; live?: { px: number; floor: number; backstopPx: number } }[] }).rules
let tok: string | null = null
export async function token() {
  if (tok) return tok
  const nonce = crypto.randomUUID(), exp = Date.now() + 120_000, device = 'spike'
  const r = await fetch(`${api}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: me.address, device, nonce, exp, sig: await me.signMessage({ message: ruleMessage(me.address, { action: 'session', device }, nonce, exp) }) }) })
  tok = (await r.json() as { token: string }).token
  return tok
}
export async function markNow() { const c = await (await fetch('https://testnet.perpl.xyz/api/v1/pub/context')).json() as { markets: { id: number; state: { mrk: number } }[] }; return c.markets.find(m => m.id === 64)!.state.mrk / 1e5 }
export const r5 = (x: number) => Number(x.toPrecision(4))
