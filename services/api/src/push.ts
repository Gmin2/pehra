// push through firebase cloud messaging. the service account json sits in data/ (gitignored). without it
// the server still runs and just logs what it would have sent.
import { existsSync, readFileSync } from 'node:fs'
import { writeAtomic } from './files'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

const SA = new URL('../data/firebase-service-account.json', import.meta.url)
const TOKENS = new URL('../data/push-tokens.json', import.meta.url)

const tokens = new Map<string, Set<string>>()
if (existsSync(TOKENS)) for (const [addr, list] of Object.entries(JSON.parse(readFileSync(TOKENS, 'utf8')) as Record<string, string[]>)) tokens.set(addr, new Set(list))

export const pushReady = existsSync(SA)
if (pushReady && getApps().length === 0) initializeApp({ credential: cert(JSON.parse(readFileSync(SA, 'utf8'))) })

export function registerToken(address: string, token: string) {
  const addr = address.toLowerCase()
  const set = tokens.get(addr) ?? new Set<string>()
  set.add(token)
  tokens.set(addr, set)
  writeAtomic(TOKENS, JSON.stringify(Object.fromEntries([...tokens].map(([a, s]) => [a, [...s]])), null, 2))
  return set.size
}

export type PushData = Record<string, string>

// one message per registered device, dead tokens are dropped
export async function sendPush(address: string, title: string, body: string, data: PushData = {}) {
  const addr = address.toLowerCase()
  const set = tokens.get(addr)
  if (!set || set.size === 0) { console.log('push skipped, no tokens for', addr.slice(0, 8), 'known:', [...tokens.keys()].map(k => k.slice(0, 8)).join(',')); return { sent: 0, reason: 'no tokens' } }
  if (!pushReady) { console.log('push (dry run)', addr.slice(0, 8), title, body); return { sent: 0, reason: 'no service account' } }
  const messaging = getMessaging()
  let sent = 0
  for (const token of [...set]) {
    try {
      await messaging.send({
        token,
        notification: { title, body },
        data,
        android: { priority: 'high', notification: { channelId: 'guard', sound: 'default', priority: 'max', clickAction: 'OPEN_GUARD' } },
      })
      sent++
      console.log('push sent', addr.slice(0, 8), title)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/not-registered|invalid-argument|invalid-registration/i.test(msg)) { set.delete(token); console.log('dropped dead push token', msg) }
      else console.error('push failed', msg)
    }
  }
  return { sent }
}
