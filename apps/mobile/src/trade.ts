import * as SecureStore from 'expo-secure-store'
import { enrollApiKey, feeCaps, getContext, marketBySymbol, publicClient, setupPerplAccount, TradingSocket, toLeverage, fromPrice, fromSize, fromCns, Reason, type Enrolled } from '@pehra/perpl'
import type { Session } from './account'

// the dev machine over adb reverse, or a lan ip. the drip server pays for testnet gas and AUSD.
export const API = 'http://localhost:8787'

const keyFor = (address: string) => `pehra.perplkey.${address.toLowerCase()}`

export async function loadApiKey(address: string): Promise<Enrolled | null> {
  const raw = await SecureStore.getItemAsync(keyFor(address))
  return raw ? (JSON.parse(raw) as Enrolled) : null
}

export type Step = (label: string) => void

type DripResponse = { mon?: string; ausd?: string; block?: string; error?: string }

// the whole t6: fund, open the perpl account, enroll a key, place one market order. every step logs its time.
// enrollment answers 404 until the account exists on chain, so it waits for the setup block.
export async function firstTrade(s: Session, say: Step) {
  const t0 = Date.now()
  const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`
  const pub = publicClient('testnet')
  const ctxP = getContext('testnet')
  void feeCaps(pub)

  const r = await fetch(`${API}/drip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: s.address }) })
  const drip = (await r.json()) as DripResponse
  if (!r.ok && drip.error !== 'cooldown') throw new Error(`drip: ${drip.error}`)
  say(`${at()} funded, ${drip.mon ?? '?'} MON ${drip.ausd ?? '?'} AUSD`)

  const setup = await setupPerplAccount(pub, s.account, { depositCns: 100_000_000n, fundedAt: drip.block ? BigInt(drip.block) : undefined })
  say(`${at()} perpl account ${setup.info.accountId}, ${setup.report.length} txs`)

  let key = await loadApiKey(s.address)
  if (key) say(`${at()} api key from storage`)
  else {
    key = await enrollApiKey({ address: s.address, signTypedData: td => s.account.signTypedData(td) }, { label: 'pehra phone' })
    await SecureStore.setItemAsync(keyFor(s.address), JSON.stringify(key))
    say(`${at()} api key enrolled`)
  }

  const ts = new TradingSocket({ net: 'testnet', apiKey: key.apiKey, secret: key.secret })
  await ts.connect()
  say(`${at()} signed in, account ${ts.account?.id}`)

  const mon = marketBySymbol(await ctxP, 'MON')
  const res = await ts.openMarket({ mkt: mon.id, side: 'long', size: 100, leverage: toLeverage(5) })
  const o = res.order
  if (!o) throw new Error('order rejected ' + JSON.stringify(res.status))
  say(`${at()} ${o.st === 4 ? 'FILLED' : 'status ' + o.st} ${Reason[o.sr] ?? o.sr} ${fromSize(mon, o.fs ?? 0)} MON at ${fromPrice(mon, o.fp ?? 0)}`)
  const filledAt = Date.now() - t0
  await new Promise(r => setTimeout(r, 1000))
  const pos = [...ts.positions.values()].find(p => p.mkt === mon.id)
  if (pos) say(`${at()} position ${pos.pid} entry ${fromPrice(mon, pos.ep)} collateral ${fromCns(pos.c)}`)
  ts.close()
  return { ms: filledAt, order: o, pos }
}

export async function closeAll(s: Session, say: Step) {
  const key = await loadApiKey(s.address)
  if (!key) throw new Error('no api key')
  const ctx = await getContext('testnet')
  const ts = new TradingSocket({ net: 'testnet', apiKey: key.apiKey, secret: key.secret })
  await ts.connect()
  for (const pos of ts.positions.values()) {
    const m = ctx.markets.find(m => m.id === pos.mkt)
    if (!m) continue
    const r = await ts.closeMarket(pos)
    say(`closed ${m.symbol} ${r.order?.st === 4 ? 'filled' : 'status ' + r.order?.st} at ${fromPrice(m, r.order?.fp ?? 0)}`)
  }
  await new Promise(r => setTimeout(r, 1000))
  say(`balance ${fromCns(ts.account?.b ?? '0')} AUSD, ${ts.positions.size} open`)
  ts.close()
}
