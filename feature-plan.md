# pehra feature plan, oct 8 to oct 12

full throttle: every feature in, built in thin slices, each one proven live on testnet before the next. the order below is also the drop order from the bottom if a day slips.

grounded in three audits on oct 8: the onboarding and funding flow as the code runs it, the engine hooks for chains, recipes, sharing and watching, and outside research on onboarding, perpl accounts and hosting.

## 0. what every feature stands on

### 0.1 one rule for all new rule fields
the server parses a rule with zod and rebuilds the signed message from the parsed copy. a new field with a zod `.default()` changes the hash and breaks every signature from an older app. so:
- every new field is optional with no default
- the app runs `Rule.parse` before it signs, so both sides sign the same bytes
- existing message formats stay byte identical, old signatures keep verifying

### 0.2 session tokens, every write signed (S)
today `/order`, `/close`, `/close-all`, `/brackets`, `/guard/add`, `POST /guard/:addr`, `POST /alerts/:addr` and `/push/register` take a bare address. anyone who finds the url can trade or switch the guard off.

- `packages/perpl/src/ruleSign.ts`: new action `{ action: 'session'; device: string }`, message `pehra session for <addr> / device <id> / nonce / expires` (24h)
- `services/api/src/sessions.ts`: table `sessions (token text primary key, owner, device, exp)`. `POST /session` verifies the signature with `checkSigned`, returns a random 32 byte token
- every write route reads `authorization: Bearer <token>` and checks `owner === address`, else 401. one helper `owns(req, address)`
- `apps/mobile/src/session.ts`: on the first passkey prompt of a cold start (already happens for fund, rules and the key screen) also sign the session message, keep the token in SecureStore, refresh when under 2h left. trades keep filling in about a second, no prompt per trade
- reads become owner only or trimmed:
  - `GET /rules/:addr`: owner gets everything, anyone else gets kind, state, mode and fires, no prices (the hidden stop stays hidden)
  - `GET /proof/:addr`: runs without rule bodies for strangers, receipts and tx stay public
  - `GET /guard/:addr` health and balance stay public (they are on chain anyway), events and settings owner only
  - `GET /alerts/:addr` owner only
- test: `services/api/test/auth.test.ts`, each write route 401 without a token, 401 with another owners token, 200 with the right one. live: curl a trade with no token on the hosted box, refused

effort 4h

### 0.3 an engine event bus (needed by chains, recipes, watch alerts)
today events leave the engine only through `deps.emit` for display and `writeRun` for the audit trail. chains need an internal bus.

- `services/api/src/engine.ts`: `private bus = new EventEmitter()` plus `on(ev: ChainEvent)` subscription used by the chain runner
- emit `ChainEvent` at the exact places the engine already knows the fact:

| event | where | payload |
|---|---|---|
| `opened` | `openEntry` after a fill, and `reconcile` when it finds an unknown open landed | rule, pid, fill price, size, side |
| `step` | `attribute()` after a ladder step fill is recorded | rule, pid, step n, price, size |
| `stopSold` | `sliced()` after the last slice, or each slice with `final` | rule, pid, price, size, final |
| `backstop` | `reconcile` when the backstop fired | rule, pid, price |
| `fundingFlip` | `engine.funding()` when the sign changes against a side | mkt, side, rate |
| `closed` | `guard.emit` kind closed, any cause, including the phone | pid, price, pnl |
| `added` | after a guard or manual margin add | pid, ausd, distance after |

- the bus fires after the run is written, so a chain reacts only to recorded facts

effort 2h

## 1. chains, "when this happens, do that" (C)

### 1.1 the model
a new rule kind `when`, signed like any other rule, owned by one account, optionally tied to a position.

