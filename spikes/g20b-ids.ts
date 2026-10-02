import { restOrderHistory, restWallet } from '../packages/perpl/src/index'
import { env } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
const h = await restOrderHistory(key, 100)
const top = [...h.d].sort((a, b) => b.rq - a.rq).slice(0, 6)
console.log('now', Date.now(), 'lfr', (await restWallet(key)).as[0]?.lfr)
for (const o of top) console.log(o.rq, 'st', o.st, 'sr', o.sr, 't', o.t, 'block', o.at?.b)
