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

// distance to liquidation as a fraction of entry, from the maintenance margin in bps
export function liquidationPrice(m: Market, side: 'long' | 'short', entry: number, leverage: number) {
  const mm = m.config.maintenance_margin / 10_000
  const move = 1 / leverage - mm
  return side === 'long' ? entry * (1 - move) : entry * (1 + move)
}
