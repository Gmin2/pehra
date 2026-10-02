// what a rule is, shared by the server, the app, replay and tell pehra. prices are human (what the app
// shows), the engine converts them to wire units only when it sends. the schema checks shape only, facts
// that need the live position (stop under the mark, trigger budget) are checked by validate().
import { z } from 'zod/v4'

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

export const Rule = z.discriminatedUnion('kind', [
  // the tracer bullet: fires once when the mark goes above a level, does nothing else
  z.object({ ...base, kind: z.literal('ping'), above: price }),
  // add margin under threshold% from liquidation to get back to target%, within a daily budget
  z.object({ ...base, kind: z.literal('guard'), threshold: pct, target: pct, maxAddDay: z.number().positive() }),
  // hidden stop: px held by pehra, sold in slices never past floor, backstop held by perpl
  z.object({ ...base, kind: z.literal('stop'), px: price, floor: price, backstopPx: price, slices: z.number().int().min(1).max(8).default(4) }),
  // take profit ladder: each step closes share% of the position at px, never past its floor
  z.object({ ...base, kind: z.literal('ladder'), steps: z.array(z.object({ px: price, share: pct, floor: price })).min(1).max(6) }),
])
export type Rule = z.infer<typeof Rule>
export type RuleKind = Rule['kind']

export type RuleState = 'draft' | 'armed' | 'firing' | 'working' | 'held' | 'done' | 'failed' | 'paused'
// who holds the rule: pehra off the book, perpl as trigger orders, or both
export type RuleMode = 'pehra' | 'perpl' | 'both'

export function modeOf(r: Rule): RuleMode {
  if (r.kind === 'ladder') return 'perpl'
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

export function validate(r: Rule, live: Live | null): Check {
  if (r.kind === 'ping') return { ok: true }
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
