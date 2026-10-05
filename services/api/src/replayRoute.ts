// POST /replay { address, rule, days? }: what the rule would have done over the last days on perpl's own
// candles, for the position as it is now. candles are cached in sqlite, closes are priced on the book the
// recorder holds right now. read only, nothing is signed or sent
import { NETWORKS, Rule, replay, type Bar, type Book, type Market } from '@pehra/perpl'
import { db } from './db'

db.exec(`create table if not exists candles (mkt integer not null, res integer not null, t integer not null, o real, h real, l real, c real, primary key (mkt, res, t))`)

const RES = 300            // 5 minute candles, 30 days is about 8640
const PER_CALL = 1024
const q = {
  put: db.prepare('insert or replace into candles (mkt, res, t, o, h, l, c) values (?, ?, ?, ?, ?, ?, ?)'),
  range: db.prepare('select t, o, h, l, c from candles where mkt = ? and res = ? and t >= ? and t <= ? order by t'),
}

async function candles(m: Market, from: number, to: number): Promise<Bar[]> {
  const k = 10 ** m.config.price_decimals
  const have = q.range.all(m.id, RES, from, to) as Bar[]
  const newest = have.length ? have[have.length - 1].t : from
  // only what is not cached yet, the newest bar is always fetched again since it was still open
  for (let a = Math.max(from, newest); a < to; a += PER_CALL * RES * 1000) {
    const b = Math.min(to, a + PER_CALL * RES * 1000)
    const r = await fetch(`${NETWORKS.testnet.rest}/v1/market-data/${m.id}/candles/${RES}/${a}-${b}`)
    if (!r.ok) throw new Error(`candles ${r.status}`)
    const d = (await r.json() as { d: { t: number; o: number; h: number; l: number; c: number }[] }).d
    db.exec('begin')
    for (const x of d) q.put.run(m.id, RES, x.t, x.o / k, x.h / k, x.l / k, x.c / k)
    db.exec('commit')
  }
  return q.range.all(m.id, RES, from, to) as Bar[]
}

export type ReplayDeps = {
  market: (mkt: number) => Market | undefined
  book: (mkt: number) => Book | undefined
  position: (address: string, pid: number) => { side: 'long' | 'short'; size: number; leverage: number } | null
}

export async function replayRoute(req: Request, deps: ReplayDeps): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const b = await req.json().catch(() => null) as { address?: string; rule?: unknown; days?: number } | null
  const parsed = Rule.safeParse(b?.rule)
  if (!b?.address || !parsed.success) return json({ error: 'send an address and a rule' }, 400)
  const rule = parsed.data
  const m = deps.market(rule.mkt)
  const start = deps.position(b.address, rule.pid)
  if (!m || !start) return json({ error: 'replay needs the rule to be on an open position' }, 422)
  const days = Math.min(Math.max(b.days ?? 30, 1), 60)
  const to = Date.now(), from = to - days * 24 * 3600_000
  const t0 = Date.now()
  const bars = await candles(m, from, to)
  const book = deps.book(m.id)
  const k = 10 ** m.config.price_decimals, z = 10 ** m.config.size_decimals
  const lv = book?.levels()
  const best = book?.best()
  const levels = lv && best?.bid && best?.ask ? {
    bids: lv.bids.map(([p, s]): [number, number] => [p / k, s / z]),
    asks: lv.asks.map(([p, s]): [number, number] => [p / k, s / z]),
    mid: (best.bid + best.ask) / 2 / k,
  } : null
  // the levels keep the distance from the price they have now, so a stop 5% under today's price sits
  // 5% under the replayed entry instead of somewhere the first candle may already be past
  const k0 = bars.length ? bars[0].o / bars[bars.length - 1].c : 1
  const at = (v: number) => v * k0
  const shifted: typeof rule =
    rule.kind === 'stop' ? { ...rule, px: at(rule.px), floor: at(rule.floor), backstopPx: at(rule.backstopPx) }
    : rule.kind === 'ladder' ? { ...rule, steps: rule.steps.map(s => ({ ...s, px: at(s.px), floor: at(s.floor) })) }
    : rule.kind === 'ping' ? { ...rule, above: at(rule.above) }
    : rule
  const report = replay({ bars, rule: shifted, start, maintenance: m.config.maintenance_margin, takerFeeBps: m.config.taker_fee / 100, book: levels })
  report.assumptions.unshift('price levels keep the distance from the price they have now')
  return json({ ...report, days, ms: Date.now() - t0 })
}
