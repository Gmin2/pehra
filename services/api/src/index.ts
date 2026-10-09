// the pehra server. for now one job: put testnet gas and AUSD into a fresh mera address so the phone
// can do the perpl setup itself. the dev key pays. later: enrollment proxy, the guard, push.
import { encodeFunctionData, formatEther, formatUnits, isAddress, parseEther, verifyMessage, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getContext, recipe, publicClient, erc20Abi, faucetAbi, AUSD_FAUCET, NETWORKS, GAS, AGORA, AGORA_GAS, whitelisterAbi, isSwapper, pairState, sendBatch, nextNonce, feeCaps, enrollPayload, enrollFinish, fromCns, fromPrice, fromSize, Reason, profile, type Activity, type Call, type EnrollPayload, type GuardSettings } from '@pehra/perpl'
import { Guard } from './guard'
import { serve } from './serve'
import { rulesRoute } from './rules'
import { replayRoute } from './replayRoute'
import { openSession, owns } from './sessions'
import { share, shared, copied } from './shares'
import { leaders } from './leaders'
import { watchRead, watch, unwatch, watchesOf, watchTick } from './watches'
import { proof } from './proof'
import { prefsOf, setPrefs, recentAlerts, KINDS } from './alerts'
import { startBeats } from './proof'
import { verify, writeRun } from './runs'
import { pushReady, registerToken, sendPush } from './push'

// one bad frame must not take every account's guard down. state lives in sqlite and reconcile runs every
// 30s, so the process logs the error and keeps watching
process.on('uncaughtException', e => console.error('uncaught', e instanceof Error ? e.stack ?? e.message : e))
process.on('unhandledRejection', e => console.error('unhandled rejection', e instanceof Error ? e.stack ?? e.message : e))

const key = process.env.DEV_PRIVATE_KEY
if (!key) throw new Error('DEV_PRIVATE_KEY missing')
const pub = publicClient('testnet')
const payer = privateKeyToAccount(key as `0x${string}`)
const AUSD = NETWORKS.testnet.ausd

const DRIP_MON = parseEther('0.07')
const DRIP_AUSD = 200_000_000n
const MIN_AUSD = 100_000_000n
const REFILL_BELOW = 2_000_000_000n
const cooldown = new Map<string, number>()
const usdcCooldown = new Map<string, number>()
// the fund screen's test money: 50 test usdc (agora's CTK), the swapper role on the pair, and enough MON
// for the fund batch. monad admits a tx only if the balance covers the gas limit times the fee cap of
// everything pending, and 0.1 MON left the fourth of four waiting on the first (23.9s on the phone)
const DRIP_USDC = 50n * 10n ** 18n
const USDC_MON = parseEther('0.3')
let refilling = false

// the agora faucet has a cooldown, so the payer keeps its own AUSD stock and tops up in the background
async function refill() {
  if (refilling) return
  refilling = true
  try {
    const bal = await pub.readContract({ address: AUSD, abi: erc20Abi, functionName: 'balanceOf', args: [payer.address] })
    if (bal < REFILL_BELOW) {
      const nonce = payerNonce ?? await nextNonce(pub, payer.address)
      payerNonce = nonce + 1
      await sendBatch(pub, payer, [{ to: AUSD_FAUCET, gas: GAS.faucet, data: encodeFunctionData({ abi: faucetAbi, functionName: 'requestFunds', args: [payer.address] }) }], { nonce })
      console.log('refilled payer from the faucet')
    }
  } catch (e) {
    payerNonce = null
    console.error('refill failed', e instanceof Error ? e.message : e)
  } finally {
    refilling = false
  }
}

// the payer's nonce is tracked here so back to back drips never race on eth_getTransactionCount
let payerNonce: number | null = null

