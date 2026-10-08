// replay for recipes and chains: several rules on one market at once, against holding the same position.
// the same step() and chain logic the live engine runs decide; what perpl holds (backstops, ladder steps)
// is simulated the way perpl fires it, at the levels the rules have moved to. an entry recipe starts flat
// and opens when its entry would have; its baseline is the same entry held with nothing on it
import { liquidationPrice, liquidationDistance } from './guard'
import { step, levels, type Mem, type Tick, type Intent } from './step'
import { onStopEvent, matches, poll, act, type ChainEvent, type ChainCtx } from './chain'
import type { Rule } from './rule'
import type { Bar, Start, Levels } from './replay'

export type ManyFire = { at: number; rule: string; what: 'open' | 'stop' | 'backstop' | 'step' | 'add' | 'move' | 'close' | 'liquidated'; size?: number; px: number; ausd?: number }
export type ManyLeg = { pnl: number; liquidated: boolean; opened: boolean }
export type ManyReport = { from: number; to: number; bars: number; fires: ManyFire[]; withRules: ManyLeg; without: ManyLeg; fees: number; assumptions: string[] }

type Pos = { side: 'long' | 'short'; entry: number; size: number; collateral: number }
type Order = { rule: string; kind: 'backstop' | 'step'; n: number; px: number; share: number; floor: number; left: boolean }

const SUB = 12
const sig = (v: number) => Number(v.toPrecision(4))

