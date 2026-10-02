// g9: the escape hatch. can the account's own key close a position by calling the exchange directly,
// with order forwarding on and no api session involved? does a resting trigger on that position die?
//   1. through the api socket: open 200 mon and rest a backstop far below
//   2. from the owner key: read getPositionV2, send execOrders with one ioc close at mark x 0.95
//   3. watch the api socket for the close and the backstop's end
import { encodeFunctionData, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, sendBatch, NETWORKS } from '../packages/perpl/src/index'
import { connect, openLong, mark, monPosition, until, stamp, sleep, MON } from './g-lib'
import { env } from './perplws'

const exchange = NETWORKS.testnet.exchange as `0x${string}`
const abi = parseAbi([
  'struct OrderDesc { uint256 orderDescId; uint256 perpId; uint8 orderType; uint256 orderId; uint256 pricePNS; uint256 lotLNS; uint256 expiryBlock; bool postOnly; bool fillOrKill; bool immediateOrCancel; uint256 maxMatches; uint256 leverageHdths; uint256 lastExecutionBlock; uint256 amountCNS; uint256 maxNegPnlCollatBPS; }',
  'struct PositionInfo { uint256 accountId; uint256 nextNodeId; uint256 prevNodeId; uint8 positionType; uint256 depositCNS; uint256 pricePNS; uint256 lotLNS; uint256 entryBlock; int256 pnlCNS; int256 deltaPnlCNS; int256 premiumPnlCNS; uint256 priceResiduePNSQ16; }',
  'function execOrders(OrderDesc[] orderDescs, bool revertOnFail)',
  'function getPositionV2(uint256 perpId, uint256 accountId) view returns (PositionInfo positionInfo, uint256 markPricePNS, bool markPriceValid)',
])

const owner = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const pub = publicClient('testnet')
const ts = await connect()
const accountId = BigInt(ts.account?.id ?? 0)
const pos = await openLong(ts)
const back = await ts.stopLoss(pos, Math.round((await mark()).mrk * 0.85))
const backOid = back.order?.oid ?? 0
console.log(stamp(), 'backstop resting', backOid, 'st', back.order?.st)
await sleep(1500)

const [info, markPNS, valid] = await pub.readContract({ address: exchange, abi, functionName: 'getPositionV2', args: [BigInt(MON), accountId] })
console.log(stamp(), 'onchain position', JSON.stringify({ type: info.positionType, lot: info.lotLNS.toString(), deposit: info.depositCNS.toString(), mark: markPNS.toString(), valid }))
const long = info.positionType === 0
const desc = {
  orderDescId: BigInt(Date.now()), perpId: BigInt(MON), orderType: long ? 2 : 3, orderId: 0n,
  pricePNS: long ? markPNS * 95n / 100n : markPNS * 105n / 100n, lotLNS: info.lotLNS,
  expiryBlock: 0n, postOnly: false, fillOrKill: false, immediateOrCancel: true, maxMatches: 0n,
  leverageHdths: 100n, lastExecutionBlock: 0n, amountCNS: 0n, maxNegPnlCollatBPS: 1000n,
}
const data = encodeFunctionData({ abi, functionName: 'execOrders', args: [[desc], false] })
const gas = await pub.estimateGas({ account: owner.address, to: exchange, data }).catch(e => { console.log(stamp(), 'estimate failed', (e as Error).message.slice(0, 200)); return 400_000n })
console.log(stamp(), 'estimated gas', gas.toString())
const t0 = Date.now()
const [sent] = await sendBatch(pub, owner, [{ to: exchange, data, gas: gas * 13n / 10n }])
console.log(stamp(), 'direct close tx', sent.hash, 'status', sent.receipt.status, 'gas used', sent.receipt.gasUsed.toString(), 'in', Date.now() - t0, 'ms')

await until('api sees the close', () => monPosition(ts) === null, 20_000).catch(e => console.log(stamp(), (e as Error).message))
await sleep(1500)
const bo = ts.orders.get(backOid)
console.log(stamp(), 'api socket: position', monPosition(ts) ? 'still open' : 'closed', '| backstop', JSON.stringify(bo && { st: bo.st, sr: bo.sr }))
console.log('RESULT g9:', sent.receipt.status === 'success' && !monPosition(ts) ? `direct close works, ${sent.receipt.gasUsed} gas, api saw it, backstop st ${bo?.st} sr ${bo?.sr}` : 'direct close FAILED')
ts.close()
await sleep(300)
