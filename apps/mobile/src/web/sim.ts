// the web try page plays every write out on the visitor's own copy of the demo account. trades fill at the
// live mark, positions move with it, rules arm, money lands, and none of it leaves the browser. reads still
// come from the real account and the server, then get the visitor's changes laid over them
import { getContext, fromPrice, liquidationPrice, liquidationDistance, type Market } from '@pehra/perpl'
import type { GuardEvent, GuardState, PositionHealth } from '../guard'
import type { RuleRow, CopyReceipt } from '../rules'
import type { Moved, Wallet } from '../fund'
import { marketData } from '../warm'
import { DEMO } from './demo'

const API = process.env.EXPO_PUBLIC_API ?? 'http://localhost:8787'
type Settings = NonNullable<GuardState['settings']>

type State = {
  free: number
  wallet: { usdc: number; ausd: number; mon: number }
  opened: PositionHealth[]
  closed: number[]
  margin: Record<number, number>
  brackets: Record<number, { stop?: number; take?: number }>
  events: GuardEvent[]
  rules: RuleRow[]
  gone: string[]
  held: Record<string, boolean>
  guard: Partial<Settings>
  watches: Record<string, number>
  unwatched: string[]
  forwarding: boolean
}

const blank = (): State => ({ free: 0, wallet: { usdc: 0, ausd: 0, mon: 0 }, opened: [], closed: [], margin: {}, brackets: {}, events: [], rules: [], gone: [], held: {}, guard: {}, watches: {}, unwatched: [], forwarding: true })
const KEY = 'pehra-sim'
const load = (): State => { try { return { ...blank(), ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}') } } catch { return blank() } }
const st = load()
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)) } catch {} }

