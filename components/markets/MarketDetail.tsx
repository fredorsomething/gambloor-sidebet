"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { polygon } from "wagmi/chains";

import { BetThumbnail } from "@/components/BetThumbnail";
import { CollapsibleBlurb } from "@/components/CollapsibleBlurb";
import { Comments } from "@/components/Comments";
import { MarketPortfolio } from "@/components/markets/MarketPortfolio";
import { ProposeResolutionButton } from "@/components/ProposeResolutionButton";
import { Resolvers } from "@/components/Resolvers";
import { Button } from "@/components/ui/button";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { TypeTag } from "@/components/ui/TypeTag";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI } from "@/lib/abi";
import { isAdminAddress } from "@/lib/admin";
import { displayResolver } from "@/lib/settlerUtils";
import { getMarketCollateralToken } from "@/lib/chains";
import { formatCryptoError } from "@/lib/cryptoErrors";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useMarketSocket } from "@/lib/hooks/useMarketSocket";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { jsonFetch } from "@/lib/fetcher";
import { formatMicro } from "@/lib/exchange/units";
import type { BookLevel, BookSnapshot } from "@/lib/exchange/types";
import { shortAddr } from "@/lib/utils";
import type { MarketDetailResponse } from "@/lib/types";

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";

type ExchangeConfig = {
  chainId: number;
  treasury: string | null;
  token: { address: string; symbol: string; decimals: number };
  wsUrl: string | null;
};

type Level = { price: number; shares: number };

function cents(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}
function money(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}
function microToNum(s: string | undefined): number {
  return Number(formatMicro(BigInt(s ?? "0")));
}

const WS_URL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ENGINE_WS_URL ?? null : null;

