import { NETWORKS, type Network } from './config'
import { MT, type MarketState } from './wire'

type Handler = (frame: any) => void

// public market data socket. 16 subscriptions and 10 requests a minute per connection,
// so batch everything into one subscribe frame and never ping it.
export class MarketDataSocket {
  private ws?: WebSocket
  private handlers = new Set<Handler>()
  private net: Network
  states = new Map<number, MarketState>()
  head = 0

  constructor(net: Network = 'testnet') { this.net = net }

  connect(streams: string[]) {
    const cfg = NETWORKS[this.net]
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${cfg.ws}/ws/v1/market-data`)
      this.ws = ws
      ws.onopen = () => {
        ws.send(JSON.stringify({ mt: MT.subscribe, subs: streams.map(stream => ({ stream, subscribe: true })) }))
        resolve()
      }
      ws.onerror = e => reject(new Error('ws error ' + String((e as any).message ?? '')))
      ws.onmessage = e => {
        const m = JSON.parse(String(e.data))
        if (m.mt === MT.heartbeat) this.head = m.h
        if (m.mt === MT.marketState) for (const [id, s] of Object.entries(m.d ?? {})) this.states.set(Number(id), s as MarketState)
        for (const h of this.handlers) h(m)
      }
    })
  }

  on(fn: Handler) { this.handlers.add(fn); return () => this.handlers.delete(fn) }
  close() { this.ws?.close() }

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