let markets: Market[] = []
// asked on first use, after polyfills.web has pointed perpl's addresses at the relay
let asked: Promise<void> | null = null
const ready = () => (asked ??= getContext('testnet').then(c => { markets = c.markets }).catch(() => { asked = null }))
const bySymbol = (s: string) => markets.find(m => m.symbol === s)
const byId = (id: number) => markets.find(m => m.id === id)
const markOf = (m: Market) => fromPrice(m, marketData()?.states.get(m.id)?.mrk ?? m.state.mrk)
const round = (n: number, d: number) => Number(n.toFixed(d))
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const hash = () => `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
const pnlOf = (h: PositionHealth) => (h.side === 'long' ? 1 : -1) * (h.mark - h.entry) * h.size

function event(e: Omit<GuardEvent, 'at'>) {
  st.events.unshift({ at: Date.now(), ...e })
  st.events = st.events.slice(0, 60)
}

// a position with this visitor's margin and the live mark
function live(h: PositionHealth): PositionHealth {
  const m = byId(h.mkt)
  const collateral = h.collateral + (st.margin[h.pid] ?? 0)
  const mark = m ? markOf(m) : h.mark
  const liq = m ? liquidationPrice(h.side as 'long' | 'short', h.entry, h.size, collateral, m.config.maintenance_margin) : h.liq
  return { ...h, ...st.brackets[h.pid], collateral, mark, liq, distance: liquidationDistance(h.side as 'long' | 'short', mark, liq) }
}

function positions(real: PositionHealth[]) {
  return [...real, ...st.opened].filter(h => !st.closed.includes(h.pid)).map(live)
}

let lastReal: PositionHealth[] = []

function guardState(g: GuardState): GuardState {
  void ready()
  entries()
  lastReal = g.health ?? []
  const events = [...st.events, ...(g.events ?? [])].sort((a, b) => b.at - a.at)
  return {
    ...g,
    balance: (g.balance ?? 0) + st.free,
    forwarding: st.forwarding ? g.forwarding : false,
    settings: g.settings ? { ...g.settings, ...st.guard } : g.settings,
    health: positions(g.health ?? []),
    events,
  }
}

function rules(rows: RuleRow[]): RuleRow[] {
  return [...st.rules, ...rows]
    .filter(r => !st.gone.includes(r.id))
    .map(r => (r.id in st.held ? { ...r, state: st.held[r.id] ? 'held' : 'armed' } : r))
}

// the writes, by the path the app posts to
type Body = Record<string, any>
const routes: [RegExp, (b: Body, m: RegExpMatchArray) => Promise<unknown> | unknown][] = [
  [/^\/order$/, async b => {
    await ready()
    const m = bySymbol(b.symbol)
    if (!m) throw new Error('no market')
    await wait(650 + Math.random() * 300)
    const { size, price } = open(m, b.side, b.size, b.leverage)
    return { filled: true, status: 4, size, price }
  }],
  [/^\/close$/, async b => {
    await wait(600)
    const r = close(Number(b.pid))
    if (!r) throw new Error('no such position')
    return r
  }],
  [/^\/close-all$/, async () => {
    await wait(800)
    const open = positions(lastReal)
    open.forEach(h => close(h.pid))
    return { closed: open.length }
  }],
  [/^\/brackets$/, async b => {
    await wait(500)
    const h = positions(lastReal).find(x => x.pid === Number(b.pid))
    st.brackets[b.pid] = { ...st.brackets[b.pid], ...(b.stop ? { stop: b.stop } : {}), ...(b.take ? { take: b.take } : {}) }
    const parts = [b.stop ? `stop at ${b.stop}` : '', b.take ? `take profit at ${b.take}` : ''].filter(Boolean).join(', ')
    event({ kind: 'bracket', pid: b.pid, symbol: h?.symbol, text: `${h?.symbol ?? ''}: ${parts}` })
    return { stop: b.stop, take: b.take }
  }],
  [/^\/guard\/add$/, async b => {
    await wait(700)
    const before = positions(lastReal).find(x => x.pid === Number(b.pid))
    st.margin[b.pid] = (st.margin[b.pid] ?? 0) + Number(b.ausd)
    st.free -= Number(b.ausd)
    const after = positions(lastReal).find(x => x.pid === Number(b.pid))
    if (before && after) event({ kind: 'manual', pid: b.pid, symbol: after.symbol, side: after.side, addAusd: Number(b.ausd), before: { distancePct: before.distance * 100, collateral: before.collateral }, after: { distancePct: after.distance * 100, collateral: after.collateral }, text: `collateral now ${after.collateral.toFixed(2)} AUSD, ${(after.distance * 100).toFixed(1)}% from liquidation` })
    return { health: after ? { distance: after.distance, collateral: after.collateral } : undefined }
  }],
  [/^\/guard\/0x[0-9a-fA-F]{40}$/, b => { Object.assign(st.guard, b); return { settings: { enabled: true, thresholdPct: 5, targetPct: 10, minAddAusd: 1, maxAddAusdPerDay: 20, ...st.guard } } }],
  [/^\/guard\/(start|finish|revoke)$/, (_b, m) => { st.forwarding = m[1] !== 'revoke'; return m[1] === 'start' ? { typed_data: null } : { ok: true, revoked: true } }],
  [/^\/activity$/, b => { event({ kind: b.kind, amount: b.amount, tx: b.tx, text: b.text }); return { ok: true } }],
  [/^\/rules\/0x[0-9a-fA-F]{40}$/, b => ({ rule: arm(b.rule) })],
  [/^\/rules\/0x[0-9a-fA-F]{40}\/many$/, b => ({ rules: (b.rules as RuleRow['rule'][]).map(r => arm(r, b.name)) })],
  [/^\/rules\/0x[0-9a-fA-F]{40}\/([^/]+)\/cancel$/, (_b, m) => { st.gone.push(m[1]); return { ok: true } }],
  [/^\/rules\/0x[0-9a-fA-F]{40}\/([^/]+)\/(hold|resume)$/, (_b, m) => { st.held[m[1]] = m[2] === 'hold'; return { state: m[2] === 'hold' ? 'held' : 'armed' } }],
  [/^\/rules\/0x[0-9a-fA-F]{40}\/pause$/, () => { rules([]).forEach(r => { st.held[r.id] = true }); return { paused: st.rules.length } }],
  [/^\/(watch|unwatch)$/, b => {
    const t = String(b.target).toLowerCase()
    if (b.__path === '/watch') { st.watches[t] = Date.now(); st.unwatched = st.unwatched.filter(x => x !== t) }
    else { delete st.watches[t]; st.unwatched.push(t) }
    return { watching: Object.entries(st.watches).map(([target, created]) => ({ target, created })) }
  }],
  [/^\/recipes$/, () => ({ id: 'c4df5bb4e7' })],
  [/^\/recipes\/[0-9a-f]{10}\/copied$/, () => ({ ok: true })],
  [/^\/alerts\/0x[0-9a-fA-F]{40}$/, b => { alerts = { ...alerts, ...b, on: { ...alerts?.on, ...b.on } }; return { prefs: alerts } }],
  [/^\/drip(\/usdc)?$/, async () => { await wait(900); st.wallet.usdc += 50; return { usdc: 50, ms: 900 } }],
  [/^\/session$/, () => ({ token: 'demo', exp: Date.now() + 7 * 86_400_000 })],
  [/^\/push\/(register|test)$/, () => ({ ok: true })],
  [/^\/log$/, () => ({ ok: true })],
]
let alerts: Body | null = null

function open(m: Market, side: 'long' | 'short', coins: number, leverage: number, rule?: GuardEvent['rule']) {
  const mark = markOf(m)
  const price = round(mark * (1 + (side === 'long' ? 1 : -1) * 0.0002), m.config.price_decimals)
  const size = round(coins, m.config.size_decimals)
  const collateral = (size * price) / leverage
  const pid = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  st.opened.push({ pid, side, entry: price, mark, liq: 0, distance: 0, collateral, size, symbol: m.symbol, lv: leverage * 100, mkt: m.id })
  st.free -= collateral
  event({ kind: 'opened', rule, pid, symbol: m.symbol, side, lv: leverage * 100, amount: size, price, text: `${side} ${size} ${m.symbol} at ${leverage}x, filled at ${price}` })
  return { pid, size, price }
}

// an armed entry opens when the live mark gets to its price, checked on every account read
function entries() {
  for (const r of st.rules) {
    const e = r.rule
    if (e.kind !== 'entry' || r.state !== 'armed' || st.gone.includes(r.id) || st.held[r.id]) continue
    const m = byId(e.mkt)
    if (!m) continue
    const mark = markOf(m)
    if (e.when === 'below' ? mark > e.px : mark < e.px) continue
    open(m, e.side, (e.margin * e.leverage) / mark, e.leverage, 'entry')
    r.state = 'done'
    r.fires = 1
    r.lastRun = Date.now()
    save()
  }
}

// a copy fires a little after it is armed, as if the trader just opened, and lands a few blocks after them
const receipts: CopyReceipt[] = []
function copySoon(r: RuleRow) {
  setTimeout(async () => {
    await ready()
    const c = r.rule
    if (c.kind !== 'copy' || st.gone.includes(r.id) || st.held[r.id]) return
    const m = byId(c.mkt) ?? bySymbol('MON')
    if (!m) return
    const side = Math.random() < 0.6 ? 'long' : 'short'
    const lev = Math.min(c.maxLeverage, 3)
    const { size, price } = open(m, side, (c.margin * lev) / markOf(m), lev)
    const block = 48_000_000 + Math.floor((Date.now() / 400) % 1_000_000)
    const blocks = 4 + Math.floor(Math.random() * 4)
    receipts.unshift({ rule: r.id, target: c.target.toLowerCase(), kind: 'open', side, size, price, theirTx: hash(), theirBlock: block - blocks, yourTx: hash(), yourBlock: block, blocks, at: Date.now() })
    r.fires += 1
    r.lastRun = Date.now()
    save()
  }, 18_000 + Math.random() * 8_000)
}

function close(pid: number) {
  const h = positions(lastReal).find(x => x.pid === pid)
  if (!h) return null
  const pnl = pnlOf(h)
  st.closed.push(pid)
  st.free += h.collateral + pnl
  event({ kind: 'closed', pid, symbol: h.symbol, side: h.side, lv: h.lv, amount: h.size, pnl, price: h.mark, text: `closed ${h.side} ${h.size} ${h.symbol} at ${h.mark}, ${pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)} AUSD` })
  return { price: h.mark, pnl, collateral: h.collateral }
}

function arm(rule: RuleRow['rule'], name?: string) {
  const id = `${rule.kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const row: RuleRow = { id, kind: rule.kind, state: 'armed', mode: 'pehra', by: name ?? 'you', fires: 0, rule: { ...rule, id } as RuleRow['rule'], lastRun: null, created: Date.now() }
  st.rules.unshift(row)
  if (rule.kind === 'copy') copySoon(row)
  return { id, state: 'armed', mode: 'pehra' }
}

