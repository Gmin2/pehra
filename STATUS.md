# status

the one file that says where the build is. updated every session. this folder is the product and the thing that ships to github. research, brand and ui explorations live one level up in the monad folder. plan and results log: ../research/build-plan.md, what pehra is: ../research/product-brief.md.

## right now (sept 24)

every screen is pehra's own and runs on the phone against testnet: onboarding, home (podium markets, positions with the bird), trade (candles, rocket fill), position (add margin, stop and take profit, hold to close), fund (agora 1:1 in and out, test usdc), receive (qr), activity (the guard's day, before and after trays with the chain tx), settings (the guard's rulers). checked on the phone sept 24: brackets set and cleared on close, withdraw 1 usdc through agora in 7.4s, a fresh install signs back in and re-enrolls the guard in 1.1s. next: t9 envio history, t10 flatten offline, then t11 to t17 (the watch layer: alert tiers, price alerts on mark, while you slept, envio chain alerts; privacy: pushes and settings encrypted with a passkey derived key, incognito mode, a share card), then hosting and the release build. the t11 to t17 plan is in ../research/build-plan.md under "added sept 26".

## automation ground truth (oct 2)

the spikes behind build-plan.md day 1, run on testnet against the payer's perpl account (#649). scripts in spikes/g*.ts.

- **g10, the minute drops: solved by moving the api to node.** perpl's trading server sends a protocol ping every 5s and closes with `1008 ping timeout` when the pong is late. bun's websocket loses those pongs: automatic, explicit `ws.pong()`, a flush write, and bun's own `ws` shim all still dropped (single socket 12 to 44s, the api's 7 sessions about once a minute each). node's websocket (undici) and the `ws` package answer them: one socket held 150s twice, 7 sockets in one process held 90s with zero drops. so services/api now runs on node through tsx (`pnpm start`, `node --env-file=.env --import tsx`), `Bun.serve` became a small node http adapter (src/serve.ts) and the store uses `node:sqlite`. `TradingSocket` still answers a reported ping with an explicit pong, which helps any runtime that exposes one. guard.ts also stopped growing its reconnect delay after a session that had signed in.
- **g1, cancel a trigger: works.** `t 5` with the trigger's own `tp`, `tpc`, `lp` answers `st 5`, the trigger is gone. the old cancel sent only the oid, hence OrderDoesNotExist. a resting trigger gets its own onchain tx when placed.
- **g3, floors on triggers: work.** a fired trigger (`st 9`, sr 54) places a child close with a small server rq, the fill is on that child, the trigger ends `st 10` (sr 65). a floor (`p`) above the bid: nothing filled, the trigger waited as triggered until the position closed. a floor under the bid: filled at the bid, above the floor. no floor with `ms 20`: filled 9 bps under mark.
- **g5, oversized triggers.** when a position shrinks, perpl shrinks its resting linked triggers itself (`os` 200 to 100, sr 31 OrderChanged). but a trigger placed bigger than the position fires and its child closes fail `sr 10` CloseOrderExceedsPosition every 1 to 4s, forever, until cancelled. rule: never place a trigger above the live size, compare against `os`.
- **g9, direct close (the escape hatch): works.** the owner key's `execOrders([close], false)` straight to the exchange, forwarding on, closed 200 mon in 1.07s, 309k gas (estimate said 238k, budget 1.5x). the api socket saw it, the resting backstop died (sr 28 LinkedPositionClosed). its order frame carried `rq` = our `orderDescId` (a timestamp), so the socket's rq has to move past it or the next forwarded order is OrderDescIdTooLow.
- **g13, signed rest for reconcile: works.** `GET /v1/trading/wallet | orders | positions`, signed per perpl's auth doc (packages/perpl/src/signed.ts), return the socket's snapshot shapes stamped with `sn` (the block). a wrong key gets 401. **g13b:** a market open sent, socket killed before any answer: the order still landed, `lfr` 61 to 62, rest showed the position 3s later. a timeout is unknown and rest settles it without the socket.
- **g6, the trigger cap: 15 in practice.** context says `max_account_trigger_orders` 16, but triggers 1 to 15 rested and the 16th and 17th came back `st 7 sr 24` MaximumAccountOrders. the engine budgets 15 per account across all markets and keeps 1 free for an emergency stop, 14 for rules.
- **g8, forwarding off then on: triggers survive, paused.** with forwarding off the resting backstop stayed listed (rest orders, `os 200`) and a new trigger was refused `st 7 sr 34`. on again, the same backstop was still resting. so revoke pauses the backstops perpl holds rather than deleting them, they cannot fire while off. the escape hatch is unaffected: it closes the positions directly and their triggers die with them (sr 28).
- **drops on node:** 3 in the first 5.5 minutes across 7 sessions (bun: 35 in 8). rare enough that instant reconnect plus reconcile carry it.
- **lost order.** one market open got `status 0` and then nothing: no order frame, `lfr` stayed 39, perpl reused rq 40 for the next order. a timeout is unknown, reconcile reads `lfr` and positions, never a blind resend.

