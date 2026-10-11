// copying a trader: what the target did on chain since the last look (from the indexer's activity rows)
// becomes intents on this account. pure, the engine feeds it rows and carries the intents out
import type { Rule } from './rule'
import type { Health } from './guard'
import type { Intent, Mem } from './step'

type Copy = Extract<Rule, { kind: 'copy' }>
export type TradeRow = { kind: string; perpId: string | number | null; side: string | null; leverageHdths: string | number | null; timestamp: number }
// held: any position this account already has on a market, the copy never opens on top of one it did not make
export type CopyCtx = { mark: (mkt: number) => number | undefined; position: (pid: number) => Health | null; armedAt: number; held?: (mkt: number) => boolean }

const sig = (v: number) => Number(v.toPrecision(4))

export function onTrades(rule: Copy, mem: Mem, rows: TradeRow[], ctx: CopyCtx): { mem: Mem; intents: Intent[] } {
  // only what happened after the copy was armed, oldest first
  const seen = mem.seen ?? Math.floor(ctx.armedAt / 1000)
  const fresh = rows.filter(r => r.timestamp > seen).sort((a, b) => a.timestamp - b.timestamp)
  if (!fresh.length) return { mem: mem.seen === undefined ? { ...mem, seen } : mem, intents: [] }
  const copied = { ...(mem.copied ?? {}) }
  const sizes = { ...(mem.copiedSize ?? {}) }
  const intents: Intent[] = []
  const who = `${rule.target.slice(0, 6)}…${rule.target.slice(-4)}`
  for (const r of fresh) {
    const mkt = Number(r.perpId)
    if (!mkt) continue
    const mine = copied[mkt] ? ctx.position(copied[mkt]) : null
    if (r.kind === 'open' && (r.side === 'long' || r.side === 'short')) {
      if (mine) { intents.push({ kind: 'notify', text: `${who} opened again on a market you already copy, left alone` }); continue }
      // perpl keeps one position per market, a copy opened here would merge into yours and close it with them
      if (ctx.held?.(mkt)) { intents.push({ kind: 'notify', text: `${who} opened a ${r.side}, you already hold that market, the copy left it alone` }); continue }
      const mark = ctx.mark(mkt)
      if (mark === undefined) continue
      const theirs = Number(r.leverageHdths ?? 0) / 100
      const leverage = Math.min(theirs > 0 ? theirs : rule.maxLeverage, rule.maxLeverage)
      const k = rule.limitPct / 100
      intents.push({ kind: 'open', mkt, side: r.side, ausd: rule.margin, leverage, limit: sig(r.side === 'long' ? mark * (1 + k) : mark * (1 - k)), why: `${who} opened a ${r.side}` })
    }
    if ((r.kind === 'close' || r.kind === 'liquidated') && rule.closeWithThem && mine) {
      // only what the copy bought, anything you added to it stays yours
      const size = Math.min(mine.size, mem.copiedSize?.[mkt] ?? mine.size)
      intents.push({ kind: 'close', pid: mine.pid, size, floor: sig(mine.side === 'long' ? mine.mark * 0.99 : mine.mark * 1.01), why: `${who} ${r.kind === 'close' ? 'closed' : 'was liquidated'}` })
      delete copied[mkt]
      if (sizes[mkt] !== undefined) delete sizes[mkt]
    }
  }
  return { mem: { ...mem, seen: Math.max(seen, ...fresh.map(r => r.timestamp)), copied, copiedSize: sizes }, intents }
}
