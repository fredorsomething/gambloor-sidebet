import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress } from "viem";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { marketWithOutcomesSelect } from "@/lib/marketPrisma";
import { getPublicClient } from "@/lib/onchain";
import { jsonErr, jsonOk } from "@/lib/serialize";
import {
  engineSplitSet,
  engineMergeSet,
  engineRefundOrphanFunding,
  engineRequestWithdrawal,
  EngineError,
} from "@/lib/engineClient";
import { verifyFundingTransfer } from "@/lib/fundingVerification";
import { parseAmount } from "@/lib/exchange/units";

export const dynamic = "force-dynamic";
const HEX_TX = /^0x[0-9a-fA-F]{64}$/;

const Schema = z.object({
  owner: z.string(),
  action: z.enum(["split", "merge"]),
  // Number of complete sets (= shares of each outcome), in whole shares.
  shares: z.number().gt(0),
  // For `split`: the on-chain USDC.e transfer that funds the mint ($1 per set).
  fundingTxHash: z.string().regex(HEX_TX, "bad funding tx").optional(),
});

/**
 * POST /api/markets/[id]/sets — mint or redeem complete sets.
 *
 * A complete set is one share of EVERY outcome and always redeems for $1, so it
 * is the liquidity primitive for multi-outcome markets: mint a set, then sell
 * the legs you don't want (creating asks others can buy). Minting funds
 * just-in-time from the wallet (like a buy); redeeming returns the collateral,
 * which the engine auto-sweeps back to the wallet.
 */
export async function POST(
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
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;

  const market = await prisma.market.findUnique({
    where: { id },
    select: marketWithOutcomesSelect,
  });
  if (!market) return jsonErr("market not found", 404);
  if (market.status !== "Open") return jsonErr("market is not open for trading", 400);

  const owner = getAddress(d.owner);
  const auth = await verifyWalletAuth({ req, address: owner });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const qtyMicro = parseAmount(d.shares);
  if (qtyMicro <= 0n) return jsonErr("shares must be positive", 400);

  if (d.action === "merge") {
    try {
      const res = await engineMergeSet({
        marketId: id,
        owner: owner.toLowerCase(),
        qty: qtyMicro.toString(),
      });
      // Best-effort: return the freed collateral to the wallet right away. The
      // engine's auto-sweep would do this anyway, so ignore transient failures.
      await engineRequestWithdrawal({
        address: owner.toLowerCase(),
        amount: qtyMicro.toString(),
        fee: "0",
        status: "Pending",
      }).catch(() => {});
      return jsonOk(res, { status: 201 });
    } catch (err) {
      if (err instanceof EngineError) return jsonErr(err.message, err.status);
      console.error("merge set failed", err);
      return jsonErr("failed to redeem set", 500);
    }
  }

  // --- split: verify just-in-time funding then mint -----------------------
  if (!d.fundingTxHash) {
    return jsonErr("minting a set requires a funding transfer", 400);
  }
  const treasuryRaw = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
  if (!treasuryRaw) return jsonErr("treasury not configured", 503);

  const publicClient = getPublicClient(market.chainId);
  if (!publicClient) return jsonErr("unsupported chain", 400);

  // A complete set costs exactly $1, so qty micro-shares require qty micro-USDC.
  const required = qtyMicro;

  const verified = await verifyFundingTransfer({
    publicClient,
    txHash: d.fundingTxHash as `0x${string}`,
    token: market.token,
    maker: owner,
    treasury: treasuryRaw,
  });
  if ("error" in verified) return jsonErr(verified.error, 400);
  if (verified.transferred < required) {
    return jsonErr("funding transfer is insufficient to mint these sets", 400);
  }

  const fundingDeposit = {
    amount: verified.transferred.toString(),
    txHash: d.fundingTxHash,
    logIndex: verified.logIndex,
    chainId: market.chainId,
  };

  try {
    const res = await engineSplitSet({
      marketId: id,
      owner: owner.toLowerCase(),
      qty: qtyMicro.toString(),
      deposit: fundingDeposit,
    });
    return jsonOk(res, { status: 201 });
  } catch (err) {
    try {
      await engineRefundOrphanFunding({
        address: owner.toLowerCase(),
        ...fundingDeposit,
      });
    } catch (refundErr) {
      console.error("orphan set funding refund failed", refundErr);
    }
    if (err instanceof EngineError) return jsonErr(err.message, err.status);
    console.error("split set failed", err);
    return jsonErr("failed to mint set — your USDC.e is being returned", 500);
  }
}