## the engine (oct 2)

- **guard as a rule:** every open position gets a guard rule (`guard-<addr>-<pid>`) from the account's settings, paused while the guard is off. checked on testnet (#649): threshold forced to 40, the engine added 1.0197 ausd once, 29.97% to 45.00% from liquidation, tx 0x9793b4a4…8f35, our code 1ms, perpl 913ms, settled 1 block after the trigger. the daily budget now comes from filled intents in sqlite, a restart cannot reset it.
- **crash test, both branches:** `DEBUG_CRASH_AT=sent` exits the moment the add is written to the socket: it never reached perpl, reconcile read the collateral unchanged and settled it rejected, the guard retried after its cooldown. `DEBUG_CRASH_AT=acked` exits after perpl confirmed but before we recorded it: reconcile read 5.4517 to 6.4517 and settled it filled, nothing resent. all adds that landed (1.0197 + 1.0 + 1.0) sum to exactly the collateral perpl holds (3.432 to 6.4517).
- **OrderDescIdTooLow after a direct close.** the g9 escape hatch close used `Date.now()` as its orderDescId, so every forwarded order on #649 afterwards was refused `sr 32` (a fresh session seeds rq from `lfr`, about 90). margin adds do not check it, orders do. `TradingSocket.send` now treats sr 32 as a definite nothing happened, jumps rq past `Date.now()` and sends once more. a refused close moves the rule to `held` instead of leaving it armed with a stale fired mark.
- **hidden stop, crude, live:** `stop3` one tick under the mon mark, floor 2% under. the mark dipped, the engine sent one ioc close at the floor and sold all 200 at 0.0337 (floor 0.03304), tx 0x0d5a274a…efb4, the rule and the position's guard rule both finished when the position closed. `POST /rules/:address/:id/cancel` ends a rule through the state machine.
- **slices and the backstop, live:** a stop now sells in slices sized from the live book past its floor (`nextSlice`, half the depth at most, one per block, the live position re-read before each), and holds with the rest open when the book is past the floor. arming a stop places its backstop on perpl: a trigger close at `backstopPx` for the live size, market with a 3% cap so it fills in a fast crash. `stop4` rested its backstop (oid …025024), then sold 200 at 0.03384 above its 0.03316 floor, the backstop died with the position and the rule finished. a finished or cancelled stop always settles its backstop row.
- **the kill test (the demo beat), passed:** a stop with a 60s hold so pehra could not sell, backstop 3 ticks under the mark. the api was killed the moment the backstop rested. 7s later perpl fired it on its own: the position was gone, the trigger executed (order history `st 10`) and its child close sold 200 at 0.03372 in tx 0x93f7d76e…adc4. on restart reconcile found the position gone with the backstop resting and pehra never having sold, finished the rule, and reads perpl's signed order history to record what the backstop sold, at what price, in which tx.
- **kill test 2, with attribution:** same setup, api killed when the backstop rested, perpl fired it 20s later. on restart reconcile read perpl's signed order history and recorded the backstop's own sale: 200 at 0.03363 (fired at 0.03374), tx 0x11048776…7b8d, block 67494006. activity shows "the backstop on perpl sold 200 MON at 0.03363, it fired at 0.03374 on its own".
- **take profit ladder:** arming places one partial trigger per step with its floor. ladder1 rested 3 steps of 60 mon (30% each) at 0.0342, 0.03454, 0.03488, perpl's open orders showed `os 60` each with their floors, cancelling the rule cancelled all three on perpl.
- **ladder steps fire on perpl, and perpl resizes the rest.** a short's step one tick under entry fired (`st 9` then `st 10`) and its child bought back 100 at 0.03364 inside the 0.03365 floor, tx 0x981d90cf…80dd. at the same block perpl set the other step from 80 to the whole remaining 100 (`sr 31`): after a partial close perpl sets every linked trigger to the remaining position. right for a backstop, wrong for a ladder, so reconcile puts each step back to its share, never above the live size (seen live: 100 back to 80, new oid). perpl's order history can lag the socket by seconds, the lookup now retries before calling a step gone.
- **escape hatch through the shared builder:** `openPositions` plus `closeAllCalls` from the owner key closed a 100 mon short straight on the exchange (tx 0x7a9e00db…06e2), the position's guard rule finished. with forwarding off in the same batch it ran in 2.5s after the reads went parallel. monad charges the gas limit, not gas used, so the close limit is 380k (a close uses about 310k).
- **a relayed order can land after its socket died:** `/order` answered `socket closed 1006` while the open had filled (the position held 200 more than the app was told). relayed orders need the same unknown handling as the engine's (todo).
- **session drops came back, from the recorder:** every account's session dropped about every 10s once the recorder wrote 8 tick rows per frame one by one with `synchronous = full` (a disk sync each). the event loop stalled and pongs went out late. ticks and books now commit once per frame and the store runs `synchronous = normal` (wal, safe against a crashed process). the minute beat records the event loop's p99 and max stall. that did not stop the drops: at 14:09 even the standalone node `ws` probe that held 150s in the morning dropped at 11s (ping timeout) and held 66s on the next run, with 38ms to perpl and no packet loss. perpl testnet is dropping well behaved clients this afternoon. what pehra controls: instant reconnect, rules defer while a session is down, reconcile settles what was lost. next: send engine orders over signed rest (`POST /v1/trading/orders`) so a send cannot die with the socket.
- **a second session for a wallet:** with the api's session for #649 up, a spike session for the same wallet (another key) signing in coincided with one api drop, and the phone app keeps its own warm trading socket per wallet (apps/mobile/src/warm.ts). not proven to kick, given the drops above, but one trading session per wallet (the server's) is the safer shape
- **orders over signed rest (oct 2 evening):** `POST /v1/trading/orders` answers in 270ms with per order statuses (accepted for forwarding, the outcome comes later from the socket or history). the first try came back a block later as `sr 32` OrderDescIdTooLow with a timestamp id above every id the account had used. then perpl stopped forwarding: two more orders (rq `lfr + 1` and a timestamp) were accepted and never appeared in history, `lfr` stayed 116. testnet looked degraded this evening (see the drops above), the rest send path waits until it behaves again.
- **replay, on real data:** `POST /replay { address, rule }` opens the same position 30 days back and runs the rule through the live engine's `step()` on perpl's 5 minute candles (8640 bars, cached in sqlite, 5.3s cold, 0.4s warm), perpl held orders simulated the way perpl fires them, closes priced on the recorded book. on a real 3x mon long (1199 mon): holding was liquidated (-10.31 ausd), a hidden stop halfway to liquidation sold once and ended -1.51, the guard added 5.63 ausd twice and ended +6.98, a take profit 3% up never filled. the report lists its assumptions in plain words.
- **escape hatch on the phone (oct 5), passed:** dev account #679, a 100 mon long opened through the guard (1.2s tap to fill), then "escape hatch" with one fingerprint: the signed "pause every rule" was accepted (the position's guard rule went armed to paused), and the passkey's own key closed the position straight on the exchange, tx 0x039fe78d…7612 from the account's address, 2.7s from fingerprint to confirmed, perpl showed no positions. a paused rule whose position is gone now finishes too (it stayed paused).
- **payer out of MON (oct 5):** 0.0008 MON left after weeks of drips and anchors. new accounts get no starting MON and the hourly anchor fails until it is refilled from the faucet.
- a socket frame reaches listeners before `TradingSocket` applies it to its maps, so guard and engine read positions a tick later (a new position got no guard rule before).

