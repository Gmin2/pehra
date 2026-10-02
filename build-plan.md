# pehra build plan, oct 2 to oct 12

the app is the product. deep on perpl, nothing built as a service. this file is the step by step: every slice, the files it touches, the shapes, the perpl frames, how it is proven, and what to do if it fails. the why behind each choice is in `automation-design.md`, `research/perpl-api-deep.md` and `research/automation-engine-best-practices.md`.

## changed by day 1 ground truth (oct 2, STATUS.md "automation ground truth")

- the api runs on node through tsx (`pnpm start`), not bun. store is `node:sqlite`, tests in services/api use `node --test`
- trigger budget is **14** per account (perpl refuses the 16th, sr 24, one kept free), not 16
- trigger cancel works when it carries `tp`, `tpc`, `lp` (g1), so ladder edits and backstop moves are cancel then place
- perpl shrinks a resting linked trigger itself when its position shrinks (g5b, sr 31). the engine still checks `os` against the live size after every fill and never places a trigger above the live size (an oversized one fails forever, g5)
- floors on triggers work: `p` is an ioc limit at fire time (g3)
- escape hatch: the owner's `execOrders` direct close works with forwarding on (g9, about 310k gas, budget 1.5x the estimate)
- forwarding off pauses perpl held triggers, they come back on (g8). revoke copy has to say the backstops pause too
- a timeout is unknown: an order sent just before its socket died still landed (g13b), signed rest (`restOrders`, `restPositions`, `restWallet`) settles it

## the loop, every slice

1. **ground truth** if the slice touches data we have not seen: a spike prints the raw frames, types are written from what came back
2. **crude version** end to end, the least code that works
3. **run it for real**, at the layer it touches (table below), read the output
4. **harden one rung**, run it again. never two unproven changes stacked
5. after any swap underneath (memory to sqlite, local to hosted), **re-run the whole flow**, not just the slice

| layer | how it is proven |
|---|---|
| pure function | `bun test` in packages/perpl |
| server route | `curl -s localhost:8787/... \| jq` |
| perpl order | the frame in perpl's own order stream (mt 24) printed to api.log, then the tx on monadscan |
| sqlite | `sqlite3 services/api/data/pehra.db "select ..."` |
| envio | `curl -s localhost:8080/v1/graphql -d '{"query":"..."}' \| jq` |
| phone | the screen on the A069 plus the matching line in tmp/claude/api.log. never tap while the user is on the phone |
| push | the notification on the phone, plus `push sent` in api.log |

