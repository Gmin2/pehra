# ui and ux: how pehra's screens are built and tested

for any agent picking this up. the product decisions are in ../research/product-brief.md, the screen map in ../research/ui-map.md, the build state in STATUS.md.

## the approach

the ui is the family wallet recreation in ../ui/mobile (react native, expo router, reanimated 4, gesture handler, a tray system, keypad amount entry, a chart with scrubbing, confetti, haptics). it was ported whole into apps/mobile on sept 23 and runs as is under pehra's package. every pehra screen is built from those pieces, same components, same springs, same trays, and only what pehra does not need is hidden. the user reviews one screen at a time before the next one starts. no batching.

one token changed so far: the accent, family's blue is pehra dusk (#6553B9) through `colors.blue` in src/ui/theme.ts. the brand board (../brand/tokens.json: manrope, paper background, ink, dusk, mist, five mascot states) is not applied yet. applying it is a theme file change that touches every screen at once.

## where things are in apps/mobile

- `app/` the routes. `_layout.tsx` (providers, sheet host, loads src/polyfills first), `index.tsx` (redirects to onboarding or home), `onboarding.tsx` (built), `portfolio.tsx` home, `token.tsx` market detail, `transaction.tsx` ticket, `activity.tsx`, `receive.tsx` fund, `browser.tsx` becomes the guard tab, `settings.tsx`, `wallet.tsx` account, `remove.tsx` sign out, `dev.tsx` the tracer bullet spike screen with the t5 to t7 buttons and the bench
- `src/ui/` the family prototype: `theme.ts`, `components.tsx`, `SheetHost.tsx` (trays), `Trays.tsx` and `FlowTrays.tsx` (tray contents by id), `store.tsx` (family's app state plus pehra's session, stored account and `pehraAccount()` for the card), `model.ts`, `data.ts` (family's demo data, still used by unbuilt screens), `Success.tsx`, `assets/` (family art plus `pehra-*` mascot states and marks)
- `src/` pehra's core: `account.ts` (mera passkey, key derivation, secure store), `trade.ts` (`prepareAccount` for onboarding, `firstTrade` and `closeAll` for the dev screen, the drip call), `guard.ts` (enroll, state, relayed orders), `warm.ts` (rpc websocket, market data stream, the phone's own trading socket for accounts without a guard), `push.ts`, `keys.ts` (api key and the onboarded flag in secure store), `live.ts` (hooks: `useMarkets`, `useAccount`, formatters), `log.ts` (the log mirror), `bench.ts`, `polyfills.ts`

## how a screen gets built

1. read the family screen and its trays first, keep its structure and motion
2. swap the data for the live hooks in src/live.ts and the actions in src/guard.ts and src/trade.ts
3. hide, do not delete, what pehra does not need
4. log every step through `log()` in src/log.ts so the run can be read from the server
5. typecheck: `cd apps/mobile && npx tsc --noEmit` (no `any`, the user's rule)
6. metro picks the change up live. reload the app on the phone with the deep link below
7. run the screen on the phone, read the log, screenshot only when the phone is not being used for something else
8. stop and ask the user for feedback before the next screen

## the build and run loop

```
cd pehra && . scripts/android-env.sh            # project sdk, jdk 17, node 24 via nvm, expo and gradle homes under ../tmp/claude
cd apps/mobile && npx expo start --dev-client --port 8081    # metro
cd services/api && bun run src/index.ts          # drip, guard, push, log mirror on :8787
adb reverse tcp:8081 tcp:8081; adb reverse tcp:8787 tcp:8787   # the phone is on 5g, it reaches the laptop through usb
adb shell am start -a android.intent.action.VIEW -d "exp+pehra://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

reading the phone: `grep phone ../tmp/claude/api.log` (every `log()` line lands there) or `adb logcat -v time ReactNativeJS:V '*:S'`. screenshot: `adb exec-out screencap -p > file.png`. a fresh install: `adb shell pm clear trade.pehra.app` (the passkey survives on the google account, the app lands on onboarding).

a native rebuild (`npx expo run:android`, about four to seven minutes) is needed only when native dependencies change: expo-router, reanimated, gesture handler, screens, safe area, svg, keyboard controller, haptics, clipboard, linear gradient, async storage, quick crypto, notifications, secure store. javascript changes never need it. after a change to app.json plugins run `npx expo prebuild --platform android --no-install` first. android/ is generated and not tracked; `android/local.properties` must point at the project sdk and `android/app/google-services.json` comes from apps/mobile.

## what is tested and how

- packages/perpl: `pnpm test` (24 unit tests, the socket state machine over a fake websocket, guard math against perpl's worked example, units, crypto)
- the trade path end to end: `pnpm cold-start` (a throwaway key through funding, setup, enrollment, sign in, a fill, timed per step, needs the api running)
- the guard: `bun run scripts/guard-drill.ts` in services/api (opens a position, forces the threshold, expects a margin add within seconds)
- the phone: the screen itself, watched through the log, timed with the `log()` lines. the dev screen keeps the raw buttons for every tracer bullet

## the phone and the servers

the test device is a nothing a069 on android 16 (serial 002956623001358), google password manager as the passkey provider, usually on 5g. numbers measured on it are in ../research/build-plan.md. the api holds the guard keys and push tokens in services/api/data (gitignored) and needs services/api/.env with the dev private key. firebase project pehra-ae5c6 sends the push.

## gotchas that cost hours

- metro serves a stale bundle when the workspace root is huge; the root is pehra/ now, keep it that way
- the adb daemon restarting drops both reverse tunnels, re add them when the phone shows "unexpected end of stream"
- the api process can die between sessions, check `/health` before blaming the app
- the phone's own perpl trading socket gets closed with "ping timeout"; enrolled accounts trade through the guard's server session instead
- perpl grants about 3x on testnet MON whatever leverage is asked; read it off the position
- a fresh account cannot spend for about four blocks after funding (monad's reserve balance rule), handled in the perpl package
- the mascot png is purple, on the purple card use the two tone variant