async function drip(address: Address) {
  const [mon, ausd, nonce] = await Promise.all([
    pub.getBalance({ address }),
    pub.readContract({ address: AUSD, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    payerNonce ?? nextNonce(pub, payer.address),
  ])
  const calls: Call[] = []
  const monOut = mon < DRIP_MON ? DRIP_MON - mon : 0n
  const ausdOut = ausd < MIN_AUSD ? DRIP_AUSD : 0n
  if (monOut > 0n) calls.push({ to: address, value: monOut, gas: GAS.transfer })
  if (ausdOut > 0n) calls.push({ to: AUSD, gas: GAS.erc20Transfer, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [address, ausdOut] }) })
  payerNonce = nonce + calls.length
  try {
    const sent = await sendBatch(pub, payer, calls, { nonce })
    const block = sent.reduce((b, s) => s.receipt.blockNumber > b ? s.receipt.blockNumber : b, 0n)
    return { txs: sent.map(s => s.hash), block, mon: mon + monOut, ausd: ausd + ausdOut }
  } catch (e) {
    payerNonce = null
    throw e
  } finally {
    void refill()
  }
}

async function dripUsdc(address: Address, withUsdc = true) {
  const a = AGORA.testnet
  const [mon, usdc, swapper, nonce] = await Promise.all([
    pub.getBalance({ address }),
    pub.readContract({ address: a.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    isSwapper(pub, address),
    payerNonce ?? nextNonce(pub, payer.address),
  ])
  const calls: Call[] = []
  if (!swapper) calls.push({ to: a.whitelister, gas: AGORA_GAS.whitelist, data: encodeFunctionData({ abi: whitelisterAbi, functionName: 'setApprovedSwapper', args: [address] }) })
  if (mon < USDC_MON) calls.push({ to: address, value: USDC_MON - mon, gas: GAS.transfer })
  if (withUsdc && usdc < DRIP_USDC / 5n) calls.push({ to: a.usdc, gas: GAS.erc20Transfer, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [address, DRIP_USDC] }) })
  payerNonce = nonce + calls.length
  try {
    const sent = await sendBatch(pub, payer, calls, { nonce })
    const block = sent.reduce((b, x) => (x.receipt.blockNumber > b ? x.receipt.blockNumber : b), 0n)
    return { txs: sent.map(x => x.hash), block, whitelisted: !swapper, usdc: Number(formatUnits(usdc + (withUsdc && usdc < DRIP_USDC / 5n ? DRIP_USDC : 0n), 18)) }
  } catch (e) {
    payerNonce = null
    throw e
  }
}

// the envio indexer's graphql (indexer/), the chain's record of every perpl account
const INDEXER = process.env.INDEXER_GRAPHQL ?? 'http://localhost:8080/v1/graphql'
async function chainHistory(address: string) {
  const query = `query ($a: String!) { Account(where: { address: { _eq: $a } }) { id } }`
  const acct = await fetch(INDEXER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { a: address.toLowerCase() } }) }).then(r => r.json()) as { data?: { Account: { id: string }[] } }
  const id = acct.data?.Account[0]?.id
  if (!id) return { accountId: null, rows: [] }
  const q2 = `query ($id: numeric!) { Activity(where: { accountId: { _eq: $id } }, order_by: { block: desc }, limit: 200) { kind perpId side priceWire lotWire amountCns pnlCns leverageHdths block timestamp tx } }`
  const r = await fetch(INDEXER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q2, variables: { id } }) }).then(r => r.json()) as { data?: { Activity: unknown[] }; errors?: unknown }
  if (!r.data) throw new Error('indexer: ' + JSON.stringify(r.errors).slice(0, 200))
  return { accountId: id, rows: r.data.Activity }
}


// once an hour the chain's head hash goes onchain as calldata of a tiny self transfer from the payer. that
// timestamps the proof outside our database, rewriting history would break the match with monadscan
const ANCHOR_MS = 3600_000
async function anchor() {
  const v = verify()
  if (!v.ok) { console.error('anchor skipped, chain broken at', v.at, v.why); return }
  if (!v.rows) return
  const nonce = payerNonce ?? await nextNonce(pub, payer.address)
  payerNonce = nonce + 1
  try {
    const [s] = await sendBatch(pub, payer, [{ to: payer.address, data: `0x${v.head}`, gas: 60_000n }], { nonce })
    writeRun({ kind: 'anchor', body: { head: v.head, rows: v.rows, tx: s.hash, block: Number(s.receipt.blockNumber) } })
    console.log(`anchored ${v.rows} runs, head ${v.head.slice(0, 12)} in ${s.hash}`)
  } catch (e) {
    payerNonce = null
    console.error('anchor failed', e instanceof Error ? e.message : e)
  }
}

