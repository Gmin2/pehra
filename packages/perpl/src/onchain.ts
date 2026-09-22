import { createPublicClient, decodeAbiParameters, http, parseAbi, toFunctionSelector, type Address, type Hex, type PublicClient, type WalletClient, type Account, type Chain } from 'viem'
import { NETWORKS, type Network } from './config'

export const erc20Abi = parseAbi([
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
])

export const exchangeAbi = parseAbi([
  'function createAccount(uint256 amountCNS) returns (uint256)',
  'function depositCollateral(uint256 amountCNS)',
  'function allowOrderForwarding(bool allow)',
  'function getMinAccountOpenCNS() view returns (uint256)',
])

export const faucetAbi = parseAbi(['function requestFunds(address)'])
export const AUSD_FAUCET = '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C' as const

export function monadChain(net: Network = 'testnet'): Chain {
  const c = NETWORKS[net]
  return { id: c.chainId, name: net === 'testnet' ? 'Monad Testnet' : 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [c.rpc] } } }
}

export function publicClient(net: Network = 'testnet') {
  return createPublicClient({ chain: monadChain(net), transport: http() })
}

export type PerplAccountInfo = { accountId: bigint; balanceCns: bigint; lockedCns: bigint; frozen: boolean; addr: Address }

// getAccountByAddr is not in the published abi, the tuple shape was read off the testnet contract
export async function getPerplAccount(pub: PublicClient, address: Address, net: Network = 'testnet'): Promise<PerplAccountInfo | null> {
  const data = (toFunctionSelector('function getAccountByAddr(address)') + address.slice(2).padStart(64, '0')) as Hex
  try {
    const r = await pub.call({ to: NETWORKS[net].exchange, data })
    if (!r.data || r.data.length < 10) return null
    const [info] = decodeAbiParameters([{ type: 'tuple', components: [
      { type: 'uint256', name: 'accountId' }, { type: 'uint256', name: 'balanceCNS' }, { type: 'uint256', name: 'lockedBalanceCNS' },
      { type: 'bool', name: 'frozen' }, { type: 'address', name: 'accountAddr' }, { type: 'uint256[4]', name: 'positions' },
    ] }], r.data)
    return { accountId: info.accountId, balanceCns: info.balanceCNS, lockedCns: info.lockedBalanceCNS, frozen: info.frozen, addr: info.accountAddr }
  } catch {
    return null
  }
}

export type SetupStep = 'approve' | 'createAccount' | 'allowForwarding'
export type SetupReport = { step: SetupStep; hash: Hex; block: bigint; gasUsed: bigint }[]

// monad charges the gas limit, not gas used, so the limit is the estimate plus a small margin
async function sendWithMargin(pub: PublicClient, wallet: WalletClient<any, Chain, Account>, args: any) {
  const gas = await pub.estimateContractGas({ ...args, account: wallet.account })
  const hash = await wallet.writeContract({ ...args, gas: gas + gas * 75n / 1000n })
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`${args.functionName} reverted in ${hash}`)
  return { hash, block: r.blockNumber, gasUsed: r.gasUsed }
}

// approve, open the perpl account with a deposit, allow the api to forward orders. skips what is already done.
export async function setupPerplAccount(pub: PublicClient, wallet: WalletClient<any, Chain, Account>, opts: { depositCns: bigint; net?: Network; onStep?: (s: SetupStep) => void }) {
  const net = opts.net ?? 'testnet'
  const cfg = NETWORKS[net]
  const me = wallet.account.address
  const report: SetupReport = []
  const existing = await getPerplAccount(pub, me, net)
  if (!existing) {
    const allowance = await pub.readContract({ address: cfg.ausd, abi: erc20Abi, functionName: 'allowance', args: [me, cfg.exchange] })
    if (allowance < opts.depositCns) {
      opts.onStep?.('approve')
      report.push({ step: 'approve', ...await sendWithMargin(pub, wallet, { address: cfg.ausd, abi: erc20Abi, functionName: 'approve', args: [cfg.exchange, opts.depositCns * 10n] }) })
    }
    opts.onStep?.('createAccount')
    report.push({ step: 'createAccount', ...await sendWithMargin(pub, wallet, { address: cfg.exchange, abi: exchangeAbi, functionName: 'createAccount', args: [opts.depositCns] }) })
  }
  opts.onStep?.('allowForwarding')
  report.push({ step: 'allowForwarding', ...await sendWithMargin(pub, wallet, { address: cfg.exchange, abi: exchangeAbi, functionName: 'allowOrderForwarding', args: [true] }) })
  const info = await getPerplAccount(pub, me, net)
  if (!info) throw new Error('account not found after setup')
  return { info, report }
}
