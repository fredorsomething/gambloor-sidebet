"use client";

import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { mainnet, polygon } from "@/lib/viemChains";
import { ERC20_ABI } from "@/lib/abi";
import { ETHEREUM_CHAIN_ID, POLYGON_CHAIN_ID } from "@/lib/chains";

/**
 * Live decimals/symbol/balance/allowance for an arbitrary ERC-20.
 *
 * Implemented as 4 separate `useReadContract` calls because wagmi's
 * `useReadContracts` requires a fixed tuple type that can't be conditionally
 * spread without losing the narrowing wagmi needs for `args`.
 */
export function useTokenInfo(args: {
  token?: Address;
  owner?: Address;
  spender?: Address;
  chainId?: number;
}) {
  const enabled = Boolean(args.token);
  const chainId =
    (args.chainId ?? POLYGON_CHAIN_ID) === ETHEREUM_CHAIN_ID
      ? mainnet.id
      : polygon.id;

  const decimalsQ = useReadContract({
    address: args.token,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId,
    query: { enabled, refetchInterval: 30_000 },
  });

  const symbolQ = useReadContract({
    address: args.token,
    abi: ERC20_ABI,
    functionName: "symbol",
    chainId,
    query: { enabled, refetchInterval: 60_000 },
  });

  const balanceQ = useReadContract({
    address: args.token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: args.owner ? [args.owner] : undefined,
    chainId,
    query: { enabled: enabled && !!args.owner, refetchInterval: 8_000 },
  });

  const allowanceQ = useReadContract({
    address: args.token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: args.owner && args.spender ? [args.owner, args.spender] : undefined,
    chainId,
    query: {
      enabled: enabled && !!args.owner && !!args.spender,
      refetchInterval: 8_000,
    },
  });

  async function refetch() {
    await Promise.all([
      decimalsQ.refetch(),
      symbolQ.refetch(),
      balanceQ.refetch(),
      allowanceQ.refetch(),
    ]);
  }

  return {
    decimals: decimalsQ.data as number | undefined,
    symbol: symbolQ.data as string | undefined,
    balance: balanceQ.data as bigint | undefined,
    allowance: allowanceQ.data as bigint | undefined,
    isLoading:
      decimalsQ.isLoading ||
      symbolQ.isLoading ||
      balanceQ.isLoading ||
      allowanceQ.isLoading,
    refetch,
  };
}
