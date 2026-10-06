// g24: an ioc open with a limit price. one the book can reach fills (at the book, not the limit), one it
// cannot reach fills nothing and does not rest. then everything is closed
import { connect, closeAll, mark, monPosition, stamp, sleep, MON } from './g-lib'
const ts = await connect()
const st = await mark()
console.log(stamp(), 'mark', st.mrk, 'bid', st.bid, 'ask', st.ask)
const far = await ts.openLimit({ mkt: MON, side: 'long', size: 200, leverage: 200, price: Math.round(st.bid * 0.95) })
console.log(stamp(), 'long limited 5% under the bid ->', 'st', far.order?.st, 'sr', far.order?.sr, 'filled', far.order?.fs ?? 0, 'position?', !!monPosition(ts))
await sleep(1500)
console.log(stamp(), 'resting after?', [...ts.orders.values()].filter(o => o.st === 8 || o.st === 2).length)
const near = await ts.openLimit({ mkt: MON, side: 'long', size: 200, leverage: 200, price: Math.round(st.ask * 1.01) })
console.log(stamp(), 'long limited 1% over the ask ->', 'st', near.order?.st, 'sr', near.order?.sr, 'filled', near.order?.fs, 'at', near.order?.fp, 'limit', Math.round(st.ask * 1.01))
await sleep(1500)
console.log(stamp(), 'position', JSON.stringify(monPosition(ts) && { pid: monPosition(ts)!.pid, s: monPosition(ts)!.s, ep: monPosition(ts)!.ep }))
await closeAll(ts)
await sleep(1500)
ts.close()
