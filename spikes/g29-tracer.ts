// g29: tracer. a when rule on the account, price below the mark plus a hair, then notify. arms, fires once, done
import { arm, rows, markNow, r5 } from './g29-lib'
import type { Rule } from '../packages/perpl/src/index'
const m = await markNow()
const id = `w-${Date.now().toString(36)}`
const rule: Rule = { v: 1, id, pid: 0, mkt: 64, forMs: 0, kind: 'when', on: { on: 'price', dir: 'below', px: r5(m * 1.02) }, then: [{ do: 'notify', text: 'tracer: mon is under the line' }] }
console.log('already happened', await arm({ ...rule, id: id + 'x' }))
const up: Rule = { ...rule, on: { on: 'price', dir: 'above', px: r5(m * 0.98) } }
console.log('above, already  ', await arm({ ...up, id: id + 'y' }))
const ok: Rule = { ...rule, on: { on: 'price', dir: 'below', px: r5(m * 1.0002) } }
console.log('mark', m, 'line', r5(m * 1.0002))