export function MarketDetail({ id }: { id: number }) {
  const { address: account } = useAccount();
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const searchParams = useSearchParams();
  const { writeContract } = useTxSender();
  const ensurePolygon = useEnsurePolygon();
  const publicClient = usePublicClient({ chainId: polygon.id });

  const viewerQ = account ? `?viewer=${account}` : "";
  const query = useQuery<MarketDetailResponse>({
    queryKey: ["market", id, account],
    queryFn: () => jsonFetch(`/api/markets/${id}${viewerQ}`),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const config = useQuery<ExchangeConfig>({
    queryKey: ["exchange-config"],
    queryFn: () => jsonFetch(`/api/exchange/config`),
    staleTime: 60_000,
  });

  // Latest resolution proposal — drives the "verified · awaiting settlement"
  // banner once an admin has verified the outcome but before final settlement.
  const resolutionQ = useQuery<{
    proposal: { status: string; proposedOutcome: number } | null;
  }>({
    queryKey: ["market-resolution", id],
    queryFn: () =>
      jsonFetch(`/api/resolutions?subjectType=market&subjectId=${id}`),
    refetchInterval: 15_000,
  });
  const verifiedProposal =
    resolutionQ.data?.proposal?.status === "Approved"
      ? resolutionQ.data.proposal
      : null;

  const live = useMarketSocket(id, WS_URL ?? config.data?.wsUrl ?? null);

  const data = query.data;
  const market = data?.market;
  const book: BookSnapshot | null = live.book ?? data?.book ?? null;

  const [selectedIdx, setSelectedIdx] = useState(() => {
    const o = Number(searchParams.get("o"));
    return Number.isInteger(o) && o >= 0 ? o : 0;
  });
  const [side, setSide] = useState<Side>(
    searchParams.get("side") === "SELL" ? "SELL" : "BUY",
  );
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [limitCents, setLimitCents] = useState("");
  const [shares, setShares] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fallback = getMarketCollateralToken();
  const sym = market?.tokenSymbol ?? fallback.symbol;
  const tokenAddress = (config.data?.token.address ?? fallback.address) as Address;
  const tokenDecimals = config.data?.token.decimals ?? fallback.decimals;

  // Funds live in the wallet; buying power is the on-chain USDC.e balance.
  const { data: walletBalRaw } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: account ? [account as Address] : undefined,
    chainId: polygon.id,
    query: { enabled: !!account, refetchInterval: 10_000 },
  });
  const walletBalance = Number(
    formatUnits((walletBalRaw as bigint | undefined) ?? 0n, tokenDecimals),
  );

  // ---- folded (unified) book for the selected outcome --------------------
  const folded = useMemo(() => {
    if (!book || !market) return { asks: [] as Level[], bids: [] as Level[] };
    const isBinary = market.outcomes.length === 2;
    const sel = book.outcomes.find((o) => o.outcomeIndex === selectedIdx);
    const toLevel = (l: BookLevel): Level => ({
      price: Number(l.price),
      shares: Number(l.shares),
    });
    const asks: Level[] = (sel?.asks ?? []).map(toLevel);
    const bids: Level[] = (sel?.bids ?? []).map(toLevel);
    if (isBinary) {
      const other = book.outcomes.find((o) => o.outcomeIndex !== selectedIdx);
      // A bid on the other outcome is an ask here at (1 - price); an ask on the
      // other outcome is a bid here at (1 - price).
      for (const l of other?.bids ?? []) {
        asks.push({ price: 1 - Number(l.price), shares: Number(l.shares) });
      }
      for (const l of other?.asks ?? []) {
        bids.push({ price: 1 - Number(l.price), shares: Number(l.shares) });
      }
    }
    // Merge equal price levels.
    const mergeLevels = (levels: Level[]) => {
      const m = new Map<string, number>();
      for (const l of levels) {
        const k = l.price.toFixed(6);
        m.set(k, (m.get(k) ?? 0) + l.shares);
      }
      return [...m.entries()].map(([p, s]) => ({ price: Number(p), shares: s }));
    };
    const a = mergeLevels(asks).sort((x, y) => x.price - y.price);
    const b = mergeLevels(bids).sort((x, y) => y.price - x.price);
    return { asks: a, bids: b };
  }, [book, market, selectedIdx]);

  const bestAsk = folded.asks[0]?.price ?? null;
  const bestBid = folded.bids[0]?.price ?? null;
  const mid =
    bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : bestAsk ?? bestBid;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;

  function outcomeBuyPrice(idx: number): number | null {
    if (!book || !market) return null;
    const isBinary = market.outcomes.length === 2;
    const sel = book.outcomes.find((o) => o.outcomeIndex === idx);
    let best = sel?.asks[0] ? Number(sel.asks[0].price) : null;
    if (isBinary) {
      const other = book.outcomes.find((o) => o.outcomeIndex !== idx);
      if (other?.bids[0]) {
        const p = 1 - Number(other.bids[0].price);
        best = best == null ? p : Math.min(best, p);
      }
    }
    return best;
  }

  async function authFetch(path: string, init: RequestInit) {
    const token = await getAccessToken();
    return jsonFetch(path, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  async function placeOrder(args: {
    side: Side;
    type: OrderType;
    price?: number;
    sharesStr: string;
  }) {
    if (!account || !market) return;
    const sharesNum = Number(args.sharesStr);
    if (!(sharesNum > 0)) {
      push({ title: "Enter a share amount", variant: "danger" });
      return;
    }
    if (args.type === "LIMIT" && !(args.price && args.price > 0 && args.price < 1)) {
      push({ title: "Price must be between 0¢ and 100¢", variant: "danger" });
      return;
    }
    setSubmitting(true);
    try {
      // Just-in-time funding: a BUY moves exactly its collateral (cost + fee)
      // from the wallet to the treasury now, then the order is placed. Unused
      // funds and all proceeds are auto-returned to the wallet by the engine.
      let fundingTxHash: string | undefined;
      if (args.side === "BUY") {
        const treasury = config.data?.treasury;
        if (!treasury) {
          push({
            title: "Trading unavailable",
            description: "Treasury not configured.",
            variant: "danger",
          });
          setSubmitting(false);
          return;
        }
        const qtyMicro = BigInt(Math.round(sharesNum * 1_000_000));
        // Market buys lock the worst case (~$1/share); leftover is refunded.
        const priceMicro =
          args.type === "LIMIT"
            ? BigInt(Math.round((args.price ?? 0) * 1_000_000))
            : 999_999n;
        const costMicro = (priceMicro * qtyMicro) / 1_000_000n;
        const feeMicro =
          market.feeBps > 0 ? (costMicro * BigInt(market.feeBps)) / 10_000n : 0n;
        const requiredMicro = costMicro + feeMicro;
        if (requiredMicro <= 0n) {
          push({ title: "Order too small", variant: "danger" });
          setSubmitting(false);
          return;
        }
        await ensurePolygon();
        const hash = await writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [treasury as Address, requiredMicro],
        });
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
        fundingTxHash = hash;
      }

      const res = (await authFetch(`/api/markets/${id}/orders`, {
        method: "POST",
        body: JSON.stringify({
          maker: account,
          side: args.side,
          outcomeIndex: selectedIdx,
          type: args.type,
          ...(args.type === "LIMIT" ? { price: args.price } : {}),
          shares: sharesNum,
          ...(fundingTxHash ? { fundingTxHash } : {}),
        }),
      })) as { filledQty: string; restId: string | null };
      const filled = microToNum(res.filledQty);
      push({
        title:
          filled > 0
            ? res.restId
              ? "Partially filled — rest resting"
              : "Order filled"
            : "Order posted",
        description:
          filled > 0
            ? `${filled.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares matched.`
            : "Your order is resting on the book.",
        variant: "success",
      });
      setShares("");
      query.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Order failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit() {
    void placeOrder({
      side,
      type: orderType,
      price: orderType === "LIMIT" ? Number(limitCents) / 100 : undefined,
      sharesStr: shares,
    });
  }

  function takeLevel(level: Level, takeSide: Side) {
    // Cross immediately at the level's price. Using a LIMIT (rather than a raw
    // market order) means a BUY funds exactly this price rather than reserving
    // the worst-case $1/share; it still crosses the resting liquidity here.
    void placeOrder({
      side: takeSide,
      type: "LIMIT",
      price: level.price,
      sharesStr: String(level.shares),
    });
  }

  if (query.isLoading) {
    return <div className="card h-48 animate-pulse bg-muted/30" />;
  }
  if (query.isError || !market) {
    return (
      <div className="card p-6 text-sm text-[hsl(var(--danger))]">
        Failed to load market.
      </div>
    );
  }

  const resolved = market.status === "Resolved";
  const outcomes = market.outcomes;
  const selected = outcomes.find((o) => o.index === selectedIdx) ?? outcomes[0];
  const viewer = data?.viewer;
  const collateralBal = microToNum(viewer?.collateral.balance);
  const collateralLocked = microToNum(viewer?.collateral.locked);
  const myShares = microToNum(viewer?.shares[selected.index]?.balance);

  const isMultiOutcome = outcomes.length > 2;
  // Complete sets held = the most sets you could redeem = min free shares across
  // every outcome (one share of each = one set). Only meaningful for >2 outcomes.
  let completeSetsHeld = Infinity;
  for (const o of outcomes) {
    completeSetsHeld = Math.min(
      completeSetsHeld,
      microToNum(viewer?.shares[o.index]?.balance),
    );
  }
  if (!Number.isFinite(completeSetsHeld)) completeSetsHeld = 0;

  const effectiveResolver = displayResolver(market);
  const isAdminAcct = !!account && isAdminAddress(account);
  const isSettlerAcct =
    !!account && account.toLowerCase() === effectiveResolver.toLowerCase();
  const canResolve =
    !resolved && market.status === "Open" && (isSettlerAcct || isAdminAcct);

  async function resolveMarket(winningOutcome: number) {
    if (!account) return;
    try {
      await authFetch(`/api/markets/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ address: account, winningOutcome }),
      });
      push({ title: "Market resolved", variant: "success" });
      query.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Resolve failed",
      });
      push({ title, description, variant: "danger" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6 space-y-3">
        <TypeTag kind="market" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <CoverEditor
            marketId={market.id}
            chainId={market.chainId}
            conditionId={market.conditionId}
            imageUrl={market.imageUrl}
            title={market.title}
            isCreator={
              !!account && account.toLowerCase() === market.creator.toLowerCase()
            }
            account={account}
            onDone={() => query.refetch()}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold md:text-3xl">{market.title}</h1>
            <CollapsibleBlurb text={market.description} maxLines={3} className="mt-2" />
          </div>
        </div>
        {market.status === "Pending" && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <b>Awaiting admin approval.</b> This market isn&apos;t open for trading
            until a verifier approves it.
          </div>
        )}
        {market.status === "Rejected" && (
          <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            This market was not approved by the admin.
          </div>
        )}
        {resolved && market.winningOutcome != null && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            Winning outcome: <b>{outcomes[market.winningOutcome]?.label}</b>
          </div>
        )}
        {!resolved && market.status === "Open" && verifiedProposal && (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
            Verified outcome:{" "}
            <b>
              {outcomes[verifiedProposal.proposedOutcome]?.label ??
                `Outcome ${verifiedProposal.proposedOutcome}`}
            </b>{" "}
            · awaiting settlement. An admin will approve the final payout.
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="order-2 space-y-6 lg:order-none lg:col-start-1 lg:row-start-1">
          <OrderBookPanel
            outcomes={outcomes}
            selectedIdx={selected.index}
            onSelectOutcome={setSelectedIdx}
            outcomeBuyPrice={outcomeBuyPrice}
            asks={folded.asks}
            bids={folded.bids}
            bestAsk={bestAsk}
            bestBid={bestBid}
            spread={spread}
            mid={mid}
            resolved={resolved}
            canTake={!resolved && !!account}
            selectedLabel={selected.label}
            unified={outcomes.length === 2}
            connected={live.connected}
            onTake={takeLevel}
            onPickLevel={(level, tone) => {
              setOrderType("LIMIT");
              setSide(tone === "ask" ? "BUY" : "SELL");
              setLimitCents((level.price * 100).toFixed(1));
              setShares(String(level.shares));
            }}
          />

          {live.trades.length > 0 && (
            <TradeTape trades={live.trades} outcomes={outcomes} />
          )}

          {account && (
            <MarketPortfolio marketId={market.id} account={account} onChanged={() => query.refetch()} />
          )}

          <RulesPanel terms={market.terms} description={market.description} />

          <Resolvers
            subjectType="market"
            subjectId={market.id}
            settler={market.settler}
            customSettler={market.customSettler}
            participants={[market.creator, market.settler]}
            requestEligible={market.status === "Open" && !market.customSettler}
          />

          {market.status === "Open" && (
            <ProposeResolutionButton
              subjectType="market"
              subjectId={market.id}
              outcomes={outcomes.map((o) => o.label)}
              participants={[
                market.creator,
                market.settler,
                ...(market.customSettler ? [market.customSettler] : []),
              ]}
            />
          )}

          {canResolve && (
            <section className="card p-5 space-y-3">
              <h3 className="font-semibold">Resolve market</h3>
              {isAdminAcct ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    As an admin you approve the final settlement. Winning shares
                    redeem to {sym} 1:1; the book is cleared and locks refunded.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {outcomes.map((o) => (
                      <Button
                        key={o.index}
                        size="sm"
                        variant={
                          verifiedProposal?.proposedOutcome === o.index
                            ? "success"
                            : "outline"
                        }
                        onClick={() => resolveMarket(o.index)}
                      >
                        {o.label} wins
                      </Button>
                    ))}
                  </div>
                </>
              ) : verifiedProposal ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    The outcome is verified. Settle to pay out — winning shares
                    redeem to {sym} 1:1; the book is cleared and locks refunded.
                  </p>
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => resolveMarket(verifiedProposal.proposedOutcome)}
                  >
                    Settle: {outcomes[verifiedProposal.proposedOutcome]?.label ?? "—"}{" "}
                    wins
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Propose the winning outcome below. An admin must verify it
                  before this market can be settled and paid out.
                </p>
              )}
            </section>
          )}

          <Comments basePath={`/api/markets/${market.id}/comments`} />
        </div>

        <aside className="order-1 space-y-4 lg:order-none lg:col-start-2 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
          {!account ? (
            <div className="card p-5 text-sm text-muted-foreground">
              Sign in to trade.
            </div>
          ) : (
            <>
              <TradingWallet
                account={account}
                sym={sym}
                walletBalance={walletBalance}
                locked={collateralLocked}
                pendingReturn={collateralBal}
                onChanged={() => query.refetch()}
                authFetch={authFetch}
              />

              <TradePanel
                outcomes={outcomes}
                selectedIdx={selected.index}
                onSelectOutcome={setSelectedIdx}
                outcomeBuyPrice={outcomeBuyPrice}
                side={side}
                setSide={setSide}
                orderType={orderType}
                setOrderType={setOrderType}
                limitCents={limitCents}
                setLimitCents={setLimitCents}
                shares={shares}
                setShares={setShares}
                sym={sym}
                bestAsk={bestAsk}
                bestBid={bestBid}
                myPosition={myShares}
                balance={walletBalance}
                resolved={resolved}
                tradeable={market.status === "Open"}
                submitting={submitting}
                onSubmit={onSubmit}
              />

              {isMultiOutcome && market.status === "Open" && (
                <CompleteSetPanel
                  account={account}
                  marketId={market.id}
                  sym={sym}
                  outcomes={outcomes}
                  treasury={config.data?.treasury ?? null}
                  tokenAddress={tokenAddress}
                  walletBalance={walletBalance}
                  completeSetsHeld={completeSetsHeld}
                  authFetch={authFetch}
                  ensurePolygon={ensurePolygon}
                  writeContract={writeContract}
                  publicClient={publicClient}
                  onChanged={() => query.refetch()}
                />
              )}

              <section className="card p-4 text-xs text-muted-foreground space-y-1">
                <div>
                  Settler: <span className="font-mono">{shortAddr(market.settler)}</span>{" "}
                  · fee {(market.feeBps / 100).toFixed(2)}%
                </div>
                <div>
                  No deposit needed — funds move from your wallet only when you
                  buy, and proceeds return automatically.
                </div>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trading wallet (wallet-centric: funds move per order, proceeds auto-return)
// ---------------------------------------------------------------------------

function TradingWallet({
  account,
  sym,
  walletBalance,
  locked,
  pendingReturn,
  onChanged,
  authFetch,
}: {
  account: string;
  sym: string;
  walletBalance: number;
  locked: number;
  /** Free custodial balance awaiting the auto-sweep back to the wallet. */
  pendingReturn: number;
  onChanged: () => void;
  authFetch: (path: string, init: RequestInit) => Promise<unknown>;
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  async function returnNow() {
    if (!(pendingReturn > 0)) return;
    setBusy(true);
    try {
      await authFetch(`/api/users/${account}/withdraw`, {
        method: "POST",
        body: JSON.stringify({ amount: pendingReturn }),
      });
      push({
        title: "Returning to wallet",
        description: `${sym} is being sent back to your wallet.`,
        variant: "success",
      });
      onChanged();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Return failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Buying power</h3>
        <span className="inline-flex items-center gap-1 font-mono text-sm">
          {money(walletBalance)} <TokenSymbol symbol={sym} size={13} />
        </span>
      </div>
      {locked > 0 && (
        <div className="text-xs text-muted-foreground">
          {money(locked)} {sym} committed to your open orders
        </div>
      )}
      {pendingReturn > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
          <span className="text-muted-foreground">
            {money(pendingReturn)} {sym} returning to your wallet
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void returnNow()}>
            {busy ? "…" : "Return now"}
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Your {sym} stays in your wallet. Buying an order moves only that order&apos;s
        cost to the treasury; cancels, sales, and winnings come straight back.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Complete sets (liquidity primitive for multi-outcome markets)
// ---------------------------------------------------------------------------

function CompleteSetPanel({
  account,
  marketId,
  sym,
  outcomes,
  treasury,
  tokenAddress,
  walletBalance,
  completeSetsHeld,
  authFetch,
  ensurePolygon,
  writeContract,
  publicClient,
  onChanged,
}: {
  account: string;
  marketId: number;
  sym: string;
  outcomes: { index: number; label: string }[];
  treasury: string | null;
  tokenAddress: Address;
  walletBalance: number;
  completeSetsHeld: number;
  authFetch: (path: string, init: RequestInit) => Promise<unknown>;
  ensurePolygon: () => Promise<unknown>;
  writeContract: (args: {
    address: Address;
    abi: typeof ERC20_ABI;
    functionName: string;
    args: unknown[];
  }) => Promise<`0x${string}`>;
  publicClient: ReturnType<typeof usePublicClient>;
  onChanged: () => void;
}) {
  const { push } = useToast();
  const [mintQty, setMintQty] = useState("");
  const [redeemQty, setRedeemQty] = useState("");
  const [busy, setBusy] = useState<"mint" | "redeem" | null>(null);

  const mintSets = Number(mintQty) || 0;
  const mintCost = mintSets; // $1 per complete set
  const tooPoor = mintCost > walletBalance && mintCost > 0;

  async function mint() {
    if (!(mintSets > 0)) {
      push({ title: "Enter how many sets to mint", variant: "danger" });
      return;
    }
    if (!treasury) {
      push({ title: "Trading unavailable", description: "Treasury not configured.", variant: "danger" });
      return;
    }
    setBusy("mint");
    try {
      const micro = BigInt(Math.round(mintSets * 1_000_000));
      await ensurePolygon();
      const hash = await writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [treasury as Address, micro],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      await authFetch(`/api/markets/${marketId}/sets`, {
        method: "POST",
        body: JSON.stringify({
          owner: account,
          action: "split",
          shares: mintSets,
          fundingTxHash: hash,
        }),
      });
      push({
        title: "Sets minted",
        description: `You received ${mintSets} share of every outcome. Sell the ones you don't want to add liquidity.`,
        variant: "success",
      });
      setMintQty("");
      onChanged();
    } catch (err) {
      const { title, description } = formatCryptoError(err, { fallbackTitle: "Mint failed" });
      push({ title, description, variant: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function redeem() {
    const sets = Number(redeemQty) || 0;
    if (!(sets > 0)) {
      push({ title: "Enter how many sets to redeem", variant: "danger" });
      return;
    }
    if (sets > completeSetsHeld + 1e-9) {
      push({
        title: "Not enough complete sets",
        description: `You can redeem up to ${completeSetsHeld.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`,
        variant: "danger",
      });
      return;
    }
    setBusy("redeem");
    try {
      await authFetch(`/api/markets/${marketId}/sets`, {
        method: "POST",
        body: JSON.stringify({ owner: account, action: "merge", shares: sets }),
      });
      push({
        title: "Sets redeemed",
        description: `${money(sets)} ${sym} is returning to your wallet.`,
        variant: "success",
      });
      setRedeemQty("");
      onChanged();
    } catch (err) {
      const { title, description } = formatCryptoError(err, { fallbackTitle: "Redeem failed" });
      push({ title, description, variant: "danger" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-5 space-y-3">
      <h3 className="font-semibold">Provide liquidity</h3>
      <p className="text-[11px] text-muted-foreground">
        A complete set is 1 share of all {outcomes.length} outcomes and always
        redeems for $1. Mint sets, then sell the ones you don&apos;t believe in —
        that&apos;s how a multi-outcome book gets asks to trade against.
      </p>

      <div className="space-y-2">
        <label className="label block">Mint sets</label>
        <input
          className="input font-mono"
          inputMode="decimal"
          placeholder="0"
          value={mintQty}
          onChange={(e) => setMintQty(e.target.value)}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Cost</span>
          <span className="inline-flex items-center gap-1 font-mono text-foreground">
            {money(mintCost)} <TokenIcon symbol={sym} size={12} />
          </span>
        </div>
        <Button
          className="w-full"
          size="sm"
          disabled={busy !== null || mintSets <= 0 || tooPoor}
          onClick={() => void mint()}
          title={tooPoor ? `Need ${money(mintCost)} ${sym}` : undefined}
        >
          {busy === "mint"
            ? "Minting…"
            : tooPoor
              ? `Need ${money(mintCost)} ${sym}`
              : `Mint ${mintSets > 0 ? mintSets : ""} set${mintSets === 1 ? "" : "s"}`}
        </Button>
      </div>

      {completeSetsHeld > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <label className="label">Redeem sets</label>
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() =>
                setRedeemQty(
                  String(Math.floor(completeSetsHeld * 100) / 100),
                )
              }
            >
              Max {completeSetsHeld.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </button>
          </div>
          <input
            className="input font-mono"
            inputMode="decimal"
            placeholder="0"
            value={redeemQty}
            onChange={(e) => setRedeemQty(e.target.value)}
          />
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            disabled={busy !== null || !(Number(redeemQty) > 0)}
            onClick={() => void redeem()}
          >
            {busy === "redeem" ? "Redeeming…" : "Redeem to wallet"}
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Order book
// ---------------------------------------------------------------------------

function OrderBookPanel({
  outcomes,
  selectedIdx,
  onSelectOutcome,
  outcomeBuyPrice,
  asks,
  bids,
  bestAsk,
  bestBid,
  spread,
  mid,
  resolved,
  canTake,
  selectedLabel,
  unified,
  connected,
  onTake,
  onPickLevel,
}: {
  outcomes: { index: number; label: string }[];
  selectedIdx: number;
  onSelectOutcome: (idx: number) => void;
  outcomeBuyPrice: (idx: number) => number | null;
  asks: Level[];
  bids: Level[];
  bestAsk: number | null;
  bestBid: number | null;
  spread: number | null;
  mid: number | null;
  resolved: boolean;
  canTake: boolean;
  selectedLabel: string;
  unified: boolean;
  connected: boolean;
  onTake: (level: Level, side: Side) => void;
  onPickLevel: (level: Level, tone: "ask" | "bid") => void;
}) {
  const topAsks = asks.slice(0, 8);
  const topBids = bids.slice(0, 8);
  const askView = [...topAsks].reverse();

  function cumulative(levels: Level[]): number[] {
    let sum = 0;
    return levels.map((l) => {
      sum += l.shares * l.price;
      return sum;
    });
  }
  const bidTotals = cumulative(topBids);
  const askTotals = [...cumulative(topAsks)].reverse();

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">
          Order book <span className="text-muted-foreground">· {selectedLabel}</span>
        </h3>
        <div className="flex items-center gap-2">
          {unified && <span className="badge badge-accent">Unified</span>}
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-success" : "bg-muted-foreground/40"}`}
            title={connected ? "Live" : "Polling"}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {outcomes.map((o) => {
          const active = o.index === selectedIdx;
          const p = outcomeBuyPrice(o.index);
          return (
            <button
              key={o.index}
              onClick={() => onSelectOutcome(o.index)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              Trade {o.label}
              {p != null && <span className="ml-1.5 opacity-80">{cents(p)}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Total</span>
      </div>

      <div className="mb-1 px-2 text-[11px] font-medium text-[hsl(var(--danger))]">
        Asks · buy {selectedLabel} here
      </div>
      <div className="space-y-px">
        {askView.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No asks.</div>
        )}
        {askView.map((l, i) => (
          <BookRow
            key={`ask-${l.price}-${i}`}
            level={l}
            total={askTotals[i]}
            tone="ask"
            canTake={canTake}
            onTake={onTake}
            onPickLevel={onPickLevel}
          />
        ))}
      </div>

      <div className="my-1.5 flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 text-xs">
        <span className="text-muted-foreground">
          Mid <span className="font-mono text-foreground">{cents(mid)}</span>
        </span>
        <span className="text-muted-foreground">
          Spread <span className="font-mono text-foreground">{cents(spread)}</span>
        </span>
      </div>

      <div className="mb-1 px-2 text-[11px] font-medium text-[hsl(var(--success))]">
        Bids · sell {selectedLabel} here
      </div>
      <div className="space-y-px">
        {topBids.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No bids.</div>
        )}
        {topBids.map((l, i) => (
          <BookRow
            key={`bid-${l.price}-${i}`}
            level={l}
            total={bidTotals[i]}
            tone="bid"
            canTake={canTake}
            onTake={onTake}
            onPickLevel={onPickLevel}
          />
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Tap any row to load its price &amp; size into the ticket.
      </p>
    </section>
  );
}

function BookRow({
  level,
  total,
  tone,
  canTake,
  onTake,
  onPickLevel,
}: {
  level: Level;
  total: number;
  tone: "ask" | "bid";
  canTake: boolean;
  onTake: (level: Level, side: Side) => void;
  onPickLevel: (level: Level, tone: "ask" | "bid") => void;
}) {
  const isAsk = tone === "ask";
  const tint = isAsk ? "hsl(var(--danger))" : "hsl(var(--success))";
  return (
    <button
      type="button"
      onClick={() => onPickLevel(level, tone)}
      className="group relative grid w-full grid-cols-[1fr_1fr_1fr] items-center gap-2 rounded-md px-2 py-1 text-xs hover:ring-1 hover:ring-border"
      style={{
        background: `linear-gradient(to left, ${tint}0F ${Math.min(100, total)}%, transparent 0)`,
      }}
    >
      <span className="text-left font-mono font-medium" style={{ color: tint }}>
        {cents(level.price)}
      </span>
      <span className="text-right font-mono text-foreground">
        {level.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </span>
      <span className="flex items-center justify-end gap-2">
        <span className="font-mono text-muted-foreground">{money(total)}</span>
        {canTake && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onTake(level, isAsk ? "BUY" : "SELL");
            }}
            className={`hidden rounded px-2 py-0.5 font-medium text-white group-hover:inline-block ${
              isAsk ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--danger))]"
            }`}
          >
            {isAsk ? "Buy" : "Sell"}
          </span>
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Trade tape
// ---------------------------------------------------------------------------

function TradeTape({
  trades,
  outcomes,
}: {
  trades: { outcomeIndex: number; side: Side; price: string; shares: string; ts: number }[];
  outcomes: { index: number; label: string }[];
}) {
  return (
    <section className="card p-5">
      <h3 className="mb-3 font-semibold">Recent trades</h3>
      <div className="space-y-1">
        {trades.slice(0, 12).map((t, i) => {
          const label = outcomes.find((o) => o.index === t.outcomeIndex)?.label ?? "";
          return (
            <div key={`${t.ts}-${i}`} className="flex items-center gap-3 text-xs">
              <span
                className={`rounded px-1.5 py-0.5 font-semibold ${
                  t.side === "BUY" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                }`}
              >
                {t.side}
              </span>
              <span className="flex-1 truncate">
                {Number(formatMicro(BigInt(t.shares))).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                {label}
              </span>
              <span className="font-mono text-muted-foreground">
                {cents(Number(formatMicro(BigInt(t.price))))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function RulesPanel({ terms, description }: { terms: string; description: string }) {
  const [tab, setTab] = useState<"rules" | "context">("rules");
  return (
    <section className="card p-5">
      <div className="mb-3 flex gap-4 border-b border-border text-sm">
        {(["rules", "context"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2 font-medium capitalize transition-colors ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "rules" ? "Rules" : "Market context"}
          </button>
        ))}
      </div>
      <CollapsibleBlurb
        text={tab === "rules" ? terms : description}
        maxLines={4}
        className="text-foreground/90"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trade panel
// ---------------------------------------------------------------------------

function TradePanel(props: {
  outcomes: { index: number; label: string }[];
  selectedIdx: number;
  onSelectOutcome: (idx: number) => void;
  outcomeBuyPrice: (idx: number) => number | null;
  side: Side;
  setSide: (s: Side) => void;
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  limitCents: string;
  setLimitCents: (v: string) => void;
  shares: string;
  setShares: (v: string) => void;
  sym: string;
  bestAsk: number | null;
  bestBid: number | null;
  myPosition: number;
  balance: number;
  resolved: boolean;
  tradeable: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const {
    outcomes,
    selectedIdx,
    onSelectOutcome,
    outcomeBuyPrice,
    side,
    setSide,
    orderType,
    setOrderType,
    limitCents,
    setLimitCents,
    shares,
    setShares,
    sym,
    bestAsk,
    bestBid,
    myPosition,
    balance,
    resolved,
    tradeable,
    submitting,
    onSubmit,
  } = props;

  const sharesNum = Number(shares) || 0;
  const priceForCalc =
    orderType === "LIMIT"
      ? Number(limitCents) / 100
      : side === "BUY"
        ? bestAsk ?? 0
        : bestBid ?? 0;
  const total = sharesNum * priceForCalc;
  const toWin = sharesNum;
  const selectedLabel = outcomes.find((o) => o.index === selectedIdx)?.label ?? "";

  function bump(delta: number) {
    const next = Math.max(0, Math.round((sharesNum + delta) * 100) / 100);
    setShares(next ? String(next) : "");
  }

  const insufficient =
    side === "BUY" && total > balance && total > 0
      ? `Need ${money(total)} ${sym} — you have ${money(balance)}`
      : null;
  const insufficientShares =
    side === "SELL" && sharesNum > myPosition && sharesNum > 0
      ? `You only hold ${myPosition.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares`
      : null;
  const blocked = insufficient ?? insufficientShares;

  return (
    <section className="card p-5 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {outcomes.slice(0, 2).map((o) => {
          const active = o.index === selectedIdx;
          const p = outcomeBuyPrice(o.index);
          return (
            <button
              key={o.index}
              onClick={() => onSelectOutcome(o.index)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                active ? "border-primary bg-primary/10" : "border-border hover:border-foreground/30"
              }`}
            >
              <div className="text-sm font-semibold">{o.label}</div>
              <div className="text-xs text-muted-foreground">{cents(p)}</div>
            </button>
          );
        })}
      </div>
      {outcomes.length > 2 && (
        <select
          className="select"
          value={selectedIdx}
          onChange={(e) => onSelectOutcome(Number(e.target.value))}
        >
          {outcomes.map((o) => (
            <option key={o.index} value={o.index}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-lg bg-muted/50 p-0.5">
          <button
            onClick={() => setSide("BUY")}
            className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
              side === "BUY" ? "bg-success text-white" : "text-muted-foreground"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setSide("SELL")}
            className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
              side === "SELL" ? "bg-[hsl(var(--danger))] text-white" : "text-muted-foreground"
            }`}
          >
            Sell
          </button>
        </div>
      </div>

      <div>
        <label className="label mb-1 block">Order type</label>
        <select
          className="select"
          value={orderType}
          onChange={(e) => setOrderType(e.target.value as OrderType)}
        >
          <option value="LIMIT">Limit</option>
          <option value="MARKET">Market</option>
        </select>
      </div>

      {orderType === "LIMIT" && (
        <div>
          <label className="label mb-1 block">Limit price</label>
          <div className="relative">
            <input
              className="input pr-8 font-mono"
              inputMode="decimal"
              placeholder="0.0"
              value={limitCents}
              onChange={(e) => setLimitCents(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              ¢
            </span>
          </div>
        </div>
      )}

      <div>
        <label className="label mb-1 block">Shares</label>
        <input
          className="input font-mono"
          inputMode="decimal"
          placeholder="0"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
        />
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {[-100, -10, 10, 100].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => bump(d)}
              className="rounded-lg border border-border py-1 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3 text-sm">
        <Row label="Your position">
          <span className="font-mono">
            {myPosition.toLocaleString(undefined, { maximumFractionDigits: 2 })} sh
          </span>
        </Row>
        <Row label={side === "BUY" ? "Total cost" : "You receive"}>
          <span className="inline-flex items-center gap-1 font-mono text-primary">
            {money(total)}
            <TokenIcon symbol={sym} size={12} />
          </span>
        </Row>
        {side === "BUY" && (
          <Row label="To win">
            <span className="inline-flex items-center gap-1 font-mono text-success">
              {money(toWin)}
              <TokenIcon symbol={sym} size={12} />
            </span>
          </Row>
        )}
      </div>

      {blocked ? (
        <Button className="w-full" variant="secondary" disabled title={blocked}>
          {blocked}
        </Button>
      ) : (
        <Button
          className="w-full"
          variant={side === "BUY" ? "success" : "danger"}
          disabled={submitting || resolved || !tradeable}
          onClick={() => void onSubmit()}
        >
          {submitting
            ? "Working…"
            : `${side === "BUY" ? "Buy" : "Sell"} ${selectedLabel}${
                orderType === "MARKET" ? " at market" : ""
              }`}
        </Button>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        {orderType === "LIMIT"
          ? "Limit orders cross marketable liquidity, then rest on the book."
          : "Market orders take the best resting liquidity instantly."}
      </p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cover image (creator can set/replace)
// ---------------------------------------------------------------------------

function CoverEditor({
  marketId,
  chainId,
  conditionId,
  imageUrl,
  title,
  isCreator,
  account,
  onDone,
}: {
  marketId: number;
  chainId: number;
  conditionId: string;
  imageUrl: string | null;
  title: string;
  isCreator: boolean;
  account?: string;
  onDone: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const { push } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!isCreator) {
    return <BetThumbnail imageUrl={imageUrl} title={title} size="lg" fallback />;
  }

  async function upload(file: File) {
    if (!account) return;
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("address", account);
      fd.append("chainId", String(chainId));
      fd.append("conditionId", conditionId);
      const uploadRes = await fetch("/api/upload/market-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!uploadRes.ok) {
        const j = (await uploadRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || "upload failed");
      }
      const { url } = (await uploadRes.json()) as { url: string };
      await jsonFetch(`/api/markets/${marketId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creator: account, imageUrl: url }),
      });
      push({ title: "Cover updated", variant: "success" });
      onDone();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Cover update failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group/cover relative shrink-0">
      <BetThumbnail imageUrl={imageUrl} title={title} size="lg" fallback />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg bg-black/55 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/cover:opacity-100 disabled:opacity-100"
      >
        <ImagePlus className="h-4 w-4" />
        {busy ? "Uploading…" : imageUrl ? "Change" : "Add cover"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </div>
  );
}
