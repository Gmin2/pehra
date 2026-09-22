import type { Market } from './rest'
import type { Position } from './wire'
import { fromCns, fromPrice, fromSize, toCns } from './units'

// perpl's own formula (docs.perpl.xyz, liquidation): p_liq = p_entry + s * (c_mmr - c_deposit) / size,
// c_mmr = p_entry * size * maintenance fraction, s is 1 for longs and -1 for shorts. funding is left out.
// checked against their example: 1 btc at 100k with 10k deposit and 4% maintenance liquidates at 94k.
export function liquidationPrice(side: 'long' | 'short', entry: number, size: number, collateral: number, maintenanceBps: number) {
  const mmr = entry * size * (maintenanceBps / 10_000)
  const s = side === 'long' ? 1 : -1
  return entry + (s * (mmr - collateral)) / size
}

// how far the mark can move against the position before liquidation, as a fraction of the mark
export function liquidationDistance(side: 'long' | 'short', mark: number, liq: number) {
  return side === 'long' ? (mark - liq) / mark : (liq - mark) / mark
}

// collateral to add so the distance becomes target, given the current mark. zero when already there.
export function marginToReach(side: 'long' | 'short', target: number, mark: number, entry: number, size: number, collateral: number, maintenanceBps: number) {
  const wantLiq = side === 'long' ? mark * (1 - target) : mark * (1 + target)
  const mmr = entry * size * (maintenanceBps / 10_000)
  // solve p_liq = entry + s (mmr - c) / size for c
  const s = side === 'long' ? 1 : -1
  const wantCollateral = mmr - (s * (wantLiq - entry) * size)
  return Math.max(0, wantCollateral - collateral)
}

export type Health = { pid: number; side: 'long' | 'short'; entry: number; mark: number; liq: number; distance: number; collateral: number; size: number }

export function positionHealth(pos: Position, market: Market, markWire: number): Health {
  const side = pos.sd === 1 ? 'long' : 'short'
  const entry = fromPrice(market, pos.ep)
  const mark = fromPrice(market, markWire)
  const size = fromSize(market, pos.s)
  const collateral = fromCns(pos.c)
  const liq = liquidationPrice(side, entry, size, collateral, market.config.maintenance_margin)
  return { pid: pos.pid, side, entry, mark, liq, distance: liquidationDistance(side, mark, liq), collateral, size }
}

export type GuardSettings = { enabled: boolean; thresholdPct: number; targetPct: number; minAddAusd: number; maxAddAusdPerDay: number }
export const defaultGuardSettings: GuardSettings = { enabled: true, thresholdPct: 5, targetPct: 10, minAddAusd: 1, maxAddAusdPerDay: 20 }

export type Decision = { action: 'none' | 'warn' | 'add'; health: Health; addCns?: string; reason: string }

// the one rule: under the threshold, add enough to get back to the target, within the budget.
export function decide(h: Health, settings: GuardSettings, market: Market, availableAusd: number, addedTodayAusd: number): Decision {
  if (h.distance * 100 >= settings.thresholdPct) return { action: 'none', health: h, reason: `distance ${(h.distance * 100).toFixed(2)}% above ${settings.thresholdPct}%` }
  if (!settings.enabled) return { action: 'warn', health: h, reason: 'guard is off, warning only' }
  const need = marginToReach(h.side, settings.targetPct / 100, h.mark, h.entry, h.size, h.collateral, market.config.maintenance_margin)
  const budget = Math.min(availableAusd, settings.maxAddAusdPerDay - addedTodayAusd)
  const amount = Math.min(Math.max(need, settings.minAddAusd), budget)
  if (amount <= 0) return { action: 'warn', health: h, reason: budget <= 0 ? 'daily budget or balance exhausted' : 'nothing to add' }
  return { action: 'add', health: h, addCns: toCns(amount), reason: `distance ${(h.distance * 100).toFixed(2)}% under ${settings.thresholdPct}%, adding ${amount.toFixed(2)} AUSD to reach ${settings.targetPct}%` }
}
