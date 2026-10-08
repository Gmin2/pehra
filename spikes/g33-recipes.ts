// g33: recipes over the api. replay of an entry recipe from flat, then sleep safe armed on one signature
// against a live position, with a stranger signature and a changed rule refused
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { instantiate, ruleMessage, type Rule } from '../packages/perpl/src/index'
import { me, api, rows, markNow, cancel } from './g29-lib'
const stranger = privateKeyToAccount(generatePrivateKey())
const m = await markNow()
const t0 = Date.now()
const dip = instantiate('dip', { mkt: 64, mark: m, tz: 330, margin: 10, leverage: 3 }, 'rp')
const rp = await (await fetch(`${api}/replay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: me.address, rules: dip, entry: { side: 'long', margin: 10, leverage: 3 }, days: 30 }) })).json() as { fires: { what: string }[]; withRules: { pnl: number; opened: boolean }; without: { pnl: number }; bars: number; error?: string }
console.log('replay dip 30d', rp.error ?? `${rp.bars} bars, ${Date.now() - t0}ms, opened ${rp.withRules.opened}, fires ${rp.fires.map(f => f.what).join(',')}, with ${rp.withRules.pnl.toFixed(2)} vs ${rp.without.pnl.toFixed(2)}`)
const g = await (await fetch(`${api}/guard/${me.address}`)).json() as { health: { pid: number; side: 'long' | 'short'; entry: number; size: number }[] }
const p = g.health[0]
if (!p) { console.log('no dev position, skipping the arm'); process.exit(0) }
const rules = instantiate('sleep', { mkt: 64, mark: m, tz: 330, margin: 10, leverage: 3, pos: { pid: p.pid, side: p.side, entry: p.entry, size: p.size } }, Date.now().toString(36))
const sign = async (who: typeof me, rs: Rule[]) => { const nonce = crypto.randomUUID(), exp = Date.now() + 120_000; return { nonce, exp, sig: await who.signMessage({ message: ruleMessage(me.address, { action: 'createMany', name: 'sleep safe', rules: rs, symbol: 'MON' }, nonce, exp) }) } }
const post = async (b: object) => { const r = await fetch(`${api}/rules/${me.address}/many`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return `${r.status} ${(await r.text()).slice(0, 160)}` }
console.log('stranger      ', await post({ name: 'sleep safe', rules, ...(await sign(stranger, rules)) }))
const s1 = await sign(me, rules)
console.log('changed after ', await post({ name: 'sleep safe', rules: rules.map((r, i) => i === 1 && r.kind === 'when' ? { ...r, then: [{ do: 'addMargin', ausd: 50 }] } : r), ...s1 }))
console.log('good          ', await post({ name: 'sleep safe', rules, ...(await sign(me, rules)) }))
const live = (await rows()).filter(r => rules.some(x => x.id === r.id))
console.log('armed         ', live.map(r => `${r.id} ${r.state}`).join(' | '))
for (const r of rules) await cancel(r.id)
