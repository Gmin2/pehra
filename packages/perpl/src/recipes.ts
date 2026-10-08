// recipes: a few rules that work together, armed with one fingerprint. each is written in distances from
// the price, so it fits any market at any moment. instantiate turns one into rules for right now
import type { Rule } from './rule'

export type RecipeLive = {
  mkt: number
  mark: number
  // the open position a recipe protects, when it needs one
  pos?: { pid: number; side: 'long' | 'short'; entry: number; size: number }
  // the phone's offset from utc in minutes, for daily rules
  tz: number
  // margin and leverage a recipe that opens should use
  margin: number
  leverage: number
}

export type Recipe = {
  id: string
  name: string
  blurb: string
  needs: 'position' | 'none'
  make: (live: RecipeLive, tag: string) => Rule[]
}

const sig = (v: number) => Number(v.toPrecision(4))
const base = (id: string, mkt: number, pid = 0) => ({ v: 1 as const, id, pid, mkt, forMs: 0 })

// a stop under (long) or over (short) the price, its floor and backstop a little further
function stopAt(live: RecipeLive, id: string, pct: number, o: { trail?: number; breakeven?: string } = {}): Rule {
  const p = live.pos!
  const s = p.side === 'long' ? -1 : 1
  return {
    ...base(id, live.mkt, p.pid), kind: 'stop',
    px: sig(live.mark * (1 + s * pct / 100)), floor: sig(live.mark * (1 + s * (pct + 1) / 100)), backstopPx: sig(live.mark * (1 + s * (pct + 2) / 100)), slices: 4,
    ...(o.trail ? { trail: { pct: o.trail, minMovePct: 0.5 } } : {}),
    ...(o.breakeven ? { breakeven: { ladder: o.breakeven, afterStep: 1 } } : {}),
  }
}

export const RECIPES: Recipe[] = [
  {
    id: 'dip', name: 'buy the dip, protected', needs: 'none',
    blurb: 'opens a long 3% under the price. then a hidden stop, half off at +5% and +10%, and the stop moves to entry once the first half is sold',
    make: (l, tag) => [{
      ...base(`dip-${tag}`, l.mkt), kind: 'entry', side: 'long', when: 'below', px: sig(l.mark * 0.97), limit: sig(l.mark * 0.97 * 1.005),
      margin: l.margin, leverage: l.leverage,
      then: { stop: { pct: 4, floorPct: 5, backstopPct: 6 }, ladder: [{ pct: 5, share: 50, floorPct: 4.5 }, { pct: 10, share: 50, floorPct: 9.5 }], breakeven: true },
    }],
  },
  {
    id: 'breakout', name: 'catch the breakout', needs: 'none',
    blurb: 'opens a long when the price breaks 2% up, with a stop that trails 4% behind it and never loosens',
    make: (l, tag) => [{
      ...base(`breakout-${tag}`, l.mkt), kind: 'entry', side: 'long', when: 'above', px: sig(l.mark * 1.02), limit: sig(l.mark * 1.02 * 1.005),
      margin: l.margin, leverage: l.leverage,
      then: { stop: { pct: 3, floorPct: 4, backstopPct: 5, trailPct: 4 } },
    }],
  },
  {
    id: 'run', name: 'let it run', needs: 'position',
    blurb: 'a stop that follows the price 4% behind and never loosens, and a third taken off at +6%',
    make: (l, tag) => {
      const p = l.pos!, up = p.side === 'long' ? 1 : -1, ref = p.side === 'long' ? Math.max(l.mark, p.entry) : Math.min(l.mark, p.entry)
      return [
        stopAt(l, `stop-${p.pid}-${tag}`, 4, { trail: 4 }),
        { ...base(`ladder-${p.pid}-${tag}`, l.mkt, p.pid), kind: 'ladder', steps: [{ px: sig(ref * (1 + up * 0.06)), share: 33, floor: sig(ref * (1 + up * 0.055)) }] },
      ]
    },
  },
  {
    id: 'lock', name: 'lock in profit', needs: 'position',
    blurb: 'half off at +5%, the rest at +10%, and once the first half is sold the stop moves to entry so it cannot turn into a loss',
    make: (l, tag) => {
      const p = l.pos!, up = p.side === 'long' ? 1 : -1, ref = p.side === 'long' ? Math.max(l.mark, p.entry) : Math.min(l.mark, p.entry)
      const ladder = `ladder-${p.pid}-${tag}`
      return [
        { ...base(ladder, l.mkt, p.pid), kind: 'ladder', steps: [
          { px: sig(ref * (1 + up * 0.05)), share: 50, floor: sig(ref * (1 + up * 0.045)) },
          { px: sig(ref * (1 + up * 0.1)), share: 50, floor: sig(ref * (1 + up * 0.095)) },
        ] },
        stopAt(l, `stop-${p.pid}-${tag}`, 5, { breakeven: ladder }),
      ]
    },
  },
  {
    id: 'sleep', name: 'sleep safe', needs: 'position',
    blurb: 'closes if funding turns against you, adds 5 ausd if it gets within 15% of liquidation, and a note at 07:00 with how the night went',
    make: (l, tag) => {
      const p = l.pos!
      return [
        { ...base(`funding-${p.pid}-${tag}`, l.mkt, p.pid), kind: 'funding', floorPct: 1 },
        { ...base(`near-${p.pid}-${tag}`, l.mkt, p.pid), kind: 'when', on: { on: 'distance', belowPct: 15 }, then: [{ do: 'addMargin', ausd: 5 }] },
        { ...base(`morning-${tag}`, l.mkt), kind: 'when', on: { on: 'daily', minute: 7 * 60, tz: l.tz }, then: [{ do: 'notify', text: 'good morning. open pehra to see how the night went' }] },
      ]
    },
  },
  {
    id: 'depeg', name: 'depeg shield', needs: 'none',
    blurb: 'if ausd drifts 0.5% off the dollar at agora, every position is closed',
    make: (l, tag) => [{ ...base(`depeg-${tag}`, l.mkt), kind: 'when', on: { on: 'depeg', bps: 50 }, then: [{ do: 'closeAll', floorPct: 2 }] }],
  },
  {
    id: 'stack', name: 'daily stack', needs: 'none',
    blurb: 'every day at 09:00 opens a small long, never more than 1% from the price',
    make: (l, tag) => [{ ...base(`stack-${tag}`, l.mkt), kind: 'when', on: { on: 'daily', minute: 9 * 60, tz: l.tz }, then: [{ do: 'open', side: 'long', margin: l.margin, leverage: l.leverage, limitPct: 1 }], repeat: true }],
  },
]

export const recipe = (id: string) => RECIPES.find(r => r.id === id)

export function instantiate(id: string, live: RecipeLive, tag: string): Rule[] {
  const r = recipe(id)
  if (!r) throw new Error(`no recipe ${id}`)
  if (r.needs === 'position' && !live.pos) throw new Error(`${r.name} needs an open position`)
  return r.make(live, tag)
}
