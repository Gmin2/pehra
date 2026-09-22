import type { Hex } from 'viem'
import { NETWORKS, type Network } from './config'
import { signInFrame } from './crypto'
import { MT, OrderType, Flag, Trigger, type Account, type Order, type OrderRequest, type Position, type OrdersFrame, type PositionsFrame, type StatusFrame, type TradingFrame, type Wallet } from './wire'

type Listener = (frame: TradingFrame) => void
type Pending = { sn: number; rq: number; pid?: number; status?: StatusFrame; resolve: (r: OrderResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

export type OrderResult = { rq: number; status?: StatusFrame; order?: Order; position?: Position }

export type TradingOptions = {
  net?: Network
  apiKey: string
  secret: Hex
  orderTimeoutMs?: number
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

  account?: Account
  wallet?: Wallet
  orders = new Map<number, Order>()
  positions = new Map<number, Position>()
  head = 0

  constructor(opts: TradingOptions) { this.opts = opts }

  get net() { return NETWORKS[this.opts.net ?? 'testnet'] }

  connect() {
    if (this.ready) return this.ready
    this.ready = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${this.net.ws}/ws/v1/trading`)
      this.ws = ws
      const guard = setTimeout(() => reject(new Error('sign in timed out')), this.net.signInTimeoutMs + 2000)
      ws.onopen = () => ws.send(JSON.stringify(signInFrame(this.net.chainId, this.opts.apiKey, this.opts.secret)))
      ws.onerror = () => reject(new Error('trading socket error'))
      ws.onclose = e => {
        clearInterval(this.pingTimer)
        this.ready = undefined
        for (const p of this.pending.values()) p.reject(new Error(`socket closed ${e.code} ${e.reason}`))
        this.pending.clear()
        this.opts.onClose?.(e.code, e.reason)
      }
      // the server sends wallet, orders and positions snapshots back to back after sign in
      const seen = new Set<number>()
      ws.onmessage = e => {
        const m = JSON.parse(String(e.data)) as TradingFrame
        this.handle(m)
        if (m.mt === MT.walletSnapshot || m.mt === MT.ordersSnapshot || m.mt === MT.positionsSnapshot) seen.add(m.mt)
        if (seen.size === 3) {
          clearTimeout(guard)
          this.pingTimer = setInterval(() => ws.send(JSON.stringify({ mt: MT.ping })), 30_000)
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
        if (this.lastHeartbeat >= 0 && h.sn !== this.lastHeartbeat + 1) this.gap(h.sn)
        this.lastHeartbeat = h.sn
        break
      }
      case MT.accountUpdate: {
        const a = m as Extract<TradingFrame, { mt: 21 }>
        if (this.account && a.id === this.account.id) Object.assign(this.account, { b: a.b, lb: a.lb, lfr: a.lfr ?? this.account.lfr })
        break
      }
      case MT.ordersSnapshot:
        this.orders.clear()
        for (const o of (m as OrdersFrame).d) this.orders.set(o.oid, o)
        break
      case MT.ordersUpdate:
        for (const o of (m as OrdersFrame).d) {
          this.orders.set(o.oid, o)
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
    this.close()
    throw new Error(`heartbeat gap, expected ${this.lastHeartbeat + 1} got ${sn}`)
  }

  private settle(rq: number, r: OrderResult) {
    const p = this.pending.get(rq)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(rq)
    p.resolve(r)
  }

  // the low level send. every order goes through here so rq stays monotonic.
  send(fields: Omit<OrderRequest, 'mt' | 'sn' | 'rq' | 'acc' | 'lb'> & { acc?: number; lb?: number }, opts: { pid?: number } = {}) {
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

  closeMarket(pos: Position, a: { size?: number; slippageBps?: number } = {}) {
    return this.send({ mkt: pos.mkt, t: pos.sd === 1 ? OrderType.closeLong : OrderType.closeShort, p: 0, s: a.size ?? pos.s, ms: a.slippageBps ?? 100, fl: Flag.ioc, lv: 0, lp: pos.pid })
  }

  // stop loss and take profit are close orders with a trigger, tied to the position so they die with it
  stopLoss(pos: Position, triggerPrice: number, onMark = true) {
    const tpc = pos.sd === 1 ? (onMark ? Trigger.lteMark : Trigger.lteLast) : (onMark ? Trigger.gteMark : Trigger.gteLast)
    return this.send({ mkt: pos.mkt, t: pos.sd === 1 ? OrderType.closeLong : OrderType.closeShort, p: 0, s: pos.s, fl: Flag.ioc, lv: 0, lp: pos.pid, tp: triggerPrice, tpc })
  }

  takeProfit(pos: Position, triggerPrice: number, onMark = false) {
    const tpc = pos.sd === 1 ? (onMark ? Trigger.gteMark : Trigger.gteLast) : (onMark ? Trigger.lteMark : Trigger.lteLast)
    return this.send({ mkt: pos.mkt, t: pos.sd === 1 ? OrderType.closeLong : OrderType.closeShort, p: 0, s: pos.s, fl: Flag.ioc, lv: 0, lp: pos.pid, tp: triggerPrice, tpc })
  }

  addMargin(pos: Position, amountCns: string) {
    return this.send({ mkt: pos.mkt, t: OrderType.addCollateral, p: 0, s: 0, fl: 0, lv: 0, lp: pos.pid, a: amountCns }, { pid: pos.pid })
  }

  cancel(order: Order) {
    return this.send({ mkt: order.mkt, t: OrderType.cancel, oid: order.oid, p: 0, s: 0, fl: 0, lv: 0 })
  }
}
