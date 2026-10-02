import { describe, expect, test } from 'bun:test'
import { Book, type BookFrame } from '../src/book'

// frames as perpl sent them for mon on oct 2 (spikes/g3b-book.ts), cut to three levels a side
const snap: BookFrame = { mt: 15, sid: 1000064, sn: 67489880, at: { b: 67489880, t: 1790927975000 },
  bid: [{ p: 3382, s: 4267841, o: 1 }, { p: 3378, s: 4225530, o: 1 }, { p: 3374, s: 4784556, o: 1 }],
  ask: [{ p: 3386, s: 4181991, o: 1 }, { p: 3390, s: 4424569, o: 1 }, { p: 3394, s: 4397990, o: 1 }] }
const up1: BookFrame = { mt: 16, sid: 1000064, sn: 67489926, at: { b: 67489926, t: 1790927988000 }, bid: [{ p: 3382, s: 4267107, o: 1 }], ask: [{ p: 3379, s: 0, o: 0 }] }
const up2: BookFrame = { mt: 16, sid: 1000064, sn: 67489929, at: { b: 67489929, t: 1790927989000 },
  bid: [{ p: 3383, s: 4234378, o: 1 }, { p: 3382, s: 0, o: 0 }], ask: [{ p: 3386, s: 0, o: 0 }, { p: 3387, s: 4339478, o: 1 }] }

describe('book', () => {
  test('snapshot then updates: changed levels replace, size 0 removes, sorted best first', () => {
    const b = new Book()
    b.apply(snap)
    expect(b.best()).toEqual({ bid: 3382, ask: 3386 })
    b.apply(up1)
    expect(b.bids.get(3382)).toBe(4267107)
    expect(b.asks.size).toBe(3)
    b.apply(up2)
    expect(b.best()).toEqual({ bid: 3383, ask: 3387 })
    expect(b.levels().bids.map(l => l[0])).toEqual([3383, 3378, 3374])
    expect(b.levels().asks.map(l => l[0])).toEqual([3387, 3390, 3394])
    expect(b.block).toBe(67489929)
  })

  test('a new snapshot replaces everything', () => {
    const b = new Book()
    b.apply(snap); b.apply(up2)
    b.apply({ ...snap, bid: [{ p: 3300, s: 1, o: 1 }], ask: [] })
    expect(b.levels()).toEqual({ bids: [[3300, 1]], asks: [] })
  })
})
