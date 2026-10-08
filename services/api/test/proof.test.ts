import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'

const path = new URL('../../../tmp/claude/engine/proof-test.db', import.meta.url).pathname
rmSync(path, { force: true }); rmSync(path + '-wal', { force: true }); rmSync(path + '-shm', { force: true })
process.env.PEHRA_DB = path
const { db } = await import('../src/db')
const { writeRun, verify } = await import('../src/runs')
const { proof, pct, cut } = await import('../src/proof')

test('percentiles pick the value at or below the rank', () => {
  assert.equal(pct([], 50), null)
  assert.equal(pct([5, 1, 3, 2, 4], 50), 3)
  assert.equal(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 95), 100)
})

test('the chain verifies, then a changed row is found by its seq', () => {
  const t0 = 1_000_000
  writeRun({ kind: 'state', owner: '0xabc', rule: 'r', body: { to: 'armed' }, at: t0 })
  for (let i = 1; i <= 3; i++) writeRun({ kind: 'beat', body: { evaluations: i }, at: t0 + i * 60_000 })
  writeRun({ kind: 'note', owner: '0xabc', rule: 'r', body: { stamps: { t1: 10, t2: 12, t3: 15, t4: 300, t5: 900, b0: 100, b6: 103 } }, at: t0 + 200_000 })
  // ten minutes of silence, then the engine is back
  writeRun({ kind: 'beat', body: { evaluations: 9 }, at: t0 + 800_000 })
  const v = verify()
  assert.equal(v.ok, true)
  const p = proof(null, {}, t0 + 820_000)
  assert.equal(p.uptime.gaps.length, 1)
  assert.equal(p.uptime.gaps[0].ms, 620_000)
  assert.ok(p.uptime.pct < 30 && p.uptime.pct > 20)
  assert.equal(p.latency.decideMs.p50, 2)
  assert.equal(p.latency.fillMs.p50, 885)
  assert.equal(p.latency.blocks.p50, 3)
  // beats are not runs a person cares about, a public view shows owners cut short
  assert.ok(p.runs.every(r => r.kind !== 'beat'))
  assert.equal(p.runs[0].owner, cut('0xabc'))
  assert.equal(proof('0xabc', {}, t0 + 820_000).runs[0].owner, '0xabc')
  db.prepare(`update runs set body = '{"to":"done"}' where seq = 1`).run()
  const bad = verify()
  assert.deepEqual(bad, { ok: false, at: 1, why: 'row was changed after it was written' })
})
