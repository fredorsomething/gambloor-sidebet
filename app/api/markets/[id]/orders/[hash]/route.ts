import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { verifyWalletAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { engineCancelOrder, EngineError } from "@/lib/engineClient";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/markets/[id]/orders/[hash]?address=0x...
 * Cancels a resting order. `[hash]` is the engine order id. The caller must be
 * the order's owner (verified by the engine after Privy auth here).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; hash: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return jsonErr("bad id", 400);

  const addrRaw = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(addrRaw)) return jsonErr("bad address", 400);
  const address = getAddress(addrRaw);

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  try {
    await engineCancelOrder({ marketId: id, orderId: params.hash, owner: address.toLowerCase() });
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof EngineError) return jsonErr(err.message, err.status);
    console.error("cancel order failed", err);
    return jsonErr("failed to cancel order", 500);
  }
}
