// the web try page: a read only look at a real pehra account on testnet. there is no passkey on the web
// page, so anything that would sign says what the app does there instead
import type { PasskeyCredentialMetadata } from '@category-labs/mera'
import { DEMO, DemoError } from './web/demo'

export const RP = { id: 'pehra-passkeys.vercel.app', name: 'pehra' }

export type StoredAccount = { address: `0x${string}`; credentialId: string }

export type Session = {
  address: `0x${string}`
  session: never
  account: { signMessage: (m: unknown) => Promise<`0x${string}`> }
}

export const bip39Seed = (_mnemonic: string) => new Uint8Array()
export const timings: Record<string, number> = {}
export const testAccount = false

export async function createAccount(): Promise<Session & { credentialId: string }> {
  throw new DemoError('in the app, a passkey on your phone makes the account')
}

export async function signIn(_credential?: PasskeyCredentialMetadata): Promise<Session & { credentialId: string }> {
  throw new DemoError()
}

export async function loadStored(): Promise<StoredAccount | null> {
  return { address: DEMO, credentialId: 'demo' }
}

export async function forgetStored() {}
