// perpl's exchange events for pehra's history. every event that belongs to an account becomes one
// Activity row keyed by perpl account id, with the transaction behind it, so the app's history is
// read from the chain rather than from pehra's own server.
import { indexer } from "envio";

const fields = { transaction: ["hash"], block: ["timestamp"] } as const;
// perpl's positionType on chain: 0 long, 1 short (checked against account 679's eth short and mon longs)
const side = (t: bigint) => (t === 0n ? "long" : t === 1n ? "short" : undefined);

type Row = {
  kind: string;
  accountId: bigint;
  perpId?: bigint;
  side?: string;
  priceWire?: bigint;
  lotWire?: bigint;
  amountCns?: bigint;
  pnlCns?: bigint;
  fundingCns?: bigint;
  leverageHdths?: bigint;
};
type Ev = { chainId: number; logIndex: number; block: { number: number; timestamp: number }; transaction: { hash: string } };
const row = (event: Ev, r: Row) => ({
  id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
  perpId: undefined,
  side: undefined,
  priceWire: undefined,
  lotWire: undefined,
  amountCns: undefined,
  pnlCns: undefined,
  fundingCns: undefined,
  leverageHdths: undefined,
  ...r,
  block: event.block.number,
  timestamp: event.block.timestamp,
  tx: event.transaction.hash,
});

indexer.onEvent({ contract: "PerplExchange", event: "AccountCreated", fields }, async ({ event, context }) => {
  context.Account.set({ id: event.params.id.toString(), address: event.params.account.toLowerCase(), createdBlock: event.block.number, createdTx: event.transaction.hash });
});

indexer.onEvent({ contract: "PerplExchange", event: "CollateralDeposit", fields }, async ({ event, context }) => {
  context.Activity.set(row(event, { kind: "deposit", accountId: event.params.accountId, amountCns: event.params.amountCNS }));
});

indexer.onEvent({ contract: "PerplExchange", event: "CollateralWithdrawal", fields }, async ({ event, context }) => {
  context.Activity.set(row(event, { kind: "withdraw", accountId: event.params.accountId, amountCns: event.params.amountCNS }));
});

indexer.onEvent({ contract: "PerplExchange", event: "IncreasePositionCollateral", fields }, async ({ event, context }) => {
  context.Activity.set(row(event, { kind: "margin", accountId: event.params.accountId, perpId: event.params.perpId, amountCns: event.params.amountCNS }));
});

indexer.onEvent({ contract: "PerplExchange", event: "PositionOpenedV2", fields }, async ({ event, context }) => {
  const p = event.params;
  context.Activity.set(row(event, { kind: "open", accountId: p.accountId, perpId: p.perpId, side: side(p.positionType), priceWire: p.pricePNS, lotWire: p.lotLNS, amountCns: p.depositCNS, leverageHdths: p.leverageHdths }));
});

indexer.onEvent({ contract: "PerplExchange", event: "PositionIncreasedV2", fields }, async ({ event, context }) => {
  const p = event.params;
  context.Activity.set(row(event, { kind: "increase", accountId: p.accountId, perpId: p.perpId, side: side(p.positionType), priceWire: p.pricePNS, lotWire: p.endLotLNS - p.startLotLNS, amountCns: p.endDepositCNS - p.startDepositCNS, leverageHdths: p.leverageHdths }));
});

indexer.onEvent({ contract: "PerplExchange", event: "PositionDecreased", fields }, async ({ event, context }) => {
  const p = event.params;
  context.Activity.set(row(event, { kind: "decrease", accountId: p.accountId, perpId: p.perpId, side: side(p.positionType), lotWire: p.startLotLNS - p.endLotLNS, pnlCns: p.deltaPnlCNS, fundingCns: p.fundingCNS }));
});

indexer.onEvent({ contract: "PerplExchange", event: "PositionClosed", fields }, async ({ event, context }) => {
  const p = event.params;
  context.Activity.set(row(event, { kind: "close", accountId: p.accountId, perpId: p.perpId, side: side(p.positionType), priceWire: p.pricePNS, pnlCns: p.deltaPnlCNS, fundingCns: p.fundingCNS }));
});

indexer.onEvent({ contract: "PerplExchange", event: "PositionLiquidated", fields }, async ({ event, context }) => {
  const p = event.params;
  context.Activity.set(row(event, { kind: "liquidated", accountId: p.posAccountId, perpId: p.perpId, side: side(p.positionType), priceWire: p.liqPricePNS, lotWire: p.liqLotLNS, pnlCns: p.deltaPnlCNS, fundingCns: p.fundingCNS }));
});
