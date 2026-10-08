// what reaches the phone, in pehra's own voice (tmp/claude/preview/push-b.png). one push per change: close to
// liquidation sets at the guard's level plus 5 points and clears 4 points further out, so a mark wobbling
// on the line sends one push, not ten. the same push repeats at most every 4 hours. stop slices sold within
// a few seconds go out as one push. quiet hours hold everything but liquidation and close to liquidation,
// and what they held comes out as one "while you slept" push when they end.
import { db } from './db'
import { sendPush, type PushData } from './push'
import type { GuardEvent } from './guard'

db.exec(`create table if not exists alert_prefs (owner text primary key, body text not null)`)
db.exec(`create table if not exists alert_sent (key text primary key, owner text not null, at integer not null)`)
db.exec(`create table if not exists alert_log (id integer primary key autoincrement, owner text not null, kind text not null, title text not null, body text not null, at integer not null, held integer not null default 0)`)

export const KINDS = ['near_liq', 'acted', 'filled', 'liquidated', 'funding', 'depeg'] as const
export type AlertKind = (typeof KINDS)[number]
// quiet hours are minutes of the phone's local day, tz is the phone's offset from utc in minutes
export type Prefs = { on: Record<AlertKind, boolean>; quiet: { from: number; to: number } | null; tz: number }

const DEFAULTS: Prefs = { on: { near_liq: true, acted: true, filled: true, liquidated: true, funding: false, depeg: true }, quiet: null, tz: 0 }
const REPEAT_MS = 4 * 3600_000
const SLICE_MS = 8000
const URGENT: AlertKind[] = ['near_liq', 'liquidated']

const q = {
  prefs: db.prepare('select body from alert_prefs where owner = ?'),
  setPrefs: db.prepare('insert into alert_prefs (owner, body) values (?, ?) on conflict(owner) do update set body = excluded.body'),
  sent: db.prepare('select at from alert_sent where key = ?'),
  mark: db.prepare('insert into alert_sent (key, owner, at) values (?, ?, ?) on conflict(key) do update set at = excluded.at'),
  log: db.prepare('insert into alert_log (owner, kind, title, body, at, held) values (?, ?, ?, ?, ?, ?)'),
  held: db.prepare('select kind, title, body, at from alert_log where owner = ? and held = 1 order by at'),
  release: db.prepare('update alert_log set held = 0 where owner = ? and held = 1'),
  recent: db.prepare('select kind, title, body, at, held from alert_log where owner = ? order by at desc limit ?'),
}

export function prefsOf(owner: string): Prefs {
  const row = q.prefs.get(owner.toLowerCase()) as { body: string } | undefined
  if (!row) return DEFAULTS
  const p = JSON.parse(row.body) as Partial<Prefs>
  return { on: { ...DEFAULTS.on, ...p.on }, quiet: p.quiet ?? null, tz: p.tz ?? 0 }
}

export function setPrefs(owner: string, patch: { on?: Partial<Record<AlertKind, boolean>>; quiet?: Prefs['quiet']; tz?: number }): Prefs {
  const cur = prefsOf(owner)
  const next: Prefs = { on: { ...cur.on, ...patch.on }, quiet: patch.quiet === undefined ? cur.quiet : patch.quiet, tz: patch.tz ?? cur.tz }
  q.setPrefs.run(owner.toLowerCase(), JSON.stringify(next))
  return next
}

export const recentAlerts = (owner: string, n = 20) => q.recent.all(owner.toLowerCase(), n) as { kind: AlertKind; title: string; body: string; at: number; held: number }[]

const localMinute = (now: number, tz: number) => ((Math.floor(now / 60_000) + tz) % 1440 + 1440) % 1440
export function inQuiet(p: Prefs, now: number) {
  if (!p.quiet) return false
  const m = localMinute(now, p.tz), { from, to } = p.quiet
  return from <= to ? m >= from && m < to : m >= from || m < to
}

// four significant figures, what the app shows
const px = (v: number) => (v ? v.toFixed(Math.max(0, 3 - Math.floor(Math.log10(Math.abs(v))))) : '0')
const pct = (v: number) => `${v.toFixed(1)}%`
const lower = (s?: string) => (s ?? '').toLowerCase()

export type Pos = { pid: number; symbol: string; side: string; distance: number; mkt: number }
export type AlertDeps = {
  log: (s: string) => void
  owners: () => string[]
  positions: (owner: string) => Pos[]
  guard: (owner: string) => { enabled: boolean; thresholdPct: number } | null
  send?: typeof sendPush
}

export class Alerts {
  private near = new Map<string, boolean>()
  private slices = new Map<string, { size: number; cost: number; n: number; symbol: string; side: string; floor?: number; timer: ReturnType<typeof setTimeout> }>()
  private funding = new Map<number, number>()
  private depegged = false
  private wasQuiet = new Map<string, boolean>()
  private send: typeof sendPush

