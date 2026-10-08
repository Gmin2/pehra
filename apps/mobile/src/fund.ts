// the money in and out of perpl, through agora's instant settlement pair (spikes/t8.ts): usdc in the
// wallet swaps 1:1 to AUSD and lands in the perpl account, AUSD already in the wallet goes straight in,
// and withdraw runs it back to usdc. each is one batch the passkey session signs at once.
import { encodeFunctionData, formatUnits, parseUnits, type Address } from 'viem'
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

// plain numbers only: this goes into react state, and a bigint there crashes the dev build when it
// gets serialized ("Do not know how to serialize a BigInt", the black screen after a fund)
export type Moved = { ms: number; hashes: `0x${string}`[]; blocks: number[]; block: number; out: number }

// fundedAt: the block a gas top-up landed in, monad lets new money be spent three blocks later
async function run(s: Session, calls: ReturnType<typeof depositCalls>, out: number, fundedAt?: bigint): Promise<Moved> {
  const t0 = Date.now()
  const sent = await sendBatch(publicClient('testnet'), s.account, calls, { fundedAt })
  const blocks = sent.map((x) => Number(x.receipt.blockNumber))
  return { ms: Date.now() - t0, hashes: sent.map((x) => x.hash), blocks, block: blocks[blocks.length - 1], out }
}

export async function fundFromUsdc(s: Session, usdc: number, fundedAt?: bigint) {
  const pub = publicClient('testnet')
  const inWire = parseUnits(usdc.toFixed(6), AGORA.testnet.usdcDecimals)
  const out = await quote(pub, inWire, 'usdc')
  return run(s, fundCalls(s.address, inWire, out), Number(formatUnits(out, 6)), fundedAt)
}

export const depositAusd = (s: Session, ausd: number, fundedAt?: bigint) => run(s, depositCalls(parseUnits(ausd.toFixed(6), 6)), ausd, fundedAt)

export async function withdrawToUsdc(s: Session, ausd: number, fundedAt?: bigint) {
  const pub = publicClient('testnet')
  const inWire = parseUnits(ausd.toFixed(6), 6)
  const out = await quote(pub, inWire, 'ausd')
  return run(s, withdrawCalls(s.address, inWire, out), Number(formatUnits(out, AGORA.testnet.usdcDecimals)), fundedAt)
}

// testnet only: 50 usdc, the swapper role and gas from the server
export async function testUsdc(address: Address) {
  const r = await fetch(`${API}/drip/usdc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) })
  const j = (await r.json()) as { usdc?: number; error?: string; ms?: number; block?: string; txs?: string[] }
  if (!r.ok && j.error !== 'cooldown') throw new Error(j.error ?? 'drip failed')
  return j
}

// monad is final a few blocks after inclusion; the landed tray ticks when the chain is three past it
export async function waitFinal(block: number) {
  const pub = publicClient('testnet')
  for (let i = 0; i < 40; i++) {
    if (Number(await pub.getBlockNumber()) >= block + 3) return
    await new Promise((r) => setTimeout(r, 300))
  }
}

// the batch needs about 0.11 MON of gas limits in flight; below 0.2 the server tops it up first
export async function ensureGas(address: Address, mon: number): Promise<bigint | undefined> {
  if (mon >= 0.2) return undefined
  const r = await testUsdc(address)
  return r.block && r.txs?.length ? BigInt(r.block) : undefined
}

// money out of the pehra wallet to any address: ausd, usdc or mon. the passkey signs it, gas comes from the
// wallet's own mon (a send of all the mon keeps enough back for that gas)
export type Asset = 'ausd' | 'usdc' | 'mon'
const TRANSFER_GAS = 80_000n, NATIVE_GAS = 25_000n
export async function sendOut(s: Session, asset: Asset, to: Address, amount: number) {
  const pub = publicClient('testnet')
  const calls = asset === 'mon'
    ? [{ to, value: parseUnits(amount.toFixed(18), 18), gas: NATIVE_GAS }]
    : [{
        to: asset === 'ausd' ? NETWORKS.testnet.ausd : AGORA.testnet.usdc,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, parseUnits(amount.toFixed(asset === 'ausd' ? 6 : AGORA.testnet.usdcDecimals), asset === 'ausd' ? 6 : AGORA.testnet.usdcDecimals)] }),
        gas: TRANSFER_GAS,
      }]
  return run(s, calls, amount)
}
