import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";

import { verifyWalletAuth } from "@/lib/auth";
import { getMarketCollateralToken } from "@/lib/chains";
import { engineRefundOrphanFunding, EngineError } from "@/lib/engineClient";
import { verifyFundingTransfer } from "@/lib/fundingVerification";
import { getPublicClient } from "@/lib/onchain";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const HEX_TX = /^0x[0-9a-fA-F]{64}$/;

const BodySchema = z.object({
  address: z.string(),
  fundingTxHash: z.string().regex(HEX_TX),
  chainId: z.number().int().positive().default(137),
});

/**
 * POST /api/exchange/recover-funding
 *
 * Return USDC.e to a user when their wallet transfer reached the treasury but
 * the orderbook rejected the order (or the engine was unreachable). Credits the
 * transfer into the ledger if needed, then queues an immediate withdrawal.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;
  const address = getAddress(d.address);
  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const treasuryRaw = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
  if (!treasuryRaw) return jsonErr("treasury not configured", 503);

  const publicClient = getPublicClient(d.chainId);
  if (!publicClient) return jsonErr("unsupported chain", 400);

  const token = getMarketCollateralToken().address;
  const verified = await verifyFundingTransfer({
    publicClient,
    txHash: d.fundingTxHash as `0x${string}`,
    token,
    maker: address,
    treasury: treasuryRaw,
  });
  if ("error" in verified) return jsonErr(verified.error, 400);

  try {
    const res = await engineRefundOrphanFunding({
      address: address.toLowerCase(),
      amount: verified.transferred.toString(),
      txHash: d.fundingTxHash,
      logIndex: verified.logIndex,
      chainId: d.chainId,
    });
    return jsonOk({
      refunded: res.refunded,
      message:
        BigInt(res.refunded) > 0n
          ? "USDC.e is on its way back to your wallet."
          : "Nothing to recover for this transfer.",
    });
  } catch (err) {
    if (err instanceof EngineError) return jsonErr(err.message, err.status);
    console.error("recover funding failed", err);
    return jsonErr("recovery failed — contact support with your tx hash", 500);
  }
}
