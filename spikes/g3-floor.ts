// g3: when a trigger fires, does perpl honour a floor (p as an ioc limit) and a slippage cap (ms)?
// a long's stop with tp above the current mark fires at once, so each case fires immediately.
//   a. floor above the best bid: an ioc limit cannot fill, the position must stay open
//   b. floor a little under the bid: fills, at or above the floor
//   c. no floor, ms 20: fills, read the price against mark
import { connect, openLong, closeAll, mark, monPosition, until, stamp, sleep } from './g-lib'
import type { Order, TradingSocket } from '../packages/perpl/src/index'

const ts = await connect()

async function fire(label: string, opts: { floor?: number; slippageBps?: number }) {
  const pos = await openLong(ts)
  const m = await mark()
  const tp = m.mrk + 20
  console.log(stamp(), `${label}: mark ${m.mrk} bid ${m.bid} ask ${m.ask}, stop tp ${tp}`, JSON.stringify(opts))
  const r = await ts.stopLoss(pos, tp, opts)
  console.log(stamp(), `${label}: placed ->`, r.order?.st, r.order?.sr, 'oid', r.order?.oid)
  const oid = r.order?.oid
  // wait for the trigger to resolve one way or another
  await until(`${label} resolves`, () => { const o = oid ? ts.orders.get(oid) : undefined; return !!o && o.st !== 8 && o.st !== 9 }, 20_000).catch(e => console.log(stamp(), (e as Error).message))
  await sleep(1500)
  // when a trigger fires perpl places a child close with its own small rq, the fill is on that order
  const fills = [...ts.orders.values()].filter((o: Order) => o.oid === oid || (o.t === 3 && o.st === 4 && (o.fs ?? 0) > 0 && o.rq < 100 && o.p === (opts.floor ?? 0)))
  for (const o of fills) console.log(stamp(), `${label}: order`, JSON.stringify({ oid: o.oid, t: o.t, st: o.st, sr: o.sr, p: o.p, fs: o.fs, fp: o.fp }))
  const left = monPosition(ts)
  console.log(stamp(), `${label}: position after`, left ? `open, size ${left.s}` : 'closed')
  return { m, left, fills }
}

async function reset(t: TradingSocket) { await closeAll(t); await sleep(1500) }

const a = await fire('a floor above bid', { floor: (await mark()).ask + 30 })
console.log('RESULT g3a:', a.left ? 'floor held, nothing filled below it' : 'closed anyway, floor NOT honoured')
await reset(ts)

const bm = await mark()
const b = await fire('b floor under bid', { floor: bm.bid - 15 })
const bFill = b.fills.find(o => o.fp)?.fp
console.log('RESULT g3b:', b.left ? 'did not fill' : `filled at ${bFill}, floor ${bm.bid - 15}, ${bFill && bFill >= bm.bid - 15 ? 'at or above floor' : 'BELOW floor'}`)
await reset(ts)

const c = await fire('c market with ms 20', { slippageBps: 20 })
const cFill = c.fills.find(o => o.fp)?.fp
console.log('RESULT g3c:', c.left ? 'did not fill' : `filled at ${cFill} vs mark ${c.m.mrk} (${cFill ? ((c.m.mrk - cFill) / c.m.mrk * 10000).toFixed(0) : '?'} bps under)`)
await reset(ts)
console.log(stamp(), 'resting left:', [...ts.orders.values()].filter(o => o.st === 8).length, 'positions left:', ts.positions.size)
ts.close()
await sleep(300)
