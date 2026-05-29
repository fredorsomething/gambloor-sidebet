"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Copy,
  Fuel,
  PieChart,
  Plus,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance, useChainId, useReadContracts } from "wagmi";
import { polygon } from "wagmi/chains";

import { useWalletFunds } from "@/components/wallet/FundWalletModal";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { ERC20_ABI } from "@/lib/abi";
import { getTokens } from "@/lib/chains";
import { jsonFetch } from "@/lib/fetcher";
import { cn, shortAddr } from "@/lib/utils";

const STABLE_SYMBOLS = new Set(["USDC", "pUSD", "USDC.e"]);

export function WalletBalance() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const chainId = useChainId();
  const { openFund, openWithdraw, fundGas } = useWalletFunds();

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const stables = getTokens().filter((t) => STABLE_SYMBOLS.has(t.symbol));

  const { data: stableData } = useReadContracts({
    allowFailure: true,
    contracts: stables.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
      chainId: polygon.id,
    })),
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const { data: pol } = useBalance({
    address,
    chainId: polygon.id,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const { data: positions } = useQuery<{ totalValue: number }>({
    queryKey: ["walletPositions", address?.toLowerCase()],
    enabled: !!address,
    queryFn: () => jsonFetch(`/api/users/${address}/positions`),
    refetchInterval: 10_000,
  });
  const positionsValue = positions?.totalValue ?? 0;

  if (!ready || !authenticated || !address) return null;

  const onPolygon = chainId === polygon.id;

  const stableBalances = stables.map((t, i) => {
    const raw = (stableData?.[i]?.result as bigint | undefined) ?? 0n;
    return { ...t, raw, amount: Number(formatUnits(raw, t.decimals)) };
  });

  const totalUsd = stableBalances.reduce((acc, t) => acc + t.amount, 0);
  const grandTotal = totalUsd + positionsValue;
  const polAmount = pol ? Number(pol.formatted) : 0;
  const lowGas = polAmount === 0;

  const onCopy = () => {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
        title="Wallet balance"
      >
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <span className="tabular-nums">
          $
          {grandTotal.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        {lowGas && (
          <span
            className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-warning"
            title="No POL for gas"
            aria-hidden
          />
        )}
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between border-b border-border p-3">
            <div className="text-sm font-semibold">Wallet</div>
            <button
              onClick={onCopy}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Copy address"
            >
              {copied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {shortAddr(address)}
            </button>
          </div>

          <div className="p-3">
            <Link
              href="/portfolio"
              onClick={() => setMenuOpen(false)}
              className="-mx-1 mb-3 flex items-center justify-between rounded-lg px-1 py-1.5 transition-colors hover:bg-muted/60"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <PieChart className="h-4 w-4 text-primary" />
                Positions
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                $
                {positionsValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </Link>

            <div className="border-t border-border pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Stablecoins
            </div>
            <div className="mt-2 space-y-1.5">
              {stableBalances.map((t) => (
                <div
                  key={t.symbol}
                  className="flex items-center justify-between text-sm"
                >
                  <TokenSymbol
                    symbol={t.symbol}
                    className="text-muted-foreground"
                  />
                  <span className="font-mono tabular-nums">
                    {t.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <TokenIcon symbol="POL" size={14} />
                POL (gas)
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  lowGas && "text-warning",
                )}
              >
                {polAmount.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}
              </span>
            </div>

            {!onPolygon && (
              <div className="mt-3 rounded-lg bg-warning/10 px-2.5 py-2 text-xs text-warning">
                Wrong network — switch to Polygon to see live balances.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
            <button
              onClick={() => {
                openFund();
                setMenuOpen(false);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Deposit
            </button>
            <button
              onClick={() => {
                openWithdraw();
                setMenuOpen(false);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ArrowUpRight className="h-4 w-4" />
              Withdraw
            </button>
            <button
              onClick={() => {
                void fundGas();
                setMenuOpen(false);
              }}
              className={cn(
                "col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                lowGas && "border-warning/40 text-warning hover:bg-warning/10",
              )}
            >
              <Fuel className="h-4 w-4" />
              Top up gas (POL)
            </button>
            <Link
              href="/portfolio"
              onClick={() => setMenuOpen(false)}
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <PieChart className="h-4 w-4" />
              Portfolio
            </Link>
          </div>

          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Deposits use Privy (card, exchange, or wallet). Withdrawals send
            on-chain from your connected wallet.
          </p>
        </div>
      )}
    </div>
  );
}
