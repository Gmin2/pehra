// g34: copy trading end to end. a fresh account (the copier) is funded from the faucet, opens its perpl
// account and turns its guard on, then arms a copy of the dev account. the dev account opens a long: the
// copier should open the same side within seconds, with its stop. the dev closes: the copy closes too
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { publicClient, setupPerplAccount, ruleMessage, SIGN_TTL_MS, type SignedAction, type Rule } from '../packages/perpl/src/index'
import { connect, openLong, closeAll, sleep } from './g-lib'
import { me as dev, api } from './g29-lib'
import { writeFileSync, mkdirSync } from 'node:fs'
const key = generatePrivateKey()
const c = privateKeyToAccount(key)
mkdirSync('../tmp/claude/copy', { recursive: true })
writeFileSync('../tmp/claude/copy/copier.key', key)
console.log('copier', c.address)
const post = async (path: string, body: unknown, token?: string) => { const r = await fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() as Record<string, unknown> } }
const sign = async (a: SignedAction) => { const nonce = crypto.randomUUID(), exp = Date.now() + SIGN_TTL_MS; return { nonce, exp, sig: await c.signMessage({ message: ruleMessage(c.address, a, nonce, exp) }) } }
const drip = await post('/drip', { address: c.address })
console.log('drip', drip.status, JSON.stringify(drip.j).slice(0, 80))
const pub = publicClient('testnet')
const setup = await setupPerplAccount(pub, c, { depositCns: 100_000_000n, fundedAt: drip.j.block ? BigInt(drip.j.block as number) : undefined })
console.log('perpl account', setup.info?.accountId?.toString())
await sleep(4000)
const start = await post('/guard/start', { address: c.address })
const td = start.j.typed_data as { types: Record<string, unknown>; domain: Record<string, unknown> & { chainId: string }; primaryType: string; message: Record<string, unknown> }
const { EIP712Domain: _d, ...types } = td.types
const signature = await c.signTypedData({ domain: { ...td.domain, chainId: BigInt(td.domain.chainId) } as never, types: types as never, primaryType: td.primaryType as never, message: td.message as never })
const fin = await post('/guard/finish', { address: c.address, signature })
console.log('guard', fin.status, JSON.stringify(fin.j).slice(0, 80))
await sleep(5000)
const rule: Rule = { v: 1, id: `copy-${Date.now().toString(36)}`, pid: 0, mkt: 64, forMs: 0, kind: 'copy', target: dev.address.toLowerCase(), margin: 10, maxLeverage: 3, limitPct: 1, closeWithThem: true, stopPct: 5 }
console.log('copy yourself  ', (await post(`/rules/${dev.address}`, { rule: { ...rule, id: rule.id + 's' } })).status)
const armed = await post(`/rules/${c.address}`, { rule, ...(await sign({ action: 'create', rule, symbol: 'MON' })) })
console.log('arm copy', armed.status, JSON.stringify(armed.j).slice(0, 100))
const health = async () => ((await (await fetch(`${api}/guard/${c.address}`)).json()) as { health: { pid: number; side: string; size: number; entry: number }[] }).health
await sleep(8000)
const ts = await connect()
const t0 = Date.now()
await openLong(ts, 300, 200)
console.log('dev opened a long')
let copied = null
while (Date.now() - t0 < 360_000) { const h = await health(); if (h.length) { copied = h[0]; break } await sleep(1000) }
console.log('copy opened', copied ? `${copied.side} ${copied.size} at ${copied.entry} after ${((Date.now() - t0) / 1000).toFixed(1)}s` : 'nothing after 360s')
await sleep(6000)
const rs = ((await (await fetch(`${api}/rules/${c.address}`)).json()) as { rules: { id: string; kind: string; state: string }[] }).rules
console.log('copier rules', rs.map(r => `${r.kind} ${r.state}`).join(' | '))
const t1 = Date.now()
await closeAll(ts)
console.log('dev closed')
let gone = false
while (Date.now() - t1 < 360_000) { if (!(await health()).length) { gone = true; break } await sleep(1000) }
console.log('copy closed', gone ? `after ${((Date.now() - t1) / 1000).toFixed(1)}s` : 'still open after 360s')
ts.close()
