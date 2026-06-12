import { getAddress, zeroAddress } from "viem";

import { SIDEBET_ESCROW_V3_ABI } from "@/lib/abi";
import { getEscrowV3Address, POLYGON_CHAIN_ID } from "@/lib/chains";
import { getPublicClient } from "@/lib/onchain";

/** Flat USDC.e fee pulled by SidebetEscrowV3.registerMarket (anti-spam). */
export const MARKET_CREATION_FEE_USD = 1;
export const MARKET_CREATION_FEE_RAW = 1_000_000n;

/**
 * Verify a market was registered on-chain in the V3 escrow's market registry
 * with matching creator/settler/outcomes/terms. The contract enforces the
 * 1 USDC.e creation fee at registration time, so a matching registration
 * implies the fee was paid.
 */
export async function verifyMarketRegistration(opts: {
  conditionId: string;
  creator: string;
  settler: string;
  numOutcomes: number;
  termsHash: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const escrow = getEscrowV3Address();
  if (!escrow) {
    return { ok: false, reason: "escrow v3 is not configured" };
  }
  const publicClient = getPublicClient(POLYGON_CHAIN_ID);
  if (!publicClient) {
    return { ok: false, reason: "unsupported chain" };
  }

  try {
    const reg = await publicClient.readContract({
      address: escrow,
      abi: SIDEBET_ESCROW_V3_ABI,
      functionName: "getMarket",
      args: [opts.conditionId as `0x${string}`],
    });

    if (!reg || getAddress(reg.creator) === zeroAddress) {
      return {
        ok: false,
        reason: `market is not registered on-chain — pay the $${MARKET_CREATION_FEE_USD.toFixed(2)} USDC.e creation fee first`,
      };
    }
    if (getAddress(reg.creator) !== getAddress(opts.creator)) {
      return { ok: false, reason: "on-chain registration creator mismatch" };
    }
    if (getAddress(reg.settler) !== getAddress(opts.settler)) {
      return { ok: false, reason: "on-chain registration settler mismatch" };
    }
    if (Number(reg.numOutcomes) !== opts.numOutcomes) {
      return { ok: false, reason: "on-chain registration outcome count mismatch" };
    }
    if (reg.termsHash.toLowerCase() !== opts.termsHash.toLowerCase()) {
      return { ok: false, reason: "on-chain registration terms mismatch" };
    }
    return { ok: true };
  } catch (err) {
    console.error("market registration verification failed", err);
    return { ok: false, reason: "could not verify on-chain registration" };
  }
}
