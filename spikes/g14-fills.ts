// g14: perpl's signed fills, to tell a backstop fill from any other close
import { signedFetch } from '../packages/perpl/src/index'
import { env } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
for (const t of ['/v1/trading/fills?count=5', '/v1/trading/order-history?count=5', '/v1/trading/orders/history?count=5']) {
  const r = await signedFetch(key, 'GET', t)
  console.log(t, r.status, (await r.text()).slice(0, 900))
}
