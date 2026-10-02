// perpl's signed rest api (docs: authentication, "authenticating rest requests"). the same orders, positions
// and wallet the trading socket snapshots, readable while the socket is down, so reconcile never needs it.
// each request signs chain id, method, target, timestamp, nonce and the body's sha256 with the api key.
import * as ed from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes, type Hex } from 'viem'
import { NETWORKS, type Network } from './config'
import type { Account, Order, Position } from './wire'

export type SignedKey = { apiKey: string; secret: Hex; net?: Network }

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function canonical(chainId: number, method: string, target: string, timestamp: string, nonce: string, body: string) {
  const bodyHash = bytesToHex(sha256(new TextEncoder().encode(body))).slice(2)
  return [chainId, method, target, timestamp, nonce, bodyHash].join('\n')
}

export async function signedFetch(key: SignedKey, method: 'GET' | 'POST', target: string, body = '') {
  const net = NETWORKS[key.net ?? 'testnet']
  const timestamp = Date.now().toString()
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)))
  const sig = await ed.signAsync(new TextEncoder().encode(canonical(net.chainId, method, target, timestamp, nonce, body)), hexToBytes(key.secret))
  return fetch(`${net.rest}${target}`, {
    method,
    headers: {
      'X-API-Key': key.apiKey,
      'X-API-Timestamp': timestamp,
      'X-API-Nonce': nonce,
      'X-API-Signature': b64url(sig),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
  })
}

async function read<T>(key: SignedKey, target: string): Promise<T> {
  const r = await signedFetch(key, 'GET', target)
  if (!r.ok) throw new Error(`perpl ${target} ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json() as Promise<T>
}

// each comes stamped with sn, the block it is current as of
export const restOrders = (key: SignedKey) => read<{ sn: number; d: Order[] }>(key, '/v1/trading/orders')
export const restPositions = (key: SignedKey) => read<{ sn: number; d: Position[] }>(key, '/v1/trading/positions')
export const restWallet = (key: SignedKey) => read<{ sn: number; as: Account[] }>(key, '/v1/trading/wallet')
