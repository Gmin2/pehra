// g30: moving a live stop. a dev long, a hidden stop with its backstop, then three timed chains that each
// tighten it 30%. after each, perpl must hold exactly one resting backstop at the new price
import { connect, openLong, closeAll, sleep } from './g-lib'
import { arm, cancel, rows, markNow, r5 } from './g29-lib'
import type { Rule } from '../packages/perpl/src/index'
const ts = await connect()
const pos = await openLong(ts, 400, 200)
await sleep(3000)
const m = await markNow()
const sid = `stop-${pos.pid}-${Date.now().toString(36)}`
const stop: Rule = { v: 1, id: sid, pid: pos.pid, mkt: 64, forMs: 0, kind: 'stop', px: r5(m * 0.95), floor: r5(m * 0.94), backstopPx: r5(m * 0.93), slices: 4 }
console.log('arm stop', await arm(stop))
console.log('price already passed', await arm({ v: 1, id: `wx-${Date.now().toString(36)}`, pid: 0, mkt: 64, forMs: 0, kind: 'when', on: { on: 'price', dir: 'below', px: r5(m * 1.05) }, then: [{ do: 'notify', text: 'x' }] }))
console.log('points at a rule that is not mine', await arm({ v: 1, id: `wy-${Date.now().toString(36)}`, pid: pos.pid, mkt: 64, forMs: 0, kind: 'when', on: { on: 'time', at: Date.now() + 60_000 }, then: [{ do: 'moveStop', rule: 'nope', to: 'entry' }] }))
await sleep(6000)
const backstops = () => [...ts.orders.values()].filter(o => o.st === 8 && o.lp === pos.pid).map(o => (o.tp ?? 0) / 1e5)
console.log('resting before', backstops(), 'live', JSON.stringify((await rows()).find(r => r.id === sid)?.live))
for (let k = 1; k <= 3; k++) {
  const at = Date.now() + 2000
  console.log(`tighten ${k}`, await arm({ v: 1, id: `wt${k}-${Date.now().toString(36)}`, pid: pos.pid, mkt: 64, forMs: 0, kind: 'when', on: { on: 'time', at }, then: [{ do: 'tightenStop', rule: sid, byPct: 30 }] }))
  await sleep(45_000)
  console.log(`  resting after ${k}`, backstops(), 'live', JSON.stringify((await rows()).find(r => r.id === sid)?.live))
}
console.log('cancel stop', await cancel(sid))
await sleep(5000)
console.log('resting after cancel', backstops())
await closeAll(ts)
await sleep(2000)
ts.close()
