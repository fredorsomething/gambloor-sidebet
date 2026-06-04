"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  type Address,
} from "viem";
import { polygon } from "wagmi/chains";
import { useAccount } from "wagmi";

import { ERC20_ABI } from "@/lib/abi";
import {
  getWalletStablecoins,
  type getTokens,
} from "@/lib/chains";
import { linkedEthereumAddresses } from "@/lib/privyWallets";

type WalletToken = ReturnType<typeof getTokens>[number];

export type WalletStableBalanceRow = WalletToken & {
  raw: bigint;
  amount: number;
};

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

type FetchedBalances = {
  perToken: Map<string, bigint>;
  pol: bigint;
};

async function fetchPolygonBalances(
  owners: Address[],
  tokens: WalletToken[],
): Promise<FetchedBalances> {
  const client = createPublicClient({
    chain: polygon,
    transport: http(polygonRpc),
  });

  const perToken = new Map<string, bigint>();
  for (const t of tokens) perToken.set(t.symbol, 0n);

  let pol = 0n;

  const erc20Calls = owners.flatMap((owner) =>
    tokens.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [owner] as const,
    })),
  );

  const [polResults, erc20Results] = await Promise.all([
    Promise.all(owners.map((owner) => client.getBalance({ address: owner }))),
    erc20Calls.length > 0
      ? client.multicall({ contracts: erc20Calls, allowFailure: true })
      : Promise.resolve([]),
  ]);

  for (const bal of polResults) pol += bal;

  let idx = 0;
  for (let o = 0; o < owners.length; o++) {
    for (const t of tokens) {
      const entry = erc20Results[idx];
      idx += 1;
      if (entry?.status === "success") {
        const raw = entry.result as bigint;
        perToken.set(t.symbol, (perToken.get(t.symbol) ?? 0n) + raw);
      }
    }
  }

  return { perToken, pol };
}

/**
 * Polygon ERC-20 stable balances for a profile address, or the sum across every
 * Ethereum wallet linked to the signed-in Privy user (embedded + external).
 *
 * Reads go through a public Polygon RPC (not wagmi) so profile pages show
 * correct USDC/pUSD even when the viewer is logged out or on another chain.
 */
export function useWalletStableBalances(profileAddress?: string) {
  const { authenticated, user } = usePrivy();
  const { address: wagmiAddress } = useAccount();

  const linked = useMemo(
    () =>
      authenticated && user ? linkedEthereumAddresses(user) : new Set<string>(),
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

  const ownersKey = owners.map((o) => o.toLowerCase()).join(",");

  const {
    data: fetched,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["walletBalances", ownersKey],
    enabled: owners.length > 0 && tokens.length > 0,
    refetchInterval: 12_000,
    queryFn: () => fetchPolygonBalances(owners, tokens),
  });

  const polRaw = fetched?.pol ?? 0n;

  const balances = useMemo((): WalletStableBalanceRow[] => {
    const perToken = fetched?.perToken;
    return tokens
      .map((t) => {
        const raw = perToken?.get(t.symbol) ?? 0n;
        return {
          ...t,
          raw,
          amount: Number(formatUnits(raw, t.decimals)),
        };
      })
      .sort((a, b) => (a.raw > b.raw ? -1 : a.raw < b.raw ? 1 : 0));
  }, [tokens, fetched?.perToken]);

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
    isLoading,
    isError,
    refetch,
  };
}
