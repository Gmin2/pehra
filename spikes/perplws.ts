import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { hexToBytes } from 'viem'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))
export const env = Object.fromEntries(readFileSync('../services/api/.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
export const CHAIN = 10143
export async function openTrading(onMsg: (m: any) => void) {
  const priv = hexToBytes(env.PERPL_API_SECRET as `0x${string}`)
  const ws = new WebSocket('wss://testnet.perpl.xyz/ws/v1/trading')
  await new Promise<void>((res, rej) => {
    ws.onopen = async () => {
      const ts = Date.now().toString(), nonce = randomBytes(16).toString('base64url')
      const sig = await ed.signAsync(new TextEncoder().encode([CHAIN, 'trading-ws-signin', ts, nonce].join('\n')), priv)
      ws.send(JSON.stringify({ mt: 29, chain_id: CHAIN, api_key: env.PERPL_API_KEY, timestamp: ts, nonce, signature: Buffer.from(sig).toString('base64url') }))
      res()
    }
    ws.onerror = e => rej(e)
  })
  ws.onmessage = e => onMsg(JSON.parse(String(e.data)))
  ws.onclose = e => console.log('ws closed', e.code, e.reason)
  return ws
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
