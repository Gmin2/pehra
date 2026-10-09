// the guard: one server side trading session per delegated account, every position checked against
// the mark on every update, margin added before the venue can liquidate. keys live in data/guard-keys.json
// and events in data/guard-events.json. the same session relays the phone's own orders, closes and brackets.
import { existsSync, readFileSync } from 'node:fs'
import { writeAtomic } from './files'
import { Engine, addedToday } from './engine'
import { Recorder } from './record'
import type { Hex } from 'viem'
import { Alerts } from './alerts'
import {
  decide, defaultGuardSettings, restOrderHistory, restWallet, getContext, MarketDataSocket, positionHealth, TradingSocket, fromCns, fromPrice, fromSize, toCns, toLeverage, toPrice, toSize, Trigger, maxLeverage, OrderType,
  type AccountUpdateFrame, type MarketStateFrame, type Context, type Enrolled, type GuardSettings, type Health, type Market, type Position, type Live, type EntryLive, type Order,
} from '@pehra/perpl'

// guard kinds: warn, add, added, failed, session. the user's own actions: opened, closed, bracket, manual
// (a margin add), and funded / withdrew which the phone reports after its own agora batch.
// margin adds carry the position before and after, and anything that settled on chain its tx.
export type Snapshot = { distancePct: number; collateral: number }
export type GuardEvent = {
  at: number; pid?: number; symbol?: string
  kind: 'watch' | 'warn' | 'add' | 'added' | 'failed' | 'session' | 'opened' | 'closed' | 'bracket' | 'manual' | 'funded' | 'withdrew'
  text: string; distancePct?: number; addAusd?: number; price?: number; amount?: number; pnl?: number
  side?: string; lv?: number; before?: Snapshot; after?: Snapshot; tx?: string
  // which rule acted, for alerts: the hidden stop, its backstop or a take profit step firing on perpl, the
  // guard adding margin, or the stop holding at its floor
  rule?: 'stop' | 'backstop' | 'step' | 'guard' | 'floor' | 'entry' | 'funding' | 'sl' | 'tp' | 'move' | 'notify' | 'copy'
}
type Stored = { address: Hex; key: Enrolled; settings: GuardSettings; enrolledAt: number }

const KEYS = new URL('../data/guard-keys.json', import.meta.url)
const EVENTS = new URL('../data/guard-events.json', import.meta.url)
const COOLDOWN_MS = 60_000
const DAY_MS = 24 * 3600_000

export class Guard {
  private stored = new Map<string, Stored>()
  private sessions = new Map<string, TradingSocket>()
  private events = new Map<string, GuardEvent[]>()
  private lastAdd = new Map<number, number>()
  private market: MarketDataSocket
  private ctx: Context | null = null
  private log: (s: string) => void
  engine: Engine
  recorder: Recorder
  alerts: Alerts
  reconnects = 0

  constructor(log: (s: string) => void = console.log) {
    this.log = log
    this.market = new MarketDataSocket('testnet')
    this.recorder = new Recorder(this.market, () => this.ctx)
    this.engine = new Engine({
      market: this.market,
      ctx: () => this.ctx,
      session: a => this.sessions.get(a.toLowerCase()) ?? null,
      emit: (a, e) => this.emit(a.toLowerCase(), e),
      nextTx: ts => this.nextTxAt(ts),
      book: mkt => this.recorder.books.get(mkt),
      history: async a => { const rec = this.stored.get(a.toLowerCase()); if (!rec) return []; return (await restOrderHistory({ apiKey: rec.key.apiKey, secret: rec.key.secret })).d },
      log,
    })
    this.alerts = new Alerts({
      log,
      owners: () => [...this.stored.keys()],
      positions: a => this.health(a).map(h => ({ pid: h.pid, symbol: h.symbol, side: h.side, distance: h.distance, mkt: h.mkt })),
      guard: a => { const st = this.stored.get(a)?.settings; return st ? { enabled: st.enabled, thresholdPct: st.thresholdPct } : null },
    })
    if (existsSync(KEYS)) for (const s of JSON.parse(readFileSync(KEYS, 'utf8')) as Stored[]) this.stored.set(s.address.toLowerCase(), s)
    if (existsSync(EVENTS)) for (const [a, list] of Object.entries(JSON.parse(readFileSync(EVENTS, 'utf8')) as Record<string, GuardEvent[]>)) this.events.set(a, list.filter(e => e.kind !== 'session'))
  }
  private eventsTimer: ReturnType<typeof setTimeout> | null = null
  private persistEvents() {
    if (this.eventsTimer) return
    this.eventsTimer = setTimeout(() => { this.eventsTimer = null; writeAtomic(EVENTS, JSON.stringify(Object.fromEntries(this.events))) }, 1000)
  }

