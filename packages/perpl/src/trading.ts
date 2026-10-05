import type { Hex } from 'viem'
import { NETWORKS, type Network } from './config'
import { signInFrame } from './crypto'
import { MT, OrderType, Flag, Trigger, type Account, type Order, type OrderRequest, type Position, type OrdersFrame, type PositionsFrame, type StatusFrame, type TradingFrame, type Wallet } from './wire'

type Listener = (frame: TradingFrame) => void
type Pending = { sn: number; rq: number; pid?: number; status?: StatusFrame; resolve: (r: OrderResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

// floor and size in wire units. slippage only applies when there is no floor
export type TriggerOptions = { floor?: number; slippageBps?: number; size?: number; onMark?: boolean }

export type OrderResult = { rq: number; status?: StatusFrame; order?: Order; position?: Position }

export type TradingOptions = {
  net?: Network
  apiKey: string
  secret: Hex
  orderTimeoutMs?: number
  pingMs?: number
  onFrame?: Listener
  onClose?: (code: number, reason: string) => void
}

// one authenticated trading socket for one wallet. keeps the account, order and position
// snapshots current, seeds request ids from the server, and turns each order into a promise
// that settles on the first mt 24 frame for that request id.
export class TradingSocket {
  private ws?: WebSocket
  private opts: TradingOptions
  private sn = 0
  private rq = 0
  private lastHeartbeat = -1
  private pending = new Map<number, Pending>()
  private listeners = new Set<Listener>()
  private pingTimer?: ReturnType<typeof setInterval>
  private ready?: Promise<void>
  private serverPings = 0

  account?: Account
  wallet?: Wallet
  orders = new Map<number, Order>()
  positions = new Map<number, Position>()
  head = 0

  constructor(opts: TradingOptions) { this.opts = opts }

  get net() { return NETWORKS[this.opts.net ?? 'testnet'] }

  // the request id the last order went out with, an intent records it so reconcile can find the order
  get lastRq() { return this.rq }

  connect() {
    if (this.ready) return this.ready
    this.ready = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${this.net.ws}/ws/v1/trading`)
      this.ws = ws
      const guard = setTimeout(() => reject(new Error('sign in timed out')), this.net.signInTimeoutMs + 2000)
      ws.onopen = () => ws.send(JSON.stringify(signInFrame(this.net.chainId, this.opts.apiKey, this.opts.secret)))
      // perpl's trading server sends a protocol ping every 5s and closes with 1008 "ping timeout" when the
      // pong is late. bun's automatic pong is unreliable on this socket (spike g10, oct 2: dropped 1 run in 3
      // or 4), an explicit pong held 3 of 3. sockets without pong() get an app frame a moment later, which
      // flushes whatever pong the runtime queued. runtimes that never report pings keep the timed ping below
      ws.addEventListener('ping', (e: Event) => {
        this.serverPings++
        const sock = ws as WebSocket & { pong?: (data?: unknown) => void }
        if (typeof sock.pong === 'function') { sock.pong((e as MessageEvent | undefined)?.data); return }
        setTimeout(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ mt: MT.ping, t: Date.now() })) }, 20)
      })
      ws.onerror = () => reject(new Error('trading socket error'))
      ws.onclose = e => {
        clearInterval(this.pingTimer)
        this.ready = undefined
        for (const p of this.pending.values()) p.reject(new Error(`socket closed ${e.code} ${e.reason}`))
        this.pending.clear()
        this.opts.onClose?.(e.code, e.reason)
      }
      // the server sends wallet, orders and positions snapshots back to back after sign in.
      // the ready step must run exactly once, a second ping timer would flood the rate limit.
      const seen = new Set<number>()
      let ready = false
      ws.onmessage = e => {
        const m = JSON.parse(String(e.data)) as TradingFrame
        this.handle(m)
        if (ready) return
        if (m.mt === MT.walletSnapshot || m.mt === MT.ordersSnapshot || m.mt === MT.positionsSnapshot) seen.add(m.mt)
        if (seen.size === 3) {
          ready = true
          clearTimeout(guard)
          this.pingTimer = setInterval(() => { if (!this.serverPings) ws.send(JSON.stringify({ mt: MT.ping, t: Date.now() })) }, this.opts.pingMs ?? 30_000)
          resolve()
        }
      }
    })
    return this.ready
  }

  close() { this.ws?.close() }

  onFrame(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn) }

  private handle(m: TradingFrame) {
    this.opts.onFrame?.(m)
    for (const l of this.listeners) l(m)
    switch (m.mt) {
      case MT.walletSnapshot: {
        const w = m as Extract<TradingFrame, { mt: 19 }>
        this.wallet = { addr: w.addr, n: w.n, fl: w.fl, as: w.as, sn: w.sn }
        this.account = w.as[0]
        this.rq = Math.max(this.rq, this.account?.lfr ?? 0)
        this.lastHeartbeat = w.sn
        break
      }
      case MT.heartbeat: {
        const h = m as Extract<TradingFrame, { mt: 100 }>
        this.head = h.h
        // a repeat or an older heartbeat is perpl resending, skip it. a jump means frames were lost, so the
        // socket is closed and comes back with fresh snapshots (throwing here took a node process down)
        if (this.lastHeartbeat >= 0 && h.sn <= this.lastHeartbeat) break
        if (this.lastHeartbeat >= 0 && h.sn !== this.lastHeartbeat + 1) { this.gap(h.sn); break }
        this.lastHeartbeat = h.sn
        break
      }
      case MT.accountUpdate: {
        const a = m as Extract<TradingFrame, { mt: 21 }>
        if (this.account && a.id === this.account.id) Object.assign(this.account, { b: a.b, lb: a.lb, lfr: a.lfr ?? this.account.lfr })
        // lfr lags after a reconnect, so request ids also move past every rq seen on an order
        if (a.lfr !== undefined) this.rq = Math.max(this.rq, a.lfr)
        break
      }
      case MT.ordersSnapshot:
        this.orders.clear()
        for (const o of (m as OrdersFrame).d) { this.orders.set(o.oid, o); this.rq = Math.max(this.rq, o.rq) }
        break
      case MT.ordersUpdate:
        for (const o of (m as OrdersFrame).d) {
          this.orders.set(o.oid, o)
          this.rq = Math.max(this.rq, o.rq)
          const p = this.pending.get(o.rq)
          // a margin add echoes a failed order frame on the same rq, the position update is the real answer
          if (p && o.t !== OrderType.addCollateral) this.settle(o.rq, { rq: o.rq, status: p.status, order: o })
        }
        break
      case MT.positionsSnapshot:
        this.positions.clear()
        for (const p of (m as PositionsFrame).d) this.positions.set(p.pid, p)
        break
      case MT.positionsUpdate:
        for (const p of (m as PositionsFrame).d) {
          if (p.st === 2) this.positions.delete(p.pid); else this.positions.set(p.pid, p)
          for (const [rq, pend] of this.pending) if (pend.pid === p.pid) this.settle(rq, { rq, status: pend.status, position: p })
        }
        break
      case MT.status: {
        const st = m as StatusFrame
        const p = (st.rq !== undefined && this.pending.get(st.rq)) || [...this.pending.values()].find(x => x.sn === st.cid)
        if (!p) break
        p.status = st
        if (st.status.code !== 0) this.settle(p.rq, { rq: p.rq, status: st })
        break
      }
    }
  }

  private gap(sn: number) {
    this.gapAt = { expected: this.lastHeartbeat + 1, got: sn }
    this.close()
  }

  // the last heartbeat gap that closed this socket, for the log
  gapAt?: { expected: number; got: number }

  private settle(rq: number, r: OrderResult) {
    const p = this.pending.get(rq)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(rq)
    p.resolve(r)
  }

  // the low level send. every order goes through here so rq stays monotonic.
  send(fields: Omit<OrderRequest, 'mt' | 'sn' | 'rq' | 'acc' | 'lb'> & { acc?: number; lb?: number }, opts: { pid?: number } = {}): Promise<OrderResult> {
    return this.sendOnce(fields, opts).then(r => {
      // the account's order ids only go up, and a direct onchain order may have used a timestamp as its id
      // (spike g9). OrderDescIdTooLow is a definite "nothing happened", so jump past now and send once more
      if (r.order?.st !== 7 || r.order.sr !== 32) return r
      this.rq = Math.max(this.rq, Date.now())
      return this.sendOnce(fields, opts)
    })
  }

  private sendOnce(fields: Omit<OrderRequest, 'mt' | 'sn' | 'rq' | 'acc' | 'lb'> & { acc?: number; lb?: number }, opts: { pid?: number }) {
    if (!this.ws || !this.account) throw new Error('not connected')
    const sn = ++this.sn
    const rq = ++this.rq
    const frame: OrderRequest = { mt: 22, sn, rq, lb: 0, ...fields, acc: fields.acc ?? this.account.id }
    const p = new Promise<OrderResult>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(rq); reject(new Error(`order ${rq} timed out`)) }, this.opts.orderTimeoutMs ?? 15_000)
      this.pending.set(rq, { sn, rq, pid: opts.pid, resolve, reject, timer })
    })
    this.ws.send(JSON.stringify(frame))
    return p
  }

  // market order, p 0 and ioc. size and leverage already in wire units.
  openMarket(a: { mkt: number; side: 'long' | 'short'; size: number; leverage: number; slippageBps?: number }) {
    return this.send({ mkt: a.mkt, t: a.side === 'long' ? OrderType.openLong : OrderType.openShort, p: 0, s: a.size, ms: a.slippageBps ?? 100, fl: Flag.ioc, lv: a.leverage })
  }

  // an open that fills now or not at all, never past price (wire units): a long pays at most price, a
  // short sells at least price. what an entry rule sends when its level is reached
  openLimit(a: { mkt: number; side: 'long' | 'short'; size: number; leverage: number; price: number }) {
    return this.send({ mkt: a.mkt, t: a.side === 'long' ? OrderType.openLong : OrderType.openShort, p: a.price, s: a.size, fl: Flag.ioc, lv: a.leverage })
  }

  closeMarket(pos: Position, a: { size?: number; slippageBps?: number } = {}) {
    return this.send({ mkt: pos.mkt, t: pos.sd === 1 ? OrderType.closeLong : OrderType.closeShort, p: 0, s: a.size ?? pos.s, ms: a.slippageBps ?? 100, fl: Flag.ioc, lv: 0, lp: pos.pid })
  }

  // stop loss and take profit are close orders with a trigger, tied to the position (lp) so they die with it.
  // p 0 fires as an ioc market order capped by ms, a floor fires as an ioc limit at that price, so it can
  // never fill worse. perpl rejects a close bigger than the position instead of clipping it, so size has to
  // follow the position after any partial fill.
  stopLoss(pos: Position, triggerPrice: number, o: TriggerOptions = {}) {
    const below = pos.sd === 1
    return this.trigger(pos, triggerPrice, below, o.onMark ?? true, o)
  }

  takeProfit(pos: Position, triggerPrice: number, o: TriggerOptions = {}) {
    const below = pos.sd !== 1
    return this.trigger(pos, triggerPrice, below, o.onMark ?? false, o)
  }

  private trigger(pos: Position, tp: number, below: boolean, onMark: boolean, o: TriggerOptions) {
    const tpc = below ? (onMark ? Trigger.lteMark : Trigger.lteLast) : (onMark ? Trigger.gteMark : Trigger.gteLast)
    const t = pos.sd === 1 ? OrderType.closeLong : OrderType.closeShort
    const price = o.floor ? { p: o.floor } : { p: 0, ms: o.slippageBps ?? 100 }
    return this.send({ mkt: pos.mkt, t, ...price, s: o.size ?? pos.s, fl: Flag.ioc, lv: 0, lp: pos.pid, tp, tpc })
  }

  addMargin(pos: Position, amountCns: string) {
    return this.send({ mkt: pos.mkt, t: OrderType.addCollateral, p: 0, s: 0, fl: 0, lv: 0, lp: pos.pid, a: amountCns }, { pid: pos.pid })
  }

  // a resting trigger is only found again with its own trigger fields, without them perpl answers
  // OrderDoesNotExist (what perpl's own app sends, research/perpl-api-deep.md section 2)
  cancel(order: Order) {
    const trig = order.tp ? { lp: order.lp, tp: order.tp, tpc: order.tpc } : {}
    return this.send({ mkt: order.mkt, t: OrderType.cancel, oid: order.oid, p: 0, s: 0, fl: Flag.ioc, lv: 0, ...trig })
  }
}
