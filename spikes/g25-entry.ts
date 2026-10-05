// g25: an entry rule end to end on testnet. signed like the app does, one tick under the mark so the next
// dip fires it, a stop attached. checks the position opened within the limit, the stop became its own rule
// with a backstop on perpl, then cleans up
import { privateKeyToAccount } from 'viem/accounts'
import { ruleMessage, type SignedAction, type Rule } from '../packages/perpl/src/index'
import { env } from './perplws'
import { connect, closeAll, sleep } from './g-lib'
const me = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const api = 'http://localhost:8787'
const post = async (path: string, body: unknown) => { const r = await fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return `${r.status} ${(await r.text()).slice(0, 160)}` }
const sign = async (a: SignedAction) => { const nonce = crypto.randomUUID(), exp = Date.now() + 120_000; return { nonce, exp, sig: await me.signMessage({ message: ruleMessage(me.address, a, nonce, exp) }) } }
const rows = async () => ((await (await fetch(`${api}/rules/${me.address}`)).json()) as { rules: { id: string; state: string; kind: string; rule: Rule }[] }).rules
const markNow = async () => { const c = await (await fetch('https://testnet.perpl.xyz/api/v1/pub/context')).json() as { markets: { id: number; state: { mrk: number } }[] }; return c.markets.find(m => m.id === 64)!.state.mrk / 1e5 }
const r5 = (x: number) => Math.round(x * 1e5) / 1e5
const mk = (id: string, px: number, o: object = {}): Rule => ({ v: 1, id, pid: 0, mkt: 64, forMs: 0, kind: 'entry', side: 'long', when: 'below', px, limit: r5(px * 1.01), margin: 3, leverage: 2, stop: { px: r5(px * 0.97), floor: r5(px * 0.965), backstopPx: r5(px * 0.955), slices: 4 }, ...o } as Rule)
const create = async (r: Rule) => post(`/rules/${me.address}`, { rule: r, ...(await sign({ action: 'create', rule: r, symbol: 'MON' })) })

const m0 = await markNow()
console.log('mark', m0)
console.log('already happened  ', await create(mk(`e-bad-${Date.now()}`, r5(m0 * 1.02))))
console.log('too much leverage ', await create(mk(`e-lev-${Date.now()}`, r5(m0 - 0.00001), { leverage: 9 })))
const held = process.argv[2] === 'held'
const id = `e-${Date.now().toString(36)}`
const m1 = await markNow()
console.log('arm one tick under', m1, await create(mk(id, r5(m1 - 0.00001), held ? { limit: r5(m1 - 0.00001) } : {})))
const t0 = Date.now()
let entry
while (Date.now() - t0 < 15 * 60_000) {
  entry = (await rows()).find(r => r.id === id)
  if (entry && entry.state !== 'armed' && entry.state !== 'firing' && entry.state !== 'working') break
  await sleep(3000)
}
console.log('entry', entry?.state, `${Math.round((Date.now() - t0) / 1000)}s`)
if (held) { await sleep(20_000); console.log('entry after 20s', (await rows()).find(r => r.id === id)?.state); console.log('cancel entry', await post(`/rules/${me.address}/${id}/cancel`, await sign({ action: 'cancel', id }))) }
await sleep(4000)
const child = (await rows()).find(r => r.id.includes(`from-${id}`))
console.log('child stop', child?.id, child?.state, JSON.stringify(child?.rule))
const ts = await connect()
await sleep(1500)
const pos = [...ts.positions.values()].find(p => p.mkt === 64)
console.log('position', pos && { pid: pos.pid, s: pos.s, ep: pos.ep / 1e5, lv: pos.lv }, 'limit', mk(id, r5(m1 - 0.00001)).kind === 'entry' ? r5((m1 - 0.00001) * 1.01) : '')
console.log('resting on it', [...ts.orders.values()].filter(o => o.st === 8 && o.lp === pos?.pid).map(o => ({ oid: o.oid, tp: (o.tp ?? 0) / 1e5 })))
if (child) console.log('cancel stop', await post(`/rules/${me.address}/${child.id}/cancel`, await sign({ action: 'cancel', id: child.id })))
await sleep(3000)
await closeAll(ts)
await sleep(2000)
ts.close()
