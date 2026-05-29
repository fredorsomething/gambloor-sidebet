/**
 * In-memory order book + pure matching for one market.
 *
 * Matching is integer-only and supports three match types:
 *   NORMAL - taker trades an existing share holder on the same outcome.
 *   MINT   - (binary) two buyers of opposite outcomes mint a complete set; the
 *            combined collateral (= qty micro-USDC) backs the set in reserve.
 *   MERGE  - (binary) two sellers of opposite outcomes merge a complete set,
 *            releasing the qty micro-USDC reserve back to them.
 *
 * `planMatch` is a pure read (no mutation) so the engine can commit the ledger
 * before mutating the book. `applyPlan` then mutates the in-memory book.
 */
import {
  MAX_PRICE,
  MIN_PRICE,
  SCALE,
  costOf,
  feeOf,
  type Side,
} from "../../lib/exchange/units";
import type {
  BookLevel,
  BookSnapshot,
  FillPlan,
  IncomingOrder,
  MatchPlan,
  OutcomeBook,
  RestingOrder,
} from "../../lib/exchange/types";

type Candidate = {
  order: RestingOrder;
  effectivePrice: bigint; // ask (for taker BUY) or bid (for taker SELL) on taker outcome
  matchType: "NORMAL" | "MINT" | "MERGE";
};

export class MarketBook {
  readonly marketId: number;
  readonly numOutcomes: number;
  private seq = 0;
  // Per-outcome resting orders.
  private bids: Map<number, RestingOrder[]> = new Map();
  private asks: Map<number, RestingOrder[]> = new Map();
  private byId: Map<string, RestingOrder> = new Map();

  constructor(marketId: number, numOutcomes: number) {
    this.marketId = marketId;
    this.numOutcomes = numOutcomes;
    for (let i = 0; i < numOutcomes; i++) {
      this.bids.set(i, []);
      this.asks.set(i, []);
    }
  }

  get isBinary(): boolean {
    return this.numOutcomes === 2;
  }

  nextSeq(): number {
    return ++this.seq;
  }

  currentSeq(): number {
    return this.seq;
  }

  /** Restore the seq counter when rehydrating from persistence. */
  setSeq(v: number) {
    this.seq = Math.max(this.seq, v);
  }

  getOrder(id: string): RestingOrder | undefined {
    return this.byId.get(id);
  }

  allOrders(): RestingOrder[] {
    return [...this.byId.values()];
  }

  /** Insert a resting order, keeping price-time priority sorted. */
  addResting(o: RestingOrder) {
    this.byId.set(o.id, o);
    const arr = o.side === "BUY" ? this.bids.get(o.outcomeIndex)! : this.asks.get(o.outcomeIndex)!;
    arr.push(o);
    if (o.side === "BUY") {
      // best bid = highest price first, then earliest.
      arr.sort((a, b) => (b.price > a.price ? 1 : b.price < a.price ? -1 : a.seq - b.seq));
    } else {
      // best ask = lowest price first, then earliest.
      arr.sort((a, b) => (a.price > b.price ? 1 : a.price < b.price ? -1 : a.seq - b.seq));
    }
    this.setSeq(o.seq);
  }

  removeOrder(id: string): RestingOrder | undefined {
    const o = this.byId.get(id);
    if (!o) return undefined;
    this.byId.delete(id);
    const arr = o.side === "BUY" ? this.bids.get(o.outcomeIndex)! : this.asks.get(o.outcomeIndex)!;
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr.splice(i, 1);
    return o;
  }

  private candidatesFor(incoming: IncomingOrder, limit: bigint): Candidate[] {
    const o = incoming.outcomeIndex;
    const other = this.isBinary ? 1 - o : -1;
    const out: Candidate[] = [];

    if (incoming.side === "BUY") {
      // NORMAL: resting asks on the same outcome.
      for (const r of this.asks.get(o) ?? []) {
        if (r.maker === incoming.maker) continue;
        if (r.price <= limit) out.push({ order: r, effectivePrice: r.price, matchType: "NORMAL" });
      }
      // MINT: resting bids on the complementary outcome (binary only).
      if (other >= 0) {
        for (const r of this.bids.get(other) ?? []) {
          if (r.maker === incoming.maker) continue;
          const eff = SCALE - r.price;
          if (eff <= limit) out.push({ order: r, effectivePrice: eff, matchType: "MINT" });
        }
      }
      // Best (lowest) effective ask first, then FIFO.
      out.sort((a, b) =>
        a.effectivePrice > b.effectivePrice
          ? 1
          : a.effectivePrice < b.effectivePrice
            ? -1
            : a.order.seq - b.order.seq,
      );
    } else {
      // NORMAL: resting bids on the same outcome.
      for (const r of this.bids.get(o) ?? []) {
        if (r.maker === incoming.maker) continue;
        if (r.price >= limit) out.push({ order: r, effectivePrice: r.price, matchType: "NORMAL" });
      }
      // MERGE: resting asks on the complementary outcome (binary only).
      if (other >= 0) {
        for (const r of this.asks.get(other) ?? []) {
          if (r.maker === incoming.maker) continue;
          const eff = SCALE - r.price;
          if (eff >= limit) out.push({ order: r, effectivePrice: eff, matchType: "MERGE" });
        }
      }
      // Best (highest) effective bid first, then FIFO.
      out.sort((a, b) =>
        b.effectivePrice > a.effectivePrice
          ? 1
          : b.effectivePrice < a.effectivePrice
            ? -1
            : a.order.seq - b.order.seq,
      );
    }
    return out;
  }

