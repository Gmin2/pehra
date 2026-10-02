// g5b: raw frames for a resting backstop when a rung closes half the position
import { connect, openLong, closeAll, mark, monPosition, until, stamp, sleep } from './g-lib'
const ts = await connect()
let backOid = 0
ts.onFrame(f => { if (f.mt === 24) for (const o of (f as { d: Record<string, unknown>[] }).d) if (o.oid === backOid) console.log(stamp(), 'RAW backstop', JSON.stringify(o)) })
const pos = await openLong(ts)
let m = await mark()
const back = await ts.stopLoss(pos, Math.round(m.mrk * 0.85))
backOid = back.order?.oid ?? 0
console.log(stamp(), 'backstop oid', backOid)
m = await mark()
await ts.takeProfit(pos, m.lst - 20, { size: 100 })
await until('half closed', () => (monPosition(ts)?.s ?? 0) === 100, 20_000)
await sleep(2500)
await closeAll(ts)
await sleep(1500)
ts.close(); await sleep(300)
