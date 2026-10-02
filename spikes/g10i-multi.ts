// g10i: several trading sockets in one bun process, each answering pings, for 90s. counts drops per socket
import { readFileSync } from 'node:fs'
import { TradingSocket } from '../packages/perpl/src/index'
import { sleep } from './perplws'
type Stored = { address: string; key: { apiKey: string; secret: `0x${string}` } }
const keys = (JSON.parse(readFileSync('../services/api/data/guard-keys.json', 'utf8')) as Stored[]).slice(0, Number(process.env.N ?? 3))
const t0 = Date.now(), t = () => ((Date.now() - t0) / 1000).toFixed(1)
const drops = new Map<string, number>()
for (const k of keys) {
  const name = k.address.slice(0, 8)
  const open = () => {
    const ts = new TradingSocket({ net: 'testnet', apiKey: k.key.apiKey, secret: k.key.secret, onClose: (c, r) => { drops.set(name, (drops.get(name) ?? 0) + 1); console.log(t(), name, 'closed', c, r); if (Date.now() - t0 < 85_000) setTimeout(open, 0) } })
    ts.connect().catch(e => console.log(t(), name, 'connect failed', e.message))
  }
  open()
}
await sleep(90_000)
console.log('RESULT g10i:', keys.length, 'sockets, drops', JSON.stringify(Object.fromEntries(drops)))
process.exit(0)
