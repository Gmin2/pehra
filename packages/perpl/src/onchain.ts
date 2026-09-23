import { createPublicClient, decodeAbiParameters, encodeFunctionData, fallback, http, parseAbi, parseGwei, toFunctionSelector, webSocket, type Address, type Chain, type Hex, type LocalAccount, type PublicClient, type TransactionReceipt } from 'viem'
import { NETWORKS, type Network } from './config'

export const erc20Abi = parseAbi([
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
])

export const exchangeAbi = parseAbi([
  'function createAccount(uint256 amountCNS) returns (uint256)',
  'function depositCollateral(uint256 amountCNS)',
  'function withdrawCollateral(uint256 amountCNS)',
  'function allowOrderForwarding(bool allow)',
  'function getMinAccountOpenCNS() view returns (uint256)',
])

export const faucetAbi = parseAbi(['function requestFunds(address)'])
export const AUSD_FAUCET = '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C' as const

// gas limits seen on testnet, with room. monad charges the limit so these stay tight.
export const GAS = { approve: 80_000n, createAccount: 220_000n, allowForwarding: 80_000n, transfer: 60_000n, erc20Transfer: 80_000n, faucet: 120_000n } as const

// blocks are 300ms, so poll receipts at that pace instead of viem's four seconds
export const POLL_MS = 300

// monad admits a tx only if the balance covers gas limit times the fee cap for everything pending from
// the sender, so the cap stays close to the real base fee. base is 100 gwei on testnet, priority 2 gwei.
export type Fees = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
const PRIORITY = parseGwei('2')
const feeCache = new Map<PublicClient, { at: number; fees: Fees }>()

export async function feeCaps(pub: PublicClient): Promise<Fees> {
  const hit = feeCache.get(pub)
  if (hit && Date.now() - hit.at < 60_000) return hit.fees
  const block = await pub.getBlock({ blockTag: 'latest' })
  const base = block.baseFeePerGas ?? parseGwei('100')
  const fees = { maxFeePerGas: base + base / 4n + PRIORITY, maxPriorityFeePerGas: PRIORITY }
  feeCache.set(pub, { at: Date.now(), fees })
  return fees
}

export function monadChain(net: Network = 'testnet'): Chain {
  const c = NETWORKS[net]
  return { id: c.chainId, name: net === 'testnet' ? 'Monad Testnet' : 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [c.rpc], webSocket: [c.rpc.replace('https://', 'wss://')] } } }
}

// one websocket carries every call, so parallel reads cost one round trip instead of one tls handshake each.
// http stays as the fallback for networks that block websockets. one client per network, so a connection
// warmed at app start is the one every later call rides on.
const clients = new Map<Network, PublicClient>()
export function publicClient(net: Network = 'testnet'): PublicClient {
  const hit = clients.get(net)
  if (hit) return hit
  const c = monadChain(net)
  const client = createPublicClient({ chain: c, transport: fallback([webSocket(c.rpcUrls.default.webSocket?.[0], { reconnect: true }), http()]), pollingInterval: POLL_MS })
  clients.set(net, client)
  return client
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

export type Call = { to: Address; data?: Hex; value?: bigint; gas: bigint }
export type Sent = { hash: Hex; receipt: TransactionReceipt }

export const nextNonce = (pub: PublicClient, address: Address) => pub.getTransactionCount({ address, blockTag: 'pending' })

// one call per poll, no block number lookups. blocks are 300ms so this rarely loops more than twice.
export async function waitReceipt(pub: PublicClient, hash: Hex, timeoutMs = 15_000): Promise<TransactionReceipt> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await pub.getTransactionReceipt({ hash }).catch(() => null)
    if (r) return r
    await new Promise(res => setTimeout(res, 150))
  }
  throw new Error(`no receipt for ${hash} after ${timeoutMs}ms`)
}

// monad budgets in flight gas for an account under 10 MON against its balance as of k blocks ago
// (docs.monad.xyz, reserve balance, k is 3). a fresh account funded in block b cannot send before b plus 3,
// and execution on the receiving node can trail consensus by one more, so the wait is four.
export const RESERVE_LAG = 4n

export async function waitForBlock(pub: PublicClient, block: bigint) {
  while (true) {
    const head = await pub.getBlockNumber({ cacheTime: 0 })
    if (head >= block) return head
    await new Promise(r => setTimeout(r, 150))
  }
}