```ts
// packages/perpl/src/rule.ts
const Trigger = z.discriminatedUnion('on', [
  z.object({ on: z.literal('step'), rule: z.string(), n: z.number().int().min(1) }),        // a ladder step filled
  z.object({ on: z.literal('opened'), rule: z.string() }),                                  // an entry filled
  z.object({ on: z.literal('stopSold'), rule: z.string() }),
  z.object({ on: z.literal('backstop'), rule: z.string() }),
  z.object({ on: z.literal('price'), mkt, dir: z.enum(['above', 'below']), px: price }),    // mark crosses a level
  z.object({ on: z.literal('distance'), pid, belowPct: pct }),                               // closer to liquidation than
  z.object({ on: z.literal('fundingFlip'), mkt }),
  z.object({ on: z.literal('time'), at: z.number().int().positive() }),                      // unix ms, once
  z.object({ on: z.literal('daily'), minute: z.number().int().min(0).max(1439), tz: z.number().int() }),
  z.object({ on: z.literal('depeg'), bps: z.number().int().min(10).max(500) }),             // ausd off the dollar at agora
])
const Action = z.discriminatedUnion('do', [
  z.object({ do: z.literal('moveStop'), rule: z.string(), to: z.enum(['entry', 'entryPlusFees']) }),
  z.object({ do: z.literal('tightenStop'), rule: z.string(), byPct: pct }),
  z.object({ do: z.literal('close'), pid, sharePct: pct, floorPct: z.number().gt(0).lte(5) }),
  z.object({ do: z.literal('closeAll'), floorPct }),
  z.object({ do: z.literal('addMargin'), pid, ausd: z.number().positive().max(100) }),
  z.object({ do: z.literal('open'), mkt, side, margin, leverage, limitPct: z.number().gt(0).lte(5) }),
  z.object({ do: z.literal('arm'), rule: Rule }),            // arm a child rule, signed inside this one
  z.object({ do: z.literal('cancel'), rule: z.string() }),
  z.object({ do: z.literal('notify'), text: z.string().max(140) }),
])
z.object({ ...base, kind: z.literal('when'), on: Trigger, then: z.array(Action).min(1).max(4), repeat: z.boolean().optional() })
```

and two optional fields on the stop rule, the common cases without writing a `when`:
- `trail?: { pct: number; minMovePct: number }`: the stop follows the high since arming, only ever tighter
- `breakeven?: { ladder: string; afterStep: number }`: sugar for a `when step -> moveStop entryPlusFees`

`summary()` writes each one as a sentence, that sentence is what the passkey signs:
- `when take profit step 1 of ladder-x fills, move the mon stop to entry plus fees`
- `when mon falls below 0.0240, close half my mon long, never more than 1% from the price`
- `every day at 09:00, open a 5 ausd mon long at 2x`
- `when ausd is 0.5% off the dollar, close everything`
- `hidden stop at 0.0245 trailing 3%, only ever up`

### 1.2 pure logic, shared by the engine and replay
`packages/perpl/src/chain.ts`:
- `match(rule: WhenRule, ev: ChainEvent): boolean` for event triggers
- `poll(rule: WhenRule, mem: Mem, now: { at, marks, distances, rate, ausdPrice }): boolean` for price, distance, time, daily, depeg, the same `held()` debounce as `step.ts` so a one block wick does nothing
- `act(rule, ctx): Intent[]` turns actions into intents. new intents in `step.ts`:
  - `{ kind: 'move'; rule: string; px; floor; backstopPx; why }`
  - `{ kind: 'arm'; rule: Rule; why }`
  - `{ kind: 'cancel'; rule: string; why }`
  - `{ kind: 'notify'; text }`
  - existing `close`, `add`, `open` reused
- trailing lives in `step()` itself: `mem.high = max(mem.high, mark)`, when `high >= mem.anchor * (1 + minMovePct)` the stop, floor and backstop all shift by the same distance, tighter only

the stop never changes its signed body. moved levels live in `Mem` (`px`, `floor`, `backstopPx`, `high`, `anchor`) and `step()` reads `mem.px ?? rule.px`. the move is allowed because the signed body says it may move.

