// shared bits for the oct 2 ground truth spikes (g1..g13). signs in with the payer's own perpl api key
// through the real TradingSocket, prints every order and position frame compactly, and waits on them.
import { TradingSocket, type Order, type Position, type TradingFrame } from '../packages/perpl/src/index'
import { env, sleep } from './perplws'

export { sleep }
export const MON = 64

export function stamp() { return new Date().toISOString().slice(11, 23) }

export function show(f: TradingFrame) {
  if (f.mt === 24) for (const o of (f as { d: Order[] }).d)
    console.log(stamp(), '<- order', JSON.stringify({ rq: o.rq, oid: o.oid, t: o.t, st: o.st, sr: o.sr, fr: o.fr, p: o.p, s: o.s, fs: o.fs, fp: o.fp, tp: o.tp, tpc: o.tpc, lp: o.lp }))
  else if (f.mt === 27) for (const p of (f as { d: Position[] }).d)
    console.log(stamp(), '<- position', JSON.stringify({ pid: p.pid, st: p.st, sr: p.sr, s: p.s, c: p.c, ep: p.ep }))
  else if (f.mt === 3) console.log(stamp(), '<- status', JSON.stringify(f))
  else if (f.mt === 21) {
    const a = f as { b: string; lfr?: number; h?: { et: number; at?: { txid?: string } }[] }
    console.log(stamp(), '<- account', a.b, 'lfr', a.lfr, (a.h ?? []).map(e => `et${e.et}${e.at?.txid ? ' tx 0x' + e.at.txid : ''}`).join(', '))
  }
}

export async function connect() {
  const ts = new TradingSocket({ pingMs: Number(process.env.PING_MS ?? 30_000), net: 'testnet', apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}`, onFrame: show, onClose: (c, r) => console.log(stamp(), 'socket closed', c, r) })
  await ts.connect()
  console.log(stamp(), 'signed in, account', ts.account?.id, 'balance', ts.account?.b, 'lfr', ts.account?.lfr, 'positions', ts.positions.size, 'orders', ts.orders.size)
  return ts
}

// wait until a predicate over the socket state holds, or time out
export async function until(label: string, fn: () => boolean, ms = 10_000) {
  const t0 = Date.now()
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`)
    await sleep(100)
  }
}

export function monPosition(ts: TradingSocket) { return [...ts.positions.values()].find(p => p.mkt === MON) ?? null }
export function restingOn(ts: TradingSocket, pid: number) { return [...ts.orders.values()].filter(o => o.lp === pid && o.st === 8) }

// a fresh mark from the public market state on every call
export async function mark() {
  const r = await fetch('https://testnet.perpl.xyz/api/v1/pub/context')
  const ctx = await r.json() as { markets: { id: number; state: { mrk: number; bid: number; ask: number; lst: number } }[] }
  const m = ctx.markets.find(x => x.id === MON)
  if (!m) throw new Error('no mon market')
  return m.state
}

export async function openLong(ts: TradingSocket, size = 200, lv = 200) {
  const have = monPosition(ts)
  if (have) { console.log(stamp(), 'reusing open position', have.pid, 'size', have.s); return have }
  const r = await ts.openMarket({ mkt: MON, side: 'long', size, leverage: lv })
  console.log(stamp(), 'open long ->', r.order?.st, 'fill', r.order?.fp, 'size', r.order?.fs)
  await until('position', () => monPosition(ts) !== null)
  return monPosition(ts) as Position
}

export async function closeAll(ts: TradingSocket) {
  for (const p of [...ts.positions.values()]) {
    const r = await ts.closeMarket(p)
    console.log(stamp(), 'close', p.pid, '->', r.order?.st, r.order?.sr, 'fill', r.order?.fp)
  }
  for (const o of [...ts.orders.values()].filter(o => o.st === 8)) {
    const r = await ts.cancel(o)
    console.log(stamp(), 'cancel leftover trigger', o.oid, '->', r.order?.st, r.order?.sr)
  }
}
