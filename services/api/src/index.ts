// the pehra server. for now one job: put testnet gas and AUSD into a fresh mera address so the phone
// can do the perpl setup itself. the dev key pays. later: enrollment proxy, the guard, push.
import { encodeFunctionData, formatEther, formatUnits, isAddress, parseEther, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, erc20Abi, faucetAbi, AUSD_FAUCET, NETWORKS, GAS, AGORA, AGORA_GAS, whitelisterAbi, isSwapper, pairState, sendBatch, nextNonce, feeCaps, enrollPayload, enrollFinish, fromCns, fromPrice, fromSize, Reason, type Call, type EnrollPayload, type GuardSettings } from '@pehra/perpl'
import { Guard } from './guard'
import { pushReady, registerToken, sendPush } from './push'

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

const guard = new Guard()
const pendingEnroll = new Map<string, EnrollPayload>()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const server = Bun.serve({
  hostname: '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/health') return json({ ok: true, payer: payer.address })
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
    const m = url.pathname.match(/^\/guard\/(0x[0-9a-fA-F]{40})$/)
    if (m && req.method === 'GET') {
      const address = m[1]
      if (!guard.has(address)) return json({ enrolled: false })
      const ts = guard.session(address)
      return json({ enrolled: true, live: !!ts, settings: guard.settings(address), balance: guard.balance(address), health: guard.health(address), events: guard.recent(address, 200) })
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
void guard.start().catch(e => console.error('guard failed to start', e instanceof Error ? e.message : e))
void refill()
void feeCaps(pub)
console.log(`pehra api on :${server.port}, paying from ${payer.address}, push ${pushReady ? 'ready' : 'dry run, no service account'}`)
