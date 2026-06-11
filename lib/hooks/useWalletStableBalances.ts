"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { jsonFetch } from "@/lib/fetcher";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  type Address,
} from "viem";
import { mainnet, polygon } from "wagmi/chains";
import { useAccount } from "wagmi";

import { ERC20_ABI } from "@/lib/abi";
import {
  ETHEREUM_CHAIN_ID,
  ETHEREUM_USDC,
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

/** One balance line on a specific chain (Polygon or Ethereum). */
export type WalletBalanceEntry = {
  chainId: number;
  chainLabel: string;
  symbol: string;
  raw: bigint;
  decimals: number;
  amount: number;
  /** Can bet / swap on Sidebet without bridging (Polygon only) */
  onPlatform: boolean;
};

export type WalletChainGroup = {
  chainId: number;
  chainLabel: string;
  onPlatform: boolean;
  entries: WalletBalanceEntry[];
  totalUsd: number;
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

const ethereumRpc =
  process.env.NEXT_PUBLIC_ETHEREUM_RPC ||
  "https://ethereum.publicnode.com";

type PolygonFetched = {
  perToken: Map<string, bigint>;
  pol: bigint;
};

async function fetchPolygonBalances(
  owners: Address[],
  tokens: WalletToken[],
): Promise<PolygonFetched> {
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

type EthereumFetched = {
  usdc: bigint;
  eth: bigint;
};

async function fetchEthereumBalances(owners: Address[]): Promise<EthereumFetched> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(ethereumRpc),
  });

  let usdc = 0n;
  let eth = 0n;

  for (const owner of owners) {
    const [usdcRaw, ethRaw] = await Promise.all([
      client.readContract({
        address: ETHEREUM_USDC.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [owner],
      }),
      client.getBalance({ address: owner }),
    ]);
    usdc += usdcRaw;
    eth += ethRaw;
  }

  return { usdc, eth };
}

function entryUsd(
  entry: WalletBalanceEntry,
  prices: { usdPerPol: number; usdPerEth: number },
): number {
  if (entry.symbol === "POL") return entry.amount * prices.usdPerPol;
  if (entry.symbol === "ETH") return entry.amount * prices.usdPerEth;
  return entry.amount;
}

function buildChainGroups(args: {
  polygonBalances: WalletStableBalanceRow[];
  polRaw: bigint;
  ethereumUsdc: bigint;
  ethereumEth: bigint;
  usdPerPol: number;
  usdPerEth: number;
}): WalletChainGroup[] {
  const prices = { usdPerPol: args.usdPerPol, usdPerEth: args.usdPerEth };
  const groups: WalletChainGroup[] = [];

  const polygonEntries: WalletBalanceEntry[] = [];

  for (const t of args.polygonBalances) {
    if (t.raw <= 0n) continue;
    polygonEntries.push({
      chainId: POLYGON_CHAIN_ID,
      chainLabel: "Polygon",
      symbol: t.symbol,
      raw: t.raw,
      decimals: t.decimals,
      amount: t.amount,
      onPlatform: true,
    });
  }

  if (args.polRaw > 0n) {
    polygonEntries.push({
      chainId: POLYGON_CHAIN_ID,
      chainLabel: "Polygon",
      symbol: "POL",
      raw: args.polRaw,
      decimals: 18,
      amount: Number(formatUnits(args.polRaw, 18)),
      onPlatform: true,
    });
  }

  if (polygonEntries.length > 0) {
    groups.push({
      chainId: POLYGON_CHAIN_ID,
      chainLabel: "Polygon",
      onPlatform: true,
      entries: polygonEntries,
      totalUsd: polygonEntries.reduce((acc, e) => acc + entryUsd(e, prices), 0),
    });
  }

  const ethereumEntries: WalletBalanceEntry[] = [];

  if (args.ethereumUsdc > 0n) {
    ethereumEntries.push({
      chainId: ETHEREUM_CHAIN_ID,
      chainLabel: "Ethereum",
      symbol: ETHEREUM_USDC.symbol,
      raw: args.ethereumUsdc,
      decimals: ETHEREUM_USDC.decimals,
      amount: Number(formatUnits(args.ethereumUsdc, ETHEREUM_USDC.decimals)),
      onPlatform: false,
    });
  }

  if (args.ethereumEth > 0n) {
    ethereumEntries.push({
      chainId: ETHEREUM_CHAIN_ID,
      chainLabel: "Ethereum",
      symbol: "ETH",
      raw: args.ethereumEth,
      decimals: 18,
      amount: Number(formatUnits(args.ethereumEth, 18)),
      onPlatform: false,
    });
  }

  if (ethereumEntries.length > 0) {
    groups.push({
      chainId: ETHEREUM_CHAIN_ID,
      chainLabel: "Ethereum",
      onPlatform: false,
      entries: ethereumEntries,
      totalUsd: ethereumEntries.reduce((acc, e) => acc + entryUsd(e, prices), 0),
    });
  }

  return groups;
}

