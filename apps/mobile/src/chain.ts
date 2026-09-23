// the chain's record of an account, from the envio indexer (indexer/) through the api's /chain.
// activity shows these as the base list: everything that settled on monad, each with its tx. the
// guard's own records add what the chain can't say (warnings, the before and after of a rescue).
import { useEffect, useState } from 'react'
import { fromPrice, fromSize, type Market } from '@pehra/perpl'
import { API } from './trade'
import type { GuardEvent } from './guard'

export type ChainRow = {
  kind: 'deposit' | 'withdraw' | 'margin' | 'open' | 'increase' | 'decrease' | 'close' | 'liquidated'
  perpId: string | null; side: string | null; priceWire: string | null; lotWire: string | null
  amountCns: string | null; pnlCns: string | null; leverageHdths: string | null
  block: number; timestamp: number; tx: string
}

export function useChain(address: string | null, everyMs = 5000) {
  const [rows, setRows] = useState<ChainRow[] | null>(null)
  useEffect(() => {
    if (!address) return
    let alive = true
    const tick = () =>
      fetch(`${API}/chain/${address}`)
        .then(r => r.json() as Promise<{ rows?: ChainRow[] }>)
        .then(j => { if (alive && j.rows) setRows(j.rows) })
        .catch(() => {})
    tick()
    const t = setInterval(tick, everyMs)
    return () => { alive = false; clearInterval(t) }
  }, [address, everyMs])
  return rows
}

const cns = (v: string | null) => (v ? Number(v) / 1e6 : undefined)

// a chain row in the same shape activity already draws
function toEvent(r: ChainRow, markets: Market[]): GuardEvent {
  const m = r.perpId ? markets.find(x => String(x.id) === r.perpId) : undefined
  const price = m && r.priceWire ? fromPrice(m, Number(r.priceWire)) : undefined
  const amount = m && r.lotWire ? fromSize(m, Number(r.lotWire)) : undefined
  const base = { at: r.timestamp * 1000, symbol: m?.symbol, side: r.side ?? undefined, tx: r.tx, price, onchain: true }
  switch (r.kind) {
    case 'deposit': return { ...base, kind: 'funded', amount: cns(r.amountCns), text: `${cns(r.amountCns)?.toFixed(2)} ausd into perpl` }
    case 'withdraw': return { ...base, kind: 'withdrew', amount: cns(r.amountCns), text: `${cns(r.amountCns)?.toFixed(2)} ausd out of perpl` }
    case 'margin': return { ...base, kind: 'manual', addAusd: cns(r.amountCns), text: 'margin added' }
    case 'open':
    case 'increase': return { ...base, kind: 'opened', amount, lv: r.leverageHdths ? Number(r.leverageHdths) : undefined, text: r.kind === 'increase' ? 'added to a position' : 'opened' }
    case 'decrease':
    case 'close': return { ...base, kind: 'closed', amount, pnl: cns(r.pnlCns), text: r.kind === 'decrease' ? 'cut a position' : 'closed' }
    case 'liquidated': return { ...base, kind: 'failed', amount, pnl: cns(r.pnlCns), text: 'liquidated by perpl' }
  }
}

// one list: every chain row, with the guard's record swapped in where it has the same tx (it knows
// more), plus the guard's records the chain can't hold (warnings, brackets) and ones still settling
export function merge(server: GuardEvent[], chain: ChainRow[] | null, markets: Market[]): (GuardEvent & { onchain?: boolean })[] {
  if (!chain) return server
  const byTx = new Map(server.filter(e => e.tx).map(e => [e.tx!.toLowerCase(), e]))
  const onChainTx = new Set(chain.map(r => r.tx.toLowerCase()))
  const out: (GuardEvent & { onchain?: boolean })[] = chain.map(r => {
    const s = byTx.get(r.tx.toLowerCase())
    return s ? { ...s, onchain: true } : toEvent(r, markets)
  })
  for (const e of server) {
    // the phone's agora batches end on the swap, not the perpl call, so their tx won't match: the
    // chain's deposit or withdraw row stands for them
    if (e.kind === 'funded' || e.kind === 'withdrew') continue
    if (!e.tx || !onChainTx.has(e.tx.toLowerCase())) out.push({ ...e, onchain: false })
  }
  return out.sort((a, b) => b.at - a.at)
}
