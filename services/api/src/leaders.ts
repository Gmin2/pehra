// the leaderboard: every perpl account's realized pnl over the last days, from the indexer's activity
// rows (closes, partial closes and liquidations carry pnl). public, cached a minute
type Row = { accountId: string; kind: string; pnlCns: string | null; timestamp: number }
export type Leader = { address: string; accountId: string; pnl: number; trades: number; wins: number; liquidations: number; lastAt: number }

const cache = new Map<number, { at: number; body: Leader[] }>()

export async function leaders(indexer: string, days: number): Promise<Leader[]> {
  const hit = cache.get(days)
  if (hit && Date.now() - hit.at < 60_000) return hit.body
  const since = Math.floor(Date.now() / 1000) - days * 86_400
  const query = `query ($since: Int!) {
    Activity(where: { timestamp: { _gte: $since }, kind: { _in: ["close", "decrease", "liquidated", "open"] } }, limit: 20000) { accountId kind pnlCns timestamp }
    Account(limit: 20000) { id address }
  }`
  const r = await fetch(indexer, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { since } }) })
  const j = await r.json() as { data?: { Activity: Row[]; Account: { id: string; address: string }[] }; errors?: unknown }
  if (!j.data) throw new Error('indexer: ' + JSON.stringify(j.errors).slice(0, 200))
  const addr = new Map(j.data.Account.map(a => [String(a.id), a.address]))
  const by = new Map<string, Leader>()
  for (const a of j.data.Activity) {
    const id = String(a.accountId)
    const l = by.get(id) ?? { address: addr.get(id) ?? '', accountId: id, pnl: 0, trades: 0, wins: 0, liquidations: 0, lastAt: 0 }
    if (a.kind === 'open') l.trades++
    if (a.kind !== 'open') {
      const p = Number(a.pnlCns ?? 0) / 1e6
      l.pnl += p
      if (a.kind === 'close' && p > 0) l.wins++
      if (a.kind === 'liquidated') l.liquidations++
    }
    l.lastAt = Math.max(l.lastAt, a.timestamp)
    by.set(id, l)
  }
  const body = [...by.values()].filter(l => l.address && l.trades > 0).sort((x, y) => y.pnl - x.pnl).slice(0, 25).map(l => ({ ...l, pnl: Math.round(l.pnl * 100) / 100 }))
  cache.set(days, { at: Date.now(), body })
  return body
}
