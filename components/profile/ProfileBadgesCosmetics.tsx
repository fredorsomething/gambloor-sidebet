"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  encodeFunctionData,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { TxSuccessDialog } from "@/components/wallet/TxSuccessDialog";
import type { BadgeKind } from "@/lib/badges";
import { ERC20_ABI } from "@/lib/abi";
import { formatCryptoError } from "@/lib/cryptoErrors";
import { jsonFetch } from "@/lib/fetcher";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { useTxSender } from "@/lib/hooks/useTxSender";
import {
  BADGE_VISUAL,
  LOCKED_CATALOG_BADGES,
  LOCKED_CATALOG_HINT,
} from "@/lib/profileBadgeMeta";
import { SUPPORTER_PRICE_USDC } from "@/lib/supporterBadge";
import { cn, formatToken } from "@/lib/utils";

type SupporterConfig = {
  priceUsdc: number;
  treasury: string | null;
  tokens: Array<{ symbol: string; address: string; decimals: number }>;
};

function BadgeChip({
  kind,
  locked,
  owned,
}: {
  kind: BadgeKind;
  locked?: boolean;
  owned?: boolean;
}) {
  const meta = BADGE_VISUAL[kind];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        locked ? meta.lockedClassName : meta.className,
        owned && !locked && "ring-1 ring-pink-400/40",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export function ProfileBadgesCosmetics({
  address,
  badges,
}: {
  address: string;
  badges: BadgeKind[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        aria-label="Profile badges"
      >
        <Star className="h-3.5 w-3.5" />
        Badges
      </button>
      {open && (
        <ProfileBadgesModal
          address={address}
          badges={badges}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ProfileBadgesModal({
  address,
  badges,
  onClose,
}: {
  address: string;
  badges: BadgeKind[];
  onClose: () => void;
}) {
  const hasSupporter = badges.includes("Supporter");
  const configQ = useQuery<SupporterConfig>({
    queryKey: ["supporter-badge-config"],
    queryFn: () => jsonFetch("/api/profile/supporter"),
    staleTime: 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto card p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Profile badges</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Customize how your profile appears. Some badges are earned or granted;
          others can be purchased.
        </p>

        <div className="mt-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Available to buy
          </h3>
          {hasSupporter ? (
            <div className="rounded-xl border border-pink-500/40 bg-pink-500/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <BadgeChip kind="Supporter" owned />
                <span className="text-xs font-medium text-pink-400">Owned</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Thanks for supporting sidebet.lol!
              </p>
            </div>
          ) : (
            <SupporterPurchasePanel
              address={address}
              config={configQ.data}
              loading={configQ.isLoading}
              onSuccess={onClose}
            />
          )}
        </div>

        <div className="mt-6 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Other badges
          </h3>
          <div className="space-y-2">
            {LOCKED_CATALOG_BADGES.map((kind) => {
              const owned = badges.includes(kind);
              return (
                <div
                  key={kind}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 opacity-70"
                >
                  <BadgeChip kind={kind} locked={!owned} />
                  <span className="text-right text-[11px] text-muted-foreground">
                    {owned
                      ? "Active on your profile"
                      : (LOCKED_CATALOG_HINT[kind] ?? "Not available yet")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SupporterPurchasePanel({
  address,
  config,
  loading,
  onSuccess,
}: {
  address: string;
  config?: SupporterConfig;
  loading: boolean;
  onSuccess: () => void;
}) {
  const { authenticated, login, getAccessToken } = usePrivy();
  const { address: from } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { push } = useToast();
  const qc = useQueryClient();
  const { sendTx } = useTxSender();

  const tokenOptions = useMemo(
    () => config?.tokens ?? [{ symbol: "USDC", address: "", decimals: 6 }],
    [config?.tokens],
  );

  const usdcToken = tokenOptions.find((t) => t.symbol === "USDC");
  const usdceToken = tokenOptions.find((t) => t.symbol === "USDC.e");

  const usdcInfo = useTokenInfo({
    token: usdcToken?.address as Address | undefined,
    owner: from,
  });
  const usdceInfo = useTokenInfo({
    token: usdceToken?.address as Address | undefined,
    owner: from,
  });

  const priceWei = parseUnits(String(SUPPORTER_PRICE_USDC), 6);

  const asset = useMemo(() => {
    if (usdcToken && (usdcInfo.balance ?? 0n) >= priceWei) return usdcToken;
    if (usdceToken && (usdceInfo.balance ?? 0n) >= priceWei) return usdceToken;
    return usdceToken ?? usdcToken ?? tokenOptions[0];
  }, [usdcToken, usdceToken, usdcInfo.balance, usdceInfo.balance, tokenOptions, priceWei]);

  const balance =
    asset?.symbol === "USDC.e"
      ? (usdceInfo.balance ?? 0n)
      : asset?.symbol === "USDC"
        ? (usdcInfo.balance ?? 0n)
        : 0n;

  const [txHash, setTxHash] = useState<Hex>();
  const [sending, setSending] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const wait = useWaitForTransactionReceipt({ hash: txHash });

  const onPolygon = chainId === polygon.id;
  const treasury = config?.treasury;
  const canPay =
    onPolygon &&
    !!from &&
    !!treasury &&
    !!asset?.address &&
    balance >= priceWei &&
    !sending &&
    !wait.isLoading &&
    !redeeming;

  useEffect(() => {
    if (!wait.isSuccess || confirmed || !txHash || !from) return;

    async function redeem() {
      setRedeeming(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Your session expired. Please sign in again.");
        await jsonFetch<{ badges: BadgeKind[] }>("/api/profile/supporter", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            from,
            txHash,
            symbol: asset.symbol,
          }),
        });
        await qc.invalidateQueries({ queryKey: ["userPage"] });
        setConfirmed(true);
      } catch (err) {
        push({
          title: "Payment received but badge not applied",
          description: (err as Error).message,
          variant: "danger",
        });
      } finally {
        setRedeeming(false);
      }
    }

    void redeem();
  }, [
    wait.isSuccess,
    confirmed,
    txHash,
    from,
    getAccessToken,
    asset.symbol,
    qc,
    push,
  ]);

  async function onBuy() {
    if (!authenticated) {
      void login();
      return;
    }
    if (!treasury || !asset?.address || !from) return;
    if (from.toLowerCase() !== address.toLowerCase()) {
      push({
        title: "Switch wallet",
        description: "Connect the wallet for this profile to buy the badge.",
        variant: "danger",
      });
      return;
    }

    setSending(true);
    try {
      const hash = await sendTx({
        to: asset.address as Address,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [treasury as Address, priceWei],
        }),
      });
      setTxHash(hash);
      push({ title: "Payment submitted", description: "Waiting for confirmation…" });
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Payment failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setSending(false);
    }
  }

  if (confirmed && txHash) {
    return (
      <TxSuccessDialog
        title="Supporter badge unlocked!"
        description="Your profile now shows the Supporter badge. Thanks for supporting sidebet.lol."
        txHash={txHash}
        chainId={polygon.id}
        onClose={onSuccess}
      />
    );
  }

  return (
    <div className="rounded-xl border border-pink-500/40 bg-pink-500/10 p-4">
      <div className="flex items-center gap-2">
        <BadgeChip kind="Supporter" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Support sidebet and earn the Supporter badge. Our platform is only
        possible through your support{" "}
        <span className="text-pink-400">&lt;3</span>
      </p>

      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : !treasury ? (
        <p className="mt-3 text-xs text-danger">Support is unavailable right now.</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Your balance:{" "}
            <span className="font-medium text-foreground">
              {formatToken(balance, asset?.decimals ?? 6, 2)} {asset?.symbol ?? "USDC"}
            </span>
          </p>
          {!onPolygon ? (
            <Button
              className="mt-3 w-full"
              size="sm"
              onClick={() => switchChain({ chainId: polygon.id })}
            >
              Switch to Polygon
            </Button>
          ) : (
            <Button
              className="mt-3 w-full gap-1.5 bg-pink-500 text-white hover:bg-pink-600"
              size="sm"
              onClick={onBuy}
              disabled={!canPay}
            >
              <Heart className="h-4 w-4" />
              {sending || wait.isLoading || redeeming
                ? "Processing…"
                : `Support — ${SUPPORTER_PRICE_USDC} USDC`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
