import { initialWallets, tokens, type Wallet, type Token } from "./data";
export type Transaction = {
  kind: "send" | "swap" | "nft";
  amount: string;
  recipient: string;
  token: Token;
  output: Token;
  step: "select" | "amount" | "confirm" | "submitting";
  approved: boolean;
  slippage: number;
  speed: "Normal" | "Fast" | "Urgent";
  ens: string[];
  nfts: number[];
};
export type Sheet = { id: string; title: string };
export const initialTransaction = (): Transaction => ({
  kind: "send",
  amount: "1.00",
  recipient: "James",
  token: tokens[1],
  output: tokens[6],
  step: "amount",
  approved: false,
  slippage: 1,
  speed: "Normal",
  ens: [],
  nfts: [0, 1],
});
export function enterDigit(amount: string, key: string) {
  if (key === "back") return amount.slice(0, -1) || "0";
  if (key === ".") return amount.includes(".") ? amount : amount + ".";
  if (!/^\d$/.test(key) || amount.replace(".", "").length >= 12) return amount;
  if (amount.includes(".") && amount.split(".")[1].length >= 8) return amount;
  return amount === "0" ? key : amount + key;
}
export function formatAmount(amount: string) {
  const [integer, fraction] = amount.split(".");
  return (
    Number(integer || 0).toLocaleString("en-US") +
    (fraction === undefined ? "" : "." + fraction)
  );
}
export function groupWallets(wallets: Wallet[]) {
  const seeds: Record<string, number> = {
    bff: 1,
    rain: 1,
    benji: 1,
    lunch: 1,
    family: 3,
    fees: 3,
    nft: 6,
    spending: 6,
  };
  return [1, 3, 6]
    .map((id) => ({
      id,
      wallets: wallets.filter((w) => (w.group ?? seeds[w.id] ?? 6) === id),
    }))
    .filter((g) => g.wallets.length);
}
export function flowScene(scene: string) {
  let route = "/",
    step = "group",
    wallet = initialWallets[1],
    token = tokens[4],
    pending = false,
    balance = false;
  const tx = initialTransaction();
  let sheet: Sheet | undefined;
  if (
    ["tokens", "empty", "collectibles", "reorder", "stealth"].includes(scene)
  ) {
    route = "/portfolio";
    if (scene === "empty") wallet = initialWallets[6];
    if (scene === "stealth") balance = true;
  }
  if (["settings", "receive", "browser"].includes(scene)) route = "/" + scene;
  if (
    [
      "group",
      "existing",
      "import",
      "icloud",
      "index",
      "backup",
      "terms",
      "quiz",
      "icloudExisting",
      "manual",
    ].includes(scene)
  ) {
    route = "/onboarding";
    step = scene;
  }
  if (
    [
      "send",
      "swap",
      "confirm",
      "swapConfirm",
      "sendNft",
      "sendSelect",
      "amount",
      "ens",
      "approval",
    ].includes(scene)
  ) {
    route = "/transaction";
    tx.kind = ["swap", "swapConfirm", "approval"].includes(scene)
      ? "swap"
      : ["sendNft", "ens"].includes(scene)
        ? "nft"
        : "send";
    tx.step = ["confirm", "swapConfirm", "ens"].includes(scene)
      ? "confirm"
      : ["sendSelect", "sendNft"].includes(scene)
        ? "select"
        : "amount";
    if (scene === "amount" || scene === "sendSelect") tx.amount = "0";
    if (tx.kind === "swap") {
      tx.token = tokens[0];
      tx.amount = "1";
      tx.output = tokens[1];
    }
    if (scene === "sendNft") tx.recipient = "Alex";
    if (scene === "approval") sheet = { id: "approval", title: "" };
  }
  if (scene === "remove") {
    route = "/remove";
    wallet = initialWallets[2];
  }
  if (scene === "options") {
    route = "/wallet";
    wallet = initialWallets[4];
    sheet = { id: "options", title: "Options" };
  }
  if (scene === "customize")
    sheet = { id: "customize", title: "Wallet Details" };
  if (scene === "new") sheet = { id: "new", title: "New Wallet" };
  if (scene === "feedback") sheet = { id: "help", title: "How can we help?" };
  if (scene === "refuel" || scene === "refuelPreview") {
    route = "/settings";
    sheet = {
      id: scene === "refuel" ? "refuelChains" : "refuelPreview",
      title: scene === "refuel" ? "Choose Chains" : "Refuel Gas",
    };
  }
  if (scene === "pending" || scene === "completed") {
    route = "/activity";
    pending = scene === "pending";
    sheet = { id: scene, title: "" };
    tx.amount = "100";
    tx.recipient = "Alex";
  }
  if (scene === "chart" || scene === "usdcChart") {
    route = "/token";
    if (scene === "usdcChart") token = tokens[6];
  }
  return {
    route,
    step,
    wallet,
    token,
    pending,
    balance,
    sheet,
    tx,
    tab: scene === "collectibles" ? "collectibles" : "tokens",
    reorder: scene === "reorder",
  };
}

export function moveItem<T>(items: T[], from: number, to: number) {
  if (from < 0 || from >= items.length) return items;
  const next = [...items],
    target = Math.max(0, Math.min(items.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}
export function maxSpend(token: Token, dollars: boolean, fee = 3.24) {
  const units = Number(token.amount.replaceAll(",", ""));
  return dollars
    ? Math.max(0, units * token.price - fee).toFixed(2)
    : Math.max(0, units - fee / token.price).toFixed(8);
}
export function validBackupAnswer(question: number, answer: string) {
  return ["pledge", "number", "fox"][question] === answer;
}
export function toggleItem<T>(items: T[], item: T) {
  return items.includes(item)
    ? items.filter((x) => x !== item)
    : [...items, item];
}
