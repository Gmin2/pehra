# automation layer: technical design

oct 2 2026. pehra is the automation layer of monad, through perpl. this is what we build and exactly how, grounded in two research files:

- `research/perpl-api-deep.md`: how perpl actually behaves (frames, triggers, limits, errors, onchain functions), with 13 open questions that need a live spike
- `research/automation-engine-best-practices.md`: how keeper networks, exchange trigger engines and trading bots do this, plus their postmortems

it replaces the slice list in `automation-plan.md`. build method is still incremental: every piece below is built crude, run for real on testnet, then hardened one step at a time.

---

## 1. facts that shape the design

these came out of the research and change what we would otherwise build.

| fact | source | what it changes |
|---|---|---|
| a close bigger than the position is **rejected** (`CloseOrderExceedsPosition`), not clipped | perpl-api-deep s3, mainnet tx 0x07662cb2…1020 | every resting trigger must be resized after any partial fill, or the backstop dies once a ladder rung fills |
| triggers live in perpl's backend, not onchain. no onchain list or cancel | s2 | we must track trigger oids ourselves. the escape hatch cannot cancel triggers, it turns forwarding off instead |
| cancelling a trigger needs `t:5` plus the trigger's own `tp`, `tpc`, `lp`. we sent only `oid`, hence `OrderDoesNotExist` | s2, perpl web app bundle | ladder edits and backstop resizing are possible. spike 1 confirms |
| trigger with `p:0` fires as ioc market, with `p>0` fires as a limit at that price | s2 | the backstop can carry a price floor. spike 3 confirms |
| 16 triggers per **account across all markets** | s2 | one cap shared by every rule. keep 1 slot free for emergencies |
| trading socket: 60 requests a minute on testnet, 4 connections per wallet shared with the phone and web app | s4 | one session per account on the server, slices paced, ladder resizing batched through `POST /trading/orders` (1 to 100 orders) |
| a margin add (`t:6`) comes back `st 7 sr 32` (failed) even though the margin landed | s11, PerpGuard saw it 6 times | **never retry a margin add**. the current guard must be checked for this today |
| `rq` must be seeded from `lfr` and moved past every `rq` seen, `lfr` lags after reconnect | s4 | the trading client needs a fix before the engine sends more orders |
| the session drops about once a minute ("ping timeout") | s4 | stale state right after reconnect is the most likely real bug. rules defer until the login snapshot is reconciled. spike 10 finds the cause |
| owner can call `execOrders` directly while forwarding is on, about 260k gas per close | s8, eth_calls on 5 mainnet accounts | escape hatch needs no server and no api. copy perpl's own rescue flow |
| 1m trade candles go back at least 200 days, 1024 per request. **no mark price history** | s6 | replay runs on trade candles and says so. we start recording mark and book ourselves on day 1 |
| `mm 500` is 20% maintenance (5x), testnet MON max 3x | s9 | our 5x mon order was clamped. ui must cap leverage at `initial_margin` |
| fees are charged on closes too since sept 23 | s12 | every slice pays a fee. replay and the slicer count it |
| a timeout means unknown, not failed. resending a close double closes (hummingbot bug) | best-practices 2.5 | intents + reconcile, never resend an unknown |
| `guard-keys.json` is written in place, a crash mid write corrupts boot | best-practices 2.1 | atomic writes today, sqlite for the engine |

---

## 2. architecture

```
phone (passkey)        claude / cursor (mcp)            browser
    |  signed rule writes    |  mcp token (drafts only)     |  /proof
    v                        v                              v
  services/api (bun, :8787) --------------------------------------------
    rules api  ->  engine  ->  lanes (one send queue per account)  ->  perpl trading socket (1 per account)
                     ^   |                                              perpl rest (batch orders, signed reads)
     market ticks ---+   +--> intents + runs (sqlite)  --> proof views
     (mt 9 mark, book)        reconcile (boot, reconnect, every 30s)
                              alerts --> push (fcm channels)
  services/mcp (stdio)  ->  rules api only
  packages/perpl  ->  rule schema, step(), slice(), replay(), trading client
  indexer (envio)  ->  onchain trigger and fill events, joined to runs by tx
  apps/mobile/src/escape.ts  ->  execOrders directly onchain, no server
```

one rule: the decision logic (`step`) is pure and lives in `packages/perpl`, so live, replay, the app preview and the mcp server all use the same code.

### files

