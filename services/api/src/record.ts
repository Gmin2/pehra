// our own history for replay: perpl serves trade candles but no mark price history and no past books.
// one tick row per market per block from market state, and every market's book every 10s. the live books
// are also what the slicer reads (build-plan day 4)
import { Book, type BookFrame, type Context, type MarketDataSocket, type MarketStateFrame, type SubscribedFrame } from '@pehra/perpl'
import { db, tx } from './db'

const BOOK_EVERY_MS = 10_000

const q = {
  tick: db.prepare('insert or ignore into ticks (mkt, block, at, mark, last, bid, ask) values (?, ?, ?, ?, ?, ?, ?)'),
  book: db.prepare('insert into books (mkt, at, bids, asks) values (?, ?, ?, ?)'),
}

export class Recorder {
  books = new Map<number, Book>()
  private sids = new Map<number, number>()
  private timer?: ReturnType<typeof setInterval>
  ticks = 0

  constructor(private market: MarketDataSocket, private ctx: () => Context | null) {}

  streams(markets: number[]) { return markets.map(m => `order-book@${m}`) }

  start(markets: number[]) {
    this.market.subscribe(this.streams(markets))
    this.market.on(f => {
      if (f.mt === 6) for (const s of (f as SubscribedFrame).subs) { const m = s.stream.match(/^order-book@(\d+)$/); if (m) this.sids.set(s.sid, Number(m[1])) }
      if (f.mt === 15 || f.mt === 16) {
        const b = f as unknown as BookFrame
        const mkt = this.sids.get(b.sid)
        if (mkt === undefined) return
        const book = this.books.get(mkt) ?? new Book()
        book.apply(b)
        this.books.set(mkt, book)
      }
      if (f.mt === 9) this.tick(f as MarketStateFrame)
    })
    this.timer = setInterval(() => this.snapshot(), BOOK_EVERY_MS)
  }

  private tick(f: MarketStateFrame) {
    const ctx = this.ctx()
    if (!ctx) return
    const block = this.market.head
    const at = Date.now()
    // one transaction per frame, not one commit per market
    tx(() => {
      for (const [id, s] of Object.entries(f.d)) {
        const m = ctx.markets.find(x => x.id === Number(id))
        if (!m) continue
        const k = 10 ** m.config.price_decimals
        q.tick.run(m.id, block, at, s.mrk / k, s.lst / k, s.bid / k, s.ask / k)
        this.ticks++
      }
    })
  }

  private snapshot() {
    const ctx = this.ctx()
    if (!ctx) return
    const at = Date.now()
    tx(() => this.writeBooks(ctx, at))
  }

  private writeBooks(ctx: Context, at: number) {
    for (const [mkt, book] of this.books) {
      const m = ctx.markets.find(x => x.id === mkt)
      if (!m) continue
      const k = 10 ** m.config.price_decimals, z = 10 ** m.config.size_decimals
      const { bids, asks } = book.levels()
      q.book.run(mkt, at, JSON.stringify(bids.map(([p, s]) => [p / k, s / z])), JSON.stringify(asks.map(([p, s]) => [p / k, s / z])))
    }
  }

  stop() { clearInterval(this.timer) }
}