## earlier (sept 22)

**building: pehra**, the mobile perps app (track 1, agora mobile bounty). second product (track 2, agora cross border payments, "send home") starts only after pehra's guard works.

**t5, t6 and t7 pass on the phone** (sept 22 and 23). a fresh account goes from tap to a filled perpl order in 5.3 to 7.4s, a returning account in 1.1s through the guard's server side session. the guard holds one delegated trading session per account (one passkey signature), watches every position against the mark, and adds margin before the venue liquidates: drilled on the laptop, enrolled and traded from the phone. no `any` types, 24 unit tests, a cold start harness, a guard drill. next: push notifications (firebase for the android dev client) and the real screens. the phone (nothing a069, usb debugging, `adb reverse tcp:8081 tcp:8081` and `tcp:8787`) is the test device for anything with a passkey, the emulator has no google account.

## tracer bullets

| # | what | state | proof |
|---|---|---|---|
| t0 | dev wallet funded (5 MON, 10,000 AUSD from agora faucet) | pass | spikes/t0.ts |
| t1 | perpl account 649, 200 AUSD, forwarding on | pass | spikes/t1.ts, 0.038 MON total |
| t2 | api key enrolled from a server, no origin header, ws sign in | pass | spikes/t2.ts, chainId must be BigInt |
| t3 | market order filled in one block | pass | spikes/t3.ts |
| t4 | stop, take profit, margin add, close | pass | spikes/t4.ts, two quirks logged |
| app | expo dev client runs on android emulator | pass | research/brand-refs/screens/pehra-tracer-bullet.png |
| t5 | passkey create, sign, verify, forget storage, sign in, same address | pass | research/brand-refs/screens/t5-*.png, 5.5s create, 0.9s sign |
| t6 | phone does t1 to t3, stopwatched | pass | 26.2s cold on the phone at first, 5.3 to 7.4s cold after hardening (harness), 1.5s returning user on the phone with the socket live, account 653 |
| t7 | the guard, server side session delegated by the passkey, adds margin | pass, no push yet | services/api/scripts/guard-drill.ts, phone: enroll 1.1s, trade via guard 1.1s tap to fill, status 46ms |
| t7b | push notification with add margin action | pass | firebase project pehra-ae5c6, fcm from the server, "pehra added margin" landed on the phone with the app in the background |
| t8 | funding through agora's instant settlement pair | pass, fund screen on the phone | spikes/t8.ts and t8b.ts: usdc (CTK) to AUSD 1:1 no fee, into perpl as one batch 2.2s, withdraw back 2.0s; a third party can grant the swapper role on testnet, so the server whitelists users; /drip/usdc gives 50 test usdc and gas |
| t9 | envio history | | |
| t10 | offline flatten all | | |

