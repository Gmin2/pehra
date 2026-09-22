import * as SecureStore from 'expo-secure-store'
import type { Enrolled } from '@pehra/perpl'

const keyFor = (address: string) => `pehra.perplkey.${address.toLowerCase()}`

export async function loadApiKey(address: string): Promise<Enrolled | null> {
  const raw = await SecureStore.getItemAsync(keyFor(address))
  return raw ? (JSON.parse(raw) as Enrolled) : null
}

export const saveApiKey = (address: string, key: Enrolled) => SecureStore.setItemAsync(keyFor(address), JSON.stringify(key))