  /**
   * Plan (without mutating) how `incoming` matches the book. `feeBps` is the
   * taker fee used to size the up-front fee lock for BUY orders.
   */
  planMatch(incoming: IncomingOrder, feeBps: number): MatchPlan {
    const isBuy = incoming.side === "BUY";
    const limit =
      incoming.type === "MARKET" ? (isBuy ? MAX_PRICE : MIN_PRICE) : incoming.price;

    const candidates = this.candidatesFor(incoming, limit);
    const fills: FillPlan[] = [];
    let remaining = incoming.qty;

    for (const c of candidates) {
      if (remaining <= 0n) break;
      const fillQty = remaining < c.order.remaining ? remaining : c.order.remaining;
      if (fillQty <= 0n) continue;

      const makerPrice = c.order.price;
      let takerPrice: bigint;
      let takerCost: bigint;
      let makerCost: bigint;

      if (c.matchType === "NORMAL") {
        takerPrice = makerPrice;
        const v = costOf(makerPrice, fillQty);
        takerCost = v;
        makerCost = v;
      } else if (c.matchType === "MINT") {
        // Two buyers; reserve backing = fillQty micro-USDC.
        takerPrice = SCALE - makerPrice;
        makerCost = costOf(makerPrice, fillQty);
        takerCost = fillQty - makerCost;
      } else {
        // MERGE: two sellers; reserve release = fillQty micro-USDC.
        takerPrice = SCALE - makerPrice;
        makerCost = costOf(makerPrice, fillQty); // maker proceeds
        takerCost = fillQty - makerCost; // taker proceeds
      }

      fills.push({
        matchType: c.matchType,
        qty: fillQty,
        takerSide: incoming.side,
        takerOutcome: incoming.outcomeIndex,
        takerPrice,
        takerCost,
        makerOrderId: c.order.id,
        maker: c.order.maker,
        makerSide: c.order.side,
        makerOutcome: c.order.outcomeIndex,
        makerPrice,
        makerCost,
        makerFullyConsumed: fillQty === c.order.remaining,
        makerLockedBefore: c.order.lockedRemaining,
      });
      remaining -= fillQty;
    }

    const filledQty = incoming.qty - remaining;

    // Up-front lock for the incoming order (full size at limit).
    const incomingLockNotional = isBuy
      ? costOf(limit, incoming.qty)
      : incoming.qty; // SELL locks shares
    const incomingFeeLock = isBuy ? feeOf(incomingLockNotional, feeBps) : 0n;

    let rest: RestingOrder | null = null;
    if (incoming.type === "LIMIT" && remaining > 0n) {
      const seq = this.nextSeq();
      rest = {
        id: cryptoRandomId(),
        marketId: incoming.marketId,
        maker: incoming.maker,
        side: incoming.side,
        outcomeIndex: incoming.outcomeIndex,
        price: incoming.price,
        qty: remaining,
        remaining,
        lockedRemaining: isBuy ? costOf(incoming.price, remaining) : remaining,
        createdAt: Date.now(),
        seq,
      };
    }

    return { incoming, fills, filledQty, rest, incomingLockNotional, incomingFeeLock };
  }

  /** Mutate the book to reflect a committed plan. */
  applyPlan(plan: MatchPlan) {
    for (const f of plan.fills) {
      const o = this.byId.get(f.makerOrderId);
      if (!o) continue;
      if (f.makerFullyConsumed) {
        this.removeOrder(o.id);
      } else {
        o.remaining -= f.qty;
        o.lockedRemaining -= o.side === "BUY" ? f.makerCost : f.qty;
        if (o.lockedRemaining < 0n) o.lockedRemaining = 0n;
      }
    }
    if (plan.rest) this.addResting(plan.rest);
  }

  bestBid(outcome: number): bigint | null {
    const a = this.bids.get(outcome);
    return a && a.length ? a[0].price : null;
  }

  bestAsk(outcome: number): bigint | null {
    const a = this.asks.get(outcome);
    return a && a.length ? a[0].price : null;
  }

  snapshot(maxLevels = 50): BookSnapshot {
    const outcomes: OutcomeBook[] = [];
    for (let i = 0; i < this.numOutcomes; i++) {
      outcomes.push({
        outcomeIndex: i,
        bids: aggregate(this.bids.get(i) ?? [], maxLevels),
        asks: aggregate(this.asks.get(i) ?? [], maxLevels),
      });
    }
    return { marketId: this.marketId, numOutcomes: this.numOutcomes, outcomes, ts: Date.now() };
  }
}

function aggregate(orders: RestingOrder[], maxLevels: number): BookLevel[] {
  const byPrice = new Map<string, bigint>();
  for (const o of orders) {
    if (o.remaining <= 0n) continue;
    const k = o.price.toString();
    byPrice.set(k, (byPrice.get(k) ?? 0n) + o.remaining);
  }
  const levels = [...byPrice.entries()].map(([p, shares]) => ({
    priceMicro: p,
    price: microToProb(BigInt(p)),
    sharesMicro: shares.toString(),
    shares: microToDecimal(shares),
  }));
  // `orders` are already price-time sorted, so the first occurrence order is the
  // priority order; re-sort levels by price to be safe.
  levels.sort((a, b) => Number(BigInt(b.priceMicro) - BigInt(a.priceMicro)));
  return levels.slice(0, maxLevels);
}

function microToProb(micro: bigint): string {
  return microToDecimal(micro);
}

function microToDecimal(micro: bigint): string {
  const whole = micro / SCALE;
  const frac = micro % SCALE;
  if (frac === 0n) return whole.toString();
  const f = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${f}`;
}

let counter = 0;
function cryptoRandomId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}-${counter}`;
}