  async start() {
    this.ctx = await getContext('testnet')
    const s = MarketDataSocket.streams(10143)
    await this.market.connect([s.heartbeat, s.marketState])
    this.engine.load()
    this.recorder.start(this.ctx.markets.filter(m => m.config.is_open).map(m => m.id))
    this.market.on(f => {
      if (f.mt !== 9) return
      for (const addr of this.sessions.keys()) this.evaluate(addr)
      for (const id of Object.keys((f as MarketStateFrame).d)) this.engine.tick(Number(id))
    })
    for (const addr of this.stored.keys()) void this.open(addr)
    setInterval(() => { for (const addr of this.sessions.keys()) this.engine.reconcile(addr) }, 30_000)
    this.log(`guard watching ${this.stored.size} accounts`)
  }

  // the minute beat's view of the guard and the engine
  beat() {
    const r = this.reconnects
    this.reconnects = 0
    const ev = this.engine.evaluations
    this.engine.evaluations = 0
    return { evaluations: ev, accounts: this.stored.size, live: this.sessions.size, reconnects: r, lastTickAgoMs: this.engine.lastTickAt ? Date.now() - this.engine.lastTickAt : null, rules: this.engine.active() }
  }

  private addedTodayOf(addr: string) { return addedToday(addr) }

  accounts() { return [...this.stored.values()].map(s => ({ address: s.address, settings: s.settings, enrolledAt: s.enrolledAt, live: this.sessions.has(s.address.toLowerCase()) })) }
  has(address: string) { return this.stored.has(address.toLowerCase()) }
  settings(address: string) { return this.stored.get(address.toLowerCase())?.settings ?? null }

  register(address: Hex, key: Enrolled, settings: GuardSettings = defaultGuardSettings) {
    const rec: Stored = { address, key, settings, enrolledAt: Date.now() }
    this.stored.set(address.toLowerCase(), rec)
    this.persist()
    return this.open(address.toLowerCase())
  }

  // the user takes the key back: the session closes and the stored key is gone. the phone has already
  // turned order forwarding off onchain, so perpl refuses the key even if a copy survived somewhere
  revoke(address: string) {
    const addr = address.toLowerCase()
    const rec = this.stored.get(addr)
    if (!rec) return false
    this.stored.delete(addr)
    this.persist()
    const ts = this.sessions.get(addr)
    this.sessions.delete(addr)
    ts?.close()
    this.lastHealth.delete(addr)
    this.emit(addr, { kind: 'session', text: 'the user revoked the watch key' })
    return true
  }

  enrolledAt(address: string) { return this.stored.get(address.toLowerCase())?.enrolledAt ?? null }

  updateSettings(address: string, patch: Partial<GuardSettings>) {
    const rec = this.stored.get(address.toLowerCase())
    if (!rec) throw new Error('not enrolled')
    rec.settings = { ...rec.settings, ...patch }
    this.persist()
    this.engine.syncGuard(address.toLowerCase(), rec.settings)
    this.evaluate(address.toLowerCase())
    return rec.settings
  }

  private persist() { writeAtomic(KEYS, JSON.stringify([...this.stored.values()], null, 2)) }

  private emit(addr: string, e: Omit<GuardEvent, 'at'>) {
    // reconnects happen every minute or so (perpl's ping timeout), they go to the log, not the history
    if (e.kind !== 'session') {
      const list = this.events.get(addr) ?? []
      list.unshift({ at: Date.now(), ...e })
      this.events.set(addr, list.slice(0, 200))
      this.persistEvents()
    }
    this.log(`guard ${addr.slice(0, 8)} ${e.kind} ${e.text}`)
    // what reaches the phone is decided in alerts.ts, close to liquidation comes from evaluate()
    this.alerts.event(addr, e)
  }

