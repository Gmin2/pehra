// the leaderboard: every perpl account's realized pnl over the last days, from the indexer's activity rows.
// counted on full closes and liquidations: perpl's market makers make tens of thousands of partial fills a
// week, opens, closes and liquidations are a couple of thousand. public, cached a minute
type Row = { accountId: string; kind: string; pnlCns: string | null; timestamp: number }
export type Leader = { address: string; accountId: string; pnl: number; trades: number; closed: number; wins: number; liquidations: number; lastAt: number }

const cache = new Map<number, { at: number; body: Leader[] }>()

export async function leaders(indexer: string, days: number): Promise<Leader[]> {
  const hit = cache.get(days)
  if (hit && Date.now() - hit.at < 60_000) return hit.body
  const since = Math.floor(Date.now() / 1000) - days * 86_400
  const query = `query ($since: Int!) {
    opens: Activity(where: { timestamp: { _gte: $since }, kind: { _eq: "open" } }, limit: 20000) { accountId kind pnlCns timestamp }
    closes: Activity(where: { timestamp: { _gte: $since }, kind: { _in: ["close", "liquidated"] } }, limit: 20000) { accountId kind pnlCns timestamp }
    Account(limit: 20000) { id address }
  }`
  const r = await fetch(indexer, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { since } }) })
  const j = await r.json() as { data?: { opens: Row[]; closes: Row[]; Account: { id: string; address: string }[] }; errors?: unknown }
  if (!j.data) throw new Error('indexer: ' + JSON.stringify(j.errors).slice(0, 200))
  const addr = new Map(j.data.Account.map(a => [String(a.id), a.address]))
  const by = new Map<string, Leader>()
  for (const a of [...j.data.opens, ...j.data.closes]) {
    const id = String(a.accountId)
    const l = by.get(id) ?? { address: addr.get(id) ?? '', accountId: id, pnl: 0, trades: 0, closed: 0, wins: 0, liquidations: 0, lastAt: 0 }
    if (a.kind === 'open') l.trades++
    if (a.kind !== 'open') {
      const p = Number(a.pnlCns ?? 0) / 1e6
      l.pnl += p
      if (a.kind === 'close' || a.kind === 'liquidated') l.closed++
      if (a.kind === 'close' && p > 0) l.wins++
      if (a.kind === 'liquidated') l.liquidations++
    }
    l.lastAt = Math.max(l.lastAt, a.timestamp)
    by.set(id, l)
  }
  const body = [...by.values()].filter(l => l.address && l.closed > 0).sort((x, y) => y.pnl - x.pnl).slice(0, 100).map(l => ({ ...l, pnl: Math.round(l.pnl * 100) / 100 }))
  cache.set(days, { at: Date.now(), body })
  return body
}

// one trader's record over the last days: every open, close and liquidation, oldest first, for the profile
// card, its profit line and an activity list without the partial fills
export type TraderTrade = { kind: 'open' | 'close' | 'liquidated'; mkt: number; side: string | null; lev: number | null; pnl: number | null; at: number; tx: string }
export type Trader = { pnl: number; closed: number; wins: number; liquidations: number; trades: TraderTrade[] }
type TradeRow = { kind: string; perpId: string | null; side: string | null; leverageHdths: string | null; pnlCns: string | null; timestamp: number; tx: string }

const traders = new Map<string, { at: number; body: Trader }>()

export async function trader(indexer: string, address: string, days: number): Promise<Trader> {
  const key = `${address.toLowerCase()}:${days}`
  const hit = traders.get(key)
  if (hit && Date.now() - hit.at < 20_000) return hit.body
  const since = Math.floor(Date.now() / 1000) - days * 86_400
  const ask = async <T,>(query: string, variables: object) => {
    const r = await fetch(indexer, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })
    const j = await r.json() as { data?: T; errors?: unknown }
    if (!j.data) throw new Error('indexer: ' + JSON.stringify(j.errors).slice(0, 200))
    return j.data
  }
  const acct = await ask<{ Account: { id: string }[] }>(`query ($a: String!) { Account(where: { address: { _eq: $a } }) { id } }`, { a: address.toLowerCase() })
  const id = acct.Account[0]?.id
  const found = id ? await ask<{ Activity: TradeRow[] }>(`query ($id: numeric!, $since: Int!) { Activity(where: { accountId: { _eq: $id }, timestamp: { _gte: $since }, kind: { _in: ["open", "close", "liquidated"] } }, order_by: { block: desc }, limit: 2000) { kind perpId side leverageHdths pnlCns timestamp tx } }`, { id, since }) : { Activity: [] }
  const rows = found.Activity.slice().reverse()
  const trades: TraderTrade[] = rows.map(x => ({
    kind: x.kind as TraderTrade['kind'], mkt: Number(x.perpId ?? 0), side: x.side, lev: x.leverageHdths ? Number(x.leverageHdths) / 100 : null,
    pnl: x.kind === 'open' ? null : Number(x.pnlCns ?? 0) / 1e6, at: x.timestamp, tx: x.tx,
  }))
  const closes = trades.filter(t => t.kind !== 'open')
  const body: Trader = {
    pnl: Math.round(closes.reduce((s, t) => s + (t.pnl ?? 0), 0) * 100) / 100,
    closed: closes.length,
    wins: closes.filter(t => t.kind === 'close' && (t.pnl ?? 0) > 0).length,
    liquidations: closes.filter(t => t.kind === 'liquidated').length,
    trades,
  }
  traders.set(key, { at: Date.now(), body })
  return body
}