| file | what |
|---|---|
| `packages/perpl/src/rule.ts` | zod schema for rules, shared by server, app, mcp |
| `packages/perpl/src/step.ts` | pure `step(rule, mem, tick, view) -> { mem, intents }` |
| `packages/perpl/src/slice.ts` | pure `nextSlice(book, floor, left)` |
| `packages/perpl/src/replay.ts` | pure `replay(candles, book, position, rule) -> Report` |
| `packages/perpl/src/trading.ts` | fixed: rq seeding, trigger cancel with fields, ms on triggers, batch rest orders |
| `services/api/src/db.ts` | bun:sqlite, WAL, tables below |
| `services/api/src/engine.ts` | tick loop, state machine, intents, lanes |
| `services/api/src/reconcile.ts` | intents vs perpl truth |
| `services/api/src/proof.ts` | proof views, hash chain, hourly anchor |
| `services/api/src/alerts.ts` | dedupe, hysteresis, channels |
| `services/api/src/routes/rules.ts` | signed rules api |
| `services/mcp/` | mcp server, stdio |
| `apps/mobile/src/escape.ts` | direct onchain close all |
| `web/site/proof` | public proof page |

### storage

`services/api/data/pehra.db`, bun:sqlite, `journal_mode=WAL`, `synchronous=FULL`. json files stay for keys and push tokens but are written tmp file plus rename.

```sql
create table rules   (id text primary key, owner text, kind text, body text, state text, mode text,
                      by text, sig text, created integer, updated integer, fires integer default 0);
create table intents (id text primary key, rule text, kind text, pid integer, size real, floor real,
                      rq integer, oid integer, state text, fill real, tx text, at integer, stamps text);
create table orders  (rule text, step text, oid integer, size real, px real, state text, primary key (rule, step));
create table runs    (seq integer primary key, at integer, rule text, kind text, body text, prev text, hash text);
create table ticks   (mkt integer, block integer, at integer, mark real, last real, bid real, ask real);
create table books   (mkt integer, at integer, bids text, asks text);
```

`runs` is append only and hash chained. `ticks` and `books` are our own mark and depth history for replay (sampled, one row per block per market, books every 10s).

---

## 3. the shared core

### 3.1 trading client fixes (packages/perpl/src/trading.ts)

1. **request ids:** seed `rq` from `lfr` at login, and on every order frame set `next = max(next, seen + 1)`. unit test the sequencer.
2. **trigger cancel:** `cancel(order)` sends `t:5` with `oid`, `tp`, `tpc`, `lp`, `lb` copied from the stored order.
3. **floors:** `stopLoss` and `takeProfit` take `{ floor?, ms? }`. floor goes in `p` (fires as a limit), else `ms` caps slippage. today they send neither, so a trigger fills at any price.
4. **batch:** `placeMany(orders)` over signed `POST /trading/orders` for ladders and resizes, so one rule change is one request against the 60 a minute budget.
5. **margin add:** `addMargin` result `st 7 sr 32` is treated as "check collateral", never as failed. reconcile decides.
6. **ping:** whatever spike 10 shows. likely a client ping every few seconds.

### 3.2 rule schema (packages/perpl/src/rule.ts)

```ts
const base = { v: z.literal(1), id: z.string(), pid: z.number().int(), mkt: z.number().int(),
  floorBps: z.number().int().min(0).max(1000).default(100), expires: z.number().int().optional() }

export const Rule = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('guard'), threshold: pct, target: pct, maxAddDay: z.number().positive() }),
  z.object({ ...base, kind: z.literal('stop'), px: price, floor: price, backstopPx: price, slices: z.number().int().min(1).max(8).default(4) }),
  z.object({ ...base, kind: z.literal('ladder'), steps: z.array(z.object({ px: price, share: pct, floor: price })).min(1).max(6) }),
  z.object({ ...base, kind: z.literal('sleep'), from: z.number().int(), to: z.number().int(), add: pct, trim: pct, close: pct, trimShare: pct.default(25) }),
])
```

zod checks shape only. anything needing live state (stop below mark for a long, floor past trigger, trigger count under 16 with one spare) is in `validate(rule, view)`, so `z.toJSONSchema` works for the mcp tools.

### 3.3 state machine

```
draft -> armed -> firing -> working -> done
                    |          |-> held (floor hit, waits for the book) -> working
                    |          |-> failed (user told) -> armed
          armed/working/held -> paused (user, kill switch, escape hatch) -> armed
```