  // a plain stop or take profit the phone set (not a rule's) fired on perpl. the frame lands before the
  // socket applies it, so the orders known now are the ones from before, and the close fill that shows up
  // after is the trigger's child
  private firedSeen = new Set<number>()
  private bracketFired(addr: string, ts: TradingSocket, frame: Order[]) {
    const known = new Set(ts.orders.keys())
    for (const o of frame) {
      if (o.st !== 10 || !o.lp || !o.tp || this.firedSeen.has(o.oid) || this.engine.owns(o.oid)) continue
      this.firedSeen.add(o.oid)
      const pos = ts.positions.get(o.lp)
      const m = this.ctx?.markets.find(x => x.id === o.mkt)
      if (!m) continue
      const below = o.tpc === Trigger.lteLast || o.tpc === Trigger.lteMark
      const long = pos ? pos.sd === 1 : o.t === OrderType.closeLong
      const isStop = long ? below : !below
      setTimeout(() => {
        const child = [...ts.orders.values()].find(c => !known.has(c.oid) && c.oid !== o.oid && c.lp === o.lp && (c.t === OrderType.closeLong || c.t === OrderType.closeShort) && (c.fs ?? 0) > 0)
        const price = child?.fp ? fromPrice(m, child.fp) : fromPrice(m, o.tp ?? 0)
        const size = child?.fs ? fromSize(m, child.fs) : pos ? fromSize(m, pos.s) : undefined
        const side = long ? 'long' : 'short'
        this.emit(addr, { kind: 'closed', rule: isStop ? 'sl' : 'tp', pid: o.lp, symbol: m.symbol, side, price, amount: size, text: `your ${isStop ? 'stop' : 'take profit'} at ${fromPrice(m, o.tp ?? 0)} fired on perpl, sold ${size ?? ''} ${m.symbol} at ${price}` })
      }, 2500)
    }
  }

  // the phone's own chain actions (agora funds and withdrawals) join the same history
  record(address: string, e: Omit<GuardEvent, 'at'>) { this.emit(address.toLowerCase(), e) }

  recent(address: string, n = 50) { return (this.events.get(address.toLowerCase()) ?? []).slice(0, n) }

  session(address: string) { return this.sessions.get(address.toLowerCase()) ?? null }

  private async open(addr: string, attempt = 0): Promise<TradingSocket> {
    const rec = this.stored.get(addr)
    if (!rec) throw new Error('not enrolled')
    // a session that signed in starts its backoff again from zero, only failed sign ins grow it
    let signedIn = false
    const ts = new TradingSocket({ net: 'testnet', apiKey: rec.key.apiKey, secret: rec.key.secret, onClose: (code, reason) => {
      if (this.sessions.get(addr) === ts) this.sessions.delete(addr)
      this.reconnects++
      const next = signedIn ? 0 : attempt + 1
      const wait = signedIn ? 0 : Math.min(1000 * 2 ** attempt, 30_000)
      this.emit(addr, { kind: 'session', text: `closed ${code} ${reason}, reopening in ${wait}ms` })
      if (this.stored.has(addr)) setTimeout(() => { if (!this.sessions.has(addr)) void this.open(addr, next).catch(() => {}) }, wait)
    } })
    ts.onFrame(f => {
      // a trigger perpl executed (st 10) is recorded soon rather than at the next 30s reconcile
      if (f.mt === 24 && (f as { d: { st: number }[] }).d.some(o => o.st === 10)) {
        setTimeout(() => this.engine.reconcile(addr), 1500)
        this.bracketFired(addr, ts, (f as { d: Order[] }).d)
      }
      if (f.mt !== 26 && f.mt !== 27) return
      // listeners run before the socket applies the frame to its maps, so read them a tick later
      setTimeout(() => {
        this.evaluate(addr)
        // a new position gets its guard rule, a closed one lets its rules finish
        const rec = this.stored.get(addr)
        if (rec) this.engine.syncGuard(addr, rec.settings)
      }, 0)
    })
    await ts.connect()
    signedIn = true
    this.sessions.set(addr, ts)
    // what a drop or a restart left unknown is settled before any rule on this account acts again
    this.engine.reconcile(addr)
    this.engine.syncGuard(addr, rec.settings)
    this.emit(addr, { kind: 'session', text: `signed in, account ${ts.account?.id}, ${ts.positions.size} positions, ${fromCns(ts.account?.b ?? '0')} AUSD` })
    this.evaluate(addr)
    return ts
  }

