import { createPublicClient, http, keccak256, toHex, encodeAbiParameters, toFunctionSelector, getAddress, parseAbi, hexToBigInt } from 'viem'
const c = createPublicClient({ transport: http('https://testnet-rpc.monad.xyz') })
const A = { ausd: '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC', faucet: '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C', whitelister: '0x7c10F56d6f04a51376393a1C3670e966863F6BD5', perpl: '0x1964c32f0be608e7d29302aff5e61268e72080cc', pair: '0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae' } as const
const IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const
const BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' as const
const has = (code: string, sig: string) => code.includes(toFunctionSelector(sig).slice(2))
const ds = '0x7ff7d6b4bdc3e260c85cf89f8779b1ac80120e3c277f7db4900739a507f03ea1'
const dom = (name: string, version: string) => keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
  [keccak256(toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')), keccak256(toHex(name)), keccak256(toHex(version)), 10143n, A.ausd]))
const out: any = { ausdDomain: { 'Agora Dollar/1': dom('Agora Dollar', '1') === ds, 'AUSD/1': dom('AUSD', '1') === ds, 'Agora Dollar/2': dom('Agora Dollar', '2') === ds } }
for (const [k, addr] of Object.entries(A)) {
  const implRaw = await c.getStorageAt({ address: addr, slot: IMPL })
  const beaconRaw = await c.getStorageAt({ address: addr, slot: BEACON })
  let impl = implRaw && hexToBigInt(implRaw) ? getAddress('0x' + implRaw.slice(26)) : null
  let beacon = beaconRaw && hexToBigInt(beaconRaw) ? getAddress('0x' + beaconRaw.slice(26)) : null
  if (!impl && beacon) {
    impl = await c.readContract({ address: beacon, abi: parseAbi(['function implementation() view returns (address)']), functionName: 'implementation' }).catch(() => null)
  }
  const code = impl ? (await c.getCode({ address: impl })) ?? '0x' : '0x'
  out[k] = { impl, beacon, implBytes: (code.length - 2) / 2,
    selectors: { requestFunds: has(code, 'function requestFunds(address)'), setApprovedSwapper: has(code, 'function setApprovedSwapper(address)'), setApprovedSwappers: has(code, 'function setApprovedSwappers(address[],bool)'),
      permit: has(code, 'function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)'), transferWithAuthorization: has(code, 'function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)'),
      createAccount: has(code, 'function createAccount(uint256)'), depositCollateral: has(code, 'function depositCollateral(uint256)'), withdrawCollateral: has(code, 'function withdrawCollateral(uint256)'), allowOrderForwarding: has(code, 'function allowOrderForwarding(bool)'), getAccountByAddr: has(code, 'function getAccountByAddr(address)') } }
}
// perpl: is 0x03a0e277 AccountDoesNotExist ?
out.perplRevertSelector = { '0x03a0e277': ['AccountDoesNotExist()', 'AccountNotFound()', 'NoAccount()'].map(s => [s, toFunctionSelector('function ' + s) === '0x03a0e277']) }
// diamond check: perpl proxy 225 bytes could be a diamond or a minimal proxy; dump its code
out.perplProxyCode = await c.getCode({ address: A.perpl })
console.log(JSON.stringify(out, null, 2))
