// the pehra server. for now one job: put testnet gas and AUSD into a fresh mera address so the phone
// can do the perpl setup itself. the dev key pays. later: enrollment proxy, the guard, push.
import { encodeFunctionData, formatEther, formatUnits, isAddress, parseEther, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, erc20Abi, faucetAbi, AUSD_FAUCET, NETWORKS, GAS, sendBatch, nextNonce, feeCaps, type Call } from '@pehra/perpl'

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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const server = Bun.serve({
  hostname: '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/health') return json({ ok: true, payer: payer.address })
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
    return json({ error: 'not found' }, 404)
  },
})
void refill()
void feeCaps(pub)
console.log(`pehra api on :${server.port}, paying from ${payer.address}`)