// the rule reads the balance at head minus k, so that is the read that has to come back funded
export async function waitSpendable(pub: PublicClient, address: Address, fundedAt: bigint) {
  let head = await waitForBlock(pub, fundedAt + RESERVE_LAG)
  while (true) {
    const lagged = await pub.getBalance({ address, blockNumber: head - RESERVE_LAG + 1n })
    if (lagged > 0n) return
    await new Promise(r => setTimeout(r, 150))
    head = await pub.getBlockNumber({ cacheTime: 0 })
  }
}

// a rejection for balance can still happen on the block boundary, so one retry window stays as a backstop
async function sendRaw(pub: PublicClient, raw: Hex): Promise<Hex> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await pub.sendRawTransaction({ serializedTransaction: raw })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt >= 8 || !/insufficient balance|insufficient funds/i.test(msg)) throw e
      await new Promise(r => setTimeout(r, 300))
    }
  }
}

// signs every call locally with consecutive nonces and fires them together, then waits for the last receipt.
// monad executes them in nonce order, so when the last one is in, the earlier ones are too.
// fundedAt is the block the sender's balance landed in, when it is fresh; sends wait out the reserve lag.
export async function sendBatch(pub: PublicClient, account: LocalAccount, calls: Call[], opts: { net?: Network; nonce?: number; fundedAt?: bigint } = {}): Promise<Sent[]> {
  if (calls.length === 0) return []
  const chainId = NETWORKS[opts.net ?? 'testnet'].chainId
  const [nonce, fees] = await Promise.all([opts.nonce ?? nextNonce(pub, account.address), feeCaps(pub)])
  const raws = await Promise.all(calls.map((c, i) => account.signTransaction({
    chainId, type: 'eip1559', nonce: nonce + i, to: c.to, data: c.data, value: c.value ?? 0n, gas: c.gas, ...fees,
  })))
  if (opts.fundedAt !== undefined) await waitSpendable(pub, account.address, opts.fundedAt)
  // in nonce order, so the pool never holds a later nonce while an earlier one is still being judged
  const hashes: Hex[] = []
  for (const r of raws) hashes.push(await sendRaw(pub, r))
  const last = await waitReceipt(pub, hashes[hashes.length - 1])
  const receipts = hashes.length === 1 ? [last] : await Promise.all(hashes.map((h, i) => i === hashes.length - 1 ? last : pub.getTransactionReceipt({ hash: h })))
  receipts.forEach((r, i) => { if (r.status !== 'success') throw new Error(`tx ${i} reverted ${hashes[i]}`) })
  return hashes.map((hash, i) => ({ hash, receipt: receipts[i] }))
}

export type SetupReport = { step: 'approve' | 'createAccount' | 'allowForwarding'; hash: Hex; block: bigint }[]

// approve, open the perpl account with a deposit, allow the api to forward orders, all in one block.
// an account that already exists was created here with forwarding on, so it sends nothing at all.
export async function setupPerplAccount(pub: PublicClient, account: LocalAccount, opts: { depositCns: bigint; net?: Network; fundedAt?: bigint }) {
  const net = opts.net ?? 'testnet'
  const cfg = NETWORKS[net]
  const [existing, nonce] = await Promise.all([getPerplAccount(pub, account.address, net), nextNonce(pub, account.address), feeCaps(pub)])
  if (existing) return { info: existing, report: [] as SetupReport }
  const calls: Call[] = [
    { to: cfg.ausd, gas: GAS.approve, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [cfg.exchange, opts.depositCns * 10n] }) },
    { to: cfg.exchange, gas: GAS.createAccount, data: encodeFunctionData({ abi: exchangeAbi, functionName: 'createAccount', args: [opts.depositCns] }) },
    { to: cfg.exchange, gas: GAS.allowForwarding, data: encodeFunctionData({ abi: exchangeAbi, functionName: 'allowOrderForwarding', args: [true] }) },
  ]
  const steps: SetupReport[number]['step'][] = ['approve', 'createAccount', 'allowForwarding']
  const sent = await sendBatch(pub, account, calls, { net, nonce, fundedAt: opts.fundedAt })
  const report: SetupReport = sent.map((s, i) => ({ step: steps[i], hash: s.hash, block: s.receipt.blockNumber }))
  const info = await getPerplAccount(pub, account.address, net)
  if (!info) throw new Error('account not found after setup')
  return { info, report }
}
