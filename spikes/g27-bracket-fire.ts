// g27: a plain stop (not a rule's) fires on perpl, the guard should report it once with the fill
import { connect, openLong, closeAll, mark, monPosition, stamp, sleep } from './g-lib'
const ts = await connect()
const pos = await openLong(ts, 200, 200)
const st = await mark()
// one tick under the mark, a stop on the last trade price fires on the next sell
const r = await ts.stopLoss(pos, st.mrk + 5, { onMark: true, size: pos.s })
console.log(stamp(), "stop placed at", st.mrk + 5, 'st', r.order?.st, 'sr', r.order?.sr)
const t0 = Date.now()
while (monPosition(ts) && Date.now() - t0 < 3 * 60_000) await sleep(1000)
console.log(stamp(), 'position', monPosition(ts) ? 'still open' : 'closed', `${Math.round((Date.now() - t0) / 1000)}s`)
await sleep(5000)
await closeAll(ts)
await sleep(1500)
ts.close()
