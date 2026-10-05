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
export type Mem = { since?: number; fired?: number; lastAt?: number }

export type Intent =
  | { kind: 'note'; text: string }
  | { kind: 'add'; pid: number; ausd: number; why: string }
  | { kind: 'close'; pid: number; size: number; floor: number; why: string }
  | { kind: 'open'; side: 'long' | 'short'; ausd: number; leverage: number; limit: number; why: string }

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
    const crossed = pos.side === 'long' ? tick.mark <= rule.px : tick.mark >= rule.px
    const h = held(rule, mem, tick, crossed)
    if (!h.ready) return { mem: h.mem, intents: [] }
    return {
      mem: { ...h.mem, fired: tick.at },
      intents: [{ kind: 'close', pid: pos.pid, size: pos.size, floor: rule.floor, why: `mark ${tick.mark} crossed the stop at ${rule.px}` }],
    }
  }

  // ladders rest on perpl as trigger orders, the engine places them, nothing to decide per tick
  return { mem, intents: [] }
}
