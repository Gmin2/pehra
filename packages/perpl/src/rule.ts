// what a rule is, shared by the server, the app, replay and tell pehra. prices are human (what the app
// shows), the engine converts them to wire units only when it sends. the schema checks shape only, facts
// that need the live position (stop under the mark, trigger budget) are checked by validate().
import { z } from 'zod/v4'
import { marginFraction } from './units'

const price = z.number().positive()
const pct = z.number().gt(0).lte(100)

const base = {
  v: z.literal(1),
  id: z.string().min(1).max(64),
  pid: z.number().int().nonnegative(),
  mkt: z.number().int().positive(),
  // the condition has to hold this long before the rule acts, so a one block wick does nothing
  forMs: z.number().int().min(0).max(24 * 3600_000).default(0),
  expires: z.number().int().positive().optional(),
}

// a chain: when this happens, do that. events come from other rules, polls from the market and the clock
export const WhenTrigger = z.discriminatedUnion('on', [
  z.object({ on: z.literal('step'), rule: z.string().min(1).max(64), n: z.number().int().min(1).max(6) }),
  z.object({ on: z.literal('opened'), rule: z.string().min(1).max(64) }),
  z.object({ on: z.literal('stopSold'), rule: z.string().min(1).max(64) }),
  z.object({ on: z.literal('backstop'), rule: z.string().min(1).max(64) }),
  z.object({ on: z.literal('price'), dir: z.enum(['above', 'below']), px: price }),
  z.object({ on: z.literal('distance'), belowPct: pct }),
  z.object({ on: z.literal('fundingFlip') }),
  z.object({ on: z.literal('time'), at: z.number().int().positive() }),
  z.object({ on: z.literal('daily'), minute: z.number().int().min(0).max(1439), tz: z.number().int().min(-720).max(840) }),
  z.object({ on: z.literal('depeg'), bps: z.number().int().min(10).max(500) }),
])
export type WhenTrigger = z.infer<typeof WhenTrigger>

export const WhenAction = z.discriminatedUnion('do', [
  z.object({ do: z.literal('moveStop'), rule: z.string().min(1).max(64), to: z.enum(['entry', 'entryPlusFees']) }),
  z.object({ do: z.literal('tightenStop'), rule: z.string().min(1).max(64), byPct: z.number().gt(0).lte(50) }),
  z.object({ do: z.literal('close'), sharePct: pct, floorPct: z.number().gt(0).lte(5) }),
  z.object({ do: z.literal('closeAll'), floorPct: z.number().gt(0).lte(5) }),
  z.object({ do: z.literal('addMargin'), ausd: z.number().positive().max(100) }),
  z.object({ do: z.literal('open'), side: z.enum(['long', 'short']), margin: z.number().positive().max(10_000), leverage: z.number().gt(0).lte(100), limitPct: z.number().gt(0).lte(5) }),
  z.object({ do: z.literal('cancel'), rule: z.string().min(1).max(64) }),
  z.object({ do: z.literal('notify'), text: z.string().min(1).max(140) }),
])
export type WhenAction = z.infer<typeof WhenAction>

export const Rule = z.discriminatedUnion('kind', [
  // the tracer bullet: fires once when the mark goes above a level, does nothing else
  z.object({ ...base, kind: z.literal('ping'), above: price }),
  // add margin under threshold% from liquidation to get back to target%, within a daily budget
  z.object({ ...base, kind: z.literal('guard'), threshold: pct, target: pct, maxAddDay: z.number().positive() }),
  // hidden stop: px held by pehra, sold in slices never past floor, backstop held by perpl
  z.object({
    ...base, kind: z.literal('stop'), px: price, floor: price, backstopPx: price, slices: z.number().int().min(1).max(8).default(4),
    // follows the best price since it was armed, pct behind it, only ever tighter. the backstop on perpl is
    // placed again only when it would move more than minMovePct
    trail: z.object({ pct: z.number().gt(0).lte(50), minMovePct: z.number().gt(0).lte(10).optional() }).optional(),
    // moves to the entry plus fees once step afterStep of that ladder has filled
    breakeven: z.object({ ladder: z.string().min(1).max(64), afterStep: z.number().int().min(1).max(6) }).optional(),
  }),
  // take profit ladder: each step closes share% of the position at px, never past its floor
  z.object({ ...base, kind: z.literal('ladder'), steps: z.array(z.object({ px: price, share: pct, floor: price })).min(1).max(6) }),
  // funding: close the position when funding turns against it (a long pays when the rate goes positive, a
  // short when it goes negative), never more than floorPct from the mark. acts on the flip, not on arming
  z.object({ ...base, kind: z.literal('funding'), floorPct: z.number().gt(0).lte(5).default(1) }),
  // copy a trader: when the target account opens a position on perpl, open the same side on the same market
  // with this margin, its leverage capped, never more than limitPct from the price. optionally a hidden
  // stop on the copy, and closing when they close. account wide, pid 0, mkt is where it was set up
  z.object({
    ...base, kind: z.literal('copy'), target: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    margin: z.number().positive().max(10_000), maxLeverage: z.number().gt(0).lte(100), limitPct: z.number().gt(0).lte(5),
    closeWithThem: z.boolean().optional(), stopPct: z.number().gt(0).lte(50).optional(),
  }),
  // a chain on one position (pid) or the account (pid 0). once by default, repeat keeps it armed
  z.object({ ...base, kind: z.literal('when'), on: WhenTrigger, then: z.array(WhenAction).min(1).max(4), repeat: z.boolean().optional() }),
  // entry: when the mark falls to (below) or rises to (above) px, open side with margin ausd at leverage, an
  // ioc limit that never fills past limit. the stop, when given, becomes its own rule on the new position.
  // pid is 0, there is no position until it fires
  z.object({
    ...base, kind: z.literal('entry'), side: z.enum(['long', 'short']), when: z.enum(['below', 'above']), px: price, limit: price,
    margin: z.number().positive().max(10_000), leverage: z.number().gt(0).lte(100),
    stop: z.object({ px: price, floor: price, backstopPx: price, slices: z.number().int().min(1).max(8).default(4) }).optional(),
    // what the new position gets once it opens, as distances from the actual fill (an entry can fill up to
    // 5% from its trigger, so absolute prices would be wrong): a stop, a take profit ladder, breakeven
    then: z.object({
      stop: z.object({ pct: pct, floorPct: pct, backstopPct: pct, slices: z.number().int().min(1).max(8).optional(), trailPct: z.number().gt(0).lte(50).optional() }).optional(),
      ladder: z.array(z.object({ pct: pct, share: pct, floorPct: z.number().min(0).lte(100) })).min(1).max(4).optional(),
      breakeven: z.boolean().optional(),
    }).optional(),
  }),
])
export type Rule = z.infer<typeof Rule>
export type RuleKind = Rule['kind']

