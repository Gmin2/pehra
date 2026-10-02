import { env, sleep } from './perplws'
import { signInFrame } from '../packages/perpl/src/index'
const ws = new WebSocket('wss://testnet.perpl.xyz/ws/v1/trading')
const t0 = Date.now(), t = () => ((Date.now() - t0) / 1000).toFixed(2)
ws.onopen = () => ws.send(JSON.stringify(signInFrame(10143, env.PERPL_API_KEY, env.PERPL_API_SECRET as `0x${string}`)))
ws.addEventListener('ping' as 'message', () => { ws.send(JSON.stringify({ mt: 1, t: Date.now() })); console.log(t(), 'native ping event, flushed') })
ws.onclose = e => console.log(t(), 'closed', e.code, e.reason)
await sleep(25000); ws.close(); await sleep(200)
