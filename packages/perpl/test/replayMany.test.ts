import { describe, expect, test } from 'bun:test'
import { replayMany } from '../src/replayMany'
import { instantiate } from '../src/recipes'
import type { Bar } from '../src/replay'

// a five minute candle from a list of prices it moves through, open first and close last
const bar = (t: number, o: number, h: number, l: number, c: number): Bar => ({ t: t * 300_000, o, h, l, c })
const flat = (n: number, from: number, px: number) => Array.from({ length: n }, (_, i) => bar(from + i, px, px * 1.001, px * 0.999, px))
const live = { mkt: 64, mark: 1, tz: 0, margin: 10, leverage: 3, pos: { pid: 1, side: 'long' as const, entry: 1, size: 30 } }
const run = (bars: Bar[], rules: ReturnType<typeof instantiate>, start: { side: 'long' | 'short'; size: number; leverage: number } | null) =>
  replayMany({ bars, rules, start, maintenance: 500, takerFeeBps: 3.45 })

describe('replayMany', () => {
  test('lock in profit: step 1 fills, the stop moves to entry, a crash after sells near entry instead of liquidating', () => {
    const rules = instantiate('lock', live, 't')
    const bars = [...flat(3, 0, 1), bar(3, 1, 1.06, 0.999, 1.055), bar(4, 1.055, 1.056, 1.0, 1.0), bar(5, 1.0, 1.0, 0.8, 0.82), ...flat(3, 6, 0.82)]
    const r = run(bars, rules, { side: 'long', size: 30, leverage: 3 })
    const whats = r.fires.map(f => f.what)
    expect(whats).toContain('step')
    expect(whats).toContain('move')
    expect(whats.indexOf('move')).toBeGreaterThan(whats.indexOf('step'))
    expect(r.without.liquidated).toBe(true)
    expect(r.withRules.liquidated).toBe(false)
    expect(r.withRules.pnl).toBeGreaterThan(0)
    const sold = r.fires.find(f => f.what === 'stop' || f.what === 'backstop')
    expect(sold!.px).toBeGreaterThan(0.99)
  })

  test('buy the dip starts flat, opens when the price gets there, and its children take over', () => {
    const rules = instantiate('dip', { ...live, pos: undefined }, 'd')
    const bars = [...flat(3, 0, 1), bar(3, 1, 1, 0.965, 0.97), bar(4, 0.97, 1.03, 0.969, 1.02), bar(5, 1.02, 1.08, 1.01, 1.07), ...flat(3, 6, 1.07)]
    const r = run(bars, rules, null)
    expect(r.fires[0].what).toBe('open')
    expect(r.fires[0].px).toBeLessThanOrEqual(0.97 * 1.005)
    expect(r.fires.some(f => f.what === 'step')).toBe(true)
    expect(r.without.opened).toBe(true)
    expect(r.withRules.pnl).toBeGreaterThan(0)
  })

  test('a dip that never comes opens nothing', () => {
    const r = run(flat(10, 0, 1), instantiate('dip', { ...live, pos: undefined }, 'n'), null)
    expect(r.fires).toEqual([])
    expect(r.withRules.opened).toBe(false)
    expect(r.without.opened).toBe(false)
  })

  test('appending future candles never changes what already fired', () => {
    const rules = instantiate('lock', live, 'f')
    const bars = [...flat(3, 0, 1), bar(3, 1, 1.06, 0.999, 1.055), bar(4, 1.055, 1.056, 1.0, 1.0)]
    const a = run(bars, rules, { side: 'long', size: 30, leverage: 3 })
    const b = run([...bars, bar(5, 1.0, 1.0, 0.8, 0.82)], rules, { side: 'long', size: 30, leverage: 3 })
    expect(b.fires.slice(0, a.fires.length)).toEqual(a.fires)
  })
})
