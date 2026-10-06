// the rule routes. every write is signed by the account (signedRules.ts). a rule is checked twice before
// it is stored: its shape by the schema, then its facts against the live position (stop under the mark,
// trigger budget)
import { Rule, validate, validateEntry } from '@pehra/perpl'
import type { Guard } from './guard'
import { checkSigned, type Signed } from './signedRules'
import { proof } from './proof'
import { verify } from './runs'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function rulesRoute(req: Request, url: URL, guard: Guard): Promise<Response | null> {
  if (url.pathname === '/proof/verify') return json(verify())
  if (url.pathname === '/proof') return json(proof(null))
  const own = url.pathname.match(/^\/proof\/(0x[0-9a-fA-F]{40})$/)
  if (own) return json(proof(own[1]))
  const pa = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})\/pause$/)
  if (pa && req.method === 'POST') {
    const v = await checkSigned(pa[1], { action: 'pause' }, await body(req))
    if (!v.ok) return json({ error: v.why }, v.status)
    return json({ paused: guard.engine.pauseAll(pa[1], 'paused by the owner') })
  }
  const hr = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})\/([\w-]+)\/(hold|resume)$/)
  if (hr && req.method === 'POST') {
    const hold = hr[3] === 'hold'
    const v = await checkSigned(hr[1], hold ? { action: 'hold', id: hr[2] } : { action: 'resume', id: hr[2] }, await body(req))
    if (!v.ok) return json({ error: v.why }, v.status)
    const r = guard.engine.setHold(hr[1], hr[2], hold)
    return r.ok ? json({ state: r.state }) : json({ error: r.why }, 409)
  }
  const c = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})\/([\w-]+)\/cancel$/)
  if (c && req.method === 'POST') {
    const v = await checkSigned(c[1], { action: 'cancel', id: c[2] }, await body(req))
    if (!v.ok) return json({ error: v.why }, v.status)
    const r = guard.engine.cancel(c[1], c[2])
    return r.ok ? json({ ok: true }) : json({ error: r.why }, 409)
  }
  const m = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})$/)
  if (!m) return null
  const address = m[1].toLowerCase()
  if (req.method === 'GET') return json({ rules: guard.engine.list(address) })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // { rule, nonce, exp, sig } from the app. a bare rule is only accepted with ALLOW_UNSIGNED_RULES=1 (local dev)
  const b = await body(req)
  const parsed = Rule.safeParse('rule' in b ? b.rule : b)
  if (!parsed.success) return json({ error: 'that rule does not make sense', detail: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, 400)
  const rule = parsed.data
  const v = await checkSigned(m[1], { action: 'create', rule, symbol: guard.symbolOf(rule.mkt) }, b)
  if (!v.ok) return json({ error: v.why }, v.status)
  if (guard.engine.exists(rule.id)) return json({ error: 'a rule with that id exists' }, 409)
  const check = rule.kind === 'entry' ? validateEntry(rule, guard.entryLive(address, rule.mkt)) : validate(rule, guard.live(address, rule.pid, rule.mkt))
  if (!check.ok) return json({ error: check.why }, 422)
  const signed = typeof b.sig === 'string'
  const s = guard.engine.add(address, rule, signed ? 'app' : 'dev', 'armed', signed ? b.sig as string : null)
  return json({ rule: { id: s.id, state: s.state, mode: s.mode } }, 201)
}

async function body(req: Request): Promise<Signed & { rule?: unknown } & Record<string, unknown>> {
  const b = await req.json().catch(() => ({}))
  return b && typeof b === 'object' ? b as Record<string, unknown> : {}
}
