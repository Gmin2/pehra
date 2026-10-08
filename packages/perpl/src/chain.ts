// chains: when this happens, do that. events come from what other rules did (a take profit step filled,
// an entry opened, a stop sold, a backstop fired), polls from the market and the clock. pure like step():
// the live engine and replay both call it, so what a chain would have done is what it does
import type { Rule } from './rule'
import type { Health } from './guard'
import { levels, shifted, type Intent, type Mem, type Step } from './step'

type When = Extract<Rule, { kind: 'when' }>
type Stop = Extract<Rule, { kind: 'stop' }>

export type ChainEvent =
  | { kind: 'opened'; rule: string; pid: number; price: number }
  | { kind: 'step'; rule: string; pid: number; n: number; price: number }
  | { kind: 'stopSold'; rule: string; pid: number; price: number }
  | { kind: 'backstop'; rule: string; pid: number; price: number }

// what a chain may look at when it acts. the engine and replay fill it from what they hold
export type ChainCtx = {
  at: number
  stop: (id: string) => { rule: Stop; mem: Mem } | undefined
  health: (pid: number) => Health | null
  positions: () => Health[]
  mark: (mkt: number) => number | undefined
  // a round trip of taker fees, as a fraction of the price
  fees: number
}

// what a poll may look at
export type PollNow = { at: number; mark?: number; distance?: number; fundingRate?: number; ausdPrice?: number }

const sig = (v: number) => Number(v.toPrecision(4))

// the price a stop moves to so the position no longer loses: the entry, or the entry plus a round trip of fees
export function breakevenPx(h: Health, to: 'entry' | 'entryPlusFees', fees: number) {
  const k = to === 'entry' ? 0 : fees
  return sig(h.side === 'long' ? h.entry * (1 + k) : h.entry * (1 - k))
}

// a stop moved so its trigger sits at px, floor and backstop kept the same distance behind. it only ever
// tightens, and it never moves past the price now (that would sell at once)
export function moveTo(rule: Stop, mem: Mem, h: Health, px: number, why: string): Intent | null {
  const lv = levels(rule, mem)
  const long = h.side === 'long'
  const d = px - lv.px
  if (long ? d <= 0 : d >= 0) return null
  if (long ? px >= h.mark : px <= h.mark) return null
  return { kind: 'move', rule: rule.id, ...shifted(lv, d), why }
}

// a stop's own breakeven: after take profit step n of its ladder fills
export function onStopEvent(rule: Stop, mem: Mem, ev: ChainEvent, h: Health | null, fees: number): Intent[] {
  if (!rule.breakeven || !h || ev.kind !== 'step') return []
  if (ev.rule !== rule.breakeven.ladder || ev.n < rule.breakeven.afterStep) return []
  const m = moveTo(rule, mem, h, breakevenPx(h, 'entryPlusFees', fees), `take profit step ${ev.n} filled, the stop moves to entry plus fees`)
  return m ? [m] : []
}

export function matches(rule: When, ev: ChainEvent): boolean {
  const t = rule.on
  if (t.on === 'step') return ev.kind === 'step' && ev.rule === t.rule && ev.n === t.n
  if (t.on === 'opened') return ev.kind === 'opened' && ev.rule === t.rule
  if (t.on === 'stopSold') return ev.kind === 'stopSold' && ev.rule === t.rule
  if (t.on === 'backstop') return ev.kind === 'backstop' && ev.rule === t.rule
  return false
}

const localMinute = (at: number, tz: number) => Math.floor(at / 60_000) + tz

