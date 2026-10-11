// the one decision function. live, replay and the app preview all call it, so what a rule would have done
// on old candles is what it does now. pure: no io, no clock (time comes from the tick), no randomness.
// it returns intents, the engine decides how to carry them out and records what happened.
import { decideMm, type Health } from './guard'
import { toCns, fromCns } from './units'
import type { Rule } from './rule'

export type Tick = { at: number; block: number; mkt: number; mark: number; last: number }

export type View = {
  health: Health | null        // the rule's position at this tick's mark, null when it is gone
  maintenance: number          // the market's maintenance_margin, hundredths of leverage
  balance: number              // free ausd on the account
  addedToday: number           // ausd the guard already added today
}

// what a rule remembers between ticks, stored with it
export type Mem = {
  since?: number; fired?: number; lastAt?: number; fundingSign?: number
  // a stop that moved (trailing, breakeven, a chain): its live levels. the signed body keeps the first ones
  px?: number; floor?: number; backstopPx?: number
  // the best price since a trailing stop was armed, and the backstop price resting on perpl right now
  best?: number; placed?: number
  // a daily chain remembers the day it last ran, a price chain whether it was on the other side first
  day?: number
  // a copy: the newest trade of the target already seen (unix seconds), and the position each market's copy opened
  seen?: number; copied?: Record<string, number>; copiedSize?: Record<string, number>
}

export type Intent =
  | { kind: 'note'; text: string }
  | { kind: 'add'; pid: number; ausd: number; why: string }
  | { kind: 'close'; pid: number; size: number; floor: number; why: string }
  | { kind: 'open'; side: 'long' | 'short'; ausd: number; leverage: number; limit: number; why: string; mkt?: number }
  // a stop's levels move. the hidden ones change in memory, the backstop is placed again on perpl
  | { kind: 'move'; rule: string; px: number; floor: number; backstopPx: number; why: string }
  | { kind: 'cancel'; rule: string; why: string }
  | { kind: 'notify'; text: string }

export type Step = { mem: Mem; intents: Intent[]; done?: string }

// a margin add waits this long after the last one, so a slow fill is not topped up twice
export const ADD_COOLDOWN_MS = 60_000
// an entry that filled nothing tries again after this
export const ENTRY_RETRY_MS = 15_000

// the condition must hold for forMs before the rule acts. since is kept while it holds, dropped when not
function held(rule: Rule, mem: Mem, tick: Tick, on: boolean): { mem: Mem; ready: boolean } {
  if (!on) return { mem: { ...mem, since: undefined }, ready: false }
  const since = mem.since ?? tick.at
  return { mem: { ...mem, since }, ready: tick.at - since >= rule.forMs }
}

export function step(rule: Rule, mem: Mem, tick: Tick, view: View): Step {
  if (rule.expires && tick.at >= rule.expires) return { mem, intents: [], done: 'expired' }

  if (rule.kind === 'ping') {
    if (mem.fired !== undefined) return { mem, intents: [] }
    const h = held(rule, mem, tick, tick.mark > rule.above)
    if (!h.ready) return { mem: h.mem, intents: [] }
    return { mem: { ...h.mem, fired: tick.at }, intents: [{ kind: 'note', text: `mark ${tick.mark} above ${rule.above}` }], done: 'fired' }
  }

  if (rule.kind === 'entry') {
    if (mem.fired !== undefined) return { mem, intents: [] }
    // a try that filled nothing waits a little before the next, so a thin book is not hit every tick
    if (mem.lastAt !== undefined && tick.at - mem.lastAt < ENTRY_RETRY_MS) return { mem, intents: [] }
    const crossed = rule.when === 'below' ? tick.mark <= rule.px : tick.mark >= rule.px
    const h = held(rule, mem, tick, crossed)
    if (!h.ready) return { mem: h.mem, intents: [] }
    return {
      mem: { ...h.mem, fired: tick.at, lastAt: tick.at },
      intents: [{ kind: 'open', side: rule.side, ausd: rule.margin, leverage: rule.leverage, limit: rule.limit, why: `mark ${tick.mark} reached the entry at ${rule.px}` }],
      done: 'opened',
    }
  }

  // chains are polled and fed events by the engine through chain.ts, a tick alone decides nothing for them
  if (rule.kind === 'when' || rule.kind === 'copy') return { mem, intents: [] }

  const pos = view.health
  if (!pos) return { mem, intents: [], done: 'position closed' }

  if (rule.kind === 'guard') {
    const settings = { enabled: true, thresholdPct: rule.threshold, targetPct: rule.target, minAddAusd: 1, maxAddAusdPerDay: rule.maxAddDay }
    const d = decideMm(pos, settings, view.maintenance, view.balance, view.addedToday)
    const h = held(rule, mem, tick, d.action !== 'none')
    if (!h.ready || d.action !== 'add') return { mem: h.mem, intents: [] }
    if (mem.lastAt !== undefined && tick.at - mem.lastAt < ADD_COOLDOWN_MS) return { mem: h.mem, intents: [] }
    const ausd = fromCns(d.addCns ?? toCns(0))
    return { mem: { ...h.mem, lastAt: tick.at }, intents: [{ kind: 'add', pid: pos.pid, ausd, why: d.reason }] }
  }

  if (rule.kind === 'stop') {
    if (mem.fired !== undefined) return { mem, intents: [] }
    const lv = levels(rule, mem)
    const long = pos.side === 'long'
    const crossed = long ? tick.mark <= lv.px : tick.mark >= lv.px
    const h = held(rule, mem, tick, crossed)
    if (h.ready) {
      return {
        mem: { ...h.mem, fired: tick.at },
        intents: [{ kind: 'close', pid: pos.pid, size: pos.size, floor: lv.floor, why: `mark ${tick.mark} crossed the stop at ${lv.px}` }],
      }
    }
    if (!rule.trail) return { mem: h.mem, intents: [] }
    return trail(rule, h.mem, tick.mark, long)
  }

  // ladders rest on perpl as trigger orders, the engine places them, nothing to decide per tick
  return { mem, intents: [] }
}

