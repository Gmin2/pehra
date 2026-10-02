// g13: signed rest reads, the reconcile source when the socket is down. prints the raw shapes
import { restOrders, restPositions, restWallet, signedFetch } from '../packages/perpl/src/index'
import { env } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
for (const [name, f] of [['wallet', restWallet], ['orders', restOrders], ['positions', restPositions]] as const) {
  try { const r = await f(key); console.log(name, JSON.stringify(r).slice(0, 500)) } catch (e) { console.log(name, 'ERR', (e as Error).message) }
}
const bad = await signedFetch({ apiKey: env.PERPL_API_KEY, secret: ('0x' + '11'.repeat(32)) as `0x${string}` }, 'GET', '/v1/trading/orders')
console.log('wrong key ->', bad.status, (await bad.text()).slice(0, 120))
