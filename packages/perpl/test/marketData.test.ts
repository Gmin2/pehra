import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { MarketDataSocket } from '../src/marketData'
import { FakeSocket, installFakeSocket, tick } from './fakeSocket'

let restore: () => void
beforeEach(() => { restore = installFakeSocket() })
afterEach(() => restore())

describe('market data socket', () => {
  test('one subscribe frame, state keyed by market id', async () => {
    const md = new MarketDataSocket('testnet')
    const s = MarketDataSocket.streams(10143)
    await md.connect([s.heartbeat, s.marketState, s.book(64)])
    const sock = FakeSocket.instances[0]
    expect(sock.url).toBe('wss://testnet.perpl.xyz/ws/v1/market-data')
    expect(sock.sent).toEqual([{ mt: 5, subs: [{ stream: 'heartbeat@10143', subscribe: true }, { stream: 'market-state@10143', subscribe: true }, { stream: 'order-book@64', subscribe: true }] }])
    const seen: number[] = []
    md.on(f => seen.push(f.mt))
    sock.serverSend({ mt: 9, sid: 3000, sn: 1, d: { '64': { orl: 2582, mrk: 2580, lst: 2584, mid: 2581, bid: 2579, ask: 2583, prv: 2534, dv: 1, dva: '1', oi: 1, tvl: '1' } } })
    sock.serverSend({ mt: 100, sn: 2, h: 777 })
    await tick()
    expect(md.states.get(64)?.mrk).toBe(2580)
    expect(md.head).toBe(777)
    expect(seen).toEqual([9, 100])
    md.close()
  })
})