const guard = new Guard()
const pendingEnroll = new Map<string, EnrollPayload>()
const GATED = new Set(['/recipes', '/watch', '/unwatch', '/order', '/close', '/close-all', '/brackets', '/guard/add', '/activity', '/push/register', '/push/test'])

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const server = serve({
  hostname: '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/health') return json({ ok: true, payer: payer.address })
    if (url.pathname === '/replay' && req.method === 'POST') return replayRoute(req, {
      market: mkt => guard.marketOf(mkt),
      book: mkt => guard.recorder.books.get(mkt),
      position: (a, pid) => guard.startOf(a, pid),
    })
    // local testing only: feed the engine a funding reading, a real flip on testnet can take hours
    if (url.pathname === '/dev/funding' && req.method === 'POST' && process.env.ALLOW_DEV === '1') {
      const b = await req.json().catch(() => null) as { mkt?: number; rate?: number } | null
      if (!b || typeof b.mkt !== 'number' || typeof b.rate !== 'number') return json({ error: 'send mkt and rate' }, 400)
      guard.engine.funding([{ id: b.mkt, rate: b.rate }])
      return json({ ok: true })
    }
    if (url.pathname === '/session' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})) as { address?: string } & Record<string, unknown>
      if (!b.address || !isAddress(b.address)) return json({ error: 'bad address' }, 400)
      const r = await openSession(b.address, b as Parameters<typeof openSession>[1])
      return r.ok ? json({ token: r.token, exp: r.exp }) : json({ error: r.why }, r.status)
    }
    // writes that are not signed one by one need the account's session token. the address comes from the
    // path or the body, and has to be the token's owner
    const gated = req.method === 'POST' && (GATED.has(url.pathname) || /^\/(guard|alerts)\/0x[0-9a-fA-F]{40}$/.test(url.pathname))
    if (gated) {
      const fromPath = url.pathname.match(/0x[0-9a-fA-F]{40}$/)?.[0]
      const fromBody = fromPath ? null : ((await req.clone().json().catch(() => ({}))) as { address?: string }).address
      const address = fromPath ?? fromBody
      if (!address || !owns(req, address)) return json({ error: 'sign in again', code: 'session' }, 401)
    }
    if (url.pathname === '/leaderboard' && req.method === 'GET') {
      const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 7), 1), 30)
      try { return json({ days, leaders: await leaders(INDEXER, days) }) } catch (e) { return json({ error: e instanceof Error ? e.message : 'indexer unreachable' }, 502) }
    }
    // any address, read from the chain and the indexer. a pehra account also shows its public proof
    const wa = url.pathname.match(/^\/watch\/(0x[0-9a-fA-F]{40})$/)
    if (wa && req.method === 'GET') {
      try {
        return json(await watchRead(pub, wa[1], guard.openMarkets(), chainHistory, a => ({ onPehra: guard.has(a), receipts: guard.has(a) ? proof(a).receipts.length : 0 })))
      } catch (e) { return json({ error: e instanceof Error ? e.message : 'could not read that account' }, 502) }
    }
    if ((url.pathname === '/watch' || url.pathname === '/unwatch') && req.method === 'POST') {
      const b = await req.json().catch(() => ({})) as { address?: string; target?: string }
      if (!b.address || !b.target || !isAddress(b.target)) return json({ error: 'say which address' }, 400)
      if (url.pathname === '/watch') watch(b.address, b.target); else unwatch(b.address, b.target)
      return json({ watching: watchesOf(b.address) })
    }
    const wl = url.pathname.match(/^\/watches\/(0x[0-9a-fA-F]{40})$/)
    if (wl && req.method === 'GET') {
      if (!owns(req, wl[1])) return json({ error: 'sign in again', code: 'session' }, 401)
      return json({ watching: watchesOf(wl[1]) })
    }
    // shared recipes: a short id for a link, public to read, copies counted
    if (url.pathname === '/recipes' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})) as { address?: string; recipe?: string; symbol?: string; margin?: number; leverage?: number }
      if (!b.address || !b.recipe || !recipe(b.recipe) || !b.symbol || !(Number(b.margin) > 0) || !(Number(b.leverage) > 0)) return json({ error: 'say which recipe' }, 400)
      return json({ id: share(b.address, { recipe: b.recipe, symbol: b.symbol.slice(0, 12), margin: Math.min(Number(b.margin), 1000), leverage: Math.min(Number(b.leverage), 20) }) }, 201)
    }
    const sh = url.pathname.match(/^\/recipes\/([0-9a-f]{10})(\/copied)?$/)
    if (sh && req.method === 'GET') {
      const s = shared(sh[1])
      if (!s) return json({ error: 'no such recipe link' }, 404)
      const r = recipe(s.recipe)!
      return json({ ...s, author: `${s.author.slice(0, 6)}…${s.author.slice(-4)}`, name: r.name, blurb: r.blurb, needs: r.needs })
    }
    if (sh && sh[2] && req.method === 'POST') { copied(sh[1]); return json({ ok: true }) }
    const rules = await rulesRoute(req, url, guard)
    if (rules) return rules
    // which alerts reach the phone and when not (src/alerts.ts), and what was sent lately
    const al = url.pathname.match(/^\/alerts\/(0x[0-9a-fA-F]{40})$/)
    if (al && req.method === 'GET') {
      if (!owns(req, al[1])) return json({ error: 'sign in again', code: 'session' }, 401)
      return json({ prefs: prefsOf(al[1]), recent: recentAlerts(al[1]) })
    }
    if (al && req.method === 'POST') {
      const b = await req.json().catch(() => null) as { on?: Record<string, boolean>; quiet?: { from: number; to: number } | null; tz?: number } | null
      if (!b) return json({ error: 'send the changes' }, 400)
      const on = Object.fromEntries(Object.entries(b.on ?? {}).filter(([k, v]) => (KINDS as readonly string[]).includes(k) && typeof v === 'boolean'))
      const quiet = b.quiet === null ? null : b.quiet && [b.quiet.from, b.quiet.to].every(m => Number.isInteger(m) && m >= 0 && m < 1440) ? b.quiet : undefined
      return json({ prefs: setPrefs(al[1], { on, quiet, tz: Number.isInteger(b.tz) ? b.tz : undefined }) })
    }
    // the phone mirrors its on screen log here, so a dev can tail it instead of reading the screen
    if (url.pathname === '/log' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { line?: string }
      if (typeof body.line === 'string') console.log('phone', new Date().toISOString().slice(11, 19), body.line.slice(0, 500))
      return json({ ok: true })
    }
    if (url.pathname === '/drip' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string }
      const address = body.address
      if (!address || !isAddress(address)) return json({ error: 'bad address' }, 400)
      const last = cooldown.get(address.toLowerCase()) ?? 0
      if (Date.now() - last < 10 * 60_000) return json({ error: 'cooldown' }, 429)
      try {
        const t0 = Date.now()
        const { txs, block, mon, ausd } = await drip(address)
        cooldown.set(address.toLowerCase(), Date.now())
        console.log('drip', address, txs.length, 'txs in block', block.toString(), `${Date.now() - t0}ms`)
        // block is where the funds landed, the client must wait three more before it can spend them
        return json({ txs, block: block.toString(), mon: formatEther(mon), ausd: formatUnits(ausd, 6), ms: Date.now() - t0 })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'drip failed'
        console.error('drip failed', address, msg)
        return json({ error: msg }, 500)
      }
    }
    if (url.pathname === '/drip/usdc' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string }
      if (!body.address || !isAddress(body.address)) return json({ error: 'bad address' }, 400)
      // the usdc has a cooldown, the gas and the swapper role do not
      const last = usdcCooldown.get(body.address.toLowerCase()) ?? 0
      const withUsdc = Date.now() - last >= 10 * 60_000
      try {
        const t0 = Date.now()
        const r = await dripUsdc(body.address, withUsdc)
        if (withUsdc) usdcCooldown.set(body.address.toLowerCase(), Date.now())
        console.log('drip usdc', body.address, r.txs.length, 'txs', r.whitelisted ? 'whitelisted' : '', `${Date.now() - t0}ms`)
        return json({ ...r, block: r.block.toString(), ms: Date.now() - t0 })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'drip failed'
        console.error('drip usdc failed', body.address, msg)
        return json({ error: msg }, 500)
      }
    }
    if (url.pathname === '/agora/pair') {
      try { return json(await pairState(pub)) } catch (e) { return json({ error: e instanceof Error ? e.message : 'pair read failed' }, 500) }
    }
    // guard enrollment: the server makes the key, the passkey signs the delegation, the server keeps the key
    if (url.pathname === '/guard/start' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string }
      if (!body.address || !isAddress(body.address)) return json({ error: 'bad address' }, 400)
      const payload = await enrollPayload(body.address, { label: 'pehra guard' })
      pendingEnroll.set(body.address.toLowerCase(), payload)
      return json({ typed_data: payload.typed_data, publicKey: payload.pair.publicKey })
    }
    if (url.pathname === '/guard/finish' && req.method === 'POST') {
      // a fresh enrollment comes with forwarding just turned on, read perpl again next time
      const peek = await req.clone().json().catch(() => ({})) as { address?: string }
      if (peek.address) guard.forgetForwarding(peek.address)
      const body = await req.json().catch(() => ({})) as { address?: string; signature?: string }
      if (!body.address || !isAddress(body.address) || !body.signature) return json({ error: 'bad request' }, 400)
      const payload = pendingEnroll.get(body.address.toLowerCase())
      if (!payload) return json({ error: 'no pending enrollment' }, 400)
      try {
        const key = await enrollFinish(body.address, payload, body.signature as `0x${string}`)
        pendingEnroll.delete(body.address.toLowerCase())
        const ts = await guard.register(body.address, key)
        return json({ ok: true, account: ts.account?.id, settings: guard.settings(body.address) })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'enroll failed' }, 500)
      }
    }
    // revoking needs the passkey's signature over a fresh message, so nobody else can switch a guard off
    if (url.pathname === '/guard/revoke' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string; at?: number; signature?: string }
      if (!body.address || !isAddress(body.address) || !body.at || !body.signature) return json({ error: 'bad request' }, 400)
      if (Math.abs(Date.now() - body.at) > 5 * 60_000) return json({ error: 'stale' }, 400)
      const ok = await verifyMessage({ address: body.address, message: `revoke the pehra watch key for ${body.address.toLowerCase()} at ${body.at}`, signature: body.signature as `0x${string}` })
      if (!ok) return json({ error: 'bad signature' }, 401)
      return json({ revoked: guard.revoke(body.address) })
    }
    const m = url.pathname.match(/^\/guard\/(0x[0-9a-fA-F]{40})$/)
    if (m && req.method === 'GET') {
      const address = m[1]
      if (!guard.has(address)) return json({ enrolled: false })
      const ts = guard.session(address)
      if (url.searchParams.has('fresh')) guard.forgetForwarding(address)
      // balance and positions are on chain anyway, settings and the event history are the owner's
      const mine = owns(req, address)
      return json({ enrolled: true, live: !!ts, forwarding: await guard.forwarding(address), enrolledAt: guard.enrolledAt(address), settings: mine ? guard.settings(address) : undefined, balance: guard.balance(address), health: guard.health(address), events: mine ? guard.recent(address, 200) : [] })
    }
    if (m && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as Partial<GuardSettings>
      try { return json({ settings: guard.updateSettings(m[1], body) }) } catch (e) { return json({ error: e instanceof Error ? e.message : 'failed' }, 400) }
    }
    // push tokens from the phone, one address can have several devices
    if (url.pathname === '/push/register' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string; token?: string }
      if (!body.address || !isAddress(body.address) || !body.token) return json({ error: 'bad request' }, 400)
      return json({ devices: registerToken(body.address, body.token), pushReady })
    }
    if (url.pathname === '/push/test' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string }
      if (!body.address) return json({ error: 'bad request' }, 400)
      return json(await sendPush(body.address, 'pehra is watching', 'test push from the guard server', { kind: 'test' }))
    }
    if (url.pathname === '/guard/add' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string; pid?: number; ausd?: number }
      if (!body.address || !body.pid || !body.ausd) return json({ error: 'bad request' }, 400)
      try { return json({ health: await guard.addMargin(body.address, body.pid, body.ausd) }) } catch (e) { return json({ error: e instanceof Error ? e.message : 'failed' }, 500) }
    }
    // orders relayed on the delegated session
    if (url.pathname === '/order' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string; symbol?: string; side?: 'long' | 'short'; size?: number; leverage?: number }
      if (!body.address || !body.symbol || !body.side || !body.size || !body.leverage) return json({ error: 'bad request' }, 400)
      try {
        const { market, result } = await guard.openMarket(body.address, body.symbol, body.side, body.size, body.leverage)
        const o = result.order
        return json({ filled: o?.st === 4, status: o?.st, reason: o ? Reason[o.sr] ?? o.sr : result.status?.status, size: o ? fromSize(market, o.fs ?? 0) : 0, price: o ? fromPrice(market, o.fp ?? 0) : 0 })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'order failed' }, 500)
      }
    }
    // how the account trades and the rules that would fit its open positions (packages/perpl/src/profile.ts)
    const pr = url.pathname.match(/^\/profile\/(0x[0-9a-fA-F]{40})$/)
    if (pr && req.method === 'GET') {
      try {
        const { rows } = await chainHistory(pr[1])
        const open = guard.health(pr[1]).map(h => ({ pid: h.pid, mkt: h.mkt, side: h.side, entry: h.entry, mark: h.mark, liq: h.liq, size: h.size }))
        const have = guard.engine.list(pr[1]).filter(r => ['armed', 'held', 'paused', 'firing', 'working'].includes(r.state)).map(r => ({ pid: r.rule.pid, kind: r.kind }))
        return json(profile(rows as Activity[], open, have))
      } catch (e) { return json({ error: e instanceof Error ? e.message : 'profile failed' }, 502) }
    }
    const ch = url.pathname.match(/^\/chain\/(0x[0-9a-fA-F]{40})$/)
    if (ch && req.method === 'GET') {
      try { return json(await chainHistory(ch[1])) } catch (e) { return json({ error: e instanceof Error ? e.message : 'indexer unreachable' }, 502) }
    }
    if (url.pathname === '/activity' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string; kind?: string; amount?: number; tx?: string; text?: string }
      if (!body.address || !isAddress(body.address) || (body.kind !== 'funded' && body.kind !== 'withdrew') || !body.amount) return json({ error: 'bad request' }, 400)
      guard.record(body.address, { kind: body.kind, amount: body.amount, tx: body.tx, text: (body.text ?? '').slice(0, 200) })
      return json({ ok: true })
    }
    if (url.pathname === '/close' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string; pid?: number }
      if (!body.address || !body.pid) return json({ error: 'bad request' }, 400)
      try { return json(await guard.closePosition(body.address, body.pid)) } catch (e) { return json({ error: e instanceof Error ? e.message : 'close failed' }, 500) }
    }
    if (url.pathname === '/brackets' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string; pid?: number; stop?: number; take?: number }
      if (!body.address || !body.pid || (!body.stop && !body.take)) return json({ error: 'bad request' }, 400)
      try { return json(await guard.setBrackets(body.address, body.pid, { stop: body.stop, take: body.take })) } catch (e) { return json({ error: e instanceof Error ? e.message : 'brackets failed' }, 500) }
    }
    if (url.pathname === '/close-all' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { address?: string }
      if (!body.address) return json({ error: 'bad request' }, 400)
      try { const r = await guard.closeAll(body.address); return json({ closed: r.length }) } catch (e) { return json({ error: e instanceof Error ? e.message : 'close failed' }, 500) }
    }
    return json({ error: 'not found' }, 404)
  },
})
startBeats(() => guard.beat())
// the alerts that come from outside the guard's own stream: liquidations the indexer saw on chain, funding
// flips from perpl's context, ausd off the dollar at agora, and the end of quiet hours
const log = (s: string) => console.log(s)
const liqSeen = new Map<string, number>()
async function liquidations() {
  for (const owner of guard.accounts().map(a => a.address.toLowerCase())) {
    try {
      const { rows } = await chainHistory(owner) as { rows: { kind: string; perpId: string | null; side: string | null; priceWire: string | null; timestamp: number }[] }
      const liq = rows.filter(r => r.kind === 'liquidated')
      const newest = Math.max(0, ...liq.map(r => r.timestamp))
      const seen = liqSeen.get(owner)
      liqSeen.set(owner, Math.max(seen ?? 0, newest))
      // the first read only sets where we start, old liquidations are not news
      if (seen === undefined) continue
      for (const r of liq.filter(x => x.timestamp > seen)) {
        const m = guard.marketOf(Number(r.perpId))
        guard.alerts.liquidated(owner, m?.symbol ?? 'a', r.side ?? 'position', m && r.priceWire ? fromPrice(m, Number(r.priceWire)) : null, r.timestamp)
      }
    } catch (e) { log(`alerts liquidations ${owner.slice(0, 8)}: ${e instanceof Error ? e.message : e}`) }
  }
}
async function funding() {
  try {
    const rates = (await getContext('testnet')).markets.map(m => ({ id: m.id, symbol: m.symbol, rate: m.funding.rate }))
    guard.alerts.fundingTick(rates)
    guard.engine.funding(rates)
    for (const r of rates) guard.engine.pollChains({ at: Date.now(), fundingRate: r.rate, mkt: r.id })
  } catch (e) { log(`alerts funding: ${e instanceof Error ? e.message : e}`) }
}
async function depeg() {
  try {
    const price = (await pairState(pub)).price
    guard.alerts.depegTick(price, Number(process.env.ALERT_DEPEG_BPS ?? 50))
    guard.engine.pollChains({ at: Date.now(), ausdPrice: price })
  }
  catch (e) { log(`alerts depeg: ${e instanceof Error ? e.message : e}`) }
}
setInterval(() => void liquidations(), 30_000)
setTimeout(() => void liquidations(), 20_000)
setInterval(() => void funding(), 60_000)
setTimeout(() => void funding(), 15_000)
setInterval(() => void depeg(), 5 * 60_000)
setTimeout(() => void depeg(), 25_000)
setInterval(() => guard.alerts.quietTick(), 60_000)
// traders people copy: every 5s their newest activity from the indexer goes to the engine
let copying = false
setInterval(async () => {
  if (copying) return
  copying = true
  try {
    for (const t of guard.engine.copyTargets()) {
      const { rows } = await chainHistory(t).catch(() => ({ rows: [] as unknown[] }))
      guard.engine.onCopy(t, rows as Parameters<typeof guard.engine.onCopy>[1])
    }
  } finally { copying = false }
}, 5000)
// accounts people watch: what they did since the last look, and positions near liquidation
setInterval(() => void watchTick(pub, guard.openMarkets(), chainHistory, (owner, key, title, body) => void guard.alerts.push(owner, 'watched', key, title, body)).catch(e => log(`watch tick: ${e instanceof Error ? e.message : e}`)), 30_000)
// chains on the clock (a set time, every day) are checked twice a minute
setInterval(() => guard.engine.pollChains({ at: Date.now() }), 30_000)

setTimeout(() => void anchor(), 30_000)
setInterval(() => void anchor(), ANCHOR_MS)
void guard.start().catch(e => console.error('guard failed to start', e instanceof Error ? e.message : e))
void refill()
void feeCaps(pub)
console.log(`pehra api on :${server.port}, paying from ${payer.address}, push ${pushReady ? 'ready' : 'dry run, no service account'}`)
