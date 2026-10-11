// how many times pehra added margin before perpl could liquidate someone, from the signed run log and the
// guard's earlier event file, one row per transaction. public, it is the shortest proof pehra has
import { readFileSync, existsSync } from 'node:fs'
import { db } from './db'

const q = db.prepare(`select r.owner, r.at, r.body from runs r join rules u on u.id = r.rule where u.kind = 'guard' and r.kind = 'fill'`)
const EVENTS = new URL('../data/guard-events.json', import.meta.url)

type Side = { distancePct: number; collateral: number }
export type Rescue = { owner: string; at: number; ausd: number; before: number; after: number; tx: string; ms?: number }

export function saved() {
  const byTx = new Map<string, Rescue>()
  for (const r of q.all() as { owner: string; at: number; body: string }[]) {
    const b = JSON.parse(r.body) as { kind?: string; ausd?: number; before?: Side; after?: Side; tx?: string; stamps?: { t0?: number; t5?: number } }
    if (b.kind !== 'add' || !b.tx || !b.before || !b.after) continue
    byTx.set(b.tx, { owner: r.owner, at: r.at, ausd: b.ausd ?? 0, before: b.before.distancePct, after: b.after.distancePct, tx: b.tx, ms: b.stamps?.t0 && b.stamps?.t5 ? b.stamps.t5 - b.stamps.t0 : undefined })
  }
  if (existsSync(EVENTS)) {
    const raw = JSON.parse(readFileSync(EVENTS, 'utf8')) as Record<string, { at: number; kind: string; tx?: string; addAusd?: number; before?: Side; after?: Side }[]> | { at: number; kind: string }[]
    const all = Array.isArray(raw) ? raw.map(e => ['', e] as const) : Object.entries(raw).flatMap(([owner, list]) => list.map(e => [owner, e] as const))
    for (const [owner, e] of all as [string, { at: number; kind: string; tx?: string; addAusd?: number; before?: Side; after?: Side }][]) {
      if (e.kind !== 'added' || !e.tx || !e.before || !e.after || byTx.has(e.tx)) continue
      byTx.set(e.tx, { owner: owner.toLowerCase(), at: e.at, ausd: e.addAusd ?? 0, before: e.before.distancePct, after: e.after.distancePct, tx: e.tx })
    }
  }
  const list = [...byTx.values()].sort((a, b) => b.at - a.at)
  const ms = list.map(r => r.ms).filter((x): x is number => x !== undefined)
  return {
    rescues: list.length,
    ausd: Math.round(list.reduce((s, r) => s + r.ausd, 0) * 100) / 100,
    accounts: new Set(list.map(r => r.owner).filter(Boolean)).size,
    closest: list.length ? Math.min(...list.map(r => r.before)) : null,
    fastestMs: ms.length ? Math.min(...ms) : null,
    recent: list.slice(0, 10),
  }
}
