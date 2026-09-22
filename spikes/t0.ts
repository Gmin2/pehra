import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('../services/api/.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const account = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [env.MONAD_RPC] } } } as const
const pub = createPublicClient({ chain, transport: http() })
const wallet = createWalletClient({ account, chain, transport: http() })
const AUSD = '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC', FAUCET = '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C'
const erc = parseAbi(['function balanceOf(address) view returns (uint256)'])
const faucet = parseAbi(['function requestFunds(address)'])

const mon = await pub.getBalance({ address: account.address })
let ausd = await pub.readContract({ address: AUSD, abi: erc, functionName: 'balanceOf', args: [account.address] })
console.log('address', account.address)
console.log('MON', formatEther(mon), 'AUSD', formatUnits(ausd, 6))
if (mon === 0n) { console.log('no MON yet, stop'); process.exit(1) }
if (ausd === 0n) {
  const gas = await pub.estimateContractGas({ address: FAUCET, abi: faucet, functionName: 'requestFunds', args: [account.address], account })
  console.log('faucet estimateGas', gas.toString())
  const hash = await wallet.writeContract({ address: FAUCET, abi: faucet, functionName: 'requestFunds', args: [account.address], gas: gas + gas / 13n })
  console.log('faucet tx', hash)
  const r = await pub.waitForTransactionReceipt({ hash })
  console.log('status', r.status, 'block', r.blockNumber.toString(), 'gasUsed', r.gasUsed.toString())
  ausd = await pub.readContract({ address: AUSD, abi: erc, functionName: 'balanceOf', args: [account.address] })
  console.log('AUSD after faucet', formatUnits(ausd, 6))
  const mon2 = await pub.getBalance({ address: account.address })
  console.log('MON spent', formatEther(mon - mon2))
}
