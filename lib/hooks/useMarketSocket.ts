"use client";

import { useEffect, useRef, useState } from "react";

import type { BookSnapshot, TradeTapeItem } from "@/lib/exchange/types";

/**
 * Subscribe to the matching engine's public WebSocket for a market and receive
 * live order-book snapshots + the trade tape. Falls back to no-op (the caller
 * keeps polling) when no WS URL is configured.
 */
export function useMarketSocket(marketId: number, wsUrl: string | null) {
  const [book, setBook] = useState<BookSnapshot | null>(null);
  const [trades, setTrades] = useState<TradeTapeItem[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!wsUrl || !marketId) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${wsUrl}?marketId=${marketId}`);
      } catch {
        retry = setTimeout(connect, 3000);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "book") {
            setBook(msg as BookSnapshot);
          } else if (msg.type === "trades" && Array.isArray(msg.trades)) {
            setTrades((prev) => [...msg.trades, ...prev].slice(0, 40));
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [marketId, wsUrl]);

  return { book, trades, connected };
}
