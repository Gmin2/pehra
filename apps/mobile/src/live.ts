// the live data the screens read: markets from perpl's context and market data stream, the account,
// positions and guard events from the server, all as hooks so a screen only re-renders on real change.
import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getContext, fromPrice, type Market, type MarketState } from '@pehra/perpl'
import { marketData, warmChain } from './warm'
import { guardState, type GuardState } from './guard'

export type LiveMarket = {
  id: number
  symbol: string
  name: string
  mark: number
  last: number
  change24h: number
  fundingRate: number
  openInterest: number
  priceDecimals: number
  sizeDecimals: number
  maintenanceMargin: number
  market: Market
}

const marketColors: Record<string, string> = {
  BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', MON: '#836ef9', ZEC: '#f4b728', LIT: '#00b5ed', PUMP: '#2ecc71',
}
export const marketColor = (symbol: string) => marketColors[symbol] ?? '#9E4DFD'

function shape(m: Market, s: MarketState | undefined): LiveMarket {
  const st = s ?? m.state
  const mark = fromPrice(m, st.mrk)
  const prev = fromPrice(m, st.prv)
  return {
    id: m.id, symbol: m.symbol, name: `${m.symbol} perp`, mark, last: fromPrice(m, st.lst),
    change24h: prev > 0 ? ((mark - prev) / prev) * 100 : 0,
    fundingRate: m.funding.rate / 1_000_000,
    openInterest: st.oi,
    priceDecimals: m.config.price_decimals, sizeDecimals: m.config.size_decimals, maintenanceMargin: m.config.maintenance_margin,
    market: m,
  }
}

// markets tick every block. the hook coalesces ticks to four renders a second at most.
export function useMarkets() {
  const [markets, setMarkets] = useState<LiveMarket[]>([])
  const ctx = useRef<Market[]>([])
  useEffect(() => {
    let alive = true
    let dirty = false
    warmChain()
    getContext('testnet').then(c => {
      if (!alive) return
      ctx.current = c.markets.filter(m => m.config.is_open)
      const md = marketData()
      setMarkets(ctx.current.map(m => shape(m, md?.states.get(m.id))))
    }).catch(() => {})
    const off = marketData()?.on(f => { if (f.mt === 9) dirty = true })
    const timer = setInterval(() => {
      if (!dirty || !ctx.current.length) return
      dirty = false
      const md = marketData()
      setMarkets(ctx.current.map(m => shape(m, md?.states.get(m.id))))
    }, 250)
    return () => { alive = false; off?.(); clearInterval(timer) }
  }, [])
  return markets
}

// the account as the server sees it: balance, positions with their health, guard settings and events.
// the last answer is kept in memory and on disk, so every screen (and a cold start) draws the last known
// balance at once and the fresh one replaces it a moment later. `stale` is true until then.
const known = new Map<string, GuardState>()
const KEY = (a: string) => `pehra-account-${a.toLowerCase()}`
let saveTimer: ReturnType<typeof setTimeout> | null = null
function remember(address: string, g: GuardState) {
  known.set(address.toLowerCase(), g)
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    const latest = known.get(address.toLowerCase())
    if (latest) void AsyncStorage.setItem(KEY(address), JSON.stringify(latest)).catch(() => {})
  }, 3000)
}

export function useAccount(address: string | null, everyMs = 2000) {
  const [state, setState] = useState<GuardState | null>(() => (address ? known.get(address.toLowerCase()) ?? null : null))
  const [stale, setStale] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!address) { setState(null); return }
    let alive = true, fresh = false
    const cached = known.get(address.toLowerCase())
    if (cached) setState(cached)
    else
      AsyncStorage.getItem(KEY(address))
        .then(raw => { if (alive && raw && !fresh) setState(JSON.parse(raw) as GuardState) })
        .catch(() => {})
    const tick = async () => {
      try {
        const g = await guardState(address)
        if (!alive) return
        fresh = true
        remember(address, g)
        setState(g)
        setStale(g.live === false)
        setError(null)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void tick()
    const timer = setInterval(tick, everyMs)
    return () => { alive = false; clearInterval(timer) }
  }, [address, everyMs])
  return { account: state, stale, error }
}

export const money = (n: number, digits = 2) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
export const pct = (n: number, digits = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
export const price = (m: LiveMarket, n: number) => n.toLocaleString('en-US', { minimumFractionDigits: m.priceDecimals, maximumFractionDigits: m.priceDecimals })
