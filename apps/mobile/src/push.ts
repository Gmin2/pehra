// the guard's push. android delivers through firebase, so the device token is the raw fcm token and the
// server sends with its service account. a tapped "add" notification adds margin from the phone.
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { API } from './trade'
import { log } from './log'

// a push that lands while the app is open is shown the same as one in the background
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    log(`push in foreground: ${n.request.content.title ?? ''}`)
    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }
  },
  handleError: (id, e) => log(`push not shown ${id}: ${e.message}`),
})

// three channels: guard is loud (close to liquidation, liquidated), alerts for what rules did, digest for the
// morning summary. the near category hangs "add 5 ausd" on a close to liquidation push
export async function setupPush() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('guard', { name: 'guard', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250], lightColor: '#9E4DFD' })
  await Notifications.setNotificationChannelAsync('alerts', { name: 'what your rules did', importance: Notifications.AndroidImportance.HIGH, lightColor: '#9E4DFD' })
  await Notifications.setNotificationChannelAsync('digest', { name: 'while you slept', importance: Notifications.AndroidImportance.DEFAULT })
  await Notifications.setNotificationCategoryAsync('near', [
    { identifier: 'add5', buttonTitle: 'add 5 ausd', options: { opensAppToForeground: true } },
    { identifier: 'open', buttonTitle: 'open', options: { opensAppToForeground: true } },
  ])
}

// the token again on every start without asking, it can change after an update or a restore
export async function refreshPush(address: string) {
  const perm = await Notifications.getPermissionsAsync()
  if (!perm.granted) { log('push permission not granted'); return null }
  return registerPush(address, log)
}

export async function registerPush(address: string, say: (s: string) => void) {
  await setupPush()
  const perm = await Notifications.getPermissionsAsync()
  const status = perm.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status
  if (status !== 'granted') { say('push permission denied'); return null }
  const { data: token } = await Notifications.getDevicePushTokenAsync()
  const r = await fetch(`${API}/push/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, token }) })
  const j = (await r.json()) as { devices?: number; pushReady?: boolean; error?: string }
  if (!r.ok) throw new Error(j.error ?? 'register failed')
  say(`push registered, ${j.devices} device(s), server ${j.pushReady ? 'can send' : 'has no service account yet'}`)
  return token as string
}

// which button was pressed (add5, open, or the default tap) and the push's data
export function onPushResponse(handler: (action: string, data: Record<string, string>, id: string) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener(res => handler(res.actionIdentifier, (res.notification.request.content.data ?? {}) as Record<string, string>, res.notification.request.identifier))
  return () => sub.remove()
}

// a push tapped while the app was closed is only there to be read once it has started
export async function launchedFromPush() {
  const res = await Notifications.getLastNotificationResponseAsync()
  // it keeps answering with the last push ever tapped, only a fresh one is why the app just opened
  return res && Date.now() - res.notification.date < 120_000 ? { action: res.actionIdentifier, data: (res.notification.request.content.data ?? {}) as Record<string, string>, id: res.notification.request.identifier } : null
}

export function onPushTap(handler: (data: Record<string, string>) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener(res => {
    handler((res.notification.request.content.data ?? {}) as Record<string, string>)
  })
  return () => sub.remove()
}

export const testPush = (address: string) =>
  fetch(`${API}/push/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) }).then(r => r.json() as Promise<{ sent: number; reason?: string }>)

export const addFromPush = (address: string, pid: number, ausd: number) =>
  fetch(`${API}/guard/add`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, pid, ausd }) }).then(r => r.json() as Promise<{ health?: { distance: number; collateral: number }; error?: string }>)
