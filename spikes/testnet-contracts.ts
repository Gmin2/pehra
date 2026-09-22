import { createPublicClient, http, parseAbi, keccak256, toHex, encodeAbiParameters, toFunctionSelector, hexToBigInt, formatUnits } from 'viem'
const rpc = 'https://testnet-rpc.monad.xyz'
const c = createPublicClient({ transport: http(rpc) })
const A = {
  ausd: '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC', faucet: '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C',
  pair: '0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae', ctk: '0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D',
  whitelister: '0x7c10F56d6f04a51376393a1C3670e966863F6BD5', factory: '0x8468587Af422ad440F58a57E955eCA6A970b5375',
  perpl: '0x1964c32f0be608e7d29302aff5e61268e72080cc', kernel33: '0xd6CEDDe84be40893d153Be9d467CD6aD37875b28',
  simple7702: '0xe6Cae83BdE06E4c305530e199D7217f42808555B', p256: '0x0000000000000000000000000000000000000100',
  random: '0x1111111111111111111111111111111111111111',
} as const
const out: Record<string, unknown> = {}
const has = (code: `0x${string}`, sig: string) => code.includes(toFunctionSelector(sig).slice(2))

const erc = parseAbi(['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function version() view returns (string)', 'function DOMAIN_SEPARATOR() view returns (bytes32)', 'function balanceOf(address) view returns (uint256)', 'function totalSupply() view returns (uint256)'])
const [name, symbol, decimals, version, ds, supply] = await Promise.all([
  c.readContract({ address: A.ausd, abi: erc, functionName: 'name' }), c.readContract({ address: A.ausd, abi: erc, functionName: 'symbol' }),
  c.readContract({ address: A.ausd, abi: erc, functionName: 'decimals' }), c.readContract({ address: A.ausd, abi: erc, functionName: 'version' }).catch(e => 'ERR ' + e.shortMessage),
  c.readContract({ address: A.ausd, abi: erc, functionName: 'DOMAIN_SEPARATOR' }).catch(e => 'ERR ' + e.shortMessage), c.readContract({ address: A.ausd, abi: erc, functionName: 'totalSupply' }),
])
const ausdCode = await c.getCode({ address: A.ausd }) ?? '0x'
const computedDs = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
  [keccak256(toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')), keccak256(toHex(String(name))), keccak256(toHex(String(version))), 10143n, A.ausd]))
out.ausd = { name, symbol, decimals, version, supply: formatUnits(supply, 6), DOMAIN_SEPARATOR: ds, computedFromNameVersion: computedDs, domainMatches: ds === computedDs, codeBytes: (ausdCode.length - 2) / 2,
  selectors: { transferWithAuthorization: has(ausdCode, 'function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)'), receiveWithAuthorization: has(ausdCode, 'function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)'), permit: has(ausdCode, 'function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)') },
  note: 'proxy: selectors may live in the implementation, absence here is not proof' }

const faucetCode = await c.getCode({ address: A.faucet }) ?? '0x'
out.faucet = { codeBytes: (faucetCode.length - 2) / 2, hasRequestFunds: has(faucetCode, 'function requestFunds(address)') }

const pairAbi = parseAbi(['function token0() view returns (address)', 'function token1() view returns (address)', 'function getPriceNormalized() view returns (uint256)', 'function reserve0() view returns (uint256)', 'function reserve1() view returns (uint256)', 'function hasRole(bytes32,address) view returns (bool)', 'function isPaused() view returns (bool)', 'function getAmountsOut(uint256,address[]) view returns (uint256[])'])
const role = keccak256(toHex('APPROVED_SWAPPER'))
const [t0, t1, price, r0, r1, randApproved, paused] = await Promise.all([
  c.readContract({ address: A.pair, abi: pairAbi, functionName: 'token0' }), c.readContract({ address: A.pair, abi: pairAbi, functionName: 'token1' }),
  c.readContract({ address: A.pair, abi: pairAbi, functionName: 'getPriceNormalized' }).catch(e => 'ERR ' + e.shortMessage),
  c.readContract({ address: A.pair, abi: pairAbi, functionName: 'reserve0' }).catch(e => 'ERR ' + e.shortMessage), c.readContract({ address: A.pair, abi: pairAbi, functionName: 'reserve1' }).catch(e => 'ERR ' + e.shortMessage),
  c.readContract({ address: A.pair, abi: pairAbi, functionName: 'hasRole', args: [role, A.random] }).catch(e => 'ERR ' + e.shortMessage), c.readContract({ address: A.pair, abi: pairAbi, functionName: 'isPaused' }).catch(e => 'ERR ' + e.shortMessage),
])
const quote = await c.readContract({ address: A.pair, abi: pairAbi, functionName: 'getAmountsOut', args: [1_000_000n, [A.ausd, A.ctk]] }).catch(e => 'ERR ' + e.shortMessage)
const wlCode = await c.getCode({ address: A.whitelister }) ?? '0x'
out.pair = { token0: t0, token1: t1, token0IsCtk: t0.toLowerCase() === A.ctk.toLowerCase(), priceNormalized: String(price), reserve0_ctk: typeof r0 === 'bigint' ? formatUnits(r0, 18) : r0, reserve1_ausd: typeof r1 === 'bigint' ? formatUnits(r1, 6) : r1, randomIsApprovedSwapper: randApproved, paused, quote_1ausd_to_ctk: Array.isArray(quote) ? quote.map(q => q.toString()) : quote,
  whitelister: { codeBytes: (wlCode.length - 2) / 2, hasSetApprovedSwapper: has(wlCode, 'function setApprovedSwapper(address)'), hasSetApprovedSwappers: has(wlCode, 'function setApprovedSwappers(address[],bool)') } }

const perplCode = await c.getCode({ address: A.perpl }) ?? '0x'
const perplAbi = parseAbi(['function getAccountByAddr(address) view returns (uint256,uint256,uint256,bool,address,uint256[4])', 'function getMinAccountOpenCNS() view returns (uint256)', 'function numberOfAccounts() view returns (uint256)'])
const acct = await c.readContract({ address: A.perpl, abi: perplAbi, functionName: 'getAccountByAddr', args: [A.random] }).then(r => 'unexpected success ' + String(r)).catch(e => 'reverted: ' + (e.shortMessage ?? e.message).slice(0, 120))
const minOpen = await c.readContract({ address: A.perpl, abi: perplAbi, functionName: 'getMinAccountOpenCNS' }).catch(e => 'ERR ' + e.shortMessage)
const nAcc = await c.readContract({ address: A.perpl, abi: perplAbi, functionName: 'numberOfAccounts' }).catch(e => 'ERR ' + e.shortMessage)
out.perpl = { codeBytes: (perplCode.length - 2) / 2, isProxy: (perplCode.length - 2) / 2 < 2000, minAccountOpenCNS: String(minOpen), numberOfAccounts: String(nAcc), getAccountByAddr_random: acct,
  selectorsInCode: { createAccount: has(perplCode, 'function createAccount(uint256)'), depositCollateral: has(perplCode, 'function depositCollateral(uint256)'), withdrawCollateral: has(perplCode, 'function withdrawCollateral(uint256)'), allowOrderForwarding: has(perplCode, 'function allowOrderForwarding(bool)') } }

// rip-7212 test vector
const vec = '0xbb5a52f42f9c9261ed4361f59422a1e30036e7c32b270c8807a419feca6050232ba3a8be6b9d3d30bcd5bfed6dc88c0ac2d3d5f8fc4a02d5a0dc6bc9bb02a11d3e5fd25a1f0f4b6d90d19d07a1ecc52a9a0b6d2a9a2ea1ab5e0f9fbb2df5e0cf3f8b7b1d5b0b4cb87e9db6b19c4b57a0ffb1e3a2e0e2af61c3f6b1a3b4d17d3e6e0e1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8'
// use the canonical vector from RIP-7212 spec instead
const rip = '0x4cee90eb86eaa050036147a12d49004b6b9c72bd725d39d4785011fe190f0b4da73bd4903f0ce3b639bbbf6e8e80d16931ff4bcf5993d58468e8fb19086e8cac36dbcd03009df8c59286b162af3bd7fcc0450c9aa81be5d10d312af6c66b1d604aebd3099c618202fcfe16ae7770b0c49ab5eadf74b754204a3bb6060e44eff37618b065f9832de4ca6ca971a7a1adc826d0f7c00181a5fb2ddf79ae00b4e10e'
const p256 = await c.call({ to: A.p256, data: rip as `0x${string}` }).then(r => r.data ?? '0x (empty)').catch(e => 'ERR ' + e.shortMessage)
out.p256_precompile = { result: p256, expected: '0x...0001 = valid signature' }

const [k33, s77, gas, prio, blk] = await Promise.all([c.getCode({ address: A.kernel33 }), c.getCode({ address: A.simple7702 }), c.getGasPrice(), c.request({ method: 'eth_maxPriorityFeePerGas' } as any), c.getBlock()])
out.delegates = { kernel33Bytes: ((k33?.length ?? 2) - 2) / 2, simple7702Bytes: ((s77?.length ?? 2) - 2) / 2 }
out.gas = { gasPriceWei: gas.toString(), gasPriceGwei: Number(gas) / 1e9, maxPriorityFeePerGas: hexToBigInt(prio as `0x${string}`).toString(), baseFeeGwei: Number(blk.baseFeePerGas ?? 0n) / 1e9, blockGasLimit: blk.gasLimit.toString(), block: blk.number.toString(), ts: blk.timestamp.toString() }
console.log(JSON.stringify(out, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))
