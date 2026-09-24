import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from '@category-labs/mera'
import { reactNativeWebAuthnClient } from '@category-labs/mera/react-native-webauthn-client'
import { toViemAccount } from '@category-labs/mera/viem'
import { entropyToMnemonic } from '@scure/bip39'
import { pbkdf2Sync } from 'react-native-quick-crypto'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { HDKey } from '@scure/bip32'
import * as SecureStore from 'expo-secure-store'
import * as Device from 'expo-device'

// same derivation as the mera demo: prf bytes are bip39 entropy, evm key at m/44'/60'/0'/0/0.
// change this and every user gets a new address, so it never changes.
export const RP = { id: 'pehra-passkeys.vercel.app', name: 'pehra' }
const PATH = "m/44'/60'/0'/0/0"
const ACCOUNT_KEY = 'pehra.account.v1'

export type StoredAccount = { address: `0x${string}`; credentialId: string }

export type Session = {
  address: `0x${string}`
  session: Secp256k1SigningSession
  account: ReturnType<typeof toViemAccount>
}

// bip39 seed = pbkdf2 sha512, 2048 rounds, over the nfkd mnemonic with salt "mnemonic". the native
// pbkdf2 takes about 20ms where the javascript one took two seconds on hermes.
export function bip39Seed(mnemonic: string, passphrase = '') {
  const out = pbkdf2Sync(mnemonic.normalize('NFKD'), ('mnemonic' + passphrase).normalize('NFKD'), 2048, 64, 'sha512')
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
}

export const timings: Record<string, number> = {}

function deriveKey(prfOutput: Uint8Array) {
  const mnemonic = entropyToMnemonic(prfOutput, wordlist)
  const t0 = Date.now()
  const seed = bip39Seed(mnemonic)
  timings.seed = Date.now() - t0
  const hd = HDKey.fromMasterSeed(seed).derive(PATH)
  timings.derive = Date.now() - t0
  if (!hd.privateKey) throw new Error('no private key at path')
  const privateKey = new Uint8Array(hd.privateKey)
  seed.fill(0)
  return { privateKey, mnemonic }
}

function openSession(prfOutput: Uint8Array): Session {
  const { privateKey } = deriveKey(prfOutput)
  const session = createSecp256k1SigningSession({ privateKey })
  privateKey.fill(0)
  prfOutput.fill(0)
  const address = getEvmAddress(session.publicKey)
  return { address, session, account: toViemAccount(session) }
}

// the android emulator has no google account, so no passkey. in a dev build on an emulator the
// account comes from 32 random bytes kept in secure store and fed through the same derivation a
// passkey's prf output takes. a real phone and a release build always use the passkey.
export const testAccount = __DEV__ && !Device.isDevice
const TEST_PRF = 'pehra.emulator.prf.v1'
async function testSession(): Promise<Session & { credentialId: string }> {
  let hex = await SecureStore.getItemAsync(TEST_PRF)
  if (!hex) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    await SecureStore.setItemAsync(TEST_PRF, hex)
  }
  const prf = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)))
  const s = openSession(prf)
  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify({ address: s.address, credentialId: 'emulator' }))
  return { ...s, credentialId: 'emulator' }
}

export async function createAccount(): Promise<Session & { credentialId: string }> {
  if (testAccount) return testSession()
  const res = await createPasskeyWithPrfOutput({
    rp: RP,
    user: { name: 'pehra', displayName: `pehra ${new Date().toISOString().slice(0, 10)}` },
    webAuthnClient: reactNativeWebAuthnClient,
  })
  const s = openSession(res.prfOutput)
  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify({ address: s.address, credentialId: res.credentialId }))
  return { ...s, credentialId: res.credentialId }
}

export async function signIn(credential?: PasskeyCredentialMetadata): Promise<Session & { credentialId: string }> {
  if (testAccount) return testSession()
  const res = await getPasskeyPrfOutput({ rpId: RP.id, credential, webAuthnClient: reactNativeWebAuthnClient })
  const s = openSession(res.prfOutput)
  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify({ address: s.address, credentialId: res.credentialId }))
  return { ...s, credentialId: res.credentialId }
}

export async function loadStored(): Promise<StoredAccount | null> {
  const raw = await SecureStore.getItemAsync(ACCOUNT_KEY)
  return raw ? (JSON.parse(raw) as StoredAccount) : null
}

export async function forgetStored() {
  await SecureStore.deleteItemAsync(ACCOUNT_KEY)
}
