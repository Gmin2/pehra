// the guard, forced. the dev account's api key is registered as its own guard key, a MON long is opened
// at the highest leverage perpl grants (leverage descent caps it, about 3x on testnet MON right now, so the
// position sits about 28% from liquidation), the threshold is set above that distance, and the guard has
// to add margin within a few seconds. then everything is closed. run with the drip server stopped.
import { readFileSync } from 'node:fs'
import { privateKeyToAccount } from 'viem/accounts'
import { fromCns } from '@pehra/perpl'
import { Guard } from '../src/guard'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=') as [string, string]))
const me = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`).address
const t0 = Date.now()
const guard = new Guard(s => console.log(`+${Date.now() - t0}ms ${s}`))
await guard.start()
if (!guard.has(me)) await guard.register(me, { apiKey: env.PERPL_API_KEY, secret: env.PERPL_API_SECRET as `0x${string}`, publicKey: env.PERPL_API_PUB as `0x${string}`, scope: 3 })
else await new Promise(r => setTimeout(r, 2500))
guard.updateSettings(me, { enabled: true, thresholdPct: 32, targetPct: 36, minAddAusd: 1, maxAddAusdPerDay: 20 })
const before = guard.health(me)
console.log('positions before', before.map(h => `${h.pid} ${(h.distance * 100).toFixed(2)}%`).join(', ') || 'none')

const { result } = await guard.openMarket(me, 'MON', 'long', 100, 10)
console.log(`+${Date.now() - t0}ms opened`, result.order?.st === 4 ? 'filled' : `status ${result.order?.st}`)
await new Promise(r => setTimeout(r, 1500))
for (const h of guard.health(me)) console.log(`+${Date.now() - t0}ms position ${h.pid} ${h.side} entry ${h.entry} mark ${h.mark} liq ${h.liq.toFixed(5)} distance ${(h.distance * 100).toFixed(2)}% collateral ${h.collateral}`)
for (const p of guard.session(me)?.positions.values() ?? []) console.log(`asked for 10x, perpl granted lv ${p.lv} (${p.lv / 100}x)`)

// give the guard a few mark ticks
await new Promise(r => setTimeout(r, 6000))
const events = guard.recent(me)
console.log('\nguard events, newest first')
for (const e of events.slice(0, 8)) console.log(`  ${new Date(e.at).toISOString().slice(11, 19)} ${e.kind.padEnd(7)} ${e.text}`)
for (const h of guard.health(me)) console.log(`after: position ${h.pid} distance ${(h.distance * 100).toFixed(2)}% collateral ${h.collateral}`)

const closed = await guard.closeAll(me)
console.log(`+${Date.now() - t0}ms closed ${closed.length}, balance ${fromCns(guard.session(me)?.account?.b ?? '0')} AUSD`)
const added = events.some(e => e.kind === 'added')
console.log(added ? 'DRILL PASS: the guard added margin' : 'DRILL FAIL: no margin added')
process.exit(added ? 0 : 1)
