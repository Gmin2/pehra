// the payer's resting triggers and positions, straight from perpl's signed rest
import { restOrders, restPositions } from '../packages/perpl/src/index'
import { env } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
const [o, p] = await Promise.all([restOrders(key), restPositions(key)])
console.log('positions', JSON.stringify(p.d.map(x => ({ pid: x.pid, s: x.s }))))
console.log('orders', JSON.stringify(o.d.map(x => ({ oid: x.oid, st: x.st, os: x.os, tp: x.tp, p: x.p }))))
