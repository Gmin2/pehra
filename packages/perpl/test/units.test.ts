import { describe, expect, test } from 'bun:test'
import { toPrice, fromPrice, toSize, fromSize, toCns, fromCns, toLeverage, freshLiquidationPrice, marginFor } from '../src/units'
import type { Market } from '../src/rest'

const mon = { id: 64, symbol: 'MON', config: { price_decimals: 5, size_decimals: 0, maintenance_margin: 500, initial_margin: 300 } } as Market
const btc = { id: 16, symbol: 'BTC', config: { price_decimals: 1, size_decimals: 5, maintenance_margin: 2500, initial_margin: 1500 } } as Market

describe('wire units', () => {
  test('price scaling round trips per market', () => {
    expect(toPrice(mon, 0.02658)).toBe(2658)
    expect(fromPrice(mon, 2658)).toBe(0.02658)
    expect(toPrice(btc, 86142.3)).toBe(861423)
    expect(fromPrice(btc, 861423)).toBe(86142.3)
  })
  test('size scaling', () => {
    expect(toSize(mon, 100)).toBe(100)
    expect(toSize(btc, 0.00123)).toBe(123)
    expect(fromSize(btc, 123)).toBe(0.00123)
  })
  test('collateral is a six decimal string', () => {
    expect(toCns(1)).toBe('1000000')
    expect(toCns(0.891)).toBe('891000')
    expect(fromCns('891000')).toBe(0.891)
    expect(fromCns(199_946_095n)).toBe(199.946095)
  })
  test('leverage in hundredths', () => {
    expect(toLeverage(5)).toBe(500)
    expect(toLeverage(2.5)).toBe(250)
  })
  test('margin and liquidation distance', () => {
    expect(marginFor(mon, 100, 0.02658, 5)).toBeCloseTo(0.5316, 6)
    // mon's maintenance_margin 500 is 5x, so 20%. at 3x: a third minus a fifth from entry
    expect(freshLiquidationPrice(mon, 'long', 1, 3)).toBeCloseTo(1 - (1 / 3 - 0.2), 9)
    expect(freshLiquidationPrice(mon, 'short', 1, 3)).toBeCloseTo(1 + (1 / 3 - 0.2), 9)
    // btc's 2500 is 25x, the 4% of perpl's worked example
    expect(freshLiquidationPrice(btc, 'long', 100_000, 10)).toBeCloseTo(94_000, 6)
  })
})
