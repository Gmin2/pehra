// g28: every unsigned write needs the account's session token, reads show strangers less
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { ruleMessage, SIGN_TTL_MS } from '../packages/perpl/src/index'
import { env } from './perplws'
const me = privateKeyToAccount(env.DEV_PRIVATE_KEY as `0x${string}`)
const other = privateKeyToAccount(generatePrivateKey())
const api = 'http://localhost:8787'
const call = async (path: string, body: unknown, token?: string) => { const r = await fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); return `${r.status} ${(await r.text()).slice(0, 90)}` }
const session = async (who: typeof me) => { const nonce = crypto.randomUUID(), exp = Date.now() + SIGN_TTL_MS, device = 'spike'; const r = await fetch(api + '/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: who.address, device, nonce, exp, sig: await who.signMessage({ message: ruleMessage(who.address, { action: 'session', device }, nonce, exp) }) }) }); return (await r.json() as { token: string }).token }
const mine = await session(me), theirs = await session(other)
const a = me.address
console.log('order, no token        ', await call('/order', { address: a, symbol: 'MON', side: 'long', size: 200, leverage: 2 }))
console.log('order, another token   ', await call('/order', { address: a, symbol: 'MON', side: 'long', size: 200, leverage: 2 }, theirs))
console.log('guard off, no token    ', await call(`/guard/${a}`, { enabled: false }))
console.log('alerts, another token  ', await call(`/alerts/${a}`, { on: { depeg: false } }, theirs))
console.log('close-all, no token    ', await call('/close-all', { address: a }))
console.log('push register, no token', await call('/push/register', { address: a, token: 'x' }))
console.log('guard settings, mine   ', await call(`/guard/${a}`, { maxAddAusdPerDay: 20 }, mine))
console.log('order, my token        ', await call('/order', { address: a, symbol: 'MON', side: 'long', size: 200, leverage: 2 }, mine))
await new Promise(r => setTimeout(r, 3000))
console.log('close-all, my token    ', await call('/close-all', { address: a }, mine))
const g = async (path: string, token?: string) => (await (await fetch(api + path, { headers: token ? { authorization: `Bearer ${token}` } : {} })).json()) as Record<string, unknown>
const pub = await g(`/guard/${a}`), own = await g(`/guard/${a}`, mine)
console.log('guard read stranger    ', 'settings' in pub && pub.settings ? 'settings shown' : 'no settings', (pub.events as unknown[]).length, 'events')
console.log('guard read owner       ', own.settings ? 'settings shown' : 'no settings', (own.events as unknown[]).length, 'events')
const rp = await g(`/rules/${a}`) as { rules: Record<string, unknown>[] }, ro = await g(`/rules/${a}`, mine) as { rules: Record<string, unknown>[] }
console.log('rules read stranger    ', rp.rules[0] && 'rule' in rp.rules[0] ? 'rule body shown' : 'no rule body')
console.log('rules read owner       ', ro.rules[0] && 'rule' in ro.rules[0] ? 'rule body shown' : 'no rule body')
const pp = await g(`/proof/${a}`) as { runs: { body: { rule?: { withheld?: boolean } } }[] }
console.log('proof stranger         ', pp.runs.some(r => r.body.rule && !r.body.rule.withheld) ? 'a rule body leaks' : 'rule bodies withheld')
const al = await fetch(`${api}/alerts/${a}`)
console.log('alerts read stranger   ', al.status)