### 1.3 engine
- `when` rules load like any active rule. event triggered ones subscribe to the bus by the source rule id, polled ones run in the market tick (price, distance), the minute beat (time, daily) and the existing funding and depeg loops
- `once` by default, `repeat: true` keeps it armed (daily)
- `moveStop(r, next)` on the account lane:
  1. never while the stop is held, firing or working
  2. new levels must still sit on the losing side of the mark, else skip and say why
  3. mark the old backstop row `replacing` keyed by its oid
  4. place the new backstop at the new price
  5. cancel the old one with its own trigger fields (cancel works, spike g1)
  6. if perpl answers MaximumAccountOrders, cancel first, then place
  7. write a `move` run, emit a `bracket` event, push "i moved your mon stop to 0.02612 (entry plus fees)"
- a `moving` set that `reconcile` skips, so it never re places the old backstop between the cancel and the new row
- trailing only re places the perpl backstop when the move passes `minMovePct` (perpl allows about 60 requests a minute), the hidden stop moves freely in memory
- `orders` primary key stays `(rule, step)`, the replacing row is renamed `backstop#<oid>` so `owns(oid)` still knows the old one if it fires mid swap
- `arm` actions insert the child with `by` of the parent and no signature of its own (the precedent `handOff` already set), id `<kind>-<pid>-from-<parent>`
- every action writes a run, every action is visible on proof
- `list()` returns effective levels from `mem`, so the rules list shows where the stop is now

### 1.4 app
- builder (`app/rule.tsx`): the stop tab gets two toggles under the sentence, `trail it [3%]` and `move to entry after [step 1]` (only shown when a ladder exists on the position)
- a new `then` tab: a sentence builder
  - `when [take profit step 1 fills ▾] then [move my stop to entry ▾]`
  - triggers list: a take profit step, the stop sells, the backstop fires, the price goes above / below [x], i get within [x%] of liquidation, funding turns against me, at [time], every day at [time], ausd drifts [0.5%]
  - actions list: move my stop to entry, tighten my stop [x%], close [half / all], add [x] ausd, open a [long / short] [x] ausd at [x]x, notify me
  - one fingerprint arms it
- rules list: `when` cards with the sentence, "waiting for step 1" or "fired, moved the stop to 0.02612"
- activity and proof: `move` and `arm` rows

### 1.5 slices and how each is proven
1. tracer: a `when price above x then notify` on the dev account, curl only, push arrives
2. pure `chain.ts` with tests: every trigger matches and debounces, every action makes the right intents, trailing only tightens, breakeven adds fees
3. `moveStop` on a live dev position: move the backstop 3 times in a row, perpl shows one resting backstop at the new price each time, never two, never none for more than one send
4. breakeven live: dev long, ladder step 1 one tick above the mark, `when step 1 then moveStop entry`, the step fills, the backstop moves to entry plus fees within 5s, push arrives
5. trailing live: dev long with `trail 0.3%`, watch the stop climb on a rising minute, never fall
6. kill test: kill the api right after step 1 fills, restart, reconcile sees the step, the chain still fires once (not twice)
7. app: arm breakeven from the builder with the passkey on the phone, see it on the rules list, see the move on proof

effort: core and engine 12h, moveStop and its race 4h, polled triggers 3h, app 6h, tests and live proofs 5h. about 30h

## 2. recipes (R)

### 2.1 one signature for several rules
- `ruleSign.ts`: `{ action: 'createMany'; name: string; rules: Rule[]; symbol?: string }`. message: header, `recipe <name>, <n> rules`, one numbered `summary()` line per rule, `ids a,b,c`, `sha256 <hash of canonicalJson(rules)>`, nonce, expiry
- `POST /rules/:addr/many`: parse all, `checkSigned` once, no duplicate ids, validate each, then check the trigger budget across the whole bundle (`resting + sum of triggersOf`), insert all in one transaction (`engine.addMany`), only then queue backstop and ladder placement
- no rollback: if one placement fails the rest stay armed, the failure is a reject run plus a push, the recipe card says which part did not land

