// g6: perpl allows 16 trigger orders per account. what does the 17th get back?
import { connect, openLong, closeAll, mark, restingOn, stamp, sleep } from './g-lib'

const ts = await connect()
const pos = await openLong(ts)
const m = await mark()
const results: string[] = []
for (let i = 1; i <= 17; i++) {
  const r = await ts.stopLoss(pos, Math.round(m.mrk * (0.8 - i * 0.005)), { size: 10 })
  results.push(`${i}: st ${r.order?.st} sr ${r.order?.sr} status ${r.status?.status.code}${r.status?.status.msg ? ' ' + r.status.status.msg : ''}`)
  console.log(stamp(), results[results.length - 1])
  await sleep(400)
}
await sleep(1500)
console.log(stamp(), 'resting on the position:', restingOn(ts, pos.pid).length)
console.log('RESULT g6:', results[16])
await closeAll(ts)
await sleep(2000)
console.log(stamp(), 'resting left after close:', [...ts.orders.values()].filter(o => o.st === 8).length)
ts.close()
await sleep(300)
