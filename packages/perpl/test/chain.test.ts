import { describe, expect, test } from 'bun:test'
import { Rule } from '../src/rule'
import { step, trail, levels, type Mem } from '../src/step'
import { poll, matches, act, fired, onStopEvent, breakevenPx, type ChainCtx } from '../src/chain'
import { summary } from '../src/ruleSign'

const long = { pid: 7, side: 'long' as const, entry: 0.03, mark: 0.032, liq: 0.026, distance: 0.18, collateral: 10, size: 1000 }
const short = { ...long, side: 'short' as const, mark: 0.028, liq: 0.034 }
const stop = (o: object = {}) => Rule.parse({ v: 1, id: 'stop-7', pid: 7, mkt: 64, kind: 'stop', px: 0.029, floor: 0.0287, backstopPx: 0.0282, ...o }) as Extract<Rule, { kind: 'stop' }>
const when = (o: object) => Rule.parse({ v: 1, id: 'w1', pid: 7, mkt: 64, kind: 'when', ...o }) as Extract<Rule, { kind: 'when' }>
const tick = (mark: number, at = 1000) => ({ at, block: 1, mkt: 64, mark, last: mark })
const view = (h = long) => ({ health: h, maintenance: 500, balance: 50, addedToday: 0 })
const ctx = (o: Partial<ChainCtx> = {}): ChainCtx => ({ at: 5000, stop: () => ({ rule: stop(), mem: {} }), health: () => long, positions: () => [long], mark: () => 0.032, fees: 0.0007, ...o })

describe('trailing stop', () => {
  test('follows the best price, never loosens, moves the backstop only past minMovePct', () => {
    const r = stop({ px: 0.0304, floor: 0.0301, backstopPx: 0.0296, trail: { pct: 5, minMovePct: 1 } })
    let s = trail(r, {}, 0.032, true)
    expect(s.intents).toEqual([])                       // 5% under 0.032 is 0.0304, already there
    s = trail(r, s.mem, 0.0325, true)
    expect(levels(r, s.mem).px).toBeCloseTo(0.03088, 4)
    expect(s.intents).toHaveLength(1)                   // the backstop moved 1.6%, past 1%
    const placed = { ...s.mem, placed: (s.intents[0] as { backstopPx: number }).backstopPx }
    const back = trail(r, placed, 0.031, true)          // the price falls back, the stop stays
    expect(levels(r, back.mem).px).toBe(levels(r, placed).px)
    expect(back.intents).toEqual([])
    const small = trail(r, placed, 0.03255, true)       // a tiny new high moves the hidden stop, not the backstop
    expect(levels(r, small.mem).px).toBeGreaterThan(levels(r, placed).px)
    expect(small.intents).toEqual([])
  })

  test('a short trails downward', () => {
    const r = stop({ px: 0.0294, floor: 0.0297, backstopPx: 0.0302, trail: { pct: 5, minMovePct: 1 } })
    const s = trail(r, {}, 0.027, false)
    expect(levels(r, s.mem).px).toBeCloseTo(0.02835, 5)
    expect(levels(r, s.mem).floor).toBeLessThan(0.0297)
  })

  test('the stop sells at its moved level, not the signed one', () => {
    const r = stop({ trail: { pct: 2 } })
    const mem: Mem = { px: 0.0313, floor: 0.031, backstopPx: 0.0305 }
    const out = step(r, mem, tick(0.0312), view())
    expect(out.intents[0]).toMatchObject({ kind: 'close', floor: 0.031 })
  })
})

describe('breakeven', () => {
  test('after step 1 of its ladder the stop moves to entry plus fees, once, only tighter', () => {
    const r = stop({ breakeven: { ladder: 'ladder-7', afterStep: 1 } })
    const ev = { kind: 'step' as const, rule: 'ladder-7', pid: 7, n: 1, price: 0.0315 }
    const out = onStopEvent(r, {}, ev, long, 0.0007)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'move', rule: 'stop-7', px: breakevenPx(long, 'entryPlusFees', 0.0007) })
    expect((out[0] as { px: number }).px).toBeCloseTo(0.03002, 5)
    expect(onStopEvent(r, { px: 0.0305 }, ev, long, 0.0007)).toEqual([])         // already past breakeven
    expect(onStopEvent(r, {}, { ...ev, rule: 'other' }, long, 0.0007)).toEqual([])
    expect(onStopEvent(r, {}, ev, { ...long, mark: 0.0299 }, 0.0007)).toEqual([]) // the price is under breakeven, it would sell at once
  })
})

