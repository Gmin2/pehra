// the guard's push. android delivers through firebase, so the device token is the raw fcm token and the
// server sends with its service account. a tapped "add" notification adds margin from the phone.
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { API } from './trade'

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

export async function registerPush(address: string, say: (s: string) => void) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('guard', { name: 'guard', importance: Notifications.AndroidImportance.MAX, sound: 'default', vibrationPattern: [0, 250, 250, 250], lightColor: '#8b5cf6' })
  }
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