// a stop's live levels: moved ones from memory, else the signed ones
export function levels(rule: Extract<Rule, { kind: 'stop' }>, mem: Mem) {
  return { px: mem.px ?? rule.px, floor: mem.floor ?? rule.floor, backstopPx: mem.backstopPx ?? rule.backstopPx }
}

const sig = (v: number) => Number(v.toPrecision(4))

// the levels shifted by d (up for a long, down for a short), kept to four figures
export function shifted(lv: { px: number; floor: number; backstopPx: number }, d: number) {
  return { px: sig(lv.px + d), floor: sig(lv.floor + d), backstopPx: sig(lv.backstopPx + d) }
}

// a trailing stop follows the best price since it was armed, pct behind it, and never loosens. the hidden
// levels follow every tick in memory. the backstop on perpl only moves once it would move more than
// minMovePct, perpl allows about 60 requests a minute
export function trail(rule: Extract<Rule, { kind: 'stop' }>, mem: Mem, mark: number, long: boolean): Step {
  if (!rule.trail) return { mem, intents: [] }
  const best = mem.best === undefined ? mark : long ? Math.max(mem.best, mark) : Math.min(mem.best, mark)
  const lv = levels(rule, mem)
  const want = long ? best * (1 - rule.trail.pct / 100) : best * (1 + rule.trail.pct / 100)
  const d = want - lv.px
  if (long ? d <= 0 : d >= 0) return { mem: { ...mem, best }, intents: [] }
  const next = shifted(lv, d)
  const placed = mem.placed ?? rule.backstopPx
  const min = (rule.trail.minMovePct ?? 0.5) / 100
  const moveBackstop = Math.abs(next.backstopPx - placed) / placed >= min
  const nextMem = { ...mem, best, px: next.px, floor: next.floor, backstopPx: next.backstopPx }
  return {
    mem: nextMem,
    intents: moveBackstop ? [{ kind: 'move', rule: rule.id, ...next, why: `trailing ${rule.trail.pct}% behind ${sig(best)}` }] : [],
  }
}

// funding comes from perpl's market context, not with the tick. a long pays when the rate is positive, a
// short when it is negative. the rule acts when it flips to paying, the first reading only sets where it starts
export function onFunding(rule: Rule, mem: Mem, health: Health | null, rate: number, at: number): Step {
  if (rule.kind !== 'funding') return { mem, intents: [] }
  if (!health) return { mem, intents: [], done: 'position closed' }
  const sign = Math.sign(rate)
  const pays = (s: number) => (health.side === 'long' ? s > 0 : s < 0)
  const was = mem.fundingSign
  const next = { ...mem, fundingSign: sign }
  if (mem.fired !== undefined || was === undefined || pays(was) || !pays(sign)) return { mem: next, intents: [] }
  const k = rule.floorPct / 100
  const floor = Number((health.side === 'long' ? health.mark * (1 - k) : health.mark * (1 + k)).toPrecision(4))
  return { mem: { ...next, fired: at }, intents: [{ kind: 'close', pid: health.pid, size: health.size, floor, why: `funding turned against the ${health.side}, rate ${rate}` }] }
}
