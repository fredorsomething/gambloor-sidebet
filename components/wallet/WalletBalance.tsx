"use client";

import { usePrivy } from "@privy-io/react-auth";
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
import { useAccount, useChainId } from "wagmi";
import { polygon } from "@/lib/viemChains";

import { useWalletFunds } from "@/components/wallet/FundWalletModal";
import { WalletChainBalances } from "@/components/wallet/WalletChainBalances";
import { MobileBottomSheet } from "@/components/ui/MobileBottomSheet";
import { useWalletStableBalances } from "@/lib/hooks/useWalletStableBalances";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { jsonFetch } from "@/lib/fetcher";
import { useClickOutside } from "@/lib/useClickOutside";
import { useQuery } from "@tanstack/react-query";
import { shortAddr } from "@/lib/utils";

export function WalletBalance() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const chainId = useChainId();
  const { openFund, openWithdraw } = useWalletFunds();
  const { canUseSponsoredGas } = useTxSender();

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setMenuOpen(false), menuOpen);

  const {
    balances: stableBalances,
    chainGroups,
    polRaw,
    polygonUsd,
    ethereumUsd,
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

  if (!ready || !authenticated || !address) return null;

  const onPolygon = chainId === polygon.id;

  const nativeUsdc = stableBalances.find((t) => t.symbol === "USDC");
  const pusdBal = stableBalances.find((t) => t.symbol === "pUSD");
  const polAmount = polRaw > 0n ? Number(polRaw) / 1e18 : 0;
  const grandTotal = polygonUsd + ethereumUsd + positionsValue;
  const lowGas = !canUseSponsoredGas && polAmount === 0;

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

        <div className="border-t border-border pt-3">
          <WalletChainBalances
            chainGroups={chainGroups}
            onOpenDeposit={() => {
              openFund();
              setMenuOpen(false);
            }}
            emptyMessage="No balances."
          />
        </div>

        {((nativeUsdc?.raw ?? 0n) > 0n || (pusdBal?.raw ?? 0n) > 0n) && (
          <div className="mt-2 space-y-1">
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
          <div className="absolute right-0 top-full z-[120] mt-2 hidden w-80 max-h-[min(80dvh,32rem)] overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-1 md:block">
            {menuContent}
          </div>
        </>
      )}
    </div>
  );
}
