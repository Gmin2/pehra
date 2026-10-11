# pehra

**the automation layer of monad, through perpl.** rules that trade perps for you, armed with one fingerprint, running while you sleep. the key they run on cannot withdraw.

android app on monad testnet. a mera passkey is the account, AUSD through agora is the money, perpl is the exchange.

## what it does

**it protects you**
- the guard adds margin before perpl can liquidate you, inside a daily cap you set
- stops stay hidden off the book. pehra sells in slices when the price gets there, never past your floor, and a backstop rests on perpl in case pehra is down
- stops trail the price and move to breakeven after the first take profit

**it acts on rules you sign**
- "when this happens, do that": 10 triggers (a take profit fills, a stop sells, price, distance to liquidation, funding turns, a time, every day, ausd drifts) and 8 actions
- recipes: a few rules that work together, armed with one signature. each one is replayed on the last 30 days of real perpl candles before you arm it, and the chart shows where it got in and out

**it is social**
- a leaderboard of every perpl account, read from monad
- watch any address, pehra pushes when they trade or get close to liquidation
- copy a trader at your own size, careful / steady / bold. their money and yours never mix
- share a recipe as a link that opens in the app

## numbers from the live system

| | |
|---|---|
| copy a trade | opened **6 blocks** (about 2.4s) after the trader, closed 4 blocks after. read straight from monad's blocks |
| saved from liquidation | **3 times**, 2 accounts, closest call 13.3% from liquidation, margin in **0.9s** at the fastest |
| returning user | 1.1s from tap to fill through the guard's session |
| guard drill | saw the position 350ms after the fill, margin in by 1.4s, 28% to 66% from liquidation |
| kill test | api killed with a stop armed, perpl fired the backstop on its own 7s later, pehra recorded it on restart |
| breakeven and trailing | proven live: a take profit step fills, the stop moves to entry plus both fees; a trailing stop moved 3 times with exactly one backstop each time |
| a recipe on its own | catch the breakout fired on oct 11 when mon broke 2% up: a 1,177 mon long opened with its trailing stop and the guard on it |

every one of these has a transaction. the proof page in the app lists them and the run log is anchored on monad every hour.

## what a clone gets wrong

- **the key.** pehra trades on a perpl api key the passkey enrolled. perpl does not let that key withdraw, so the server can add margin at 3am and still cannot take your money. that is perpl's rule, not a promise from us
- **visible stops get hunted.** a stop on the book is a target. pehra's stop is hidden and sells through the live book in slices with a floor. the backstop on perpl is the safety net, placed wider, and is kept at the live size (perpl resizes linked triggers, a too big trigger fails forever)
- **"it fired" is not "it filled".** every action is an intent with a state. a send that times out is unknown, never resent blind: reconcile reads perpl and settles it. a crash after perpl confirmed but before we wrote it down is found and recorded, not repeated
- **reconnects lose fills.** perpl testnet drops sessions. a take profit that fills during a drop is looked for again for 10 minutes, so the stop still moves to breakeven
- **copying merges positions.** perpl keeps one position per market. a naive copy opens on top of yours and sells both when the trader closes. pehra never opens a copy on a market you hold and closes only what the copy bought
- **replays that lie.** pehra replays on perpl's own 5 minute candles, the worst price first inside each candle, levels kept at the distance they have now, fees in, funding left out and said so. the chart draws the same candles the replay judged on, a 15 minute spike included
- **trust me logs.** every run is hashed onto the one before it and the head goes onchain every hour. anyone can check the chain from the app

## trust boundary

| who | can | cannot |
|---|---|---|
| your passkey (phone) | everything: withdraw, send, turn the guard off, the escape hatch that closes positions straight on the exchange | |
| pehra's server | place and cancel orders, add margin, through the enrolled api key | withdraw, send, change who owns the account |
| a stranger | read public things: the leaderboard, watched positions, the proof | arm, cancel or change anything. every write needs the passkey's signature or its session |

## how it is built

- `apps/mobile`: expo, react native, expo router. passkeys through mera, the wallet is an address made from the passkey
- `services/api`: node, sqlite. the guard, the rules engine, replay, push, the copy feed that reads monad's blocks
- `packages/perpl`: the shared perpl client, rules, chains, recipes, replay, all tested (118 tests)
- `indexer`: envio over perpl's exchange, every open, close and liquidation by account
- `deploy`: docker compose on one azure vm, postgres, hasura, the indexer, the api, caddy for https

## try it

- the hosted api: https://40-80-86-31.sslip.io/health
- the app: the release apk from the github release, android only (passkeys need google password manager, desktop chrome passkeys have no prf)
- testnet only: the faucet button on fund gives test usdc

## notes

- testnet only. perpl and agora are on monad testnet
- the release apk is signed with the same key as the development build, so the passkey site's assetlinks keep matching
