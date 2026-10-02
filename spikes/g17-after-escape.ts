// g17: a forwarded order after a direct onchain close that used a timestamp id. print every frame
import { connect, stamp, sleep, MON } from './g-lib'
const ts = await connect()
ts.onFrame(f => { if (f.mt !== 100 && f.mt !== 24 && f.mt !== 27 && f.mt !== 21) console.log(stamp(), 'frame', JSON.stringify(f).slice(0, 300)) })
console.log(stamp(), 'lfr', ts.account?.lfr)
const r = await ts.openMarket({ mkt: MON, side: 'long', size: 200, leverage: 200 }).catch(e => ({ err: (e as Error).message }))
console.log(stamp(), 'result', JSON.stringify(r).slice(0, 300))
await sleep(2000); ts.close(); await sleep(300)
