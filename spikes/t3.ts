import { openTrading, sleep } from './perplws'
const log: any[] = []
let acct: any = null, head = 0
const ws = await openTrading(m => {
  log.push(m)
  if (m.mt === 19) { acct = m.as[0]; head = m.sn; console.log('snapshot: account', acct.id, 'fw', acct.fw, 'lfr', acct.lfr, 'balance', acct.b, 'sn', m.sn) }
  if (m.mt === 100) head = m.h
  if ([3, 21, 24, 25, 27, 28].includes(m.mt)) console.log('<-', JSON.stringify(m).slice(0, 700))
})
while (!acct) await sleep(100)
await sleep(500)
const size = Number(process.argv[2] ?? 100)   // in size units, see context
const lv = Number(process.argv[3] ?? 500)
const rq = Math.max(0, acct.lfr) + 1
const order = { mt: 22, sn: 1, rq, mkt: 64, acc: acct.id, t: 1, p: 0, s: size, ms: 100, fl: 4, lv, lb: 0 }
console.log('-> order', JSON.stringify(order))
ws.send(JSON.stringify(order))
await sleep(12000)
ws.close()
console.log('message types seen:', log.map(m => m.mt).join(','))
