// everything the trade tap needs is opened at app start: the rpc websocket, the market data stream,
// the perpl context, and for a returning account the signed in trading socket. over 5g each tls
// handshake costs about two seconds, so none of them may happen on the tap.
import { AppState } from 'react-native'
import { feeCaps, getContext, MarketDataSocket, publicClient, TradingSocket, type Enrolled } from '@pehra/perpl'
import { loadApiKey } from './keys'

let market: MarketDataSocket | null = null
let trading: TradingSocket | null = null
let opening: Promise<TradingSocket> | null = null
let lastKey: Enrolled | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let log: (s: string) => void = () => {}

export const setWarmLog = (fn: (s: string) => void) => { log = fn }
export const marketData = () => market
export const tradingReady = () => trading

export function warmChain() {
  const pub = publicClient('testnet')
  void feeCaps(pub)
  void getContext('testnet')
  if (!market) {
    market = new MarketDataSocket('testnet')
    const s = MarketDataSocket.streams(10143)
    market.connect([s.heartbeat, s.marketState]).catch(() => { market = null })
    const opened = Date.now()
    let lastHead = 0
    const watch = setInterval(() => {
      const h = market?.head ?? 0
      log(`market data head ${h}${h === lastHead ? ' (stalled)' : ''} at ${Math.round((Date.now() - opened) / 1000)}s`)
      lastHead = h
      if (Date.now() - opened > 130_000) clearInterval(watch)
    }, 25_000)
  }
}

// one trading socket per api key. when the server drops it, it comes back with a short backoff so the
// trade tap finds it open. a tap that lands mid reconnect waits on the same promise.
export function tradingSocket(key: Enrolled): Promise<TradingSocket> {
  if (trading && lastKey?.apiKey === key.apiKey) { log('trading socket reused'); return Promise.resolve(trading) }
  if (opening && lastKey?.apiKey === key.apiKey) return opening
  trading?.close()
  lastKey = key
  return open(key, 0)
}

function open(key: Enrolled, attempt: number): Promise<TradingSocket> {
  const t0 = Date.now()
  const ts = new TradingSocket({ net: 'testnet', apiKey: key.apiKey, secret: key.secret, pingMs: 5_000, onClose: (code, reason) => {
    log(`trading socket closed ${code} ${reason} after ${Date.now() - t0}ms, ${pongs} pongs`)
    if (trading === ts) trading = null
    if (lastKey?.apiKey === key.apiKey && !retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = null; if (lastKey && !trading && !opening) void open(lastKey, attempt + 1).catch(() => {}) }, Math.min(1000 * 2 ** attempt, 15_000))
    }
  } })
  let pongs = 0
  ts.onFrame(f => { if (f.mt === 2 && ++pongs % 8 === 0) log(`pong ${pongs} at ${Math.round((Date.now() - t0) / 1000)}s`) })
  log(attempt ? `trading socket reopening, try ${attempt + 1}` : 'trading socket opening')
  opening = ts.connect().then(() => {
    trading = ts
    log(`trading socket signed in, ${Date.now() - t0}ms`)
    return ts
  }).catch(e => {
    log(`trading socket failed: ${e instanceof Error ? e.message : String(e)}`)
    throw e
  }).finally(() => { opening = null })
  return opening
}

export async function warmTrading(address: string) {
  const key = await loadApiKey(address)
  if (key) await tradingSocket(key)
  return key
}

// android freezes timers and drops sockets while the phone sleeps, so coming back to the foreground
// is the moment to get the socket back, not a backoff timer that never fired
AppState.addEventListener('change', state => {
  if (state !== 'active' || !lastKey || trading || opening) return
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  log('foreground, reopening trading socket')
  void open(lastKey, 0).catch(() => {})
})
