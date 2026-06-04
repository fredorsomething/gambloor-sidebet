"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowUpRight,
  Check,
  Copy,
  PieChart,
  Plus,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useChainId } from "wagmi";
import { polygon } from "wagmi/chains";

import { useWalletFunds } from "@/components/wallet/FundWalletModal";
import { EthereumUsdcNotice } from "@/components/wallet/EthereumUsdcNotice";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { ETHEREUM_USDC } from "@/lib/chains";
import { formatToken } from "@/lib/utils";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";
import { useWalletStableBalances } from "@/lib/hooks/useWalletStableBalances";
import { jsonFetch } from "@/lib/fetcher";
import { useClickOutside } from "@/lib/useClickOutside";
import { cn, shortAddr } from "@/lib/utils";

export function WalletBalance() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const chainId = useChainId();
  const { openFund, openWithdraw } = useWalletFunds();

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setMenuOpen(false), menuOpen);

  const {
    balances: stableBalances,
    polRaw,
    ethereumUsdcRaw,
    multipleWallets,
    isError: balancesError,
  } = useWalletStableBalances();

  const { data: positions } = useQuery<{
    totalValue: number;
    sidebetValue?: number;
  }>({
    queryKey: ["walletPositions", address?.toLowerCase()],
    enabled: !!address,
    queryFn: () => jsonFetch(`/api/users/${address}/positions`),
    refetchInterval: 10_000,
  });
  // `totalValue` includes both CLOB market positions and live sidebet stakes.
  const positionsValue = positions?.totalValue ?? 0;
  const sidebetValue = positions?.sidebetValue ?? 0;

  const { data: polPrice } = useQuery<{ usdPerPol: number }>({
    queryKey: ["pol-usd"],
    queryFn: () => jsonFetch("/api/wallet/pol-usd"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (!ready || !authenticated || !address) return null;

  const onPolygon = chainId === polygon.id;

  const polygonUsd = stableBalances.reduce((acc, t) => acc + t.amount, 0);
  const nativeUsdc = stableBalances.find((t) => t.symbol === "USDC");
  const pusdBal = stableBalances.find((t) => t.symbol === "pUSD");
  const polAmount = Number(formatUnits(polRaw, 18));
  const polUsdValue = polAmount * (polPrice?.usdPerPol ?? 0);
  const ethereumUsdcUsd = Number(
    formatUnits(ethereumUsdcRaw, ETHEREUM_USDC.decimals),
  );
  const grandTotal =
    polygonUsd + ethereumUsdcUsd + positionsValue + polUsdValue;
  const lowGas = polAmount === 0;

  const onCopy = () => {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const menuContent = (
    <>
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
          href="/me"
          onClick={() => setMenuOpen(false)}
          className="-mx-1 mb-3 flex items-center justify-between rounded-lg px-1 py-1.5 transition-colors hover:bg-muted/60"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <PieChart className="h-4 w-4 text-primary" />
            Positions
            {sidebetValue > 0 && (
              <span className="text-[10px] font-normal text-muted-foreground">
                incl. $
                {sidebetValue.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                sidebets
              </span>
            )}
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
              <TokenSymbol symbol={t.symbol} className="text-muted-foreground" />
              <span
                className={cn(
                  "font-mono tabular-nums",
                  t.raw > 0n && "font-semibold text-foreground",
                )}
              >
                {t.amount.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          ))}
        </div>

        {ethereumUsdcRaw > 0n && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <TokenSymbol symbol="USDC" size={14} />
                <span className="text-[10px]">Ethereum</span>
              </span>
              <span className="font-mono tabular-nums text-warning">
                {formatToken(ethereumUsdcRaw, ETHEREUM_USDC.decimals, 2)}
              </span>
            </div>
            <EthereumUsdcNotice
              className="mt-2"
              amountLabel={formatToken(ethereumUsdcRaw, ETHEREUM_USDC.decimals, 2)}
              onOpenDeposit={() => {
                openFund();
                setMenuOpen(false);
              }}
            />
          </div>
        )}

        {((nativeUsdc?.raw ?? 0n) > 0n || (pusdBal?.raw ?? 0n) > 0n) && (
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            {(nativeUsdc?.raw ?? 0n) > 0n && (
              <Link
                href="/swap?sell=USDC&buy=USDC.e"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <ArrowDownUp className="h-3 w-3" />
                Swap USDC → USDC.e
              </Link>
            )}
            {(pusdBal?.raw ?? 0n) > 0n && (
              <Link
                href="/swap?sell=pUSD&buy=USDC.e"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <ArrowDownUp className="h-3 w-3" />
                Swap pUSD → USDC.e
              </Link>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <TokenIcon symbol="POL" size={14} />
            POL
          </span>
          <span className="text-right">
            <span
              className={cn(
                "block font-mono tabular-nums",
                lowGas && "text-warning",
              )}
            >
              {polAmount.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}
            </span>
            {polUsdValue > 0 && (
              <span className="block text-xs tabular-nums text-muted-foreground">
                ≈ $
                {polUsdValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            )}
          </span>
        </div>

        {multipleWallets && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Totals include all wallets linked to your account.
          </p>
        )}

        {balancesError && (
          <div className="mt-3 rounded-lg bg-danger/10 px-2.5 py-2 text-xs text-danger">
            Could not refresh balances — try again in a moment.
          </div>
        )}

        {!onPolygon && (
          <div className="mt-3 rounded-lg bg-warning/10 px-2.5 py-2 text-xs text-warning">
            Your wallet is not on Polygon — switch networks before sending
            transactions. Balances above are still read from Polygon.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <button
          onClick={() => {
            openFund();
            setMenuOpen(false);
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Deposit
        </button>
        <button
          onClick={() => {
            openWithdraw();
            setMenuOpen(false);
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ArrowUpRight className="h-4 w-4" />
          Withdraw
        </button>
        <Link
          href="/swap"
          onClick={() => setMenuOpen(false)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ArrowDownUp className="h-4 w-4" />
          Swap
        </Link>
        <Link
          href="/me"
          onClick={() => setMenuOpen(false)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <PieChart className="h-4 w-4" />
          Positions
        </Link>
      </div>
    </>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1.5 shadow-sm transition-colors hover:bg-muted/50 max-lg:gap-1 lg:gap-2 lg:px-3.5 lg:py-2"
        title="Wallet balance"
        aria-label={`Wallet balance $${grandTotal.toFixed(2)}`}
      >
        <Wallet className="h-4 w-4 shrink-0 text-success/80" />
        <span className="hidden text-base font-bold tabular-nums text-success min-[380px]:inline max-lg:text-sm lg:inline">
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
        <>
          <MobileBottomSheet
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
          >
            {menuContent}
          </MobileBottomSheet>
          <div className="absolute right-0 top-full z-[120] mt-2 hidden w-72 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-1 md:block">
            {menuContent}
          </div>
        </>
      )}
    </div>
  );
}
