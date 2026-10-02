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
- **lost order.** one market open got `status 0` and then nothing: no order frame, `lfr` stayed 39, perpl reused rq 40 for the next order. a timeout is unknown, reconcile reads `lfr` and positions, never a blind resend.

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