## how to run

```
cd pehra
. scripts/android-env.sh                      # project sdk, jdk 17, gradle home, expo home (all under ../tmp/claude)
pnpm install
cd apps/mobile
npx expo run:android                           # build and install (node 24 via nvm, see notes)
npx expo start --dev-client --port 8081        # metro, then open the app
cd ../../services/api && pnpm start           # api on :8787 (node + tsx), needs .env with DEV_PRIVATE_KEY
adb reverse tcp:8081 tcp:8081; adb reverse tcp:8787 tcp:8787
pnpm test                                      # unit tests for the perpl client
pnpm cold-start                                # the whole t6 from a throwaway key, timed per step, needs the drip server
```

rule from the user: before any new feature, test what exists extensively, keep types tight (no any), keep the trade path fast. run the cold start harness after every change to the trade path.

reading the phone without screenshots: every line the app logs on screen is also posted to the drip server (`POST /log`) and printed as `[pehra]` in logcat. so `grep phone ../tmp/claude/api.log` or `adb logcat -v time ReactNativeJS:V '*:S' | grep pehra`. the bench button in the app prints network and crypto timings for the device it runs on.

native modules: react-native-quick-crypto (nitro) for the bip39 seed, 7ms native against 1.7s in javascript on hermes, and expo-notifications with firebase (google-services.json in apps/mobile, the service account key in services/api/data, gitignored). any change to native deps needs `npx expo run:android` again (about 3.5 minutes, cached).
node 26 breaks expo cli, use `source ~/.nvm/nvm.sh; nvm use 24` first. all toolchain quirks are in research/build-plan.md under "results log".

## open questions to people

- perpl (pbj via portal or discord): builder id for testnet, how to cancel a resting trigger order (direct cancel returns OrderDoesNotExist), does contract 1.7.5 mean close fees, (the ping timeout is answered, see automation ground truth)
- agora (portal mentors tab, drakeevans): is there a staging environment (the payments bounty text mentions one, nothing public)
- register pehra.trade and @pehratrade, then move the passkey host off the vercel subdomain (test passkeys get recreated)

## next

the real screens: markets with live prices, the ticket, the position card with the guard state and its events, funding (t8), envio history (t9), flatten all (t10). the guard's pending enrollments and keys live in services/api/data (gitignored), a database comes when there is a second server.

layout: apps/mobile (expo app), packages/perpl (typed perpl client, smoke test in scripts/), services/api (bun, drip today, guard next), web/passkeys (the rpId host on vercel), spikes (the probes the plan rests on), scripts (android env).

assetlinks gotcha: the apk is signed with apps/mobile/android/app/debug.keystore, if the keystore changes the fingerprint in web/passkeys/.well-known/assetlinks.json must change too and google caches it for an hour.
