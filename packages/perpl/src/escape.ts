// the escape hatch: everything the account's own key needs to close every position straight on the
// exchange, no api, no pehra server (spike g9: works with forwarding on, about 310k gas a close). turning
// forwarding off first also pauses every trigger perpl holds and refuses the guard's key (g8, revoke)
import { encodeFunctionData, parseAbi, type Address, type PublicClient } from 'viem'
import { NETWORKS, type Network } from './config'
import { exchangeAbi, GAS, type Call } from './onchain'

export const escapeAbi = parseAbi([
  'struct OrderDesc { uint256 orderDescId; uint256 perpId; uint8 orderType; uint256 orderId; uint256 pricePNS; uint256 lotLNS; uint256 expiryBlock; bool postOnly; bool fillOrKill; bool immediateOrCancel; uint256 maxMatches; uint256 leverageHdths; uint256 lastExecutionBlock; uint256 amountCNS; uint256 maxNegPnlCollatBPS; }',
  'struct PositionInfo { uint256 accountId; uint256 nextNodeId; uint256 prevNodeId; uint8 positionType; uint256 depositCNS; uint256 pricePNS; uint256 lotLNS; uint256 entryBlock; int256 pnlCNS; int256 deltaPnlCNS; int256 premiumPnlCNS; uint256 priceResiduePNSQ16; }',
  'function execOrders(OrderDesc[] orderDescs, bool revertOnFail)',
  'function getPositionV2(uint256 perpId, uint256 accountId) view returns (PositionInfo positionInfo, uint256 markPricePNS, bool markPriceValid)',
])

// onchain order types: 0 open long, 1 open short, 2 close long, 3 close short (positionType 0 is long)
const CLOSE_LONG = 2, CLOSE_SHORT = 3
// a close far enough from the mark to fill in a moving market, the same 5% perpl's own rescue page uses
const AWAY_BPS = 500n
// gas a direct close used (g9), with room
export const CLOSE_GAS = 450_000n

export type Open = { perpId: number; long: boolean; lots: bigint; mark: bigint }

// every open position the account holds, read straight from the exchange
export async function openPositions(pub: PublicClient, accountId: bigint, perpIds: number[], net: Network = 'testnet'): Promise<Open[]> {
  const exchange = NETWORKS[net].exchange
  const out: Open[] = []
  for (const perpId of perpIds) {
    const [info, mark] = await pub.readContract({ address: exchange, abi: escapeAbi, functionName: 'getPositionV2', args: [BigInt(perpId), accountId] })
    if (info.lotLNS > 0n && info.accountId === accountId) out.push({ perpId, long: info.positionType === 0, lots: info.lotLNS, mark })
  }
  return out
}

// forwarding off (optional) then one ioc close per position, in one batch. ids start past now, so they are
// above anything the forwarder sent (orderDescIds only go up per account)
export function closeAllCalls(open: Open[], o: { forwardingOff: boolean; now?: number; net?: Network }): Call[] {
  const exchange = NETWORKS[o.net ?? 'testnet'].exchange as Address
  const calls: Call[] = []
  if (o.forwardingOff) calls.push({ to: exchange, gas: GAS.allowForwarding, data: encodeFunctionData({ abi: exchangeAbi, functionName: 'allowOrderForwarding', args: [false] }) })
  if (!open.length) return calls
  const id = BigInt(o.now ?? Date.now())
  const descs = open.map((p, i) => ({
    orderDescId: id + BigInt(i), perpId: BigInt(p.perpId), orderType: p.long ? CLOSE_LONG : CLOSE_SHORT, orderId: 0n,
    pricePNS: p.long ? p.mark * (10_000n - AWAY_BPS) / 10_000n : p.mark * (10_000n + AWAY_BPS) / 10_000n,
    lotLNS: p.lots, expiryBlock: 0n, postOnly: false, fillOrKill: false, immediateOrCancel: true, maxMatches: 0n,
    leverageHdths: 100n, lastExecutionBlock: 0n, amountCNS: 0n, maxNegPnlCollatBPS: 1000n,
  }))
  // revertOnFail false: a position that cannot close does not stop the others
  calls.push({ to: exchange, gas: CLOSE_GAS * BigInt(open.length), data: encodeFunctionData({ abi: escapeAbi, functionName: 'execOrders', args: [descs, false] }) })
  return calls
}
