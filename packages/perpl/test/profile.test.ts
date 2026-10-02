import { describe, expect, test } from 'bun:test'
import { profile, type Activity } from '../src/profile'
import { Rule, validate } from '../src/rule'

const h = 3600
const row = (kind: Activity['kind'], t: number, perp = '64', lev = '300'): Activity => ({ kind, perpId: perp, side: 'long', leverageHdths: kind === 'open' ? lev : null, timestamp: t })

describe('profile', () => {
  test('a new account is new here and gets a stop and a guard for each open position', () => {
    const p = profile([], [{ pid: 9, mkt: 64, side: 'long', entry: 0.034, mark: 0.034, liq: 0.024, size: 200 }])
    expect(p.labels).toEqual(['new here'])
    expect(p.suggest.map(s => s.rule.kind)).toEqual(['stop', 'guard'])
  })

  test('liquidated at high leverage, held overnight, tops up by hand', () => {
    const hist = [
      row('open', 0), row('margin', 2 * h), row('liquidated', 10 * h),
      row('open', 20 * h, '64', '500'), row('margin', 21 * h), row('close', 30 * h),
      row('open', 40 * h, '32', '200'), row('close', 41 * h, '32'),
    ]
    const p = profile(hist, [])
    expect(p.trades).toBe(3)
    expect(p.liquidations).toBe(1)
    expect(p.avgLeverage).toBeCloseTo(10 / 3, 5)
    expect(p.avgHoldHours).toBeCloseTo(7, 5)
    expect(p.overnight).toBe(2)
    expect(p.labels).toEqual(['high leverage, liquidated before', 'holds overnight', 'tops up to stay in'])
    expect(p.markets).toEqual([64, 32])
  })

  test('every suggestion is a rule that passes the same checks a person would face', () => {
    const open = [
      { pid: 9, mkt: 64, side: 'long' as const, entry: 0.03, mark: 0.034, liq: 0.024, size: 200 },
      { pid: 10, mkt: 64, side: 'short' as const, entry: 0.036, mark: 0.034, liq: 0.044, size: 200 },
    ]
    const p = profile([row('open', 0), row('liquidated', h)], open)
    expect(p.suggest.map(s => `${s.rule.pid} ${s.rule.kind}`)).toEqual(['9 stop', '9 guard', '9 ladder', '10 stop', '10 guard', '10 ladder'])
    for (const s of p.suggest) {
      const pos = open.find(o => o.pid === s.rule.pid)!
      const r = Rule.parse(s.rule)
      expect(validate(r, { mark: pos.mark, side: pos.side, size: pos.size, entry: pos.entry, resting: 0 })).toEqual({ ok: true })
    }
  })

  test('rules a position already has are not suggested again', () => {
    const open = [{ pid: 9, mkt: 64, side: 'long' as const, entry: 0.034, mark: 0.034, liq: 0.024, size: 200 }]
    expect(profile([], open, [{ pid: 9, kind: 'guard' }]).suggest.map(s => s.rule.kind)).toEqual(['stop'])
  })
})
