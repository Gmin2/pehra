import { connect, stamp, sleep } from './g-lib'
const t0 = Date.now(), t = () => ((Date.now() - t0) / 1000).toFixed(2)
const ts = await connect()
const ws = (ts as unknown as { ws: WebSocket }).ws
const send = ws.send.bind(ws)
ws.send = (d: string) => { console.log(t(), 'send', d.slice(0, 40)); return send(d) }
ws.addEventListener('ping' as 'message', () => console.log(t(), 'server ping'))
ws.addEventListener('pong' as 'message', () => console.log(t(), 'server pong'))
let alive = true
ws.addEventListener('close', e => { alive = false; console.log(t(), 'closed', (e as CloseEvent).code, (e as CloseEvent).reason) })
while (alive && Date.now() - t0 < 60000) await sleep(200)
if (alive) ts.close()
await sleep(200)
