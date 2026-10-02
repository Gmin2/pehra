// what a rule would have done on past candles, against holding the same position and doing nothing. the
// same step() the live engine runs decides; what perpl holds (backstops, ladder steps) is simulated the way
// perpl fires it. pure and deterministic: the same candles and rule always give the same report, and a
// candle can never see a later one
import { liquidationPrice, liquidationDistance } from './guard'
import { step, type Mem, type Tick } from './step'
import type { Rule } from './rule'

export type Bar = { t: number; o: number; h: number; l: number; c: number }
export type Start = { side: 'long' | 'short'; size: number; leverage: number }
export type Levels = { bids: [number, number][]; asks: [number, number][]; mid: number }

export type Fire = { at: number; what: 'stop' | 'backstop' | 'step' | 'add' | 'liquidated'; size: number; px: number; ausd?: number }
export type Leg = { pnl: number; liquidated: boolean; endSize: number }
export type Report = {
  from: number; to: number; bars: number; entry: number
  fires: Fire[]; withRule: Leg; without: Leg
  fees: number; added: number; ambiguousBars: number; assumptions: string[]
}

const DAY = 24 * 3600_000
// steps per move inside a candle
const SUB = 12

// sell (long) or buy back (short) size into a book scaled to the price now, never past the floor
function fillInto(book: Levels | null, side: 'long' | 'short', size: number, price: number, floor: number): { size: number; px: number } {
  if (!book || !book.mid) {
    const ok = side === 'long' ? price >= floor : price <= floor
    return ok ? { size, px: price } : { size: 0, px: 0 }
  }
  const k = price / book.mid
  const levels = (side === 'long' ? book.bids : book.asks).map(([p, q]): [number, number] => [p * k, q])
  let left = size, cost = 0
  for (const [p, q] of levels) {
    if (side === 'long' ? p < floor : p > floor) break
    const take = Math.min(left, q)
    cost += take * p
    left -= take
    if (left <= 0) break
  }
  const done = size - left
  return { size: done, px: done ? cost / done : 0 }
}

