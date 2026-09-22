// the pehra server. for now one job: put testnet gas and AUSD into a fresh mera address so the phone
// can do the perpl setup itself. the dev key pays. later: enrollment proxy, the guard, push.
import { createWalletClient, formatEther, formatUnits, http, isAddress, parseEther, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadChain, publicClient, erc20Abi, faucetAbi, AUSD_FAUCET, NETWORKS } from '@pehra/perpl'

const key = process.env.DEV_PRIVATE_KEY
if (!key) throw new Error('DEV_PRIVATE_KEY missing')
const chain = monadChain('testnet')
const pub = publicClient('testnet')
const wallet = createWalletClient({ account: privateKeyToAccount(key as `0x${string}`), chain, transport: http() })
const AUSD = NETWORKS.testnet.ausd

const DRIP_MON = parseEther('0.08')
const MIN_AUSD = 100_000_000n
const cooldown = new Map<string, number>()

async function drip(address: Address) {
  const out: Record<string, string> = {}
  const mon = await pub.getBalance({ address })
  if (mon < DRIP_MON) {
    const hash = await wallet.sendTransaction({ to: address, value: DRIP_MON - mon })
    await pub.waitForTransactionReceipt({ hash })
    out.mon = hash
  }
  const ausd = await pub.readContract({ address: AUSD, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
  if (ausd < MIN_AUSD) {
    const gas = await pub.estimateContractGas({ address: AUSD_FAUCET, abi: faucetAbi, functionName: 'requestFunds', args: [address], account: wallet.account })
    const hash = await wallet.writeContract({ address: AUSD_FAUCET, abi: faucetAbi, functionName: 'requestFunds', args: [address], gas: gas + gas / 13n })
    const r = await pub.waitForTransactionReceipt({ hash })
    if (r.status !== 'success') throw new Error('faucet reverted')
    out.ausd = hash
  }
  return out
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const server = Bun.serve({
  hostname: '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/health') return json({ ok: true, payer: wallet.account.address })
    if (url.pathname === '/drip' && req.method === 'POST') {
      const { address } = await req.json().catch(() => ({}))
      if (!isAddress(address)) return json({ error: 'bad address' }, 400)
      const last = cooldown.get(address.toLowerCase()) ?? 0
      if (Date.now() - last < 10 * 60_000) return json({ error: 'cooldown' }, 429)
      try {
        const t0 = Date.now()
        const txs = await drip(address)
        cooldown.set(address.toLowerCase(), Date.now())
        const [mon, ausd] = await Promise.all([pub.getBalance({ address }), pub.readContract({ address: AUSD, abi: erc20Abi, functionName: 'balanceOf', args: [address] })])
        console.log('drip', address, txs, `${Date.now() - t0}ms`)
        return json({ txs, mon: formatEther(mon), ausd: formatUnits(ausd, 6), ms: Date.now() - t0 })
      } catch (e: any) {
        console.error('drip failed', address, e?.shortMessage ?? e?.message)
        return json({ error: e?.shortMessage ?? e?.message ?? 'drip failed' }, 500)
      }
    }
    return json({ error: 'not found' }, 404)
  },
})
console.log(`pehra api on :${server.port}, paying from ${wallet.account.address}`)
