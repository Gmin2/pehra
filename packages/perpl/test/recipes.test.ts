import { describe, expect, test } from 'bun:test'
import { RECIPES, instantiate } from '../src/recipes'
import { Rule, validate, validateEntry, validateWhen, triggersOf } from '../src/rule'
import { ruleMessage, summary } from '../src/ruleSign'

const live = { mkt: 64, mark: 0.03, tz: 330, margin: 10, leverage: 3, pos: { pid: 7, side: 'long' as const, entry: 0.029, size: 1000 } }
const shortLive = { ...live, pos: { ...live.pos, side: 'short' as const, entry: 0.031 } }
const entryLive = { mark: 0.03, balance: 50, maxLeverage: 3, maintenance: 500, resting: 0 }
const posLive = (p = live.pos) => ({ mark: 0.03, side: p.side, size: p.size, entry: p.entry, resting: 0 })

function check(r: Rule, p = live.pos) {
  if (r.kind === 'entry') return validateEntry(r, entryLive)
  if (r.kind === 'when') return validateWhen(r, r.pid ? posLive(p) : null, 0.03)
  return validate(r, posLive(p))
}

describe('recipes', () => {
  for (const rc of RECIPES) {
    test(`${rc.name}: every rule parses and passes the checks a person would face`, () => {
      for (const l of rc.needs === 'position' ? [live, shortLive] : [live]) {
        const rules = instantiate(rc.id, l, 'abc')
        expect(rules.length).toBeGreaterThan(0)
        for (const r of rules) {
          expect(Rule.parse(r)).toEqual(r)
          expect(check(r, l.pos)).toEqual({ ok: true })
          expect(summary(r, 'MON').length).toBeGreaterThan(10)
        }
        expect(new Set(rules.map(r => r.id)).size).toBe(rules.length)
        expect(rules.reduce((t, r) => t + triggersOf(r), 0)).toBeLessThanOrEqual(5)
      }
    })
  }

  test('a recipe that needs a position refuses without one', () => {
    expect(() => instantiate('lock', { ...live, pos: undefined }, 'x')).toThrow('needs an open position')
  })

  test('lock in profit points its breakeven at its own ladder', () => {
    const [ladder, stop] = instantiate('lock', live, 't1')
    expect(stop.kind === 'stop' && stop.breakeven?.ladder).toBe(ladder.id)
  })

  test('a short protects upward', () => {
    const [stop] = instantiate('run', shortLive, 't2')
    expect(stop.kind === 'stop' && stop.px > 0.03 && stop.backstopPx > stop.floor).toBe(true)
  })

  test('what one fingerprint signs lists every rule', () => {
    const rules = instantiate('sleep', live, 't3')
    const msg = ruleMessage('0xabc', { action: 'createMany', name: 'sleep safe', rules, symbol: 'MON' }, 'n', 1_800_000_000_000)
    expect(msg).toContain('recipe sleep safe, 3 rules')
    expect(msg).toContain('1. close the MON position when funding turns against it')
    expect(msg).toContain('3. when it is 07:00')
    expect(msg).toMatch(/sha256 [0-9a-f]{64}/)
  })

  test('an entry recipe refuses a leverage whose liquidation comes before the backstop', () => {
    const [dip] = instantiate('dip', { ...live, leverage: 20 }, 't4')
    expect(dip.kind === 'entry' && validateEntry(dip, { ...entryLive, maxLeverage: 20 }).ok).toBe(false)
  })
})
