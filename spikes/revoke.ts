// does turning order forwarding off really stop the guard's api key? the dev account turns it off
// with its own wallet, the guard tries a trade through the api, then forwarding goes back on
import { privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, http, encodeFunctionData, type PublicClient } from 'viem'
import { readFileSync } from 'node:fs'
import { monadChain, sendBatch, exchangeAbi, GAS, NETWORKS } from '../packages/perpl/src/index'
const env = Object.fromEntries(readFileSync('../services/api/.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const account = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const pub = createPublicClient({ chain: monadChain('testnet'), transport: http(), pollingInterval: 300 }) as PublicClient
const fw = (on: boolean) => ({ to: NETWORKS.testnet.exchange, gas: GAS.allowForwarding, data: encodeFunctionData({ abi: exchangeAbi, functionName: 'allowOrderForwarding', args: [on] }) })
const order = () => fetch('http://localhost:8787/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account.address, symbol: 'MON', side: 'long', size: 400, leverage: 3 }) }).then(r => r.json())
const off = await sendBatch(pub, account, [fw(false)])
console.log('forwarding off, tx', off[0].hash, 'block', off[0].receipt.blockNumber)
await new Promise(r => setTimeout(r, 1500))
console.log('guard tries a trade:', JSON.stringify(await order()))
const on = await sendBatch(pub, account, [fw(true)])
console.log('forwarding back on, tx', on[0].hash)
await new Promise(r => setTimeout(r, 1500))
const r = await order()
console.log('guard tries again:', JSON.stringify(r))
process.exit(0)
