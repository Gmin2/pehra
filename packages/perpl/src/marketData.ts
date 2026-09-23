import { NETWORKS, type Network } from './config'
import { MT, type MarketDataFrame, type MarketState } from './wire'

type Handler = (frame: MarketDataFrame) => void

// public market data socket. 16 subscriptions and 10 requests a minute per connection,
// so batch everything into one subscribe frame and never ping it.
export class MarketDataSocket {
  private ws?: WebSocket
  private handlers = new Set<Handler>()
  private net: Network
  // every stream asked for, so a reconnect can ask again
  private wanted = new Set<string>()
  private stopped = false
  private retry = 0
  states = new Map<number, MarketState>()
  head = 0

  constructor(net: Network = 'testnet') { this.net = net }

  get isOpen() { return this.ws?.readyState === 1 }

  // resolves on the first open. after that a dropped socket (android cuts them in the background)
  // comes back on its own with a short backoff and resubscribes to everything it had.
  connect(streams: string[]) {
    for (const s of streams) this.wanted.add(s)
    this.stopped = false
    return new Promise<void>((resolve, reject) => this.open(resolve, reject))
  }

  private open(resolve?: () => void, reject?: (e: Error) => void) {
    const cfg = NETWORKS[this.net]
    const ws = new WebSocket(`${cfg.ws}/ws/v1/market-data`)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      if (this.wanted.size) ws.send(JSON.stringify({ mt: MT.subscribe, subs: [...this.wanted].map(stream => ({ stream, subscribe: true })) }))
      resolve?.()
      resolve = undefined
      reject = undefined
    }
    ws.onerror = () => { reject?.(new Error('market data socket error')); reject = undefined }
    ws.onclose = () => {
      if (this.ws !== ws || this.stopped) return
      const wait = Math.min(1000 * 2 ** this.retry++, 15_000)
      setTimeout(() => { if (!this.stopped && this.ws === ws) this.open() }, wait)
    }
    ws.onmessage = e => {
      const m = JSON.parse(String(e.data)) as MarketDataFrame
      if (m.mt === MT.heartbeat) this.head = (m as Extract<MarketDataFrame, { mt: 100 }>).h
      if (m.mt === MT.marketState) for (const [id, s] of Object.entries((m as Extract<MarketDataFrame, { mt: 9 }>).d)) this.states.set(Number(id), s)
      for (const h of this.handlers) h(m)
    }
  }

  on(fn: Handler) { this.handlers.add(fn); return () => this.handlers.delete(fn) }
  close() { this.stopped = true; this.ws?.close() }

  // add or drop streams. each call counts against the 10 requests a minute; while the socket is down
  // the change waits for the reconnect, which asks for everything wanted
  subscribe(streams: string[], on = true) {
    for (const s of streams) on ? this.wanted.add(s) : this.wanted.delete(s)
    if (this.ws?.readyState !== 1) return false
    this.ws.send(JSON.stringify({ mt: MT.subscribe, subs: streams.map(stream => ({ stream, subscribe: on })) }))
    return true
  }

  static streams(chainId: number) {
    return {
      heartbeat: `heartbeat@${chainId}`,
      marketState: `market-state@${chainId}`,
      funding: `funding@${chainId}`,
      book: (mkt: number) => `order-book@${mkt}`,
      trades: (mkt: number) => `trades@${mkt}`,
      candles: (mkt: number, res: number) => `candles@${mkt}*${res}`,
    }
  }
}
