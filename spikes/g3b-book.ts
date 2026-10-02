// g3b: the order book stream's real shape, snapshot then updates
const ws = new WebSocket('wss://testnet.perpl.xyz/ws/v1/market-data')
let n = 0
ws.onopen = () => ws.send(JSON.stringify({ mt: 5, subs: [{ stream: 'order-book@64', subscribe: true }] }))
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.mt === 15 || m.mt === 16 || m.mt === 6) { console.log(JSON.stringify(m).slice(0, 700)); if (++n >= 4) { ws.close(); process.exit(0) } } }
setTimeout(() => process.exit(0), 15000)
