import { describe, expect, test } from 'bun:test'
import { Rule, validateEntry, type EntryLive } from '../src/rule'
import { step, ENTRY_RETRY_MS, type Tick } from '../src/step'
import { summary } from '../src/ruleSign'

const live: EntryLive = { mark: 0.032, balance: 50, maxLeverage: 3, maintenance: 500, resting: 0 }
const base = { v: 1, id: 'e1', pid: 0, mkt: 64, forMs: 0, kind: 'entry', side: 'long', when: 'below', px: 0.03, limit: 0.0302, margin: 10, leverage: 3 } as const
const entry = (o: object = {}) => Rule.parse({ ...base, ...o }) as Extract<Rule, { kind: 'entry' }>
const tick = (mark: number, at = 1000): Tick => ({ at, block: 1, mkt: 64, mark, last: mark })
const view = { health: null, maintenance: 500, balance: 50, addedToday: 0 }

describe('entry', () => {
  test('waits above the level, opens once when the mark falls to it, then is done', () => {
    const r = entry()
    expect(step(r, {}, tick(0.031), view).intents).toEqual([])
    const s = step(r, {}, tick(0.0299, 2000), view)
    expect(s.intents).toEqual([{ kind: 'open', side: 'long', ausd: 10, leverage: 3, limit: 0.0302, why: 'mark 0.0299 reached the entry at 0.03' }])
    expect(s.done).toBe('opened')
    expect(step(r, s.mem, tick(0.0295, 3000), view).intents).toEqual([])
  })

  test('a breakout short opens when the mark rises to it', () => {
    const r = entry({ side: 'short', when: 'above', px: 0.034, limit: 0.0338 })
    expect(step(r, {}, tick(0.0339), view).intents).toEqual([])
    expect(step(r, {}, tick(0.0341), view).intents[0]).toMatchObject({ kind: 'open', side: 'short', limit: 0.0338 })
  })

  test('a try that filled nothing waits before the next one', () => {
    const r = entry()
    const first = step(r, {}, tick(0.0299, 1000), view)
    const forgot = { ...first.mem, fired: undefined }
    expect(step(r, forgot, tick(0.0299, 1000 + ENTRY_RETRY_MS - 1), view).intents).toEqual([])
    expect(step(r, forgot, tick(0.0299, 1000 + ENTRY_RETRY_MS), view).intents).toHaveLength(1)
  })

  test('the checks a person would trip over', () => {
    expect(validateEntry(entry(), live)).toEqual({ ok: true })
    expect(validateEntry(entry({ px: 0.033, limit: 0.0332 }), live)).toMatchObject({ ok: false, why: expect.stringContaining('already happened') })
    expect(validateEntry(entry({ limit: 0.0299 }), live)).toMatchObject({ ok: false, why: expect.stringContaining('at or above') })
    expect(validateEntry(entry({ limit: 0.0320 }), live)).toMatchObject({ ok: false, why: expect.stringContaining('5%') })
    expect(validateEntry(entry({ leverage: 5 }), live)).toMatchObject({ ok: false, why: 'this market allows up to 3x' })
    expect(validateEntry(entry({ margin: 60 }), live)).toMatchObject({ ok: false, why: 'that needs 60 ausd, 50.00 is free' })
    expect(validateEntry(entry({ pid: 4 }), live)).toMatchObject({ ok: false })
  })

  test('the stop has to sit between the entry and where it would be liquidated', () => {
    expect(validateEntry(entry({ stop: { px: 0.0285, floor: 0.0282, backstopPx: 0.0278, slices: 4 } }), live)).toEqual({ ok: true })
    expect(validateEntry(entry({ stop: { px: 0.0305, floor: 0.0282, backstopPx: 0.0278 } }), live)).toMatchObject({ ok: false, why: expect.stringContaining('below the entry') })
    // at 3x from 0.0302 liquidation is near 0.0262, a backstop under it would never fire
    expect(validateEntry(entry({ stop: { px: 0.0270, floor: 0.0265, backstopPx: 0.0260 } }), live)).toMatchObject({ ok: false, why: expect.stringContaining('liquidated near') })
  })

  test('what the passkey signs says all of it', () => {
    expect(summary(entry({ stop: { px: 0.0285, floor: 0.0282, backstopPx: 0.0278, slices: 4 } }), 'MON')).toBe(
      'open a long on MON when it falls to 0.03, 10 ausd at 3x, never above 0.0302, then a hidden stop at 0.0285, never below 0.0282, backstop 0.0278 on perpl')
  })
})
