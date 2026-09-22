// message types on the perpl websockets, numbers as the server sends them
export const MT = {
  ping: 1,
  status: 3,
  subscribe: 5,
  subscribed: 6,
  gasPrice: 7,
  marketConfig: 8,
  marketState: 9,
  funding: 10,
  candlesSnapshot: 11,
  candlesUpdate: 12,
  bookSnapshot: 15,
  bookUpdate: 16,
  tradesSnapshot: 17,
  tradesUpdate: 18,
  walletSnapshot: 19,
  walletUpdate: 20,
  accountUpdate: 21,
  order: 22,
  ordersSnapshot: 23,
  ordersUpdate: 24,
  fillsUpdate: 25,
  positionsSnapshot: 26,
  positionsUpdate: 27,
  accountStats: 28,
  signIn: 29,
  heartbeat: 100,
} as const

export const OrderType = {
  openLong: 1,
  openShort: 2,
  closeLong: 3,
  closeShort: 4,
  cancel: 5,
  addCollateral: 6,
  change: 7,
} as const

export const Flag = { gtc: 0, postOnly: 1, fok: 2, ioc: 4 } as const

// trigger conditions: last or mark price, above or below
export const Trigger = { gteLast: 1, lteLast: 2, gteMark: 3, lteMark: 4 } as const

export const OrderStatus = {
  pending: 1, open: 2, partial: 3, filled: 4, canceled: 5, expired: 6,
  failed: 7, untriggered: 8, triggered: 9, executed: 10,
} as const

// status reasons seen so far, the full list is 0 to 69 in the api docs
export const Reason: Record<number, string> = {
  13: 'PositionClosed',
  28: 'LinkedPositionClosed',
  32: 'OrderDescIdTooLow',
  33: 'OrderDoesNotExist',
  34: 'AmountExceedsAvailableBalance',
  35: 'OrderPlaced',
  43: 'TakerOrderFilled',
}

export type OrderRequest = {
  mt: 22
  sn: number
  rq: number
  mkt: number
  acc: number
  t: number
  p: number
  s: number
  a?: string
  ms?: number
  mnp?: number
  fl: number
  tp?: number
  tpc?: number
  tr?: number
  lp?: number
  lv: number
  lb: number
  oid?: number
  bf?: number
}

export type Account = { id: number; fw: boolean; fr: boolean; ft: number; lfr: number; b: string; lb: string; h?: any[] }
export type Position = { pid: number; mkt: number; sd: number; s: number; ep: number; c: string; lv: number; st?: number; sr?: number; cpnl?: string }
export type Order = { oid: number; rq: number; mkt: number; t: number; st: number; sr: number; fr?: number; p: number; s: number; fs?: number; fp?: number; tp?: number; tpc?: number; lp?: number; r?: boolean }
export type MarketState = { orl: number; mrk: number; lst: number; mid: number; bid: number; ask: number; prv: number; dv: number; dva: string; oi: number; tvl: string }
