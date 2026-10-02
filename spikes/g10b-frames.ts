// g10b: which frames does the trading server send while idle, and does it ping us
import { env, sleep } from './perplws'
import { signInFrame } from '../packages/perpl/src/index'
const ws = new WebSocket('wss://testnet.perpl.xyz/ws/v1/trading')
const t0 = Date.now(), seen: string[] = []
ws.onopen = () => ws.send(JSON.stringify(signInFrame(10143, env.PERPL_API_KEY, env.PERPL_API_SECRET as `0x${string}`)))
ws.onmessage = e => { const m = JSON.parse(String(e.data)); const t = ((Date.now() - t0) / 1000).toFixed(2); if (m.mt !== 100 || seen.filter(s => s.includes('mt 100')).length < 3) seen.push(`${t}s mt ${m.mt}${m.mt === 1 ? ' ' + JSON.stringify(m) : ''}`); if (m.mt === 1) console.log(t, 'SERVER PING', JSON.stringify(m)) }
ws.onclose = e => { console.log(((Date.now() - t0) / 1000).toFixed(2), 'closed', e.code, e.reason); console.log(seen.slice(0, 30).join('\n')) }
const every = Number(process.env.PING_MS ?? 0)
if (every) setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ mt: 1, t: Date.now() })), every)
await sleep(Number(process.env.LIMIT_S ?? 20) * 1000)
ws.close()
await sleep(200)
