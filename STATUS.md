# status

the one file that says where the build is. updated every session. this folder is the product and the thing that ships to github. research, brand and ui explorations live one level up in the monad folder. plan and results log: ../research/build-plan.md, what pehra is: ../research/product-brief.md.

## right now (sept 22)

**building: pehra**, the mobile perps app (track 1, agora mobile bounty). second product (track 2, agora cross border payments, "send home") starts only after pehra's guard works.

**t5 and t6 pass on the phone, then a hardening pass** (sept 22). a fresh account went from tap to a filled perpl order in 26.2s on the first run and 5.3 to 7.4s after the latency work (websocket rpc, batched setup txs, monad's reserve balance rule handled, see ../research/build-plan.md results log). no `any` types, 18 unit tests, a cold start harness. next is t7, the guard. the phone (nothing a069, usb debugging, `adb reverse tcp:8081 tcp:8081` and `tcp:8787`) is the test device for anything with a passkey, the emulator has no google account.

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
| t6 | phone does t1 to t3, stopwatched | pass | ../research/brand-refs/screens/t6-first-trade-26s.png, 26.2s cold on the phone, 5.3 to 7.4s after hardening (harness), account 653 |
| t7 | the guard, push with add margin | next | |
| t8 | funding sheet (agora pair) | | |
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
cd ../../services/api && bun run src/index.ts  # drip server on :8787, needs .env with DEV_PRIVATE_KEY
adb reverse tcp:8081 tcp:8081; adb reverse tcp:8787 tcp:8787
pnpm test                                      # unit tests for the perpl client
pnpm cold-start                                # the whole t6 from a throwaway key, timed per step, needs the drip server
```

rule from the user: before any new feature, test what exists extensively, keep types tight (no any), keep the trade path fast. run the cold start harness after every change to the trade path.
node 26 breaks expo cli, use `source ~/.nvm/nvm.sh; nvm use 24` first. all toolchain quirks are in research/build-plan.md under "results log".

## open questions to people

- perpl (pbj via portal or discord): builder id for testnet, how to cancel a resting trigger order (direct cancel returns OrderDoesNotExist), does contract 1.7.5 mean close fees
- agora (portal mentors tab, drakeevans): is there a staging environment (the payments bounty text mentions one, nothing public)
- register pehra.trade and @pehratrade, then move the passkey host off the vercel subdomain (test passkeys get recreated)

## next

t7 the guard in services/api (watch every enrolled account over the trading socket, push when liquidation distance is small, add margin from the push), then the real screens: markets with live prices, the ticket, the position card with the guard state.

layout: apps/mobile (expo app), packages/perpl (typed perpl client, smoke test in scripts/), services/api (bun, drip today, guard next), web/passkeys (the rpId host on vercel), spikes (the probes the plan rests on), scripts (android env).

assetlinks gotcha: the apk is signed with apps/mobile/android/app/debug.keystore, if the keystore changes the fingerprint in web/passkeys/.well-known/assetlinks.json must change too and google caches it for an hour.
