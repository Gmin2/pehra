// a device session: the passkey signs one message, the server hands back a random token for SESSION_DAYS.
// every write that is not itself signed (trades, closes, margin, guard and alert settings, push) carries it,
// so a stranger who knows an address can no longer trade it or switch its guard off
import { randomBytes } from 'node:crypto'
import { SESSION_DAYS } from '@pehra/perpl'
import { db } from './db'
import { checkSigned, type Signed } from './signedRules'

db.exec(`create table if not exists sessions (token text primary key, owner text not null, device text not null, exp integer not null)`)

const q = {
  put: db.prepare('insert into sessions (token, owner, device, exp) values (?, ?, ?, ?)'),
  get: db.prepare('select owner, exp from sessions where token = ?'),
  sweep: db.prepare('delete from sessions where exp < ?'),
}

export async function openSession(address: string, b: Signed & { device?: unknown }, now = Date.now()) {
  const device = typeof b.device === 'string' ? b.device.slice(0, 64) : ''
  if (!device) return { ok: false as const, status: 400, why: 'say which device' }
  const v = await checkSigned(address, { action: 'session', device }, b, now)
  if (!v.ok) return v
  q.sweep.run(now)
  const token = randomBytes(32).toString('hex')
  const exp = now + SESSION_DAYS * 86_400_000
  q.put.run(token, address.toLowerCase(), device, exp)
  return { ok: true as const, token, exp }
}

// the address a request's token belongs to, or null
export function sessionOwner(req: Request, now = Date.now()): string | null {
  const h = req.headers.get('authorization') ?? ''
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token) return null
  const row = q.get.get(token) as { owner: string; exp: number } | undefined
  return row && row.exp > now ? row.owner : null
}

// DEMO_READ: accounts anyone may read like their owner, for the web try page. only reads, every write is a
// POST and still needs the passkey's session
const demo = new Set((process.env.DEMO_READ ?? '').toLowerCase().split(',').filter(Boolean))

export const owns = (req: Request, address: string) =>
  sessionOwner(req) === address.toLowerCase() || (req.method === 'GET' && demo.has(address.toLowerCase()))
