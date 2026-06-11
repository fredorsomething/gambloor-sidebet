"use client";

import { ArrowRight, Eye, EyeOff, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { DiscordWidget } from "@/components/DiscordWidget";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { formatPlatformAmount } from "@/lib/platformStats";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sb_hero_promo_hidden";

type Props = {
  totalVolumeUsd: number;
  userCount: number;
  feed: ReactNode;
};

export function HomePageLayout({ totalVolumeUsd, userCount, feed }: Props) {
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  function toggle() {
    setVisible((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "0" : "1");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const promoToggle = (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors",
        "hover:bg-muted/50 hover:text-foreground",
      )}
      aria-label={visible ? "Hide promo" : "Show promo"}
      title={visible ? "Hide promo" : "Show promo"}
    >
      {visible ? (
        <EyeOff className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Eye className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  );

  if (!ready) {
    return (
      <div className="space-y-8">
        <div className="h-12 animate-pulse rounded-lg bg-muted/30" aria-hidden />
        <div className="h-48 animate-pulse rounded-xl bg-muted/30" aria-hidden />
        <MarketsSection feed={feed} toggle={promoToggle} promoHidden />
      </div>
    );
  }

  return (
    <div className={cn(visible && "space-y-8")}>
      {visible && (
        <div className="space-y-8">
          <section className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-8 gap-y-3 sm:gap-x-10">
              <p className="text-base text-muted-foreground">
                Total volume:{" "}
                <span className="inline-flex items-center gap-1.5 text-3xl font-bold tabular-nums text-foreground">
                  {formatPlatformAmount(totalVolumeUsd)}
                  <TokenIcon symbol="USDC.e" size={28} />
                </span>
              </p>
              <p className="text-base text-muted-foreground">
                Trusted by{" "}
                <span className="text-3xl font-bold tabular-nums text-foreground">
                  {userCount.toLocaleString()}
                </span>{" "}
                users
              </p>
              <p className="text-base text-muted-foreground">
                <span className="text-3xl font-bold tabular-nums text-foreground">
                  100%
                </span>{" "}
                of bets resolved correctly
              </p>
            </div>
            {promoToggle}
          </section>

          <section className="overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[hsl(222_89%_45%)] p-5 text-primary-foreground md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1 md:pr-8">
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  Proper sidebets on-chain.
                </h1>
                <div className="mt-2 space-y-1 text-sm text-primary-foreground/90 md:text-base">
                  <p className="md:whitespace-nowrap">
                    Zero fees on every sidebet.
                  </p>
                  <p className="md:whitespace-nowrap">
                    Create a bet, share your link, and your counterparty can take
                    the other side.
                  </p>
                  <p className="md:whitespace-nowrap">
                    If you can both agree on who won, you get paid out
                    automatically. Can&apos;t agree? A trusted settler calls it.
                  </p>
                </div>
              </div>
              <Link
                href="/create"
                className="hero-create-btn h-12 shrink-0 gap-2.5 self-center px-8 text-base md:h-14 md:px-10 md:text-lg"
              >
                <span className="relative z-10 inline-flex items-center gap-2.5">
                  <Plus className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.5} />
                  Create bet
                  <TokenIcon symbol="USDC.e" size={22} />
                </span>
              </Link>
            </div>
          </section>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-stretch sm:justify-center sm:gap-4">
            <Link
              href="/swap"
              className="group flex w-full min-w-0 max-w-full items-center gap-2.5 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 text-sm transition-colors hover:border-primary/30 hover:bg-muted/50 sm:max-w-[50%]"
            >
              <div className="flex -space-x-2 shrink-0">
                <TokenBadge symbol="POL" />
                <TokenBadge symbol="USDC" />
                <TokenBadge symbol="USDC.e" />
                <TokenBadge symbol="pUSD" />
              </div>
              <p className="min-w-0 flex-1 text-muted-foreground">
                Need gas (POL), or USDC.e to bet?{" "}
                <span className="text-foreground">
                  Use our easy, built-in swap.
                </span>
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                Swap
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
            <DiscordWidget size="bar" className="self-stretch" />
          </div>
        </div>
      )}

      <MarketsSection
        feed={feed}
        toggle={!visible ? promoToggle : null}
        promoHidden={!visible}
      />
    </div>
  );
}

function MarketsSection({
  feed,
  toggle,
  promoHidden,
}: {
  feed: ReactNode;
  toggle: ReactNode | null;
  promoHidden: boolean;
}) {
  return (
    <section id="markets" className="space-y-4">
      <div
        className={cn(
          "flex gap-4",
          promoHidden ? "items-start justify-between" : "flex-col",
        )}
      >
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight">
            Markets
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
              All sidebets in <TokenSymbol symbol="USDC.e" size={14} />
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Find a sidebet here or (
            <Link
              href="/create"
              className="text-foreground underline underline-offset-2 hover:text-primary"
            >
              create your own
            </Link>
            )
          </p>
        </div>
        {toggle}
      </div>
      {feed}
    </section>
  );
}

function TokenBadge({ symbol }: { symbol: string }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted ring-1 ring-border">
      <TokenIcon symbol={symbol} size={20} />
    </span>
  );
}
