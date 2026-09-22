import { describe, expect, test } from 'bun:test'
import { liquidationPrice, liquidationDistance, marginToReach, positionHealth, decide, defaultGuardSettings } from '../src/guard'
import type { Market } from '../src/rest'

const btc = { id: 16, symbol: 'BTC', config: { price_decimals: 1, size_decimals: 5, maintenance_margin: 400, initial_margin: 1000 } } as Market
const mon = { id: 64, symbol: 'MON', config: { price_decimals: 5, size_decimals: 0, maintenance_margin: 500, initial_margin: 300 } } as Market

describe('guard math', () => {
  test('matches the perpl worked example: 1 btc long at 100k, 10k deposit, 4% maintenance, liquidates at 94k', () => {
    expect(liquidationPrice('long', 100_000, 1, 10_000, 400)).toBeCloseTo(94_000, 6)
    expect(liquidationPrice('short', 100_000, 1, 10_000, 400)).toBeCloseTo(106_000, 6)
  })
  test('distance is a fraction of the mark', () => {
    expect(liquidationDistance('long', 100_000, 94_000)).toBeCloseTo(0.06, 9)
    expect(liquidationDistance('short', 100_000, 106_000)).toBeCloseTo(0.06, 9)
    expect(liquidationDistance('long', 95_000, 94_000)).toBeCloseTo(1 / 95, 9)
  })
  test('margin to reach a target distance puts the liquidation price exactly there', () => {
    const add = marginToReach('long', 0.1, 95_000, 100_000, 1, 10_000, 400)
    const liq = liquidationPrice('long', 100_000, 1, 10_000 + add, 400)
    expect(liq).toBeCloseTo(95_000 * 0.9, 6)
    const addS = marginToReach('short', 0.1, 105_000, 100_000, 1, 10_000, 400)
    expect(liquidationPrice('short', 100_000, 1, 10_000 + addS, 400)).toBeCloseTo(105_000 * 1.1, 6)
    expect(marginToReach('long', 0.01, 100_000, 100_000, 1, 10_000, 400)).toBe(0)
  })
  test('position health from wire units', () => {
    const h = positionHealth({ pid: 1, mkt: 64, sd: 1, s: 100, ep: 2658, c: '265800', lv: 1000 }, mon, 2600)
    expect(h.entry).toBe(0.02658)
    expect(h.mark).toBe(0.026)
    expect(h.collateral).toBe(0.2658)
    expect(h.liq).toBeCloseTo(0.02658 * 1.05 - 0.002658, 9)
    expect(h.distance).toBeCloseTo((0.026 - h.liq) / 0.026, 9)
  })
  test('decide: none above threshold, add below, capped by budget', () => {
    const safe = positionHealth({ pid: 1, mkt: 64, sd: 1, s: 100, ep: 2658, c: '1000000', lv: 250 }, mon, 2658)
    expect(decide(safe, defaultGuardSettings, mon, 50, 0).action).toBe('none')
    const risky = positionHealth({ pid: 2, mkt: 64, sd: 1, s: 100, ep: 2658, c: '265800', lv: 1000 }, mon, 2620)
    const d = decide(risky, defaultGuardSettings, mon, 50, 0)
    expect(d.action).toBe('add')
    expect(Number(d.addCns)).toBeGreaterThanOrEqual(1_000_000)
    expect(decide(risky, { ...defaultGuardSettings, enabled: false }, mon, 50, 0).action).toBe('warn')
    expect(decide(risky, defaultGuardSettings, mon, 50, 20).action).toBe('warn')
    expect(decide(risky, defaultGuardSettings, mon, 0.3, 0).addCns).toBe('300000')
  })
})
