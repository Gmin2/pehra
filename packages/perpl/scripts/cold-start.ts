// the whole t6 from a throwaway key, timed step by step. this is the latency harness: run it after every
// change to the trade path. needs the drip server on :8787.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { enrollApiKey, feeCaps, getContext, marketBySymbol, publicClient, setupPerplAccount, TradingSocket, toLeverage, fromPrice, fromSize, fromCns, Reason } from '../src'

const API = process.env.API ?? 'http://localhost:8787'
const account = privateKeyToAccount(generatePrivateKey())
let t0 = Date.now()
const marks: [string, number][] = []
const mark = (label: string) => { marks.push([label, Date.now() - t0]); console.log(`+${Date.now() - t0}ms ${label}`) }

const pub = publicClient('testnet')
// the app warms these connections at launch, so the clock starts after the handshakes
await Promise.all([feeCaps(pub), fetch(`${API}/health`)])
const ctxP = getContext('testnet')
t0 = Date.now()

const r = await fetch(`${API}/drip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account.address }) })
const drip = await r.json() as { mon?: string; ausd?: string; block?: string; error?: string }
if (!r.ok) throw new Error(`drip: ${drip.error}`)
mark(`funded ${drip.mon} MON ${drip.ausd} AUSD`)

// enrollment answers 404 until the perpl account exists on chain, so it waits for the setup block
const setup = await setupPerplAccount(pub, account, { depositCns: 100_000_000n, fundedAt: drip.block ? BigInt(drip.block) : undefined })
mark(`perpl account ${setup.info.accountId}, ${setup.report.length} txs in block ${setup.report[0].block}`)
const key = await enrollApiKey({ address: account.address, signTypedData: td => account.signTypedData(td) }, { label: 'cold start' })
mark('api key enrolled')

const ts = new TradingSocket({ net: 'testnet', apiKey: key.apiKey, secret: key.secret })
await ts.connect()
mark(`signed in, account ${ts.account?.id}, fw ${ts.account?.fw}`)

const mon = marketBySymbol(await ctxP, 'MON')
const res = await ts.openMarket({ mkt: mon.id, side: 'long', size: 100, leverage: toLeverage(5) })
if (!res.order) throw new Error('order rejected ' + JSON.stringify(res.status))
mark(`${res.order.st === 4 ? 'FILLED' : 'status ' + res.order.st} ${Reason[res.order.sr] ?? res.order.sr} ${fromSize(mon, res.order.fs ?? 0)} MON at ${fromPrice(mon, res.order.fp ?? 0)}`)

await new Promise(r => setTimeout(r, 800))
const pos = [...ts.positions.values()].find(p => p.mkt === mon.id)
if (pos) {
  const c = await ts.closeMarket(pos)
  mark(`closed ${c.order?.st === 4 ? 'filled' : 'status ' + c.order?.st} at ${fromPrice(mon, c.order?.fp ?? 0)}, balance ${fromCns(ts.account?.b ?? '0')}`)
}
ts.close()
console.log('\nstep timings')
let prev = 0
for (const [l, t] of marks) { console.log(`${String(t - prev).padStart(6)}ms  ${l}`); prev = t }
console.log(`${String(marks[marks.length - 2]?.[1] ?? 0).padStart(6)}ms  tap to fill (drip to fill)`)
process.exit(0)
