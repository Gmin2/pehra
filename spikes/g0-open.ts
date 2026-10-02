// g0: does a plain market open go through right now, and what does the account look like
import { connect, monPosition, stamp, sleep, until } from './g-lib'
import { MON } from './g-lib'
const ts = await connect()
console.log(stamp(), 'account', JSON.stringify({ ...ts.account, h: undefined }))
const p = ts.openMarket({ mkt: MON, side: 'long', size: 200, leverage: 200 })
p.then(r => console.log(stamp(), 'open settled', r.order?.st, r.order?.sr, r.status?.status)).catch(e => console.log(stamp(), 'open error', e.message))
try { await until('position', () => monPosition(ts) !== null, 45_000); console.log(stamp(), 'position', JSON.stringify(monPosition(ts))) } catch (e) { console.log(stamp(), (e as Error).message, 'lfr now', ts.account?.lfr) }
await sleep(1000)
ts.close()
