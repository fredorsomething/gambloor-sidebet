/**
 * The single-writer exchange engine. Owns an in-memory MarketBook per market,
 * serializes all mutations per market through a promise queue (so matching is
 * race-free without locks), commits the ledger to Postgres BEFORE mutating the
 * book, mirrors the book to Redis, and publishes live updates over pub/sub.
 */
import type { PrismaClient } from "@prisma/client";

import { MarketBook } from "./core/orderbook";
import { computeEffects } from "./core/effects";
import { Ledger, type StatUpdate } from "./ledger";
import { RedisStore } from "./redisStore";
import {
  MAX_PRICE,
  MIN_PRICE,
  isValidPrice,
  type OrderType,
  type Side,
} from "../lib/exchange/units";
import type { IncomingOrder, RestingOrder } from "../lib/exchange/types";

export type PlaceResult = {
  filledQty: string;
  restId: string | null;
  fills: {
    matchType: string;
    qty: string;
    price: string;
    outcomeIndex: number;
    side: Side;
  }[];
};

type MarketState = {
  book: MarketBook;
  numOutcomes: number;
  feeBps: number;
  status: string;
  queue: Promise<unknown>;
};

export class ExchangeEngine {
  readonly ledger: Ledger;
  private markets = new Map<number, MarketState>();

  constructor(
    private prisma: PrismaClient,
    private store: RedisStore,
  ) {
    this.ledger = new Ledger(prisma);
  }

  /** Serialize an operation on a market's queue. */
  private enqueue<T>(marketId: number, fn: () => Promise<T>): Promise<T> {
    const st = this.markets.get(marketId);
    if (!st) throw new Error("market not loaded");
    const next = st.queue.then(fn, fn);
    // Keep the chain alive even if an op rejects.
    st.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async ensureMarket(marketId: number): Promise<MarketState> {
    const cached = this.markets.get(marketId);
    if (cached) return cached;

    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: { outcomes: true },
    });
    if (!market) throw new Error("market not found");

    const numOutcomes = market.outcomes.length || 2;
    const book = new MarketBook(marketId, numOutcomes);
    const orders = await this.store.loadOrders(marketId);
    for (const o of orders) book.addResting(o);
    const seq = await this.store.getSeq(marketId);
    book.setSeq(seq);