export type RuleState = 'draft' | 'armed' | 'firing' | 'working' | 'held' | 'done' | 'failed' | 'paused'
// who holds the rule: pehra off the book, perpl as trigger orders, or both
export type RuleMode = 'pehra' | 'perpl' | 'both'

export function modeOf(r: Rule): RuleMode {
  if (r.kind === 'ladder') return 'perpl'
  if (r.kind === 'entry') return r.stop ? 'both' : 'pehra'
  if (r.kind === 'stop') return 'both'
  return 'pehra'
}

// perpl orders a rule keeps resting on the book
export function triggersOf(r: Rule) {
  if (r.kind === 'ladder') return r.steps.length
  if (r.kind === 'stop') return 1
  return 0
}

// perpl refuses the 16th resting trigger (spike g6), one slot stays free for an emergency stop
export const TRIGGER_BUDGET = 14

export type Live = { mark: number; side: 'long' | 'short'; size: number; entry: number; resting: number }
export type Check = { ok: true } | { ok: false; why: string }

const no = (why: string): Check => ({ ok: false, why })

// what an entry is checked against: the market now and the free ausd, there is no position yet
export type EntryLive = { mark: number; balance: number; maxLeverage: number; maintenance: number; resting: number }

export function validateEntry(r: Extract<Rule, { kind: 'entry' }>, live: EntryLive | null): Check {
  if (!live) return no('the market is not live right now, try again in a moment')
  if (r.pid !== 0) return no('an entry has no position yet, pid has to be 0')
  if (r.when === 'below' ? !(r.px < live.mark) : !(r.px > live.mark)) return no(`the price is ${live.mark} now, ${r.when === 'below' ? 'falls to' : 'rises to'} ${r.px} has already happened`)
  const long = r.side === 'long'
  // the limit is the worst price it may fill at: a long pays at most it, a short sells at least it
  if (long ? r.limit < r.px : r.limit > r.px) return no(`the limit has to be ${long ? 'at or above' : 'at or below'} the entry price`)
  if (Math.abs(r.limit - r.px) / r.px > 0.05) return no('the limit is more than 5% from the entry price')
  if (r.leverage > live.maxLeverage) return no(`this market allows up to ${live.maxLeverage}x`)
  if (r.margin > live.balance) return no(`that needs ${r.margin} ausd, ${live.balance.toFixed(2)} is free`)
  if (r.stop) {
    const under = (a: number, b: number) => (long ? a < b : a > b)
    if (!under(r.stop.px, r.px)) return no(`the stop has to be ${long ? 'below' : 'above'} the entry price`)
    if (!under(r.stop.floor, r.stop.px)) return no(`the floor has to be ${long ? 'below' : 'above'} the stop`)
    if (!under(r.stop.backstopPx, r.stop.floor)) return no(`the backstop has to be ${long ? 'below' : 'above'} the floor, it is the last line`)
    // where a position opened at the limit with this margin would be liquidated
    const mmr = marginFraction(live.maintenance)
    const liq = long ? r.limit * (1 - 1 / r.leverage + mmr) : r.limit * (1 + 1 / r.leverage - mmr)
    if (!under(liq, r.stop.backstopPx)) return no(`at ${r.leverage}x it would be liquidated near ${liq.toPrecision(4)}, before the backstop`)
    if (live.resting + 1 > TRIGGER_BUDGET) return no(`the backstop needs a perpl order, ${live.resting} of ${TRIGGER_BUDGET} are in use`)
  }
  if (r.then) {
    const st = r.then.stop, ld = r.then.ladder
    if (st && !(st.pct < st.floorPct && st.floorPct < st.backstopPct)) return no('the stop, its floor and its backstop each sit further from the fill than the one before')
    if (st) {
      const mmr = marginFraction(live.maintenance)
      const away = 1 / r.leverage - mmr
      if (st.backstopPct / 100 >= away) return no(`at ${r.leverage}x the position would be liquidated about ${(away * 100).toFixed(1)}% from the fill, before the backstop`)
    }
    if (ld) {
      if (ld.reduce((t, x) => t + x.share, 0) > 100) return no('the take profit steps sell more than the whole position')
      if (ld.some(x => x.floorPct >= x.pct)) return no('each take profit step needs its floor closer to the fill than its price')
    }
    if (r.then.breakeven && !(st && ld)) return no('moving to entry needs both a stop and a take profit')
    const need = (st ? 1 : 0) + (ld?.length ?? 0) + (r.stop ? 1 : 0)
    if (live.resting + need > TRIGGER_BUDGET) return no(`this needs ${need} perpl orders once it opens, ${live.resting} of ${TRIGGER_BUDGET} are in use`)
  }
  return { ok: true }
}

