// t8 through the package, the way the phone runs it: pool state, then fund and withdraw each as one batch
import { privateKeyToAccount } from 'viem/accounts'
import { parseUnits, formatUnits, createPublicClient, http, type PublicClient } from 'viem'
import { readFileSync } from 'node:fs'
import { monadChain, pairState, quote, fundCalls, withdrawCalls, sendBatch, getPerplAccount } from '../packages/perpl/src/index'
const env = Object.fromEntries(readFileSync('../services/api/.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const account = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const pub = createPublicClient({ chain: monadChain('testnet'), transport: http(), pollingInterval: 300 }) as PublicClient
console.log('pair', await pairState(pub))
const bal = async () => (await getPerplAccount(pub, account.address))?.balanceCns
const b0 = await bal()
let t0 = Date.now()
const usdcIn = parseUnits('5', 18), ausdOut = await quote(pub, usdcIn, 'usdc')
const f = await sendBatch(pub, account, fundCalls(account.address, usdcIn, ausdOut))
console.log(`fund 5 usdc: ${f.length} txs, last block ${f[f.length - 1].receipt.blockNumber}, first ${f[0].receipt.blockNumber}, ${Date.now() - t0}ms tap to done`)
const b1 = await bal()
t0 = Date.now()
const ausdIn = parseUnits('5', 6), usdcOut = await quote(pub, ausdIn, 'ausd')
const w = await sendBatch(pub, account, withdrawCalls(account.address, ausdIn, usdcOut))
console.log(`withdraw 5 ausd: ${w.length} txs, blocks ${w[0].receipt.blockNumber}..${w[w.length - 1].receipt.blockNumber}, ${Date.now() - t0}ms`)
const b2 = await bal()
console.log('perpl balance', [b0, b1, b2].map(x => formatUnits(BigInt(x ?? 0), 6)).join(' -> '))
process.exit(0)