every transition is checked against an allowed table and written with a `runs` row in one sqlite transaction. engine wide mode: `active | reducing | halted`. `halted` trips on n rejects a minute, any fill past a floor, or a reconcile mismatch, and only cancels run.

### 3.4 ticks and lanes

- the existing `MarketDataSocket` mt 9 hook calls `engine.tick(mkt)`. latest value wins: keep the newest mark per market, and if an evaluation is running set a dirty flag instead of queueing.
- drop ticks older than the last block seen for that market.
- refuse to act if mark and last diverge by more than 150 bps or the tick is older than 3s (price protection).
- every send for an account goes through `lane(addr, job)`, a promise chain, so two rules never race on one position or request id.
- while an account's session is reconnecting, its rules evaluate but do not act until the login snapshot is reconciled. logged as `deferred: session reconnecting`.

### 3.5 intents and reconcile

1. in one transaction: rule to `firing`, insert intent `{ id: rule:fire:n, state: 'sending' }`
2. send on the lane, record `rq`
3. ack or fill: `filled` / `rejected` with oid, price, size, tx. timeout: `unknown`. **an unknown is never resent**
4. reconcile (on boot before arming, after every reconnect, every 30s): compare intents with perpl's positions and orders (mt 27, mt 24, signed `GET /v1/trading/orders` and `/positions`). size dropped: filled. unchanged and no order: rejected, safe to retry. our size resting: adopt. position gone: rules on it go `done` with the reason. unknown trigger on the account: adopt as external, count against 16
5. parent quantity check before any close: `filled + inflight + next <= live size` or refuse (the knight capital check)

### 3.6 tests that run on every change

- `bun test` on `step`, `nextSlice`, the reconcile diff, the rq sequencer, `replay`
- property test: no tick sequence ever produces closes summing past the position
- crash test: `DEBUG_CRASH_AT=firing` exits the process mid fire, restart, reconcile resolves it, nothing double closes
- live equals replay: record an hour of live ticks, replay through `step`, intents identical

---

## 4. the features

### f1. rules engine and the guard as a rule

- the guard's margin add becomes rule kind `guard`, one per account. one engine, not two.
- **perpl calls:** `t:6` margin add with `a` from free balance, trade key. dedupe on the mt 27 collateral change.
- **fail:** reject reason recorded (`Reason[o.sr]`), transient ones retried once, else `failed` plus push. `st 7 sr 32` on a margin add goes to reconcile.
- **test:** the ping rule tracer bullet, then a forced threshold on the dev account (the same trick as the first rescue) with the margin add seen once on monadscan.

### f2. hidden stop, slices with a floor, perpl backstop

- **create:** the stop lives only in our db. pehra also places one perpl trigger close as the backstop, a set distance past the stop: `{ t: 3|4, p: backstopFloor, s: live size, fl: 4, lv: 0, lp: pid, tp: backstopPx, tpc: 4 (mark, long) or 3 (short), lb: 0 }`. its oid goes in `orders`.
- **fire:** mark (mt 9 `mrk`, the price perpl itself triggers and liquidates on) crosses `px`, recheck on the next tick, then slice. each slice: `{ t: 3|4, p: floor, s: nextSlice(...), fl: 4 (ioc), lv: 0, lp: pid }`. size from the live book above the floor (`order-book@mkt` or `GET /book?levels=100`), at most half the depth, one slice per block, re-read book and position before each.
- **after each fill:** resize the backstop to the remaining size (cancel with its fields, place new, one batch). when size reaches 0 the backstop dies with the position via `lp`.
- **floor hit:** book past the floor, stop slicing, rule `held`, one push "stopped at your floor, x left open". resume when the book recovers and the mark is still past the stop.
- **pehra down:** the backstop fires on perpl. reconcile on restart writes "backstop fired while pehra was down".
- **gap past both:** the slicer reads the live position before each slice and the parent check stops a double close.
- **test:** unit tests on `nextSlice` with recorded books (empty, all under floor, refilling). testnet tiny mon long: every fill at or above the floor in api.log. floor above bid: `held` and the push. kill test: stop bun, let the backstop fire, restart, reconcile writes it.

### f3. take profit ladder

