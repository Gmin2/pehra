// g18: does perpl drop the socket for an order whose rq is a timestamp (about 1.79e12)?
import { connect, stamp, sleep, MON, monPosition } from './g-lib'
const ts = await connect()
;(ts as unknown as { rq: number }).rq = Date.now()
const pos = monPosition(ts)
let closed = ''
ts.onFrame(() => {})
const r = await ts.closeMarket(pos!, { size: 200 }).catch(e => ({ err: (e as Error).message }))
console.log(stamp(), 'close 200 with rq', (ts as unknown as { rq: number }).rq, '->', JSON.stringify(r).slice(0, 200), closed)
await sleep(1500); ts.close(); await sleep(300)