  // each position with its health and the stop and take profit resting on it (untriggered, st 8)
  // the last health and balance seen per account, served while perpl's session reconnects (it drops
  // with a ping timeout about once a minute) so the phone never falls back to an empty account
  private lastHealth = new Map<string, (Health & { symbol: string; lv: number; mkt: number; stop?: number; take?: number })[]>()
  private lastBalance = new Map<string, number>()
  balance(address: string) {
    const addr = address.toLowerCase()
    const ts = this.sessions.get(addr)
    if (ts?.account) this.lastBalance.set(addr, fromCns(ts.account.b))
    return this.lastBalance.get(addr) ?? null
  }

  health(address: string): (Health & { symbol: string; lv: number; mkt: number; stop?: number; take?: number })[] {
    const addr = address.toLowerCase()
    const ts = this.sessions.get(addr)
    if (!ts || !this.ctx) return this.lastHealth.get(addr) ?? []
    const out: (Health & { symbol: string; lv: number; mkt: number; stop?: number; take?: number })[] = []
    for (const pos of ts.positions.values()) {
      const m = this.ctx.markets.find(x => x.id === pos.mkt)
      const state = this.market.states.get(pos.mkt)
      if (!m || !state) continue
      let stop: number | undefined, take: number | undefined
      for (const o of ts.orders.values()) {
        if (o.lp !== pos.pid || o.st !== 8 || !o.tp) continue
        const below = o.tpc === Trigger.lteLast || o.tpc === Trigger.lteMark
        const isStop = pos.sd === 1 ? below : !below
        if (isStop) stop = fromPrice(m, o.tp); else take = fromPrice(m, o.tp)
      }
      out.push({ ...positionHealth(pos, m, state.mrk), symbol: m.symbol, lv: pos.lv, mkt: pos.mkt, stop, take })
    }
    this.lastHealth.set(addr, out)
    return out
  }

  // the guard's own loop only warns now: close to liquidation with the guard off, or with the day's budget
  // spent. margin adds are the engine's, one guard rule per position (engine.syncGuard)
  private evaluate(addr: string) {
    const rec = this.stored.get(addr)
    const ts = this.sessions.get(addr)
    if (!rec || !ts || !this.ctx) return
    this.alerts.health(addr)
    for (const pos of ts.positions.values()) {
      const m = this.ctx.markets.find(x => x.id === pos.mkt)
      const state = this.market.states.get(pos.mkt)
      if (!m || !state) continue
      const h = positionHealth(pos, m, state.mrk)
      const d = decide(h, rec.settings, m, fromCns(ts.account?.b ?? '0'), this.addedTodayOf(addr))
      if (d.action !== 'warn') continue
      const last = this.lastAdd.get(pos.pid) ?? 0
      if (Date.now() - last < COOLDOWN_MS) continue
      this.lastAdd.set(pos.pid, Date.now())
      this.emit(addr, { kind: 'warn', pid: pos.pid, symbol: m.symbol, text: `${m.symbol} ${h.side} ${(h.distance * 100).toFixed(2)}% from liquidation, ${d.reason}`, distancePct: h.distance * 100 })
    }
  }

  marketOf(mkt: number) { return this.ctx?.markets.find(m => m.id === mkt) }
  openMarkets() { return this.ctx?.markets.filter(m => m.config.is_open) ?? [] }

  // side, size and leverage of a live position, what replay opens at the start of its window
  startOf(address: string, pid: number): { side: 'long' | 'short'; size: number; leverage: number } | null {
    const ts = this.sessions.get(address.toLowerCase())
    const pos = ts?.positions.get(pid)
    const m = pos ? this.marketOf(pos.mkt) : undefined
    if (!pos || !m) return null
    return { side: pos.sd === 1 ? 'long' : 'short', size: fromSize(m, pos.s), leverage: pos.lv / 100 }
  }

