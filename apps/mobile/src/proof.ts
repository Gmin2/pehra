// the proof screen's data (services/api/src/proof.ts): uptime from the minute beats, how fast actions went,
// this account's receipts and the hash chain with its last onchain anchor
import { API } from './trade'
import { authedGet } from './session'

export type Spread = { n: number; p50: number | null; p95: number | null; p99: number | null }
export type Receipt = { seq: number; at: number; rule: string | null; ruleKind: string | null; mkt: number | null; what: string; side?: string; limit?: number; size?: number; price?: number; ausd?: number; before?: number; after?: number; tx: string | null; hash: string }
export type Proof = {
  since: number
  uptime: { pct: number; beats: number; gaps: { from: number; to: number; ms: number }[] }
  latency: { decideMs: Spread; sendMs: Spread; perplAckMs: Spread; fillMs: Spread; blocks: Spread }
  chain: { ok: boolean; rows: number; head?: string; at?: number; why?: string }
  receipts: Receipt[]
  anchor: { at: number; head: string; rows: number; tx: string; block: number } | null
}

export async function readProof(address: string): Promise<Proof> {
  const r = await authedGet(`/proof/${address}`, address)
  if (!r.ok) throw new Error(`proof ${r.status}`)
  return r.json() as Promise<Proof>
}

export async function verifyChain(): Promise<Proof['chain']> {
  const r = await fetch(`${API}/proof/verify`)
  if (!r.ok) throw new Error(`verify ${r.status}`)
  return r.json() as Promise<Proof['chain']>
}

// the last seven local days. each day lists its stretches as fractions: down (beats missing), before pehra
// started, or still to come. pct is the share of the week pehra was up, counted only while it existed
export type Span = { from: number; to: number; kind: 'down' | 'none' }
export function week(p: Pick<Proof, 'since' | 'uptime'>, now = Date.now()) {
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0)
  const start = day0.getTime() - 6 * 86_400_000
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = start + i * 86_400_000, to = from + 86_400_000
    const frac = (a: number, b: number) => ({ from: (Math.max(a, from) - from) / 86_400_000, to: (Math.min(b, to) - from) / 86_400_000 })
    const spans: Span[] = []
    if (p.since > from) spans.push({ ...frac(from, p.since), kind: 'none' })
    for (const g of p.uptime.gaps) if (g.to > from && g.from < to) spans.push({ ...frac(g.from, g.to), kind: 'down' })
    if (now < to) spans.push({ ...frac(now, to), kind: 'none' })
    return { label: new Date(from).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2).toLowerCase(), spans: spans.filter(x => x.to > x.from), started: p.since < to }
  })
  const lived = now - Math.max(start, p.since)
  const down = p.uptime.gaps.reduce((t, g) => t + Math.max(0, Math.min(g.to, now) - Math.max(g.from, start, p.since)), 0)
  return { days, pct: lived > 0 ? Math.max(0, (1 - down / lived) * 100) : 0 }
}
