/**
 * Sync the platform sidebet fee to the admin settler row and on-chain registry.
 * New bets snapshot feeBps from settlerFeeBps[settler] at createBet time.
 */
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

import { ADMIN_ADDRESS } from "@/lib/admin";
import { SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { getEscrowV2Address, POLYGON_CHAIN_ID } from "@/lib/chains";
import { prisma } from "@/lib/db";

const RPC =
  process.env.POLYGON_RPC_URL?.trim() ||
  process.env.NEXT_PUBLIC_POLYGON_RPC?.trim() ||
  "https://polygon-bor-rpc.publicnode.com";

const OWNER_KEY = process.env.DEPLOYER_PRIVATE_KEY?.trim();

export type SyncSidebetFeeResult = {
  feeBps: number;
  dbUpdated: boolean;
  onChainSynced: boolean;
  onChainTx?: Hex;
  onChainError?: string;
};

/** Persist fee for the admin settler and push to SidebetEscrowV2 when configured. */
export async function syncSidebetFee(feeBps: number): Promise<SyncSidebetFeeResult> {
  await prisma.approvedSettler.upsert({
    where: { address: ADMIN_ADDRESS },
    update: { feeBps, approved: true },
    create: { address: ADMIN_ADDRESS, feeBps, approved: true },
  });

  const result: SyncSidebetFeeResult = {
    feeBps,
    dbUpdated: true,
    onChainSynced: false,
  };

  if (!OWNER_KEY || !/^0x[0-9a-fA-F]{64}$/.test(OWNER_KEY)) {
    result.onChainError = "DEPLOYER_PRIVATE_KEY not configured";
    return result;
  }

  const escrow = getEscrowV2Address(POLYGON_CHAIN_ID);
  if (!escrow) {
    result.onChainError = "escrow not configured";
    return result;
  }

  const account = privateKeyToAccount(OWNER_KEY as Hex);
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(RPC, { batch: false }),
  });
  const wallet = createWalletClient({
    account,
    chain: polygon,
    transport: http(RPC, { batch: false }),
  });

  try {
    const onChainOwner = (await publicClient.readContract({
      address: escrow,
      abi: SIDEBET_ESCROW_V2_ABI,
      functionName: "owner",
    })) as `0x${string}`;

    if (onChainOwner.toLowerCase() !== account.address.toLowerCase()) {
      result.onChainError = "DEPLOYER_PRIVATE_KEY is not the escrow owner";
      return result;
    }

    const current = Number(
      await publicClient.readContract({
        address: escrow,
        abi: SIDEBET_ESCROW_V2_ABI,
        functionName: "settlerFeeBps",
        args: [ADMIN_ADDRESS],
      }),
    );

    const approved = await publicClient.readContract({
      address: escrow,
      abi: SIDEBET_ESCROW_V2_ABI,
      functionName: "isApprovedSettler",
      args: [ADMIN_ADDRESS],
    });

    if (approved && current === feeBps) {
      result.onChainSynced = true;
      return result;
    }

    const hash = await wallet.writeContract({
      address: escrow,
      abi: SIDEBET_ESCROW_V2_ABI,
      functionName: "setSettler",
      args: [getAddress(ADMIN_ADDRESS), true, feeBps],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    result.onChainSynced = true;
    result.onChainTx = hash;
    return result;
  } catch (err) {
    result.onChainError = err instanceof Error ? err.message : "on-chain sync failed";
    return result;
  }
}
