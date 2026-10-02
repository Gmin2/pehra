// g1: can a resting trigger be cancelled when the cancel carries the trigger's own tp, tpc and lp?
// before oct 2 we sent only the oid and perpl answered sr 33 OrderDoesNotExist.
import { connect, openLong, closeAll, mark, restingOn, until, stamp, sleep } from './g-lib'

const ts = await connect()
const pos = await openLong(ts)
const m = await mark()
const tp = Math.round(m.mrk * 0.9)
const placed = await ts.stopLoss(pos, tp)
console.log(stamp(), 'stop placed ->', placed.order?.st, placed.order?.sr, 'oid', placed.order?.oid)
await until('resting stop', () => restingOn(ts, pos.pid).length > 0)
const stop = restingOn(ts, pos.pid)[0]
console.log(stamp(), 'resting', JSON.stringify(stop))

const r = await ts.cancel(stop)
console.log(stamp(), 'cancel ->', r.order?.st, r.order?.sr, r.status?.status)
await sleep(1500)
console.log(stamp(), 'resting after cancel:', restingOn(ts, pos.pid).map(o => o.oid))
console.log('RESULT g1:', r.order?.st === 5 ? 'cancel works (st 5)' : `cancel failed st ${r.order?.st} sr ${r.order?.sr}`)

await closeAll(ts)
await sleep(1500)
ts.close()
