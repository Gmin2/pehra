// the rules engine. rules live in sqlite, each is evaluated with step() on every mark update for its
// market, and what step() asks for is carried out through one send queue per account. every state change
// and every result is a run row (runs.ts). a session that is reconnecting defers its rules, it never acts
// on a position map it cannot trust.
import { Rule, step, modeOf, positionHealth, type Context, type MarketDataSocket, type Mem, type RuleState, type Tick, type TradingSocket, type Intent } from '@pehra/perpl'
import { db } from './db'
import { writeRun } from './runs'
import { move } from './state'

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
  log: (s: string) => void
}

const ACTIVE: RuleState[] = ['armed', 'firing', 'working', 'held']

const q = {
  active: db.prepare(`select * from rules where state in ('armed','firing','working','held')`),
  insert: db.prepare('insert into rules (id, owner, kind, body, state, mode, by, sig, created, updated, fires, mem) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'),
  byOwner: db.prepare('select * from rules where owner = ? order by created desc limit 100'),
  saveMem: db.prepare('update rules set mem = ?, updated = ? where id = ?'),
  fired: db.prepare('update rules set fires = fires + 1, updated = ? where id = ?'),
  lastRun: db.prepare('select at from runs where rule = ? and kind != ? order by seq desc limit 1'),
  exists: db.prepare('select 1 from rules where id = ?'),
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
  add(owner: string, rule: Rule, by: Stored['by'], state: 'armed' | 'draft' = 'armed', sig: string | null = null): Stored {
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

  // one intent, carried out. the tracer bullet only writes notes, margin adds and closes arrive with
  // reconcile (build-plan day 3) so an unknown outcome is never resent
  private async carry(r: Stored, i: Intent, stamps: { t0: number; b0: number; t1: number }) {
    if (i.kind === 'note') {
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: i.text, stamps: { ...stamps, t2: Date.now() } } })
      this.deps.log(`rule ${r.id} note ${i.text}`)
      return
    }
    throw new Error(`${i.kind} is not wired yet`)
  }

  // every send for one account goes through one promise chain, so two rules never race on a position
  private lane<T>(owner: string, job: () => Promise<T>): Promise<T> {
    const prev = this.lanes.get(owner) ?? Promise.resolve()
    const next = prev.catch(() => {}).then(job)
    this.lanes.set(owner, next)
    return next
  }
}
