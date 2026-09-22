# spikes

read only probes against monad testnet that the build plan rests on. run with bun after `pnpm install` here.

- `testnet-contracts.ts` AUSD, agora faucet, settlement pair, perpl exchange, p256 precompile, 7702 delegates, gas
- `testnet-proxies.ts` eip-1967 implementations behind the proxies and the AUSD eip-712 domain
- `testnet-websockets.ts` monadNewHeads commitState and perpl market data stream
- `testnet-contracts.result.json` output from sept 22 2026

tracer bullets (need `../services/api/.env` with DEV_PRIVATE_KEY, and after t2 the PERPL_API_KEY and PERPL_API_SECRET it writes):

- `t0.ts` balances and the agora AUSD faucet
- `t1.ts` approve, perpl createAccount, allowOrderForwarding, getAccountByAddr
- `t2.ts` api key enrollment (works with no origin header) and trading ws sign in
- `t3.ts <size> <lv>` one ioc market order on MON
- `perplws.ts` the shared sign in helper
- `t4.ts` stop and take profit triggers linked to the position, margin add, cancel, close
