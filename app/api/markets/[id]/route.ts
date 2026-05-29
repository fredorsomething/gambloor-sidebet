import { NextRequest } from "next/server";
import { getAddress, isAddress, type Address } from "viem";

import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { getPublicClient, readCondition } from "@/lib/onchain";
import { CONDITIONAL_TOKENS_ABI } from "@/lib/abi";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  const market = await prisma.market.findUnique({
    where: { id },
    include: { outcomes: { orderBy: { index: "asc" } } },
  });
  if (!market) return jsonErr("not found", 404);

  // Opportunistic resolution sync from the CTF condition.
  const cond = await readCondition(
    market.chainId,
    getAddress(market.ctfAddress) as Address,
    market.conditionId as `0x${string}`,
  );
  if (cond?.resolved && market.status !== "Resolved") {
    try {
      await prisma.market.update({
        where: { id },
        data: { status: "Resolved", winningOutcome: cond.winningOutcome },
      });
      market.status = "Resolved";
      market.winningOutcome = cond.winningOutcome;
    } catch (err) {
      console.warn("market sync failed", err);
    }
  }

  // Expire stale orders lazily.
  const now = Math.floor(Date.now() / 1000);
  await prisma.order.updateMany({
    where: {
      marketId: id,
      status: "Open",
      expiry: { gt: 0n, lt: BigInt(now) },
    },
    data: { status: "Expired" },
  });

  const orders = await prisma.order.findMany({
    where: { marketId: id, status: "Open" },
    orderBy: { createdAt: "asc" },
  });

  const orderBook: Record<number, { buys: unknown[]; sells: unknown[] }> = {};
  for (const o of market.outcomes) {
    orderBook[o.index] = { buys: [], sells: [] };
  }
  for (const o of orders) {
    const bucket = orderBook[o.outcomeIndex];
    if (!bucket) continue;
    if (o.side === "BUY") bucket.buys.push(o);
    else bucket.sells.push(o);
  }
  // Sort: best BUY = highest price first; best SELL = lowest price first.
  for (const idx of Object.keys(orderBook)) {
    const b = orderBook[Number(idx)];
    b.buys.sort(
      (x: any, y: any) => Number(y.price) - Number(x.price),
    );
    b.sells.sort(
      (x: any, y: any) => Number(x.price) - Number(y.price),
    );
  }

  // Optional viewer positions (on-chain ERC-1155 balances).
  let positions: Record<number, string> | undefined;
  const viewer = req.nextUrl.searchParams.get("viewer");
  if (viewer && isAddress(viewer)) {
    const client = getPublicClient(market.chainId);
    if (client) {
      positions = {};
      await Promise.all(
        market.outcomes.map(async (o) => {
          try {
            const bal = (await client.readContract({
              address: getAddress(market.ctfAddress) as Address,
              abi: CONDITIONAL_TOKENS_ABI,
              functionName: "balanceOf",
              args: [BigInt(o.positionId), getAddress(viewer) as Address],
            })) as bigint;
            positions![o.index] = bal.toString();
          } catch {
            positions![o.index] = "0";
          }
        }),
      );
    }
  }

  return jsonOk({ market, orderBook, positions });
}