  // whether perpl accepts orders forwarded for this account (Account.fw). the escape hatch and revoke turn it
  // off from the owner's key, and the guard's key is refused from then on, so the app shows what perpl says
  private fwCache = new Map<string, { at: number; fw: boolean }>()
  async forwarding(address: string): Promise<boolean | null> {
    const addr = address.toLowerCase()
    const hit = this.fwCache.get(addr)
    if (hit && Date.now() - hit.at < 10_000) return hit.fw
    const rec = this.stored.get(addr)
    if (!rec) return null
    try {
      const w = await restWallet({ apiKey: rec.key.apiKey, secret: rec.key.secret })
      const fw = w.as[0]?.fw ?? null
      if (fw !== null) this.fwCache.set(addr, { at: Date.now(), fw })
      return fw
    } catch { return hit?.fw ?? null }
  }

  forgetForwarding(address: string) { this.fwCache.delete(address.toLowerCase()) }

  // the market's symbol as the app shows it, part of what the owner signs
  symbolOf(mkt: number) { return this.ctx?.markets.find(m => m.id === mkt)?.symbol ?? `market ${mkt}` }

  // what a new rule is checked against: the position at the current mark, and how many triggers already
  // rest on the whole account (perpl's cap is per account)
  // what an entry is checked against: the market now, free ausd and the perpl orders already resting
  entryLive(address: string, mkt: number): EntryLive | null {
    const ts = this.sessions.get(address.toLowerCase())
    const m = this.ctx?.markets.find(x => x.id === mkt)
    const mark = this.market.states.get(mkt)?.mrk
    if (!ts?.account || !m || mark === undefined) return null
    return { mark: fromPrice(m, mark), balance: fromCns(ts.account.b), maxLeverage: maxLeverage(m), maintenance: m.config.maintenance_margin, resting: [...ts.orders.values()].filter(o => o.st === 8).length }
  }

  live(address: string, pid: number, mkt: number): Live | null {
    const ts = this.sessions.get(address.toLowerCase())
    const m = this.ctx?.markets.find(x => x.id === mkt)
    const mark = this.market.states.get(mkt)?.mrk
    const pos = ts?.positions.get(pid)
    if (!ts || !m || mark === undefined || !pos || pos.mkt !== mkt) return null
    const h = positionHealth(pos, m, mark)
    const resting = [...ts.orders.values()].filter(o => o.st === 8).length
    return { mark: h.mark, side: h.side, size: h.size, entry: h.entry, resting }
  }