// the reads that carry the visitor's changes
const views: [RegExp, (j: any, u: URL) => unknown][] = [
  [/^\/guard\/0x[0-9a-fA-F]{40}$/, j => guardState(j)],
  [/^\/rules\/0x[0-9a-fA-F]{40}$/, j => ({ ...j, rules: rules(j.rules ?? []) })],
  [/^\/watches\/0x[0-9a-fA-F]{40}$/, j => {
    const real = (j.watching ?? []).filter((w: { target: string }) => !st.unwatched.includes(w.target.toLowerCase()) && !(w.target.toLowerCase() in st.watches))
    return { watching: [...Object.entries(st.watches).map(([target, created]) => ({ target, created })), ...real] }
  }],
  [/^\/copies\/0x[0-9a-fA-F]{40}$/, (j, u) => ({ ...j, receipts: [...receipts.filter(c => !u.searchParams.get('of') || c.target === u.searchParams.get('of')?.toLowerCase()), ...(j.receipts ?? [])] })],
  [/^\/alerts\/0x[0-9a-fA-F]{40}$/, j => (alerts ? { ...j, prefs: { ...j.prefs, ...alerts, on: { ...j.prefs?.on, ...alerts.on } } } : j)],
]

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
// reads that go out as a post
const PASS = /^\/(replay)$/