- **create:** each step is one perpl trigger close, `s` = step share of the position, `p` = step floor. placed together with `placeMany`. refused at create if `resting + steps + 1 backstop slot + 1 spare > 16`, with a plain message ("this needs 4 perpl orders, you have 13 of 16 in use").
- **sync:** reconcile diffs intended steps against resting orders. missing and not filled: re-place. ours but not intended: cancel. filled: step done.
- **after a rung fills:** every remaining trigger on that position (later rungs, the backstop) is checked against the new size and resized in one batch, since oversized closes are rejected not clipped.
- **user trims by hand:** same resize. if a resize fails, push "your ladder sells 400, you hold 300".
- **edit:** cancel and replace only that step (or `t:7` change in place if spike 2 shows it keeps the oid).
- **test:** a 10 case table test of the diff. testnet 3 step ladder, all three in mt 24. hand trim and watch the resize. ask for 17 and read the refusal.

### f4. escape hatch

- **all on the phone**, `apps/mobile/src/escape.ts`, no server needed:
  1. best effort signed `POST /rules/:a/pause`, 2s timeout, failure ignored
  2. one `sendBatch` from the passkey account: `allowOrderForwarding(false)` (this also kills every trigger and the guard's key), then `execOrders` with one ioc close per position at mark x 0.95 (long) or x 1.05 (short), positions read from `getAccountByAddr` + `getPositionV2`
  3. re-read positions from chain and show what is left, if anything
- **gas:** about 260k per close, the account needs MON. ensureGas tops it up first.
- **server side:** login fails after forwarding is off, treated like a revoke (no reconnect storm). reconcile moves every rule to `done`, "closed by the owner onchain".
- **phone states:** `idle -> pausing -> closing -> confirmed | partial | failed`, never "safe" beyond what the chain shows.
- **test:** spike 9 with the dev key and the api killed. then the phone with the user present.

### f5. replay

- `replay(candles, book, position, rule) -> Report`, pure, calls the same `step`.
- each 1m candle becomes a tick path with the adverse extreme first (long: o, l, h, c). gaps fill at the open. fills are priced by walking the book snapshot scaled to the candle price, plus the close fee.
- **data:** up to 200 days of 1m trade candles from perpl rest, 1024 per request. no mark history, so it replays on trade prices and says so. our own `ticks` and `books` tables give a true mark replay for the days we have recorded.
- **report:** fires (time, price, fill, slip), pnl with and without the rule, liquidations with and without, worst slip, ambiguous bars, fees, and `assumptions` as plain lines shown under the result.
- **wick slider:** shift one candle's low by x% and re-run the same function.
- **test:** a hand built crash series checked by hand. appending future candles never changes past fires. live equals replay on a recorded hour. one real 30 day mon run saved in tmp/claude.

### f6. proof page

- computed only from `runs`. every fire carries stamps: t0 venue tick (block), t1 received, t2 decided, t3 sent, t4 acked, t5 filled, t6 settled block.
- shows p50 / p95 / p99 of our code (t3-t1), perpl (t5-t3) and blocks from trigger to settle. uptime from `beat` rows every minute, gaps over 2 minutes shown as downtime with the backstops that fired in them. reconnects per hour, accounts watched.
- **tamper evidence:** each run row hashes the previous one. every hour the server sends one tiny tx with the head hash as calldata. a verify button recomputes the chain in the browser.
- envio join by tx: a run without a chain row shows "settling", then "no chain record".
- addresses truncated, no dollar pnl per user.
- **starts recording on oct 3 and never stops.** that is tom's "provably run for at least an hour".
- **test:** curl `/proof.json` after the tracer bullet. stop bun 3 minutes, see the band. edit a row by hand, verify fails.

### f7. rules api and mcp

- **api:** `GET/POST /rules/:a`, `POST /rules/:a/:id`, `POST /rules/:a/pause`, `POST /rules/:a/:id/cancel`, `GET /replay`. every write signed by the account key with a readable message (address, rule summary, id, nonce, expiry, sha256 of the canonical rule), verified with the same `verifyMessage` path as `/guard/revoke`. nonces kept until expiry.
- **mcp:** `services/mcp`, `@modelcontextprotocol/server` v2 (spec 2026-07-28, stateless), stdio. tools: `list_positions`, `list_rules`, `replay_rule`, `preview_rule`, `create_rule`, `pause_rules`. **no tool** opens a position, withdraws, raises caps or revokes.
- **auth:** the user mints an mcp token on the phone (signed), stored hashed, scoped to drafts, with an expiry and a daily create cap.
- **safety:** agent rules land as `draft` with `by: mcp`. a push shows the decoded summary, one fingerprint arms it. caps enforced on the server.
- **test:** mcp inspector, then `claude mcp add` and "keep my mon long safe overnight", the draft appears in `GET /rules` and as a push. ask for 20 steps, read the refusal. a rule note with an injection string stays data.

### f8. sleep mode

- rule kind `sleep`: window `[from, to)` in utc ms, three distance levels (add at 8%, trim 25% at 5%, close at 3% from liquidation), each fires at most once per window, plus a perpl backstop for the close step.
- at `to`: one `report` run and one push with what happened overnight.
- **test:** a 5 minute window on testnet with levels forced near mark. api.log shows add, trim, close in order. replay works on it.

### f9. alerts

- kinds: near liquidation, rule fired, filled, held at floor, funding flipped, liquidated, AUSD depeg.
- separate set and clear levels (hysteresis), one push per band, dedupe key per kind and position, repeat at most every 4h, muted while the engine itself is down, quiet hours.
- android: the `guard` channel is locked (importance cannot change), so create `fills` and `digest` channels now.
- **test:** drive each kind on testnet, exactly one push each.

### f10. watch any address

- `GET /watch/:address`, no auth: positions, distance to liquidation, resting orders, funding, from perpl's public reads (`getAccountByAddr`, `getPositionV2`) and the market state.
- first screen for someone without an account, ending with "let pehra handle it".
- **test:** curl with a stranger's perpl address.

### f11. agora fallback and failure states

- read the real routes api response first, then fall back to it when `pairState` cannot fill. "processing" and "your funds are safe" states in fund.tsx.
- **test:** ask for more than the pool holds, see the route in api.log, force a failure on the phone.

---

## 5. spikes before building (day 1)

the 13 open questions from perpl-api-deep, ordered by what they block. all testnet, tiny MON sizes, accounts 679 or 694.

| # | spike | blocks |
|---|---|---|
| 1 | cancel a trigger with its fields | f2 resize, f3 edits |
| 5 | oversized trigger after a partial fill | f2, f3 |
| 3 | trigger with `p` limit and with `ms`, read what fires | f2 backstop floor, f3 |
| 9 | direct `execOrders` close with forwarding on | f4 |
| 8 | forwarding off and on with a resting trigger | f4 |
| 10 | trading socket ping timeout | everything (the minute drops) |
| 13 | reconnect reconciliation via signed rest | 3.5 |
| 6 | 17th trigger refusal | f3 |
| 2 | `t:7` change trigger in place | f3 edits |
| 4 | which price `ms` is measured from | f2 slices |
| 7 | `tif` on triggers | f8 |
| 11 | leverage above market max | ui |
| 12 | liquidation formula vs guard.ts (read only, mainnet) | f1, f5 |

each spike is a script in `spikes/` that prints raw frames. answers go in STATUS.md, types in wire.ts are updated from what was seen.

---

## 6. order and days

| day | date | work |
|---|---|---|
| 1 | oct 2 | atomic json writes, sqlite + tables, trading client fixes 3.1, spikes 1, 5, 3, 9, 10 |
| 2 | oct 3 | tracer bullet (ping rule through engine, intents, runs), proof page v1 live and recording, spikes 8, 13, 6 |
| 3 | oct 4 | guard as a rule, reconcile, crash test, f2 hidden stop slicing |
| 4 | oct 5 | f2 backstop + resize + kill test, f3 ladder |
| 5 | oct 6 | f4 escape hatch, f5 replay core with tests |
| 6 | oct 7 | f5 on real data + wick, f7 api + mcp |
| 7 | oct 8 | f8 sleep, f9 alerts, f10 watch |
| 8 | oct 9 | f11 agora, rules ui samples |
| 9 | oct 10 | rules ui on the phone |
| 10 to 12 | oct 11 to 12 | hosting, full demo re-run on the hosted stack, apk, readme with the trust diagram, video, portal |

cut if late, in order: sleep, watch any address, agora fallback.
never cut: proof page, floors, hidden stop + backstop + kill test, escape hatch, crash test.

alongside: ask pbj or tom on a mentor 1:1 about trigger cancel, oversized triggers and the minute drops (spikes 1, 5, 10), testers, one portal update a day.

## 7. what judges see as engineering

1. the kill test live: stop the server, perpl fires the backstop, restart, reconcile explains it
2. the crash test: kill mid fire, no double close
3. the proof page: hours of continuous runs with percentiles, a hash chain anchored on monad every hour, verify in the browser
4. revoke: perpl refuses the key
5. escape hatch with the server off
6. replay with its assumptions printed
7. an agent proposes, a fingerprint arms, the server caps, perpl blocks withdraw
