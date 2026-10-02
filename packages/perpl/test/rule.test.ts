import { describe, expect, test } from 'bun:test'
import { Rule, validate, modeOf, triggersOf, type Live } from '../src/rule'

const long: Live = { mark: 0.034, side: 'long', size: 200, entry: 0.033, resting: 0 }
const short: Live = { ...long, side: 'short', entry: 0.035 }
const stop = { v: 1, id: 's1', pid: 9, mkt: 64, kind: 'stop', px: 0.032, floor: 0.031, backstopPx: 0.03 } as const

describe('rule schema', () => {
  test('defaults fill in and the kind decides the shape', () => {
    const r = Rule.parse(stop)
    expect(r.forMs).toBe(0)
    expect(r.kind === 'stop' && r.slices).toBe(4)
    expect(modeOf(r)).toBe('both')
    expect(triggersOf(r)).toBe(1)
  })

  test('shape errors are caught before anything live is looked at', () => {
    expect(Rule.safeParse({ ...stop, px: -1 }).success).toBe(false)
    expect(Rule.safeParse({ ...stop, kind: 'buy' }).success).toBe(false)
    expect(Rule.safeParse({ ...stop, v: 2 }).success).toBe(false)
    expect(Rule.safeParse({ v: 1, id: 'l', pid: 9, mkt: 64, kind: 'ladder', steps: Array(7).fill({ px: 0.04, share: 10, floor: 0.039 }) }).success).toBe(false)
    expect(Rule.safeParse({ ...stop, forMs: 25 * 3600_000 }).success).toBe(false)
  })

  test('a valid stop on a long', () => {
    expect(validate(Rule.parse(stop), long)).toEqual({ ok: true })
  })

  test('stop above the mark on a long is refused in plain words', () => {
    const r = validate(Rule.parse({ ...stop, px: 0.035 }), long)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.why).toContain('below the price now')
  })

  test('floor and backstop have to sit in order past the stop', () => {
    expect(validate(Rule.parse({ ...stop, floor: 0.0325 }), long).ok).toBe(false)
    expect(validate(Rule.parse({ ...stop, backstopPx: 0.0315 }), long).ok).toBe(false)
  })

  test('the same stop mirrored is valid on a short', () => {
    const r = Rule.parse({ ...stop, px: 0.036, floor: 0.037, backstopPx: 0.038 })
    expect(validate(r, short)).toEqual({ ok: true })
  })

  test('a ladder that sells more than everything, or under entry, is refused', () => {
    const steps = [{ px: 0.04, share: 60, floor: 0.039 }, { px: 0.045, share: 50, floor: 0.044 }]
    expect(validate(Rule.parse({ v: 1, id: 'l', pid: 9, mkt: 64, kind: 'ladder', steps }), long).ok).toBe(false)
    const under = [{ px: 0.032, share: 50, floor: 0.031 }]
    expect(validate(Rule.parse({ v: 1, id: 'l', pid: 9, mkt: 64, kind: 'ladder', steps: under }), long).ok).toBe(false)
  })

  test('the trigger budget counts what already rests on the account', () => {
    const steps = [{ px: 0.04, share: 30, floor: 0.039 }, { px: 0.045, share: 30, floor: 0.044 }, { px: 0.05, share: 30, floor: 0.049 }]
    const ladder = Rule.parse({ v: 1, id: 'l', pid: 9, mkt: 64, kind: 'ladder', steps })
    expect(validate(ladder, { ...long, resting: 11 }).ok).toBe(true)
    const r = validate(ladder, { ...long, resting: 12 })
    expect(!r.ok && r.why).toBe('this needs 3 perpl orders, 12 of 14 are in use')
  })

  test('a guard has to bring the position back further than where it steps in', () => {
    const g = { v: 1, id: 'g', pid: 9, mkt: 64, kind: 'guard', threshold: 10, target: 8, maxAddDay: 20 } as const
    expect(validate(Rule.parse(g), long).ok).toBe(false)
    expect(validate(Rule.parse({ ...g, target: 15 }), long).ok).toBe(true)
  })

  test('nothing but a ping is valid without a position', () => {
    expect(validate(Rule.parse(stop), null).ok).toBe(false)
    expect(validate(Rule.parse({ v: 1, id: 'p', pid: 0, mkt: 64, kind: 'ping', above: 0.03 }), null).ok).toBe(true)
  })
})
