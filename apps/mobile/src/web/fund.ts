// the money moves on the web try page: real balances read from monad, the moves themselves played out on
// the visitor's copy of the account
export * from '../fund'
import { walletBalances as read, type Asset } from '../fund'
import type { Session } from '../account'
import { sim } from './sim'

export const walletBalances = async (address: `0x${string}`) => sim.wallet(await read(address))
export const fundFromUsdc = (_s: Session, usdc: number, _at?: bigint) => sim.fund(usdc)
export const depositAusd = (_s: Session, ausd: number, _at?: bigint) => sim.deposit(ausd)
export const withdrawToUsdc = (_s: Session, ausd: number, _at?: bigint) => sim.withdraw(ausd)
export const sendOut = (_s: Session, asset: Asset, _to: `0x${string}`, amount: number) => sim.send(asset, amount)
export const ensureGas = async (_address: `0x${string}`, _mon: number): Promise<bigint | undefined> => undefined
export const waitFinal = (_block: number) => new Promise<void>((r) => setTimeout(r, 900))
