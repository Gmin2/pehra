// watching other accounts: the read for any address, and the list a phone keeps with a push when a
// watched account opens, closes or is liquidated (from the indexer) or gets close to liquidation
import { watchAddress, profile, type Activity, type Market } from '@pehra/perpl'
import type { PublicClient, Address } from 'viem'
import { db } from './db'

db.exec(`create table if not exists watches (owner text not null, target text not null, created integer not null, seen integer not null default 0, primary key (owner, target))`)

const q = {
  add: db.prepare('insert or ignore into watches (owner, target, created, seen) values (?, ?, ?, ?)'),
  drop: db.prepare('delete from watches where owner = ? and target = ?'),
  of: db.prepare('select target, created from watches where owner = ? order by created desc'),
  all: db.prepare('select owner, target, seen from watches'),
  seen: db.prepare('update watches set seen = ? where owner = ? and target = ?'),
}

type History = (address: string) => Promise<{ rows: unknown[] }>
const cache = new Map<string, { at: number; body: unknown }>()

export async function watchRead(pub: PublicClient, address: string, markets: Market[], history: History, extra: (a: string) => object) {
  const key = address.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 10_000) return hit.body
  const [w, h] = await Promise.all([watchAddress(pub, address as Address, markets), history(address).catch(() => ({ rows: [] }))])
  const rows = h.rows as (Activity & { tx?: string; priceWire?: string })[]
  const body = { address: key, ...w, recent: rows.slice(0, 10), profile: profile(rows, [], []), stopsKnown: false, ...extra(key) }
  cache.set(key, { at: Date.now(), body })
  return body
}

export const watch = (owner: string, target: string) => q.add.run(owner.toLowerCase(), target.toLowerCase(), Date.now(), Math.floor(Date.now() / 1000))
export const unwatch = (owner: string, target: string) => q.drop.run(owner.toLowerCase(), target.toLowerCase())
export const watchesOf = (owner: string) => q.of.all(owner.toLowerCase()) as { target: string; created: number }[]

const cut = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const near = new Map<string, boolean>()

// every 30s: new activity on a watched account since the last look, and a watched position near liquidation
export async function watchTick(pub: PublicClient, markets: Market[], history: History, push: (owner: string, key: string, title: string, body: string) => void) {
  const pairs = q.all.all() as { owner: string; target: string; seen: number }[]
  const targets = [...new Set(pairs.map(p => p.target))]
  for (const t of targets) {
    const [h, w] = await Promise.all([history(t).catch(() => ({ rows: [] })), watchAddress(pub, t as Address, markets).catch(() => null)])
    const rows = h.rows as (Activity & { leverageHdths?: string | null })[]
    for (const p of pairs.filter(x => x.target === t)) {
      const fresh = rows.filter(r => r.timestamp > p.seen && ['open', 'close', 'liquidated'].includes(r.kind)).sort((a, b) => a.timestamp - b.timestamp)
      for (const r of fresh) {
        const sym = markets.find(m => m.id === Number(r.perpId))?.symbol.toLowerCase() ?? ''
        const what = r.kind === 'open' ? `opened a ${sym} ${r.side ?? ''}${r.leverageHdths ? ` ${Number(r.leverageHdths) / 100}x` : ''}` : r.kind === 'close' ? `closed a ${sym} ${r.side ?? ''}` : `was liquidated on ${sym}`
        push(p.owner, `watch:${p.owner}:${t}:${r.timestamp}`, `${cut(t)} ${what}`.replace(/\s+/g, ' '), 'an account you watch on pehra')
      }
      if (fresh.length) q.seen.run(Math.max(...fresh.map(r => r.timestamp)), p.owner, t)
      for (const pos of w?.positions ?? []) {
        const k = `${p.owner}:${t}:${pos.mkt}`
        const close = pos.distance < 0.08, was = near.get(k) ?? false
        if (close && !was) push(p.owner, `watchnear:${k}`, `${cut(t)} is ${(pos.distance * 100).toFixed(1)}% from liquidation`, `their ${pos.symbol.toLowerCase()} ${pos.side}, an account you watch`)
        near.set(k, close ? true : pos.distance > 0.12 ? false : was)
      }
    }
  }
}
