// everything the trade tap needs is opened at app start: the rpc websocket, the market data stream,
// the perpl context, and for a returning account the signed in trading socket. over 5g each tls
// handshake costs about two seconds, so none of them may happen on the tap.
import { feeCaps, getContext, MarketDataSocket, publicClient, TradingSocket, type Enrolled } from '@pehra/perpl'
import { loadApiKey } from './keys'

let market: MarketDataSocket | null = null
let trading: TradingSocket | null = null
let tradingKey: string | null = null
let log: (s: string) => void = () => {}
export const setWarmLog = (fn: (s: string) => void) => { log = fn }

export function warmChain() {
  const pub = publicClient('testnet')
  void feeCaps(pub)
  void getContext('testnet')
  if (!market) {
    market = new MarketDataSocket('testnet')
    const s = MarketDataSocket.streams(10143)
    market.connect([s.heartbeat, s.marketState]).catch(() => { market = null })
  }
}

export const marketData = () => market

// one trading socket per api key, reopened when it drops
export async function tradingSocket(key: Enrolled): Promise<TradingSocket> {
  if (trading && tradingKey === key.apiKey) { log('trading socket reused'); return trading }
  trading?.close()
  tradingKey = key.apiKey
  const t0 = Date.now()
  const ts = new TradingSocket({ net: 'testnet', apiKey: key.apiKey, secret: key.secret, onClose: (code, reason) => { log(`trading socket closed ${code} ${reason}`); if (trading === ts) trading = null } })
  log('trading socket opening')
  trading = ts
  try {
    await ts.connect()
    log(`trading socket signed in, ${Date.now() - t0}ms`)
  } catch (e) {
    if (trading === ts) trading = null
    throw e
  }
  return ts
}

export async function warmTrading(address: string) {
  const key = await loadApiKey(address)
  if (key) await tradingSocket(key)
  return key
}
