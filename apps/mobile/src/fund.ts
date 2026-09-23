// the money in and out of perpl, through agora's instant settlement pair (spikes/t8.ts): usdc in the
// wallet swaps 1:1 to AUSD and lands in the perpl account, AUSD already in the wallet goes straight in,
// and withdraw runs it back to usdc. each is one batch the passkey session signs at once.
import { formatUnits, parseUnits, type Address } from 'viem'
import { AGORA, NETWORKS, depositCalls, erc20Abi, fundCalls, getPerplAccount, pairState, publicClient, quote, sendBatch, withdrawCalls, type PairState } from '@pehra/perpl'
import type { Session } from './account'
import { API } from './trade'

export type Wallet = { usdc: number; ausd: number; perpl: number; mon: number }

export async function walletBalances(address: Address): Promise<Wallet> {
  const pub = publicClient('testnet'), a = AGORA.testnet
  const [usdc, ausd, acct, mon] = await Promise.all([
    pub.readContract({ address: a.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    pub.readContract({ address: NETWORKS.testnet.ausd, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    getPerplAccount(pub, address),
    pub.getBalance({ address }),
  ])
  return { usdc: Number(formatUnits(usdc, a.usdcDecimals)), ausd: Number(formatUnits(ausd, 6)), perpl: acct ? Number(formatUnits(acct.balanceCns, 6)) : 0, mon: Number(formatUnits(mon, 18)) }
}

export const pool = (): Promise<PairState> => pairState(publicClient('testnet'))

export type Moved = { ms: number; hashes: `0x${string}`[]; blocks: bigint[]; block: bigint; out: number }

async function run(s: Session, calls: ReturnType<typeof depositCalls>, out: number): Promise<Moved> {
  const t0 = Date.now()
  const sent = await sendBatch(publicClient('testnet'), s.account, calls)
  const blocks = sent.map((x) => x.receipt.blockNumber)
  return { ms: Date.now() - t0, hashes: sent.map((x) => x.hash), blocks, block: blocks[blocks.length - 1], out }
}

export async function fundFromUsdc(s: Session, usdc: number) {
  const pub = publicClient('testnet')
  const inWire = parseUnits(usdc.toFixed(6), AGORA.testnet.usdcDecimals)
  const out = await quote(pub, inWire, 'usdc')
  return run(s, fundCalls(s.address, inWire, out), Number(formatUnits(out, 6)))
}

export const depositAusd = (s: Session, ausd: number) => run(s, depositCalls(parseUnits(ausd.toFixed(6), 6)), ausd)

export async function withdrawToUsdc(s: Session, ausd: number) {
  const pub = publicClient('testnet')
  const inWire = parseUnits(ausd.toFixed(6), 6)
  const out = await quote(pub, inWire, 'ausd')
  return run(s, withdrawCalls(s.address, inWire, out), Number(formatUnits(out, AGORA.testnet.usdcDecimals)))
}

// testnet only: 50 usdc, the swapper role and gas from the server
export async function testUsdc(address: Address) {
  const r = await fetch(`${API}/drip/usdc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) })
  const j = (await r.json()) as { usdc?: number; error?: string; ms?: number }
  if (!r.ok && j.error !== 'cooldown') throw new Error(j.error ?? 'drip failed')
  return j
}

// monad is final a few blocks after inclusion; the landed tray ticks when the chain is three past it
export async function waitFinal(block: bigint) {
  const pub = publicClient('testnet')
  for (let i = 0; i < 40; i++) {
    if ((await pub.getBlockNumber()) >= block + 3n) return
    await new Promise((r) => setTimeout(r, 300))
  }
}
