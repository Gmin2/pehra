import { enrollApiKey, feeCaps, getContext, getPerplAccount, marketBySymbol, publicClient, setupPerplAccount, toLeverage, fromPrice, fromSize, fromCns, Reason } from '@pehra/perpl'
import { parseEther } from 'viem'
import { tradingSocket } from './warm'
import { loadApiKey, saveApiKey } from './keys'
import { timings } from './account'
export { loadApiKey } from './keys'
import type { Session } from './account'

// the dev machine over adb reverse, or a lan ip. the drip server pays for testnet gas and AUSD.
// a release build sets EXPO_PUBLIC_API to the hosted server
export const API = process.env.EXPO_PUBLIC_API ?? 'http://localhost:8787'

export type Step = (label: string) => void

type DripResponse = { mon?: string; ausd?: string; block?: string; error?: string }

// onboarding: fund the address and open the perpl account, nothing else. the guard delegation comes after.
export async function prepareAccount(s: Session, say: Step) {
  const pub = publicClient('testnet')
  void feeCaps(pub)
  const [existing, gas] = await Promise.all([getPerplAccount(pub, s.address), pub.getBalance({ address: s.address })])
  if (existing) { say('account ready'); return existing }
  let drip: DripResponse = {}
  if (gas < parseEther('0.01')) {
    say('funding your account')
    const r = await fetch(`${API}/drip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: s.address }) })
    drip = (await r.json()) as DripResponse
    if (!r.ok && drip.error !== 'cooldown') throw new Error(`drip: ${drip.error}`)
  }
  say('opening your perpl account')
  const setup = await setupPerplAccount(pub, s.account, { depositCns: 100_000_000n, fundedAt: drip.block ? BigInt(drip.block) : undefined })
  return setup.info
}

// the whole t6: fund, open the perpl account, enroll a key, place one market order. every step logs its time.
// enrollment answers 404 until the account exists on chain, so it waits for the setup block.
export async function firstTrade(s: Session, say: Step) {
  const t0 = Date.now()
  const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`
  const pub = publicClient('testnet')
  const ctxP = getContext('testnet')
  if (timings.derive !== undefined) say(`${at()} key derivation ${timings.derive}ms, of which seed ${timings.seed}ms`)

  // a returning account has a stored key and, after warm up, an open trading socket. nothing else to do.
  let key = await loadApiKey(s.address)
  if (!key) {
    const [existing, gas] = await Promise.all([getPerplAccount(pub, s.address), pub.getBalance({ address: s.address })])
    let drip: DripResponse = {}
    if (!existing || gas < parseEther('0.01')) {
      const r = await fetch(`${API}/drip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: s.address }) })
      drip = (await r.json()) as DripResponse
      if (!r.ok && drip.error !== 'cooldown') throw new Error(`drip: ${drip.error}`)
      say(`${at()} funded, ${drip.mon ?? '?'} MON ${drip.ausd ?? '?'} AUSD`)
    }
    const setup = existing ? { info: existing, report: [] } : await setupPerplAccount(pub, s.account, { depositCns: 100_000_000n, fundedAt: drip.block ? BigInt(drip.block) : undefined })
    say(`${at()} perpl account ${setup.info.accountId}, ${setup.report.length} txs`)
    key = await enrollApiKey({ address: s.address, signTypedData: td => s.account.signTypedData(td) }, { label: 'pehra phone' })
    await saveApiKey(s.address, key)
    say(`${at()} api key enrolled`)
  }

  const ts = await tradingSocket(key)
  say(`${at()} socket ready, account ${ts.account?.id}`)

  const mon = marketBySymbol(await ctxP, 'MON')
  const res = await ts.openMarket({ mkt: mon.id, side: 'long', size: 100, leverage: toLeverage(5) })
  const o = res.order
  if (!o) throw new Error('order rejected ' + JSON.stringify(res.status))
  say(`${at()} ${o.st === 4 ? 'FILLED' : 'status ' + o.st} ${Reason[o.sr] ?? o.sr} ${fromSize(mon, o.fs ?? 0)} MON at ${fromPrice(mon, o.fp ?? 0)}`)
  const filledAt = Date.now() - t0
  await new Promise(r => setTimeout(r, 1000))
  const pos = [...ts.positions.values()].find(p => p.mkt === mon.id)
  if (pos) say(`${at()} position ${pos.pid} entry ${fromPrice(mon, pos.ep)} collateral ${fromCns(pos.c)}`)
  return { ms: filledAt, order: o, pos }
}

export async function closeAll(s: Session, say: Step) {
  const key = await loadApiKey(s.address)
  if (!key) throw new Error('no api key')
  const ctx = await getContext('testnet')
  const ts = await tradingSocket(key)
  for (const pos of ts.positions.values()) {
    const m = ctx.markets.find(m => m.id === pos.mkt)
    if (!m) continue
    const r = await ts.closeMarket(pos)
    say(`closed ${m.symbol} ${r.order?.st === 4 ? 'filled' : 'status ' + r.order?.st} at ${fromPrice(m, r.order?.fp ?? 0)}`)
  }
  await new Promise(r => setTimeout(r, 1000))
  say(`balance ${fromCns(ts.account?.b ?? '0')} AUSD, ${ts.positions.size} open`)
}
