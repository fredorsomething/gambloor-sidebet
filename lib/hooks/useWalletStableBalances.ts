"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  formatUnits,
  getAddress,
  isAddress,
  type Address,
} from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { polygon } from "wagmi/chains";

import { ERC20_ABI } from "@/lib/abi";
import {
  getWalletStablecoins,
  POLYGON_CHAIN_ID,
  type getTokens,
} from "@/lib/chains";
import { linkedEthereumAddresses } from "@/lib/privyWallets";

type WalletToken = ReturnType<typeof getTokens>[number];

export type WalletStableBalanceRow = WalletToken & {
  raw: bigint;
  amount: number;
};

function readBalanceResult(
  entry: { status: "success" | "failure"; result?: unknown } | undefined,
): bigint {
  if (!entry || entry.status !== "success") return 0n;
  return (entry.result as bigint | undefined) ?? 0n;
}

function resolveOwners(args: {
  profileAddress?: string;
  wagmiAddress?: string;
  linked: Set<string>;
}): Address[] {
  if (args.profileAddress) {
    if (!isAddress(args.profileAddress)) return [];
    return [getAddress(args.profileAddress)];
  }

  const set = new Set<string>();
  if (args.wagmiAddress && isAddress(args.wagmiAddress)) {
    set.add(args.wagmiAddress.toLowerCase());
  }
  for (const a of args.linked) set.add(a);

  return [...set].map((a) => getAddress(a));
}

const polygonRpc =
  process.env.NEXT_PUBLIC_POLYGON_RPC ||
  "https://polygon-bor-rpc.publicnode.com";

/**
 * Polygon ERC-20 stable balances for a profile address, or the sum across every
 * Ethereum wallet linked to the signed-in Privy user (embedded + external).
 *
 * Using only `useAccount().address` misses funds when Privy has not yet switched
 * wagmi to the embedded wallet, or when USDC/pUSD sit on another linked address.
 */
export function useWalletStableBalances(profileAddress?: string) {
  const { authenticated, user } = usePrivy();
  const { address: wagmiAddress } = useAccount();

  const linked = useMemo(
    () => (authenticated && user ? linkedEthereumAddresses(user) : new Set<string>()),
    [authenticated, user],
  );

  const owners = useMemo(
    () =>
      resolveOwners({
        profileAddress,
        wagmiAddress,
        linked,
      }),
    [profileAddress, wagmiAddress, linked],
  );

  const tokens = useMemo(() => getWalletStablecoins(), []);

  const contracts = useMemo(
    () =>
      owners.flatMap((owner) =>
        tokens.map((t) => ({
          address: t.address,
          abi: ERC20_ABI,
          functionName: "balanceOf" as const,
          args: [owner] as const,
          chainId: POLYGON_CHAIN_ID,
        })),
      ),
    [owners, tokens],
  );

  const {
    data: contractData,
    isLoading: erc20Loading,
    isError: erc20Error,
    refetch: refetchErc20,
  } = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      enabled: owners.length > 0 && tokens.length > 0,
      refetchInterval: 12_000,
    },
  });

  const {
    data: polRaw = 0n,
    isLoading: polLoading,
    refetch: refetchPol,
  } = useQuery({
    queryKey: ["walletPol", owners.map((o) => o.toLowerCase()).join(",")],
    enabled: owners.length > 0,
    refetchInterval: 12_000,
    queryFn: async () => {
      const { createPublicClient, http } = await import("viem");
      const client = createPublicClient({
        chain: polygon,
        transport: http(polygonRpc),
      });
      let sum = 0n;
      for (const owner of owners) {
        sum += await client.getBalance({ address: owner });
      }
      return sum;
    },
  });

  const balances = useMemo((): WalletStableBalanceRow[] => {
    const perToken = new Map<string, bigint>();
    for (const t of tokens) perToken.set(t.symbol, 0n);

    if (contractData) {
      let idx = 0;
      for (let o = 0; o < owners.length; o++) {
        for (const t of tokens) {
          const raw = readBalanceResult(contractData[idx]);
          perToken.set(t.symbol, (perToken.get(t.symbol) ?? 0n) + raw);
          idx += 1;
        }
      }
    }

    return tokens
      .map((t) => {
        const raw = perToken.get(t.symbol) ?? 0n;
        return {
          ...t,
          raw,
          amount: Number(formatUnits(raw, t.decimals)),
        };
      })
      .sort((a, b) => (a.raw > b.raw ? -1 : a.raw < b.raw ? 1 : 0));
  }, [tokens, owners, contractData]);

  const balanceBySymbol = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const row of balances) map.set(row.symbol, row.raw);
    map.set("POL", polRaw);
    return map;
  }, [balances, polRaw]);

  const multipleWallets = !profileAddress && owners.length > 1;

  return {
    balances,
    balanceBySymbol,
    polRaw,
    owners,
    multipleWallets,
    isLoading: erc20Loading || polLoading,
    isError: erc20Error,
    refetch: () => {
      void refetchErc20();
      void refetchPol();
    },
  };
}