  constructor(private deps: AlertDeps) { this.send = deps.send ?? sendPush }

  // the one door every alert goes through: the switch, the 4 hour repeat, quiet hours
  async push(owner: string, kind: AlertKind, key: string | null, title: string, body: string, data: PushData = {}, now = Date.now()) {
    const addr = owner.toLowerCase(), p = prefsOf(addr)
    if (!p.on[kind]) { this.deps.log(`alert ${kind} off for ${addr.slice(0, 8)}: ${title}`); return 'off' }
    if (key) {
      const last = q.sent.get(key) as { at: number } | undefined
      if (last && now - last.at < REPEAT_MS) { this.deps.log(`alert ${key} sent ${Math.round((now - last.at) / 60_000)}m ago, skipped`); return 'repeat' }
      q.mark.run(key, addr, now)
    }
    const held = inQuiet(p, now) && !URGENT.includes(kind)
    q.log.run(addr, kind, title, body, now, held ? 1 : 0)
    if (held) { this.deps.log(`alert ${kind} held for quiet hours: ${title}`); return 'held' }
    this.deps.log(`alert ${kind} ${addr.slice(0, 8)}: ${title} / ${body}`)
    // liquidation news on the loud guard channel, what rules did on alerts, the morning summary on digest
    await this.send(addr, title, body, { kind, channelId: URGENT.includes(kind) ? 'guard' : 'alerts', ...data })
    return 'sent'
  }

  // close to liquidation, from every health read. sets at the guard's level plus 5, clears 4 further out
  health(owner: string, now = Date.now()) {
    const addr = owner.toLowerCase(), g = this.deps.guard(addr)
    const level = (g?.thresholdPct ?? 5) + 5, clear = level + 4
    for (const h of this.deps.positions(addr)) {
      const key = `near:${addr}:${h.pid}`, d = h.distance * 100
      if (this.near.get(key)) {
        if (d >= clear) this.near.set(key, false)
        continue
      }
      if (d > level) continue
      this.near.set(key, true)
      const sym = lower(h.symbol)
      const body = g?.enabled ? `${pct(d)} from liquidation. i add margin at ${g.thresholdPct}%, want to add some yourself?` : `${pct(d)} from liquidation and the guard is off. want to add some yourself?`
      void this.push(addr, 'near_liq', key, `your ${sym} ${h.side} is getting close`, body, { pid: String(h.pid), action: 'add', categoryId: 'near' }, now)
    }
  }

  // what a rule did, from the guard's event stream
  event(owner: string, e: Omit<GuardEvent, 'at'>) {
    const addr = owner.toLowerCase(), sym = lower(e.symbol)
    if (e.rule === 'stop' && e.amount && e.price) {
      // slices come seconds apart, they go out together
      const k = `${addr}:${e.pid}`, cur = this.slices.get(k)
      if (cur) { cur.size += e.amount; cur.cost += e.amount * e.price; cur.n++; return }
      const timer = setTimeout(() => {
        const s = this.slices.get(k)
        this.slices.delete(k)
        if (!s) return
        const avg = s.cost / s.size
        void this.push(addr, 'acted', null, `i sold your ${s.symbol} ${s.side}`.trim(), `${s.n > 1 ? `in ${s.n} slices` : 'in one go'} at ${px(avg)} average, never below your floor.`, { pid: String(e.pid ?? '') })
      }, SLICE_MS)
      this.slices.set(k, { size: e.amount, cost: e.amount * e.price, n: 1, symbol: sym, side: e.side ?? '', timer })
      return
    }
    if (e.rule === 'move') return void this.push(addr, 'acted', e.text.startsWith('trailing') ? `trail:${addr}:${e.pid}` : null, `i moved your ${sym} stop to ${px(e.price ?? 0)}`, `${e.text.split(':')[0]}.`, { pid: String(e.pid ?? '') })
    if (e.rule === 'notify') return void this.push(addr, 'acted', null, 'your rule says', e.text, {})
    if (e.rule === 'sl') return void this.push(addr, 'acted', null, `your ${sym} stop fired on perpl`, `sold ${e.amount ?? ''} ${sym} at ${px(e.price ?? 0)}. the position is closed.`.replace('  ', ' '), { pid: String(e.pid ?? '') })
    if (e.rule === 'tp') return void this.push(addr, 'filled', null, `your ${sym} take profit filled`, `sold ${e.amount ?? ''} ${sym} at ${px(e.price ?? 0)} on perpl.`.replace('  ', ' '), { pid: String(e.pid ?? '') })
    if (e.rule === 'funding') return void this.push(addr, 'acted', null, `funding turned against your ${sym} ${e.side ?? ''}, i closed it`.replace(/\s+,/, ','), `sold ${e.amount} ${sym} at ${px(e.price ?? 0)}, before it started costing you.`, { pid: String(e.pid ?? '') })
    if (e.rule === 'entry') return void this.push(addr, 'acted', null, `i opened your ${sym} ${e.side ?? ''}`.trim(), `${e.amount} ${sym} at ${px(e.price ?? 0)}, your price was reached. its stop is watching now.`, { pid: String(e.pid ?? '') })
    if (e.rule === 'backstop') return void this.push(addr, 'acted', null, `your ${sym} backstop fired on perpl`, `sold ${e.amount} ${sym} at ${px(e.price ?? 0)}, the last line held.`, { pid: String(e.pid ?? '') })
    if (e.rule === 'step') return void this.push(addr, 'filled', null, 'took some of your profit', `sold ${e.amount} ${sym} at ${px(e.price ?? 0)} on perpl.`, { pid: String(e.pid ?? '') })
    if (e.rule === 'floor') return void this.push(addr, 'acted', `floor:${addr}:${e.pid}`, `i'm holding your ${sym} stop`, `the book is thin under your floor ${px(e.price ?? 0)}. i wait, the backstop on perpl still holds.`, { pid: String(e.pid ?? '') })
    if (e.kind === 'failed' && !e.rule) return void this.push(addr, 'acted', `fail:${addr}:${e.pid}`, `something i tried on your ${sym} didn't work`, `${e.text}.`, { pid: String(e.pid ?? '') })
    if (e.rule === 'guard' && e.addAusd) {
      const b = e.before?.distancePct, a = e.after?.distancePct ?? e.distancePct
      return void this.push(addr, 'acted', null, `i added ${e.addAusd.toFixed(2)} ausd to your ${sym} ${e.side ?? ''}`.trim(), b !== undefined && a !== undefined ? `it was ${pct(b)} from liquidation, now ${pct(a)}.` : 'it is further from liquidation now.', { pid: String(e.pid ?? '') })
    }
  }

