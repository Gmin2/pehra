import { describe, expect, test } from 'bun:test'
import { Rule, validateCopy } from '../src/rule'
import { onTrades } from '../src/copy'
import { summary } from '../src/ruleSign'

const target = '0x00000000000000000000000000000000000000aa'
const copy = (o: object = {}) => Rule.parse({ v: 1, id: 'c1', pid: 0, mkt: 64, kind: 'copy', target, margin: 10, maxLeverage: 3, limitPct: 1, closeWithThem: true, ...o }) as Extract<Rule, { kind: 'copy' }>
const pos = { pid: 9, side: 'long' as const, entry: 0.03, mark: 0.031, liq: 0.025, distance: 0.19, collateral: 10, size: 1000 }
const ctx = (o: object = {}) => ({ mark: () => 0.03, position: () => null, armedAt: 1_000_000, ...o })
const row = (kind: string, t: number, o: object = {}) => ({ kind, perpId: '64', side: 'long', leverageHdths: '500', timestamp: t, ...o })

describe('copy', () => {
  test('only trades after it was armed, oldest first, leverage capped at its own max', () => {
    const s = onTrades(copy(), {}, [row('open', 900), row('open', 1100, { side: 'short', leverageHdths: '200' })], ctx())
    expect(s.intents).toEqual([{ kind: 'open', mkt: 64, side: 'short', ausd: 10, leverage: 2, limit: 0.0297, why: '0x0000…00aa opened a short' }])
    expect(s.mem.seen).toBe(1100)
    expect(onTrades(copy(), s.mem, [row('open', 1100)], ctx()).intents).toEqual([])
    expect(onTrades(copy(), {}, [row('open', 1100)], ctx()).intents[0]).toMatchObject({ leverage: 3, limit: 0.0303 })
  })

  test('closes the copy when they close, only with closeWithThem, and never opens twice on one market', () => {
    const mem = { seen: 1100, copied: { '64': 9 } }
    const c = onTrades(copy(), mem, [row('close', 1200)], ctx({ position: () => pos }))
    expect(c.intents).toEqual([{ kind: 'close', pid: 9, size: 1000, floor: 0.03069, why: '0x0000…00aa closed' }])
    expect(c.mem.copied).toEqual({})
    expect(onTrades(copy({ closeWithThem: false }), mem, [row('close', 1200)], ctx({ position: () => pos })).intents).toEqual([])
    expect(onTrades(copy(), mem, [row('open', 1200)], ctx({ position: () => pos })).intents[0].kind).toBe('notify')
  })

  test('checks: not yourself, margin it has, leverage the market allows, a stop before liquidation', () => {
    const live = { mark: 0.03, balance: 50, maxLeverage: 3, maintenance: 500, resting: 0 }
    expect(validateCopy(copy(), '0xbb', live)).toEqual({ ok: true })
    expect(validateCopy(copy(), target, live).ok).toBe(false)
    expect(validateCopy(copy({ margin: 80 }), '0xbb', live).ok).toBe(false)
    expect(validateCopy(copy({ maxLeverage: 5 }), '0xbb', live).ok).toBe(false)
    expect(validateCopy(copy({ stopPct: 20 }), '0xbb', live).ok).toBe(false)
    expect(validateCopy(copy({ stopPct: 5 }), '0xbb', live)).toEqual({ ok: true })
  })

  test('what the passkey signs', () => {
    expect(summary(copy({ stopPct: 5 }), 'MON')).toBe(`copy ${target}: when they open on perpl, open the same side with 10 ausd at up to 3x, never more than 1% from the price, with a hidden stop 5% away, and close it when they close`)
  })
})
