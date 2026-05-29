import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { engineRequestWithdrawal, EngineError } from "@/lib/engineClient";
import { parseAmount } from "@/lib/exchange/units";

export const dynamic = "force-dynamic";

const Schema = z.object({
  amount: z.number().gt(0),
});

/**
 * POST /api/users/[address]/withdraw
 * Reserve a withdrawal: the engine moves the amount from free to locked
 * collateral and queues a Withdrawal row; the bridge worker sends USDC.e and
 * records the tx (amounts over the review threshold are held for manual review).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const address = getAddress(handle);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const amountMicro = parseAmount(parsed.data.amount);
  if (amountMicro <= 0n) return jsonErr("amount must be positive", 400);

  try {
    const w = await engineRequestWithdrawal({
      address: address.toLowerCase(),
      amount: amountMicro.toString(),
      fee: "0",
      status: "Pending",
    });
    return jsonOk({ id: w.id, status: "Pending" }, { status: 201 });
  } catch (err) {
    if (err instanceof EngineError) return jsonErr(err.message, err.status);
    console.error("withdraw failed", err);
    return jsonErr("failed to request withdrawal", 500);
  }
}
