// an intent is written before anything is sent and settled once the answer is known. a timeout is
// 'unknown', never resent: an order sent just before its socket died still landed (spike g13b), so only
// reconcile, reading what perpl actually holds, may decide what an unknown became
import { db } from './db'

export type IntentState = 'sending' | 'filled' | 'rejected' | 'unknown' | 'void'
export type IntentRow = {
  id: string; rule: string; owner: string; kind: string; pid: number | null; size: number | null; floor: number | null
  rq: number | null; oid: number | null; state: IntentState; fill: number | null; tx: string | null; at: number; stamps: string; body: string
}

const q = {
  insert: db.prepare(`insert into intents (id, rule, owner, kind, pid, size, floor, state, at, stamps, body) values (?, ?, ?, ?, ?, ?, ?, 'sending', ?, ?, ?)`),
  settle: db.prepare('update intents set state = ?, fill = ?, tx = ?, oid = ?, stamps = ? where id = ?'),
  sent: db.prepare('update intents set rq = ? where id = ?'),
  open: db.prepare(`select * from intents where owner = ? and state in ('sending', 'unknown') order by at`),
  get: db.prepare('select * from intents where id = ?'),
}

export function openIntent(i: { id: string; rule: string; owner: string; kind: string; pid?: number; size?: number; floor?: number; stamps: object; body: object }) {
  q.insert.run(i.id, i.rule, i.owner, i.kind, i.pid ?? null, i.size ?? null, i.floor ?? null, Date.now(), JSON.stringify(i.stamps), JSON.stringify(i.body))
}

export function sentAs(id: string, rq: number) { q.sent.run(rq, id) }

export function settle(id: string, state: Exclude<IntentState, 'sending'>, o: { fill?: number; tx?: string; oid?: number; stamps: object }) {
  q.settle.run(state, o.fill ?? null, o.tx ?? null, o.oid ?? null, JSON.stringify(o.stamps), id)
}

export const unsettled = (owner: string) => q.open.all(owner) as IntentRow[]
export const intent = (id: string) => q.get.get(id) as IntentRow | undefined