### 2.2 templates relative to price, not absolute
`packages/perpl/src/recipes.ts`:
```ts
type Template = { v: 1; id: string; name: string; blurb: string; items: Item[] }
type Item =
  | { kind: 'entry'; side; when: 'below' | 'above'; offsetPct; limitPct; margin; leverage; then?: Item[] }
  | { kind: 'stop'; offsetPct; floorPct; backstopPct; slices; trailPct?; breakevenAfter?: number }
  | { kind: 'ladder'; steps: { offsetPct; share; floorPct }[] }
  | { kind: 'guard'; threshold; target; maxAddDay }
  | { kind: 'funding'; floorPct }
  | { kind: 'when'; on; then }
instantiate(t: Template, live: { mkt, mark, pid?, entry?, side? }): Rule[]
```
- an entry with `then` hands over a stop, a ladder and breakeven at the actual fill price (an entry can fill up to 5% from its trigger, so children are relative to the fill). generalises today's `handOff`, keeps `stop` working for old rules
- built in recipes:
  1. buy the dip, protected: entry 3% under the mark, then a hidden stop 5% under the fill, a ladder 50% at +5% and 50% at +10%, breakeven after step 1
  2. let it run: on an open position, a trailing 3% stop plus the guard
  3. sleep safe: close if funding turns, guard steps in at 15% tonight, a `daily 07:00 notify` morning report
  4. catch the breakout: entry 2% above the mark, stop back under the breakout, trailing 4%
  5. depeg shield: when ausd is 0.5% off the dollar, close everything
  6. daily stack: every day at 09:00 open a 5 ausd mon long at 2x with a stop

### 2.3 app
- `app/recipes.tsx`: cards with name, one line, the 30 day replay result (2.4), the rules it makes listed as sentences, "arm with fingerprint"
- reached from the trade screen (a "recipes" pill next to now / at a price), from an open position (rules list "add a recipe"), and from "how you trade" (suggested recipe instead of single rules)
- confirm screen shows every instantiated sentence before the prompt

### 2.4 replay for recipes and chains
`packages/perpl/src/replay.ts`: `replayMany({ bars, rules, start | null, ... })`
- a `Map<id, Mem>`, simulated perpl orders keyed by rule and step using effective levels
- each sub tick: simulated perpl orders fire, become chain events, `chain.act`, then `step()` for every rule, `move` shifts the simulated backstop, `open` creates the position at the limit with fees
- `replay()` becomes a thin wrapper, its 6 tests still pass
- `replayRoute` takes `rules[]` or a template id, allows `start: null` so entry recipes replay from a flat account
- candles where a step and a stop both trade inside one bar count as ambiguous and are listed in the assumptions
- funding chains cannot be replayed (no funding history), the card says so

### 2.5 slices and proofs
1. `createMany` signed and verified, curl test with good, stranger, changed and replayed signatures (copy g19)
2. `instantiate` tests for every built in recipe, every output passes `validate`
3. buy the dip live on the dev account with the entry one tick under the mark: entry fills, stop and ladder and breakeven land, step 1 fills, stop moves
4. replayMany test: a crash series by hand, a rally series by hand, appending future candles never changes past fires
5. phone: arm "buy the dip" and "sleep safe" with one fingerprint each

effort: signing and route 6h, templates and handOff 6h, replayMany 10h, app 6h, proofs 4h. about 32h

## 3. share a recipe, copy a recipe (H)

### 3.1 what is shared
a template, never an address, a pid or an absolute price. plus, if the sharer wants, their public record: how many times the recipe ran on their account and the receipts on proof.

- `POST /recipes` (session auth): stores `{ id, template, author, createdAt }`, returns a short id
- `GET /recipes/:id` public: the template, the author address cut to `0x1234…abcd`, the author runs of that recipe (count, last fired, receipts with tx)
- link: `https://pehra.trade/r/<id>` (or the vercel host that already serves assetlinks)

