import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, parseEventLogs, parseAbiItem } from "viem";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { marketWithOutcomesSelect } from "@/lib/marketPrisma";
import { getPublicClient } from "@/lib/onchain";
import { jsonErr, jsonOk } from "@/lib/serialize";
import {
  engineSplitSet,
  engineMergeSet,
  engineRequestWithdrawal,
  EngineError,
} from "@/lib/engineClient";
import { parseAmount } from "@/lib/exchange/units";

export const dynamic = "force-dynamic";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
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

  let transferred = 0n;
  let fundingLogIndex = -1;
  try {
    const treasury = getAddress(treasuryRaw);
    const token = getAddress(market.token);
    const receipt = await publicClient.getTransactionReceipt({
      hash: d.fundingTxHash as `0x${string}`,
    });
    if (receipt.status !== "success") {
      return jsonErr("funding transfer did not succeed", 400);
    }
    const transfers = parseEventLogs({
      abi: [TRANSFER_EVENT],
      logs: receipt.logs,
      eventName: "Transfer",
    });
    for (const t of transfers) {
      if (getAddress(t.address) !== token) continue;
      if (getAddress(t.args.from) !== owner) continue;
      if (getAddress(t.args.to) !== treasury) continue;
      transferred += t.args.value;
      if (fundingLogIndex < 0) fundingLogIndex = t.logIndex;
    }
  } catch (err) {
    console.error("set funding verification failed", err);
    return jsonErr("could not verify funding transfer", 400);
  }

  if (fundingLogIndex < 0 || transferred < required) {
    return jsonErr("funding transfer is insufficient to mint these sets", 400);
  }

  try {
    const res = await engineSplitSet({
      marketId: id,
      owner: owner.toLowerCase(),
      qty: qtyMicro.toString(),
      deposit: {
        amount: transferred.toString(),
        txHash: d.fundingTxHash,
        logIndex: fundingLogIndex,
        chainId: market.chainId,
      },
    });
    return jsonOk(res, { status: 201 });
  } catch (err) {
    if (err instanceof EngineError) return jsonErr(err.message, err.status);
    console.error("split set failed", err);
    return jsonErr("failed to mint set", 500);
  }
}
