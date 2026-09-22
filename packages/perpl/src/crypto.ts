import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { hexToBytes, toHex, type Hex } from 'viem'

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function base64url(bytes: Uint8Array) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[n >> 18] + B64[(n >> 12) & 63]
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]
    if (i + 2 < bytes.length) out += B64[n & 63]
  }
  return out
}

export function randomBytes(n: number) {
  const b = new Uint8Array(n)
  globalThis.crypto.getRandomValues(b)
  return b
}

export type ApiKeyPair = { secret: Hex; publicKey: Hex }

export function newApiKeyPair(): ApiKeyPair {
  const secret = ed.utils.randomPrivateKey()
  return { secret: toHex(secret), publicKey: toHex(ed.getPublicKey(secret)) }
}

export function signBytes(secret: Hex, msg: Uint8Array) {
  return ed.sign(msg, hexToBytes(secret))
}

export function signInFrame(chainId: number, apiKey: string, secret: Hex) {
  const timestamp = Date.now().toString()
  const nonce = base64url(randomBytes(16))
  const msg = new TextEncoder().encode([chainId, 'trading-ws-signin', timestamp, nonce].join('\n'))
  const signature = base64url(signBytes(secret, msg))
  return { mt: 29, chain_id: chainId, api_key: apiKey, timestamp, nonce, signature }
}
