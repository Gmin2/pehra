// cancels every active rule on the dev account, closes its positions and leftover triggers
import { connect, closeAll, sleep } from './g-lib'
import { cancel, rows } from './g29-lib'
for (const r of await rows()) if (['armed', 'held', 'paused'].includes(r.state) && !r.id.startsWith('guard-')) console.log('cancel', r.id, await cancel(r.id))
await sleep(3000)
const ts = await connect(); await sleep(1500); await closeAll(ts); await sleep(2500)
console.log('left: positions', ts.positions.size, 'resting', [...ts.orders.values()].filter(o => o.st === 8).length)
ts.close()
