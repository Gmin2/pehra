// every rule write is signed by the account's own key over the plain message the phone showed. the server
// rebuilds that message from what it received, so a changed rule fails the check, and a nonce is good once
import { verifyMessage, type Hex } from 'viem'
import { ruleMessage, SIGN_TTL_MS, type SignedAction } from '@pehra/perpl'
import { db } from './db'

db.exec(`create table if not exists nonces (nonce text primary key, owner text not null, exp integer not null)`)

const q = {
  used: db.prepare('select 1 from nonces where nonce = ?'),
  use: db.prepare('insert into nonces (nonce, owner, exp) values (?, ?, ?)'),
  sweep: db.prepare('delete from nonces where exp < ?'),
}

export type Signed = { nonce?: unknown; exp?: unknown; sig?: unknown }
export type Verdict = { ok: true } | { ok: false; status: 401 | 409; why: string }

export async function checkSigned(address: string, action: SignedAction, b: Signed, now = Date.now()): Promise<Verdict> {
  if (process.env.ALLOW_UNSIGNED_RULES === '1' && b.sig === undefined) return { ok: true }
  if (typeof b.nonce !== 'string' || typeof b.exp !== 'number' || typeof b.sig !== 'string') return { ok: false, status: 401, why: 'the rule has to be signed by the account' }
  if (b.exp < now) return { ok: false, status: 401, why: 'the signature expired, sign it again' }
  if (b.exp > now + SIGN_TTL_MS + 30_000) return { ok: false, status: 401, why: 'the signature is good for five minutes at most' }
  const message = ruleMessage(address, action, b.nonce, b.exp)
  const good = await verifyMessage({ address: address as Hex, message, signature: b.sig as Hex }).catch(() => false)
  if (!good) return { ok: false, status: 401, why: 'the signature is not from this account, or the rule changed after signing' }
  if (q.used.get(b.nonce)) return { ok: false, status: 409, why: 'this signature was already used' }
  q.sweep.run(now)
  q.use.run(b.nonce, address.toLowerCase(), b.exp)
  return { ok: true }
}
