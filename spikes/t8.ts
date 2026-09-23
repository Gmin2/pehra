// t8: agora instant settlement on monad testnet. the dev wallet whitelists itself, swaps AUSD into CTK
// (the test usdc the drip will hand out), then runs the fund path the phone will: CTK to AUSD at 1:1 on
// the pair and straight into the perpl account. gas estimated per call, every step timed.
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('../services/api/.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const account = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [env.MONAD_RPC] } } } as const
const pub = createPublicClient({ chain, transport: http() })
const wallet = createWalletClient({ account, chain, transport: http() })
const AUSD = '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC', CTK = '0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D', PAIR = '0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae', WL = '0x7c10F56d6f04a51376393a1C3670e966863F6BD5', PERPL = '0x1964c32f0be608e7d29302aff5e61268e72080cc'
const USER = '0xA8741ED6c57872498aFE4f792D8D238EA1C071f9'
const erc = parseAbi(['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'])
const pair = parseAbi(['function hasRole(string,address) view returns (bool)', 'function getAmountsOut(uint256,address[]) view returns (uint256[])', 'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])'])
const wl = parseAbi(['function setApprovedSwapper(address)'])
const perpl = parseAbi(['function depositCollateral(uint256 amountCNS)', 'function getAccountByAddr(address) view returns (uint256, uint256, uint256, bool, address, uint256[4])'])

async function send(label: string, args: any) {
  const t0 = Date.now()
  const gas = await pub.estimateContractGas({ ...args, account })
  const limit = gas + gas / 10n
  const hash = await wallet.writeContract({ ...args, gas: limit })
  const r = await pub.waitForTransactionReceipt({ hash, pollingInterval: 300 })
  console.log(`${label}: ${r.status} in ${Date.now() - t0}ms, gas est ${gas} limit ${limit}, block ${r.blockNumber} ${hash}`)
  if (r.status !== 'success') process.exit(1)
  return r
}
const bal = async (t: string, a: string) => pub.readContract({ address: t as `0x${string}`, abi: erc, functionName: 'balanceOf', args: [a as `0x${string}`] })
const role = (a: string) => pub.readContract({ address: PAIR, abi: pair, functionName: 'hasRole', args: ['APPROVED_SWAPPER', a as `0x${string}`] })
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300)

if (!(await role(account.address))) await send('whitelist dev', { address: WL, abi: wl, functionName: 'setApprovedSwapper', args: [account.address] })
// can a third party whitelist someone else? if so the server does it for users, no gas on their side
if (!(await role(USER))) await send('whitelist user from the dev wallet', { address: WL, abi: wl, functionName: 'setApprovedSwapper', args: [USER] })
console.log('user is swapper now', await role(USER))

// stock the drip with test usdc
const stock = parseUnits('1000', 6)
if ((await bal(CTK, account.address)) < parseUnits('100', 18)) {
  const q = await pub.readContract({ address: PAIR, abi: pair, functionName: 'getAmountsOut', args: [stock, [AUSD, CTK]] })
  console.log('quote 1000 ausd ->', formatUnits(q[1], 18), 'ctk')
  await send('approve ausd to pair', { address: AUSD, abi: erc, functionName: 'approve', args: [PAIR, stock] })
  await send('swap ausd -> ctk', { address: PAIR, abi: pair, functionName: 'swapExactTokensForTokens', args: [stock, q[1], [AUSD, CTK], account.address, deadline()] })
}
console.log('dev ctk', formatUnits(await bal(CTK, account.address), 18))

// the fund path: 10 usdc in, 10 ausd out, deposited into perpl
const acct = async () => (await pub.readContract({ address: PERPL, abi: perpl, functionName: 'getAccountByAddr', args: [account.address] }))[1]
const before = await acct()
const t0 = Date.now()
const inCtk = parseUnits('10', 18)
const q = await pub.readContract({ address: PAIR, abi: pair, functionName: 'getAmountsOut', args: [inCtk, [CTK, AUSD]] })
console.log('quote 10 ctk ->', formatUnits(q[1], 6), 'ausd')
await send('approve ctk to pair', { address: CTK, abi: erc, functionName: 'approve', args: [PAIR, inCtk] })
await send('swap ctk -> ausd', { address: PAIR, abi: pair, functionName: 'swapExactTokensForTokens', args: [inCtk, q[1], [CTK, AUSD], account.address, deadline()] })
await send('approve ausd to perpl', { address: AUSD, abi: erc, functionName: 'approve', args: [PERPL, q[1]] })
await send('deposit into perpl', { address: PERPL, abi: perpl, functionName: 'depositCollateral', args: [q[1]] })
const after = await acct()
console.log(`fund path ${Date.now() - t0}ms sequential, perpl balance ${formatUnits(before, 6)} -> ${formatUnits(after, 6)} (+${formatUnits(after - before, 6)})`)
