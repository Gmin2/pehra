import type { Hex } from 'viem'
import { NETWORKS, type Network } from './config'
import { signInFrame } from './crypto'
import { MT, OrderType, Flag, Trigger, type Account, type Order, type OrderRequest, type Position } from './wire'

type Listener = (frame: any) => void
type Pending = { resolve: (r: OrderResult) => void; reject: (e: Error) => void; status?: any; timer: ReturnType<typeof setTimeout> }

export type OrderResult = { rq: number; status: any; order?: Order; position?: Position }

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
  wallet?: any
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
      ws.onerror = e => reject(new Error('ws error ' + String((e as any).message ?? '')))
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
        const m = JSON.parse(String(e.data))
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

  private handle(m: any) {
    this.opts.onFrame?.(m)
    for (const l of this.listeners) l(m)
    switch (m.mt) {
      case MT.walletSnapshot:
        this.wallet = m
        this.account = m.as?.[0]
        this.rq = Math.max(this.rq, this.account?.lfr ?? 0)
        this.lastHeartbeat = m.sn
        break
      case MT.heartbeat:
        this.head = m.h
        if (this.lastHeartbeat >= 0 && m.sn !== this.lastHeartbeat + 1) this.gap(m.sn)
        this.lastHeartbeat = m.sn
        break
      case MT.accountUpdate:
        if (this.account && m.id === this.account.id) Object.assign(this.account, { b: m.b, lb: m.lb, lfr: m.lfr ?? this.account.lfr })
        break
      case MT.ordersSnapshot:
        this.orders.clear()
        for (const o of m.d ?? []) this.orders.set(o.oid, o)
        break
      case MT.ordersUpdate:
        for (const o of m.d ?? []) {
          this.orders.set(o.oid, o)
          const p = this.pending.get(o.rq)
          // a margin add echoes a failed order frame on the same rq, the position update is the real answer
          if (p && o.t !== OrderType.addCollateral) this.settle(o.rq, { rq: o.rq, status: p.status, order: o })
        }
        break
      case MT.positionsSnapshot:
        this.positions.clear()
        for (const p of m.d ?? []) this.positions.set(p.pid, p)
        break
      case MT.positionsUpdate:
        for (const p of m.d ?? []) {
          if (p.st === 2) this.positions.delete(p.pid); else this.positions.set(p.pid, p)
          for (const [rq, pend] of this.pending) if ((pend as any).pid === p.pid) this.settle(rq, { rq, status: pend.status, position: p })
        }
        break
      case MT.status: {
        const p = this.pending.get(m.rq ?? -1) ?? [...this.pending.values()].find(x => (x as any).sn === m.cid)
        if (!p) break
        p.status = m
        if ((m.status?.code ?? m.code) !== 0) this.settle((p as any).rq, { rq: (p as any).rq, status: m })
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
      this.pending.set(rq, { resolve, reject, timer, sn, rq, pid: opts.pid } as any)
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
