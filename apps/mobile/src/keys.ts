import * as SecureStore from 'expo-secure-store'
import type { Enrolled } from '@pehra/perpl'

const keyFor = (address: string) => `pehra.perplkey.${address.toLowerCase()}`

export async function loadApiKey(address: string): Promise<Enrolled | null> {
  const raw = await SecureStore.getItemAsync(keyFor(address))
  return raw ? (JSON.parse(raw) as Enrolled) : null
}

export const saveApiKey = (address: string, key: Enrolled) => SecureStore.setItemAsync(keyFor(address), JSON.stringify(key))

// set when onboarding reaches the end, so a wipe or a half finished run lands on onboarding again
const ONBOARDED = 'pehra.onboarded.v1'
export const isOnboarded = () => SecureStore.getItemAsync(ONBOARDED).then(v => v === '1')
export const setOnboarded = (v: boolean) => (v ? SecureStore.setItemAsync(ONBOARDED, '1') : SecureStore.deleteItemAsync(ONBOARDED))
