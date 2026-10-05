import { describe, expect, test } from 'bun:test'
import { Rule } from '../src/rule'
import { onFunding } from '../src/step'
import { summary } from '../src/ruleSign'

const rule = Rule.parse({ v: 1, id: 'f1', pid: 7, mkt: 64, kind: 'funding' })
const long = { pid: 7, side: 'long' as const, entry: 0.032, mark: 0.03, liq: 0.026, distance: 0.13, collateral: 10, size: 935 }

describe('funding', () => {
  test('the first reading only sets where it starts, even when it already pays', () => {
    const s = onFunding(rule, {}, long, 30, 1)
    expect(s.intents).toEqual([])
    expect(s.mem.fundingSign).toBe(1)
    expect(onFunding(rule, s.mem, long, 40, 2).intents).toEqual([])
  })

  test('a long closes when funding flips positive, never more than 1% under the mark, once', () => {
    let s = onFunding(rule, {}, long, -20, 1)
    s = onFunding(rule, s.mem, long, 0, 2)
    expect(s.intents).toEqual([])
    s = onFunding(rule, s.mem, long, 10, 3)
    expect(s.intents).toHaveLength(1)
    expect(s.intents[0]).toMatchObject({ kind: 'close', pid: 7, size: 935 })
    expect((s.intents[0] as { floor: number }).floor).toBeCloseTo(0.0297, 6)
    expect(onFunding(rule, { ...s.mem, fundingSign: -1 }, long, 20, 4).intents).toEqual([])
  })

  test('a short closes on the flip to negative', () => {
    const short = { ...long, side: 'short' as const }
    const s = onFunding(rule, { fundingSign: 1 }, short, -5, 1)
    expect(s.intents[0]).toMatchObject({ kind: 'close' })
    expect((s.intents[0] as { floor: number }).floor).toBeCloseTo(0.0303, 6)
  })

  test('a closed position ends the rule', () => {
    expect(onFunding(rule, {}, null, 10, 1).done).toBe('position closed')
  })

  test('what the passkey signs', () => {
    expect(summary(rule, 'MON')).toBe('close the MON position when funding turns against it, never more than 1% from the price')
  })
})
