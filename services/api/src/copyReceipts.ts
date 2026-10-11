// receipts for copied trades: the trade of the account being copied and the copy it caused, both on
// monad, and how many blocks apart they landed. read from the signed run log, blocks from the receipts
import type { PublicClient, Hex } from 'viem'
import { db } from './db'

const q = db.prepare(`select r.seq, r.rule, r.kind, r.body, r.at from runs r join rules u on u.id = r.rule where r.owner = ? and u.kind = 'copy' and r.kind in ('note', 'fill') order by r.seq desc limit 400`)
const target = db.prepare(`select lower(json_extract(body, '$.target')) as t from rules where id = ?`)
const blocks = new Map<string, number>()

type Source = { kind: string; tx: string; block: number; at: number; seenMs?: number }
export type CopyReceipt = { rule: string; target: string; kind: string; side?: string; size?: number; price?: number; theirTx: string; theirBlock: number; yourTx: string; yourBlock: number; blocks: number; at: number }

export async function copyReceipts(pub: PublicClient, owner: string, only?: string): Promise<CopyReceipt[]> {
  const rows = (q.all(owner.toLowerCase()) as { rule: string; kind: string; body: string; at: number }[]).reverse()
  const waiting = new Map<string, Source[]>()
  const out: CopyReceipt[] = []
  for (const r of rows) {
    const b = JSON.parse(r.body) as { source?: Source[]; kind?: string; tx?: string; side?: string; size?: number; price?: number }
    if (r.kind === 'note' && b.source?.length) { waiting.set(r.rule, b.source); continue }
    if (r.kind !== 'fill' || !b.tx) continue
    const src = waiting.get(r.rule)?.find(s => s.kind === b.kind || (b.kind === 'close' && s.kind === 'liquidated'))
    if (!src) continue
    waiting.delete(r.rule)
    const t = (target.get(r.rule) as { t: string } | undefined)?.t ?? ''
    if (only && t !== only.toLowerCase()) continue
    if (!blocks.has(b.tx)) {
      const rc = await pub.getTransactionReceipt({ hash: b.tx as Hex }).catch(() => null)
      if (rc) blocks.set(b.tx, Number(rc.blockNumber))
    }
    const yours = blocks.get(b.tx)
    if (yours === undefined) continue
    out.push({ rule: r.rule, target: t, kind: b.kind ?? src.kind, side: b.side, size: b.size, price: b.price, theirTx: src.tx, theirBlock: src.block, yourTx: b.tx, yourBlock: yours, blocks: yours - src.block, at: r.at })
  }
  return out.reverse()
}
