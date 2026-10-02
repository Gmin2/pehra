// the rule routes. a rule is checked twice before it is stored: its shape by the schema, then its facts
// against the live position (stop under the mark, trigger budget). writes are unsigned until the signed
// rule writes slice (build-plan 7.1), so for now they only arrive from this machine
import { Rule, validate } from '@pehra/perpl'
import type { Guard } from './guard'
import { proof } from './proof'
import { verify } from './runs'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function rulesRoute(req: Request, url: URL, guard: Guard): Promise<Response | null> {
  if (url.pathname === '/proof/verify') return json(verify())
  if (url.pathname === '/proof') return json(proof(null))
  const own = url.pathname.match(/^\/proof\/(0x[0-9a-fA-F]{40})$/)
  if (own) return json(proof(own[1]))
  const pa = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})\/pause$/)
  if (pa && req.method === 'POST') return json({ paused: guard.engine.pauseAll(pa[1], 'paused by the owner') })
  const c = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})\/([\w-]+)\/cancel$/)
  if (c && req.method === 'POST') {
    const r = guard.engine.cancel(c[1], c[2])
    return r.ok ? json({ ok: true }) : json({ error: r.why }, 409)
  }
  const m = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})$/)
  if (!m) return null
  const address = m[1].toLowerCase()
  if (req.method === 'GET') return json({ rules: guard.engine.list(address) })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const parsed = Rule.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: 'that rule does not make sense', detail: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, 400)
  const rule = parsed.data
  if (guard.engine.exists(rule.id)) return json({ error: 'a rule with that id exists' }, 409)
  const check = validate(rule, guard.live(address, rule.pid, rule.mkt))
  if (!check.ok) return json({ error: check.why }, 422)
  const s = guard.engine.add(address, rule, 'dev')
  return json({ rule: { id: s.id, state: s.state, mode: s.mode } }, 201)
}