export function replay(a: { bars: Bar[]; rule: Rule; start: Start; maintenance: number; takerFeeBps: number; book?: Levels | null }): Report {
  const { bars, rule, start } = a
  const long = start.side === 'long', dir = long ? 1 : -1
  const entry = bars[0]?.o ?? 0
  const fee = (size: number, px: number) => size * px * a.takerFeeBps / 10_000
  const assumptions = [
    'trade candles stand in for the mark price, perpl has no mark history',
    'inside each candle the worst price comes first (a long sees the low before the high), moving smoothly between them',
    a.book ? 'closes walk the order book recorded now, scaled to each candle' : 'closes fill at the candle price, no book was recorded',
    'a level the candle opened past fills at the open',
    'funding is left out',
  ]
  const blank: Report = { from: 0, to: 0, bars: 0, entry, fires: [], withRule: { pnl: 0, liquidated: false, endSize: 0 }, without: { pnl: 0, liquidated: false, endSize: 0 }, fees: 0, added: 0, ambiguousBars: 0, assumptions }
  if (!bars.length || !entry) return blank

  // the same position, opened at the first candle's open
  const collateral0 = (start.size * entry) / start.leverage
  let size = start.size, collateral = collateral0, realized = 0, fees = fee(start.size, entry), added = 0
  let mem: Mem = {}, liquidated = false, ambiguous = 0
  let addedDay = 0, day = Math.floor(bars[0].t / DAY)
  const fires: Fire[] = []
  const steps = rule.kind === 'ladder' ? rule.steps.map(s => ({ ...s, left: true })) : []
  let backstopLeft = rule.kind === 'stop'

  const close = (at: number, what: Fire['what'], want: number, px: number, floor: number, book: Levels | null) => {
    const f = fillInto(book, start.side, Math.min(want, size), px, floor)
    if (!f.size) return 0
    realized += dir * (f.px - entry) * f.size
    collateral -= collateral * (f.size / size)
    fees += fee(f.size, f.px)
    size -= f.size
    fires.push({ at, what, size: f.size, px: f.px })
    return f.size
  }

  // the baseline: held to the end unless liquidated on the way
  let baseLiq = false
  const baseLiqPx = liquidationPrice(start.side, entry, start.size, collateral0, a.maintenance)
  for (const b of bars) if (long ? b.l <= baseLiqPx : b.h >= baseLiqPx) { baseLiq = true; break }
  const last = bars[bars.length - 1].c
  const without: Leg = baseLiq ? { pnl: -collateral0, liquidated: true, endSize: 0 } : { pnl: dir * (last - entry) * start.size, liquidated: false, endSize: start.size }

  for (const b of bars) {
    if (liquidated || size <= 0) break
    const d = Math.floor(b.t / DAY)
    if (d !== day) { day = d; addedDay = 0 }
    // worst first, then each move inside the candle walked in small steps so levels are met in the order a
    // real price would meet them. the open itself is a jump from the last candle, a real gap
    const corners = long ? [b.o, b.l, b.h, b.c] : [b.o, b.h, b.l, b.c]
    const path: number[] = [corners[0]]
    for (let k = 1; k < corners.length; k++) for (let j = 1; j <= SUB; j++) path.push(corners[k - 1] + (corners[k] - corners[k - 1]) * j / SUB)
    let touchedDown = false, touchedUp = false
    for (const [i, price] of path.entries()) {
      if (size <= 0 || liquidated) break
      const at = b.t + Math.round(i * 60_000 / path.length)
      const liq = liquidationPrice(start.side, entry, size, collateral, a.maintenance)
      if (long ? price <= liq : price >= liq) {
        liquidated = true
        fires.push({ at, what: 'liquidated', size, px: liq })
        realized -= collateral
        size = 0
        break
      }
      // what perpl holds fires on its own, the backstop first, then ladder steps
      if (rule.kind === 'stop' && backstopLeft && (long ? price <= rule.backstopPx : price >= rule.backstopPx)) {
        backstopLeft = false
        // a market close with perpl's 3% cap
        close(at, 'backstop', size, price, price * (1 - dir * 0.03), a.book ?? null)
        touchedDown = true
      }
      for (const s of steps) {
        if (!s.left || size <= 0) continue
        if (long ? price >= s.px : price <= s.px) {
          s.left = false
          close(at, 'step', start.size * s.share / 100, i === 0 ? price : s.px, s.floor, a.book ?? null)
          touchedUp = true
        }
      }
      if (size <= 0) break
      // then what pehra decides, through the live engine's own step()
      const tick: Tick = { at, block: 0, mkt: rule.mkt, mark: price, last: price }
      const health = { pid: rule.pid, side: start.side, entry, mark: price, liq, distance: liquidationDistance(start.side, price, liq), collateral, size }
      const out = step(rule, mem, tick, { health, maintenance: a.maintenance, balance: 1e9, addedToday: addedDay })
      mem = out.mem
      for (const it of out.intents) {
        if (it.kind === 'add') { collateral += it.ausd; added += it.ausd; addedDay += it.ausd; fires.push({ at, what: 'add', size, px: price, ausd: it.ausd }) }
        if (it.kind === 'close') {
          const sold = close(at, 'stop', it.size, price, it.floor, a.book ?? null)
          touchedDown = true
          // nothing sold at the floor: the live engine holds and tries again, so does this
          if (!sold) mem = { ...mem, fired: undefined }
        }
      }
    }
    if (touchedDown && touchedUp) ambiguous++
  }

  const endPx = bars[bars.length - 1].c
  const withRule: Leg = { pnl: realized + (size > 0 ? dir * (endPx - entry) * size : 0) - fees, liquidated, endSize: size }
  without.pnl -= fee(start.size, entry) + (without.liquidated ? 0 : fee(start.size, endPx))
  return { from: bars[0].t, to: bars[bars.length - 1].t, bars: bars.length, entry, fires, withRule, without, fees, added, ambiguousBars: ambiguous, assumptions }
}
