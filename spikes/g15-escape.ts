// g15: the escape hatch through the shared builder (packages/perpl/src/escape.ts), from the owner key with no
// api. FORWARDING_OFF=1 also switches forwarding off in the same batch, and turns it back on at the end
import { encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, sendBatch, getContext, getPerplAccount, openPositions, closeAllCalls, exchangeAbi, NETWORKS, GAS, restOrders } from '../packages/perpl/src/index'
import { env } from './perplws'

const off = process.env.FORWARDING_OFF === '1'
const owner = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const pub = publicClient('testnet')
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
const t0 = Date.now()
const acct = await getPerplAccount(pub, owner.address)
if (!acct) throw new Error('no perpl account')
const ctx = await getContext('testnet')
const open = await openPositions(pub, acct.accountId, ctx.markets.filter(m => m.config.is_open).map(m => m.id))
console.log('open before', open.map(p => `${p.perpId} ${p.long ? 'long' : 'short'} ${p.lots} lots, mark ${p.mark}`), 'triggers', (await restOrders(key)).d.filter(o => o.st === 8).length)
const sent = await sendBatch(pub, owner, closeAllCalls(open, { forwardingOff: off }))
for (const s of sent) console.log('tx', s.hash, s.receipt.status, 'gas', s.receipt.gasUsed.toString())
const left = await openPositions(pub, acct.accountId, open.map(p => p.perpId))
console.log('open after', left.length, 'triggers after', (await restOrders(key)).d.filter(o => o.st === 8).length, 'in', Date.now() - t0, 'ms')
console.log('RESULT g15:', left.length ? `partial, ${left.length} left` : `confirmed, ${open.length} closed${off ? ' and forwarding off' : ''}`)
if (off) {
  const [s] = await sendBatch(pub, owner, [{ to: NETWORKS.testnet.exchange as `0x${string}`, gas: GAS.allowForwarding, data: encodeFunctionData({ abi: exchangeAbi, functionName: 'allowOrderForwarding', args: [true] }) }])
  console.log('forwarding back on', s.hash, s.receipt.status)
}
process.exit(0)
