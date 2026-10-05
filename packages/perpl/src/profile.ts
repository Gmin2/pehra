// how an account trades, read from its perpl history (the envio indexer's Activity rows), and the rules that
// would fit its open positions. plain rules, no model: the point is that it is right and explainable
import type { Rule } from './rule'

export type Activity = {
  kind: 'deposit' | 'withdraw' | 'open' | 'increase' | 'decrease' | 'close' | 'liquidated' | 'margin'
  perpId: string | null; side: 'long' | 'short' | null; leverageHdths: string | null; timestamp: number
}
export type OpenPos = { pid: number; mkt: number; side: 'long' | 'short'; entry: number; mark: number; liq: number; size: number }

export type Profile = {
  trades: number; avgLeverage: number; avgHoldHours: number; overnight: number; liquidations: number; topUps: number
  markets: number[]; labels: string[]; suggest: { rule: Rule; why: string }[]
}

const HOUR = 3600, OVERNIGHT_H = 8

export function profile(history: Activity[], open: OpenPos[], have: { pid: number; kind: string }[] = []): Profile {
  const rows = [...history].sort((a, b) => a.timestamp - b.timestamp)
  const opens = rows.filter(r => r.kind === 'open')
  const lev = opens.map(r => Number(r.leverageHdths ?? 0) / 100).filter(x => x > 0)
  const avgLeverage = lev.length ? lev.reduce((s, x) => s + x, 0) / lev.length : 0
  // pair each open with the next close or liquidation on the same market
  const holds: number[] = []
  const since = new Map<string, number>()
  for (const r of rows) {
    if (!r.perpId) continue
    if (r.kind === 'open') since.set(r.perpId, r.timestamp)
    if ((r.kind === 'close' || r.kind === 'liquidated') && since.has(r.perpId)) { holds.push((r.timestamp - (since.get(r.perpId) ?? r.timestamp)) / HOUR); since.delete(r.perpId) }
  }
  const avgHoldHours = holds.length ? holds.reduce((s, x) => s + x, 0) / holds.length : 0
  const overnight = holds.filter(h => h >= OVERNIGHT_H).length
  const liquidations = rows.filter(r => r.kind === 'liquidated').length
  const topUps = rows.filter(r => r.kind === 'margin').length
  const markets = [...new Set(opens.map(r => Number(r.perpId)).filter(x => x > 0))]

  const labels: string[] = []
  // perpl's testnet markets cap mon at 3x, so 2.5x and up is near the top of what most can take
  const band = avgLeverage >= 2.5 ? 'high leverage' : avgLeverage >= 1.5 ? 'medium leverage' : lev.length ? 'low leverage' : ''
  if (liquidations > 0) labels.push(band ? `${band}, liquidated before` : 'liquidated before')
  else if (band) labels.push(band)
  if (holds.length && overnight / holds.length > 0.5) labels.push('holds overnight')
  else if (holds.length >= 3 && avgHoldHours < 1) labels.push('quick in and out')
  else if (holds.length >= 3 && avgHoldHours < OVERNIGHT_H) labels.push('out the same day')
  if (opens.length && topUps > opens.length * 0.5) labels.push('tops up to stay in')
  if (!labels.length) labels.push(opens.length ? 'steady' : 'new here')

  const suggest: Profile['suggest'] = []
  const r5 = (x: number) => Math.round(x * 100000) / 100000
  for (const p of open) {
    const long = p.side === 'long', dir = long ? 1 : -1
    const has = (k: string) => have.some(h => h.pid === p.pid && h.kind === k)
    if (!has('stop')) {
      // halfway from the mark to liquidation, floor 1% past it, backstop 3% past it
      const px = r5(p.mark - (p.mark - p.liq) / 2)
      suggest.push({
        rule: { v: 1, id: `s-${p.pid}`, pid: p.pid, mkt: p.mkt, forMs: 0, kind: 'stop', px, floor: r5(px * (1 - dir * 0.01)), backstopPx: r5(px * (1 - dir * 0.03)), slices: 4 },
        why: liquidations ? 'you have been liquidated before, this sells halfway there instead' : 'halfway to liquidation, sold in slices, never below its floor',
      })
    }
    if (!has('guard')) suggest.push({ rule: { v: 1, id: `g-${p.pid}`, pid: p.pid, mkt: p.mkt, forMs: 0, kind: 'guard', threshold: 10, target: 20, maxAddDay: 20 }, why: topUps ? 'you top up by hand, this does it at 3am' : 'adds margin before perpl would liquidate' })
    const up = dir * (p.mark - p.entry) / p.entry
    if (!has('ladder') && up > 0.01) {
      suggest.push({
        rule: { v: 1, id: `l-${p.pid}`, pid: p.pid, mkt: p.mkt, forMs: 0, kind: 'ladder', steps: [0.03, 0.06].map(x => ({ px: r5(p.mark * (1 + dir * x)), share: 30, floor: r5(p.mark * (1 + dir * (x - 0.005))) })) },
        why: `up ${(up * 100).toFixed(1)}%, takes a third at +3% and +6% from here`,
      })
    }
  }
  return { trades: opens.length, avgLeverage, avgHoldHours, overnight, liquidations, topUps, markets, labels, suggest }
}
