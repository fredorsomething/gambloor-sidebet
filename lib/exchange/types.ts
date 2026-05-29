import type { MatchType, OrderType, Side } from "./units";

/** A resting limit order held in the live book (Redis/memory). */
export type RestingOrder = {
  id: string;
  marketId: number;
  maker: string; // lowercased
  side: Side;
  outcomeIndex: number;
  price: bigint; // micro-USDC per share
  qty: bigint; // original size (micro-shares)
  remaining: bigint; // unfilled size (micro-shares)
  // Collateral (BUY) or shares (SELL) still reserved for this order, in micro
  // units. Decremented as the order fills; refunded on full-fill / cancel.
  lockedRemaining: bigint;
  createdAt: number; // ms epoch (FIFO ordering)
  seq: number; // monotonic tie-breaker for stable price-time priority
};

/** A new order arriving at the engine. */
export type IncomingOrder = {
  marketId: number;
  maker: string;
  side: Side;
  outcomeIndex: number;
  type: OrderType;
  price: bigint; // for LIMIT; ignored for MARKET (treated as MAX/MIN)
  qty: bigint; // micro-shares
};

/** One matched fill within a match plan. */
export type FillPlan = {
  matchType: MatchType;
  qty: bigint;
  // taker = the incoming order's owner
  takerSide: Side;
  takerOutcome: number;
  takerPrice: bigint; // execution price on the taker's outcome
  takerCost: bigint; // micro-USDC the taker pays (BUY) / receives (SELL), pre-fee
  // maker = the resting order
  makerOrderId: string;
  maker: string;
  makerSide: Side;
  makerOutcome: number;
  makerPrice: bigint;
  makerCost: bigint; // micro-USDC the maker pays (BUY) / receives (SELL)
  makerFullyConsumed: boolean;
  makerLockedBefore: bigint; // maker order's lockedRemaining before this fill
};

/** The result of planning a match (no mutation performed). */
export type MatchPlan = {
  incoming: IncomingOrder;
  fills: FillPlan[];
  filledQty: bigint;
  // The leftover of the incoming order that should rest on the book (LIMIT only).
  rest: RestingOrder | null;
  // Total micro-units the incoming order should have locked up-front:
  //   BUY  -> collateral notional (+ taker fee handled separately)
  //   SELL -> shares
  incomingLockNotional: bigint;
  incomingFeeLock: bigint;
};

/** A signed movement on one ledger account. */
export type AccountDelta = {
  key: string;
  balanceDelta: bigint;
  lockedDelta: bigint;
};

/** Pure economic effects of applying a match plan (for the ledger + invariant). */
export type MatchEffects = {
  deltas: AccountDelta[];
  fills: FillPlan[];
  feeBps: number;
};

/** Public order-book level for the UI (aggregated by price). */
export type BookLevel = {
  price: string; // probability string, e.g. "0.62"
  priceMicro: string;
  shares: string; // aggregated remaining shares (decimal)
  sharesMicro: string;
};

export type OutcomeBook = {
  outcomeIndex: number;
  bids: BookLevel[]; // sorted best (highest) first
  asks: BookLevel[]; // sorted best (lowest) first
};

export type BookSnapshot = {
  marketId: number;
  numOutcomes: number;
  outcomes: OutcomeBook[];
  ts: number;
};

export type TradeTapeItem = {
  outcomeIndex: number;
  side: Side;
  price: string;
  shares: string;
  ts: number;
};