  // a liquidation the indexer saw on chain
  liquidated(owner: string, symbol: string, side: string, price: number | null, at: number) {
    const sym = lower(symbol)
    void this.push(owner, 'liquidated', `liq:${owner.toLowerCase()}:${at}`, `your ${sym} ${side} was liquidated`.replace(/\s+/g, ' '), price ? `perpl closed it at ${px(price)}. i'm sorry, the margin is gone.` : `perpl closed it. the margin is gone.`)
  }

  // funding per market, from perpl's context. a sign change tells whoever now pays to hold
  fundingTick(markets: { id: number; symbol: string; rate: number }[]) {
    for (const m of markets) {
      const was = this.funding.get(m.id)
      this.funding.set(m.id, m.rate)
      if (was === undefined || Math.sign(was) === Math.sign(m.rate) || m.rate === 0) continue
      const payer = m.rate > 0 ? 'long' : 'short'
      for (const owner of this.deps.owners())
        for (const h of this.deps.positions(owner))
          if (h.mkt === m.id && h.side === payer)
            void this.push(owner, 'funding', `fund:${owner}:${m.id}:${Math.sign(m.rate)}`, `you now pay to hold your ${lower(m.symbol)} ${payer}`, `funding on ${lower(m.symbol)} flipped, ${payer}s pay ${payer === 'long' ? 'shorts' : 'longs'} now.`, { pid: String(h.pid) })
    }
  }

  // agora's price for ausd. sets past `bps` off the dollar, clears back under two thirds of it
  depegTick(price: number, bps = 50) {
    const off = Math.abs(1 - price) * 10_000
    if (this.depegged) { if (off < bps * 0.66) this.depegged = false; return }
    if (off < bps) return
    this.depegged = true
    for (const owner of this.deps.owners())
      void this.push(owner, 'depeg', `depeg:${owner}`, `ausd is ${(off / 100).toFixed(1)}% off the dollar`, `agora pays ${price.toFixed(3)} now. nothing to do yet, i'm watching it.`)
  }

  // when quiet hours end, what they held goes out as one push, or a calm all clear
  quietTick(now = Date.now()) {
    for (const owner of this.deps.owners()) {
      const p = prefsOf(owner), quiet = inQuiet(p, now), was = this.wasQuiet.get(owner)
      this.wasQuiet.set(owner, quiet)
      if (!p.quiet || was !== true || quiet) continue
      const held = q.held.all(owner) as { kind: string; title: string }[]
      q.release.run(owner)
      const pos = this.deps.positions(owner)
      const where = pos.length ? pos.map(h => `your ${lower(h.symbol)} ${h.side} is ${pct(h.distance * 100)} from liquidation`).join(', ') : 'nothing is open'
      const body = held.length ? `${held.map(h => h.title.replace(/^i /, '')).join(', ')}. ${where}.` : `nothing needed doing. ${where}.`
      this.deps.log(`alert digest ${owner.slice(0, 8)}: ${body}`)
      void this.send(owner, 'while you slept', body, { kind: 'digest', channelId: 'digest' })
      q.log.run(owner, 'digest', 'while you slept', body, now, 0)
    }
  }
}
