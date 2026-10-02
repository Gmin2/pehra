import { describe, expect, test } from 'bun:test'
import { replay, type Bar } from '../src/replay'
import { Rule } from '../src/rule'

// a long of 200 mon at 3x from 0.034. maintenance 500 is 20%, so liquidation sits near 0.0283
const start = { side: 'long' as const, size: 200, leverage: 3 }
const bar = (i: number, o: number, h: number, l: number, c: number): Bar => ({ t: 1_790_000_000_000 + i * 60_000, o, h, l, c })
const flat = (n: number, p: number) => Array.from({ length: n }, (_, i) => bar(i, p, p, p, p))
const crash = (): Bar[] => [...flat(5, 0.034), bar(5, 0.034, 0.034, 0.031, 0.031), bar(6, 0.031, 0.031, 0.027, 0.027), ...flat(5, 0.027).map((b, i) => ({ ...b, t: b.t + (7 + i) * 60_000 }))]

describe('replay', () => {
  test('held through the crash the position is liquidated, the stop gets out above its floor', () => {
    const stop = Rule.parse({ v: 1, id: 's', pid: 9, mkt: 64, kind: 'stop', px: 0.032, floor: 0.0315, backstopPx: 0.03 })
    const r = replay({ bars: crash(), rule: stop, start, maintenance: 500, takerFeeBps: 3.45 })
    expect(r.without.liquidated).toBe(true)
    expect(r.withRule.liquidated).toBe(false)
    const out = r.fires.filter(f => f.what === 'stop' || f.what === 'backstop')
    expect(out.length).toBeGreaterThan(0)
    expect(out.every(f => f.px >= 0.0315 || f.what === 'backstop')).toBe(true)
    expect(r.withRule.pnl).toBeGreaterThan(r.without.pnl)
    expect(r.assumptions.length).toBe(5)
  })

  test('a gap past the stop and its floor sells nothing there, the backstop catches it', () => {
    const stop = Rule.parse({ v: 1, id: 's', pid: 9, mkt: 64, kind: 'stop', px: 0.033, floor: 0.0325, backstopPx: 0.031 })
    const gap = [...flat(3, 0.034), bar(3, 0.0305, 0.0305, 0.0305, 0.0305), ...flat(3, 0.0305)]
    const r = replay({ bars: gap, rule: stop, start, maintenance: 500, takerFeeBps: 0 })
    expect(r.fires.find(f => f.what === 'stop')).toBeUndefined()
    expect(r.fires[0].what).toBe('backstop')
    expect(r.withRule.endSize).toBe(0)
  })

  test('the guard adds margin and survives where holding is liquidated', () => {
    const guard = Rule.parse({ v: 1, id: 'g', pid: 9, mkt: 64, kind: 'guard', threshold: 10, target: 25, maxAddDay: 20 })
    const slow = [...flat(3, 0.034), ...[0.033, 0.032, 0.031, 0.030, 0.029, 0.0285, 0.0285].map((p, i) => bar(3 + i * 2, p, p, p, p))]
    const r = replay({ bars: slow, rule: guard, start, maintenance: 500, takerFeeBps: 0 })
    expect(r.without.liquidated).toBe(true)
    expect(r.withRule.liquidated).toBe(false)
    expect(r.added).toBeGreaterThan(0)
    expect(r.added).toBeLessThanOrEqual(20)
  })

  test('a ladder takes its shares on the way up', () => {
    const ladder = Rule.parse({ v: 1, id: 'l', pid: 9, mkt: 64, kind: 'ladder', steps: [{ px: 0.035, share: 30, floor: 0.0349 }, { px: 0.036, share: 30, floor: 0.0359 }] })
    const up = [...flat(2, 0.034), bar(2, 0.034, 0.0352, 0.034, 0.0352), bar(3, 0.0352, 0.0365, 0.0352, 0.0365)]
    const r = replay({ bars: up, rule: ladder, start, maintenance: 500, takerFeeBps: 0 })
    expect(r.fires.filter(f => f.what === 'step').map(f => [f.size, f.px])).toEqual([[60, 0.035], [60, 0.036]])
    expect(r.withRule.endSize).toBe(80)
  })

  test('appending future candles never changes what already fired, the same input gives the same report', () => {
    const stop = Rule.parse({ v: 1, id: 's', pid: 9, mkt: 64, kind: 'stop', px: 0.032, floor: 0.0315, backstopPx: 0.03 })
    const bars = crash()
    const a = replay({ bars: bars.slice(0, 7), rule: stop, start, maintenance: 500, takerFeeBps: 3.45 })
    const b = replay({ bars, rule: stop, start, maintenance: 500, takerFeeBps: 3.45 })
    expect(b.fires.slice(0, a.fires.length)).toEqual(a.fires)
    expect(replay({ bars, rule: stop, start, maintenance: 500, takerFeeBps: 3.45 })).toEqual(b)
  })

  test('a book walk never fills under the floor', () => {
    const stop = Rule.parse({ v: 1, id: 's', pid: 9, mkt: 64, kind: 'stop', px: 0.033, floor: 0.0328, backstopPx: 0.031 })
    const book = { mid: 0.034, bids: [[0.0339, 50], [0.0335, 50], [0.033, 1000]] as [number, number][], asks: [] }
    const r = replay({ bars: [...flat(2, 0.034), bar(2, 0.034, 0.034, 0.033, 0.033)], rule: stop, start, maintenance: 500, takerFeeBps: 0, book })
    const s = r.fires.find(f => f.what === 'stop')
    expect(s).toBeDefined()
    expect(s!.px).toBeGreaterThanOrEqual(0.0328)
  })
})