// a chain is checked for what can be known without the market: an action that needs a position has one,
// the rules it points at are this account's (the route checks they exist)
export function validateWhen(r: Extract<Rule, { kind: 'when' }>, live: Live | null, mark = live?.mark): Check {
  const needsPos = r.then.some(a => a.do === 'close' || a.do === 'addMargin') || r.on.on === 'distance'
  if (needsPos && (r.pid === 0 || !live)) return no('this needs an open position')
  if (r.on.on === 'time' && r.on.at < Date.now()) return no('that time has already passed')
  if (r.on.on === 'price' && mark !== undefined && (r.on.dir === 'above' ? r.on.px <= mark : r.on.px >= mark)) return no(`the price is ${mark} now, that has already happened`)
  return { ok: true }
}

// a copy is checked against the account: someone else, margin it has, leverage the market allows
export function validateCopy(r: Extract<Rule, { kind: 'copy' }>, owner: string, live: EntryLive | null): Check {
  if (r.pid !== 0) return no('a copy watches the whole account, pid has to be 0')
  if (r.target.toLowerCase() === owner.toLowerCase()) return no('that is your own address')
  if (!live) return no('the market is not live right now, try again in a moment')
  if (r.margin > live.balance) return no(`each copy uses ${r.margin} ausd, ${live.balance.toFixed(2)} is free`)
  if (r.maxLeverage > live.maxLeverage) return no(`this market allows up to ${live.maxLeverage}x`)
  if (r.stopPct && r.stopPct / 100 >= 1 / r.maxLeverage - marginFraction(live.maintenance)) return no(`at ${r.maxLeverage}x the copy would be liquidated before a ${r.stopPct}% stop`)
  return { ok: true }
}

export function validate(r: Rule, live: Live | null): Check {
  if (r.kind === 'ping') return { ok: true }
  if (r.kind === 'copy') return no('a copy is checked with validateCopy')
  if (r.kind === 'when') return validateWhen(r, live)
  if (r.kind === 'entry') return no('an entry is checked with validateEntry')
  if (!live) return no('there is no open position for this rule')
  const long = live.side === 'long'
  // under for a long means below, for a short above
  const under = (a: number, b: number) => (long ? a < b : a > b)
  if (r.kind === 'guard') {
    if (r.target <= r.threshold) return no('the guard has to bring the position back further than where it steps in')
    return { ok: true }
  }
  if (r.kind === 'stop') {
    if (!under(r.px, live.mark)) return no(`a stop on a ${live.side} has to be ${long ? 'below' : 'above'} the price now (${live.mark})`)
    if (!under(r.floor, r.px)) return no(`the floor has to be ${long ? 'below' : 'above'} the stop`)
    if (!under(r.backstopPx, r.floor)) return no(`the backstop has to be ${long ? 'below' : 'above'} the floor, it is the last line`)
  }
  if (r.kind === 'ladder') {
    const total = r.steps.reduce((s, x) => s + x.share, 0)
    if (total > 100) return no('the steps sell more than the whole position')
    for (const s of r.steps) {
      if (!under(live.entry, s.px)) return no(`a take profit on a ${live.side} has to be ${long ? 'above' : 'below'} the entry (${live.entry})`)
      if (!under(s.floor, s.px) && s.floor !== s.px) return no(`a step's floor has to be ${long ? 'below' : 'above'} its price`)
    }
  }
  const need = live.resting + triggersOf(r)
  if (need > TRIGGER_BUDGET) return no(`this needs ${triggersOf(r)} perpl orders, ${live.resting} of ${TRIGGER_BUDGET} are in use`)
  return { ok: true }
}
