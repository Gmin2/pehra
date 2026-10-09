// g31: breakeven and trailing live. a dev long, a two step ladder with step 1 a hair over the price, a stop
// that trails 0.4% and moves to entry plus fees once step 1 fills. watches for both for up to 12 minutes
import { connect, openLong, closeAll, sleep } from './g-lib'
import { arm, cancel, rows, markNow, r5 } from './g29-lib'
import type { Rule } from '../packages/perpl/src/index'
const ts = await connect()
const pos = await openLong(ts, 400, 200)
await sleep(3000)
const m = await markNow()
const entry = pos.ep / 1e5
const tag = Date.now().toString(36)
const lid = `ladder-${pos.pid}-${tag}`, sid = `stop-${pos.pid}-${tag}`
const ladder: Rule = { v: 1, id: lid, pid: pos.pid, mkt: 64, forMs: 0, kind: 'ladder', steps: [
  { px: r5(Math.max(m, entry) * 1.0008), share: 50, floor: r5(Math.max(m, entry) * 1.0002) },
  { px: r5(Math.max(m, entry) * 1.05), share: 50, floor: r5(Math.max(m, entry) * 1.045) },
] }
console.log('entry', entry, 'mark', m)
console.log('arm ladder', await arm(ladder))
await sleep(4000)
const stop: Rule = { v: 1, id: sid, pid: pos.pid, mkt: 64, forMs: 0, kind: 'stop', px: r5(m * 0.96), floor: r5(m * 0.955), backstopPx: r5(m * 0.95), slices: 4, trail: { pct: 0.4, minMovePct: 0.05 }, breakeven: { ladder: lid, afterStep: 1 } }
console.log('arm stop', await arm(stop))
const t0 = Date.now()
let last = ''
while (Date.now() - t0 < 12 * 60_000) {
  const r = (await rows()).find(x => x.id === sid)
  const now = JSON.stringify(r?.live) + ' ' + [...ts.orders.values()].filter(o => o.st === 8 && o.lp === pos.pid).map(o => (o.tp ?? 0) / 1e5).join(',')
  if (now !== last) { console.log(`${Math.round((Date.now() - t0) / 1000)}s`, r?.state, now); last = now }
  if (r && r.live && r.live.px >= entry) { console.log('the stop is at or past entry'); break }
  await sleep(5000)
}
console.log('cancel', await cancel(sid), await cancel(lid))
await sleep(4000)
await closeAll(ts)
await sleep(2000)
ts.close()
