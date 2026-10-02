// the rules engine. rules live in sqlite, each is evaluated with step() on every mark update for its
// market, and what step() asks for is carried out through one send queue per account. every state change
// and every result is a run row (runs.ts). a session that is reconnecting defers its rules, it never acts
// on a position map it cannot trust.
import { Rule, step, modeOf, positionHealth, toCns, fromCns, type Context, type GuardSettings, type Market, type MarketDataSocket, type Mem, type Position, type RuleState, type Tick, type TradingSocket, type Intent } from '@pehra/perpl'
import { db } from './db'
import { writeRun } from './runs'
import { move } from './state'
import { openIntent, settle, unsettled, sentAs } from './intents'
import type { GuardEvent } from './guard'

export type Stored = {
  id: string; owner: string; rule: Rule; state: RuleState; mode: string; by: 'app' | 'ai' | 'dev'
  mem: Mem; fires: number; created: number; updated: number
}
type Row = { id: string; owner: string; kind: string; body: string; state: RuleState; mode: string; by: string; mem: string; fires: number; created: number; updated: number }

export type EngineDeps = {
  market: MarketDataSocket
  ctx: () => Context | null
  session: (address: string) => TradingSocket | null
  addedToday: (address: string) => number
  onAdded: (address: string, ausd: number) => void
  emit: (address: string, e: Omit<GuardEvent, 'at'>) => void
  nextTx: (ts: TradingSocket) => Promise<{ tx: string; block?: number } | undefined>
  log: (s: string) => void
}

type Snap = { distancePct: number; collateral: number }

const ACTIVE: RuleState[] = ['armed', 'firing', 'working', 'held', 'paused']

const q = {
  active: db.prepare(`select * from rules where state in ('armed','firing','working','held','paused')`),
  insert: db.prepare('insert into rules (id, owner, kind, body, state, mode, by, sig, created, updated, fires, mem) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'),
  byOwner: db.prepare('select * from rules where owner = ? order by created desc limit 100'),
  saveMem: db.prepare('update rules set mem = ?, updated = ? where id = ?'),
  fired: db.prepare('update rules set fires = fires + 1, updated = ? where id = ?'),
  lastRun: db.prepare('select at from runs where rule = ? and kind != ? order by seq desc limit 1'),
  exists: db.prepare('select 1 from rules where id = ?'),
  saveBody: db.prepare('update rules set body = ?, updated = ? where id = ?'),
}

// a crash at a named point, for the crash test only (DEBUG_CRASH_AT=sent)
function crashAt(point: string) {
  if (process.env.DEBUG_CRASH_AT === point) { console.log(`DEBUG_CRASH_AT=${point}, exiting`); process.exit(1) }
}

function fromRow(r: Row): Stored {
  return { id: r.id, owner: r.owner, rule: Rule.parse(JSON.parse(r.body)), state: r.state, mode: r.mode, by: r.by as Stored['by'], mem: JSON.parse(r.mem) as Mem, fires: r.fires, created: r.created, updated: r.updated }
}

export class Engine {
  private rules = new Map<string, Stored>()
  private busy = new Set<number>()
  private dirty = new Set<number>()
  private lanes = new Map<string, Promise<unknown>>()
  private lastBlock = new Map<number, number>()
  // rules waiting on a reconnecting session, one deferred run each until it is back
  private deferred = new Set<string>()
  // intents on the wire right now. reconcile leaves them and their rules alone, the answer is coming
  private inflight = new Map<string, string>()
  evaluations = 0
  lastTickAt = 0

  constructor(private deps: EngineDeps) {}

  load() {
    for (const r of q.active.all() as Row[]) {
      try { const s = fromRow(r); this.rules.set(s.id, s) } catch (e) { this.deps.log(`rule ${r.id} did not parse, left alone: ${e instanceof Error ? e.message : e}`) }
    }
    this.deps.log(`engine loaded ${this.rules.size} active rules`)
  }

