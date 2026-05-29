import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { getMarketCollateralToken } from "@/lib/chains";
import { prisma } from "@/lib/db";
import { isAllowedImageUrl } from "@/lib/profile";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { engineSnapshot, EngineError } from "@/lib/engineClient";
import { collateralKey, shareKey } from "@/lib/exchange/keys";
import type { BookSnapshot } from "@/lib/exchange/types";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  creator: z.string().refine(isAddress, "bad creator"),
  imageUrl: z
    .string()
    .url()
    .max(500)
    .refine((u) => isAllowedImageUrl(u), "invalid image url")
    .nullable(),
});

/** PATCH /api/markets/[id] — the creator can set or clear the cover image. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const market = await prisma.market.findUnique({ where: { id } });
  if (!market) return jsonErr("not found", 404);

  const creator = getAddress(parsed.data.creator);
  if (creator.toLowerCase() !== market.creator.toLowerCase()) {
    return jsonErr("only the market creator can edit the cover", 403);
  }
  const auth = await verifyWalletAuth({ req, address: creator });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const updated = await prisma.market.update({
    where: { id },
    data: { imageUrl: parsed.data.imageUrl },
    include: { outcomes: { orderBy: { index: "asc" } } },
  });
  return jsonOk(updated);
}

function emptyBook(marketId: number, numOutcomes: number): BookSnapshot {
  return {
    marketId,
    numOutcomes,
    outcomes: Array.from({ length: numOutcomes }, (_, i) => ({
      outcomeIndex: i,
      bids: [],
      asks: [],
    })),
    ts: Date.now(),
  };
}

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

  const numOutcomes = market.outcomes.length || 2;

  // Live order book from the matching engine (Redis-backed). Degrade gracefully
  // to an empty book if the engine is temporarily unavailable.
  let book: BookSnapshot;
  try {
    book = await engineSnapshot(id);
  } catch (err) {
    if (!(err instanceof EngineError)) console.error("snapshot failed", err);
    book = emptyBook(id, numOutcomes);
  }

  // Optional viewer custodial state (collateral + per-outcome shares) from the
  // ledger — these are the authoritative internal balances.
  let viewer:
    | {
        collateral: { balance: string; locked: string };
        shares: Record<number, { balance: string; locked: string }>;
      }
    | undefined;
  const viewerAddr = req.nextUrl.searchParams.get("viewer");
  if (viewerAddr && isAddress(viewerAddr)) {
    const lower = getAddress(viewerAddr).toLowerCase();
    const [coll, shares] = await Promise.all([
      prisma.account.findUnique({
        where: { key: collateralKey(lower) },
        select: { balance: true, locked: true },
      }),
      prisma.account.findMany({
        where: { owner: lower, kind: "SHARE", marketId: id },
        select: { outcomeIndex: true, balance: true, locked: true },
      }),
    ]);
    const shareMap: Record<number, { balance: string; locked: string }> = {};
    for (const o of market.outcomes) shareMap[o.index] = { balance: "0", locked: "0" };
    for (const s of shares) {
      if (s.outcomeIndex == null) continue;
      shareMap[s.outcomeIndex] = {
        balance: s.balance.toString(),
        locked: s.locked.toString(),
      };
    }
    viewer = {
      collateral: {
        balance: (coll?.balance ?? 0n).toString(),
        locked: (coll?.locked ?? 0n).toString(),
      },
      shares: shareMap,
    };
  }

  const fallback = getMarketCollateralToken();
  const marketOut = {
    ...market,
    tokenSymbol: market.tokenSymbol ?? fallback.symbol,
    decimals: market.decimals ?? fallback.decimals,
  };

  return jsonOk({ market: marketOut, book, viewer });
}
