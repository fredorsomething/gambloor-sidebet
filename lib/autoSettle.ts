/**
 * Auto-settle matched sidebets when both parties declare the same outcome.
 *
 * Uses SETTLER_PRIVATE_KEY / AUTO_SETTLE_PRIVATE_KEY server-side only. The
 * wallet must be the on-chain settler for the bet (typically @admin). Never
 * exposes the key or runs from the client.
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

import { SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { ADMIN_ADDRESS } from "@/lib/admin";
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

const SETTLER_KEY_RAW =
  process.env.SETTLER_PRIVATE_KEY?.trim() ||
  process.env.AUTO_SETTLE_PRIVATE_KEY?.trim() ||
  process.env.ADMIN_PRIVATE_KEY?.trim();

const RETRY_COOLDOWN_MS = 10_000;
const lastAttemptAt = new Map<number, number>();

export type AutoSettleResult =
  | { ok: true; hash: Hex; betId: number }
  | { ok: false; betId: number; reason: string };

type SettlerWallet = {
  address: Address;
  account: ReturnType<typeof privateKeyToAccount>;
  publicClient: ReturnType<typeof createPublicClient>;
  wallet: ReturnType<typeof createWalletClient>;
};

let cachedWallet: SettlerWallet | null | undefined;

function parseSettlerPrivateKey(raw?: string): Hex | null {
  if (!raw) return null;
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex as Hex;
}

function getSettlerWallet(): SettlerWallet | null {
  if (cachedWallet !== undefined) return cachedWallet;

  const key = parseSettlerPrivateKey(SETTLER_KEY_RAW);
  if (!key) {
    cachedWallet = null;
    return null;
  }

  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(RPC, { batch: false }),
  });
  const wallet = createWalletClient({
    account,
    chain: polygon,
    transport: http(RPC, { batch: false }),
  });

  cachedWallet = {
    address: account.address,
    account,
    publicClient,
    wallet,
  };

  if (
    account.address.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()
  ) {
    console.warn(
      `auto-settle: SETTLER_PRIVATE_KEY derives ${account.address}, expected admin ${ADMIN_ADDRESS}`,
    );
  }

  return cachedWallet;
}

/** Address of the server settler wallet (from env), if configured. */
export function autoSettleSettlerAddress(): Address | null {
  return getSettlerWallet()?.address ?? null;
}

/** Whether auto-settle is configured (valid settler private key present). */
export function autoSettleEnabled(): boolean {
  return getSettlerWallet() != null;
}

/** True when this bet's on-chain settler is the wallet we can sign with. */
export function canAutoSettleBet(bet: { settler: string }): boolean {
  const signer = getSettlerWallet();
  if (!signer) return false;
  try {
    return (
      getAddress(bet.settler).toLowerCase() === signer.address.toLowerCase()
    );
  } catch {
    return false;
  }
}

function outcomeReadyToSettle(
  state: Awaited<ReturnType<typeof loadBetResolutionState>>,
  outcome: number,
): boolean {
  if (state.consensus === "unanimous" && state.agreedOutcome === outcome) {
    return (
      state.proposer?.proposedOutcome === outcome &&
      state.acceptor?.proposedOutcome === outcome
    );
  }
  if (state.verifiedOutcome === outcome) return true;
  return false;
}

function resolveAutoSettleOutcome(
  state: Awaited<ReturnType<typeof loadBetResolutionState>>,
  expectedOutcome?: number,
): number | null {
  if (expectedOutcome != null) return expectedOutcome;
  if (state.consensus === "unanimous" && state.agreedOutcome != null) {
    return state.agreedOutcome;
  }
  if (state.verifiedOutcome != null) return state.verifiedOutcome;
  return null;
}

/**
 * Attempt to settle a single bet on-chain when both parties agree
 * (or an admin verified the outcome).
 * No-op if the bet is ineligible or already settled.
 */
export async function tryAutoSettleBet(
  betId: number,
  opts: { expectedOutcome?: number; force?: boolean } = {},
): Promise<AutoSettleResult> {
  if (!opts.force) {
    const last = lastAttemptAt.get(betId) ?? 0;
    if (Date.now() - last < RETRY_COOLDOWN_MS) {
      return { ok: false, betId, reason: "retry cooldown" };
    }
  }
  lastAttemptAt.set(betId, Date.now());

  const bet = await prisma.bet.findUnique({ where: { id: betId } });
  if (!bet) return { ok: false, betId, reason: "bet not found" };

  const signer = getSettlerWallet();
  if (!signer) {
    return { ok: false, betId, reason: "SETTLER_PRIVATE_KEY not configured" };
  }

  if (!canAutoSettleBet(bet)) {
    return {
      ok: false,
      betId,
      reason: "server wallet is not this bet's on-chain settler",
    };
  }

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
  if (onchain.status !== "Matched") {
    return { ok: false, betId, reason: `on-chain status is ${onchain.status}` };
  }

  const state = await loadBetResolutionState(bet);
  const winningOutcome = resolveAutoSettleOutcome(state, opts.expectedOutcome);
  if (winningOutcome == null) {
    return { ok: false, betId, reason: "no approved outcome to settle" };
  }

  if (!outcomeReadyToSettle(state, winningOutcome)) {
    return {
      ok: false,
      betId,
      reason: "declarations do not match agreed outcome",
    };
  }

  if (winningOutcome >= onchain.numOutcomes) {
    return { ok: false, betId, reason: "outcome index out of range" };
  }

  if (
    getAddress(onchain.settler).toLowerCase() !== signer.address.toLowerCase()
  ) {
    return { ok: false, betId, reason: "on-chain settler mismatch" };
  }

  try {
    const hash = await signer.wallet.writeContract({
      account: signer.account,
      chain: polygon,
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

/** Scan matched bets our wallet settles and finalize any with unanimous agreement. */
export async function autoSettleEligibleBets(): Promise<AutoSettleResult[]> {
  const signer = getSettlerWallet();
  if (!signer) return [];

  const bets = await prisma.bet.findMany({
    where: {
      status: "Matched",
      settler: { equals: signer.address, mode: "insensitive" },
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  const results: AutoSettleResult[] = [];
  for (const { id } of bets) {
    results.push(await tryAutoSettleBet(id, { force: true }));
  }
  return results;
}
