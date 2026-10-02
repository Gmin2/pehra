// g19: signed rule writes against the running api, every way it can go wrong
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { ruleMessage, type SignedAction } from '../packages/perpl/src/index'
import { env } from './perplws'
const me = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const stranger = privateKeyToAccount(generatePrivateKey())
const api = 'http://localhost:8787'
const post = async (path: string, body: unknown) => { const r = await fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return `${r.status} ${(await r.text()).slice(0, 110)}` }
const sign = async (who: typeof me, a: SignedAction, exp = Date.now() + 120_000, nonce = crypto.randomUUID()) => ({ nonce, exp, sig: await who.signMessage({ message: ruleMessage(me.address, a, nonce, exp) }) })
const rule = { v: 1, id: `sig-${Date.now()}`, kind: 'ping', pid: 0, mkt: 64, above: 9 }
const create: SignedAction = { action: 'create', rule: { ...rule, forMs: 0 } as never, symbol: 'MON' }
const good = await sign(me, create)
console.log('good signature        ', await post(`/rules/${me.address}`, { rule, ...good }))
console.log('same signature again  ', await post(`/rules/${me.address}`, { rule: { ...rule, id: rule.id + 'b' }, ...good }))
console.log('replayed nonce        ', await post(`/rules/${me.address}`, { rule, ...good }))
console.log('stranger key          ', await post(`/rules/${me.address}`, { rule: { ...rule, id: 'x1' }, ...(await sign(stranger, { ...create, rule: { ...rule, id: 'x1', forMs: 0 } as never })) }))
const s2 = await sign(me, { ...create, rule: { ...rule, id: 'x2', forMs: 0 } as never })
console.log('rule changed after    ', await post(`/rules/${me.address}`, { rule: { ...rule, id: 'x2', above: 1 }, ...s2 }))
console.log('expired               ', await post(`/rules/${me.address}`, { rule: { ...rule, id: 'x3' }, ...(await sign(me, { ...create, rule: { ...rule, id: 'x3', forMs: 0 } as never }, Date.now() - 1000)) }))
console.log('unsigned              ', await post(`/rules/${me.address}`, { rule: { ...rule, id: 'x4' } }))
console.log('cancel unsigned       ', await post(`/rules/${me.address}/${rule.id}/cancel`, {}))
console.log('cancel signed         ', await post(`/rules/${me.address}/${rule.id}/cancel`, await sign(me, { action: 'cancel', id: rule.id })))
console.log('pause signed          ', await post(`/rules/${me.address}/pause`, await sign(me, { action: 'pause' })))
