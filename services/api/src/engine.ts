// the rules engine. rules live in sqlite, each is evaluated with step() on every mark update for its
// market, and what step() asks for is carried out through one send queue per account. every state change
// and every result is a run row (runs.ts). a session that is reconnecting defers its rules, it never acts
// on a position map it cannot trust.
import { Rule, step, onFunding, onTrades, type TradeRow, levels, poll as pollChain, matches as chainMatches, fired as chainFired, onStopEvent, type ChainEvent, type ChainCtx, type PollNow, modeOf, nextSlice, Book, type HistoryOrder, positionHealth, toCns, fromCns, toSize, fromSize, fromPrice, OrderType, Flag, Reason, type Context, type GuardSettings, type Market, type MarketDataSocket, type Mem, type Order, type Position, type RuleState, type Tick, type TradingSocket, type Intent } from '@pehra/perpl'
import { db } from './db'
import { writeRun } from './runs'
import { move } from './state'
import { openIntent, settle, unsettled, sentAs, addedSince } from './intents'
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
  emit: (address: string, e: Omit<GuardEvent, 'at'>) => void
  nextTx: (ts: TradingSocket) => Promise<{ tx: string; block?: number } | undefined>
  book: (mkt: number) => Book | undefined
  history: (address: string) => Promise<HistoryOrder[]>
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
  putOrder: db.prepare(`insert or replace into orders (rule, step, owner, oid, pid, size, px, tp, tpc, state) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  orderOf: db.prepare('select * from orders where rule = ? and step = ?'),
  byOid: db.prepare('select 1 from orders where oid = ?'),
  ordersOf: db.prepare('select * from orders where rule = ?'),
  orderState: db.prepare('update orders set state = ?, size = ? where rule = ? and step = ?'),
}

type OrderRow = { rule: string; step: string; owner: string; oid: number; pid: number; size: number; px: number; tp: number; tpc: number; state: string }
// the backstop fires as a market close capped this far from the mark, so it still fills in a fast crash
const BACKSTOP_SLIPPAGE_BPS = 300

// a crash at a named point, for the crash test only (DEBUG_CRASH_AT=sent)
function crashAt(point: string) {
  if (process.env.DEBUG_CRASH_AT === point) { console.log(`DEBUG_CRASH_AT=${point}, exiting`); process.exit(1) }
  // late: the frame has had time to leave, perpl's answer has not (it takes about 900ms)
  if (process.env.DEBUG_CRASH_AT === point + '-late') setTimeout(() => { console.log(`DEBUG_CRASH_AT=${point}-late, exiting`); process.exit(1) }, 300)
}

const DAY_MS = 24 * 3600_000
export const addedToday = (owner: string, now = Date.now()) => addedSince(owner.toLowerCase(), Math.floor(now / DAY_MS) * DAY_MS)

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
  private resizing = new Set<number>()
  // stops whose backstop is being moved right now. reconcile leaves them alone so it never puts the old one back
  private moving = new Set<string>()
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
    if (rule.kind === 'stop' && state === 'armed') void this.lane(s.owner, () => this.placeBackstop(s)).catch(e => this.deps.log(`backstop for ${s.id} failed: ${e instanceof Error ? e.message : e}`))
    if (rule.kind === 'ladder' && state === 'armed') void this.lane(s.owner, () => this.placeLadder(s)).catch(e => this.deps.log(`ladder for ${s.id} failed: ${e instanceof Error ? e.message : e}`))
    return s
  }

  // the stop's last line, held by perpl: a trigger close at backstopPx for the live size. perpl fires it even
  // when pehra is down, and drops it when the position closes (spike g9, sr 28)
  private async placeBackstop(r: Stored, at?: number): Promise<number | null> {
    if (r.rule.kind !== 'stop') return null
    const backstopPx = at ?? levels(r.rule, r.mem).backstopPx
    const ts = this.deps.session(r.owner)
    const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
    const pos = ts?.positions.get(r.rule.pid)
    if (!ts?.account || !m || !pos) throw new Error('no session or position for the backstop')
    const k = 10 ** m.config.price_decimals
    const tp = Math.round(backstopPx * k)
    const res = await ts.stopLoss(pos, tp, { slippageBps: BACKSTOP_SLIPPAGE_BPS, size: pos.s })
    const o = res.order
    if (!o || o.st !== 8) {
      const reason = o ? Reason[o.sr] ?? `sr ${o.sr}` : res.status?.status.msg ?? 'no answer'
      writeRun({ owner: r.owner, rule: r.id, kind: 'reject', body: { step: 'backstop', backstopPx, reason } })
      if (at === undefined) this.deps.emit(r.owner, { kind: 'failed', pid: pos.pid, symbol: m.symbol, text: `the backstop at ${backstopPx} could not be placed (${reason}), the stop still runs on pehra` })
      if (o?.sr === 24) throw new Error('MaximumAccountOrders')
      return null
    }
    q.putOrder.run(r.id, 'backstop', r.owner, o.oid, pos.pid, fromSize(m, pos.s), backstopPx, tp, o.tpc ?? 0, 'resting')
    r.mem = { ...r.mem, placed: backstopPx }
    q.saveMem.run(JSON.stringify(r.mem), Date.now(), r.id)
    writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: `backstop resting on perpl at ${backstopPx}`, oid: o.oid, size: fromSize(m, pos.s) } })
    if (at === undefined) this.deps.emit(r.owner, { kind: 'bracket', pid: pos.pid, symbol: m.symbol, text: `${m.symbol}: hidden stop at ${levels(r.rule, r.mem).px}, backstop on perpl at ${backstopPx}` })
    this.deps.log(`rule ${r.id} backstop resting at ${backstopPx}, oid ${o.oid}`)
    return o.oid
  }

  // a stop's levels move (trailing, breakeven, a chain). the hidden ones change in memory at once. the
  // backstop on perpl is placed at its new price before the old one is cancelled, so the position is never
  // left without one; with no slot free for a second order it is cancelled first. never while it is selling
  private async moveStop(r: Stored, next: { px: number; floor: number; backstopPx: number }, why: string) {
    if (r.rule.kind !== 'stop' || r.state === 'firing' || r.state === 'working' || r.state === 'held') return
    const from = levels(r.rule, r.mem)
    r.mem = { ...r.mem, px: next.px, floor: next.floor, backstopPx: next.backstopPx }
    q.saveMem.run(JSON.stringify(r.mem), Date.now(), r.id)
    const old = q.orderOf.get(r.id, 'backstop') as OrderRow | undefined
    const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
    const ts = this.deps.session(r.owner)
    this.moving.add(r.id)
    try {
      if (old && old.state === 'resting' && old.px !== next.backstopPx && ts?.account) {
        // the old row steps aside under its own oid, so it is still known as ours if it fires mid swap
        db.prepare(`update orders set step = ?, state = 'replacing' where rule = ? and step = 'backstop'`).run(`backstop#${old.oid}`, r.id)
        const order = ts.orders.get(old.oid)
        let placed: number | null = null
        try { placed = await this.placeBackstop(r, next.backstopPx) } catch (e) {
          if (!(e instanceof Error && e.message === 'MaximumAccountOrders') || !order) throw e
          await this.cancelOld(r, ts, old)
          placed = await this.placeBackstop(r, next.backstopPx)
        }
        if (placed === null) {
          // the new one did not land, the old one stays the backstop
          db.prepare(`update orders set step = 'backstop', state = 'resting' where rule = ? and step = ?`).run(r.id, `backstop#${old.oid}`)
        } else await this.cancelOld(r, ts, old)
      }
      // a trailing stop moved its hidden levels already, the backstop it rested at is the real before
      const before = { ...from, backstopPx: old?.px ?? from.backstopPx }
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: why, move: { from: before, to: next } } })
      this.deps.emit(r.owner, { kind: 'bracket', rule: 'move', pid: r.rule.pid, symbol: m?.symbol, price: next.px, text: `${why}: stop ${before.px} to ${next.px}, backstop ${before.backstopPx} to ${next.backstopPx}` })
      this.deps.log(`rule ${r.id} moved ${before.px} -> ${next.px}, backstop ${before.backstopPx} -> ${next.backstopPx}`)
    } finally { this.moving.delete(r.id) }
  }

  // the backstop a move replaced comes off perpl. it is only called cancelled when perpl says so (st 5),
  // tried twice, else left as an orphan that reconcile keeps cancelling until it is gone
  private async cancelOld(r: Stored, ts: TradingSocket, old: OrderRow) {
    const step = `backstop#${old.oid}`
    for (let k = 0; k < 2; k++) {
      const order = ts.orders.get(old.oid)
      if (!order || order.st !== 8) { q.orderState.run(order?.st === 10 ? 'fired' : 'gone', old.size, r.id, step); return }
      const res = await ts.cancel(order).catch(() => null)
      if (res?.order?.st === 5) { q.orderState.run('cancelled', old.size, r.id, step); return }
      this.deps.log(`rule ${r.id} cancel of the old backstop ${old.oid} refused: ${res?.order ? Reason[res.order.sr] ?? res.order.sr : 'no answer'}`)
      await new Promise(res => setTimeout(res, 800))
    }
    q.orderState.run('orphan', old.size, r.id, step)
    writeRun({ owner: r.owner, rule: r.id, kind: 'reject', body: { text: 'the old backstop did not cancel, reconcile keeps trying', oid: old.oid } })
  }

  // what a chain may look at for this account right now
  private chainCtx(owner: string, at = Date.now()): ChainCtx {
    const ts = this.deps.session(owner)
    const ctx = this.deps.ctx()
    const healthOf = (pid: number) => {
      const pos = ts?.positions.get(pid)
      const m = pos && ctx?.markets.find(x => x.id === pos.mkt)
      const st = m && this.deps.market.states.get(m.id)
      return pos && m && st ? positionHealth(pos, m, st.mrk) : null
    }
    const taker = ctx?.markets[0]?.config.taker_fee ?? 345
    return {
      at,
      stop: id => { const r = this.rules.get(id); return r && r.owner === owner && r.rule.kind === 'stop' ? { rule: r.rule, mem: r.mem } : undefined },
      health: healthOf,
      positions: () => [...(ts?.positions.keys() ?? [])].map(healthOf).filter((h): h is NonNullable<typeof h> => !!h),
      mark: mkt => { const m = ctx?.markets.find(x => x.id === mkt); const st = this.deps.market.states.get(mkt); return m && st ? st.mrk / 10 ** m.config.price_decimals : undefined },
      // a round trip of taker fees as a fraction of the price. taker_fee is in millionths: 345 is 3.45 bps,
      // the same unit replay reads (taker_fee / 100 bps)
      fees: 2 * taker / 1_000_000,
    }
  }

  // something a rule did: stops with a breakeven and chains waiting on it react
  private event(owner: string, ev: ChainEvent) {
    const ctx = this.chainCtx(owner)
    for (const r of [...this.rules.values()]) {
      if (r.owner !== owner || r.state !== 'armed') continue
      if (r.rule.kind === 'stop' && r.rule.breakeven) {
        const moves = onStopEvent(r.rule, r.mem, ev, ctx.health(r.rule.pid), ctx.fees)
        for (const i of moves)
          if (i.kind === 'move') void this.lane(owner, () => this.moveStop(r, i, i.why)).catch(e => this.deps.log(`move ${r.id} failed: ${e instanceof Error ? e.message : e}`))
        // its step filled but the stop stayed: say why, so a breakeven that did not happen is not silent
        if (!moves.length && ev.kind === 'step' && ev.rule === r.rule.breakeven.ladder && ev.n >= r.rule.breakeven.afterStep) {
          const h = ctx.health(r.rule.pid)
          const why = !h ? 'the position is gone' : `the price ${h.mark} is not past entry plus fees, moving there would sell at once, or the stop is already tighter`
          writeRun({ owner, rule: r.id, kind: 'note', body: { text: `breakeven skipped: ${why}` } })
          this.deps.log(`rule ${r.id} breakeven skipped: ${why}`)
        }
      }
      if (r.rule.kind === 'when' && chainMatches(r.rule, ev)) this.fireChain(r, ctx)
    }
  }

  private fireChain(r: Stored, ctx: ChainCtx) {
    if (r.rule.kind !== 'when') return
    const s = chainFired(r.rule, r.mem, ctx)
    r.mem = s.mem
    q.saveMem.run(JSON.stringify(s.mem), Date.now(), r.id)
    const mark = ctx.mark(r.rule.mkt) ?? 0
    writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: `chain fired`, intents: s.intents.map(i => i.kind) } })
    if (s.intents.length) this.fire(r, s.intents, { at: ctx.at, block: this.deps.market.head, mkt: r.rule.mkt, mark, last: mark }, s.done)
    else if (s.done) this.finish(r, s.done)
  }

  // the addresses active copies follow
  copyTargets() {
    return [...new Set([...this.rules.values()].filter(r => r.rule.kind === 'copy' && r.state === 'armed').map(r => (r.rule as Extract<Rule, { kind: 'copy' }>).target.toLowerCase()))]
  }

  // what a followed account did on chain, from the indexer. every copy of it decides, then acts
  onCopy(target: string, rows: TradeRow[]) {
    for (const r of [...this.rules.values()]) {
      if (r.rule.kind !== 'copy' || r.state !== 'armed' || r.rule.target.toLowerCase() !== target.toLowerCase()) continue
      const ctx = this.chainCtx(r.owner)
      const out = onTrades(r.rule, r.mem, rows, { mark: ctx.mark, position: ctx.health, armedAt: r.created })
      if (JSON.stringify(out.mem) !== JSON.stringify(r.mem)) { r.mem = out.mem; q.saveMem.run(JSON.stringify(out.mem), Date.now(), r.id) }
      if (!out.intents.length) continue
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: `copying ${target}`, intents: out.intents.map(i => i.kind) } })
      const mark = ctx.mark(r.rule.mkt) ?? 0
      this.fire(r, out.intents, { at: Date.now(), block: this.deps.market.head, mkt: r.rule.mkt, mark, last: mark })
    }
  }

  // chains that wait on the market, the clock or agora
  pollChains(now: Omit<PollNow, 'mark' | 'distance'> & { mkt?: number }) {
    for (const r of [...this.rules.values()]) {
      if (r.rule.kind !== 'when' || r.state !== 'armed') continue
      const t = r.rule.on.on
      const clockCall = now.mkt === undefined && now.fundingRate === undefined && now.ausdPrice === undefined
      const byClock = (t === 'time' || t === 'daily') && clockCall
      const byFunding = t === 'fundingFlip' && now.fundingRate !== undefined && now.mkt === r.rule.mkt
      const byDepeg = t === 'depeg' && now.ausdPrice !== undefined
      const byMarket = (t === 'price' || t === 'distance') && now.mkt === r.rule.mkt && now.fundingRate === undefined
      if (!byClock && !byFunding && !byDepeg && !byMarket) continue
      const ctx = this.chainCtx(r.owner, now.at)
      const h = r.rule.pid ? ctx.health(r.rule.pid) : null
      const p = pollChain(r.rule, r.mem, { ...now, mark: ctx.mark(r.rule.mkt), distance: h?.distance })
      if (JSON.stringify(p.mem) !== JSON.stringify(r.mem)) { r.mem = p.mem; q.saveMem.run(JSON.stringify(p.mem), Date.now(), r.id) }
      if (p.hit) this.fireChain(r, ctx)
    }
  }

  // a take profit ladder lives on perpl: one partial trigger close per step, each with its floor. sizes come
  // from the live position and never add up to more than it (validate checked the shares)
  private async placeLadder(r: Stored) {
    if (r.rule.kind !== 'ladder') return
    const ts = this.deps.session(r.owner)
    const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
    const pos = ts?.positions.get(r.rule.pid)
    if (!ts?.account || !m || !pos) throw new Error('no session or position for the ladder')
    const k = 10 ** m.config.price_decimals
    let placed = 0
    for (const [n, st] of r.rule.steps.entries()) {
      const size = Math.max(1, Math.floor(pos.s * st.share / 100))
      const res = await ts.takeProfit(pos, Math.round(st.px * k), { floor: Math.round(st.floor * k), size })
      const o = res.order
      if (!o || o.st !== 8) {
        const reason = o ? Reason[o.sr] ?? `sr ${o.sr}` : res.status?.status.msg ?? 'no answer'
        writeRun({ owner: r.owner, rule: r.id, kind: 'reject', body: { step: `s${n}`, px: st.px, reason } })
        this.deps.emit(r.owner, { kind: 'failed', pid: pos.pid, symbol: m.symbol, text: `take profit step at ${st.px} could not be placed (${reason})` })
        continue
      }
      q.putOrder.run(r.id, `s${n}`, r.owner, o.oid, pos.pid, fromSize(m, size), st.px, Math.round(st.px * k), o.tpc ?? 0, 'resting')
      placed++
    }
    writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: `ladder resting on perpl, ${placed} of ${r.rule.steps.length} steps` } })
    this.deps.emit(r.owner, { kind: 'bracket', pid: pos.pid, symbol: m.symbol, text: `${m.symbol}: take profit ladder of ${placed} steps on perpl` })
    this.deps.log(`rule ${r.id} ladder resting, ${placed} steps`)
  }

  // cancel a step and place it again at its intended size, same price and floor
  private async resizeStep(r: Stored, row: OrderRow, o: Order, want: number) {
    if (r.rule.kind !== 'ladder') return
    const ts = this.deps.session(r.owner)
    const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
    const pos = ts?.positions.get(r.rule.pid)
    const st = r.rule.steps[Number(row.step.slice(1))]
    if (!ts?.account || !m || !pos || !st) return
    const c = await ts.cancel(o)
    if (c.order?.st !== 5) throw new Error(`cancel refused ${c.order ? Reason[c.order.sr] ?? c.order.sr : 'no answer'}`)
    const k = 10 ** m.config.price_decimals
    const res = await ts.takeProfit(pos, Math.round(st.px * k), { floor: Math.round(st.floor * k), size: Math.min(want, pos.s) })
    if (!res.order || res.order.st !== 8) { q.orderState.run('gone', row.size, r.id, row.step); throw new Error('replace refused') }
    q.putOrder.run(r.id, row.step, r.owner, res.order.oid, pos.pid, row.size, st.px, Math.round(st.px * k), res.order.tpc ?? 0, 'resting')
    writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: `${row.step} back to ${fromSize(m, Math.min(want, pos.s))} ${m.symbol}`, oid: res.order.oid } })
  }

  // perpl's order history says whether the backstop fired and what its close sold, the open orders do not
  private async attribute(r: Stored, row: OrderRow, tries = 5) {
    // perpl's history can lag the socket by a few seconds, so a missing execution is asked again before
    // the order is called gone
    let hist: HistoryOrder[] = []
    let fired: HistoryOrder | undefined
    for (let i = 0; i < tries; i++) {
      hist = await this.deps.history(r.owner)
      fired = hist.find(o => o.oid === row.oid && o.st === 10)
      if (fired?.at) break
      if (hist.some(o => o.oid === row.oid && o.st === 5)) break
      await new Promise(res => setTimeout(res, 3000))
    }
    const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
    if (!fired?.at) {
      // the history can lag for longer than that. the live session saw the trigger execute (st 10) and the
      // close it made, which is enough to know it fired and at what price
      const ts = this.deps.session(r.owner)
      const sock = ts?.orders.get(row.oid)
      if (!m || !ts || sock?.st !== 10) { q.orderState.run('gone', row.size, r.id, row.step); return }
      const kid = [...ts.orders.values()].filter(o => o.oid > row.oid && o.lp === sock.lp && (o.t === 3 || o.t === 4) && (o.fs ?? 0) > 0 && o.st === 4).sort((x, y) => y.oid - x.oid)[0]
      q.orderState.run('fired', row.size, r.id, row.step)
      const price = kid?.fp ? fromPrice(m, kid.fp) : row.px, size = kid?.fs ? fromSize(m, kid.fs) : row.size
      writeRun({ owner: r.owner, rule: r.id, kind: 'fill', body: { kind: row.step === 'backstop' ? 'backstop' : 'step', step: row.step, by: 'perpl', trigger: row.px, size, price, tx: null, from: 'session, history lagged' } })
      this.event(r.owner, row.step === 'backstop' ? { kind: 'backstop', rule: r.id, pid: r.rule.pid, price } : { kind: 'step', rule: r.id, pid: r.rule.pid, n: Number(row.step.slice(1)) + 1, price })
      this.deps.emit(r.owner, { kind: 'closed', rule: row.step === 'backstop' ? 'backstop' : 'step', pid: r.rule.pid, symbol: m.symbol, amount: size, price, text: `${row.step === 'backstop' ? 'the backstop' : `take profit ${row.step}`} on perpl sold ${size} ${m.symbol} at ${price}` })
      this.deps.log(`rule ${r.id} ${row.step} fired on perpl (seen on the session, history lagged), ${size} at ${price}`)
      return
    }
    const child = hist.find(o => o.at?.b === fired.at?.b && o.st === 4 && (o.t === 3 || o.t === 4) && o.oid !== row.oid)
    q.orderState.run('fired', row.size, r.id, row.step)
    if (!m || !child) return
    const price = fromPrice(m, child.fp ?? 0), size = fromSize(m, child.fs ?? 0)
    const tx = child.at?.txid ? `0x${child.at.txid}` : null
    const what = row.step === 'backstop' ? 'the backstop' : `take profit ${row.step}`
    writeRun({ owner: r.owner, rule: r.id, kind: 'fill', body: { kind: row.step === 'backstop' ? 'backstop' : 'step', step: row.step, by: 'perpl', trigger: row.px, size, price, tx, block: fired.at.b } })
    this.event(r.owner, row.step === 'backstop'
      ? { kind: 'backstop', rule: r.id, pid: r.rule.pid, price }
      : { kind: 'step', rule: r.id, pid: r.rule.pid, n: Number(row.step.slice(1)) + 1, price })
    this.deps.emit(r.owner, { kind: 'closed', rule: row.step === 'backstop' ? 'backstop' : 'step', pid: r.rule.pid, symbol: m.symbol, tx: tx ?? undefined, amount: size, price, text: `${what} on perpl sold ${size} ${m.symbol} at ${price}, it fired at ${row.px}` })
    this.deps.log(`rule ${r.id} ${what} fired on perpl, ${size} at ${price} ${tx ?? ''}`)
  }

  // a ladder's steps fire on perpl. each one perpl executed is recorded once, the ladder ends when none rest
  private reconcileSteps(r: Stored, ts: TradingSocket) {
    const rows = (q.ordersOf.all(r.id) as OrderRow[]).filter(x => x.step !== 'backstop')
    const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
    const pos = ts.positions.get(r.rule.pid)
    for (const row of rows) {
      if (row.state !== 'resting') continue
      const o = ts.orders.get(row.oid)
      if (o && o.st === 8) {
        // after a partial close perpl sets every linked trigger to the whole remaining position (sr 31), a
        // later step would then sell everything. put it back to its share, never above what is held
        const want = m && pos ? Math.min(toSize(m, row.size), pos.s) : 0
        if (m && pos && o.os !== undefined && o.os !== want && !this.resizing.has(row.oid)) {
          this.resizing.add(row.oid)
          writeRun({ owner: r.owner, rule: r.id, kind: 'reconcile', body: { step: row.step, oid: row.oid, perplSize: fromSize(m, o.os), want: fromSize(m, want), why: 'perpl resized the step with the position, putting its share back' } })
          void this.lane(r.owner, () => this.resizeStep(r, row, o, want)).catch(e => this.deps.log(`resize ${r.id} ${row.step} failed: ${e instanceof Error ? e.message : e}`)).finally(() => this.resizing.delete(row.oid))
        }
        continue
      }
      row.state = 'checking'
      q.orderState.run('checking', row.size, r.id, row.step)
      void this.lane(r.owner, () => this.attribute(r, { ...row, state: 'resting' })).catch(e => this.deps.log(`step history for ${r.id} failed: ${e instanceof Error ? e.message : e}`))
    }
    if (rows.length && rows.every(x => x.state === 'fired' || x.state === 'gone' || x.state === 'cancelled')) this.finish(r, 'every take profit step fired')
  }

  // every order a finished rule left resting on perpl is cancelled with its own fields, or marked gone
  private async dropOrders(r: Stored, why: string) {
    const ts = this.deps.session(r.owner)
    for (const row of q.ordersOf.all(r.id) as OrderRow[]) {
      if (row.state !== 'resting') continue
      const resting = ts?.orders.get(row.oid)
      if (!ts?.account || !resting || resting.st !== 8) { q.orderState.run('gone', row.size, r.id, row.step); continue }
      const res = await ts.cancel(resting)
      const ok = res.order?.st === 5
      q.orderState.run(ok ? 'cancelled' : 'resting', row.size, r.id, row.step)
      writeRun({ owner: r.owner, rule: r.id, kind: ok ? 'note' : 'reject', body: { text: ok ? `${row.step} cancelled, ${why}` : `${row.step} cancel refused (${res.order ? Reason[res.order.sr] ?? res.order.sr : 'no answer'})`, oid: row.oid } })
    }
  }

  active() { return this.rules.size }

  // the escape hatch and the kill switch: every rule of the account stops acting, the ones sending finish
  pauseAll(owner: string, why: string) {
    let n = 0
    for (const r of this.rules.values()) {
      if (r.owner !== owner.toLowerCase() || (r.state !== 'armed' && r.state !== 'held')) continue
      move(r, 'paused', why)
      n++
    }
    return n
  }

  // the owner pauses or resumes one rule. a guard rule follows the guard's own on/off setting instead
  setHold(owner: string, id: string, hold: boolean): { ok: true; state: RuleState } | { ok: false; why: string } {
    const r = this.rules.get(id)
    if (!r || r.owner !== owner.toLowerCase()) return { ok: false, why: 'no such active rule for this account' }
    if (r.rule.kind === 'guard') return { ok: false, why: 'the guard is turned on and off from its own setting' }
    if (hold && (r.state === 'armed' || r.state === 'held')) move(r, 'paused', 'paused by the owner')
    else if (!hold && r.state === 'paused') move(r, 'armed', 'resumed by the owner')
    else if (r.state === 'firing' || r.state === 'working') return { ok: false, why: 'the rule is acting right now, try again in a moment' }
    return { ok: true, state: r.state }
  }

  // the owner ends a rule. not while it is sending, the answer settles first
  cancel(owner: string, id: string, why = 'cancelled by the owner'): { ok: true } | { ok: false; why: string } {
    const r = this.rules.get(id)
    if (!r || r.owner !== owner.toLowerCase()) return { ok: false, why: 'no such active rule for this account' }
    if (r.state === 'firing' || r.state === 'working') return { ok: false, why: 'the rule is acting right now, try again in a moment' }
    this.finish(r, why)
    return { ok: true }
  }

  exists(id: string) { return q.exists.get(id) !== undefined }

  // a perpl order one of pehra's rules placed (a backstop or a ladder step), the engine reports those itself
  owns(oid: number) { return q.byOid.get(oid) !== undefined }

  list(owner: string) {
    return (q.byOwner.all(owner.toLowerCase()) as Row[]).map(r => {
      const s = this.rules.get(r.id) ?? fromRow(r)
      const last = q.lastRun.get(r.id, 'state') as { at: number } | undefined
      return { id: s.id, kind: s.rule.kind, state: s.state, mode: s.mode, by: s.by, fires: s.fires, rule: s.rule, live: s.rule.kind === 'stop' ? levels(s.rule, s.mem) : undefined, lastRun: last?.at ?? null, created: s.created }
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
      if (r.rule.mkt !== mkt || (r.state !== 'armed' && r.state !== 'held')) continue
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
      const view = { health, maintenance: m.config.maintenance_margin, balance: ts?.account ? Number(ts.account.b) / 1e6 : 0, addedToday: addedToday(r.owner) }
      const s = step(r.rule, r.mem, tick, view)
      // a held stop resumes only when the book can take a slice past its floor, it never sends to be refused
      if (r.state === 'held' && s.intents.some(i => i.kind === 'close') && !this.canSell(r, m, health)) continue
      if (JSON.stringify(s.mem) !== JSON.stringify(r.mem)) { r.mem = s.mem; q.saveMem.run(JSON.stringify(s.mem), Date.now(), r.id) }
      // a trailing stop moving is not the stop acting, its own state stays armed
      const moves = s.intents.filter((i): i is Extract<Intent, { kind: 'move' }> => i.kind === 'move')
      const acts = s.intents.filter(i => i.kind !== 'move')
      for (const mv of moves) if (!this.moving.has(r.id)) void this.lane(r.owner, () => this.moveStop(r, mv, mv.why)).catch(e => this.deps.log(`move ${r.id} failed: ${e instanceof Error ? e.message : e}`))
      if (acts.length) this.fire(r, acts, tick, s.done)
      else if (s.done) this.finish(r, s.done)
    }
    this.pollChains({ at: tick.at, mkt })
  }

  // funding from perpl's market context, about once a minute. a funding rule closes its position on the flip
  // to paying, through the same sliced close a stop uses
  funding(markets: { id: number; rate: number }[]) {
    for (const r of this.rules.values()) {
      if (r.rule.kind !== 'funding' || r.state !== 'armed') continue
      const f = markets.find(x => x.id === r.rule.mkt)
      const ts = this.deps.session(r.owner)
      const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
      const state = this.deps.market.states.get(r.rule.mkt)
      if (!f || !ts?.account || !m || !state) continue
      const pos = ts.positions.get(r.rule.pid)
      const health = pos ? positionHealth(pos, m, state.mrk) : null
      const at = Date.now()
      const s = onFunding(r.rule, r.mem, health, f.rate, at)
      if (JSON.stringify(s.mem) !== JSON.stringify(r.mem)) { r.mem = s.mem; q.saveMem.run(JSON.stringify(s.mem), at, r.id) }
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: `funding ${f.rate}`, acted: s.intents.length > 0 } })
      const mark = state.mrk / 10 ** m.config.price_decimals
      if (s.intents.length) this.fire(r, s.intents, { at, block: this.deps.market.head, mkt: m.id, mark, last: mark }, s.done)
      else if (s.done) this.finish(r, s.done)
    }
  }

  private finish(r: Stored, why: string) {
    move(r, 'done', why)
    this.rules.delete(r.id)
    this.deps.log(`rule ${r.id} done: ${why}`)
    // a finished stop leaves nothing on perpl: cancelled if it still rests, marked gone if perpl dropped it
    if (r.rule.kind === 'stop' || r.rule.kind === 'ladder') void this.lane(r.owner, () => this.dropOrders(r, why)).catch(e => this.deps.log(`order cleanup for ${r.id} failed: ${e instanceof Error ? e.message : e}`))
  }

  // whether the live book has depth on the right side of a stop's floor
  private canSell(r: Stored, m: Market, h: ReturnType<typeof positionHealth> | null) {
    if (r.rule.kind !== 'stop' || !h) return false
    const book = this.deps.book(m.id)
    if (!book) return true
    const k = 10 ** m.config.price_decimals, z = 10 ** m.config.size_decimals
    const { bids, asks } = book.levels()
    const human = (l: [number, number][]) => l.map(([p, q]): [number, number] => [p / k, q / z])
    return nextSlice({ left: h.size, floor: r.rule.floor, side: h.side, bids: human(bids), asks: human(asks), maxShare: 0.5, minSize: 1 / z }).size > 0
  }

  private fire(r: Stored, intents: Intent[], tick: Tick, done?: string) {
    const t1 = Date.now()
    move(r, r.state === 'held' ? 'working' : 'firing', intents.map(i => i.kind).join(', '), () => q.fired.run(Date.now(), r.id))
    r.fires++
    void this.lane(r.owner, async () => {
      let held: string | undefined
      for (const i of intents) { const out = await this.carry(r, i, { t0: tick.at, b0: tick.block, t1 }); if (out) held = out }
      if (done && !held) this.finish(r, done)
      // a copy that filled nothing waits for the next trade, it does not hold on this one
      else if (held && r.rule.kind === 'copy') { this.deps.emit(r.owner, { kind: 'failed', text: `a copy did not fill: ${held}` }); move(r, 'armed', held) }
      else if (held) {
        // nothing sold: forget that it fired, so it can act again once the book allows it (build-plan day 4)
        r.mem = { ...r.mem, fired: undefined }
        q.saveMem.run(JSON.stringify(r.mem), Date.now(), r.id)
        move(r, 'held', held)
      } else move(r, 'armed', 'carried out')
    }).catch(e => {
      writeRun({ owner: r.owner, rule: r.id, kind: 'error', body: { error: e instanceof Error ? e.message : String(e) } })
      if (r.state === 'firing') move(r, 'failed', e instanceof Error ? e.message : String(e))
      this.deps.log(`rule ${r.id} failed: ${e instanceof Error ? e.message : e}`)
    })
  }

  // one intent, carried out on the account's lane. it is written before it is sent and settled from
  // perpl's answer. a timeout leaves it unknown for reconcile, nothing here ever sends it again
  private async carry(r: Stored, i: Intent, stamps: { t0: number; b0: number; t1: number }): Promise<string | void> {
    const t2 = Date.now()
    if (i.kind === 'note') {
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: i.text, stamps: { ...stamps, t2 } } })
      this.deps.log(`rule ${r.id} note ${i.text}`)
      return
    }
    if (i.kind === 'notify') {
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: i.text } })
      this.deps.emit(r.owner, { kind: 'bracket', rule: 'notify', text: i.text })
      return
    }
    if (i.kind === 'cancel') {
      const c = this.cancel(r.owner, i.rule, i.why)
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: i.why, cancelled: c.ok } })
      return
    }
    if (i.kind === 'move') {
      const target = this.rules.get(i.rule)
      if (target && target.owner === r.owner) await this.moveStop(target, i, i.why)
      return
    }
    const ts = this.deps.session(r.owner)
    const posFirst = i.kind === 'add' || i.kind === 'close' ? ts?.positions.get(i.pid) : undefined
    const m = this.deps.ctx()?.markets.find(x => x.id === (posFirst?.mkt ?? (i.kind === 'open' ? i.mkt : undefined) ?? r.rule.mkt))
    if (i.kind === 'open') {
      if (!ts?.account || !m) throw new Error('the session went away before sending')
      return this.openEntry(r, `${r.id}:${r.fires}`, ts, m, i, { ...stamps, t2 })
    }
    const pos = ts?.positions.get(i.pid)
    if (!ts?.account || !m || !pos) throw new Error('the session or the position went away before sending')
    const mark = this.deps.market.states.get(m.id)?.mrk ?? pos.ep
    const before = positionHealth(pos, m, mark)
    const id = `${r.id}:${r.fires}`
    if (i.kind === 'add') return this.addMargin(r, id, ts, pos, m, before, i.ausd, i.why, { ...stamps, t2 })
    if (i.kind === 'close') return this.sliced(r, id, ts, pos, m, i.size, i.floor, i.why, { ...stamps, t2 })
  }

  // a stop sells in slices sized from the live book past its floor, one per block, re-reading the position
  // before each so it never sells more than is held. the book past the floor holds it with the rest open
  private async sliced(r: Stored, id: string, ts: TradingSocket, pos: Position, m: Market, size: number, floor: number, why: string, stamps: Record<string, number>): Promise<string | void> {
    const max = r.rule.kind === 'stop' ? r.rule.slices : 1
    const z = 10 ** m.config.size_decimals, k = 10 ** m.config.price_decimals
    let left = size, sold = 0
    for (let n = 0; n < max && left > 0; n++) {
      const live = ts.positions.get(pos.pid)
      if (!live) return
      const held = fromSize(m, live.s)
      const book = this.deps.book(m.id)
      let take = Math.min(left, held)
      if (book && n < max - 1) {
        const { bids, asks } = book.levels()
        const human = (l: [number, number][]) => l.map(([p, q]): [number, number] => [p / k, q / z])
        const s = nextSlice({ left: take, floor, side: live.sd === 1 ? 'long' : 'short', bids: human(bids), asks: human(asks), maxShare: 0.5, minSize: 1 / z })
        if (!s.size) return this.holdAt(r, m, floor, held)
        take = s.size
      }
      const out = await this.close(r, max > 1 ? `${id}.${n}` : id, ts, live, m, take, floor, why, stamps)
      if (typeof out === 'string') return sold > 0 ? this.holdAt(r, m, floor, fromSize(m, ts.positions.get(pos.pid)?.s ?? 0)) : out
      sold += out
      left -= out
      if (left > 0) await new Promise(res => setTimeout(res, 400))
    }
    if (left > 0 && ts.positions.get(pos.pid)) return this.holdAt(r, m, floor, fromSize(m, ts.positions.get(pos.pid)?.s ?? 0))
  }

  private holdAt(r: Stored, m: Market, floor: number, left: number) {
    this.deps.emit(r.owner, { kind: 'failed', rule: 'floor', pid: r.rule.pid, symbol: m.symbol, price: floor, amount: left, text: `stopped at your floor ${floor}, ${left} ${m.symbol} left open` })
    return `book past the floor ${floor}, ${left} left open`
  }

  // a close sent as an ioc limit at the floor, so it can never fill worse than the floor (spike g3). the
  // size is never more than the live position, perpl rejects a close bigger than the position (g5)
  private async close(r: Stored, id: string, ts: TradingSocket, pos: Position, m: Market, size: number, floor: number, why: string, stamps: Record<string, number>): Promise<string | number> {
    const k = 10 ** m.config.price_decimals
    const want = Math.min(toSize(m, size), pos.s)
    openIntent({ id, rule: r.id, owner: r.owner, kind: 'close', pid: pos.pid, size: fromSize(m, want), floor, stamps, body: { before: { size: fromSize(m, pos.s) }, why } })
    this.inflight.set(id, r.id)
    try {
      const t3 = Date.now()
      const txP = this.deps.nextTx(ts)
      const p = ts.send({ mkt: m.id, t: pos.sd === 1 ? OrderType.closeLong : OrderType.closeShort, p: Math.round(floor * k), s: want, fl: Flag.ioc, lv: 0, lp: pos.pid })
      sentAs(id, ts.lastRq)
      crashAt('sent')
      let res
      try { res = await p } catch (e) {
        const st = { ...stamps, t3, t4: Date.now() }
        settle(id, 'unknown', { stamps: st })
        writeRun({ owner: r.owner, rule: r.id, kind: 'unknown', body: { intent: id, kind: 'close', error: e instanceof Error ? e.message : String(e), stamps: st } })
        return 'the close went unanswered, reconcile settles it'
      }
      const t5 = Date.now()
      crashAt('acked')
      const o = res.order
      const filled = o ? fromSize(m, o.fs ?? 0) : 0
      if (!o || filled === 0) {
        const st = { ...stamps, t3, t4: t5 }
        const reason = o ? Reason[o.sr] ?? `sr ${o.sr}` : res.status?.status.msg ?? `status ${res.status?.status.code}`
        settle(id, 'rejected', { stamps: st, oid: o?.oid })
        writeRun({ owner: r.owner, rule: r.id, kind: 'reject', body: { intent: id, kind: 'close', floor, reason, stamps: st } })
        this.deps.log(`rule ${r.id} close at floor ${floor} filled nothing: ${reason}`)
        this.deps.emit(r.owner, { kind: 'failed', rule: 'floor', pid: pos.pid, symbol: m.symbol, price: floor, text: `stop held at the floor ${floor}, nothing sold (${reason})` })
        return `nothing sold at the floor ${floor}: ${reason}`
      }
      const landed = await txP
      const price = fromPrice(m, o.fp ?? 0)
      const st = { ...stamps, t3, t4: t5, t5, ...(landed?.block ? { b6: landed.block } : {}) }
      settle(id, 'filled', { fill: filled, tx: landed?.tx, oid: o.oid, stamps: st })
      writeRun({ owner: r.owner, rule: r.id, kind: 'fill', body: { intent: id, kind: 'close', size: filled, price, floor, tx: landed?.tx ?? null, stamps: st } })
      const side = pos.sd === 1 ? 'long' : 'short'
      if (r.rule.kind === 'stop') this.event(r.owner, { kind: 'stopSold', rule: r.id, pid: pos.pid, price })
      this.deps.emit(r.owner, { kind: 'closed', rule: r.rule.kind === 'funding' ? 'funding' : 'stop', pid: pos.pid, symbol: m.symbol, side, lv: pos.lv, tx: landed?.tx, amount: filled, price, text: `${r.rule.kind === 'funding' ? 'funding turned, sold' : 'stop sold'} ${filled} ${m.symbol} at ${price}, never below ${floor}` })
      this.deps.log(`rule ${r.id} close ${filled} at ${price}, floor ${floor}`)
      return filled
    } finally { this.inflight.delete(id) }
  }

  // an entry: an ioc limit open that never fills past the limit (spike g24: a limit the book cannot reach
  // fills nothing and does not rest). a fill hands the stop to its own rule on the new position. nothing
  // filled holds the entry, it tries again after ENTRY_RETRY_MS while the price is still there
  private async openEntry(r: Stored, id: string, ts: TradingSocket, m: Market, i: Extract<Intent, { kind: 'open' }>, stamps: Record<string, number>): Promise<string | void> {
    const free = fromCns(ts.account?.b ?? '0')
    if (free < i.ausd) {
      writeRun({ owner: r.owner, rule: r.id, kind: 'reject', body: { kind: 'open', ausd: i.ausd, free, why: 'not enough free ausd' } })
      this.deps.emit(r.owner, { kind: 'failed', symbol: m.symbol, text: `the ${m.symbol} ${i.side} entry needs ${i.ausd} ausd, ${free.toFixed(2)} is free` })
      return `not enough free ausd, ${free.toFixed(2)} of ${i.ausd}`
    }
    const k = 10 ** m.config.price_decimals, z = 10 ** m.config.size_decimals
    const size = Math.floor((i.ausd * i.leverage) / i.limit * z)
    if (size <= 0) throw new Error('the margin is too small for one unit of this market')
    const before = Object.fromEntries([...ts.positions.values()].filter(p => p.mkt === m.id).map(p => [p.pid, p.s]))
    openIntent({ id, rule: r.id, owner: r.owner, kind: 'open', size: size / z, stamps, body: { side: i.side, ausd: i.ausd, leverage: i.leverage, limit: i.limit, mkt: m.id, before, why: i.why } })
    this.inflight.set(id, r.id)
    try {
      const txP = this.deps.nextTx(ts)
      const t3 = Date.now()
      const p = ts.openLimit({ mkt: m.id, side: i.side, size, leverage: Math.round(i.leverage * 100), price: Math.round(i.limit * k) })
      sentAs(id, ts.lastRq)
      let res
      try { res = await p } catch (e) {
        const st = { ...stamps, t3, t4: Date.now() }
        settle(id, 'unknown', { stamps: st })
        writeRun({ owner: r.owner, rule: r.id, kind: 'unknown', body: { intent: id, kind: 'open', error: e instanceof Error ? e.message : String(e), stamps: st } })
        this.deps.log(`rule ${r.id} open unknown: ${e instanceof Error ? e.message : e}, reconcile settles it`)
        return 'the open is unknown, waiting for reconcile'
      }
      const t5 = Date.now()
      const o = res.order
      const filled = o?.fs ?? 0
      if (!o || filled === 0) {
        const reason = o ? Reason[o.sr] ?? `sr ${o.sr}` : res.status?.status.msg ?? `status ${res.status?.status.code}`
        settle(id, 'rejected', { oid: o?.oid, stamps: { ...stamps, t3, t4: t5 } })
        writeRun({ owner: r.owner, rule: r.id, kind: 'reject', body: { intent: id, kind: 'open', limit: i.limit, reason, stamps: { ...stamps, t3, t4: t5 } } })
        this.deps.log(`rule ${r.id} open at limit ${i.limit} filled nothing: ${reason}`)
        return `nothing filled at the limit ${i.limit}: ${reason}`
      }
      // the position frame follows the order frame, give it a moment to land in the socket's map
      let pos: Position | undefined
      for (let n = 0; n < 30 && !pos; n++) {
        pos = [...ts.positions.values()].find(x => x.mkt === m.id && (before[x.pid] === undefined || x.s !== before[x.pid]))
        if (!pos) await new Promise(res => setTimeout(res, 100))
      }
      const landed = await txP
      const price = fromPrice(m, o.fp ?? 0)
      const st = { ...stamps, t3, t4: t5, t5, ...(landed?.block ? { b6: landed.block } : {}) }
      settle(id, 'filled', { fill: filled / z, tx: landed?.tx, oid: o.oid, stamps: st })
      writeRun({ owner: r.owner, rule: r.id, kind: 'fill', body: { intent: id, kind: 'open', side: i.side, size: filled / z, price, limit: i.limit, pid: pos?.pid ?? null, tx: landed?.tx ?? null, stamps: st } })
      this.deps.emit(r.owner, { kind: 'opened', rule: 'entry', pid: pos?.pid, symbol: m.symbol, side: i.side, lv: Math.round(i.leverage * 100), tx: landed?.tx, amount: filled / z, price, text: `entry opened ${i.side} ${filled / z} ${m.symbol} at ${price}, limit ${i.limit}` })
      this.deps.log(`rule ${r.id} opened ${i.side} ${filled / z} at ${price}, pid ${pos?.pid ?? '?'}`)
      if (pos) { this.handOff(r, pos.pid, price); this.event(r.owner, { kind: 'opened', rule: r.id, pid: pos.pid, price }) }
      else this.deps.log(`rule ${r.id} filled but the position did not show, reconcile attaches the stop`)
    } finally { this.inflight.delete(id) }
  }

  // the entry's stop becomes its own rule on the position it opened, signed by the same signature
  // an entry hands its children to the position it opened: the old absolute stop, or the newer ones written
  // as distances from the fill. the ladder goes first so a breakeven stop can point at it. they ride the
  // entry's signature, the way every child here does
  private handOff(r: Stored, pid: number, fill?: number) {
    if (r.rule.kind === 'copy') {
      // remember which position this market's copy opened, so closing with them closes this one
      const pos = this.deps.session(r.owner)?.positions.get(pid)
      if (pos) { r.mem = { ...r.mem, copied: { ...(r.mem.copied ?? {}), [pos.mkt]: pid } }; q.saveMem.run(JSON.stringify(r.mem), Date.now(), r.id) }
      if (r.rule.stopPct && fill && pos) {
        const long = pos.sd === 1, k = r.rule.stopPct / 100
        const at = (x: number) => Number((fill * (long ? 1 - x : 1 + x)).toPrecision(4))
        const id = `stop-${pid}-copy-${r.id}`.slice(0, 64)
        if (!this.exists(id)) this.add(r.owner, { v: 1, id, pid, mkt: pos.mkt, forMs: 0, kind: 'stop', px: at(k), floor: at(k + 0.01), backstopPx: at(k + 0.02), slices: 4 }, r.by)
      }
      return
    }
    if (r.rule.kind !== 'entry') return
    const base = { v: 1 as const, pid, mkt: r.rule.mkt, forMs: 0 }
    const kids: Rule[] = []
    if (r.rule.stop) {
      const st = r.rule.stop
      kids.push({ ...base, id: `stop-${pid}-from-${r.id}`.slice(0, 64), kind: 'stop', px: st.px, floor: st.floor, backstopPx: st.backstopPx, slices: st.slices })
    }
    const t = r.rule.then
    if (t && fill) {
      const up = r.rule.side === 'long' ? 1 : -1
      const at = (pct: number) => Number((fill * (1 + up * pct / 100)).toPrecision(4))
      const ladderId = `ladder-${pid}-from-${r.id}`.slice(0, 64)
      if (t.ladder) kids.push({ ...base, id: ladderId, kind: 'ladder', steps: t.ladder.map(x => ({ px: at(x.pct), share: x.share, floor: at(x.floorPct) })) })
      if (t.stop) kids.push({
        ...base, id: `stop-${pid}-then-${r.id}`.slice(0, 64), kind: 'stop', px: at(-t.stop.pct), floor: at(-t.stop.floorPct), backstopPx: at(-t.stop.backstopPct), slices: t.stop.slices ?? 4,
        ...(t.stop.trailPct ? { trail: { pct: t.stop.trailPct, minMovePct: 0.5 } } : {}),
        ...(t.breakeven && t.ladder ? { breakeven: { ladder: ladderId, afterStep: 1 } } : {}),
      })
    }
    for (const k of kids) {
      if (this.exists(k.id)) continue
      this.add(r.owner, k, r.by)
      writeRun({ owner: r.owner, rule: r.id, kind: 'note', body: { text: `${k.kind} handed to ${k.id} on position ${pid}` } })
    }
  }

  // a recipe: every rule stored in one transaction, perpl orders placed after, in order
  addMany(owner: string, rules: Rule[], by: Stored['by'], sig: string | null) {
    db.exec('begin')
    try { for (const r of rules) this.add(owner, r, by, 'armed', sig) ; db.exec('commit') } catch (e) { db.exec('rollback'); throw e }
    return rules.map(r => this.rules.get(r.id)).filter((x): x is Stored => !!x)
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
    crashAt('acked')
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
    this.deps.emit(r.owner, {
      kind: 'added', rule: 'guard', pid: pos.pid, symbol: m.symbol, side: before.side, lv: pos.lv, tx,
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
      if (it.kind === 'open') {
        const b = JSON.parse(it.body) as { mkt: number; before: Record<string, number> }
        const made = [...ts.positions.values()].find(x => x.mkt === b.mkt && (b.before[x.pid] === undefined || x.s !== b.before[x.pid]))
        state = made ? 'filled' : 'void'
        why = made ? `position ${made.pid} is there, the open landed` : 'no new position on that market, the open did not land'
        settle(it.id, state, { stamps: { ...JSON.parse(it.stamps), reconciled: Date.now() } })
        writeRun({ owner, rule: it.rule, kind: 'reconcile', body: { intent: it.id, was: it.state, now: state, why } })
        this.deps.log(`reconcile ${it.id}: ${it.state} -> ${state}, ${why}`)
        const r = this.rules.get(it.rule)
        if (r && made) { this.handOff(r, made.pid, made.ep / 10 ** (this.deps.ctx()?.markets.find(x => x.id === made.mkt)?.config.price_decimals ?? 5)); this.finish(r, 'opened, found by reconcile') }
        continue
      }
      if (!pos) { state = it.kind === 'close' ? 'filled' : 'void'; why = it.kind === 'close' ? 'the position is gone, the close or another took it' : 'the position is gone' }
      else if (it.kind === 'add') {
        const now = fromCns(pos.c)
        const was = body.before?.collateral ?? now
        state = now >= was + (it.size ?? 0) * 0.9 ? 'filled' : 'rejected'
        why = `collateral was ${was.toFixed(4)}, now ${now.toFixed(4)}`
      } else if (it.kind === 'close') {
        const m = this.deps.ctx()?.markets.find(x => x.id === pos.mkt)
        const now = m ? fromSize(m, pos.s) : 0
        const was = (body as { before?: { size?: number } }).before?.size ?? now
        state = was - now >= (it.size ?? 0) * 0.9 ? 'filled' : 'rejected'
        why = `size was ${was}, now ${now}`
      } else { state = 'rejected'; why = 'unknown kind, left for a person' }
      settle(it.id, state, { fill: state === 'filled' ? it.size ?? undefined : undefined, stamps: { ...JSON.parse(it.stamps), reconciled: Date.now() } })
      writeRun({ owner, rule: it.rule, kind: 'reconcile', body: { intent: it.id, was: it.state, now: state, why } })
      this.deps.log(`reconcile ${it.id}: ${it.state} -> ${state}, ${why}`)
    }
    // old backstops a move could not cancel come off now, whatever rule they belonged to
    for (const row of db.prepare(`select * from orders where owner = ? and state = 'orphan'`).all(owner) as OrderRow[]) {
      const order = ts.orders.get(row.oid)
      if (!order || order.st !== 8) { q.orderState.run('gone', row.size, row.rule, row.step); continue }
      void this.lane(owner, async () => {
        const res = await ts.cancel(order).catch(() => null)
        if (res?.order?.st === 5) { q.orderState.run('cancelled', row.size, row.rule, row.step); writeRun({ owner, rule: row.rule, kind: 'reconcile', body: { orphan: row.oid, why: 'old backstop cancelled' } }) }
      }).catch(() => {})
    }
    // a rule caught mid fire by a crash goes back to watching once its intents are settled
    for (const r of this.rules.values()) {
      if (r.owner !== owner || [...this.inflight.values()].includes(r.id)) continue
      if (r.state === 'firing' || r.state === 'working') move(r, 'armed', 'reconciled after a restart or a drop')
      const pos = r.rule.kind === 'ping' || r.rule.kind === 'entry' ? true : ts.positions.get(r.rule.pid)
      const back = r.rule.kind === 'stop' ? q.orderOf.get(r.id, 'backstop') as OrderRow | undefined : undefined
      if (!pos && (r.state === 'armed' || r.state === 'held' || r.state === 'paused')) {
        // the position went while this rule watched it. if pehra never sold it and a backstop rested, the
        // backstop is what closed it, perpl fired it on its own
        const sold = (db.prepare(`select count(*) as n from intents where rule = ? and kind = 'close' and state = 'filled'`).get(r.id) as { n: number }).n
        const order = back ? ts.orders.get(back.oid) : undefined
        const why = back && back.state === 'resting' && !sold ? (order?.st === 10 ? 'the backstop on perpl fired' : 'the position closed with the backstop resting on perpl, pehra did not sell') : 'position closed'
        if (back) q.orderState.run(order?.st === 10 ? 'fired' : 'gone', back.size, r.id, 'backstop')
        this.finish(r, why)
        if (back && back.state === 'resting' && !sold) void this.attribute(r, back).catch(e => this.deps.log(`backstop history for ${r.id} failed: ${e instanceof Error ? e.message : e}`))
        continue
      }
      if (r.rule.kind === 'ladder' && pos) { this.reconcileSteps(r, ts); continue }
      if (back && back.state === 'resting' && pos !== true && pos && !this.moving.has(r.id)) {
        const o = ts.orders.get(back.oid)
        const m = this.deps.ctx()?.markets.find(x => x.id === r.rule.mkt)
        if (o && m && (o.os ?? o.s) > pos.s) {
          // perpl normally shrinks it with the position (g5b), an oversized trigger would fail forever (g5)
          writeRun({ owner, rule: r.id, kind: 'reconcile', body: { backstop: back.oid, os: o.os ?? o.s, live: pos.s, why: 'backstop larger than the position, replacing' } })
          void this.lane(owner, async () => { await ts.cancel(o); q.orderState.run('cancelled', back.size, r.id, 'backstop'); await this.placeBackstop(r) }).catch(() => {})
        } else if (!o) {
          writeRun({ owner, rule: r.id, kind: 'reconcile', body: { backstop: back.oid, why: 'backstop no longer resting, placing it again' } })
          q.orderState.run('gone', back.size, r.id, 'backstop')
          void this.lane(owner, () => this.placeBackstop(r)).catch(() => {})
        }
      }
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
