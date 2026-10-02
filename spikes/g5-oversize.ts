// g5: perpl rejects a close bigger than the position. what happens to a resting full size backstop after a
// take profit rung closes half the position, and what happens when an oversized trigger fires?
//   1. open 200 mon, rest a backstop stop for 200 far below, fire a take profit rung for 100 at once
//   2. read the backstop: still 200, shrunk, or gone
//   3. fire an oversized stop (200 on a 100 position) at once and read the result
import { connect, openLong, closeAll, mark, monPosition, restingOn, until, stamp, sleep } from './g-lib'

const ts = await connect()
const pos = await openLong(ts)
let m = await mark()
const back = await ts.stopLoss(pos, Math.round(m.mrk * 0.85))
console.log(stamp(), 'backstop for 200 placed ->', back.order?.st, 'oid', back.order?.oid)

// a take profit for a long fires when last >= tp, so tp under last fires at once
m = await mark()
const rung = await ts.takeProfit(pos, m.lst - 20, { size: 100 })
console.log(stamp(), 'rung for 100 placed ->', rung.order?.st, 'oid', rung.order?.oid)
await until('half closed', () => (monPosition(ts)?.s ?? 0) === 100, 20_000).catch(e => console.log(stamp(), (e as Error).message))
await sleep(2000)
const left = monPosition(ts)
console.log(stamp(), 'position now', left?.s)
const resting = left ? restingOn(ts, left.pid) : []
const bo = back.order?.oid ? ts.orders.get(back.order.oid) : undefined
console.log(stamp(), 'backstop now', JSON.stringify(bo && { st: bo.st, sr: bo.sr, s: bo.s }), 'resting on pid:', resting.map(o => `${o.oid} s ${o.s}`).join(', '))
console.log('RESULT g5a:', !bo ? 'backstop vanished' : bo.st === 8 ? `backstop still resting with s ${bo.s} on a ${left?.s} position` : `backstop st ${bo.st} sr ${bo.sr}`)

// fire an oversized stop: 200 on what is now 100
if (left) {
  m = await mark()
  const big = await ts.stopLoss(left, m.mrk + 20, { size: 200 })
  console.log(stamp(), 'oversized stop placed ->', big.order?.st, big.order?.sr, 'oid', big.order?.oid)
  const oid = big.order?.oid
  await until('oversized resolves', () => { const o = oid ? ts.orders.get(oid) : undefined; return !!o && o.st !== 8 && o.st !== 9 }, 20_000).catch(e => console.log(stamp(), (e as Error).message))
  await sleep(2000)
  const o = oid ? ts.orders.get(oid) : undefined
  const after = monPosition(ts)
  console.log(stamp(), 'oversized order', JSON.stringify(o && { st: o.st, sr: o.sr, fs: o.fs }), 'position', after?.s ?? 'closed')
  console.log('RESULT g5b:', after ? `oversized trigger did not close, st ${o?.st} sr ${o?.sr}` : 'oversized trigger closed the position anyway')
}
await closeAll(ts)
await sleep(1500)
console.log(stamp(), 'resting left:', [...ts.orders.values()].filter(o => o.st === 8).length, 'positions left:', ts.positions.size)
ts.close()
await sleep(300)