### 3.2 links that open the app
- `apps/mobile/app.json`: android `intentFilters` with `autoVerify` for `https://<host>/r/*`
- `web/passkeys/.well-known/assetlinks.json` already has `handle_all_urls`, check the sha256 matches the release keystore
- `app/r/[id].tsx`: fetches the recipe, shows it like a recipe card with "copied from 0x1234…abcd, ran 4 times" and its replay on your price, "arm with fingerprint"
- web fallback `web/site/r/[id]`: the recipe as a page with the apk download, for someone without the app
- share button on the rules list and on each recipe card, via `Share.share`

### 3.3 proofs
1. create a recipe on the dev account, open the https link on the phone, the app opens on it
2. arm it from the link on the phone account with one fingerprint
3. the web fallback renders for a browser without the app

effort: routes 3h, app screen 4h, app links and fallback 5h, proofs 2h. about 14h

## 4. watch any address (W)

### 4.1 reads
- `packages/perpl/src/watch.ts`: `readPositions(pub, address)` widening `escape.ts openPositions` with deposit, entry and entry block. `watchHealth(positions, marks, ctx)` maps to `positionHealth` (distance to liquidation, pnl). leverage from the latest `open` Activity in the indexer
- `GET /watch/:address` public, 10s cache, rate limited per ip: positions with health, the last 10 activity rows from the indexer, the profile labels ("high leverage, quick in and out"), and whether the address is a pehra account (its public proof)
- another accounts trigger orders are not readable (perpl keeps them off chain), the screen says "stops unknown", never "no stops"

### 4.2 app
- home: a search field in markets, "watch an address", paste or scan a qr
- `app/watch/[address].tsx`: their positions with distance to liquidation, their recent trades, their profile, if they are on pehra their proof receipts and shared recipes
- a watch list on home, star to keep
- onboarding gets a third card, "just looking? watch any trader", no account needed, works before sign up

### 4.3 alerts for watched accounts
- server table `watches (owner, target, createdAt)`, session auth
- the alerts loop checks watched accounts every 30s from the indexer: "0x1234 opened a mon long 3x", "0x1234 is 6% from liquidation", one push per change, same dedupe as alerts
- a new switch on the alerts screen, "accounts i watch"

### 4.4 proofs
1. `/watch/<stranger>` for a real perpl testnet account from the indexer, the numbers match perpl
2. the phone opens a watched address before signing in
3. a watched dev account opens a position, the phone gets the push within a minute

effort: reads and health 4h, route 3h, app 7h, alerts 5h, proofs 2h. about 21h

## 5. onboarding, wallets and funding (U)

### 5.1 new users
- sign up stays a passkey, the wallet is an address made from it, no seed phrase, nothing stored but the address and the credential id
- add one honest line on terms: "your passkey is your account. if you lose every device with it, the account is gone"
- "create account" warns if this phone already has a pehra passkey, offers sign in instead
- ready screen explains the two balances: "100 ausd is in perpl, ready to trade. 100 is in your wallet, add it any time from fund"
- "your account is funded" only when it is, else "your account is ready"
- the guard step shows the defaults (steps in at 5%, back to 10%, at most 20 ausd a day) and one line on the key: "it trades and adds margin for you. perpl does not let it withdraw. turn it off any time"
- "maybe later" lands on a working read only home, trade says "turn on the guard to trade" with a one tap way back

### 5.2 people who already have a wallet
the accepted pattern (privy, phantom, based): keep the pehra account for trading, the existing wallet is a way to fund it.
- fund gets "from another wallet": your address and qr, "send ausd or usdc on monad testnet", a live check that turns green when the deposit lands, then one tap moves it into perpl
- stretch: walletconnect "deposit from wallet", connects metamask or rabby and asks for one ausd transfer to the pehra address. only if 5.1 to 5.4 are done

