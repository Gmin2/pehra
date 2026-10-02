// every thing the engine does is a run row, chained by hash to the row before it. the proof screen reads
// only this table, and changing any old row breaks every hash after it (verify() finds where)
import { createHash } from 'node:crypto'
import { db } from './db'

export type RunKind = 'state' | 'note' | 'intent' | 'fill' | 'reject' | 'unknown' | 'deferred' | 'beat' | 'anchor' | 'reconcile' | 'error'
export type Run = { seq: number; at: number; owner: string | null; rule: string | null; kind: RunKind; body: string; prev: string; hash: string }

const last = db.prepare('select hash from runs order by seq desc limit 1')
const insert = db.prepare('insert into runs (at, owner, rule, kind, body, prev, hash) values (?, ?, ?, ?, ?, ?, ?)')

export function hashOf(prev: string, at: number, owner: string | null, rule: string | null, kind: string, body: string) {
  return createHash('sha256').update([prev, at, owner ?? '', rule ?? '', kind, body].join('\n')).digest('hex')
}

export function writeRun(r: { owner?: string | null; rule?: string | null; kind: RunKind; body: object; at?: number }) {
  const prev = (last.get() as { hash: string } | undefined)?.hash ?? ''
  const at = r.at ?? Date.now()
  const owner = r.owner ?? null, rule = r.rule ?? null
  const body = JSON.stringify(r.body)
  const hash = hashOf(prev, at, owner, rule, r.kind, body)
  insert.run(at, owner, rule, r.kind, body, prev, hash)
  return hash
}

const all = db.prepare('select seq, at, owner, rule, kind, body, prev, hash from runs order by seq')

// recompute the chain from the first row, the first row whose hash or link does not match is where it broke
export function verify(): { ok: true; rows: number; head: string } | { ok: false; at: number; why: string } {
  let prev = ''
  let n = 0
  for (const r of all.all() as Run[]) {
    if (r.prev !== prev) return { ok: false, at: r.seq, why: 'link to the previous row does not match' }
    if (hashOf(r.prev, r.at, r.owner, r.rule, r.kind, r.body) !== r.hash) return { ok: false, at: r.seq, why: 'row was changed after it was written' }
    prev = r.hash
    n++
  }
  return { ok: true, rows: n, head: prev }
}
