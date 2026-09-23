// price history for the trade chart, straight from perpl's candle stream. the screen opens its own
// market data socket so the warm one keeps its few subscriptions, and switching range swaps one
// stream for another on the same socket once it is open.
import { useEffect, useRef, useState } from 'react'
import { fromPrice, MarketDataSocket, type Candle, type CandlesFrame, type Market } from '@pehra/perpl'

export type Range = '1h' | '1d' | '1w' | '1m'
// candle length in seconds and how many make the range
export const ranges: Record<Range, { res: number; count: number }> = {
  '1h': { res: 60, count: 60 },
  '1d': { res: 900, count: 96 },
  '1w': { res: 3600, count: 168 },
  '1m': { res: 14400, count: 180 },
}

export type Point = { t: number; p: number }

export function useCandles(market: Market | undefined, range: Range) {
  const [points, setPoints] = useState<Point[]>([])
  const [sock, setSock] = useState<MarketDataSocket | null>(null)
  const rangeRef = useRef(range)
  rangeRef.current = range
  const byTime = useRef(new Map<number, Candle>())

  useEffect(() => {
    if (!market) return
    const ws = new MarketDataSocket('testnet')
    let alive = true
    const off = ws.on(f => {
      if (f.mt !== 11 && f.mt !== 12) return
      const c = f as CandlesFrame
      const want = ranges[rangeRef.current]
      if (c.r !== want.res) return
      if (c.mt === 11) byTime.current = new Map()
      for (const k of c.d) byTime.current.set(k.t, k)
      const list = [...byTime.current.values()].sort((a, b) => a.t - b.t).slice(-want.count)
      if (alive) setPoints(list.map(k => ({ t: k.t, p: fromPrice(market, k.c) })))
    })
    ws.connect([]).then(() => alive && setSock(ws)).catch(() => {})
    return () => { alive = false; off(); ws.close(); setSock(null) }
  }, [market?.id])

  useEffect(() => {
    if (!market || !sock) return
    const stream = MarketDataSocket.streams(10143).candles(market.id, ranges[range].res)
    setPoints([])
    byTime.current = new Map()
    sock.subscribe([stream])
    return () => { sock.subscribe([stream], false) }
  }, [range, sock, market?.id])

  return points
}
