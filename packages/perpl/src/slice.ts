// how much of a hidden stop to sell next. only the book on the right side of the floor counts (a long sells
// into bids at or above the floor, a short buys back asks at or below it), one slice takes at most a share
// of that depth so the price does not walk, and nothing is ever more than what is left to sell
export type SliceIn = {
  left: number                 // still to sell, human size
  floor: number                // never fill past this price
  side: 'long' | 'short'       // the position's side
  bids: [number, number][]     // human price, human size, best first
  asks: [number, number][]
  maxShare: number             // of the depth past the floor, 0.5 to start
  minSize: number              // the market's smallest order
}
export type SliceOut = { size: number; why: 'ok' | 'book past the floor' | 'nothing left' }

export function nextSlice(a: SliceIn): SliceOut {
  if (a.left <= 0) return { size: 0, why: 'nothing left' }
  const book = a.side === 'long' ? a.bids : a.asks
  const ok = book.filter(([p]) => (a.side === 'long' ? p >= a.floor : p <= a.floor))
  const depth = ok.reduce((s, [, q]) => s + q, 0)
  if (depth < a.minSize) return { size: 0, why: 'book past the floor' }
  const want = Math.max(a.minSize, Math.floor(depth * a.maxShare / a.minSize) * a.minSize)
  return { size: Math.min(a.left, want), why: 'ok' }
}
