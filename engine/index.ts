/**
 * Matching engine entrypoint (long-lived single-writer service, e.g. on Render).
 * Boots Postgres (ledger) + Redis (live book) connections, rehydrates known
 * market books, starts the RPC/WS server and the on-chain bridge worker.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { ExchangeEngine } from "./manager";
import { RedisStore, createRedis } from "./redisStore";
import { startServer } from "./server";
import { Bridge } from "./bridge";

async function main() {
  const prisma = new PrismaClient({ log: ["error"] });
  const redis = createRedis();
  const store = new RedisStore(redis);
  const engine = new ExchangeEngine(prisma, store);

  // Rehydrate books for markets that have live orders in Redis.
  const ids = await store.knownMarkets();
  for (const id of ids) {
    try {
      await engine.ensureMarket(id);
    } catch (err) {
      console.warn(`[engine] failed to rehydrate market ${id}`, err);
    }
  }
  console.log(`[engine] rehydrated ${ids.length} market book(s)`);

  startServer(engine);

  const bridge = new Bridge(prisma);
  bridge.start();

  const shutdown = async () => {
    console.log("[engine] shutting down");
    bridge.stop();
    await prisma.$disconnect().catch(() => {});
    await redis.quit().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[engine] fatal", err);
  process.exit(1);
});
