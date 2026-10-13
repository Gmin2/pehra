// the web try page opens the demo account with no passkey. anything that would sign shows the drawn
// fingerprint and gets a pretend session back, the writes it makes stay in the browser (web/sim.ts)
import type { PasskeyCredentialMetadata } from '@category-labs/mera'
import { DEMO, fingerprint } from './web/demo'

export const RP = { id: 'pehra-passkeys.vercel.app', name: 'pehra' }

export type StoredAccount = { address: `0x${string}`; credentialId: string }

export type Session = {
  address: `0x${string}`
  session: never
  account: { address: `0x${string}`; signMessage: (m: unknown) => Promise<`0x${string}`>; signTypedData: (m: unknown) => Promise<`0x${string}`> }
}

export const bip39Seed = (_mnemonic: string) => new Uint8Array()
export const timings: Record<string, number> = {}
export const testAccount = false

const SIG = `0x${'00'.repeat(65)}` as `0x${string}`
const demo = () => ({ address: DEMO, credentialId: 'demo', session: undefined as never, account: { address: DEMO, signMessage: async () => SIG, signTypedData: async () => SIG } })

export async function createAccount(): Promise<Session & { credentialId: string }> {
  await fingerprint()
  return demo()
}

export async function signIn(_credential?: PasskeyCredentialMetadata): Promise<Session & { credentialId: string }> {
  await fingerprint()
  return demo()
}

export async function loadStored(): Promise<StoredAccount | null> {
  return { address: DEMO, credentialId: 'demo' }
}

export async function forgetStored() {}
