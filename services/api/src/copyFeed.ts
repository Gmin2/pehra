// the trades of accounts people copy, straight from monad's blocks. every block's opens, closes and
// liquidations on perpl's exchange are read and the ones from followed accounts go to the engine, so a
// copy fires about a block after the trade instead of after the indexer catches up. the indexer loop stays
// as the fallback, a row it brings later has a timestamp the copy has already seen
import { parseAbiItem, type Address, type PublicClient } from 'viem'
import { NETWORKS, getPerplAccount, type TradeRow } from '@pehra/perpl'

const EVENTS = [
  parseAbiItem('event PositionOpenedV2(uint256 perpId, uint256 accountId, uint8 positionType, uint256 leverageHdths, uint256 depositCNS, int256 pnlCollateralizedCNS, uint256 pricePNS, uint256 lotLNS, uint256 insFeeCNS, uint256 protFeeCNS, uint256 priceResiduePNSQ16)'),
  parseAbiItem('event PositionClosed(uint256 perpId, uint256 accountId, uint8 positionType, uint256 pricePNS, int256 deltaPnlCNS, int256 fundingCNS)'),
  parseAbiItem('event PositionLiquidated(uint256 perpId, uint256 posAccountId, uint8 positionType, uint256 markPricePNS, uint256 liqPricePNS, uint256 liqLotLNS, uint256 posLotLNS, int256 deltaPnlCNS, int256 fundingCNS, int256 posAmountCNS, uint256 posDepositCNS, int256 accAmountCNS, uint256 accBalanceCNS, bool onOrderBook)'),
]

export type FeedTrade = TradeRow & { tx: string; block: number; seenMs: number }

export function startCopyFeed(pub: PublicClient, deps: {
  targets: () => string[]
  onTrades: (target: string, rows: FeedTrade[]) => void
  log: (s: string) => void
}) {
  const ids = new Map<string, bigint | null>()   // followed address -> perpl account id
  const times = new Map<bigint, number>()        // block -> unix seconds
  let from: bigint | null = null, busy = false, fails = 0

  const accountOf = async (a: string) => {
    if (!ids.has(a)) ids.set(a, (await getPerplAccount(pub, a as Address).catch(() => null))?.accountId ?? null)
    return ids.get(a) ?? null
  }
  const timeOf = async (b: bigint) => {
    if (!times.has(b)) { times.set(b, Number((await pub.getBlock({ blockNumber: b })).timestamp)); if (times.size > 500) times.delete(times.keys().next().value!) }
    return times.get(b)!
  }

  const tick = async () => {
    const targets = deps.targets()
    if (!targets.length) { from = null; return }
    const head = await pub.getBlockNumber()
    if (from === null || head - from > 200n) from = head
    if (head < from) return
    const byId = new Map<bigint, string>()
    for (const t of targets) { const id = await accountOf(t); if (id) byId.set(id, t) }
    const logs = await pub.getLogs({ address: NETWORKS.testnet.exchange, events: EVENTS, fromBlock: from, toBlock: head })
    from = head + 1n
    const found = new Map<string, FeedTrade[]>()
    for (const l of logs) {
      const args = l.args as { perpId: bigint; accountId?: bigint; posAccountId?: bigint; positionType: number; leverageHdths?: bigint }
      const target = byId.get(args.accountId ?? args.posAccountId ?? -1n)
      if (!target) continue
      const kind = l.eventName === 'PositionOpenedV2' ? 'open' : l.eventName === 'PositionClosed' ? 'close' : 'liquidated'
      const row: FeedTrade = {
        kind, perpId: Number(args.perpId), side: args.positionType === 0 ? 'long' : 'short',
        leverageHdths: args.leverageHdths !== undefined ? Number(args.leverageHdths) : null,
        timestamp: await timeOf(l.blockNumber), tx: l.transactionHash, block: Number(l.blockNumber), seenMs: Date.now(),
      }
      found.set(target, [...(found.get(target) ?? []), row])
    }
    for (const [target, rows] of found) {
      deps.log(`copy feed: ${target.slice(0, 8)} ${rows.map(r => `${r.kind} ${r.side} in block ${r.block}`).join(', ')}`)
      deps.onTrades(target, rows)
    }
  }

  // monad makes a block about every 400ms, half a second keeps up without asking twice per block
  setInterval(() => {
    if (busy) return
    busy = true
    tick().then(() => { fails = 0 }).catch(e => { if (++fails % 20 === 1) deps.log(`copy feed: ${e instanceof Error ? e.message : e}`) }).finally(() => { busy = false })
  }, 500)
  return { forget: (address: string) => ids.delete(address.toLowerCase()) }
}