  // a new rule, already validated by the caller, armed straight away unless it is a draft
  add(owner: string, rule: Rule, by: Stored['by'], state: 'armed' | 'draft' | 'paused' = 'armed', sig: string | null = null): Stored {
    const now = Date.now()
    const s: Stored = { id: rule.id, owner: owner.toLowerCase(), rule, state, mode: modeOf(rule), by, mem: {}, fires: 0, created: now, updated: now }
    q.insert.run(s.id, s.owner, rule.kind, JSON.stringify(rule), state, s.mode, by, sig, now, now, '{}')
    writeRun({ owner: s.owner, rule: s.id, kind: 'state', body: { from: null, to: state, why: `created by ${by}`, rule } })
    if (ACTIVE.includes(state)) this.rules.set(s.id, s)
    return s
  }

  active() { return this.rules.size }

  exists(id: string) { return q.exists.get(id) !== undefined }

  list(owner: string) {
    return (q.byOwner.all(owner.toLowerCase()) as Row[]).map(r => {
      const s = this.rules.get(r.id) ?? fromRow(r)
      const last = q.lastRun.get(r.id, 'state') as { at: number } | undefined
      return { id: s.id, kind: s.rule.kind, state: s.state, mode: s.mode, by: s.by, fires: s.fires, rule: s.rule, lastRun: last?.at ?? null, created: s.created }
    })
  }

  // called on every market state frame for a market. the newest mark wins: if the market is already being
  // evaluated it is marked dirty and evaluated once more afterwards, nothing queues up behind it
  tick(mkt: number) {
    this.lastTickAt = Date.now()
    if (this.busy.has(mkt)) { this.dirty.add(mkt); return }
    this.busy.add(mkt)
    try { this.evaluateMarket(mkt) } finally {
      this.busy.delete(mkt)
      if (this.dirty.delete(mkt)) this.tick(mkt)
    }
  }

  private evaluateMarket(mkt: number) {
    const state = this.deps.market.states.get(mkt)
    const ctx = this.deps.ctx()
    const m = ctx?.markets.find(x => x.id === mkt)
    if (!state || !m) return
    const block = this.deps.market.head
    // a frame older than the newest seen for this market (a reconnect snapshot behind live updates) is dropped
    if (block && block < (this.lastBlock.get(mkt) ?? 0)) return
    this.lastBlock.set(mkt, block)
    const tick: Tick = { at: Date.now(), block, mkt, mark: state.mrk / 10 ** m.config.price_decimals, last: state.lst / 10 ** m.config.price_decimals }
    for (const r of this.rules.values()) {
      if (r.rule.mkt !== mkt || r.state !== 'armed') continue
      this.evaluations++
      const ts = this.deps.session(r.owner)
      // rules on a position need a trusted session. a ping has no position and runs on the mark alone
      if (r.rule.kind !== 'ping' && !ts?.account) {
        if (!this.deferred.has(r.id)) { this.deferred.add(r.id); writeRun({ owner: r.owner, rule: r.id, kind: 'deferred', body: { why: 'session reconnecting' } }) }
        continue
      }
      this.deferred.delete(r.id)
      const pos = ts?.positions.get(r.rule.pid)
      const health = pos ? positionHealth(pos, m, state.mrk) : null
      const view = { health, maintenance: m.config.maintenance_margin, balance: ts?.account ? Number(ts.account.b) / 1e6 : 0, addedToday: this.deps.addedToday(r.owner) }
      const s = step(r.rule, r.mem, tick, view)
      if (JSON.stringify(s.mem) !== JSON.stringify(r.mem)) { r.mem = s.mem; q.saveMem.run(JSON.stringify(s.mem), Date.now(), r.id) }
      if (s.intents.length) this.fire(r, s.intents, tick, s.done)
      else if (s.done) this.finish(r, s.done)
    }
  }

  private finish(r: Stored, why: string) {
    move(r, 'done', why)
    this.rules.delete(r.id)
    this.deps.log(`rule ${r.id} done: ${why}`)
  }

  private fire(r: Stored, intents: Intent[], tick: Tick, done?: string) {
    const t1 = Date.now()
    move(r, 'firing', intents.map(i => i.kind).join(', '), () => q.fired.run(Date.now(), r.id))
    r.fires++
    void this.lane(r.owner, async () => {
      for (const i of intents) await this.carry(r, i, { t0: tick.at, b0: tick.block, t1 })
      if (done) this.finish(r, done)
      else move(r, 'armed', 'carried out')
    }).catch(e => {
      writeRun({ owner: r.owner, rule: r.id, kind: 'error', body: { error: e instanceof Error ? e.message : String(e) } })
      if (r.state === 'firing') move(r, 'failed', e instanceof Error ? e.message : String(e))
      this.deps.log(`rule ${r.id} failed: ${e instanceof Error ? e.message : e}`)
    })
  }

