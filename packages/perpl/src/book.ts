// an order book kept from perpl's order-book stream: mt 15 is a snapshot of the top levels, mt 16 sends
// only changed levels and a size of 0 removes one (spike g3b, oct 2). prices and sizes stay in wire units
export type Level = { p: number; s: number; o: number }
export type BookFrame = { mt: 15 | 16; sid: number; sn: number; at?: { b: number; t: number }; bid?: Level[]; ask?: Level[] }

export class Book {
  bids = new Map<number, number>()
  asks = new Map<number, number>()
  block = 0

  apply(f: BookFrame) {
    if (f.mt === 15) { this.bids.clear(); this.asks.clear() }
    for (const l of f.bid ?? []) if (l.s === 0) this.bids.delete(l.p); else this.bids.set(l.p, l.s)
    for (const l of f.ask ?? []) if (l.s === 0) this.asks.delete(l.p); else this.asks.set(l.p, l.s)
    this.block = f.at?.b ?? f.sn
  }

  // best first: bids high to low, asks low to high
  levels(): { bids: [number, number][]; asks: [number, number][] } {
    return {
      bids: [...this.bids].sort((a, b) => b[0] - a[0]),
      asks: [...this.asks].sort((a, b) => a[0] - b[0]),
    }
  }

  best() {
    const { bids, asks } = this.levels()
    return { bid: bids[0]?.[0] ?? null, ask: asks[0]?.[0] ?? null }
  }
}
