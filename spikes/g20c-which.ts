// g20c: which request id does perpl accept right now, lfr + 1 or a fresh timestamp
import { signedFetch, restWallet, restOrderHistory } from '../packages/perpl/src/index'
import { env, sleep } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
async function tryRq(label: string, rq: number, t: number, lv: number) {
  const acct = (await restWallet(key)).as[0]
  await signedFetch(key, 'POST', '/v1/trading/orders', JSON.stringify({ d: [{ rq, mkt: 64, acc: acct.id, t, p: 0, s: 200, ms: 100, fl: 4, lv, lb: 0 }] }))
  for (let i = 0; i < 16; i++) {
    await sleep(800)
    const mine = (await restOrderHistory(key, 20)).d.filter(o => o.rq === rq)
    const end = mine.find(o => o.st === 4 || o.st === 7 || o.st === 5)
    if (end) { console.log(label, 'rq', rq, '->', 'st', end.st, 'sr', end.sr, 'after', (i + 1) * 800, 'ms'); return end.st }
  }
  console.log(label, 'rq', rq, '-> no outcome in 13s')
}
const lfr = (await restWallet(key)).as[0].lfr
const a = await tryRq('lfr + 1   ', lfr + 1, 1, 200)
if (a === 4) await tryRq('close lfr+2', lfr + 2, 3, 0)
await tryRq('timestamp ', Date.now(), 1, 200)
