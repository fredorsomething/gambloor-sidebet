import { NextRequest } from "next/server";
import { getAddress } from "viem";

import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { readBet } from "@/lib/onchain";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  const bet = await prisma.bet.findUnique({ where: { id } });
  if (!bet) return jsonErr("not found", 404);

  // Opportunistic sync from chain.
  const onchain = await readBet(
    bet.chainId,
    getAddress(bet.escrowAddress) as `0x${string}`,
    BigInt(bet.onchainId),
  );

  if (onchain) {
    const updates: Record<string, unknown> = {};
    if (onchain.status !== bet.status) updates.status = onchain.status;
    if (
      onchain.acceptor &&
      onchain.acceptor !== "0x0000000000000000000000000000000000000000" &&
      onchain.acceptor.toLowerCase() !== (bet.acceptor || "").toLowerCase()
    ) {
      updates.acceptor = getAddress(onchain.acceptor);
    }
    if (
      onchain.winner &&
      onchain.winner !== "0x0000000000000000000000000000000000000000" &&
      onchain.winner.toLowerCase() !== (bet.winner || "").toLowerCase()
    ) {
      updates.winner = getAddress(onchain.winner);
    }
    if (Object.keys(updates).length > 0) {
      try {
        await prisma.bet.update({ where: { id }, data: updates });
        Object.assign(bet, updates);
      } catch (err) {
        console.warn("sync update failed", err);
      }
    }
  }

  return jsonOk({ bet, onchain });
}
