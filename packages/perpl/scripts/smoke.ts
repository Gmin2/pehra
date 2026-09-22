// connects with the dev api key from services/api/.env, prints the snapshot, watches market state for a few seconds.
// with --trade it opens a small MON long and closes it again, the same loop as spikes/t3 and t4.
import { readFileSync } from 'node:fs'
import { getContext, marketBySymbol, TradingSocket, MarketDataSocket, MT, Reason, fromCns, fromPrice, fromSize, toLeverage } from '../src'

const env = Object.fromEntries(readFileSync(new URL('../../../services/api/.env', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const trade = process.argv.includes('--trade')
const t0 = Date.now()
const at = () => `+${Date.now() - t0}ms`

const ctx = await getContext('testnet')
const mon = marketBySymbol(ctx, 'MON')
console.log(at(), 'context', ctx.markets.map(m => `${m.symbol}:${m.id}`).join(' '), 'MON mark', fromPrice(mon, mon.state.mrk))

const md = new MarketDataSocket('testnet')
const s = MarketDataSocket.streams(10143)
await md.connect([s.heartbeat, s.marketState])
let ticks = 0
md.on(m => { if (m.mt === MT.marketState) ticks++ })

const ts = new TradingSocket({ net: 'testnet', apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}`, onClose: (c, r) => console.log(at(), 'trading closed', c, r) })
await ts.connect()
const acc = ts.account!
console.log(at(), 'signed in, account', acc.id, 'balance', fromCns(acc.b), 'AUSD, forwarding', acc.fw, 'lfr', acc.lfr, 'positions', ts.positions.size, 'orders', ts.orders.size)

if (trade) {
  const size = 100
  const r1 = await ts.openMarket({ mkt: mon.id, side: 'long', size, leverage: toLeverage(5) })
  if (!r1.order) { console.log(at(), 'open rejected', JSON.stringify(r1.status)); process.exit(1) }
  const o = r1.order
  console.log(at(), 'open', o.st === 4 ? 'filled' : 'status ' + o.st, Reason[o.sr] ?? o.sr, 'at', fromPrice(mon, o.fp ?? 0), 'size', fromSize(mon, o.fs ?? 0))
  await new Promise(r => setTimeout(r, 1500))
  const pos = [...ts.positions.values()].find(p => p.mkt === mon.id)
  if (!pos) { console.log('no position after fill'); process.exit(1) }
  console.log(at(), 'position', pos.pid, 'entry', fromPrice(mon, pos.ep), 'collateral', fromCns(pos.c))
  const sl = await ts.stopLoss(pos, Math.round(pos.ep * 0.94))
  console.log(at(), 'stop', sl.order?.st, Reason[sl.order?.sr ?? -1] ?? sl.order?.sr)
  const add = await ts.addMargin(pos, '1000000')
  console.log(at(), 'margin add, collateral now', add.position ? fromCns(add.position.c) : '?')
  const r2 = await ts.closeMarket(pos)
  console.log(at(), 'close', r2.order?.st === 4 ? 'filled' : 'status ' + r2.order?.st, 'at', fromPrice(mon, r2.order?.fp ?? 0))
  await new Promise(r => setTimeout(r, 1500))
  console.log(at(), 'balance after', fromCns(ts.account!.b), 'open positions', ts.positions.size)
}

await new Promise(r => setTimeout(r, 4000))
console.log(at(), 'market state ticks in window', ticks, 'head', md.head)
md.close(); ts.close()
process.exit(0)
