import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { TradingSocket } from '../src/trading'
import { newApiKeyPair } from '../src/crypto'
import { FakeSocket, installFakeSocket, tick } from './fakeSocket'

let restore: () => void
beforeEach(() => { restore = installFakeSocket() })
afterEach(() => restore())

const key = newApiKeyPair()
const open = async () => {
  const ts = new TradingSocket({ net: 'testnet', apiKey: 'k', secret: key.secret, orderTimeoutMs: 200 })
  const p = ts.connect()
  await tick()
  const sock = FakeSocket.instances[0]
  sock.serverSnapshot()
  await p
  return { ts, sock }
}

describe('trading socket', () => {
  test('signs in first and resolves only after all three snapshots', async () => {
    const ts = new TradingSocket({ net: 'testnet', apiKey: 'k', secret: key.secret })
    let done = false
    const p = ts.connect().then(() => { done = true })
    await tick()
    const sock = FakeSocket.instances[0]
    expect(sock.url).toBe('wss://testnet.perpl.xyz/ws/v1/trading')
    expect(sock.sent[0].mt).toBe(29)
    expect(sock.sent[0].api_key).toBe('k')
    sock.serverSend({ mt: 19, sn: 5, addr: '0x', n: 1, fl: 0, as: [{ id: 1, fw: true, fr: false, ft: 0, lfr: 0, b: '0', lb: '0' }] })
    sock.serverSend({ mt: 23, d: [] })
    await tick()
    expect(done).toBe(false)
    sock.serverSend({ mt: 26, d: [{ pid: 9, mkt: 64, sd: 1, s: 100, ep: 2658, c: '891000', lv: 500 }] })
    await p
    expect(done).toBe(true)
    expect(ts.positions.get(9)?.ep).toBe(2658)
    ts.close()
  })

  test('request ids start after lfr and every order has a fresh sn', async () => {
    const { ts, sock } = await open()
    const p1 = ts.openMarket({ mkt: 64, side: 'long', size: 100, leverage: 500 })
    const p2 = ts.openMarket({ mkt: 64, side: 'short', size: 50, leverage: 300 })
    const [o1, o2] = sock.sent.slice(1)
    expect(o1).toMatchObject({ mt: 22, rq: 8, sn: 1, acc: 649, mkt: 64, t: 1, p: 0, s: 100, fl: 4, lv: 500, ms: 100, lb: 0 })
    expect(o2).toMatchObject({ rq: 9, sn: 2, t: 2, s: 50, lv: 300 })
    sock.serverSend({ mt: 3, sid: 100, sn: 1, cid: 1, status: { code: 0 } })
    sock.serverSend({ mt: 24, d: [{ oid: 11, rq: 8, mkt: 64, t: 1, st: 4, sr: 43, p: 0, s: 100, fs: 100, fp: 2658 }] })
    const r1 = await p1
    expect(r1.order?.st).toBe(4)
    expect(r1.status?.status.code).toBe(0)
    sock.serverSend({ mt: 24, d: [{ oid: 12, rq: 9, mkt: 64, t: 2, st: 7, sr: 34, p: 0, s: 50 }] })
    const r2 = await p2
    expect(r2.order?.sr).toBe(34)
    expect(ts.orders.size).toBe(2)
    ts.close()
  })

  test('a gateway rejection settles from the status frame alone', async () => {
    const { ts, sock } = await open()
    const p = ts.openMarket({ mkt: 64, side: 'long', size: 100, leverage: 500 })
    sock.serverSend({ mt: 3, sid: 100, sn: 1, cid: 1, status: { code: 400, msg: 'lb too high' } })
    const r = await p
    expect(r.order).toBeUndefined()
    expect(r.status?.status.code).toBe(400)
    ts.close()
  })

  test('margin add ignores the echoed failed order frame and settles on the position update', async () => {
    const { ts, sock } = await open()
    const pos = { pid: 9, mkt: 64, sd: 1, s: 100, ep: 2658, c: '891000', lv: 500 }
    sock.serverSend({ mt: 27, d: [pos] })
    const p = ts.addMargin(pos, '1000000')
    const frame = sock.sent[sock.sent.length - 1]
    expect(frame).toMatchObject({ t: 6, lp: 9, a: '1000000', rq: 8 })
    sock.serverSend({ mt: 24, d: [{ oid: 0, rq: 8, mkt: 64, t: 6, st: 7, sr: 32, p: 0, s: 0 }] })
    let settled = false
    p.then(() => { settled = true })
    await tick()
    expect(settled).toBe(false)
    sock.serverSend({ mt: 27, d: [{ ...pos, c: '1891000' }] })
    const r = await p
    expect(r.position?.c).toBe('1891000')
    expect(ts.positions.get(9)?.c).toBe('1891000')
    ts.close()
  })

  test('closed positions leave the map and stop loss picks the mark side', async () => {
    const { ts, sock } = await open()
    const long = { pid: 9, mkt: 64, sd: 1, s: 100, ep: 2658, c: '891000', lv: 500 }
    const short = { pid: 10, mkt: 64, sd: 2, s: 100, ep: 2658, c: '891000', lv: 500 }
    const quiet = (p: Promise<unknown>) => { p.catch(() => {}) }
    quiet(ts.stopLoss(long, 2500))
    quiet(ts.stopLoss(short, 2800))
    quiet(ts.takeProfit(long, 2900))
    const [sl1, sl2, tp] = sock.sent.slice(1)
    expect(sl1).toMatchObject({ t: 3, tp: 2500, tpc: 4, lp: 9, lb: 0 })
    expect(sl2).toMatchObject({ t: 4, tp: 2800, tpc: 3, lp: 10 })
    expect(tp).toMatchObject({ t: 3, tp: 2900, tpc: 1 })
    sock.serverSend({ mt: 27, d: [{ ...long, st: 2, sr: 13 }] })
    expect(ts.positions.has(9)).toBe(false)
    ts.close()
  })

  test('account update keeps balance and lfr current', async () => {
    const { ts, sock } = await open()
    sock.serverSend({ mt: 21, id: 649, b: '100000000', lb: '5', lfr: 12 })
    expect(ts.account?.b).toBe('100000000')
    expect(ts.account?.lfr).toBe(12)
    sock.serverSend({ mt: 21, id: 1, b: '1', lb: '0' })
    expect(ts.account?.b).toBe('100000000')
    ts.close()
  })

  test('orders time out and a closed socket rejects what is pending', async () => {
    const { ts, sock } = await open()
    await expect(ts.openMarket({ mkt: 64, side: 'long', size: 1, leverage: 100 })).rejects.toThrow('timed out')
    const p = ts.openMarket({ mkt: 64, side: 'long', size: 1, leverage: 100 })
    sock.close(1008, 'too many requests')
    await expect(p).rejects.toThrow('1008')
  })

  test('one ping timer no matter how many frames arrive', async () => {
    const ts = new TradingSocket({ net: 'testnet', apiKey: 'k', secret: key.secret, pingMs: 20 })
    const p = ts.connect()
    await tick()
    const sock = FakeSocket.instances[0]
    sock.serverSnapshot()
    await p
    for (let i = 0; i < 50; i++) sock.serverSend({ mt: 100, sn: 1001 + i, h: 1 })
    await new Promise(r => setTimeout(r, 110))
    const pings = sock.sent.filter(f => f.mt === 1).length
    expect(pings).toBeGreaterThanOrEqual(3)
    expect(pings).toBeLessThanOrEqual(7)
    ts.close()
  })

  test('heartbeats track the head block', async () => {
    const { ts, sock } = await open()
    sock.serverSend({ mt: 100, sn: 1001, h: 64785392 })
    expect(ts.head).toBe(64785392)
    ts.close()
  })
  test('request ids move past every rq perpl shows us, so a reconnect never reuses one', async () => {
    const { ts, sock } = await open()
    sock.serverSend({ mt: 24, d: [{ oid: 30, rq: 40, mkt: 64, t: 1, st: 4, sr: 43, p: 0, s: 1 }] })
    void ts.openMarket({ mkt: 64, side: 'long', size: 1, leverage: 100 }).catch(() => {})
    expect(sock.sent[sock.sent.length - 1].rq).toBe(41)
    sock.serverSend({ mt: 21, id: 649, b: '0', lb: '0', lfr: 55 })
    void ts.openMarket({ mkt: 64, side: 'long', size: 1, leverage: 100 }).catch(() => {})
    expect(sock.sent[sock.sent.length - 1].rq).toBe(56)
    ts.close()
  })
  test('cancel copies the trigger fields, perpl answers OrderDoesNotExist without them', async () => {
    const { ts, sock } = await open()
    const stop = { oid: 77, rq: 8, mkt: 64, t: 3, st: 8, sr: 35, p: 0, s: 100, tp: 2500, tpc: 4, lp: 9 }
    void ts.cancel(stop).catch(() => {})
    expect(sock.sent[sock.sent.length - 1]).toMatchObject({ t: 5, oid: 77, mkt: 64, lp: 9, tp: 2500, tpc: 4, s: 0, p: 0 })
    const plain = { oid: 78, rq: 9, mkt: 64, t: 1, st: 2, sr: 35, p: 2600, s: 10 }
    void ts.cancel(plain).catch(() => {})
    const f = sock.sent[sock.sent.length - 1]
    expect(f).toMatchObject({ t: 5, oid: 78 })
    expect(f.tp).toBeUndefined()
    ts.close()
  })

  test('stops and take profits carry a floor or a slippage cap, and can be partial', async () => {
    const { ts, sock } = await open()
    const pos = { pid: 9, mkt: 64, sd: 1, s: 100, ep: 2658, c: '891000', lv: 500 }
    const last = () => sock.sent[sock.sent.length - 1]
    void ts.stopLoss(pos, 2500).catch(() => {})
    expect(last()).toMatchObject({ t: 3, p: 0, s: 100, ms: 100, tp: 2500, tpc: 4, lp: 9, fl: 4 })
    void ts.stopLoss(pos, 2500, { floor: 2450 }).catch(() => {})
    expect(last()).toMatchObject({ t: 3, p: 2450, s: 100, tp: 2500 })
    expect(last().ms).toBeUndefined()
    void ts.takeProfit(pos, 2900, { size: 40, slippageBps: 30 }).catch(() => {})
    expect(last()).toMatchObject({ t: 3, p: 0, s: 40, ms: 30, tp: 2900, tpc: 1 })
    const short = { ...pos, pid: 10, sd: 2 }
    void ts.stopLoss(short, 2800, { floor: 2850 }).catch(() => {})
    expect(last()).toMatchObject({ t: 4, p: 2850, tp: 2800, tpc: 3, lp: 10 })
    ts.close()
  })
  test('every server ping is answered with an app frame, which flushes the pong bun holds back', async () => {
    const ts = new TradingSocket({ net: 'testnet', apiKey: 'k', secret: key.secret, pingMs: 60 })
    const p = ts.connect()
    await tick()
    const sock = FakeSocket.instances[0]
    sock.serverSnapshot()
    await p
    sock.serverPing()
    sock.serverPing()
    await new Promise(r => setTimeout(r, 40))
    expect(sock.sent.filter(f => f.mt === 1).length).toBe(2)
    // once the server is seen pinging, the timed fallback stays quiet
    await new Promise(r => setTimeout(r, 150))
    expect(sock.sent.filter(f => f.mt === 1).length).toBe(2)
    ts.close()
  })
  test('a socket with pong() answers the server ping directly and spends no request on it', async () => {
    const ts = new TradingSocket({ net: 'testnet', apiKey: 'k', secret: key.secret })
    const p = ts.connect()
    await tick()
    const sock = FakeSocket.instances[0] as FakeSocket & { pong: (d?: unknown) => void; pongs: number }
    sock.pongs = 0
    sock.pong = () => { sock.pongs++ }
    sock.serverSnapshot()
    await p
    sock.serverPing()
    sock.serverPing()
    await new Promise(r => setTimeout(r, 40))
    expect(sock.pongs).toBe(2)
    expect(sock.sent.filter(f => f.mt === 1).length).toBe(0)
    ts.close()
  })
  test('OrderDescIdTooLow is answered once more with an id past now, other rejections are not resent', async () => {
    const { ts, sock } = await open()
    const p = ts.openMarket({ mkt: 64, side: 'long', size: 1, leverage: 100 })
    const first = sock.sent[sock.sent.length - 1]
    sock.serverSend({ mt: 24, d: [{ oid: 0, rq: first.rq, mkt: 64, t: 1, st: 7, sr: 32, p: 0, s: 1 }] })
    await tick()
    const second = sock.sent[sock.sent.length - 1]
    expect(second.rq as number).toBeGreaterThanOrEqual(Date.now() - 1000)
    expect(second).toMatchObject({ t: 1, s: 1, mkt: 64 })
    sock.serverSend({ mt: 24, d: [{ oid: 5, rq: second.rq, mkt: 64, t: 1, st: 4, sr: 43, p: 0, s: 1, fs: 1, fp: 3400 }] })
    expect((await p).order?.st).toBe(4)
    const q = ts.openMarket({ mkt: 64, side: 'long', size: 1, leverage: 100 })
    const third = sock.sent[sock.sent.length - 1]
    const count = sock.sent.length
    sock.serverSend({ mt: 24, d: [{ oid: 0, rq: third.rq, mkt: 64, t: 1, st: 7, sr: 34, p: 0, s: 1 }] })
    expect((await q).order?.sr).toBe(34)
    expect(sock.sent.length).toBe(count)
    ts.close()
  })
})