// whether a polled trigger holds now. the first reading of funding only sets where it starts
export function poll(rule: When, mem: Mem, now: PollNow): { mem: Mem; hit: boolean } {
  const t = rule.on
  switch (t.on) {
    case 'price': {
      if (now.mark === undefined) return { mem, hit: false }
      const on = t.dir === 'above' ? now.mark >= t.px : now.mark <= t.px
      if (!on) return { mem: { ...mem, since: undefined }, hit: false }
      const since = mem.since ?? now.at
      return { mem: { ...mem, since }, hit: now.at - since >= rule.forMs }
    }
    case 'distance':
      return { mem, hit: now.distance !== undefined && now.distance * 100 <= t.belowPct }
    case 'fundingFlip': {
      if (now.fundingRate === undefined) return { mem, hit: false }
      const sign = Math.sign(now.fundingRate)
      const was = mem.fundingSign
      return { mem: { ...mem, fundingSign: sign }, hit: was !== undefined && sign !== 0 && sign !== was }
    }
    case 'time':
      return { mem, hit: now.at >= t.at }
    case 'daily': {
      // fires in the ten minutes after its time, once a local day, so arming late in the day waits for tomorrow
      const m = localMinute(now.at, t.tz)
      const day = Math.floor(m / 1440), minute = ((m % 1440) + 1440) % 1440
      if (mem.day === day || minute < t.minute || minute >= t.minute + 10) return { mem, hit: false }
      return { mem: { ...mem, day }, hit: true }
    }
    case 'depeg':
      return { mem, hit: now.ausdPrice !== undefined && Math.abs(1 - now.ausdPrice) * 10_000 >= t.bps }
    default:
      return { mem, hit: false }
  }
}

// what the chain does, as intents for the engine
export function act(rule: When, ctx: ChainCtx): Intent[] {
  const out: Intent[] = []
  const why = `when ${rule.id}`
  for (const a of rule.then) {
    if (a.do === 'moveStop' || a.do === 'tightenStop') {
      const s = ctx.stop(a.rule)
      const h = s ? ctx.health(s.rule.pid) : null
      if (!s || !h) { out.push({ kind: 'notify', text: `the stop ${a.rule} is gone, nothing moved` }); continue }
      const lv = levels(s.rule, s.mem)
      const px = a.do === 'moveStop'
        ? breakevenPx(h, a.to, ctx.fees)
        : sig(h.side === 'long' ? lv.px + (h.mark - lv.px) * a.byPct / 100 : lv.px - (lv.px - h.mark) * a.byPct / 100)
      const m = moveTo(s.rule, s.mem, h, px, a.do === 'moveStop' ? `${why}: move the stop to ${a.to === 'entry' ? 'entry' : 'entry plus fees'}` : `${why}: tighten the stop ${a.byPct}%`)
      if (m) out.push(m)
      else out.push({ kind: 'notify', text: `the stop ${a.rule} is already tighter than that, or the price is past it` })
    } else if (a.do === 'close' || a.do === 'closeAll') {
      const hs = a.do === 'close' ? [ctx.health(rule.pid)].filter((h): h is Health => !!h) : ctx.positions()
      for (const h of hs) {
        const k = a.floorPct / 100
        const share = a.do === 'close' ? a.sharePct / 100 : 1
        out.push({ kind: 'close', pid: h.pid, size: h.size * share, floor: sig(h.side === 'long' ? h.mark * (1 - k) : h.mark * (1 + k)), why: `${why}: close ${Math.round(share * 100)}%` })
      }
    } else if (a.do === 'addMargin') {
      if (ctx.health(rule.pid)) out.push({ kind: 'add', pid: rule.pid, ausd: a.ausd, why: `${why}: add ${a.ausd} ausd` })
    } else if (a.do === 'open') {
      const mark = ctx.mark(rule.mkt)
      if (mark === undefined) { out.push({ kind: 'notify', text: 'the market was not live, nothing opened' }); continue }
      const k = a.limitPct / 100
      out.push({ kind: 'open', side: a.side, ausd: a.margin, leverage: a.leverage, limit: sig(a.side === 'long' ? mark * (1 + k) : mark * (1 - k)), why: `${why}: open a ${a.side}` })
    } else if (a.do === 'cancel') {
      out.push({ kind: 'cancel', rule: a.rule, why: `${why}: cancel ${a.rule}` })
    } else if (a.do === 'notify') {
      out.push({ kind: 'notify', text: a.text })
    }
  }
  return out
}

// once fired a chain is done, unless it repeats
export function fired(rule: When, mem: Mem, ctx: ChainCtx): Step {
  const intents = act(rule, ctx)
  return { mem: { ...mem, fired: ctx.at, since: undefined }, intents, done: rule.repeat ? undefined : 'fired' }
}
