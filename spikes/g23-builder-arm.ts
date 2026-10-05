// g23: the builder's stop and ladder, shaped and rounded the way app/rule.tsx makes them, armed and
// cancelled on a real position
import { privateKeyToAccount } from 'viem/accounts'
import { ruleMessage, type SignedAction, type Rule } from '../packages/perpl/src/index'
import { env } from './perplws'
const me = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const api = 'http://localhost:8787'
const post = async (path: string, body: unknown) => { const r = await fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return `${r.status} ${(await r.text()).slice(0, 140)}` }
const sign = async (a: SignedAction) => { const nonce = crypto.randomUUID(), exp = Date.now() + 120_000; return { nonce, exp, sig: await me.signMessage({ message: ruleMessage(me.address, a, nonce, exp) }) } }
const rows = async () => ((await (await fetch(`${api}/rules/${me.address}`)).json()) as { rules: { id: string; state: string; mode: string }[] }).rules
const g = await (await fetch(`${api}/guard/${me.address}`)).json() as { health: { pid: number; mkt: number; mark: number; entry: number }[] }
const h = g.health[0]
const e = Math.floor(Math.log10(h.mark)) - 3, dec = Math.max(0, -e), round = (v: number) => Number(v.toFixed(dec))
const px = round(h.mark * 0.95), floor = round(px * 0.98), backstop = round(floor * 0.97)
const base = Math.max(h.mark, h.entry)
const stop: Rule = { v: 1, id: `stop-${h.pid}-${Date.now().toString(36)}`, pid: h.pid, mkt: h.mkt, forMs: 0, kind: 'stop', px, floor, backstopPx: backstop, slices: 4 }
const ladder: Rule = { v: 1, id: `ladder-${h.pid}-${Date.now().toString(36)}`, pid: h.pid, mkt: h.mkt, forMs: 0, kind: 'ladder', steps: [0.05, 0.1].map(k => { const p = round(base * (1 + k)); return { px: p, share: 50, floor: round(p * 0.99) } }) }
for (const r of [stop, ladder]) console.log('arm', r.kind, await post(`/rules/${me.address}`, { rule: r, ...(await sign({ action: 'create', rule: r, symbol: 'MON' })) }))
await new Promise(r => setTimeout(r, 6000))
console.log('rows', (await rows()).filter(r => r.id === stop.id || r.id === ladder.id).map(r => `${r.id} ${r.state} ${r.mode}`))
const o = await (await fetch(`${api}/guard/${me.address}?fresh=1`)).json() as { health: { stop?: number; take?: number }[] }
console.log('perpl sees', JSON.stringify(o.health.map(x => ({ stop: x.stop, take: x.take }))))
for (const r of [stop, ladder]) console.log('cancel', r.kind, await post(`/rules/${me.address}/${r.id}/cancel`, await sign({ action: 'cancel', id: r.id })))
await new Promise(r => setTimeout(r, 6000))
const o2 = await (await fetch(`${api}/guard/${me.address}?fresh=1`)).json() as { health: { stop?: number; take?: number }[] }
console.log('after cancel', JSON.stringify(o2.health.map(x => ({ stop: x.stop, take: x.take }))))
