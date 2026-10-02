// g20: place an order over signed rest, read its outcome from order history by rq
import { signedFetch, restWallet, restOrderHistory } from '../packages/perpl/src/index'
import { env, sleep } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
const w = await restWallet(key)
const acct = w.as[0]
const rq = Math.max(acct.lfr, Date.now() - 1) + 1
const body = JSON.stringify({ sn: 7, d: [{ rq, mkt: 64, acc: acct.id, t: 1, p: 0, s: 200, ms: 100, fl: 4, lv: 200, lb: 0 }] })
const t0 = Date.now()
const r = await signedFetch(key, 'POST', '/v1/trading/orders', body)
console.log('post', r.status, Date.now() - t0, 'ms', await r.text())
for (let i = 0; i < 10; i++) {
  await sleep(700)
  const h = await restOrderHistory(key, 10)
  const mine = h.d.filter(o => o.rq === rq)
  if (mine.length) { console.log('history after', Date.now() - t0, 'ms', JSON.stringify(mine.map(o => ({ st: o.st, sr: o.sr, fs: o.fs, fp: o.fp, tx: o.at?.txid?.slice(0, 12) })))); if (mine.some(o => o.st === 4 || o.st === 7 || o.st === 5)) break }
}
// close it the same way
const rq2 = rq + 1
const r2 = await signedFetch(key, 'POST', '/v1/trading/orders', JSON.stringify({ d: [{ rq: rq2, mkt: 64, acc: acct.id, t: 3, p: 0, s: 200, ms: 100, fl: 4, lv: 0, lb: 0 }] }))
console.log('close post', r2.status, await r2.text())
await sleep(2500)
console.log('close history', JSON.stringify((await restOrderHistory(key, 10)).d.filter(o => o.rq === rq2).map(o => ({ st: o.st, sr: o.sr, fs: o.fs }))))