/**
 * Multi-chain wallet balances: Polygon (platform) + Ethereum (display / bridge).
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
    data: polygonFetched,
    isLoading: polygonLoading,
    isError: polygonError,
    refetch: refetchPolygon,
  } = useQuery({
    queryKey: ["walletBalances", "polygon", ownersKey],
    enabled: owners.length > 0 && tokens.length > 0,
    refetchInterval: 12_000,
    queryFn: () => fetchPolygonBalances(owners, tokens),
  });

  const {
    data: ethereumFetched,
    isLoading: ethereumLoading,
    refetch: refetchEthereum,
  } = useQuery({
    queryKey: ["walletBalances", "ethereum", ownersKey],
    enabled: owners.length > 0,
    refetchInterval: 12_000,
    queryFn: () => fetchEthereumBalances(owners),
  });

  const polRaw = polygonFetched?.pol ?? 0n;
  const ethereumUsdcRaw = ethereumFetched?.usdc ?? 0n;
  const ethereumEthRaw = ethereumFetched?.eth ?? 0n;

  const balances = useMemo((): WalletStableBalanceRow[] => {
    const perToken = polygonFetched?.perToken;
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
  }, [tokens, polygonFetched?.perToken]);

  const balanceBySymbol = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const row of balances) map.set(row.symbol, row.raw);
    map.set("POL", polRaw);
    return map;
  }, [balances, polRaw]);

  const { data: polPrice } = useQuery({
    queryKey: ["pol-usd"],
    queryFn: () => jsonFetch<{ usdPerPol: number }>("/api/wallet/pol-usd"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: ethPrice } = useQuery({
    queryKey: ["eth-usd"],
    queryFn: () => jsonFetch<{ usdPerEth: number }>("/api/wallet/eth-usd"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const usdPerPol = polPrice?.usdPerPol ?? 0;
  const usdPerEth = ethPrice?.usdPerEth ?? 0;

  const chainGroups = useMemo(
    () =>
      buildChainGroups({
        polygonBalances: balances,
        polRaw,
        ethereumUsdc: ethereumUsdcRaw,
        ethereumEth: ethereumEthRaw,
        usdPerPol,
        usdPerEth,
      }),
    [balances, polRaw, ethereumUsdcRaw, ethereumEthRaw, usdPerPol, usdPerEth],
  );

  const polygonUsd =
    balances.reduce((acc, t) => acc + t.amount, 0) +
    Number(formatUnits(polRaw, 18)) * usdPerPol;
  const ethereumUsd =
    Number(formatUnits(ethereumUsdcRaw, ETHEREUM_USDC.decimals)) +
    Number(formatUnits(ethereumEthRaw, 18)) * usdPerEth;

  const multipleWallets = !profileAddress && owners.length > 1;

  return {
    balances,
    balanceBySymbol,
    chainGroups,
    polRaw,
    ethereumUsdcRaw,
    ethereumEthRaw,
    ethereumUsdcAmount: Number(formatUnits(ethereumUsdcRaw, ETHEREUM_USDC.decimals)),
    polygonUsd,
    ethereumUsd,
    totalUsd: polygonUsd + ethereumUsd,
    owners,
    multipleWallets,
    isLoading: polygonLoading || ethereumLoading,
    isError: polygonError,
    hasEthereumBalances: ethereumUsdcRaw > 0n || ethereumEthRaw > 0n,
    refetch: () => {
      void refetchPolygon();
      void refetchEthereum();
    },
  };
}
