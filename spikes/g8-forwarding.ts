// g8: what happens to a resting trigger when the owner turns order forwarding off, and back on?
// this is what revoke and the escape hatch do to the rules perpl holds.
import { encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, sendBatch, exchangeAbi, NETWORKS, GAS, restOrders, restWallet } from '../packages/perpl/src/index'
import { connect, openLong, closeAll, mark, stamp, sleep } from './g-lib'
import { env } from './perplws'

const exchange = NETWORKS.testnet.exchange as `0x${string}`
const owner = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const pub = publicClient('testnet')
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
const forwarding = async (allow: boolean) => {
  const [s] = await sendBatch(pub, owner, [{ to: exchange, gas: GAS.allowForwarding, data: encodeFunctionData({ abi: exchangeAbi, functionName: 'allowOrderForwarding', args: [allow] }) }])
  console.log(stamp(), `allowOrderForwarding(${allow})`, s.hash, s.receipt.status)
}
const triggers = async () => (await restOrders(key)).d.filter(o => o.st === 8).map(o => `${o.oid} os ${o.os}`)

const ts = await connect()
const pos = await openLong(ts)
const back = await ts.stopLoss(pos, Math.round((await mark()).mrk * 0.85))
console.log(stamp(), 'backstop', back.order?.oid, 'st', back.order?.st)
await sleep(1500)
console.log(stamp(), 'before: resting', await triggers(), 'fw', (await restWallet(key)).as[0]?.fw)

await forwarding(false)
await sleep(3000)
console.log(stamp(), 'forwarding off: resting', await triggers().catch(e => (e as Error).message), 'fw', (await restWallet(key)).as[0]?.fw)
const tryOrder = await ts.stopLoss(pos, Math.round((await mark()).mrk * 0.8)).catch(e => ({ err: (e as Error).message }))
console.log(stamp(), 'a new trigger while off ->', JSON.stringify('err' in tryOrder ? tryOrder : { st: tryOrder.order?.st, sr: tryOrder.order?.sr, status: tryOrder.status?.status }))

await forwarding(true)
await sleep(3000)
const after = await triggers()
console.log(stamp(), 'forwarding on again: resting', after, 'fw', (await restWallet(key)).as[0]?.fw)
console.log('RESULT g8:', after.some(t => t.startsWith(String(back.order?.oid))) ? 'the backstop survived off and on' : 'the backstop is gone after off and on')

ts.close()
await sleep(500)
const t2 = await connect()
await closeAll(t2); await sleep(1500); t2.close(); await sleep(300)
