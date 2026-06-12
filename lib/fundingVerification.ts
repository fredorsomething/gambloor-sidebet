import { getAddress, parseAbiItem, parseEventLogs } from "viem";
import type { PublicClient } from "viem";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export type VerifiedFunding = {
  transferred: bigint;
  logIndex: number;
};

/** Verify a confirmed on-chain USDC.e transfer from `maker` to `treasury`. */
export async function verifyFundingTransfer(opts: {
  publicClient: PublicClient;
  txHash: `0x${string}`;
  token: string;
  maker: string;
  treasury: string;
}): Promise<VerifiedFunding | { error: string }> {
  try {
    const receipt = await opts.publicClient.getTransactionReceipt({
      hash: opts.txHash,
    });
    if (receipt.status !== "success") {
      return { error: "funding transfer did not succeed" };
    }
    const transfers = parseEventLogs({
      abi: [TRANSFER_EVENT],
      logs: receipt.logs,
      eventName: "Transfer",
    });
    let transferred = 0n;
    let logIndex = -1;
    const token = getAddress(opts.token);
    const maker = getAddress(opts.maker);
    const treasury = getAddress(opts.treasury);
    for (const t of transfers) {
      if (getAddress(t.address) !== token) continue;
      if (getAddress(t.args.from) !== maker) continue;
      if (getAddress(t.args.to) !== treasury) continue;
      transferred += t.args.value;
      if (logIndex < 0) logIndex = t.logIndex;
    }
    if (logIndex < 0 || transferred <= 0n) {
      return { error: "no treasury transfer found in transaction" };
    }
    return { transferred, logIndex };
  } catch (err) {
    console.error("funding verification failed", err);
    return { error: "could not verify funding transfer" };
  }
}
