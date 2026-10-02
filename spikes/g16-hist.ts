import { restOrderHistory } from '../packages/perpl/src/index'
import { env } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
const h = await restOrderHistory(key, 40)
for (const o of h.d.slice(0, 16)) console.log(JSON.stringify({ b: o.at?.b, oid: o.oid, rq: o.rq, t: o.t, st: o.st, sr: o.sr, os: o.os, fs: o.fs, fp: o.fp, tp: o.tp, p: o.p, tx: o.at?.txid?.slice(0, 10) }))
