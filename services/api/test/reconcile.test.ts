import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import type { MarketDataSocket, TradingSocket, Position } from '@pehra/perpl'

const path = new URL('../../../tmp/claude/engine/reconcile-test.db', import.meta.url).pathname
for (const x of ['', '-wal', '-shm']) rmSync(path + x, { force: true })
process.env.PEHRA_DB = path
const { Engine } = await import('../src/engine')
const { openIntent, intent } = await import('../src/intents')

const owner = '0xabc0000000000000000000000000000000000001'
const pos = (pid: number, c: string): Position => ({ pid, mkt: 64, sd: 1, s: 200, ep: 3400, c, lv: 200 })
const positions = new Map<number, Position>([[1, pos(1, '5000000')], [2, pos(2, '3000000')]])
const ts = { account: { id: 1, b: '0' }, positions, orders: new Map() } as unknown as TradingSocket
const engine = new Engine({
  market: { states: new Map(), head: 0 } as unknown as MarketDataSocket,
  ctx: () => null, session: () => ts, emit: () => {}, nextTx: async () => undefined, log: () => {},
})

test('reconcile settles unknown margin adds from the collateral perpl holds now', () => {
  // collateral was 4, add 1, now 5: it landed
  openIntent({ id: 'a', rule: 'r', owner, kind: 'add', pid: 1, size: 1, stamps: {}, body: { before: { collateral: 4, distancePct: 30 } } })
  // collateral was 3, add 1, still 3: it did not
  openIntent({ id: 'b', rule: 'r', owner, kind: 'add', pid: 2, size: 1, stamps: {}, body: { before: { collateral: 3, distancePct: 30 } } })
  // the position is gone
  openIntent({ id: 'c', rule: 'r', owner, kind: 'add', pid: 9, size: 1, stamps: {}, body: { before: { collateral: 3, distancePct: 30 } } })
  engine.reconcile(owner)
  assert.equal(intent('a')?.state, 'filled')
  assert.equal(intent('a')?.fill, 1)
  assert.equal(intent('b')?.state, 'rejected')
  assert.equal(intent('c')?.state, 'void')
})

test('an intent still on the wire is left alone', () => {
  openIntent({ id: 'd', rule: 'r2', owner, kind: 'add', pid: 2, size: 1, stamps: {}, body: { before: { collateral: 3, distancePct: 30 } } })
  ;(engine as unknown as { inflight: Map<string, string> }).inflight.set('d', 'r2')
  engine.reconcile(owner)
  assert.equal(intent('d')?.state, 'sending')
})