### 5.3 money can always leave
- `app/send.tsx`: send ausd, usdc or mon from the pehra wallet to any address, passkey signed, gas from the wallet (a top up from the payer on testnet if under 0.01 mon)
- withdraw from perpl lands in the wallet, then send moves it out

### 5.4 small fixes from the audit
- the help sheet still has the template "your Family is a home for your wallets" text
- raw error strings on onboarding and the key screen become plain sentences
- sign out in the same session lands on the done step, reset the onboarding step on sign out
- "close" on the first screen loops back through the intro
- the fund failure copy "nothing moved" only when nothing moved, else "the swap went through, the deposit did not, your ausd is in your wallet"
- "at 1.0000, no fee" reads the pair price instead of a fixed string
- each word of jargon gets one plain line where it first appears: margin, leverage, liquidation, ausd, perpl

effort: about 10h

## 6. hosting and release (O)

- a hetzner cx23 (2 cpu, 4 gb, about 6 euro a month): docker compose with the api (node 22, sqlite on a local volume), the envio indexer, postgres, hasura, caddy for https. not azure, its shared file disk breaks sqlite locking, and pehra stays apart from benchmon
- secrets in `/opt/pehra/.env`, never in the repo, data in `/opt/pehra/data` with a nightly copy of `pehra.db` and `guard-keys.json`
- the app reads `EXPO_PUBLIC_API` (no more localhost), release apk signed with the release keystore, its sha256 in assetlinks
- ask perpl to whitelist the server origin for api key setup, and register a builder code (fee 0, volume attribution)
- proofs: the phone on mobile data with no usb runs the whole journey, uptime on proof counts from the hosted box, `curl` a write with no token is refused

effort: 6h, needs a server from the user

## 7. order and days

| when | what | done means |
|---|---|---|
| oct 8 night | S session tokens and trimmed reads, 0.3 event bus, C pure `chain.ts` with tests | every write refuses without a token, chain tests pass |
| oct 9 | C engine: moveStop, breakeven, trailing, polled triggers, live proofs 3 to 6. O hosting in parallel once the server exists | breakeven and trailing proven live, api reachable over https |
| oct 10 | C app (stop toggles, then tab). R createMany, templates, replayMany, recipes screen, live buy the dip | a recipe armed from the phone with one fingerprint, its replay shows |
| oct 11 | H share links and fallback. W watch any address and its alerts. U onboarding, funding, send | a link opens the app on a recipe, a stranger watched, a fresh install understood without help |
| oct 12 | release apk on the hosted box, full rerun on the phone over mobile data, testers, demo video, readme, submit | submitted |

if a day slips, drop from the bottom of this list first: watch alerts (4.3), web fallback (3.2), walletconnect (5.2 stretch), daily triggers, then the then tab (keep the stop toggles). never drop S, O, breakeven and trailing, the demo.

## 8. the demo this makes possible (60 to 90s)
1. a stranger watched from the first screen, no account
2. sign up with a passkey, the account is funded
3. "buy the dip, protected" recipe, its 30 day replay, one fingerprint
4. the entry fills, the stop and ladder land, step 1 fills, the stop moves to entry on its own, push
5. kill the server, the backstop on perpl is still there, restart, reconcile explains
6. share the recipe as a link, it opens on a second phone
7. proof: every one of those steps with its tx on monadscan, check the chain

## 9. risks
- perpl trigger budget is 15, a full recipe uses 4 or 5, the bundle check refuses what would not fit
- moveStop places before it cancels, briefly two backstops, both sized to the position, perpl shrinks or drops the extra on close (g5b, g9). if that ever goes wrong the reconcile oversize check replaces it
- perpl allows about 60 requests a minute, trailing only re places past `minMovePct`
- the app signs before parsing today, step 0.1 fixes it or every new field breaks old signatures
- hosting needs a server and a perpl origin whitelist, both outside our control, start both on oct 8
