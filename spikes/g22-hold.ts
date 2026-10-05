// g22: pausing and resuming one rule over the signed route, and what it refuses
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { ruleMessage, type SignedAction } from '../packages/perpl/src/index'
import { env } from './perplws'
const me = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const stranger = privateKeyToAccount(generatePrivateKey())
const api = 'http://localhost:8787'
const post = async (path: string, body: unknown) => { const r = await fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return `${r.status} ${(await r.text()).slice(0, 110)}` }
const sign = async (who: typeof me, a: SignedAction) => { const nonce = crypto.randomUUID(), exp = Date.now() + 120_000; return { nonce, exp, sig: await who.signMessage({ message: ruleMessage(me.address, a, nonce, exp) }) } }
const state = async (id: string) => ((await (await fetch(`${api}/rules/${me.address}`)).json()) as { rules: { id: string; state: string }[] }).rules.find(r => r.id === id)?.state
const rule = { v: 1, id: `hold-${Date.now()}`, kind: 'ping', pid: 0, mkt: 64, above: 999 }
console.log('create                ', await post(`/rules/${me.address}`, { rule, ...(await sign(me, { action: 'create', rule: { ...rule, forMs: 0 } as never, symbol: 'MON' })) }), await state(rule.id))
console.log('hold by a stranger    ', await post(`/rules/${me.address}/${rule.id}/hold`, await sign(stranger, { action: 'hold', id: rule.id })), await state(rule.id))
console.log('hold unsigned         ', await post(`/rules/${me.address}/${rule.id}/hold`, {}), await state(rule.id))
console.log('hold signed for resume', await post(`/rules/${me.address}/${rule.id}/hold`, await sign(me, { action: 'resume', id: rule.id })), await state(rule.id))
console.log('hold                  ', await post(`/rules/${me.address}/${rule.id}/hold`, await sign(me, { action: 'hold', id: rule.id })), await state(rule.id))
console.log('hold again            ', await post(`/rules/${me.address}/${rule.id}/hold`, await sign(me, { action: 'hold', id: rule.id })), await state(rule.id))
console.log('resume                ', await post(`/rules/${me.address}/${rule.id}/resume`, await sign(me, { action: 'resume', id: rule.id })), await state(rule.id))
console.log('hold a missing rule   ', await post(`/rules/${me.address}/nope/hold`, await sign(me, { action: 'hold', id: 'nope' })))
console.log('cancel                ', await post(`/rules/${me.address}/${rule.id}/cancel`, await sign(me, { action: 'cancel', id: rule.id })), await state(rule.id))
