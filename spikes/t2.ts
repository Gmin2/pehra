import { hashTypedData, hexToBytes, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { readFileSync, appendFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))
const ENV = '../services/api/.env'
const env = Object.fromEntries(readFileSync(ENV, 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const account = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const API = 'https://testnet.perpl.xyz/api', CHAIN = 10143
const priv = ed.utils.randomPrivateKey()
const pub = await ed.getPublicKeyAsync(priv)
const publicKeyHex = toHex(pub)

async function tryEnroll(origin: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (origin) headers['origin'] = origin
  const body = { chain_id: CHAIN, address: account.address, public_key: publicKeyHex, scope_mask: 3, label: 'pehra dev ' + new Date().toISOString().slice(0, 16) }
  const r1 = await fetch(`${API}/v1/api-key/payload`, { method: 'POST', headers, body: JSON.stringify(body) })
  const t1 = await r1.text()
  console.log(`[origin=${origin ?? 'none'}] payload -> ${r1.status} ${t1.slice(0, 200)}`)
  if (!r1.ok) return null
  const { typed_data, mac } = JSON.parse(t1)
  const { EIP712Domain, ...types } = typed_data.types
  const td = { domain: { ...typed_data.domain, chainId: BigInt(typed_data.domain.chainId) }, types, primaryType: typed_data.primaryType, message: typed_data.message }
  console.log('  typed_data primaryType', typed_data.primaryType, 'domain', JSON.stringify(typed_data.domain), 'message keys', Object.keys(typed_data.message))
  const signature = await account.signTypedData(td as any)
  const digest = hashTypedData(td as any)
  const pop = await ed.signAsync(hexToBytes(digest), priv)
  const r2 = await fetch(`${API}/v1/api-key/enroll`, { method: 'POST', headers, body: JSON.stringify({ chain_id: CHAIN, address: account.address, typed_data, mac, signature, pop_signature: toHex(pop) }) })
  const t2 = await r2.text()
  console.log(`  enroll -> ${r2.status} ${t2.slice(0, 300)}`)
  if (!r2.ok) return null
  return JSON.parse(t2)
}

let res = null
for (const origin of [null, 'https://testnet.perpl.xyz']) {
  res = await tryEnroll(origin)
  if (res) { console.log('ENROLLED with origin', origin ?? 'none'); break }
}
if (!res) { console.log('enrollment failed on all origins'); process.exit(1) }
const info = res.api_key ?? res
console.log('key info:', { address: info.address, scope: info.scope_mask, origin: info.origin, expires: info.expires_at, builder: info.builder_id })
appendFileSync(ENV, `PERPL_API_KEY=${info.api_key}\nPERPL_API_SECRET=${toHex(priv)}\nPERPL_API_PUB=${publicKeyHex}\n`)

// ws sign in
const ws = new WebSocket('wss://testnet.perpl.xyz/ws/v1/trading')
const got: any[] = []
await new Promise<void>((resolve) => {
  const t = setTimeout(() => { console.log('ws timeout'); resolve() }, 12000)
  ws.onopen = async () => {
    const ts = Date.now().toString(), nonce = randomBytes(16).toString('base64url')
    const sig = await ed.signAsync(new TextEncoder().encode([CHAIN, 'trading-ws-signin', ts, nonce].join('\n')), priv)
    ws.send(JSON.stringify({ mt: 29, chain_id: CHAIN, api_key: info.api_key, timestamp: ts, nonce, signature: Buffer.from(sig).toString('base64url') }))
  }
  ws.onmessage = e => { const m = JSON.parse(String(e.data)); got.push(m); console.log('ws <-', JSON.stringify(m).slice(0, 500)); if (got.length >= 4) { clearTimeout(t); ws.close(); resolve() } }
  ws.onclose = e => { console.log('ws closed', e.code, e.reason); clearTimeout(t); resolve() }
  ws.onerror = e => console.log('ws error', String((e as any).message ?? e))
})
