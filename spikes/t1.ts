import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, formatEther, decodeAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('../services/api/.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const account = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [env.MONAD_RPC] } } } as const
const pub = createPublicClient({ chain, transport: http() })
const wallet = createWalletClient({ account, chain, transport: http() })
const AUSD = '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC', PERPL = '0x1964c32f0be608e7d29302aff5e61268e72080cc'
const erc = parseAbi(['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'])
const perpl = parseAbi(['function createAccount(uint256 amountCNS) returns (uint256)', 'function allowOrderForwarding(bool allow)', 'function getMinAccountOpenCNS() view returns (uint256)'])

async function send(label: string, args: any) {
  const gas = await pub.estimateContractGas({ ...args, account })
  const limit = gas + gas * 75n / 1000n
  const hash = await wallet.writeContract({ ...args, gas: limit })
  const r = await pub.waitForTransactionReceipt({ hash })
  console.log(`${label}: ${r.status} block ${r.blockNumber} gas est ${gas} limit ${limit} charged ${r.gasUsed} ${hash}`)
  if (r.status !== 'success') process.exit(1)
  return r
}

const before = await pub.getBalance({ address: account.address })
const minOpen = await pub.readContract({ address: PERPL, abi: perpl, functionName: 'getMinAccountOpenCNS' })
console.log('min open', formatUnits(minOpen, 6), 'AUSD')

const acctBefore = await pub.call({ to: PERPL, data: '0x' + '1a7c3e2a'.padEnd(8, '0') as any }).catch(() => null) // placeholder, replaced below
const sel = (await import('viem')).toFunctionSelector('function getAccountByAddr(address)')
const readAcct = () => pub.call({ to: PERPL, data: (sel + account.address.slice(2).padStart(64, '0')) as `0x${string}` }).then(r => r.data).catch(e => 'reverted ' + (e.shortMessage ?? '').slice(0, 60))
console.log('account before:', await readAcct())

const allowance = await pub.readContract({ address: AUSD, abi: erc, functionName: 'allowance', args: [account.address, PERPL] })
if (allowance < 200_000_000n) await send('approve', { address: AUSD, abi: erc, functionName: 'approve', args: [PERPL, 1_000_000_000n] })
else console.log('approve: already', formatUnits(allowance, 6))

await send('createAccount(200 AUSD)', { address: PERPL, abi: perpl, functionName: 'createAccount', args: [200_000_000n] })
await send('allowOrderForwarding(true)', { address: PERPL, abi: perpl, functionName: 'allowOrderForwarding', args: [true] })

const raw = await readAcct()
console.log('account after raw:', raw)
if (typeof raw === 'string' && raw.startsWith('0x') && raw.length > 10) {
  try {
    const [info] = decodeAbiParameters([{ type: 'tuple', components: [{ type: 'uint256', name: 'accountId' }, { type: 'uint256', name: 'balanceCNS' }, { type: 'uint256', name: 'lockedBalanceCNS' }, { type: 'bool', name: 'frozen' }, { type: 'address', name: 'accountAddr' }, { type: 'uint256[4]', name: 'positions' }] }], raw as `0x${string}`)
    console.log('decoded:', { accountId: info.accountId.toString(), balance: formatUnits(info.balanceCNS, 6), locked: formatUnits(info.lockedBalanceCNS, 6), frozen: info.frozen, addr: info.accountAddr })
  } catch (e: any) { console.log('decode failed, words:', (raw.length - 2) / 64, e.shortMessage ?? e.message) }
}
console.log('AUSD wallet balance', formatUnits(await pub.readContract({ address: AUSD, abi: erc, functionName: 'balanceOf', args: [account.address] }), 6))
console.log('MON spent on t1', formatEther(before - await pub.getBalance({ address: account.address })))
