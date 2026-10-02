import { env, sleep } from './perplws'
import { signInFrame } from '../packages/perpl/src/index'
const mode = process.env.MODE ?? 'pong'
const ws = new WebSocket('wss://testnet.perpl.xyz/ws/v1/trading') as WebSocket & { pong?: (d?: unknown) => void }
const t0 = Date.now(), t = () => ((Date.now() - t0) / 1000).toFixed(2)
console.log('has pong()', typeof ws.pong)
ws.onopen = () => ws.send(JSON.stringify(signInFrame(10143, env.PERPL_API_KEY, env.PERPL_API_SECRET as `0x${string}`)))
ws.addEventListener('ping' as 'message', (e: Event) => { if (mode === 'pong') ws.pong?.((e as MessageEvent).data); })
let done = false
ws.onclose = e => { done = true; console.log(t(), 'closed', e.code, e.reason) }
const end = Date.now() + 60000
while (!done && Date.now() < end) await sleep(200)
if (!done) { ws.close(); await sleep(200) }
