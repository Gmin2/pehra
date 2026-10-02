// prints the payer's mon position and resting triggers over signed rest every 2s until the position is gone.
// used by the kill test, when the api (and its socket) is down on purpose
import { restOrders, restPositions } from '../packages/perpl/src/index'
import { env, sleep } from './perplws'
const key = { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}` }
const t0 = Date.now()
for (;;) {
  const [p, o] = await Promise.all([restPositions(key), restOrders(key)])
  const ctx = await (await fetch('https://testnet.perpl.xyz/api/v1/pub/context')).json() as { markets: { id: number; state: { mrk: number } }[] }
  const mark = ctx.markets.find(m => m.id === 64)?.state.mrk
  const pos = p.d.find(x => x.mkt === 64)
  const trig = o.d.filter(x => x.st === 8 || x.st === 9).map(x => `${x.oid} st ${x.st} tp ${x.tp}`)
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s mark ${mark} position ${pos ? pos.s : 'gone'} triggers [${trig.join(', ')}]`)
  if (!pos) break
  await sleep(2000)
}
