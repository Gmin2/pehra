// price history for the trade chart, from perpl's candle stream on the market data socket the app
// already opened at start (a fresh socket costs about two seconds of tls over 5g). candles are kept
// per stream, so a market seen once opens instantly, and home starts the fetch on the row's press in.
import { useEffect, useState } from 'react'
import { fromPrice, MarketDataSocket, type Candle, type CandlesFrame, type Market, type SubscribedFrame } from '@pehra/perpl'
import { marketData, warmChain } from './warm'

export type Range = '1h' | '1d' | '1w' | '1m'
// candle length in seconds and how many make the range
export const ranges: Record<Range, { res: number; count: number }> = {
  '1h': { res: 60, count: 60 },
  '1d': { res: 900, count: 96 },
  '1w': { res: 3600, count: 168 },
  '1m': { res: 14400, count: 180 },
}

export type Point = { t: number; p: number }

const cache = new Map<string, Map<number, Candle>>()
const sids = new Map<number, string>()
const listeners = new Map<string, Set<() => void>>()
// perpl allows 16 streams a connection and the warm socket already holds two, so the oldest candle
// streams are dropped past six
const live: string[] = []
let hooked: MarketDataSocket | null = null
const hookedAll = new WeakSet<MarketDataSocket>()
const pending = new Set<string>()

const streamFor = (m: Market, range: Range) => MarketDataSocket.streams(10143).candles(m.id, ranges[range].res)

function hook(ws: MarketDataSocket) {
  hooked = ws
  if (hookedAll.has(ws)) return
  hookedAll.add(ws)
  // the snapshot can arrive before the subscribe ack that names its sid, so it waits for it
  const early = new Map<number, CandlesFrame>()
  const take = (c: CandlesFrame) => {
    const stream = sids.get(c.sid)
    if (!stream) {
      if (c.mt === 11) early.set(c.sid, c)
      return
    }
    if (c.mt === 11 || !cache.has(stream)) cache.set(stream, new Map())
    const byTime = cache.get(stream)!
    for (const k of c.d) byTime.set(k.t, k)
    // a snapshot shows at once, updates land every block so they go out at most four times a second
    if (c.mt === 11) listeners.get(stream)?.forEach(fn => fn())
    else if (!pending.has(stream)) {
      pending.add(stream)
      setTimeout(() => { pending.delete(stream); listeners.get(stream)?.forEach(fn => fn()) }, 250)
    }
  }
  ws.on(f => {
    if (f.mt === 6)
      for (const s of (f as SubscribedFrame).subs) {
        sids.set(s.sid, s.stream)
        const c = early.get(s.sid)
        if (c) { early.delete(s.sid); take(c) }
      }
    if (f.mt === 11 || f.mt === 12) take(f as CandlesFrame)
  })
}

// the warm socket keeps every stream it was asked for and resubscribes after a drop, so asking once
// is enough even while it is down
function ensure(stream: string) {
  warmChain()
  const ws = marketData()
  if (!ws) return
  if (hooked && hooked !== ws) { live.length = 0; sids.clear() }
  hook(ws)
  if (live.includes(stream)) return
  ws.subscribe([stream])
  live.push(stream)
  if (live.length > 6) {
    const old = live.shift()!
    ws.subscribe([old], false)
    cache.delete(old)
  }
}

export function prefetchCandles(m: Market | undefined, range: Range = '1d') {
  if (m) ensure(streamFor(m, range))
}

function read(m: Market, range: Range): Point[] {
  const byTime = cache.get(streamFor(m, range))
  if (!byTime) return []
  return [...byTime.values()].sort((a, b) => a.t - b.t).slice(-ranges[range].count).map(k => ({ t: k.t, p: fromPrice(m, k.c) }))
}

export function useCandles(market: Market | undefined, range: Range) {
  const [points, setPoints] = useState<Point[]>(() => (market ? read(market, range) : []))
  useEffect(() => {
    if (!market) return
    const stream = streamFor(market, range)
    setPoints(read(market, range))
    const fn = () => setPoints(read(market, range))
    if (!listeners.has(stream)) listeners.set(stream, new Set())
    listeners.get(stream)!.add(fn)
    ensure(stream)
    return () => void listeners.get(stream)?.delete(fn)
  }, [market?.id, range])
  return points
}