    const st: MarketState = {
      book,
      numOutcomes,
      feeBps: market.feeBps ?? 0,
      status: market.status,
      queue: Promise.resolve(),
    };
    this.markets.set(marketId, st);
    return st;
  }

  /** Force a reload of market metadata (status/fee) and book from Redis. */
  async reloadMarket(marketId: number): Promise<void> {
    this.markets.delete(marketId);
    await this.ensureMarket(marketId);
  }

  async snapshot(marketId: number) {
    const st = await this.ensureMarket(marketId);
    return st.book.snapshot();
  }

  async openOrdersFor(marketId: number, owner: string): Promise<RestingOrder[]> {
    const st = await this.ensureMarket(marketId);
    const lower = owner.toLowerCase();
    return st.book.allOrders().filter((o) => o.maker === lower && o.remaining > 0n);
  }

  private statsFor(st: MarketState, lastFillOutcome?: number, lastPrice?: bigint): StatUpdate[] {
    const out: StatUpdate[] = [];
    for (let i = 0; i < st.numOutcomes; i++) {
      out.push({
        outcomeIndex: i,
        bestBid: st.book.bestBid(i),
        bestAsk: st.book.bestAsk(i),
        ...(lastFillOutcome === i && lastPrice != null ? { lastPrice } : {}),
      });
    }
    return out;
  }

  async placeOrder(input: {
    marketId: number;
    maker: string;
    side: Side;
    outcomeIndex: number;
    type: OrderType;
    price: bigint;
    qty: bigint;
  }): Promise<PlaceResult> {
    const st = await this.ensureMarket(input.marketId);

    return this.enqueue(input.marketId, async () => {
      if (st.status !== "Open") throw new Error("market is not open for trading");
      if (input.qty <= 0n) throw new Error("qty must be positive");
      if (input.outcomeIndex < 0 || input.outcomeIndex >= st.numOutcomes) {
        throw new Error("bad outcome");
      }
      if (input.type === "LIMIT" && !isValidPrice(input.price)) {
        throw new Error("price out of range");
      }

      const maker = input.maker.toLowerCase();
      const incoming: IncomingOrder = {
        marketId: input.marketId,
        maker,
        side: input.side,
        outcomeIndex: input.outcomeIndex,
        type: input.type,
        price: input.type === "MARKET" ? (input.side === "BUY" ? MAX_PRICE : MIN_PRICE) : input.price,
        qty: input.qty,
      };

      const plan = st.book.planMatch(incoming, st.feeBps);

      // Validate the taker has the funds to lock up-front.
      if (input.side === "BUY") {
        const need = plan.incomingLockNotional + plan.incomingFeeLock;
        const { balance } = await this.ledger.getCollateral(maker);
        if (balance < need) throw new Error("insufficient collateral balance");
      } else {
        const shares = await this.ledger.getShares(maker, input.marketId);
        const have = shares.find((s) => s.outcomeIndex === input.outcomeIndex)?.balance ?? 0n;
        if (have < plan.incomingLockNotional) throw new Error("insufficient share balance");
      }

      const deltas = computeEffects(plan, st.feeBps);

      // Commit the ledger first; only then mutate the in-memory + Redis book.
      const lastFill = plan.fills[plan.fills.length - 1];
      await this.ledger.applyMatch({
        marketId: input.marketId,
        taker: maker,
        feeBps: st.feeBps,
        deltas,
        fills: plan.fills,
        stats: [],
      });

      // Mutate book.
      const removed = plan.fills.filter((f) => f.makerFullyConsumed).map((f) => f.makerOrderId);
      st.book.applyPlan(plan);

      // Persist to Redis: removed makers, updated partial makers, new resting order.
      const updatedIds = plan.fills
        .filter((f) => !f.makerFullyConsumed)
        .map((f) => f.makerOrderId);
      const toPut: RestingOrder[] = [];
      for (const id of updatedIds) {
        const o = st.book.getOrder(id);
        if (o) toPut.push(o);
      }
      if (plan.rest) toPut.push(plan.rest);
      await this.store.removeOrders(input.marketId, removed);
      await this.store.putOrders(toPut);
      await this.store.setSeq(input.marketId, st.book.currentSeq());

      // Persist book stats (best bid/ask + last price) to Postgres read model.
      await this.ledger.applyMatch({
        marketId: input.marketId,
        taker: maker,
        feeBps: st.feeBps,
        deltas: [],
        fills: [],
        stats: this.statsFor(st, lastFill?.takerOutcome, lastFill?.takerPrice),
      });

      await this.assertAndPublish(input.marketId, st, plan.fills);

      return {
        filledQty: plan.filledQty.toString(),
        restId: plan.rest?.id ?? null,
        fills: plan.fills.map((f) => ({
          matchType: f.matchType,
          qty: f.qty.toString(),
          price: f.takerPrice.toString(),
          outcomeIndex: f.takerOutcome,
          side: f.takerSide,
        })),
      };
    });
  }

  /**
   * Mint complete sets: convert `qty` micro-collateral into 1 share of every
   * outcome (reserve-backed). Optionally credits a just-confirmed on-chain
   * deposit first (idempotent) so the funds and the mint commit back-to-back
   * inside the per-market queue, minimising the window for the auto-sweep to
   * reclaim the freshly credited collateral. This is the liquidity primitive
   * for multi-outcome markets.
   */
  async splitSet(input: {
    marketId: number;
    owner: string;
    qty: bigint;
    deposit?: { amount: bigint; txHash: string; logIndex: number; chainId: number };
  }): Promise<{ ok: true; minted: string }> {
    const st = await this.ensureMarket(input.marketId);
    return this.enqueue(input.marketId, async () => {
      if (st.status !== "Open") throw new Error("market is not open for trading");
      if (input.qty <= 0n) throw new Error("qty must be positive");
      const owner = input.owner.toLowerCase();
      if (input.deposit) {
        await this.ledger.creditDeposit({ address: owner, ...input.deposit });
      }
      await this.ledger.splitSet({
        marketId: input.marketId,
        owner,
        qty: input.qty,
        numOutcomes: st.numOutcomes,
      });
      await this.assertAndPublish(input.marketId, st, []);
      return { ok: true, minted: input.qty.toString() };
    });
  }

  /** Redeem complete sets: burn 1 free share of every outcome for `qty` collateral. */
  async mergeSet(input: {
    marketId: number;
    owner: string;
    qty: bigint;
  }): Promise<{ ok: true; redeemed: string }> {
    const st = await this.ensureMarket(input.marketId);
    return this.enqueue(input.marketId, async () => {
      if (input.qty <= 0n) throw new Error("qty must be positive");
      await this.ledger.mergeSet({
        marketId: input.marketId,
        owner: input.owner.toLowerCase(),
        qty: input.qty,
        numOutcomes: st.numOutcomes,
      });
      await this.assertAndPublish(input.marketId, st, []);
      return { ok: true, redeemed: input.qty.toString() };
    });
  }

  async cancelOrder(marketId: number, orderId: string, owner: string): Promise<{ ok: true }> {
    const st = await this.ensureMarket(marketId);
    return this.enqueue(marketId, async () => {
      const o = st.book.getOrder(orderId);
      if (!o) throw new Error("order not found");
      if (o.maker !== owner.toLowerCase()) throw new Error("not your order");

      st.book.removeOrder(orderId);
      await this.ledger.refundLock({
        marketId,
        owner: o.maker,
        side: o.side,
        outcomeIndex: o.outcomeIndex,
        amount: o.lockedRemaining,
        refId: orderId,
      });
      await this.store.removeOrders(marketId, [orderId]);
      await this.ledger.applyMatch({
        marketId,
        taker: o.maker,
        feeBps: st.feeBps,
        deltas: [],
        fills: [],
        stats: this.statsFor(st),
      });
      await this.publishBook(marketId, st);
      return { ok: true };
    });
  }

  /** Settle a resolved market: clear the book (refund locks) then redeem shares. */
  async settleMarket(marketId: number, winningOutcome: number): Promise<{ ok: true }> {
    const st = await this.ensureMarket(marketId);
    return this.enqueue(marketId, async () => {
      // Refund every resting order's lock and clear the book.
      for (const o of st.book.allOrders()) {
        await this.ledger.refundLock({
          marketId,
          owner: o.maker,
          side: o.side,
          outcomeIndex: o.outcomeIndex,
          amount: o.lockedRemaining,
          refId: o.id,
        });
      }
      for (const o of st.book.allOrders()) st.book.removeOrder(o.id);
      await this.store.clearMarket(marketId);

      await this.ledger.settleMarket(marketId, winningOutcome);
      st.status = "Resolved";
      await this.ledger.assertSolvency(marketId, st.numOutcomes).catch((e) => {
        console.error("post-settlement solvency check failed", e);
      });
      await this.publishBook(marketId, st);
      return { ok: true };
    });
  }

  private async assertAndPublish(
    marketId: number,
    st: MarketState,
    fills: { takerOutcome: number; takerPrice: bigint; takerSide: Side; qty: bigint }[],
  ) {
    try {
      await this.ledger.assertSolvency(marketId, st.numOutcomes);
    } catch (err) {
      console.error("SOLVENCY VIOLATION", marketId, err);
    }
    await this.publishBook(marketId, st);
    if (fills.length > 0) {
      await this.store.publish(marketId, {
        type: "trades",
        marketId,
        trades: fills.map((f) => ({
          outcomeIndex: f.takerOutcome,
          side: f.takerSide,
          price: f.takerPrice.toString(),
          shares: f.qty.toString(),
          ts: Date.now(),
        })),
      });
    }
  }

  private async publishBook(marketId: number, st: MarketState) {
    await this.store.publish(marketId, {
      type: "book",
      ...st.book.snapshot(),
    });
  }
}
