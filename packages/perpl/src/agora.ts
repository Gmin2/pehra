// agora instant settlement: a fixed price pair between AUSD and a partner stablecoin, 1:1 and no fee on
// testnet. there the partner is CTK (18 decimals, token0), which the app shows as usdc, as agora
// suggested. the pair only swaps for APPROVED_SWAPPER addresses; on testnet anyone may grant that
// through the whitelister, on mainnet it comes from agora's kyc. verified by spikes/t8.ts.
import { encodeFunctionData, parseAbi, type Address, type PublicClient } from 'viem'
import { NETWORKS, type Network } from './config'
import { erc20Abi, exchangeAbi, type Call } from './onchain'

export const AGORA = {
  testnet: {
    pair: '0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae' as Address,
    usdc: '0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D' as Address,
    usdcDecimals: 18,
    whitelister: '0x7c10F56d6f04a51376393a1C3670e966863F6BD5' as Address,
  },
  mainnet: {
    pair: '0xf33286E3222D1c829dACeac48c0Ec651F6452470' as Address,
    usdc: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' as Address,
    usdcDecimals: 6,
    whitelister: null,
  },
} as const

export const pairAbi = parseAbi([
  'function reserve0() view returns (uint256)',
  'function reserve1() view returns (uint256)',
  'function token0() view returns (address)',
  'function isPaused() view returns (bool)',
  'function getPriceNormalized() view returns (uint256)',
  'function token0PurchaseFee() view returns (uint256)',
  'function token1PurchaseFee() view returns (uint256)',
  'function hasRole(string,address) view returns (bool)',
  'function getAmountsOut(uint256,address[]) view returns (uint256[])',
  'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])',
])
export const whitelisterAbi = parseAbi(['function setApprovedSwapper(address)'])

// limits from spikes/t8.ts with about ten percent room. monad charges the limit.
export const AGORA_GAS = { whitelist: 265_000n, approve: 80_000n, swap: 232_000n, deposit: 150_000n, withdraw: 150_000n } as const

export type PairState = { usdcReserve: number; ausdReserve: number; paused: boolean; price: number; fee: number }

export async function pairState(pub: PublicClient, net: Network = 'testnet'): Promise<PairState> {
  const a = AGORA[net]
  const read = <T,>(functionName: 'reserve0' | 'reserve1' | 'token0' | 'isPaused' | 'getPriceNormalized' | 'token0PurchaseFee' | 'token1PurchaseFee') =>
    pub.readContract({ address: a.pair, abi: pairAbi, functionName }) as Promise<T>
  const [r0, r1, t0, paused, price, f0, f1] = await Promise.all([
    read<bigint>('reserve0'), read<bigint>('reserve1'), read<Address>('token0'), read<boolean>('isPaused'), read<bigint>('getPriceNormalized'), read<bigint>('token0PurchaseFee'), read<bigint>('token1PurchaseFee'),
  ])
  const usdcFirst = t0.toLowerCase() === a.usdc.toLowerCase()
  const [ru, ra] = usdcFirst ? [r0, r1] : [r1, r0]
  return {
    usdcReserve: Number(ru) / 10 ** a.usdcDecimals,
    ausdReserve: Number(ra) / 1e6,
    paused,
    price: Number(price) / 1e18,
    fee: Number(f0 > f1 ? f0 : f1) / 1e18,
  }
}

export const isSwapper = (pub: PublicClient, address: Address, net: Network = 'testnet') =>
  pub.readContract({ address: AGORA[net].pair, abi: pairAbi, functionName: 'hasRole', args: ['APPROVED_SWAPPER', address] })

const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300)

// usdc in the wallet to AUSD at the pair's price, then into the perpl account, as one batch.
// the pair is 1:1 with no fee, so the minimum out is the quote itself.
export function fundCalls(user: Address, usdcIn: bigint, ausdOut: bigint, net: Network = 'testnet'): Call[] {
  const a = AGORA[net], cfg = NETWORKS[net]
  return [
    { to: a.usdc, gas: AGORA_GAS.approve, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [a.pair, usdcIn] }) },
    { to: a.pair, gas: AGORA_GAS.swap, data: encodeFunctionData({ abi: pairAbi, functionName: 'swapExactTokensForTokens', args: [usdcIn, ausdOut, [a.usdc, cfg.ausd], user, deadline()] }) },
    ...depositCalls(ausdOut, net),
  ]
}

// AUSD already in the wallet straight into perpl
export function depositCalls(ausd: bigint, net: Network = 'testnet'): Call[] {
  const cfg = NETWORKS[net]
  return [
    { to: cfg.ausd, gas: AGORA_GAS.approve, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [cfg.exchange, ausd] }) },
    { to: cfg.exchange, gas: AGORA_GAS.deposit, data: encodeFunctionData({ abi: exchangeAbi, functionName: 'depositCollateral', args: [ausd] }) },
  ]
}

// out of perpl and back to usdc at the pair, as one batch
export function withdrawCalls(user: Address, ausd: bigint, usdcOut: bigint, net: Network = 'testnet'): Call[] {
  const a = AGORA[net], cfg = NETWORKS[net]
  return [
    { to: cfg.exchange, gas: AGORA_GAS.withdraw, data: encodeFunctionData({ abi: exchangeAbi, functionName: 'withdrawCollateral', args: [ausd] }) },
    { to: cfg.ausd, gas: AGORA_GAS.approve, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [a.pair, ausd] }) },
    { to: a.pair, gas: AGORA_GAS.swap, data: encodeFunctionData({ abi: pairAbi, functionName: 'swapExactTokensForTokens', args: [ausd, usdcOut, [cfg.ausd, a.usdc], user, deadline()] }) },
  ]
}

export async function quote(pub: PublicClient, amountIn: bigint, from: 'usdc' | 'ausd', net: Network = 'testnet') {
  const a = AGORA[net], cfg = NETWORKS[net]
  const path = from === 'usdc' ? [a.usdc, cfg.ausd] : [cfg.ausd, a.usdc]
  const out = await pub.readContract({ address: a.pair, abi: pairAbi, functionName: 'getAmountsOut', args: [amountIn, path] })
  return out[1]
}
