// the guard: one server side trading session per delegated account, every position checked against
// the mark on every update, margin added before the venue can liquidate. keys live in data/guard-keys.json
// for now, events in memory. the same session relays the phone's own orders.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Hex } from 'viem'
import { sendPush } from './push'
import {
  decide, defaultGuardSettings, getContext, MarketDataSocket, positionHealth, TradingSocket, fromCns, toCns, toLeverage, toSize,
  type Context, type Decision, type Enrolled, type GuardSettings, type Health, type Market, type Position,
} from '@pehra/perpl'

export type GuardEvent = { at: number; pid?: number; kind: 'watch' | 'warn' | 'add' | 'added' | 'failed' | 'session'; text: string; distancePct?: number; addAusd?: number }
type Stored = { address: Hex; key: Enrolled; settings: GuardSettings; enrolledAt: number }

const KEYS = new URL('../data/guard-keys.json', import.meta.url)
const COOLDOWN_MS = 60_000
const DAY_MS = 24 * 3600_000

export class Guard {
  private stored = new Map<string, Stored>()
  private sessions = new Map<string, TradingSocket>()
  private events = new Map<string, GuardEvent[]>()
  private lastAdd = new Map<number, number>()
  private addedToday = new Map<string, { day: number; ausd: number }>()
  private market: MarketDataSocket
  private ctx: Context | null = null
  private log: (s: string) => void

  constructor(log: (s: string) => void = console.log) {
    this.log = log
    this.market = new MarketDataSocket('testnet')
    if (existsSync(KEYS)) for (const s of JSON.parse(readFileSync(KEYS, 'utf8')) as Stored[]) this.stored.set(s.address.toLowerCase(), s)
  }

  async start() {
    this.ctx = await getContext('testnet')
    const s = MarketDataSocket.streams(10143)
    await this.market.connect([s.heartbeat, s.marketState])
    this.market.on(f => { if (f.mt === 9) for (const addr of this.sessions.keys()) this.evaluate(addr) })
    for (const addr of this.stored.keys()) void this.open(addr)
    this.log(`guard watching ${this.stored.size} accounts`)
  }

  accounts() { return [...this.stored.values()].map(s => ({ address: s.address, settings: s.settings, enrolledAt: s.enrolledAt, live: this.sessions.has(s.address.toLowerCase()) })) }
  has(address: string) { return this.stored.has(address.toLowerCase()) }
  settings(address: string) { return this.stored.get(address.toLowerCase())?.settings ?? null }

  register(address: Hex, key: Enrolled, settings: GuardSettings = defaultGuardSettings) {
    const rec: Stored = { address, key, settings, enrolledAt: Date.now() }
    this.stored.set(address.toLowerCase(), rec)
    this.persist()
    return this.open(address.toLowerCase())
  }

  updateSettings(address: string, patch: Partial<GuardSettings>) {
    const rec = this.stored.get(address.toLowerCase())
    if (!rec) throw new Error('not enrolled')
    rec.settings = { ...rec.settings, ...patch }
    this.persist()
    this.evaluate(address.toLowerCase())
    return rec.settings
  }

  private persist() { writeFileSync(KEYS, JSON.stringify([...this.stored.values()], null, 2)) }

  private emit(addr: string, e: Omit<GuardEvent, 'at'>) {
    const list = this.events.get(addr) ?? []
    list.unshift({ at: Date.now(), ...e })
    this.events.set(addr, list.slice(0, 200))
    this.log(`guard ${addr.slice(0, 8)} ${e.kind} ${e.text}`)
    // the phone hears about warnings and margin adds, sessions and attempts stay in the log
    if (e.kind === 'warn') void sendPush(addr, 'pehra: close to liquidation', e.text, { kind: e.kind, pid: String(e.pid ?? ''), action: 'add' })
    if (e.kind === 'added') void sendPush(addr, 'pehra added margin', e.text, { kind: e.kind, pid: String(e.pid ?? '') })
    if (e.kind === 'failed') void sendPush(addr, 'pehra could not add margin', e.text, { kind: e.kind, pid: String(e.pid ?? ''), action: 'add' })
  }

  recent(address: string, n = 50) { return (this.events.get(address.toLowerCase()) ?? []).slice(0, n) }

  session(address: string) { return this.sessions.get(address.toLowerCase()) ?? null }

  private async open(addr: string, attempt = 0): Promise<TradingSocket> {
    const rec = this.stored.get(addr)
    if (!rec) throw new Error('not enrolled')
    const ts = new TradingSocket({ net: 'testnet', apiKey: rec.key.apiKey, secret: rec.key.secret, onClose: (code, reason) => {
      if (this.sessions.get(addr) === ts) this.sessions.delete(addr)
      this.emit(addr, { kind: 'session', text: `closed ${code} ${reason}, reopening` })
      if (this.stored.has(addr)) setTimeout(() => { if (!this.sessions.has(addr)) void this.open(addr, attempt + 1).catch(() => {}) }, Math.min(1000 * 2 ** attempt, 30_000))
    } })
    ts.onFrame(f => { if (f.mt === 26 || f.mt === 27) this.evaluate(addr) })
    await ts.connect()
    this.sessions.set(addr, ts)
    this.emit(addr, { kind: 'session', text: `signed in, account ${ts.account?.id}, ${ts.positions.size} positions, ${fromCns(ts.account?.b ?? '0')} AUSD` })
    this.evaluate(addr)
    return ts
  }

