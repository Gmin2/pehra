import { CNS } from './config'
import type { Market } from './rest'

// prices and sizes on the wire are integers scaled by the market's decimals
export const toPrice = (m: Market, human: number) => Math.round(human * 10 ** m.config.price_decimals)
export const fromPrice = (m: Market, wire: number) => wire / 10 ** m.config.price_decimals
export const toSize = (m: Market, human: number) => Math.round(human * 10 ** m.config.size_decimals)
export const fromSize = (m: Market, wire: number) => wire / 10 ** m.config.size_decimals

// collateral is AUSD with 6 decimals, sent as a decimal string
export const toCns = (ausd: number) => BigInt(Math.round(ausd * Number(CNS))).toString()
export const fromCns = (cns: string | bigint) => Number(BigInt(cns)) / Number(CNS)

// leverage in hundredths, 500 is 5x
export const toLeverage = (x: number) => Math.round(x * 100)

// how much collateral a market order needs, before fees
export function marginFor(m: Market, sizeHuman: number, priceHuman: number, leverage: number) {
  return (sizeHuman * priceHuman) / leverage
}

// perpl sends both margins as a leverage in hundredths, like order leverage: initial_margin 1500 is
// 15x, so 1/15 of the notional. maintenance_margin 2500 is 25x, a 4% maintenance fraction, which is
// what their btc worked example uses.
export const marginFraction = (hundredths: number) => 100 / hundredths
export const maxLeverage = (m: Market) => m.config.initial_margin / 100

// where a fresh position at this leverage liquidates, before any pnl. the full formula is in guard.ts
export function freshLiquidationPrice(m: Market, side: 'long' | 'short', entry: number, leverage: number) {
  const mm = marginFraction(m.config.maintenance_margin)
  const move = 1 / leverage - mm
  return side === 'long' ? entry * (1 - move) : entry * (1 + move)
}
