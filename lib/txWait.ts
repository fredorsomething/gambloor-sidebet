import type { Address, Hex } from "viem";

import { ERC20_ABI } from "@/lib/abi";

/** Wait for a transaction to be mined (best-effort). */
export async function waitForTxReceipt(
  hash: Hex,
  timeoutMs = 60_000,
): Promise<void> {
  const { createPublicClient, http } = await import("viem");
  const { polygon } = await import("@/lib/viemChains");
  const rpc =
    process.env.NEXT_PUBLIC_POLYGON_RPC ||
    "https://polygon-bor-rpc.publicnode.com";
  const client = createPublicClient({ chain: polygon, transport: http(rpc) });
  try {
    await client.waitForTransactionReceipt({ hash, timeout: timeoutMs });
  } catch {
    /* caller may poll state separately */
  }
}

/** After an approval tx, poll allowance until it is at least `needed`. */
export async function waitForAllowance(
  token: Address,
  spender: Address,
  owner: Address,
  needed: bigint,
  hash: Hex,
): Promise<void> {
  const { createPublicClient, http } = await import("viem");
  const { polygon } = await import("@/lib/viemChains");
  const rpc =
    process.env.NEXT_PUBLIC_POLYGON_RPC ||
    "https://polygon-bor-rpc.publicnode.com";
  const client = createPublicClient({ chain: polygon, transport: http(rpc) });
  await waitForTxReceipt(hash);
  for (let i = 0; i < 30; i++) {
    const allowance = await client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    });
    if (allowance >= needed) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Approval did not confirm in time. Please try again.");
}
