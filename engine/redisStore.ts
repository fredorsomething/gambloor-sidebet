/**
 * Redis-backed persistence + pub/sub for the live order book.
 *
 * Redis is the authoritative hot store for resting orders (NOT Postgres): the
 * engine keeps books in memory for matching and mirrors every change to Redis
 * so it can rehydrate on restart. Postgres holds only the durable ledger.
 *
 * Keys:
 *   book:<marketId>   HASH  orderId -> serialized RestingOrder
 *   seq:<marketId>    STRING monotonic seq counter
 *   markets           SET   known market ids with a live book
 * Pub/sub channel:
 *   mkt:<marketId>    JSON messages: { type: "book" | "trade", ... }
 */
import Redis from "ioredis";

import type { RestingOrder } from "../lib/exchange/types";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export function createRedis(): Redis {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
}

function serialize(o: RestingOrder): string {
  return JSON.stringify({
    ...o,
    price: o.price.toString(),
    qty: o.qty.toString(),
    remaining: o.remaining.toString(),
    lockedRemaining: o.lockedRemaining.toString(),
  });
}

export function deserialize(s: string): RestingOrder {
  const o = JSON.parse(s);
  return {
    id: o.id,
    marketId: o.marketId,
    maker: o.maker,
    side: o.side,
    outcomeIndex: o.outcomeIndex,
    price: BigInt(o.price),
    qty: BigInt(o.qty),
    remaining: BigInt(o.remaining),
    lockedRemaining: BigInt(o.lockedRemaining),
    createdAt: o.createdAt,
    seq: o.seq,
  };
}

export class RedisStore {
  constructor(private redis: Redis) {}

  private bookKey(marketId: number) {
    return `book:${marketId}`;
  }

  async knownMarkets(): Promise<number[]> {
    const ids = await this.redis.smembers("markets");
    return ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }

  async loadOrders(marketId: number): Promise<RestingOrder[]> {
    const all = await this.redis.hgetall(this.bookKey(marketId));
    return Object.values(all).map(deserialize);
  }

  async putOrder(o: RestingOrder): Promise<void> {
    await this.redis.hset(this.bookKey(o.marketId), o.id, serialize(o));
    await this.redis.sadd("markets", String(o.marketId));
  }

  async putOrders(orders: RestingOrder[]): Promise<void> {
    if (orders.length === 0) return;
    const marketId = orders[0].marketId;
    const pairs: string[] = [];
    for (const o of orders) {
      pairs.push(o.id, serialize(o));
    }
    await this.redis.hset(this.bookKey(marketId), ...pairs);
    await this.redis.sadd("markets", String(marketId));
  }

  async removeOrders(marketId: number, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.redis.hdel(this.bookKey(marketId), ...ids);
  }

  async clearMarket(marketId: number): Promise<void> {
    await this.redis.del(this.bookKey(marketId));
  }

  async getSeq(marketId: number): Promise<number> {
    const v = await this.redis.get(`seq:${marketId}`);
    return v ? Number(v) : 0;
  }

  async setSeq(marketId: number, seq: number): Promise<void> {
    await this.redis.set(`seq:${marketId}`, String(seq));
  }

  async publish(marketId: number, message: unknown): Promise<void> {
    await this.redis.publish(`mkt:${marketId}`, JSON.stringify(message));
  }
}
