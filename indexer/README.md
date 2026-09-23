# pehra indexer

envio hyperindex over perpl's exchange on monad testnet (0x1964c32f0be608e7d29302aff5e61268e72080cc),
from block 64,400,000. every event that belongs to a perpl account becomes an `Activity` row keyed by
account id, with the transaction hash, so pehra's history is read from the chain. accounts come from
`AccountCreated`.

events: CollateralDeposit, CollateralWithdrawal, IncreasePositionCollateral, PositionOpenedV2,
PositionIncreasedV2, PositionDecreased, PositionClosed, PositionLiquidated, AccountCreated. amounts are
perpl wire units (collateral 6 decimals, prices and lots per market). positionType on chain is 0 long,
1 short.

run locally (docker, node 22):

```
cp .env.example .env   # ENVIO_API_TOKEN from envio.dev/app/api-tokens (hypersync)
pnpm install
pnpm dev               # postgres on ENVIO_PG_PORT, graphql on HASURA_EXTERNAL_PORT (8080)
```

query: `{ Activity(where:{accountId:{_eq:"679"}}, order_by:{block:desc}) { kind side priceWire pnlCns tx timestamp } }`

checked sept 24: 700k blocks back to sept 21 in 20s, account 679's rows match the guard server's
record tx for tx (the guard's 1.12 ausd rescue 0x50f01e..., every open and close), live events land
2.5s after the fill.
