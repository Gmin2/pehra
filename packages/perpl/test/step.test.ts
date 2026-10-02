import { describe, expect, test } from 'bun:test'
import { step, ADD_COOLDOWN_MS, type Tick, type View, type Mem } from '../src/step'
import { Rule } from '../src/rule'
import { positionHealth } from '../src/guard'
import type { Market } from '../src/rest'

const t = (at: number, mark: number): Tick => ({ at, block: at / 400, mkt: 64, mark, last: mark })
const ping = Rule.parse({ v: 1, id: 'p', pid: 0, mkt: 64, kind: 'ping', above: 0.034 })

// a long of 200 mon at 0.034 with 3.4 ausd in it, mon maintenance 500 (20%)
const market = { config: { price_decimals: 5, size_decimals: 0, maintenance_margin: 500 } } as Market
const pos = { pid: 9, mkt: 64, sd: 1, s: 200, ep: 3400, c: '3400000', lv: 200 }
const view = (markWire: number, over: Partial<View> = {}): View => ({ health: positionHealth(pos, market, markWire), maintenance: 500, balance: 50, addedToday: 0, ...over })

// run a rule over ticks, carrying memory, collecting intents
function run(rule: Rule, ticks: Tick[], v: (k: Tick) => View) {
  let mem: Mem = {}
  const out: { at: number; kind: string; done?: string }[] = []
  for (const k of ticks) {
    const s = step(rule, mem, k, v(k))
    mem = s.mem
    for (const i of s.intents) out.push({ at: k.at, kind: i.kind, done: s.done })
    if (s.done && !s.intents.length) out.push({ at: k.at, kind: 'done', done: s.done })
  }
  return out
}

describe('step', () => {
  test('ping fires once when the mark goes above, then never again', () => {
    const out = run(ping, [t(0, 0.033), t(400, 0.035), t(800, 0.036)], () => view(3400))
    expect(out).toEqual([{ at: 400, kind: 'note', done: 'fired' }])
  })

  test('forMs: a wick that crosses for 800ms does nothing, a cross that holds 2s fires once', () => {
    const slow = Rule.parse({ v: 1, id: 'p', pid: 0, mkt: 64, kind: 'ping', above: 0.034, forMs: 2000 })
    const wick = [t(0, 0.035), t(400, 0.035), t(800, 0.033), t(1200, 0.033)]
    expect(run(slow, wick, () => view(3400))).toEqual([])
    const holds = [t(0, 0.035), t(1000, 0.035), t(2000, 0.035), t(3000, 0.035)]
    expect(run(slow, holds, () => view(3400))).toEqual([{ at: 2000, kind: 'note', done: 'fired' }])
  })

  test('a hidden stop on a long closes the whole size at its floor when the mark crosses, once', () => {
    const stop = Rule.parse({ v: 1, id: 's', pid: 9, mkt: 64, kind: 'stop', px: 0.033, floor: 0.0325, backstopPx: 0.032 })
    let mem: Mem = {}
    const a = step(stop, mem, t(0, 0.0335), view(3350)); mem = a.mem
    expect(a.intents).toEqual([])
    const b = step(stop, mem, t(400, 0.033), view(3300)); mem = b.mem
    expect(b.intents).toEqual([{ kind: 'close', pid: 9, size: 200, floor: 0.0325, why: 'mark 0.033 crossed the stop at 0.033' }])
    const c = step(stop, mem, t(800, 0.0329), view(3290))
    expect(c.intents).toEqual([])
  })

  test('the guard adds margin under its threshold, then waits out the cooldown', () => {
    const guard = Rule.parse({ v: 1, id: 'g', pid: 9, mkt: 64, kind: 'guard', threshold: 10, target: 20, maxAddDay: 20 })
    // liquidation for this long is 0.034 - (3.4 - 1.36)/200 = 0.0238, so 10% away is about 0.0264
    const near = 2600
    let mem: Mem = {}
    const a = step(guard, mem, t(0, 0.026), view(near)); mem = a.mem
    expect(a.intents.length).toBe(1)
    expect(a.intents[0].kind).toBe('add')
    const ausd = a.intents[0].kind === 'add' ? a.intents[0].ausd : 0
    expect(ausd).toBeGreaterThan(0)
    expect(ausd).toBeLessThanOrEqual(20)
    expect(step(guard, mem, t(ADD_COOLDOWN_MS - 1, 0.026), view(near)).intents).toEqual([])
    expect(step(guard, mem, t(ADD_COOLDOWN_MS, 0.026), view(near)).intents.length).toBe(1)
  })

  test('the guard stays quiet far from liquidation and respects the daily budget', () => {
    const guard = Rule.parse({ v: 1, id: 'g', pid: 9, mkt: 64, kind: 'guard', threshold: 10, target: 20, maxAddDay: 20 })
    expect(step(guard, {}, t(0, 0.034), view(3400)).intents).toEqual([])
    expect(step(guard, {}, t(0, 0.026), view(2600, { addedToday: 20 })).intents).toEqual([])
  })

  test('a rule whose position is gone is done, an expired rule is done', () => {
    const stop = Rule.parse({ v: 1, id: 's', pid: 9, mkt: 64, kind: 'stop', px: 0.033, floor: 0.0325, backstopPx: 0.032, expires: 1000 })
    expect(step(stop, {}, t(0, 0.034), { ...view(3400), health: null }).done).toBe('position closed')
    expect(step(stop, {}, t(1000, 0.034), view(3400)).done).toBe('expired')
  })

  test('no tick sequence makes a stop close more than the position, it closes at most once', () => {
    const stop = Rule.parse({ v: 1, id: 's', pid: 9, mkt: 64, kind: 'stop', px: 0.033, floor: 0.0325, backstopPx: 0.032 })
    for (let seed = 1; seed <= 200; seed++) {
      let x = seed, mem: Mem = {}, closed = 0
      for (let i = 0; i < 60; i++) {
        x = (x * 1103515245 + 12345) % 2147483648
        const mark = 0.031 + (x % 400) / 100000
        const s = step(stop, mem, t(i * 400, mark), view(Math.round(mark * 100000)))
        mem = s.mem
        for (const it of s.intents) if (it.kind === 'close') closed += it.size
      }
      expect(closed).toBeLessThanOrEqual(200)
    }
  })
})