  // the whole guard is this function, run on every position update and every mark tick
  health(address: string): (Health & { symbol: string; lv: number; mkt: number })[] {
    const addr = address.toLowerCase()
    const ts = this.sessions.get(addr)
    if (!ts || !this.ctx) return []
    const out: (Health & { symbol: string; lv: number; mkt: number })[] = []
    for (const pos of ts.positions.values()) {
      const m = this.ctx.markets.find(x => x.id === pos.mkt)
      const state = this.market.states.get(pos.mkt)
      if (m && state) out.push({ ...positionHealth(pos, m, state.mrk), symbol: m.symbol, lv: pos.lv, mkt: pos.mkt })
    }
    return out
  }

  private evaluate(addr: string) {
    const rec = this.stored.get(addr)
    const ts = this.sessions.get(addr)
    if (!rec || !ts || !this.ctx) return
    for (const pos of ts.positions.values()) {
      const m = this.ctx.markets.find(x => x.id === pos.mkt)
      const state = this.market.states.get(pos.mkt)
      if (!m || !state) continue
      const h = positionHealth(pos, m, state.mrk)
      const today = this.addedToday.get(addr)
      const day = Math.floor(Date.now() / DAY_MS)
      const addedToday = today && today.day === day ? today.ausd : 0
      const d = decide(h, rec.settings, m, fromCns(ts.account?.b ?? '0'), addedToday)
      if (d.action === 'none') continue
      const last = this.lastAdd.get(pos.pid) ?? 0
      if (Date.now() - last < COOLDOWN_MS) continue
      this.lastAdd.set(pos.pid, Date.now())
      if (d.action === 'warn') { this.emit(addr, { kind: 'warn', pid: pos.pid, text: `${m.symbol} ${h.side} ${(h.distance * 100).toFixed(2)}% from liquidation, ${d.reason}`, distancePct: h.distance * 100 }); continue }
      void this.act(addr, ts, pos, m, d, day, addedToday)
    }
  }

  private async act(addr: string, ts: TradingSocket, pos: Position, m: Market, d: Decision, day: number, addedToday: number) {
    const ausd = fromCns(d.addCns ?? '0')
    this.emit(addr, { kind: 'add', pid: pos.pid, text: `${m.symbol} ${d.health.side} ${(d.health.distance * 100).toFixed(2)}% from liquidation, adding ${ausd.toFixed(2)} AUSD`, distancePct: d.health.distance * 100, addAusd: ausd })
    try {
      const r = await ts.addMargin(pos, d.addCns ?? '0')
      const after = r.position ? positionHealth(r.position, m, this.market.states.get(pos.mkt)?.mrk ?? pos.ep) : null
      this.addedToday.set(addr, { day, ausd: addedToday + ausd })
      this.emit(addr, { kind: 'added', pid: pos.pid, text: `collateral now ${after ? after.collateral.toFixed(4) : '?'} AUSD, ${after ? (after.distance * 100).toFixed(2) : '?'}% from liquidation`, distancePct: after ? after.distance * 100 : undefined, addAusd: ausd })
    } catch (e) {
      this.emit(addr, { kind: 'failed', pid: pos.pid, text: `margin add failed: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // the phone's own orders ride the same session
  async openMarket(address: string, symbol: string, side: 'long' | 'short', size: number, leverage: number) {
    const ts = this.sessions.get(address.toLowerCase())
    if (!ts || !this.ctx) throw new Error('no live session')
    const m = this.ctx.markets.find(x => x.symbol === symbol)
    if (!m) throw new Error('no market ' + symbol)
    // size arrives in coins, perpl wants it scaled by the market's size decimals
    return { market: m, result: await ts.openMarket({ mkt: m.id, side, size: toSize(m, size), leverage: toLeverage(leverage) }) }
  }

  // a manual add from the phone, the push's "add" action lands here
  async addMargin(address: string, pid: number, ausd: number) {
    const ts = this.sessions.get(address.toLowerCase())
    if (!ts || !this.ctx) throw new Error('no live session')
    const pos = ts.positions.get(pid)
    if (!pos) throw new Error('no such position')
    const m = this.ctx.markets.find(x => x.id === pos.mkt)
    if (!m) throw new Error('no market')
    const r = await ts.addMargin(pos, toCns(ausd))
    const after = r.position ? positionHealth(r.position, m, this.market.states.get(pos.mkt)?.mrk ?? pos.ep) : null
    this.emit(address.toLowerCase(), { kind: 'added', pid, text: `you added ${ausd.toFixed(2)} AUSD, collateral now ${after ? after.collateral.toFixed(4) : '?'} AUSD, ${after ? (after.distance * 100).toFixed(2) : '?'}% from liquidation`, addAusd: ausd, distancePct: after ? after.distance * 100 : undefined })
    return after
  }

  async closeAll(address: string) {
    const ts = this.sessions.get(address.toLowerCase())
    if (!ts) throw new Error('no live session')
    const out = []
    for (const pos of [...ts.positions.values()]) out.push(await ts.closeMarket(pos))
    return out
  }
}
