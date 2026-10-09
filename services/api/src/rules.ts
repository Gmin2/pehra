// the rule routes. every write is signed by the account (signedRules.ts). a rule is checked twice before
// it is stored: its shape by the schema, then its facts against the live position (stop under the mark,
// trigger budget)
import { Rule, validate, validateEntry, validateWhen, validateCopy, triggersOf, TRIGGER_BUDGET } from '@pehra/perpl'
import type { Guard } from './guard'
import { checkSigned, type Signed } from './signedRules'
import { proof } from './proof'
import { verify } from './runs'
import { owns } from './sessions'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function rulesRoute(req: Request, url: URL, guard: Guard): Promise<Response | null> {
  if (url.pathname === '/proof/verify') return json(verify())
  if (url.pathname === '/proof') return json(proof(null))
  const own = url.pathname.match(/^\/proof\/(0x[0-9a-fA-F]{40})$/)
  if (own) return json(proof(own[1], { full: owns(req, own[1]) }))
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
  // a recipe: several rules on one signature. each is checked like a single rule, then the perpl orders of
  // the whole bundle against the budget, then all are stored together
  const mm = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})\/many$/)
  if (mm && req.method === 'POST') {
    const address = mm[1].toLowerCase()
    const b = await body(req)
    const list = Array.isArray(b.rules) ? b.rules.map(x => Rule.safeParse(x)) : []
    if (!list.length || list.length > 6 || list.some(x => !x.success)) return json({ error: 'that recipe does not make sense' }, 400)
    const rules = list.map(x => (x as { data: Rule }).data)
    const name = typeof b.name === 'string' ? b.name.slice(0, 40) : ''
    if (!name) return json({ error: 'a recipe needs a name' }, 400)
    const v = await checkSigned(mm[1], { action: 'createMany', name, rules, symbol: guard.symbolOf(rules[0].mkt) }, b)
    if (!v.ok) return json({ error: v.why }, v.status)
    const ids = new Set<string>()
    for (const r of rules) {
      if (ids.has(r.id) || guard.engine.exists(r.id)) return json({ error: `a rule with id ${r.id} exists` }, 409)
      ids.add(r.id)
    }
    const active = new Set([...guard.engine.list(address).filter(r => ['armed', 'held', 'paused', 'firing', 'working'].includes(r.state)).map(r => r.id), ...ids])
    let resting = 0, need = 0
    for (const r of rules) {
      const live = guard.live(address, r.pid, r.mkt)
      resting = Math.max(resting, live?.resting ?? 0)
      need += triggersOf(r)
      const check = r.kind === 'copy' ? validateCopy(r, address, guard.entryLive(address, r.mkt))
        : r.kind === 'entry' ? validateEntry(r, guard.entryLive(address, r.mkt))
        : r.kind === 'when' ? validateWhen(r, live, guard.entryLive(address, r.mkt)?.mark)
        : validate(r, live)
      if (!check.ok) return json({ error: check.why, rule: r.id }, 422)
      const refs = r.kind === 'when' ? [('rule' in r.on ? r.on.rule : null), ...r.then.map(a => ('rule' in a ? a.rule : null))] : r.kind === 'stop' && r.breakeven ? [r.breakeven.ladder] : []
      const missing = refs.filter((x): x is string => !!x && !active.has(x))
      if (missing.length) return json({ error: `no active rule ${missing[0]} on this account` }, 422)
    }
    if (resting + need > TRIGGER_BUDGET) return json({ error: `this recipe needs ${need} perpl orders, ${resting} of ${TRIGGER_BUDGET} are in use` }, 422)
    const made = guard.engine.addMany(address, rules, 'app', typeof b.sig === 'string' ? b.sig : null)
    return json({ rules: made.map(s => ({ id: s.id, state: s.state, mode: s.mode })) }, 201)
  }
  const m = url.pathname.match(/^\/rules\/(0x[0-9a-fA-F]{40})$/)
  if (!m) return null
  const address = m[1].toLowerCase()
  // a hidden stop stays hidden: anyone but the owner sees what kind of rule runs, not its prices
  if (req.method === 'GET') {
    const all = guard.engine.list(address)
    return json({ rules: owns(req, address) ? all : all.map(r => ({ id: r.id, kind: r.kind, state: r.state, mode: r.mode, fires: r.fires, lastRun: r.lastRun, created: r.created })) })
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // { rule, nonce, exp, sig } from the app. a bare rule is only accepted with ALLOW_UNSIGNED_RULES=1 (local dev)
  const b = await body(req)
  const parsed = Rule.safeParse('rule' in b ? b.rule : b)
  if (!parsed.success) return json({ error: 'that rule does not make sense', detail: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, 400)
  const rule = parsed.data
  const v = await checkSigned(m[1], { action: 'create', rule, symbol: guard.symbolOf(rule.mkt) }, b)
  if (!v.ok) return json({ error: v.why }, v.status)
  if (guard.engine.exists(rule.id)) return json({ error: 'a rule with that id exists' }, 409)
  // a chain or a breakeven may only point at this account's own rules
  const refs = rule.kind === 'when'
    ? [('rule' in rule.on ? rule.on.rule : null), ...rule.then.map(a => ('rule' in a ? a.rule : null))]
    : rule.kind === 'stop' && rule.breakeven ? [rule.breakeven.ladder] : []
  const mine = new Set(guard.engine.list(address).filter(r => ['armed', 'held', 'paused', 'firing', 'working'].includes(r.state)).map(r => r.id))
  const missing = refs.filter((x): x is string => !!x && !mine.has(x))
  if (missing.length) return json({ error: `no active rule ${missing[0]} on this account` }, 422)
  const check = rule.kind === 'copy' ? validateCopy(rule, address, guard.entryLive(address, rule.mkt))
    : rule.kind === 'entry' ? validateEntry(rule, guard.entryLive(address, rule.mkt))
    : rule.kind === 'when' ? validateWhen(rule, guard.live(address, rule.pid, rule.mkt), guard.entryLive(address, rule.mkt)?.mark)
    : validate(rule, guard.live(address, rule.pid, rule.mkt))
  if (!check.ok) return json({ error: check.why }, 422)
  const signed = typeof b.sig === 'string'
  const s = guard.engine.add(address, rule, signed ? 'app' : 'dev', 'armed', signed ? b.sig as string : null)
  return json({ rule: { id: s.id, state: s.state, mode: s.mode } }, 201)
}

async function body(req: Request): Promise<Signed & { rule?: unknown } & Record<string, unknown>> {
  const b = await req.json().catch(() => ({}))
  return b && typeof b === 'object' ? b as Record<string, unknown> : {}
}
