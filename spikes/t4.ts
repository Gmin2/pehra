import { openTrading, sleep } from './perplws'
let acct: any = null, pos: any = null, orders: any[] = [], sn = 0
const seen: any[] = []
const ws = await openTrading(m => {
  seen.push(m)
  if (m.mt === 19) { acct = m.as[0]; console.log('snapshot lfr', acct.lfr, 'balance', acct.b) }
  if (m.mt === 26) { pos = m.d[0]; console.log('position snapshot:', m.d.map((p: any) => ({ pid: p.pid, mkt: p.mkt, sd: p.sd, s: p.s, ep: p.ep, c: p.c, lv: p.lv }))) }
  if (m.mt === 23) { orders = m.d; console.log('orders snapshot:', m.d.length) }
  if (m.mt === 3) console.log('<- status', JSON.stringify(m))
  if (m.mt === 24) console.log('<- orders', JSON.stringify(m.d.map((o: any) => ({ rq: o.rq, oid: o.oid, t: o.t, st: o.st, sr: o.sr, fr: o.fr, tp: o.tp, tpc: o.tpc, lp: o.lp, r: o.r, fs: o.fs, fp: o.fp }))))
  if (m.mt === 27) console.log('<- positions', JSON.stringify(m.d.map((p: any) => ({ pid: p.pid, st: p.st, sr: p.sr, s: p.s, c: p.c, ep: p.ep, cpnl: p.cpnl }))))
  if (m.mt === 21) console.log('<- account balance', m.b, 'lfr', m.lfr, 'events', (m.h ?? []).map((e: any) => ({ et: e.et, a: e.a })))
})
while (!acct || pos === null) await sleep(100)
await sleep(300)
if (!pos) { console.log('no open position, run t3 first'); ws.close(); process.exit(1) }
let rq = Math.max(0, acct.lfr)
const send = async (label: string, o: any) => { rq += 1; const f = { mt: 22, sn: ++sn, rq, mkt: 64, acc: acct.id, lb: 0, ...o }; console.log(`-> ${label}`, JSON.stringify(f)); ws.send(JSON.stringify(f)); await sleep(4000) }

const ep = pos.ep, size = pos.s
await send('stop loss 6% below', { t: 3, p: 0, s: size, fl: 4, lv: 0, lp: pos.pid, tp: Math.round(ep * 0.94), tpc: 4 })
await send('take profit 12% above', { t: 3, p: 0, s: size, fl: 4, lv: 0, lp: pos.pid, tp: Math.round(ep * 1.12), tpc: 1 })
await send('add 1 AUSD margin', { t: 6, s: 0, fl: 0, lv: 0, lp: pos.pid, a: '1000000' })
await sleep(2000)
const open = seen.filter(m => m.mt === 24).flatMap(m => m.d).filter((o: any) => o.st === 8 && !o.r)
console.log('untriggered orders to cancel:', open.map((o: any) => o.oid))
for (const o of open) await send('cancel ' + o.oid, { t: 5, oid: o.oid, s: 0, fl: 0, lv: 0 })
await send('close long', { t: 3, p: 0, s: size, fl: 4, lv: 0, lp: pos.pid, ms: 100 })
await sleep(3000)
ws.close()
console.log('types seen:', [...new Set(seen.map(m => m.mt))].join(','))
