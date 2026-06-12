import { getAddress, parseAbiItem, parseEventLogs } from "viem";

import { ADMIN_ADDRESS } from "@/lib/admin";
import { getMarketCollateralToken, POLYGON_CHAIN_ID } from "@/lib/chains";
import { prisma } from "@/lib/db";
import { getPublicClient } from "@/lib/onchain";

/** Flat USDC.e fee required to create a sidebet (anti-spam). */
export const SIDEBET_CREATION_FEE_USD = 0.05;
export const SIDEBET_CREATION_FEE_RAW = 50_000n;

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export async function verifySidebetCreationFee(opts: {
  proposer: string;
  txHash: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const token = getMarketCollateralToken(POLYGON_CHAIN_ID);
  const publicClient = getPublicClient(POLYGON_CHAIN_ID);
  if (!publicClient) {
    return { ok: false, reason: "unsupported chain" };
  }

  let proposer: `0x${string}`;
  let txHash: `0x${string}`;
  try {
    proposer = getAddress(opts.proposer);
    txHash = opts.txHash as `0x${string}`;
  } catch {
    return { ok: false, reason: "bad address or tx hash" };
  }

  const reused = await prisma.bet.findFirst({
    where: { creationFeeTxHash: txHash },
    select: { id: true },
  });
  if (reused) {
    return { ok: false, reason: "creation fee already used for another bet" };
  }

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return { ok: false, reason: "creation fee transaction did not succeed" };
    }

    const transfers = parseEventLogs({
      abi: [TRANSFER_EVENT],
      logs: receipt.logs,
      eventName: "Transfer",
    });

    let paid = 0n;
    for (const t of transfers) {
      if (getAddress(t.address) !== getAddress(token.address)) continue;
      if (getAddress(t.args.from) !== proposer) continue;
      if (getAddress(t.args.to) !== ADMIN_ADDRESS) continue;
      paid += t.args.value;
    }

    if (paid < SIDEBET_CREATION_FEE_RAW) {
      return {
        ok: false,
        reason: `$${SIDEBET_CREATION_FEE_USD.toFixed(2)} USDC.e creation fee required`,
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("sidebet creation fee verification failed", err);
    return { ok: false, reason: "could not verify creation fee" };
  }
}
