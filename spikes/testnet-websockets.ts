const results: any = {}
async function probe(name: string, url: string, sub: any, max = 3, ms = 8000) {
  return new Promise<void>(resolve => {
    const got: any[] = []
    const ws = new WebSocket(url)
    const t = setTimeout(() => { results[name] = { status: 'timeout', got }; ws.close(); resolve() }, ms)
    ws.onopen = () => ws.send(JSON.stringify(sub))
    ws.onmessage = e => { got.push(JSON.parse(String(e.data))); if (got.length >= max) { clearTimeout(t); results[name] = { status: 'ok', got }; ws.close(); resolve() } }
    ws.onerror = e => { clearTimeout(t); results[name] = { status: 'error', err: String((e as any).message ?? e), got }; resolve() }
  })
}
await Promise.all([
  probe('monadNewHeads', 'wss://testnet-rpc.monad.xyz', { jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['monadNewHeads'] }, 4),
  probe('perpl-market-data', 'wss://testnet.perpl.xyz/ws/v1/market-data', { mt: 5, subs: [{ stream: 'market-state@10143', subscribe: true }, { stream: 'heartbeat@10143', subscribe: true }] }, 3),
])
for (const [k, v] of Object.entries<any>(results)) {
  console.log('==', k, v.status, v.err ?? '')
  for (const m of v.got) console.log(JSON.stringify(m).slice(0, 400))
}
