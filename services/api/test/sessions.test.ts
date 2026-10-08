import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync, mkdirSync } from 'node:fs'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { ruleMessage, SIGN_TTL_MS } from '@pehra/perpl'

const dir = new URL('../../../tmp/claude/engine/', import.meta.url).pathname
mkdirSync(dir, { recursive: true })
const path = dir + 'sessions-test.db'
for (const x of ['', '-wal', '-shm']) rmSync(path + x, { force: true })
process.env.PEHRA_DB = path
const { openSession, sessionOwner, owns } = await import('../src/sessions')

const me = privateKeyToAccount(generatePrivateKey())
const stranger = privateKeyToAccount(generatePrivateKey())
const signed = async (who: typeof me, device = 'nothing 4a') => {
  const nonce = crypto.randomUUID(), exp = Date.now() + SIGN_TTL_MS
  return { device, nonce, exp, sig: await who.signMessage({ message: ruleMessage(me.address, { action: 'session', device }, nonce, exp) }) }
}
const req = (token?: string) => new Request('http://x/order', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} })

test('the account signs once and gets a token that only it owns', async () => {
  const r = await openSession(me.address, await signed(me))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.token.length, 64)
  assert.equal(sessionOwner(req(r.token)), me.address.toLowerCase())
  assert.equal(owns(req(r.token), me.address), true)
  assert.equal(owns(req(r.token), stranger.address), false, 'a token never works for another address')
})

test('a stranger signature, a replayed one, a missing device and no token are all refused', async () => {
  assert.equal((await openSession(me.address, await signed(stranger))).ok, false)
  const once = await signed(me)
  assert.equal((await openSession(me.address, once)).ok, true)
  assert.equal((await openSession(me.address, once)).ok, false, 'a nonce is good once')
  assert.equal((await openSession(me.address, { ...(await signed(me)), device: '' })).ok, false)
  assert.equal(sessionOwner(req()), null)
  assert.equal(sessionOwner(req('not-a-token')), null)
})

test('a token stops working when it expires', async () => {
  const r = await openSession(me.address, await signed(me))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(sessionOwner(req(r.token), r.exp - 1), me.address.toLowerCase())
  assert.equal(sessionOwner(req(r.token), r.exp + 1), null)
})
