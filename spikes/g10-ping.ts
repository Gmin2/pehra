// g10: what keeps the trading socket alive. sign in, send nothing but app pings (mt 1) every PING_MS,
// and log how long the session lives. run with PING_MS=30000, 10000, 3000.
import { connect, stamp, sleep, monPosition } from './g-lib'
const t0 = Date.now()
const ts = await connect()
console.log(stamp(), 'ping every', process.env.PING_MS ?? 30000, 'ms. mon position:', JSON.stringify(monPosition(ts)), 'resting:', [...ts.orders.values()].filter(o => o.st === 8).length)
let alive = true
ts.onFrame(f => { if (f.mt === 1 || f.mt === 100) return })
const sock = (ts as unknown as { ws: WebSocket }).ws
sock.addEventListener('close', () => { alive = false; console.log('RESULT g10:', `PING_MS=${process.env.PING_MS} lived ${((Date.now() - t0) / 1000).toFixed(1)}s`) })
const limit = Number(process.env.LIMIT_S ?? 75) * 1000
while (alive && Date.now() - t0 < limit) await sleep(500)
if (alive) { console.log('RESULT g10:', `PING_MS=${process.env.PING_MS} still alive after ${limit / 1000}s`); ts.close() }
await sleep(300)
