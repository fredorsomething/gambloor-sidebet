/**
 * Auto-settle matched sidebets when both parties declare the same outcome.
 * Only bets whose on-chain settler is the platform admin wallet are eligible.
 * Requires SETTLER_PRIVATE_KEY (admin settler wallet) in the environment.
 */
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

import { isAdminAddress, ADMIN_ADDRESS } from "@/lib/admin";
import { SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { loadBetResolutionState } from "@/lib/betResolution";
import { prisma } from "@/lib/db";
import { readBetV2 } from "@/lib/onchain";
import {
  applyBetOnchainSync,
  persistKnownSettlement,
  readBetV2Settled,
} from "@/lib/betSync";

const RPC =
  process.env.POLYGON_RPC_URL?.trim() ||
  process.env.NEXT_PUBLIC_POLYGON_RPC?.trim() ||
  "https://polygon-bor-rpc.publicnode.com";

const SETTLER_KEY =
  process.env.SETTLER_PRIVATE_KEY?.trim() ||
  process.env.AUTO_SETTLE_PRIVATE_KEY?.trim();

export type AutoSettleResult =
  | { ok: true; hash: Hex; betId: number }
  | { ok: false; betId: number; reason: string };

function settlerWallet() {
  if (!SETTLER_KEY || !/^0x[0-9a-fA-F]{64}$/.test(SETTLER_KEY)) return null;
  const account = privateKeyToAccount(SETTLER_KEY as Hex);
  if (!isAdminAddress(account.address)) {
    console.warn(
      "auto-settle: SETTLER_PRIVATE_KEY does not match admin address",
    );
    return null;
  }
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(RPC, { batch: false }),
  });
  const wallet = createWalletClient({
    account,
    chain: polygon,
    transport: http(RPC, { batch: false }),
  });
  return { account, publicClient, wallet };
}

/** Whether auto-settle is configured (admin key present). */
export function autoSettleEnabled(): boolean {
  return settlerWallet() != null;
}

/**
 * Attempt to settle a single bet on-chain when both parties agree.
 * No-op if the bet is ineligible or already settled.
 */
export async function tryAutoSettleBet(
  betId: number,
): Promise<AutoSettleResult> {
  const bet = await prisma.bet.findUnique({ where: { id: betId } });
  if (!bet) return { ok: false, betId, reason: "bet not found" };

  const onchain = await readBetV2(
    bet.chainId,
    getAddress(bet.escrowAddress) as Address,
    BigInt(bet.onchainId),
  );
  if (!onchain) {
    return { ok: false, betId, reason: "on-chain read failed" };
  }
  if (onchain.status === "Settled" || onchain.status === "Refunded") {
    if (bet.status !== "Settled" && bet.status !== "Refunded") {
      await applyBetOnchainSync(bet, onchain, { notify: true });
    }
    return { ok: true, hash: "0x" as Hex, betId };
  }

  if (bet.status !== "Matched") {
    return { ok: false, betId, reason: `status is ${bet.status}` };
  }
  if (!isAdminAddress(bet.settler)) {
    return { ok: false, betId, reason: "settler is not admin" };
  }

  const state = await loadBetResolutionState(bet);
  if (state.consensus !== "unanimous" || state.agreedOutcome == null) {
    return { ok: false, betId, reason: "no unanimous agreement" };
  }

  const signer = settlerWallet();
  if (!signer) {
    return { ok: false, betId, reason: "SETTLER_PRIVATE_KEY not configured" };
  }

  if (onchain.status !== "Matched") {
    return { ok: false, betId, reason: `on-chain status is ${onchain.status}` };
  }

  const winningOutcome = state.agreedOutcome;
  try {
    const hash = await signer.wallet.writeContract({
      address: getAddress(bet.escrowAddress) as Address,
      abi: SIDEBET_ESCROW_V2_ABI,
      functionName: "settleBet",
      args: [BigInt(bet.onchainId), winningOutcome],
    });
    await signer.publicClient.waitForTransactionReceipt({ hash });

    const onchainAfter = await readBetV2Settled(bet);
    if (onchainAfter) {
      await applyBetOnchainSync(bet, onchainAfter, { notify: true });
    } else {
      await persistKnownSettlement(bet, winningOutcome, { notify: true });
    }

    console.log(
      `auto-settle: bet #${betId} settled outcome=${winningOutcome} tx=${hash}`,
    );
    return { ok: true, hash, betId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "settleBet failed";
    console.error(`auto-settle: bet #${betId} failed`, reason);
    return { ok: false, betId, reason };
  }
}

/** Scan all matched admin-settler bets and settle any with unanimous agreement. */
export async function autoSettleEligibleBets(): Promise<AutoSettleResult[]> {
  const bets = await prisma.bet.findMany({
    where: {
      status: "Matched",
      settler: ADMIN_ADDRESS,
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  const results: AutoSettleResult[] = [];
  for (const { id } of bets) {
    results.push(await tryAutoSettleBet(id));
  }
  return results;
}