export function installSim() {
  const real = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(API) || url.startsWith(`${API}/perpl`)) return real(input, init)
    const path = new URL(url).pathname
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'POST' && !PASS.test(path)) {
      const route = routes.find(([re]) => re.test(path))
      if (!route) return json({ ok: true })
      try {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        const out = await route[1]({ ...body, __path: path }, path.match(route[0])!)
        save()
        return json(out)
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
      }
    }
    const r = await real(input, init)
    const view = views.find(([re]) => re.test(path))
    if (!view || !r.ok) return r
    return json(view[1](await r.json(), new URL(url)))
  }) as typeof fetch
}

// the money moves that would be passkey signed transactions on monad
async function moved(out: number, n = 2): Promise<Moved> {
  const t0 = Date.now()
  await wait(1100 + Math.random() * 400)
  const first = 48_000_000 + Math.floor((Date.now() / 400) % 1_000_000)
  const blocks = Array.from({ length: n }, (_, i) => first + Math.floor(i / 2))
  return { ms: Date.now() - t0, hashes: Array.from({ length: n }, hash), blocks, block: blocks[n - 1], out }
}
export const sim = {
  wallet: (w: Wallet): Wallet => ({ ...w, usdc: w.usdc + st.wallet.usdc, ausd: w.ausd + st.wallet.ausd, mon: w.mon + st.wallet.mon, perpl: w.perpl + st.free }),
  async fund(usdc: number) { const r = await moved(usdc, 4); st.wallet.usdc -= usdc; st.free += usdc; save(); return r },
  async deposit(ausd: number) { const r = await moved(ausd); st.wallet.ausd -= ausd; st.free += ausd; save(); return r },
  async withdraw(ausd: number) { const r = await moved(ausd, 3); st.free -= ausd; st.wallet.usdc += ausd; save(); return r },
  async send(asset: 'ausd' | 'usdc' | 'mon', amount: number) { const r = await moved(amount, 1); st.wallet[asset] -= amount; save(); return r },
  hash,
  get address() { return DEMO },
}