  // one intent, carried out on the account's lane. it is written before it is sent and settled from
  // perpl's answer. a timeout leaves it unknown for reconcile, nothing here ever sends it again
  private async carry(r: Stored, i: Intent, stamps: { t0: number; b0: number; t1: number }) {
    const t2 = Date.now()
    if (i.kind === 'note') {
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: i.text, stamps: { ...stamps, t2 } } })
      this.deps.log(`rule ${r.id} note ${i.text}`)
      return
    }
    const ts = this.deps.session(r.owner)
    const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
    const pos = ts?.positions.get(i.pid)
    if (!ts?.account || !m || !pos) throw new Error('the session or the position went away before sending')
    const mark = this.deps.market.states.get(m.id)?.mrk ?? pos.ep
    const before = positionHealth(pos, m, mark)
    const id = `${r.id}:${r.fires}`
    if (i.kind === 'add') return this.addMargin(r, id, ts, pos, m, before, i.ausd, i.why, { ...stamps, t2 })
    throw new Error(`${i.kind} is not wired yet`)
  }

  private async addMargin(r: Stored, id: string, ts: TradingSocket, pos: Position, m: Market, before: ReturnType<typeof positionHealth>, ausd: number, why: string, stamps: Record<string, number>) {
    const snap = (h: ReturnType<typeof positionHealth>): Snap => ({ distancePct: h.distance * 100, collateral: h.collateral })
    openIntent({ id, rule: r.id, owner: r.owner, kind: 'add', pid: pos.pid, size: ausd, stamps, body: { before: snap(before), why } })
    this.inflight.set(id, r.id)
    try { await this.sendAdd(r, id, ts, pos, m, before, ausd, stamps, snap) } finally { this.inflight.delete(id) }
  }

  private async sendAdd(r: Stored, id: string, ts: TradingSocket, pos: Position, m: Market, before: ReturnType<typeof positionHealth>, ausd: number, stamps: Record<string, number>, snap: (h: ReturnType<typeof positionHealth>) => Snap) {
    this.deps.emit(r.owner, { kind: 'add', pid: pos.pid, symbol: m.symbol, text: `${m.symbol} ${before.side} ${(before.distance * 100).toFixed(2)}% from liquidation, adding ${ausd.toFixed(2)} AUSD`, distancePct: before.distance * 100, addAusd: ausd })
    const txP = this.deps.nextTx(ts)
    const t3 = Date.now()
    const p = ts.addMargin(pos, toCns(ausd))
    sentAs(id, ts.lastRq)
    crashAt('sent')
    let res
    try { res = await p } catch (e) {
      const st = { ...stamps, t3, t4: Date.now() }
      settle(id, 'unknown', { stamps: st })
      writeRun({ owner: r.owner, rule: r.id, kind: 'unknown', body: { intent: id, kind: 'add', ausd, error: e instanceof Error ? e.message : String(e), stamps: st } })
      this.deps.log(`rule ${r.id} add ${ausd} unknown: ${e instanceof Error ? e.message : e}, reconcile settles it`)
      return
    }
    const t5 = Date.now()
    if (!res.position) {
      const st = { ...stamps, t3, t4: t5 }
      settle(id, 'rejected', { stamps: st })
      writeRun({ owner: r.owner, rule: r.id, kind: 'reject', body: { intent: id, kind: 'add', ausd, status: res.status?.status ?? null, stamps: st } })
      this.deps.emit(r.owner, { kind: 'failed', pid: pos.pid, symbol: m.symbol, text: `margin add refused: ${res.status?.status.msg ?? res.status?.status.code ?? 'no reason'}` })
      return
    }
    const after = positionHealth(res.position, m, this.deps.market.states.get(m.id)?.mrk ?? pos.ep)
    const landed = await txP
    const tx = landed?.tx
    const st = { ...stamps, t3, t4: t5, t5, ...(landed?.block ? { b6: landed.block } : {}) }
    settle(id, 'filled', { fill: ausd, tx, stamps: st })
    writeRun({ owner: r.owner, rule: r.id, kind: 'fill', body: { intent: id, kind: 'add', ausd, before: snap(before), after: snap(after), tx: tx ?? null, stamps: st } })
    this.deps.onAdded(r.owner, ausd)
    this.deps.emit(r.owner, {
      kind: 'added', pid: pos.pid, symbol: m.symbol, side: before.side, lv: pos.lv, tx,
      text: `collateral now ${after.collateral.toFixed(4)} AUSD, ${(after.distance * 100).toFixed(2)}% from liquidation`,
      distancePct: after.distance * 100, addAusd: ausd, before: snap(before), after: snap(after),
    })
  }

  // settles what a crash or a dropped socket left unknown, from what perpl holds now. runs on boot before
  // anything is armed, after every sign in, and every 30s
  reconcile(owner: string) {
    const ts = this.deps.session(owner)
    if (!ts?.account) return
    for (const it of unsettled(owner)) {
      if (this.inflight.has(it.id)) continue
      const pos = it.pid !== null ? ts.positions.get(it.pid) : undefined
      const body = JSON.parse(it.body) as { before?: Snap }
      let state: 'filled' | 'rejected' | 'void'
      let why: string
      if (!pos) { state = 'void'; why = 'the position is gone' }
      else if (it.kind === 'add') {
        const now = fromCns(pos.c)
        const was = body.before?.collateral ?? now
        state = now >= was + (it.size ?? 0) * 0.9 ? 'filled' : 'rejected'
        why = `collateral was ${was.toFixed(4)}, now ${now.toFixed(4)}`
      } else { state = 'rejected'; why = 'unknown kind, left for a person' }
      settle(it.id, state, { fill: state === 'filled' ? it.size ?? undefined : undefined, stamps: { ...JSON.parse(it.stamps), reconciled: Date.now() } })
      writeRun({ owner, rule: it.rule, kind: 'reconcile', body: { intent: it.id, was: it.state, now: state, why } })
      this.deps.log(`reconcile ${it.id}: ${it.state} -> ${state}, ${why}`)
      if (state === 'filled' && it.kind === 'add') this.deps.onAdded(owner, it.size ?? 0)
    }
    // a rule caught mid fire by a crash goes back to watching once its intents are settled
    for (const r of this.rules.values()) {
      if (r.owner !== owner || [...this.inflight.values()].includes(r.id)) continue
      if (r.state === 'firing' || r.state === 'working') move(r, 'armed', 'reconciled after a restart or a drop')
      const pos = r.rule.kind === 'ping' ? true : ts.positions.get(r.rule.pid)
      if (!pos && r.state === 'armed') this.finish(r, 'position closed')
    }
  }

  // one guard rule per open position, made from the account's guard settings. paused while the guard is off
  syncGuard(owner: string, settings: GuardSettings) {
    const ts = this.deps.session(owner)
    if (!ts?.account) return
    const own = owner.toLowerCase()
    for (const pos of ts.positions.values()) {
      const id = `guard-${own.slice(2, 10)}-${pos.pid}`
      const want = Rule.parse({ v: 1, id, pid: pos.pid, mkt: pos.mkt, kind: 'guard', threshold: settings.thresholdPct, target: settings.targetPct, maxAddDay: settings.maxAddAusdPerDay })
      const have = this.rules.get(id)
      if (!have) {
        if (this.exists(id)) continue
        const s = this.add(own, want, 'app', settings.enabled ? 'armed' : 'paused')
        this.deps.log(`guard rule ${s.id} made for ${pos.pid}, ${s.state}`)
        continue
      }
      if (JSON.stringify(have.rule) !== JSON.stringify(want)) {
        have.rule = want
        q.saveBody.run(JSON.stringify(want), Date.now(), id)
        writeRun({ owner: own, rule: id, kind: 'state', body: { from: have.state, to: have.state, why: 'guard settings changed', rule: want } })
      }
      if (!settings.enabled && have.state === 'armed') move(have, 'paused', 'the guard was turned off')
      if (settings.enabled && have.state === 'paused') move(have, 'armed', 'the guard was turned on')
    }
  }

  // every send for one account goes through one promise chain, so two rules never race on a position
  private lane<T>(owner: string, job: () => Promise<T>): Promise<T> {
    const prev = this.lanes.get(owner) ?? Promise.resolve()
    const next = prev.catch(() => {}).then(job)
    this.lanes.set(owner, next)
    return next
  }
}
