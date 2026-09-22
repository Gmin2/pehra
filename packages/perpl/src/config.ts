export type Network = 'testnet' | 'mainnet'

export const NETWORKS = {
  testnet: {
    chainId: 10143,
    rest: 'https://testnet.perpl.xyz/api',
    ws: 'wss://testnet.perpl.xyz',
    rpc: 'https://testnet-rpc.monad.xyz',
    exchange: '0x1964c32f0be608e7d29302aff5e61268e72080cc',
    ausd: '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC',
    explorer: 'https://testnet.monadscan.com',
    signInTimeoutMs: 10_000,
  },
  mainnet: {
    chainId: 143,
    rest: 'https://app.perpl.xyz/api',
    ws: 'wss://app.perpl.xyz',
    rpc: 'https://rpc.monad.xyz',
    exchange: '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F',
    ausd: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
    explorer: 'https://monadscan.com',
    signInTimeoutMs: 5_000,
  },
} as const

export type NetworkConfig = (typeof NETWORKS)[Network]

// AUSD has 6 decimals everywhere, the api calls this CNS (collateral native scale)
export const CNS = 1_000_000n
