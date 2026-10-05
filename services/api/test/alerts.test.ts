import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync, mkdirSync } from 'node:fs'

const dir = new URL('../../../tmp/claude/engine/', import.meta.url).pathname
mkdirSync(dir, { recursive: true })
const path = dir + 'alerts-test.db'
for (const x of ['', '-wal', '-shm']) rmSync(path + x, { force: true })
process.env.PEHRA_DB = path
const { Alerts, setPrefs, inQuiet, prefsOf } = await import('../src/alerts')

const owner = '0xabc0000000000000000000000000000000000002'
type Sent = { title: string; body: string; data: Record<string, string> }
function rig() {
  const sent: Sent[] = []
  let distance = 0.2
  const a = new Alerts({
    log: () => {},
    owners: () => [owner],
    positions: () => [{ pid: 7, symbol: 'MON', side: 'long', distance, mkt: 64 }],
    guard: () => ({ enabled: true, thresholdPct: 5 }),
    send: async (_a, title, body, data = {}) => { sent.push({ title, body, data }); return { sent: 1 } },
  })
  return { a, sent, at: (d: number) => { distance = d } }
}
const tick = () => new Promise(r => setTimeout(r, 5))

test('close to liquidation sends once per band, a wobble on the line sends nothing more', async () => {
  const { a, sent, at } = rig()
  at(0.2); a.health(owner); await tick()
  assert.equal(sent.length, 0)
  at(0.098); a.health(owner); await tick()
  at(0.101); a.health(owner); at(0.097); a.health(owner); at(0.12); a.health(owner); await tick()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].title, 'your mon long is getting close')
  assert.match(sent[0].body, /9\.8% from liquidation\. i add margin at 5%/)
  assert.equal(sent[0].data.action, 'add')
  assert.equal(sent[0].data.categoryId, 'near')
})

test('back out past the clear level and in again inside 4 hours is still one push', async () => {
  const { a, sent, at } = rig()
  at(0.09); a.health(owner); at(0.15); a.health(owner); at(0.09); a.health(owner); await tick()
  assert.equal(sent.length, 0, 'the first test already sent for this position within 4 hours, recovering does not reset that')
})

test('stop slices seconds apart go out as one push with the average', async () => {
  const { a, sent } = rig()
  for (const [amount, price] of [[100, 0.0304], [100, 0.0303], [100, 0.0302]] as const)
    a.event(owner, { kind: 'closed', rule: 'stop', pid: 7, symbol: 'MON', side: 'long', amount, price, text: '' })
  await new Promise(r => setTimeout(r, 8300))
  assert.equal(sent.length, 1)
  assert.equal(sent[0].title, 'i sold your mon long')
  assert.equal(sent[0].body, 'in 3 slices at 0.03030 average, never below your floor.')
})

test('a switched off kind sends nothing, the guard adding margin reads before and after', async () => {
  const { a, sent } = rig()
  setPrefs(owner, { on: { filled: false } })
  a.event(owner, { kind: 'closed', rule: 'step', pid: 7, symbol: 'MON', amount: 467, price: 0.03365, text: '' })
  a.event(owner, { kind: 'added', rule: 'guard', pid: 7, symbol: 'MON', side: 'long', addAusd: 1.02, before: { distancePct: 4.9, collateral: 9 }, after: { distancePct: 10, collateral: 10 }, text: '' })
  await tick()
  assert.deepEqual(sent.map(s => s.title), ['i added 1.02 ausd to your mon long'])
  assert.equal(sent[0].body, 'it was 4.9% from liquidation, now 10.0%.')
  setPrefs(owner, { on: { filled: true } })
})

test('quiet hours wrap past midnight in the phone\'s own time zone', () => {
  const p = { ...prefsOf(owner), quiet: { from: 23 * 60, to: 7 * 60 }, tz: 330 }
  const utc = (h: number, m = 0) => Date.UTC(2026, 9, 6, h, m)
  assert.equal(inQuiet(p, utc(17, 29)), false, '22:59 in india')
  assert.equal(inQuiet(p, utc(17, 30)), true, '23:00 in india')
  assert.equal(inQuiet(p, utc(1, 29)), true, '06:59')
  assert.equal(inQuiet(p, utc(1, 30)), false, '07:00')
})

test('quiet hours hold a fill, let close to liquidation through, and say what they held when they end', async () => {
  const { a, sent } = rig()
  const night = Date.UTC(2026, 9, 6, 20, 0), morning = Date.UTC(2026, 9, 7, 2, 0)
  setPrefs(owner, { quiet: { from: 23 * 60, to: 7 * 60 }, tz: 330 })
  a.quietTick(night)
  assert.equal(await a.push(owner, 'filled', null, 'took some of your profit', 'sold 467 mon at 0.03365 on perpl.', {}, night), 'held')
  assert.equal(await a.push(owner, 'liquidated', null, 'your mon long was liquidated', 'x', {}, night), 'sent')
  a.quietTick(morning)
  await tick()
  assert.deepEqual(sent.map(s => s.title), ['your mon long was liquidated', 'while you slept'])
  assert.equal(sent[1].body, 'took some of your profit. your mon long is 20.0% from liquidation.')
  a.quietTick(morning + 60_000)
  assert.equal(sent.length, 2, 'the summary goes out once')
  setPrefs(owner, { quiet: null })
})

test('ausd off the dollar sets past the line and clears back under two thirds of it', async () => {
  const { a, sent } = rig()
  a.depegTick(0.997); a.depegTick(0.994); a.depegTick(0.9945); a.depegTick(0.998); await tick()
  assert.deepEqual(sent.map(s => s.title), ['ausd is 0.6% off the dollar'])
})

test('funding flipping against the side you hold tells you once', async () => {
  const { a, sent } = rig()
  a.fundingTick([{ id: 64, symbol: 'MON', rate: -20 }])
  a.fundingTick([{ id: 64, symbol: 'MON', rate: 30 }])
  a.fundingTick([{ id: 64, symbol: 'MON', rate: 35 }])
  await tick()
  assert.equal(sent.length, 0, 'funding is off by default')
  setPrefs(owner, { on: { funding: true } })
  a.fundingTick([{ id: 64, symbol: 'MON', rate: -5 }])
  a.fundingTick([{ id: 64, symbol: 'MON', rate: 12 }])
  await tick()
  assert.deepEqual(sent.map(s => s.title), ['you now pay to hold your mon long'])
  assert.equal(sent[0].body, 'funding on mon flipped, longs pay shorts now.')
})
