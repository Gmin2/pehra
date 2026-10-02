// the proof screen's data, computed only from the runs table. a beat row every minute says the engine was
// alive and what it saw, a gap between beats longer than two minutes is downtime and is shown as such.
// latency is reported as percentiles per segment so it is clear where the time went
import { db } from './db'
import { writeRun, verify, type Run } from './runs'

export const BEAT_MS = 60_000
const GAP_MS = 2 * BEAT_MS

type Beat = { evaluations: number; accounts: number; live: number; reconnects: number; lastTickAgoMs: number | null; rules: number }

export function startBeats(read: () => Beat) {
  const t = setInterval(() => writeRun({ kind: 'beat', body: read() }), BEAT_MS)
  return () => clearInterval(t)
}

const q = {
  beats: db.prepare(`select at from runs where kind = 'beat' order by seq`),
  first: db.prepare('select at from runs order by seq limit 1'),
  recentAll: db.prepare(`select * from runs where kind != 'beat' order by seq desc limit ?`),
  recentOwner: db.prepare(`select * from runs where owner = ? and kind != 'beat' order by seq desc limit ?`),
  stamped: db.prepare(`select body from runs where kind in ('note', 'fill', 'reject', 'unknown') order by seq desc limit 2000`),
  lastBeat: db.prepare(`select at, body from runs where kind = 'beat' order by seq desc limit 1`),
}

export function pct(xs: number[], p: number) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

const spread = (xs: number[]) => ({ n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), p99: pct(xs, 99) })

type Stamps = { t0?: number; b0?: number; t1?: number; t2?: number; t3?: number; t4?: number; t5?: number; b6?: number }

// a public view never shows a whole address
export const cut = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null)

export function proof(owner: string | null, now = Date.now()) {
  const beats = (q.beats.all() as { at: number }[]).map(b => b.at)
  const since = (q.first.get() as { at: number } | undefined)?.at ?? now
  const gaps: { from: number; to: number; ms: number }[] = []
  let prev = since
  for (const at of [...beats, now]) { if (at - prev > GAP_MS) gaps.push({ from: prev, to: at, ms: at - prev }); prev = at }
  const down = gaps.reduce((s, g) => s + g.ms, 0)
  const span = Math.max(1, now - since)

  const stamps = (q.stamped.all() as { body: string }[]).map(r => (JSON.parse(r.body) as { stamps?: Stamps }).stamps).filter((s): s is Stamps => !!s)
  const seg = (a: keyof Stamps, b: keyof Stamps) => stamps.filter(s => s[a] !== undefined && s[b] !== undefined).map(s => (s[b] as number) - (s[a] as number))

  const last = q.lastBeat.get() as { at: number; body: string } | undefined
  const rows = (owner ? q.recentOwner.all(owner.toLowerCase(), 200) : q.recentAll.all(200)) as Run[]
  return {
    since,
    uptime: { pct: Math.round((1 - down / span) * 10000) / 100, beats: beats.length, gaps },
    now: last ? { at: last.at, ...(JSON.parse(last.body) as Beat) } : null,
    latency: {
      decideMs: spread(seg('t1', 't2')),   // our code: frame received to intent decided
      sendMs: spread(seg('t2', 't3')),     // intent decided to written on the socket
      perplAckMs: spread(seg('t3', 't4')), // perpl's answer
      fillMs: spread(seg('t3', 't5')),     // written to filled
      blocks: spread(seg('b0', 'b6')),     // trigger block to the block it settled in
    },
    runs: rows.map(r => ({ seq: r.seq, at: r.at, owner: owner ? r.owner : cut(r.owner), rule: r.rule, kind: r.kind, body: JSON.parse(r.body) as object, hash: r.hash })),
    chain: verify(),
  }
}
