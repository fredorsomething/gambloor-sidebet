/**
 * Engine transport: an internal JSON-RPC over HTTP (authenticated by a shared
 * secret, called only by the Next.js app) plus a public WebSocket that streams
 * live book snapshots and the trade tape to browsers.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Redis from "ioredis";
import { WebSocketServer, WebSocket } from "ws";

import { ExchangeEngine } from "./manager";
import { createRedis } from "./redisStore";
import { MIN_PRICE, MAX_PRICE, type OrderType, type Side } from "../lib/exchange/units";

const SECRET = process.env.ENGINE_RPC_SECRET || "";
const PORT = Number(process.env.ENGINE_PORT || 8090);

type RpcHandler = (params: any) => Promise<unknown>;

export function startServer(engine: ExchangeEngine) {
  const handlers: Record<string, RpcHandler> = {
    health: async () => ({ ok: true }),

    snapshot: async (p) => engine.snapshot(Number(p.marketId)),

    openOrders: async (p) => {
      const orders = await engine.openOrdersFor(Number(p.marketId), String(p.owner));
      return orders.map((o) => ({
        id: o.id,
        side: o.side,
        outcomeIndex: o.outcomeIndex,
        price: o.price.toString(),
        qty: o.qty.toString(),
        remaining: o.remaining.toString(),
        createdAt: o.createdAt,
      }));
    },

    placeOrder: async (p) =>
      engine.placeOrder({
        marketId: Number(p.marketId),
        maker: String(p.maker),
        side: p.side as Side,
        outcomeIndex: Number(p.outcomeIndex),
        type: (p.type as OrderType) ?? "LIMIT",
        price: BigInt(p.price ?? "0"),
        qty: BigInt(p.qty),
      }),

    cancelOrder: async (p) =>
      engine.cancelOrder(Number(p.marketId), String(p.orderId), String(p.owner)),

    settleMarket: async (p) =>
      engine.settleMarket(Number(p.marketId), Number(p.winningOutcome)),

    reloadMarket: async (p) => {
      await engine.reloadMarket(Number(p.marketId));
      return { ok: true };
    },

    requestWithdrawal: async (p) => {
      const w = await engine.ledger.requestWithdrawal({
        address: String(p.address),
        amount: BigInt(p.amount),
        fee: BigInt(p.fee ?? "0"),
        status: String(p.status ?? "Pending"),
      });
      return { id: w.id };
    },
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url?.startsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method !== "POST" || !req.url?.startsWith("/rpc")) {
      res.writeHead(404).end();
      return;
    }
    if (!SECRET || req.headers["x-engine-secret"] !== SECRET) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed: { method?: string; params?: unknown };
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const handler = parsed.method ? handlers[parsed.method] : undefined;
    if (!handler) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unknown method" }));
      return;
    }
    try {
      const result = await handler(parsed.params ?? {});
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "engine error";
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  });

  // ---- Public WebSocket for live book + trade tape ----
  const wss = new WebSocketServer({ server, path: "/ws" });
  const subscribers = new Map<number, Set<WebSocket>>();
  const sub: Redis = createRedis();
  sub.psubscribe("mkt:*");
  sub.on("pmessage", (_pattern, channel, message) => {
    const marketId = Number(channel.split(":")[1]);
    const set = subscribers.get(marketId);
    if (!set) return;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(message);
    }
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const marketId = Number(url.searchParams.get("marketId"));
    if (!Number.isFinite(marketId) || marketId <= 0) {
      ws.close(1008, "marketId required");
      return;
    }
    let set = subscribers.get(marketId);
    if (!set) {
      set = new Set();
      subscribers.set(marketId, set);
    }
    set.add(ws);

    // Send an initial snapshot.
    engine
      .snapshot(marketId)
      .then((snap) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "book", ...snap }));
        }
      })
      .catch(() => {});

    ws.on("close", () => {
      set?.delete(ws);
    });
    ws.on("error", () => {
      set?.delete(ws);
    });
  });

  server.listen(PORT, () => {
    console.log(`[engine] listening on :${PORT} (rpc + ws)`);
  });

  return server;
}

// Re-exported for callers that need the price bounds.
export { MIN_PRICE, MAX_PRICE };