  // the phone's own orders ride the same session
  // perpl drops a session about once a minute (its ping timeout) and it is back within a second or two.
  // a tap that lands in that gap waits for it instead of failing
  private async liveSession(address: string, ms = 6000): Promise<TradingSocket> {
    const addr = address.toLowerCase()
    for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise(r => setTimeout(r, 200))) {
      const ts = this.sessions.get(addr)
      if (ts?.account && this.ctx) return ts
    }
    throw new Error('no live session')
  }

  async openMarket(address: string, symbol: string, side: 'long' | 'short', size: number, leverage: number) {
    const ts = await this.liveSession(address)
    if (!this.ctx) throw new Error('no live session')
    const m = this.ctx.markets.find(x => x.symbol === symbol)
    if (!m) throw new Error('no market ' + symbol)
    // size arrives in coins, perpl wants it scaled by the market's size decimals
    const txP = this.nextTx(ts)
    const result = await ts.openMarket({ mkt: m.id, side, size: toSize(m, size), leverage: toLeverage(leverage) })
    const o = result.order
    if (o?.st === 4) void txP.then(tx => this.emit(address.toLowerCase(), { kind: 'opened', pid: result.position?.pid, symbol: m.symbol, side, lv: leverage * 100, tx, amount: fromSize(m, o.fs ?? 0), price: fromPrice(m, o.fp ?? 0), text: `${side} ${fromSize(m, o.fs ?? 0)} ${m.symbol} at ${leverage}x, filled at ${fromPrice(m, o.fp ?? 0)}` }))
    return { market: m, result }
  }

  // perpl's account update after a settled action lists the chain event with its txid. the first one
  // with a txid after the call is the proof for that action
  private nextTx(ts: TradingSocket, ms = 4000): Promise<string | undefined> {
    return this.nextTxAt(ts, ms).then(r => r?.tx)
  }

  // the same with the block the event landed in, for the proof's settle block
  nextTxAt(ts: TradingSocket, ms = 4000): Promise<{ tx: string; block?: number } | undefined> {
    return new Promise(resolve => {
      const timer = setTimeout(() => { off(); resolve(undefined) }, ms)
      const off = ts.onFrame(f => {
        if (f.mt !== 21) return
        const e = (f as AccountUpdateFrame).h?.find(x => x.at?.txid ?? x.txid)
        const id = e?.at?.txid ?? e?.txid
        if (!id) return
        clearTimeout(timer); off()
        resolve({ tx: id.startsWith('0x') ? id : '0x' + id, block: e?.at?.b })
      })
    })
  }

  private async pos(address: string, pid: number) {
    const ts = await this.liveSession(address)
    if (!this.ctx) throw new Error('no live session')
    const pos = ts.positions.get(pid)
    if (!pos) throw new Error('no such position')
    const m = this.ctx.markets.find(x => x.id === pos.mkt)
    if (!m) throw new Error('no market')
    return { ts, pos, m }
  }

  async closePosition(address: string, pid: number) {
    const { ts, pos, m } = await this.pos(address, pid)
    const entry = fromPrice(m, pos.ep), size = fromSize(m, pos.s), side = pos.sd === 1 ? 'long' : 'short'
    const txP = this.nextTx(ts)
    const r = await ts.closeMarket(pos)
    const o = r.order
    if (o?.st !== 4) throw new Error('close did not fill, status ' + (o?.st ?? r.status?.status.code))
    const exit = fromPrice(m, o.fp ?? 0)
    const pnl = (side === 'long' ? 1 : -1) * (exit - entry) * size
    void txP.then(tx => this.emit(address.toLowerCase(), { kind: 'closed', pid, symbol: m.symbol, side, lv: pos.lv, tx, amount: size, pnl, price: exit, text: `closed ${side} ${size} ${m.symbol} at ${exit}, ${pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)} AUSD` }))
    return { price: exit, pnl, collateral: fromCns(pos.c) }
  }

  // stop and take profit in human prices. perpl will not cancel a resting trigger yet, so these are set once
  async setBrackets(address: string, pid: number, b: { stop?: number; take?: number }) {
    const { ts, pos, m } = await this.pos(address, pid)
    const out: { stop?: number; take?: number } = {}
    if (b.stop) { const r = await ts.stopLoss(pos, toPrice(m, b.stop)); if (r.order && r.order.st !== 7) out.stop = b.stop }
    if (b.take) { const r = await ts.takeProfit(pos, toPrice(m, b.take)); if (r.order && r.order.st !== 7) out.take = b.take }
    const parts = [out.stop ? `stop at ${out.stop}` : '', out.take ? `take profit at ${out.take}` : ''].filter(Boolean).join(', ')
    if (parts) this.emit(address.toLowerCase(), { kind: 'bracket', pid, symbol: m.symbol, text: `${m.symbol}: ${parts}` })
    return out
  }

  // a manual add from the phone, the push's "add" action lands here
  async addMargin(address: string, pid: number, ausd: number) {
    const ts = await this.liveSession(address)
    if (!this.ctx) throw new Error('no live session')
    const pos = ts.positions.get(pid)
    if (!pos) throw new Error('no such position')
    const m = this.ctx.markets.find(x => x.id === pos.mkt)
    if (!m) throw new Error('no market')
    const mark = this.market.states.get(pos.mkt)?.mrk ?? pos.ep
    const before = positionHealth(pos, m, mark)
    const txP = this.nextTx(ts)
    const r = await ts.addMargin(pos, toCns(ausd))
    const after = r.position ? positionHealth(r.position, m, this.market.states.get(pos.mkt)?.mrk ?? pos.ep) : null
    const tx = await txP
    this.emit(address.toLowerCase(), { kind: 'manual', pid, symbol: m.symbol, side: before.side, lv: pos.lv, tx, before: { distancePct: before.distance * 100, collateral: before.collateral }, after: after ? { distancePct: after.distance * 100, collateral: after.collateral } : undefined, text: `you added ${ausd.toFixed(2)} AUSD, collateral now ${after ? after.collateral.toFixed(4) : '?'} AUSD, ${after ? (after.distance * 100).toFixed(2) : '?'}% from liquidation`, addAusd: ausd, distancePct: after ? after.distance * 100 : undefined })
    return after
  }

  async closeAll(address: string) {
    const ts = await this.liveSession(address)
    const out = []
    for (const pos of [...ts.positions.values()]) out.push(await ts.closeMarket(pos))
    return out
  }
}