accounts: dev account on the phone (perpl #679), emulator account (#694). every order uses the smallest size perpl accepts on testnet MON. keys never printed.

## what exists today (read from the code, oct 2)

- `services/api/src/guard.ts`: class `Guard`. one `TradingSocket` per enrolled account, one shared `MarketDataSocket`. `evaluate(addr)` runs on mt 9 (market state) and mt 26/27 (positions), calls `decide()` from packages/perpl, then `act()` adds margin. events in memory plus `data/guard-events.json`, keys in `data/guard-keys.json`, both written with `writeFileSync` in place. `nextTx()` reads the txid from mt 21. `setBrackets` places stop and take profit once (cancel never worked). `closeAll` closes through the session.
- `packages/perpl/src/trading.ts`: `TradingSocket`. rq seeded from `lfr` at the wallet snapshot only. ping every 30s. `stopLoss` and `takeProfit` send `p: 0` with no `ms`. `cancel` sends only `oid`. margin add already ignores the echoed failed order frame and settles on the position update (good, keep it).
- `packages/perpl/src/guard.ts`: pure `decide()`, `positionHealth()`, `liquidationPrice()`. tests in `packages/perpl/test/`.
- app: `apps/mobile/app/{position,activity,settings,key,trade,fund}.tsx`, guard client `apps/mobile/src/guard.ts`, push `apps/mobile/src/push.ts` (one channel `guard`).
- indexer: envio, entities `Account` and `Activity`, 9 exchange events.

---

# day 1, oct 2: foundations and ground truth

## 1.1 atomic json writes

**why:** `guard-keys.json` is written in place. a crash mid write leaves a truncated file and the server cannot boot.

- new `services/api/src/files.ts`:
  ```ts
  import { renameSync, writeFileSync } from 'node:fs'
  export function writeAtomic(url: URL, data: string) {
    const tmp = new URL(url.href + '.tmp')
    writeFileSync(tmp, data)
    renameSync(tmp, url)
  }
  ```
- replace the three `writeFileSync(KEYS|EVENTS|tokens)` calls in guard.ts and push.ts
- **prove:** restart the api, `jq length services/api/data/guard-keys.json` same as before, guard log shows `guard watching N accounts`

## 1.2 sqlite

- new `services/api/src/db.ts`, `bun:sqlite`, file `services/api/data/pehra.db`
  ```ts
  import { Database } from 'bun:sqlite'
  export const db = new Database(new URL('../data/pehra.db', import.meta.url).pathname, { create: true })
  db.exec('pragma journal_mode = wal; pragma synchronous = full; pragma foreign_keys = on')
  db.exec(`
    create table if not exists rules (id text primary key, owner text not null, kind text not null, body text not null,
      state text not null, mode text not null, by text not null, sig text, created integer not null, updated integer not null,
      fires integer not null default 0, mem text not null default '{}');
    create index if not exists rules_owner on rules(owner);
    create table if not exists intents (id text primary key, rule text not null, kind text not null, pid integer, size real,
      floor real, rq integer, oid integer, state text not null, fill real, tx text, at integer not null, stamps text not null default '{}');
    create table if not exists orders (rule text not null, step text not null, oid integer, pid integer, size real, px real,
      tp integer, tpc integer, state text not null, primary key (rule, step));
    create table if not exists runs (seq integer primary key autoincrement, at integer not null, owner text, rule text,
      kind text not null, body text not null, prev text not null, hash text not null);
    create table if not exists ticks (mkt integer not null, block integer not null, at integer not null, mark real, last real,
      bid real, ask real, primary key (mkt, block));
    create table if not exists books (mkt integer not null, at integer not null, bids text not null, asks text not null);
  `)
  ```
- **prove:** `bun run src/index.ts`, then `sqlite3 services/api/data/pehra.db ".tables"` lists six tables
- `data/` is already gitignored, check `pehra.db*` is covered

## 1.3 trading client fixes (packages/perpl/src/trading.ts)

one at a time, `bun test` after each:

1. **rq never goes backwards.** in `handle()`, on mt 24 set `this.rq = Math.max(this.rq, o.rq)` for every order seen, and on mt 21 `Math.max(this.rq, a.lfr ?? 0)`. test: feed a wallet snapshot with `lfr: 10`, then an order frame with `rq: 40`, the next `send` uses 41
2. **trigger cancel with its fields.** `cancel(order)` sends `{ t: 5, oid, p: 0, s: 0, fl: Flag.ioc, lv: 0, lp: order.lp, tp: order.tp, tpc: order.tpc }`. test: frame shape
3. **floors on triggers.** `stopLoss(pos, px, { floorWire?, msBps?, size? })` and the same for `takeProfit`: `p: floorWire ?? 0`, `ms: floorWire ? undefined : (msBps ?? 100)`, `s: size ?? pos.s`. test: three frame shapes
4. **ping interval** stays 30s until spike 10 says otherwise
5. **typecheck:** `bun run typecheck` in packages/perpl and services/api

## 1.4 ground truth spikes

each is `spikes/g<n>-<name>.ts`, run with `bun run spikes/g1-cancel.ts`, prints every frame it sends and receives, uses the dev key from services/api/.env through the same loader the other spikes use. answers go into STATUS.md under `## automation ground truth (oct 2)`.

| spike | sends | look for | decides |
|---|---|---|---|
| **g1 cancel** | tiny mon long, then a stop `{ t: 3, p: 0, s, fl: 4, lv: 0, lp: pid, tp: 0.9 x mark, tpc: 4 }`, read its oid from mt 24, then the fixed cancel | `st 5` canceled, not `sr 33` | backstop resize, ladder edits |
| **g5 oversized** | ladder rung `s: half` at a near tp, backstop `s: full` far away. move the tp next to mark so it fires | after the rung fills, does the backstop sit with `s: full` and later fail `CloseOrderExceedsPosition`, or does perpl shrink it | resize after every fill (planned anyway) |
| **g3 floor** | trigger `{ p: floor, tp just under mark }` and a twin `{ p: 0, ms: 20 }` | when they fire: is `p` used as a limit, is `ms` honoured, read `fp` and the onchain price | backstop floor, ladder floors |
| **g9 direct close** | from the dev key, no api: `execOrders([{ orderType: 2 (close long), perpId, lotLNS, pricePNS: mark x 0.95, immediateOrCancel: true, leverageHdths: 100, maxNegPnlCollatBPS: 1000, orderDescId: Date.now() }], false)`, gas 400k | tx succeeds, mt 27 on the api session shows the close, triggers on that pid die | escape hatch works |
| **g10 ping** | sign in, log every server ping and close code for 5 minutes with pings every 30s, then 10s, then 3s | which interval stops the minute drops | client ping interval |

then, same day if time, else day 2: **g8** forwarding off and on with a resting trigger (does it survive), **g13** signed rest `GET /v1/trading/orders` and `/positions` right after killing the socket (reconcile source), **g6** the 17th trigger refusal reason.

**if g1 fails:** triggers cannot be cancelled. the backstop is placed last at the full size and only cancelled by the position closing, the ladder becomes fixed once placed, and ladder edits mean "close the position and redo". say so in the rule screen.
**if g3 fails:** the backstop is a plain market trigger with `ms`, floors only apply to exits pehra runs.
**if g9 fails:** the escape hatch becomes revoke plus close through a fresh direct session from the phone, written honestly.

**day 1 done when:** atomic writes live, sqlite tables exist, trading tests green, g1 g5 g3 g9 g10 answered in STATUS.md.

---

# day 2, oct 3: the tracer bullet and receipts

## 2.1 the rule schema (packages/perpl/src/rule.ts)

add `zod` to packages/perpl. shapes from the design, plus the two new fields from the plan: `for` (condition must last) and `by`.

```ts
import { z } from 'zod/v4'
const price = z.number().positive()
const pct = z.number().gt(0).lte(100)
const base = {
  v: z.literal(1), id: z.string(), pid: z.number().int(), mkt: z.number().int(),
  floorBps: z.number().int().min(0).max(1000).default(100),
  forMs: z.number().int().min(0).max(24 * 3600_000).default(0),   // condition must hold this long
  expires: z.number().int().optional(),
}
export const Rule = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('ping'), above: price }),                     // tracer bullet only
  z.object({ ...base, kind: z.literal('guard'), threshold: pct, target: pct, maxAddDay: z.number().positive() }),
  z.object({ ...base, kind: z.literal('stop'), px: price, floor: price, backstopPx: price, slices: z.number().int().min(1).max(8).default(4) }),
  z.object({ ...base, kind: z.literal('ladder'), steps: z.array(z.object({ px: price, share: pct, floor: price })).min(1).max(6) }),
])
export type Rule = z.infer<typeof Rule>
export type RuleState = 'draft' | 'armed' | 'firing' | 'working' | 'held' | 'done' | 'failed' | 'paused'
```

- `validate(rule, view)` checks live facts: stop below mark for a long and above for a short, floor past the stop, backstop past the floor, steps above entry for a long, trigger count. returns `{ ok: true } | { ok: false, why: string }` in plain words
- **prove:** `bun test test/rule.test.ts`, 10 cases (valid stop, stop above mark on a long, floor wrong side, 7 steps, missing expiry on an ai rule later)

## 2.2 step(): the one decision function (packages/perpl/src/step.ts)

```ts
export type Tick = { at: number; block: number; mkt: number; mark: number; last: number }
export type View = { pos: { pid: number; side: 'long' | 'short'; size: number; entry: number; collateral: number } | null;
                     distance: number; balance: number; addedToday: number }
export type Mem = { since?: number; fired?: number; left?: number }
export type Intent =
  | { kind: 'close'; pid: number; size: number; floor: number }
  | { kind: 'add'; pid: number; ausd: number }
  | { kind: 'place'; pid: number; step: string; size: number; tp: number; floor: number }
  | { kind: 'cancel'; step: string }
  | { kind: 'note'; text: string }
export function step(rule: Rule, mem: Mem, tick: Tick, view: View): { mem: Mem; intents: Intent[] }
```

- no io, no `Date.now()`, time comes from `tick.at`
- **conditions that last** live here: when the condition first becomes true set `mem.since = tick.at`, act only when `tick.at - mem.since >= rule.forMs`, clear `since` when it turns false. tests: a wick that crosses for 800ms with `forMs: 2000` fires nothing, a cross that holds fires once
- tracer bullet kind `ping`: when `tick.mark > rule.above` and not fired, intent `note`
- **prove:** `bun test test/step.test.ts`

## 2.3 the engine, crude (services/api/src/engine.ts)

- `class Engine`, created by `Guard`, given the guard's market socket and sessions map
- `load()`: `select * from rules where state in ('armed','firing','working','held')`, parse with `Rule.parse`
- `tick(mkt)`: called from the guard's existing `this.market.on(f => f.mt === 9 ...)`. for each rule on that mkt, build `Tick` from `market.states.get(mkt)` and `View` from the owner's session, call `step`, save `mem`, hand intents to `run()`
- `run(rule, intents)`: crude first, only `note` is handled: write a `runs` row and log `rule <id> note <text>`
- runs row writer `services/api/src/runs.ts`:
  ```ts
  export function writeRun(r: { owner: string; rule?: string; kind: string; body: object }) {
    const prev = db.query('select hash from runs order by seq desc limit 1').get() as { hash: string } | null
    const at = Date.now(), body = JSON.stringify(r.body)
    const hash = new Bun.CryptoHasher('sha256').update((prev?.hash ?? '') + at + r.kind + body).digest('hex')
    db.query('insert into runs (at, owner, rule, kind, body, prev, hash) values (?,?,?,?,?,?,?)').run(at, r.owner, r.rule ?? null, r.kind, body, prev?.hash ?? '', hash)
  }
  ```
- routes in `services/api/src/routes/rules.ts`, mounted from index.ts: `POST /rules/:address` (body = rule json, unsigned for now), `GET /rules/:address`
- **prove (the tracer bullet):**
  1. `curl -s localhost:8787/chain/...` not needed. read the current mon mark: `curl -s localhost:8787/guard/0x<dev> | jq '.health'`
  2. `curl -s -X POST localhost:8787/rules/0x<dev> -H 'content-type: application/json' -d '{"v":1,"id":"t1","kind":"ping","pid":0,"mkt":<mon id>,"above":<mark minus a hair>}'`
  3. api.log shows `rule t1 note mark above ...` within a second
  4. `sqlite3 ... "select kind, rule, hash from runs order by seq desc limit 1"` shows it
  5. `curl -s localhost:8787/rules/0x<dev> | jq` shows `fires: 1`

## 2.4 state machine and intents

- `services/api/src/state.ts`: the allowed moves table and `move(rule, to, why)` from the design. every move runs inside `db.transaction(() => { update rules; writeRun({ kind: 'state', ... }) })`
- `intents`: before any send, insert `{ id: `${rule}:${n}`, state: 'sending' }` in the same transaction as the move to `firing`. after: `filled | rejected | unknown`. **unknown is never resent**
- `lane(addr, job)`: promise chain per account (design 3.4), all sends go through it
- **prove:** a ping rule goes `armed -> firing -> done` and `select from runs` shows three state rows with matching hashes chained

## 2.5 receipts and the proof screen data

- every run carries stamps: `t0` tick venue time and block, `t1` received, `t2` decided, `t3` sent, `t4` acked, `t5` filled, `t6` settled block (from `nextTx`)
- `beat` row every 60s: `{ evaluations, accounts, reconnects, lastTick }`
- `GET /proof/:address` (yours) and `GET /proof` (all, addresses cut to 0x1234…abcd): runs newest first, p50/p95/p99 of `t3-t1`, `t5-t3`, blocks `t6-t0`, uptime from beat gaps over 120s
- hourly anchor: one tx from the payer key to itself with `data = 0x + head hash`, logged as a `anchor` run with the tx
- **prove:** `curl -s localhost:8787/proof | jq '.uptime, .latency'`. stop bun for 3 minutes, start, `/proof` shows a downtime band. change one row's body by hand in sqlite, `GET /proof/verify` returns `broken at seq N`

## 2.6 start recording

- `ticks`: one row per market per block on mt 9 (insert or ignore)
- `books`: subscribe `order-book@<mkt>` for markets with open positions, store a snapshot every 10s
- **prove:** after 10 minutes `select count(*) from ticks` grows, `select count(*) from books` about 60 per market

**day 2 done when:** a ping rule runs end to end with stamps and a chained receipt, `/proof` answers, recording runs, and the api has been up since this morning.

---

# day 3, oct 4: the guard as a rule, reconcile, the crash test

## 3.1 move the guard into the engine

- rule kind `guard`, one per account, created on enroll from the existing `GuardSettings` (threshold, target, maxAddDay)
- `step` for guard: wraps the existing pure `decide()`, emits `add` intent. the old `Guard.evaluate` stops acting and only keeps `health()` for the app
- `run()` handles `add`: on the lane, `ts.addMargin(pos, toCns(ausd))`, stamps, `nextTx`, then the same `added` event the app already reads (keeps activity and push working)
- **never retry a margin add.** a timeout goes `unknown`, reconcile reads collateral on the next mt 27
- **prove:** force the threshold near the dev position's distance (the trick from the first rescue: threshold 20, target 25), one margin add on monadscan, one `added` event, one push, `runs` shows `firing -> working -> done -> armed`. restore threshold 5, target 10

## 3.2 reconcile (services/api/src/reconcile.ts)

- when: on boot before arming, after every session sign in, every 30s
- inputs: the session's `positions` and `orders` maps after the snapshot, plus signed rest from g13 if the socket is down
- rules:
  - intent `unknown` close: position size dropped by about the intent size, `filled`. unchanged and no resting order, `rejected` (safe to retry). a resting order with our size, adopt its oid
  - intent `unknown` add: collateral rose by about the amount, `filled`, else `rejected`
  - rule on a pid that no longer exists: `done`, why `position closed elsewhere`
  - perpl trigger on the account we do not know: adopt as external, count it toward 16
- **stale guard:** while a session is reconnecting its rules evaluate but do not act, run written as `deferred: session reconnecting`
- **prove:** kill the trading socket by hand (`ts.close()` from a debug route `POST /debug/drop/:address`, dev only), rules defer, sign in again, reconcile runs, nothing double sent

## 3.3 the crash test

- env `DEBUG_CRASH_AT=firing|sent` makes `run()` call `process.exit(1)` at that point
- **prove:** set a guard rule to fire, crash at `sent`, restart, reconcile turns the `unknown` add into `filled` from the collateral, no second add on monadscan. this is a demo and readme item, record the terminal

## 3.4 hidden stop, crude

- rule kind `stop` with `px`, `floor`, `backstopPx`, `slices`
- `step`: long and `mark <= px` held for `forMs` (default 0), emits one `close` intent for the whole live size with `floor`
- `run()` close: `ts.send({ mkt, t: closeLong, p: floorWire, s, fl: Flag.ioc, lv: 0, lp: pid })`. floor as the limit price means it can never fill below the floor (ioc at a limit)
- **prove:** tiny mon long, stop a hair under mark, floor 2% below. api.log shows the close, `fp >= floor`, monadscan tx, rule `done`

**day 3 done when:** the guard runs only through the engine with no behaviour change for the user, reconcile and the crash test pass, a crude hidden stop closes a real position at or above its floor.

---

# day 4, oct 5: slices, the backstop, the kill test

## 4.1 slices into the book (packages/perpl/src/slice.ts)

```ts
export function nextSlice(a: { left: number; floor: number; side: 'long' | 'short'; bids: [number, number][]; asks: [number, number][]; maxShare: number; minSize: number }) {
  const book = a.side === 'long' ? a.bids : a.asks
  const ok = book.filter(([p]) => a.side === 'long' ? p >= a.floor : p <= a.floor)
  const depth = ok.reduce((s, [, q]) => s + q, 0)
  if (depth < a.minSize) return { size: 0, why: 'book past the floor' as const }
  return { size: Math.min(a.left, Math.max(a.minSize, depth * a.maxShare)), why: 'ok' as const }
}
```

- start `maxShare` 0.5, at most `rule.slices` slices, one per block. before each: re-read book and live position, parent check `filled + inflight + next <= live size`
- **prove:** `bun test test/slice.test.ts` on recorded books from the `books` table (empty, all under the floor, refilling), then testnet: api.log shows each slice and each `fp >= floor`

## 4.2 held at the floor

- book past the floor: rule `held`, one push "stopped at your floor, 0.6 mon left open", re-check every tick, resume when the book is back and mark is still past `px`
- **prove:** set a floor above the best bid on testnet, rule goes `held`, one push, not ten

## 4.3 the backstop

- on stop create: place one perpl trigger close `{ t: closeLong, p: backstopFloor, s: live size, fl: ioc, lv: 0, lp: pid, tp: backstopPx, tpc: Trigger.lteMark }`, row in `orders` with step `backstop`
- after every slice fill: resize the backstop to what is left (cancel with its fields, place new, both on the lane). size 0 means the position closed and the trigger dies with it via `lp`
- rule card mode `both` (run by pehra, backstop held by perpl)
- **prove:** mt 24 shows the backstop resting after create, after one slice it shows the new size, after the last slice it is gone

## 4.4 the kill test (the demo beat)

1. tiny mon long, hidden stop at mark minus 0.3%, backstop at mark minus 0.6%
2. `kill` the api process
3. wait for the mark to cross the backstop (or set it a hair under mark before killing)
4. monadscan shows perpl filled the trigger with pehra down
5. start the api. reconcile sees the position gone and the backstop oid filled, writes `backstop fired while pehra was down`, rule `done`
6. the app's activity shows that line with the tx
- record the screen and terminal for the video

## 4.5 rules persisted, then re-run everything

the engine already reads from sqlite, so the swap is the restart: restart the api mid rule, re-run 3.1, 3.4, 4.1, 4.3 for real.

**day 4 done when:** slices, held, backstop resize and the kill test all pass on testnet, recorded.

---

# day 5, oct 6: escape hatch and take profit ladder

## 5.1 escape hatch (apps/mobile/src/escape.ts)

1. best effort signed `POST /rules/:address/pause` with a 2s timeout, failure ignored
2. read positions from chain: `getPerplAccount` (exists in onchain.ts) and `getPositionV2` per market (add to the exchange abi from g9's findings)
3. one `sendBatch` from the passkey session: `allowOrderForwarding(false)` then `execOrders([...closes], false)`, one ioc close per position at mark x 0.95 (long) or x 1.05 (short), mark from the warm market socket
4. `ensureGas` first, about 260k gas per close
5. re-read positions, show what is left
- server side: sign in failing after forwarding is off is treated like `revoke()`, no reconnect storm. reconcile moves every rule to `done`, why `closed by you onchain`
- phone states `idle -> pausing -> closing -> confirmed | partial | failed`
- **prove:** first as a spike with the api killed, then on the phone with the user present, then `restoreGuard` to turn forwarding back on

## 5.2 take profit ladder

- `place` intents for each step, sent as one batch through signed `POST /trading/orders` if g13 showed it works, else one by one on the lane
- refuse at create when `resting + steps + 1 backstop + 1 spare > 16`: "this needs 4 perpl orders, you have 13 of 16 in use"
- reconcile diffs `orders` rows against resting orders: missing and unfilled re-place, ours but not intended cancel, filled mark done. after any fill, every remaining trigger on the pid is resized to fit
- **prove:** 3 step ladder, all three in mt 24. hand close a third from the app, reconcile resizes the rest, mt 24 shows the new sizes. ask for a 17th, read the refusal

**day 5 done when:** the escape hatch closes everything with the server off, ladders place, resize and refuse correctly.

---

# day 6, oct 7: learns how you trade, tell pehra

## 6.1 learns how you trade (packages/perpl/src/profile.ts)

- input: the account's activity from envio (`Activity` rows: open, close, liquidated, margin) plus open positions
- output:
  ```ts
  export type Profile = { trades: number; avgLeverage: number; avgHoldHours: number; overnight: number; liquidations: number;
                          worstDrawdownPct: number; markets: string[]; label: string; suggest: Rule[] }
  ```
- labels from plain rules, no ml: `liquidations > 0 && avgLeverage >= 3` gives "high leverage, liquidated before". `overnight / trades > 0.5` gives "holds overnight". and so on, 5 labels
- suggestions: a hidden stop and backstop for every open position without one, a guard if none, a ladder for positions already in profit. each suggestion carries its replay result once 8.1 lands, until then the plain reason
- `GET /profile/:address`
- **prove:** `bun test` with a hand built history, then `curl /profile/0x<dev>` against real envio data, read it by eye against the activity screen

## 6.2 tell pehra (ai inside the app)

- needs `ANTHROPIC_API_KEY` in services/api/.env (the user adds it, never printed)
- `POST /tell/:address` with `{ text }`. the server sends the user's words, their open positions (symbol, side, size, entry, mark, liq) and the rule json schema (`z.toJSONSchema(Rule)` minus `ping`) to claude (current haiku model) with structured output. reply is `{ rule } | { question }`
- the server then runs `Rule.safeParse` and `validate(rule, view)`. if either fails, it returns the plain reason, never a half rule
- ai rules are saved as `draft`, `by: 'ai'`, with a required `expires` (default 24h). they can only be `guard`, `stop`, `ladder` (no opens, the schema has none)
- arming a draft needs the signed write from 7.1, which the phone only makes after a fingerprint
- **prove:** curl "keep my mon long safe overnight", get a stop + backstop draft. curl "buy 100 mon", get a question back ("pehra can protect positions, it cant open them"). curl with an injection string in the text, the rule is still only one of the three kinds and the text is never echoed into anything that runs

**day 6 done when:** profile answers on real data, tell pehra returns valid drafts and refuses what it cannot do.

---

# day 7, oct 8: alerts, signed writes, replay or the growth link

## 7.1 signed rule writes

- every `POST /rules...` write carries `{ rule, nonce, exp, sig }`. message is readable:
  ```
  pehra rule for 0xabc...
  hidden stop on mon long at 2.31, never below 2.20, backstop 2.10
  id r_9f2 v1
  nonce 6f1c
  expires 2026-10-08T12:00:00Z
  ```
- verified with `verifyMessage` like `/guard/revoke`, nonces kept until expiry, older than 5 minutes rejected
- phone: `apps/mobile/src/rules.ts` builds the message, signs with `session.account.signMessage`, posts
- **prove:** curl with a good signature 200, a stranger's 401, a replayed nonce 409

## 7.2 alerts with live values and the lock screen button

- `services/api/src/alerts.ts`: kinds `near_liq`, `fired`, `filled`, `held`, `funding_flip`, `liquidated`, `depeg`. separate set and clear levels (near liq sets at 10%, clears at 14%), one push per band, dedupe key `kind:pid:band`, repeat at most every 4h, quiet hours from settings, muted while the engine's own beat is stale
- text filled from live values: "your mon long is 9% from liquidation (2.18)"
- android: new channels `fills` and `digest` in apps/mobile/src/push.ts (the `guard` channel cannot change importance)
- lock screen action: data only fcm with an action `add5`. the existing response listener calls `relayAddMargin(address, pid, 5)`. close is never a lock screen action
- **prove:** drive near liq on testnet, exactly one push, tap add 5 from the lock screen with the user present, margin lands, one `manual` event

## 7.3 replay (if on track) (packages/perpl/src/replay.ts)

- `replay(candles, book, position, rule) -> Report`, pure, calls `step`
- candles from perpl rest, 1m, 1024 per call, 30 days is about 43 calls, cached in a `candles` table
- each candle becomes ticks `o, l, h, c` for a long (`o, h, l, c` short), a gap past a trigger fills at the open, closes priced by walking the latest stored book scaled to the candle price, plus the close fee
- report: fires, pnl with and without, liquidations with and without, worst slip, ambiguous bars, fees, `assumptions` lines ("trade prices, not mark", "book from oct 4", "no funding")
- `GET /replay?address&rule=<json>`
- **prove:** a hand built crash series checked by hand, a test that appending future candles never changes past fires, one real 30 day mon run saved to tmp/claude

## 7.4 growth link (if on track, else day 8)

- expo linking: `pehra://guard?address=0x..&pid=..` and `https://<site>/guard?...` (android app links through the existing assetlinks host)
- opens the position screen with a suggested stop + backstop ready to arm. no app: the site page shows the apk download and the same address's risk read from `GET /watch/:address`
- **prove:** `adb shell am start -a android.intent.action.VIEW -d "pehra://guard?address=0x..&pid=.."` opens the right screen

---

# day 8, oct 9: rules screens, samples first

samples as pngs for the user to pick, then build. screens:

1. **rules list** (in position.tsx and a rules section on home): one card per rule, chip `run by pehra` / `held by perpl` / `both`, state, last ran with a tx link, pause
2. **rule builder**: a sentence of chips ("if mon drops to [2.31], sell in [4] slices, never below [2.20], backstop at [2.10]"), replay result under it when 7.3 exists, one fingerprint to arm
3. **tell pehra**: a text box on the position screen, the draft shown as the same chips, arm with a fingerprint
4. **profile card**: "how you trade" with the label and suggestions, on home after first sign in
5. **escape hatch**: in settings, a hold to close button like the existing HoldButton, with the states
6. **proof screen**: from activity, uptime, latency percentiles, your runs with receipts, verify

rules: skeleton rows on every list, light paper only, calm motion (withTiming, no springs on lists), violet glyph icons, lowercase copy, real coin logos.

---

# day 9, oct 10: screens on the phone

- build the picked samples one screen at a time, each run on the A069 with api.log open
- every action from a screen shows up as a run in `/proof/:address` and in activity

---

# days 10 to 11, oct 11 to 12: ship

1. host the api and envio (one box, docker for envio's postgres and hasura, bun for the api), env copied by hand, keys never committed
2. point the app's API base at the host, build the release apk
3. **full re-run on the hosted stack, not just the last slice:** passkey in, fund, open a tiny mon long, profile suggests a stop, tell pehra drafts one, arm with a fingerprint, kill the hosted api, backstop fires on perpl, restart, reconcile explains it, revoke, perpl refuses the key, escape hatch on a second position, proof screen shows every run
4. readme with the trust diagram, the 60 second video, the portal

---

## every day, alongside

- testers: aim for 10 to 20, each run lands on the proof screen
- book mentor 1:1s with pbj or tom (perpl: trigger cancel, oversized triggers, the minute drops) and haythem (mera)
- one portal update

## cut order if late

1. growth link
2. replay
3. alerts beyond near liq and fired
4. tell pehra

never cut: atomic writes and sqlite, reconcile and the crash test, hidden stop + backstop + kill test, floors, escape hatch, receipts and the proof screen, testers.