export function replayMany(a: { bars: Bar[]; rules: Rule[]; start: Start | null; maintenance: number; takerFeeBps: number; book?: Levels | null }): ManyReport {
  const { bars } = a
  const assumptions = [
    'trade candles stand in for the mark price, perpl has no mark history',
    'inside each candle the worst price comes first, moving smoothly between its corners',
    'a step and a stop inside the same candle: the step is taken first only if the candle opened past it',
    'funding is left out, rules that wait on funding or agora never fire here',
  ]
  const empty: ManyReport = { from: 0, to: 0, bars: 0, fires: [], withRules: { pnl: 0, liquidated: false, opened: false }, without: { pnl: 0, liquidated: false, opened: false }, fees: 0, assumptions }
  if (!bars.length) return empty
  const fee = (size: number, px: number) => size * px * a.takerFeeBps / 10_000

  const rules = new Map<string, { rule: Rule; mem: Mem; done: boolean }>()
  for (const r of a.rules) rules.set(r.id, { rule: r, mem: {}, done: false })
  const orders: Order[] = []
  const fires: ManyFire[] = []
  let pos: Pos | null = null, realized = 0, fees = 0, liquidated = false, opened = false
  let pid = 1
  // the baseline: the same position, opened at the same moment and price, held to the end
  let base: { pos: Pos; at: number } | null = null

  const openAt = (side: 'long' | 'short', px: number, size: number, leverage: number, at: number) => {
    pos = { side, entry: px, size, collateral: size * px / leverage }
    fees += fee(size, px)
    opened = true
    base = { pos: { ...pos }, at }
  }
  if (a.start) openAt(a.start.side, bars[0].o, a.start.size, a.start.leverage, bars[0].t)

  const placeOrders = (r: Rule) => {
    if (r.kind === 'stop') orders.push({ rule: r.id, kind: 'backstop', n: 0, px: r.backstopPx, share: 100, floor: 0, left: true })
    if (r.kind === 'ladder') r.steps.forEach((s, n) => orders.push({ rule: r.id, kind: 'step', n: n + 1, px: s.px, share: s.share, floor: s.floor, left: true }))
  }
  for (const r of a.rules) if (r.pid !== 0) placeOrders(r)

  const close = (at: number, rule: string, what: ManyFire['what'], want: number, px: number) => {
    if (!pos) return 0
    const size = Math.min(want, pos.size)
    if (size <= 0) return 0
    const dir = pos.side === 'long' ? 1 : -1
    realized += dir * (px - pos.entry) * size
    pos.collateral -= pos.collateral * (size / pos.size)
    fees += fee(size, px)
    pos.size -= size
    fires.push({ at, rule, what, size, px })
    if (pos.size <= 1e-12) pos = null
    return size
  }

  // an entry's children once it fills, written from the fill price
  const handOff = (r: Extract<Rule, { kind: 'entry' }>, fill: number) => {
    const t = r.then
    if (!t) return
    const up = r.side === 'long' ? 1 : -1
    const at = (pct: number) => sig(fill * (1 + up * pct / 100))
    const ladderId = `ladder-from-${r.id}`
    const kids: Rule[] = []
    const base0 = { v: 1 as const, pid, mkt: r.mkt, forMs: 0 }
    if (t.ladder) kids.push({ ...base0, id: ladderId, kind: 'ladder', steps: t.ladder.map(x => ({ px: at(x.pct), share: x.share, floor: at(x.floorPct) })) })
    if (t.stop) kids.push({ ...base0, id: `stop-from-${r.id}`, kind: 'stop', px: at(-t.stop.pct), floor: at(-t.stop.floorPct), backstopPx: at(-t.stop.backstopPct), slices: 4, ...(t.stop.trailPct ? { trail: { pct: t.stop.trailPct } } : {}), ...(t.breakeven && t.ladder ? { breakeven: { ladder: ladderId, afterStep: 1 } } : {}) })
    for (const k of kids) { rules.set(k.id, { rule: k, mem: {}, done: false }); placeOrders(k) }
  }

  const health = (price: number) => {
    if (!pos) return null
    const liq = liquidationPrice(pos.side, pos.entry, pos.size, pos.collateral, a.maintenance)
    return { pid, side: pos.side, entry: pos.entry, mark: price, liq, distance: liquidationDistance(pos.side, price, liq), collateral: pos.collateral, size: pos.size }
  }

  const ctxAt = (at: number, price: number): ChainCtx => ({
    at,
    stop: id => { const x = rules.get(id); return x && !x.done && x.rule.kind === 'stop' ? { rule: x.rule, mem: x.mem } : undefined },
    health: () => health(price),
    positions: () => { const h = health(price); return h ? [h] : [] },
    mark: () => price,
    fees: 2 * a.takerFeeBps / 10_000,
  })

  const apply = (at: number, price: number, from: string, intents: Intent[]) => {
    for (const i of intents) {
      if (i.kind === 'move') {
        const x = rules.get(i.rule)
        if (!x) continue
        x.mem = { ...x.mem, px: i.px, floor: i.floor, backstopPx: i.backstopPx }
        const o = orders.find(o => o.rule === i.rule && o.kind === 'backstop' && o.left)
        if (o) o.px = i.backstopPx
        fires.push({ at, rule: i.rule, what: 'move', px: i.px })
      } else if (i.kind === 'close') {
        const sold = close(at, from, rules.get(from)?.rule.kind === 'stop' ? 'stop' : 'close', i.size, Math.max(price, 0))
        if (sold) event(at, price, { kind: 'stopSold', rule: from, pid, price })
      } else if (i.kind === 'add' && pos) {
        pos.collateral += i.ausd
        fires.push({ at, rule: from, what: 'add', px: price, ausd: i.ausd })
      } else if (i.kind === 'open' && !pos) {
        const r = rules.get(from)?.rule
        const fill = i.side === 'long' ? Math.min(price, i.limit) : Math.max(price, i.limit)
        const size = i.ausd * i.leverage / fill
        openAt(i.side, fill, size, i.leverage, at)
        fires.push({ at, rule: from, what: 'open', size, px: fill })
        if (r?.kind === 'entry') { handOff(r, fill); event(at, price, { kind: 'opened', rule: from, pid, price: fill }) }
      } else if (i.kind === 'cancel') {
        const x = rules.get(i.rule)
        if (x) { x.done = true; for (const o of orders) if (o.rule === i.rule) o.left = false }
      }
    }
  }

  const event = (at: number, price: number, ev: ChainEvent) => {
    const ctx = ctxAt(at, price)
    for (const [id, x] of rules) {
      if (x.done) continue
      if (x.rule.kind === 'stop') apply(at, price, id, onStopEvent(x.rule, x.mem, ev, health(price), ctx.fees))
      if (x.rule.kind === 'when' && matches(x.rule, ev)) { x.done = !x.rule.repeat; apply(at, price, id, act(x.rule, ctx)) }
    }
  }

  for (const b of bars) {
    if (liquidated) break
    const long = (pos as Pos | null)?.side !== 'short'
    const corners = long ? [b.o, b.l, b.h, b.c] : [b.o, b.h, b.l, b.c]
    const path = [corners[0]]
    for (let k = 1; k < corners.length; k++) for (let j = 1; j <= SUB; j++) path.push(corners[k - 1] + (corners[k] - corners[k - 1]) * j / SUB)
    for (const [i, price] of path.entries()) {
      const at = b.t + Math.round(i * 300_000 / path.length)
      if (pos) {
        const p: Pos = pos
        const liq = liquidationPrice(p.side, p.entry, p.size, p.collateral, a.maintenance)
        if (p.side === 'long' ? price <= liq : price >= liq) {
          fires.push({ at, rule: '', what: 'liquidated', size: p.size, px: liq })
          realized -= p.collateral
          pos = null
          liquidated = true
          break
        }
        // what perpl holds fires on its own: backstops first, then ladder steps
        for (const o of orders) {
          if (!o.left || !pos) continue
          const cur: Pos = pos
          const hit = o.kind === 'backstop' ? (cur.side === 'long' ? price <= o.px : price >= o.px) : (cur.side === 'long' ? price >= o.px : price <= o.px)
          if (!hit) continue
          o.left = false
          if (o.kind === 'backstop') {
            close(at, o.rule, 'backstop', cur.size, price)
            event(at, price, { kind: 'backstop', rule: o.rule, pid, price })
          } else {
            close(at, o.rule, "step", cur.size * o.share / 100, i === 0 ? price : o.px)
            event(at, price, { kind: 'step', rule: o.rule, pid, n: o.n, price: o.px })
          }
        }
      }
      // then what pehra decides, through the live engine's own step() and chain polls
      const tick: Tick = { at, block: 0, mkt: a.rules[0]?.mkt ?? 0, mark: price, last: price }
      for (const [id, x] of rules) {
        if (x.done) continue
        if (x.rule.kind === 'when') {
          const p = poll(x.rule, x.mem, { at, mark: price, distance: health(price)?.distance })
          x.mem = p.mem
          if (p.hit) { x.done = !x.rule.repeat; apply(at, price, id, act(x.rule, ctxAt(at, price))) }
          continue
        }
        if (x.rule.kind !== 'entry' && !pos) continue
        if (x.rule.kind === 'entry' && pos) continue
        const out = step(x.rule, x.mem, tick, { health: health(price), maintenance: a.maintenance, balance: 1e9, addedToday: 0 })
        x.mem = out.mem
        apply(at, price, id, out.intents)
        if (out.done && x.rule.kind === 'entry') x.done = true
      }
    }
  }

  const last = bars[bars.length - 1].c
  const end = pos as Pos | null
  const withRules: ManyLeg = { pnl: realized + (end ? (end.side === 'long' ? 1 : -1) * (last - end.entry) * end.size : 0) - fees, liquidated, opened }
  let without: ManyLeg = { pnl: 0, liquidated: false, opened: false }
  if (base) {
    const bp = (base as { pos: Pos; at: number }).pos
    const at0 = (base as { pos: Pos; at: number }).at
    const liqPx = liquidationPrice(bp.side, bp.entry, bp.size, bp.collateral, a.maintenance)
    const after = bars.filter(x => x.t >= at0 - 300_000)
    const hit = after.some(x => (bp.side === 'long' ? x.l <= liqPx : x.h >= liqPx))
    without = hit
      ? { pnl: -bp.collateral - fee(bp.size, bp.entry), liquidated: true, opened: true }
      : { pnl: (bp.side === 'long' ? 1 : -1) * (last - bp.entry) * bp.size - fee(bp.size, bp.entry) - fee(bp.size, last), liquidated: false, opened: true }
  }
  return { from: bars[0].t, to: bars[bars.length - 1].t, bars: bars.length, fires, withRules, without, fees, assumptions }
}

// the live levels of a stop in a report, for tests
export const stopLevels = (r: Extract<Rule, { kind: 'stop' }>, mem: Mem) => levels(r, mem)
