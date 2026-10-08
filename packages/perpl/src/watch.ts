// watching any address: its open positions read straight from the exchange contract, with how far each is
// from liquidation. a stranger's trigger orders live in perpl's backend, not on chain, so they are unknown
// here and the app says so rather than showing none
import type { Address, PublicClient } from 'viem'
import { NETWORKS, type Network } from './config'
import { escapeAbi } from './escape'
import { getPerplAccount } from './onchain'
import { positionHealth, type Health } from './guard'
import type { Market } from './rest'

export type Watched = Health & { mkt: number; symbol: string; pnl: number; entryBlock: number }

export async function watchAddress(pub: PublicClient, address: Address, markets: Market[], net: Network = 'testnet'): Promise<{ accountId: number | null; balance: number; positions: Watched[] }> {
  const acct = await getPerplAccount(pub, address, net)
  if (!acct || acct.accountId === 0n) return { accountId: null, balance: 0, positions: [] }
  const read = await Promise.all(markets.map(m => pub.readContract({ address: NETWORKS[net].exchange, abi: escapeAbi, functionName: 'getPositionV2', args: [BigInt(m.id), acct.accountId] }).catch(() => null)))
  const positions: Watched[] = []
  read.forEach((r, i) => {
    if (!r) return
    const [info, mark] = r
    if (info.lotLNS === 0n || info.accountId !== acct.accountId) return
    const m = markets[i]
    // the same health the guard computes for its own accounts, from the on chain position
    const h = positionHealth({ pid: Number(info.entryBlock), mkt: m.id, sd: info.positionType === 0 ? 1 : 2, s: Number(info.lotLNS), ep: Number(info.pricePNS), c: info.depositCNS.toString(), lv: 0 }, m, Number(mark))
    const dir = h.side === 'long' ? 1 : -1
    positions.push({ ...h, mkt: m.id, symbol: m.symbol, pnl: dir * (h.mark - h.entry) * h.size, entryBlock: Number(info.entryBlock) })
  })
  return { accountId: Number(acct.accountId), balance: Number(acct.balanceCns) / 1e6, positions }
}
