import { describe, expect, test } from 'bun:test'
import * as ed from '@noble/ed25519'
import { hexToBytes } from 'viem'
import { base64url, newApiKeyPair, signBytes, signInFrame } from '../src/crypto'

describe('crypto', () => {
  test('base64url matches node for lengths 0 to 40, no padding', () => {
    for (let n = 0; n <= 40; n++) {
      const b = new Uint8Array(n).map((_, i) => (i * 37 + n) & 255)
      expect(base64url(b)).toBe(Buffer.from(b).toString('base64url'))
    }
  })
  test('key pair public key matches the secret', () => {
    const k = newApiKeyPair()
    expect(k.secret).toMatch(/^0x[0-9a-f]{64}$/)
    expect(ed.getPublicKey(hexToBytes(k.secret))).toEqual(hexToBytes(k.publicKey))
  })
  test('sign in frame verifies against the canonical string', () => {
    const k = newApiKeyPair()
    const f = signInFrame(10143, 'key_abc', k.secret)
    expect(f.mt).toBe(29)
    expect(f.chain_id).toBe(10143)
    const msg = new TextEncoder().encode([10143, 'trading-ws-signin', f.timestamp, f.nonce].join('\n'))
    const sig = Buffer.from(f.signature, 'base64url')
    expect(ed.verify(sig, msg, hexToBytes(k.publicKey))).toBe(true)
    expect(Number(f.timestamp)).toBeGreaterThan(Date.now() - 5000)
  })
  test('signBytes is deterministic', () => {
    const k = newApiKeyPair()
    const m = new TextEncoder().encode('pehra')
    expect(signBytes(k.secret, m)).toEqual(signBytes(k.secret, m))
  })
})
