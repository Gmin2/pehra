// g26: a funding rule on a real position. the api runs with ALLOW_DEV=1 so a flip can be fed by hand:
// the first reading only sets where it starts, a flip to paying closes the position through the sliced close
import { privateKeyToAccount } from 'viem/accounts'
import { ruleMessage, type SignedAction, type Rule } from '../packages/perpl/src/index'
import { env } from './perplws'
import { connect, openLong, closeAll, monPosition, sleep } from './g-lib'
const me = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const api = 'http://localhost:8787'
const post = async (path: string, body: unknown) => { const r = await fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return `${r.status} ${(await r.text()).slice(0, 160)}` }
const sign = async (a: SignedAction) => { const nonce = crypto.randomUUID(), exp = Date.now() + 120_000; return { nonce, exp, sig: await me.signMessage({ message: ruleMessage(me.address, a, nonce, exp) }) } }
const state = async (id: string) => ((await (await fetch(`${api}/rules/${me.address}`)).json()) as { rules: { id: string; state: string }[] }).rules.find(r => r.id === id)?.state
const ts = await connect()
const pos = await openLong(ts, 200, 200)
await sleep(3000)
const rule: Rule = { v: 1, id: `f-${Date.now().toString(36)}`, pid: pos.pid, mkt: 64, forMs: 0, kind: 'funding', floorPct: 1 }
console.log('arm', await post(`/rules/${me.address}`, { rule, ...(await sign({ action: 'create', rule, symbol: 'MON' })) }))
console.log('shorts pay  ', await post('/dev/funding', { mkt: 64, rate: -20 }), await state(rule.id))
await sleep(2000)
console.log('still open  ', !!monPosition(ts))
console.log('longs pay   ', await post('/dev/funding', { mkt: 64, rate: 10 }))
for (let i = 0; i < 20 && monPosition(ts); i++) await sleep(500)
await sleep(3000)
console.log('after flip  ', 'open?', !!monPosition(ts), 'rule', await state(rule.id))
await closeAll(ts)
await sleep(1500)
ts.close()
