import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('../services/api/.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const dev = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const A = 'http://localhost:8787'
const post = (p: string, b: unknown) => fetch(A + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => [r.status, await r.json()])
const at = Date.now(), msg = `revoke the pehra watch key for ${dev.address.toLowerCase()} at ${at}`
const stranger = privateKeyToAccount(generatePrivateKey())
console.log('a stranger signs:', JSON.stringify(await post('/guard/revoke', { address: dev.address, at, signature: await stranger.signMessage({ message: msg }) })))
console.log('the owner signs:', JSON.stringify(await post('/guard/revoke', { address: dev.address, at, signature: await dev.signMessage({ message: msg }) })))
console.log('guard state now:', JSON.stringify(await fetch(`${A}/guard/${dev.address}`).then(r => r.json())))
// back on: a new delegation, as onboarding does it
const [, start] = await post('/guard/start', { address: dev.address }) as [number, { typed_data: any }]
const td = start.typed_data, { EIP712Domain: _d, ...types } = td.types
const sig = await dev.signTypedData({ domain: { ...td.domain, chainId: BigInt(td.domain.chainId) }, types, primaryType: td.primaryType, message: td.message })
console.log('re-enrolled:', JSON.stringify(await post('/guard/finish', { address: dev.address, signature: sig })))
process.exit(0)
