// the escape hatch: one fingerprint closes every position straight on perpl's exchange with the account's
// own key. pehra's server is asked to pause first, but nothing here waits on it, so it works with the server
// down. forwarding off also pauses every trigger perpl holds and refuses the guard's key until turned back on
import { getContext, getPerplAccount, publicClient, sendBatch, openPositions, closeAllCalls, type Open } from '@pehra/perpl'
import type { Session } from './account'
import { ensureGas } from './fund'
import { log } from './log'
import { pauseRules } from './rules'

export type EscapeState = 'idle' | 'pausing' | 'closing' | 'confirmed' | 'partial' | 'failed'
export type EscapeResult = { state: EscapeState; closed: number; left: Open[]; tx?: `0x${string}`; ms: number; error?: string }

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>(r => setTimeout(() => r(undefined), ms))])

export async function escape(s: Session, o: { forwardingOff: boolean }, onState: (st: EscapeState) => void = () => {}): Promise<EscapeResult> {
  const t0 = Date.now()
  const pub = publicClient('testnet')
  onState('pausing')
  // best effort and signed, the server may be the thing being escaped
  await within(pauseRules(s).catch(() => undefined), 2500)
  try {
    const [acct, ctx, mon] = await Promise.all([getPerplAccount(pub, s.address), getContext('testnet'), pub.getBalance({ address: s.address })])
    if (!acct) return { state: 'failed', closed: 0, left: [], ms: Date.now() - t0, error: 'no perpl account for this address' }
    const open = await openPositions(pub, acct.accountId, ctx.markets.filter(m => m.config.is_open).map(m => m.id))
    if (!open.length && !o.forwardingOff) return { state: 'confirmed', closed: 0, left: [], ms: Date.now() - t0 }
    onState('closing')
    const fundedAt = await within(ensureGas(s.address, Number(mon) / 1e18).catch(() => undefined), 4000)
    const sent = await sendBatch(pub, s.account, closeAllCalls(open, { forwardingOff: o.forwardingOff }), { fundedAt })
    const tx = sent[sent.length - 1]?.hash
    // what the chain holds now is the answer, never what we hoped
    const left = await openPositions(pub, acct.accountId, open.map(p => p.perpId))
    const state: EscapeState = left.length ? 'partial' : 'confirmed'
    log(`escape ${state}: ${open.length - left.length} of ${open.length} closed in ${Date.now() - t0}ms ${tx ?? ''}`)
    return { state, closed: open.length - left.length, left, tx, ms: Date.now() - t0 }
  } catch (e) {
    log(`escape failed: ${e instanceof Error ? e.message : e}`)
    return { state: 'failed', closed: 0, left: [], ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) }
  }
}
