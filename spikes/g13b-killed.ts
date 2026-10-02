// g13b: send a market open, kill the socket before the answer, then read the outcome over signed rest
import { connect, stamp, sleep, MON, closeAll } from './g-lib'
import { restOrders, restPositions, restWallet } from '../packages/perpl/src/index'
import { env } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
const ts = await connect()
const lfr0 = ts.account?.lfr
void ts.openMarket({ mkt: MON, side: 'long', size: 200, leverage: 200 }).catch(e => console.log(stamp(), 'pending order rejected locally:', (e as Error).message))
ts.close()
console.log(stamp(), 'socket killed right after sending, lfr was', lfr0)
await sleep(3000)
const [w, o, p] = await Promise.all([restWallet(key), restOrders(key), restPositions(key)])
console.log(stamp(), 'rest wallet lfr', w.as[0]?.lfr, 'sn', w.sn)
console.log(stamp(), 'rest positions', JSON.stringify(p.d.map(x => ({ pid: x.pid, s: x.s, ep: x.ep, mkt: x.mkt }))))
console.log(stamp(), 'rest orders', JSON.stringify(o.d.map(x => ({ rq: x.rq, oid: x.oid, st: x.st }))))
console.log('RESULT g13b:', p.d.length ? `order landed while the socket was gone, lfr ${lfr0} -> ${w.as[0]?.lfr}, rest shows the position` : `nothing landed, lfr ${lfr0} -> ${w.as[0]?.lfr}`)
const t2 = await connect()
await closeAll(t2); await sleep(1500); t2.close(); await sleep(300)
