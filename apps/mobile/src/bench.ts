// runs once at app start on the phone, no passkey needed. numbers land in the log list.
import { createPublicClient, http, webSocket } from 'viem'
import { mnemonicToSeedSync } from '@scure/bip39'
import { HDKey } from '@scure/bip32'
import { newApiKeyPair, signInFrame, publicClient } from '@pehra/perpl'
import { bip39Seed } from './account'

export async function bench(say: (s: string) => void) {
  const lap = async (label: string, fn: () => Promise<unknown> | unknown) => {
    const t0 = Date.now()
    try { await fn(); say(`bench ${label}: ${Date.now() - t0}ms`) } catch (e) { say(`bench ${label} failed after ${Date.now() - t0}ms: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`) }
  }
  const httpC = createPublicClient({ transport: http('https://testnet-rpc.monad.xyz') })
  await lap('http rpc first call', () => httpC.getBlockNumber({ cacheTime: 0 }))
  await lap('http rpc second call', () => httpC.getBlockNumber({ cacheTime: 0 }))
  await lap('http rpc 3 parallel', () => Promise.all([httpC.getBlockNumber({ cacheTime: 0 }), httpC.getChainId(), httpC.getGasPrice()]))
  const wsC = createPublicClient({ transport: webSocket('wss://testnet-rpc.monad.xyz') })
  await lap('ws rpc first call', () => wsC.getBlockNumber({ cacheTime: 0 }))
  await lap('ws rpc second call', () => wsC.getBlockNumber({ cacheTime: 0 }))
  await lap('ws rpc 3 parallel', () => Promise.all([wsC.getBlockNumber({ cacheTime: 0 }), wsC.getChainId(), wsC.getGasPrice()]))
  const pkg = publicClient('testnet')
  await lap('package client first call', () => pkg.getBlockNumber({ cacheTime: 0 }))
  await lap('package client second call', () => pkg.getBlockNumber({ cacheTime: 0 }))
  await lap('perpl ws open', () => new Promise<void>((res, rej) => { const w = new WebSocket('wss://testnet.perpl.xyz/ws/v1/trading'); w.onopen = () => { w.close(); res() }; w.onerror = () => rej(new Error('ws error')) }))
  await lap('perpl context fetch', () => fetch('https://testnet.perpl.xyz/api/v1/pub/context'))
  const k = newApiKeyPair()
  await lap('ed25519 keypair + sign', () => signInFrame(10143, 'k', k.secret))
  await lap('ed25519 sign again', () => signInFrame(10143, 'k', k.secret))
  const m = 'test test test test test test test test test test test junk'
  await lap('bip39 seed, javascript pbkdf2', () => mnemonicToSeedSync(m))
  await lap('bip39 seed, native pbkdf2', () => bip39Seed(m))
  const a = mnemonicToSeedSync(m), b = bip39Seed(m)
  say(`bench native seed matches javascript seed: ${a.length === b.length && a.every((x, i) => x === b[i])}`)
  await lap('bip32 derive', () => HDKey.fromMasterSeed(new Uint8Array(64)).derive("m/44'/60'/0'/0/0"))
}