describe('when rules', () => {
  test('events match only their own rule and step', () => {
    const w = when({ on: { on: 'step', rule: 'ladder-7', n: 1 }, then: [{ do: 'moveStop', rule: 'stop-7', to: 'entry' }] })
    expect(matches(w, { kind: 'step', rule: 'ladder-7', pid: 7, n: 1, price: 0.0315 })).toBe(true)
    expect(matches(w, { kind: 'step', rule: 'ladder-7', pid: 7, n: 2, price: 0.0315 })).toBe(false)
    expect(matches(w, { kind: 'opened', rule: 'ladder-7', pid: 7, price: 0.0315 })).toBe(false)
  })

  test('move the stop to entry, close half, add margin, open, notify', () => {
    const w = when({ on: { on: 'price', dir: 'above', px: 0.033 }, then: [
      { do: 'moveStop', rule: 'stop-7', to: 'entry' }, { do: 'close', sharePct: 50, floorPct: 1 }, { do: 'addMargin', ausd: 5 }, { do: 'notify', text: 'done' },
    ] })
    const out = act(w, ctx())
    expect(out.map(i => i.kind)).toEqual(['move', 'close', 'add', 'notify'])
    expect(out[0]).toMatchObject({ px: 0.03 })
    expect(out[1]).toMatchObject({ size: 500, floor: 0.03168 })
    const o = act(when({ on: { on: 'time', at: 1 }, then: [{ do: 'open', side: 'short', margin: 5, leverage: 2, limitPct: 1 }] }), ctx())
    expect(o[0]).toMatchObject({ kind: 'open', side: 'short', ausd: 5, limit: 0.03168 })
  })

  test('a stop that is gone or already tighter says so instead of moving', () => {
    expect(act(when({ on: { on: 'time', at: 1 }, then: [{ do: 'moveStop', rule: 'x', to: 'entry' }] }), ctx({ stop: () => undefined }))[0].kind).toBe('notify')
    expect(act(when({ on: { on: 'time', at: 1 }, then: [{ do: 'moveStop', rule: 'stop-7', to: 'entry' }] }), ctx({ stop: () => ({ rule: stop(), mem: { px: 0.031 } }) }))[0].kind).toBe('notify')
  })

  test('close all covers every position', () => {
    const out = act(when({ pid: 0, on: { on: 'depeg', bps: 50 }, then: [{ do: 'closeAll', floorPct: 2 }] }), ctx({ positions: () => [long, { ...short, pid: 8 }] }))
    expect(out.map(i => (i as { pid: number }).pid)).toEqual([7, 8])
    expect(out[1]).toMatchObject({ floor: 0.02856 })
  })

  test('polls: price holds forMs, funding needs a first reading, depeg past its bps', () => {
    const p = when({ forMs: 2000, on: { on: 'price', dir: 'below', px: 0.03 }, then: [{ do: 'notify', text: 'x' }] })
    let s = poll(p, {}, { at: 1000, mark: 0.0299 })
    expect(s.hit).toBe(false)
    expect(poll(p, s.mem, { at: 2500, mark: 0.0301 }).hit).toBe(false)      // went back over, the clock resets
    expect(poll(p, s.mem, { at: 3000, mark: 0.0298 }).hit).toBe(true)
    const f = when({ on: { on: 'fundingFlip' }, then: [{ do: 'notify', text: 'x' }] })
    s = poll(f, {}, { at: 1, fundingRate: 30 })
    expect(s.hit).toBe(false)
    expect(poll(f, s.mem, { at: 2, fundingRate: 25 }).hit).toBe(false)
    expect(poll(f, s.mem, { at: 3, fundingRate: -5 }).hit).toBe(true)
    const d = when({ pid: 0, on: { on: 'depeg', bps: 50 }, then: [{ do: 'notify', text: 'x' }] })
    expect(poll(d, {}, { at: 1, ausdPrice: 0.996 }).hit).toBe(false)
    expect(poll(d, {}, { at: 1, ausdPrice: 0.994 }).hit).toBe(true)
  })

  test('daily fires once a local day in its ten minutes, not when armed late', () => {
    const d = when({ pid: 0, on: { on: 'daily', minute: 9 * 60, tz: 330 }, then: [{ do: 'notify', text: 'x' }], repeat: true })
    const ist = (h: number, m = 0, day = 0) => Date.UTC(2026, 9, 9 + day, h, m) - 330 * 60_000
    expect(poll(d, {}, { at: ist(15) }).hit).toBe(false)
    const s = poll(d, {}, { at: ist(9, 3, 1) })
    expect(s.hit).toBe(true)
    expect(poll(d, s.mem, { at: ist(9, 5, 1) }).hit).toBe(false)
    expect(poll(d, s.mem, { at: ist(9, 1, 2) }).hit).toBe(true)
  })

  test('once a chain fires it is done, unless it repeats', () => {
    expect(fired(when({ on: { on: 'time', at: 1 }, then: [{ do: 'notify', text: 'x' }] }), {}, ctx()).done).toBe('fired')
    expect(fired(when({ on: { on: 'time', at: 1 }, then: [{ do: 'notify', text: 'x' }], repeat: true }), {}, ctx()).done).toBeUndefined()
  })

  test('a tick alone never ends a chain', () => {
    expect(step(when({ pid: 0, on: { on: 'time', at: 1 }, then: [{ do: 'notify', text: 'x' }] }), {}, tick(0.03), { ...view(), health: null }).done).toBeUndefined()
  })

  test('what the passkey signs reads as a sentence', () => {
    expect(summary(when({ on: { on: 'step', rule: 'ladder-7', n: 1 }, then: [{ do: 'moveStop', rule: 'stop-7', to: 'entryPlusFees' }] }), 'MON'))
      .toBe('when take profit step 1 of ladder-7 fills, move the stop stop-7 to entry plus fees')
    expect(summary(stop({ trail: { pct: 3 } }), 'MON')).toBe('hidden stop on MON at 0.029, never below 0.0287, backstop 0.0282 on perpl, trailing 3% behind the best price, only ever tighter')
  })
})
