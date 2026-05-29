"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { Check, ImagePlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import {
  formatUnits,
  maxUint256,
  parseUnits,
  type Address,
} from "viem";
import {
  useAccount,
  useReadContracts,
  useSignTypedData,
  useWriteContract,
} from "wagmi";
import { polygon } from "wagmi/chains";

import { BetThumbnail } from "@/components/BetThumbnail";
import { Comments } from "@/components/Comments";
import { Button } from "@/components/ui/button";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { TypeTag } from "@/components/ui/TypeTag";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { useToast } from "@/components/ui/Toast";
import {
  CONDITIONAL_TOKENS_ABI,
  ERC20_ABI,
  EXCHANGE_ABI,
} from "@/lib/abi";
import { exchangeDomain, ORDER_EIP712_TYPES, randomSalt } from "@/lib/clob";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { jsonFetch } from "@/lib/fetcher";
import { shortAddr } from "@/lib/utils";
import type { MarketDetailResponse, OrderRow } from "@/lib/types";

type Side = "BUY" | "SELL";
type OrderType = "limit" | "market" | "mint" | "redeem";

/** Cents string for a 0–1 probability price, e.g. 0.154 -> "15.4¢". */
function cents(price: number): string {
  if (!Number.isFinite(price)) return "—";
  return `${(price * 100).toFixed(1)}¢`;
}

function money(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

/** Taker-fillable shares remaining on a resting order (raw token units). */
function sharesRemainingRaw(o: OrderRow): bigint {
  const remainingTaker = BigInt(o.takerAmount) - BigInt(o.filled);
  if (remainingTaker <= 0n) return 0n;
  const makerAmount = BigInt(o.makerAmount);
  const takerAmount = BigInt(o.takerAmount);
  return o.side === "SELL"
    ? (remainingTaker * makerAmount) / (takerAmount || 1n)
    : remainingTaker;
}

export function MarketDetail({ id }: { id: number }) {
  const { address: account } = useAccount();
  const { push } = useToast();
  const searchParams = useSearchParams();

  const viewerQ = account ? `?viewer=${account}` : "";
  const query = useQuery<MarketDetailResponse>({
    queryKey: ["market", id, account],
    queryFn: () => jsonFetch(`/api/markets/${id}${viewerQ}`),
    refetchInterval: 12_000,
  });

  const data = query.data;
  const market = data?.market;

  // Write hooks (declared before any early return to keep hook order stable).
  const approveTx = useWriteContract();
  const ctfApproveTx = useWriteContract();
  const setApprovalTx = useWriteContract();
  const splitTx = useWriteContract();
  const mergeTx = useWriteContract();
  const redeemTx = useWriteContract();
  const fillTx = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const ensurePolygon = useEnsurePolygon();

  // On-chain approval state for the checklist.
  const tokenAddr = market?.token as Address | undefined;
  const ctfAddr = market?.ctfAddress as Address | undefined;
  const exchangeAddr = market?.exchangeAddress as Address | undefined;
  const approvalsEnabled =
    !!account && !!tokenAddr && !!ctfAddr && !!exchangeAddr;

  const approvalReads = useReadContracts({
    allowFailure: true,
    contracts: approvalsEnabled
      ? [
          {
            address: tokenAddr!,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [account as Address, exchangeAddr!],
            chainId: polygon.id,
          },
          {
            address: tokenAddr!,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [account as Address, ctfAddr!],
            chainId: polygon.id,
          },
          {
            address: ctfAddr!,
            abi: CONDITIONAL_TOKENS_ABI,
            functionName: "isApprovedForAll",
            args: [account as Address, exchangeAddr!],
            chainId: polygon.id,
          },
        ]
      : [],
    query: { enabled: approvalsEnabled, refetchInterval: 15_000 },
  });

  const exchangeAllowance = (approvalReads.data?.[0]?.result as bigint) ?? 0n;
  const ctfAllowance = (approvalReads.data?.[1]?.result as bigint) ?? 0n;
  const collateralApproved = exchangeAllowance > 0n && ctfAllowance > 0n;
  const sharesApproved = (approvalReads.data?.[2]?.result as boolean) ?? false;

  // Trade panel state (seeded from ?o= / ?side= deep links on the cards).
  const [selectedIdx, setSelectedIdx] = useState(() => {
    const o = Number(searchParams.get("o"));
    return Number.isInteger(o) && o >= 0 ? o : 0;
  });
  const [side, setSide] = useState<Side>(
    searchParams.get("side") === "SELL" ? "SELL" : "BUY",
  );
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [limitCents, setLimitCents] = useState("");
  const [shares, setShares] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const decimals = market?.decimals ?? 6;
  const sym = market?.tokenSymbol || "USDC";
  const positions = data?.positions ?? {};

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

  const ctf = market.ctfAddress as Address;
  const exchange = market.exchangeAddress as Address;
  const token = market.token as Address;
  const conditionId = market.conditionId as `0x${string}`;
  const resolved = market.status === "Resolved";
  const outcomes = market.outcomes;
  const selected = outcomes[selectedIdx] ?? outcomes[0];
  const book = data?.orderBook?.[selected.index] ?? { buys: [], sells: [] };

  // Best prices for the selected outcome (API pre-sorts: buys high→low, sells low→high).
  const bestAsk = book.sells[0] ? Number(book.sells[0].price) : null;
  const bestBid = book.buys[0] ? Number(book.buys[0].price) : null;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const mid =
    bestAsk != null && bestBid != null
      ? (bestAsk + bestBid) / 2
      : (bestAsk ?? bestBid);

  // Best ask per outcome (cost to buy) for the outcome selector chips.
  function outcomeBuyPrice(idx: number): number | null {
    const b = data?.orderBook?.[idx];
    return b?.sells[0] ? Number(b.sells[0].price) : null;
  }

  // ---- on-chain actions -------------------------------------------------

  async function approveCollateral() {
    try {
      await ensurePolygon();
      await approveTx.writeContractAsync({
        chainId: polygon.id,
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [exchange, maxUint256],
      });
      await ctfApproveTx.writeContractAsync({
        chainId: polygon.id,
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ctf, maxUint256],
      });
      push({ title: `${sym} approved`, variant: "success" });
      approvalReads.refetch();
    } catch (err) {
      push({
        title: "Approval failed",
        description: (err as Error).message,
        variant: "danger",
      });
    }
  }

  async function approveShares() {
    try {
      await ensurePolygon();
      await setApprovalTx.writeContractAsync({
        chainId: polygon.id,
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "setApprovalForAll",
        args: [exchange, true],
      });
      push({ title: "Shares approved for trading", variant: "success" });
      approvalReads.refetch();
    } catch (err) {
      push({
        title: "Approval failed",
        description: (err as Error).message,
        variant: "danger",
      });
    }
  }

  async function doSplit(amountStr: string) {
    try {
      const amt = parseUnits(amountStr || "0", decimals);
      if (amt <= 0n) return;
      await ensurePolygon();
      await splitTx.writeContractAsync({
        chainId: polygon.id,
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "splitPosition",
        args: [conditionId, amt],
      });
      push({
        title: "Minted a full set",
        description: `You now hold ${amountStr} of every outcome.`,
        variant: "success",
      });
      setShares("");
      query.refetch();
    } catch (err) {
      push({
        title: "Mint failed",
        description: (err as Error).message,
        variant: "danger",
      });
    }
  }

  async function doMerge(amountStr: string) {
    try {
      const amt = parseUnits(amountStr || "0", decimals);
      if (amt <= 0n) return;
      await ensurePolygon();
      await mergeTx.writeContractAsync({
        chainId: polygon.id,
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "mergePositions",
        args: [conditionId, amt],
      });
      push({ title: `Merged a full set back into ${sym}`, variant: "success" });
      setShares("");
      query.refetch();
    } catch (err) {
      push({
        title: "Merge failed",
        description: (err as Error).message,
        variant: "danger",
      });
    }
  }

  async function doRedeem() {
    try {
      await ensurePolygon();
      await redeemTx.writeContractAsync({
        chainId: polygon.id,
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "redeemPositions",
        args: [conditionId],
      });
      push({ title: "Redeemed winning shares", variant: "success" });
      query.refetch();
    } catch (err) {
      push({
        title: "Redeem failed",
        description: (err as Error).message,
        variant: "danger",
      });
    }
  }

  /** Fill `takerFill` (taker-side raw units) against one resting order. */
  async function fillOrderRaw(order: OrderRow, takerFill: bigint) {
    const makerAmount = BigInt(order.makerAmount);
    const takerAmount = BigInt(order.takerAmount);
    if (takerFill <= 0n) return;
    const makerGives = (takerFill * makerAmount) / (takerAmount || 1n);
    const isSellOrder = order.side === "SELL";
    const sharesMoved = isSellOrder ? makerGives : takerFill;
    const cost = isSellOrder ? takerFill : makerGives;

    await fillTx.writeContractAsync({
      chainId: polygon.id,
      address: exchange,
      abi: EXCHANGE_ABI,
      functionName: "fillOrder",
      args: [
        {
          salt: BigInt(order.salt),
          maker: order.maker as Address,
          tokenId: BigInt(order.positionId),
          makerAmount,
          takerAmount,
          expiration: BigInt(order.expiry),
          side: order.side === "BUY" ? 0 : 1,
        },
        order.signature as `0x${string}`,
        takerFill,
      ],
    });

    await jsonFetch(`/api/markets/${id}/fills`, {
      method: "POST",
      body: JSON.stringify({
        orderHash: order.hash,
        taker: account,
        shares: sharesMoved.toString(),
        cost: cost.toString(),
        takerFillAmount: takerFill.toString(),
        txHash: fillTx.data,
      }),
    });
  }

  /** Fill a single resting order completely (used by the book "take" buttons). */
  async function takeOrder(order: OrderRow) {
    if (!account) return;
    try {
      const remainingTaker = BigInt(order.takerAmount) - BigInt(order.filled);
      if (remainingTaker <= 0n) return;
      await ensurePolygon();
      await fillOrderRaw(order, remainingTaker);
      push({ title: "Order filled", variant: "success" });
      query.refetch();
    } catch (err) {
      push({
        title: "Fill failed",
        description: (err as Error).message,
        variant: "danger",
      });
    }
  }

  /** Sweep the book to fill a market order for ~`sharesStr` shares. */
  async function marketSweep(takeSide: Side, sharesStr: string) {
    if (!account) return;
    const targetShares = parseUnits(sharesStr || "0", decimals);
    if (targetShares <= 0n) {
      push({ title: "Enter a share amount", variant: "danger" });
      return;
    }
    // BUY consumes asks (sells); SELL consumes bids (buys).
    const resting = (takeSide === "BUY" ? book.sells : book.buys).filter(
      (o) => o.maker.toLowerCase() !== account.toLowerCase(),
    );
    if (resting.length === 0) {
      push({
        title: "No liquidity to take",
        description: "Post a limit order instead.",
        variant: "danger",
      });
      return;
    }

    let remainingShares = targetShares;
    let fills = 0;
    try {
      await ensurePolygon();
      for (const order of resting) {
        if (remainingShares <= 0n || fills >= 12) break;
        const availShares = sharesRemainingRaw(order);
        if (availShares <= 0n) continue;

        const remainingTaker = BigInt(order.takerAmount) - BigInt(order.filled);

        let takerFill: bigint;
        if (remainingShares >= availShares) {
          takerFill = remainingTaker; // take the whole resting order
        } else if (order.side === "SELL") {
          // taker pays collateral; collateral for wanted shares = remainingTaker * want/avail
          takerFill = (remainingTaker * remainingShares) / availShares;
        } else {
          // BUY order: taker provides shares directly
          takerFill = remainingShares;
        }
        if (takerFill <= 0n) continue;

        await fillOrderRaw(order, takerFill);
        const sharesTaken =
          remainingShares >= availShares ? availShares : remainingShares;
        remainingShares -= sharesTaken;
        fills += 1;
      }
      push({
        title: takeSide === "BUY" ? "Bought shares" : "Sold shares",
        description: `${fills} order${fills === 1 ? "" : "s"} filled.`,
        variant: "success",
      });
      setShares("");
      query.refetch();
    } catch (err) {
      push({
        title: "Market order failed",
        description: (err as Error).message,
        variant: "danger",
      });
      query.refetch();
    }
  }

  /** Post a signed limit order to the book. */
  async function placeLimit(args: {
    outcomeIndex: number;
    positionId: string;
    side: Side;
    price: number; // 0–1
    sharesStr: string;
  }) {
    if (!account) return;
    if (!(args.price > 0) || args.price >= 1) {
      push({ title: "Price must be between 0¢ and 100¢", variant: "danger" });
      return;
    }
    const sharesRaw = parseUnits(args.sharesStr || "0", decimals);
    if (sharesRaw <= 0n) {
      push({ title: "Enter a share amount", variant: "danger" });
      return;
    }
    const collateralRaw = BigInt(Math.round(Number(sharesRaw) * args.price));
    if (collateralRaw <= 0n) return;

    const sideNum = args.side === "BUY" ? 0 : 1;
    const makerAmount = args.side === "BUY" ? collateralRaw : sharesRaw;
    const takerAmount = args.side === "BUY" ? sharesRaw : collateralRaw;
    const salt = randomSalt();
    const expiration = 0n;

    const message = {
      salt,
      maker: account as Address,
      tokenId: BigInt(args.positionId),
      makerAmount,
      takerAmount,
      expiration,
      side: sideNum,
    };

    const signature = await signTypedDataAsync({
      domain: exchangeDomain(market!.chainId, exchange),
      types: ORDER_EIP712_TYPES,
      primaryType: "Order",
      message,
    } as Parameters<typeof signTypedDataAsync>[0]);

    await jsonFetch(`/api/markets/${id}/orders`, {
      method: "POST",
      body: JSON.stringify({
        outcomeIndex: args.outcomeIndex,
        side: args.side,
        salt: salt.toString(),
        maker: account,
        tokenId: args.positionId,
        makerAmount: makerAmount.toString(),
        takerAmount: takerAmount.toString(),
        expiration: expiration.toString(),
        signature,
      }),
    });

    push({
      title: "Order posted",
      description: "Your signed order is resting on the book.",
      variant: "success",
    });
    setShares("");
    query.refetch();
  }

  // ---- submit dispatcher -------------------------------------------------

  async function onSubmit() {
    if (!account) return;
    setSubmitting(true);
    try {
      if (orderType === "mint") {
        await doSplit(shares);
      } else if (orderType === "redeem") {
        await doMerge(shares);
      } else if (orderType === "market") {
        await marketSweep(side, shares);
      } else {
        await placeLimit({
          outcomeIndex: selected.index,
          positionId: selected.positionId,
          side,
          price: Number(limitCents) / 100,
          sharesStr: shares,
        });
      }
    } catch (err) {
      push({
        title: "Action failed",
        description: (err as Error).message,
        variant: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6 space-y-3">
        <TypeTag kind="market" />
        <div className="flex flex-col gap-4 sm:flex-row">
          <CoverEditor
            marketId={market.id}
            chainId={market.chainId}
            conditionId={market.conditionId}
            imageUrl={market.imageUrl}
            title={market.title}
            isCreator={
              !!account &&
              account.toLowerCase() === market.creator.toLowerCase()
            }
            account={account}
            onDone={() => query.refetch()}
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold md:text-3xl">
              {market.title}
            </h1>
            <p className="mt-1 text-muted-foreground">{market.description}</p>
          </div>
        </div>
        {resolved && market.winningOutcome != null && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            Winning outcome:{" "}
            <b>{market.outcomes[market.winningOutcome]?.label}</b>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column: order book, rules, comments */}
        <div className="space-y-6">
          <OrderBookPanel
            outcomes={outcomes}
            selectedIdx={selected.index}
            onSelectOutcome={setSelectedIdx}
            outcomeBuyPrice={outcomeBuyPrice}
            buys={book.buys}
            sells={book.sells}
            decimals={decimals}
            bestAsk={bestAsk}
            bestBid={bestBid}
            spread={spread}
            mid={mid}
            account={account}
            resolved={resolved}
            onTake={takeOrder}
            onPickPrice={(p) => {
              setOrderType("limit");
              setLimitCents((p * 100).toFixed(1));
            }}
          />

          <RulesPanel terms={market.terms} description={market.description} />

          <Comments basePath={`/api/markets/${market.id}/comments`} />
        </div>

        {/* Right column: trade panel */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {!account ? (
            <div className="card p-5 text-sm text-muted-foreground">
              Sign in to trade, mint, or redeem shares.
            </div>
          ) : (
            <>
              <LowGasBanner />

              <ApprovalsChecklist
                sym={sym}
                collateralApproved={collateralApproved}
                sharesApproved={sharesApproved}
                loading={approvalReads.isLoading}
                onApproveCollateral={approveCollateral}
                onApproveShares={approveShares}
                collateralPending={approveTx.isPending || ctfApproveTx.isPending}
                sharesPending={setApprovalTx.isPending}
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
                decimals={decimals}
                bestAsk={bestAsk}
                bestBid={bestBid}
                myPosition={
                  positions[selected.index]
                    ? formatUnits(BigInt(positions[selected.index]), decimals)
                    : "0"
                }
                resolved={resolved}
                collateralApproved={collateralApproved}
                sharesApproved={sharesApproved}
                submitting={submitting}
                onSubmit={onSubmit}
                onRedeemWinnings={doRedeem}
              />

              <section className="card p-4 text-xs text-muted-foreground space-y-1">
                <div>
                  CTF:{" "}
                  <span className="font-mono">
                    {shortAddr(market.ctfAddress)}
                  </span>
                </div>
                <div>
                  Exchange:{" "}
                  <span className="font-mono">
                    {shortAddr(market.exchangeAddress)}
                  </span>
                </div>
                <div>
                  Settler:{" "}
                  <span className="font-mono">{shortAddr(market.settler)}</span>{" "}
                  · fee {(market.feeBps / 100).toFixed(2)}%
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
// Approvals checklist
// ---------------------------------------------------------------------------

function ApprovalsChecklist({
  sym,
  collateralApproved,
  sharesApproved,
  loading,
  onApproveCollateral,
  onApproveShares,
  collateralPending,
  sharesPending,
}: {
  sym: string;
  collateralApproved: boolean;
  sharesApproved: boolean;
  loading: boolean;
  onApproveCollateral: () => void;
  onApproveShares: () => void;
  collateralPending: boolean;
  sharesPending: boolean;
}) {
  const allDone = collateralApproved && sharesApproved;

  return (
    <section
      className={`card p-5 ${
        allDone ? "" : "ring-1 ring-[hsl(var(--warning))]/40"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Before you trade</h3>
        {allDone ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" /> Ready
          </span>
        ) : (
          <span className="text-xs font-medium text-[hsl(var(--warning))]">
            Action required
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        One-time on-chain approvals are required to trade this market.
      </p>

      <ul className="space-y-2">
        <ChecklistRow
          done={collateralApproved}
          loading={loading}
          title={
            <span className="inline-flex items-center gap-1">
              Approve <TokenSymbol symbol={sym} size={13} />
            </span>
          }
          hint="Needed to buy shares and mint sets"
          actionLabel={collateralPending ? "Approving…" : "Approve"}
          onAction={onApproveCollateral}
          pending={collateralPending}
        />
        <ChecklistRow
          done={sharesApproved}
          loading={loading}
          title="Approve shares"
          hint="Needed to sell or merge shares"
          actionLabel={sharesPending ? "Approving…" : "Approve"}
          onAction={onApproveShares}
          pending={sharesPending}
        />
      </ul>
    </section>
  );
}

function ChecklistRow({
  done,
  loading,
  title,
  hint,
  actionLabel,
  onAction,
  pending,
}: {
  done: boolean;
  loading: boolean;
  title: React.ReactNode;
  hint: string;
  actionLabel: string;
  onAction: () => void;
  pending: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        {done ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : (
          // Eye-catching yellow dot signalling a required step.
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--warning))] opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[hsl(var(--warning))]" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {!done && (
        <Button
          size="sm"
          variant="outline"
          onClick={onAction}
          disabled={pending || loading}
        >
          {actionLabel}
        </Button>
      )}
    </li>
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
  buys,
  sells,
  decimals,
  bestAsk,
  bestBid,
  spread,
  mid,
  account,
  resolved,
  onTake,
  onPickPrice,
}: {
  outcomes: { index: number; label: string; positionId: string }[];
  selectedIdx: number;
  onSelectOutcome: (idx: number) => void;
  outcomeBuyPrice: (idx: number) => number | null;
  buys: OrderRow[];
  sells: OrderRow[];
  decimals: number;
  bestAsk: number | null;
  bestBid: number | null;
  spread: number | null;
  mid: number | null;
  account?: string;
  resolved: boolean;
  onTake: (o: OrderRow) => void;
  onPickPrice: (price: number) => void;
}) {
  // Asks: worst (highest) at top, best (lowest) just above the spread line.
  const asks = [...sells].slice(0, 8).reverse();
  const bids = buys.slice(0, 8);

  // Cumulative totals for depth display.
  function cumulative(orders: OrderRow[]): number[] {
    let sum = 0;
    return orders.map((o) => {
      const sh = Number(formatUnits(sharesRemainingRaw(o), decimals));
      sum += sh * Number(o.price);
      return sum;
    });
  }
  const bidTotals = cumulative(bids);
  // For asks we reversed; compute totals from best→worst then map back.
  const askTotalsBestFirst = cumulative([...sells].slice(0, 8));
  const askTotals = [...askTotalsBestFirst].reverse();

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Order book</h3>
        {outcomes.length > 2 && (
          <span className="text-xs text-muted-foreground">
            {outcomes.find((o) => o.index === selectedIdx)?.label}
          </span>
        )}
      </div>

      {/* Outcome selector tabs */}
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
              {p != null && (
                <span className="ml-1.5 opacity-80">{cents(p)}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks */}
      <div className="space-y-px">
        {asks.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No asks.
          </div>
        )}
        {asks.map((o, i) => (
          <BookRow
            key={o.hash}
            order={o}
            decimals={decimals}
            total={askTotals[i]}
            tone="ask"
            mine={!!account && o.maker.toLowerCase() === account.toLowerCase()}
            canTake={!resolved && !!account}
            onTake={onTake}
            onPickPrice={onPickPrice}
          />
        ))}
      </div>

      {/* Spread / mid */}
      <div className="my-1.5 flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 text-xs">
        <span className="text-muted-foreground">
          Mid{" "}
          <span className="font-mono text-foreground">
            {mid != null ? cents(mid) : "—"}
          </span>
        </span>
        <span className="text-muted-foreground">
          Spread{" "}
          <span className="font-mono text-foreground">
            {spread != null ? cents(spread) : "—"}
          </span>
        </span>
      </div>

      {/* Bids */}
      <div className="space-y-px">
        {bids.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No bids.
          </div>
        )}
        {bids.map((o, i) => (
          <BookRow
            key={o.hash}
            order={o}
            decimals={decimals}
            total={bidTotals[i]}
            tone="bid"
            mine={!!account && o.maker.toLowerCase() === account.toLowerCase()}
            canTake={!resolved && !!account}
            onTake={onTake}
            onPickPrice={onPickPrice}
          />
        ))}
      </div>
    </section>
  );
}

function BookRow({
  order,
  decimals,
  total,
  tone,
  mine,
  canTake,
  onTake,
  onPickPrice,
}: {
  order: OrderRow;
  decimals: number;
  total: number;
  tone: "ask" | "bid";
  mine: boolean;
  canTake: boolean;
  onTake: (o: OrderRow) => void;
  onPickPrice: (price: number) => void;
}) {
  const price = Number(order.price);
  const sharesNum = Number(formatUnits(sharesRemainingRaw(order), decimals));
  const isAsk = tone === "ask";

  return (
    <div
      className="group relative grid grid-cols-[1fr_1fr_1fr] items-center gap-2 rounded-md px-2 py-1 text-xs"
      style={{
        background: `linear-gradient(to left, ${
          isAsk ? "hsl(var(--danger))" : "hsl(var(--success))"
        }0F ${Math.min(100, total)}%, transparent 0)`,
      }}
    >
      <button
        type="button"
        onClick={() => onPickPrice(price)}
        className={`text-left font-mono font-medium ${
          isAsk ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--success))]"
        }`}
        title="Use this price"
      >
        {cents(price)}
      </button>
      <span className="text-right font-mono text-foreground">
        {sharesNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </span>
      <span className="flex items-center justify-end gap-2">
        <span className="font-mono text-muted-foreground">{money(total)}</span>
        {canTake && !mine && (
          <button
            type="button"
            onClick={() => onTake(order)}
            className="hidden rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground group-hover:inline-block"
          >
            {isAsk ? "Buy" : "Sell"}
          </button>
        )}
        {mine && <span className="text-[10px] text-muted-foreground">you</span>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules / Market context
// ---------------------------------------------------------------------------

function RulesPanel({
  terms,
  description,
}: {
  terms: string;
  description: string;
}) {
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
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
        {tab === "rules" ? terms : description}
      </pre>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trade panel
// ---------------------------------------------------------------------------

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  limit: "Limit",
  market: "Market",
  mint: "Mint full set",
  redeem: "Redeem / merge",
};

function TradePanel(props: {
  outcomes: { index: number; label: string; positionId: string }[];
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
  decimals: number;
  bestAsk: number | null;
  bestBid: number | null;
  myPosition: string;
  resolved: boolean;
  collateralApproved: boolean;
  sharesApproved: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onRedeemWinnings: () => void;
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
    resolved,
    collateralApproved,
    sharesApproved,
    submitting,
    onSubmit,
    onRedeemWinnings,
  } = props;

  const isOrder = orderType === "limit" || orderType === "market";
  const sharesNum = Number(shares) || 0;

  // Effective price used for totals.
  const priceForCalc =
    orderType === "limit"
      ? Number(limitCents) / 100
      : side === "BUY"
        ? bestAsk ?? 0
        : bestBid ?? 0;

  const total = sharesNum * priceForCalc; // collateral in/out
  const toWin = side === "BUY" ? sharesNum : sharesNum * (1 - priceForCalc);

  function bump(delta: number) {
    const next = Math.max(0, Math.round((sharesNum + delta) * 100) / 100);
    setShares(next ? String(next) : "");
  }

  // Approval gating per action.
  let blockedReason: string | null = null;
  if (isOrder && side === "BUY" && !collateralApproved) {
    blockedReason = `Approve ${sym} to buy`;
  } else if (isOrder && side === "SELL" && !sharesApproved) {
    blockedReason = "Approve shares to sell";
  } else if (orderType === "mint" && !collateralApproved) {
    blockedReason = `Approve ${sym} to mint`;
  } else if (orderType === "redeem" && !sharesApproved) {
    blockedReason = "Approve shares to merge";
  }

  const selectedLabel =
    outcomes.find((o) => o.index === selectedIdx)?.label ?? "";

  let actionLabel = "Place order";
  if (orderType === "limit")
    actionLabel = `${side === "BUY" ? "Buy" : "Sell"} ${selectedLabel}`;
  else if (orderType === "market")
    actionLabel = `${side === "BUY" ? "Buy" : "Sell"} at market`;
  else if (orderType === "mint") actionLabel = "Mint full set";
  else if (orderType === "redeem") actionLabel = `Merge into ${sym}`;

  return (
    <section className="card p-5 space-y-4">
      {/* Outcome selector */}
      <div className="grid grid-cols-2 gap-2">
        {outcomes.slice(0, 2).map((o) => {
          const active = o.index === selectedIdx;
          const p = outcomeBuyPrice(o.index);
          return (
            <button
              key={o.index}
              onClick={() => onSelectOutcome(o.index)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <div className="text-sm font-semibold">{o.label}</div>
              <div className="text-xs text-muted-foreground">
                {p != null ? cents(p) : "—"}
              </div>
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
              {outcomeBuyPrice(o.index) != null
                ? ` · ${cents(outcomeBuyPrice(o.index)!)}`
                : ""}
            </option>
          ))}
        </select>
      )}

      {/* Buy / Sell + order type */}
      {isOrder && (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-lg bg-muted/50 p-0.5">
            <button
              onClick={() => setSide("BUY")}
              className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
                side === "BUY"
                  ? "bg-success text-white"
                  : "text-muted-foreground"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setSide("SELL")}
              className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
                side === "SELL"
                  ? "bg-[hsl(var(--danger))] text-white"
                  : "text-muted-foreground"
              }`}
            >
              Sell
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="label mb-1 block">Order type</label>
        <select
          className="select"
          value={orderType}
          onChange={(e) => setOrderType(e.target.value as OrderType)}
        >
          <option value="limit">{ORDER_TYPE_LABELS.limit}</option>
          <option value="market">{ORDER_TYPE_LABELS.market}</option>
          <optgroup label="Advanced">
            <option value="mint">{ORDER_TYPE_LABELS.mint}</option>
            <option value="redeem">{ORDER_TYPE_LABELS.redeem}</option>
          </optgroup>
        </select>
      </div>

      {/* Inputs by order type */}
      {orderType === "limit" && (
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
        <label className="label mb-1 block">
          {orderType === "mint"
            ? `Sets (costs ${sym})`
            : orderType === "redeem"
              ? "Shares to merge"
              : "Shares"}
        </label>
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

      {/* Position + totals */}
      <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3 text-sm">
        <Row label="Your position">
          <span className="font-mono">{myPosition} sh</span>
        </Row>
        {isOrder && (
          <>
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
          </>
        )}
        {orderType === "mint" && (
          <Row label="Cost">
            <span className="inline-flex items-center gap-1 font-mono text-primary">
              {money(sharesNum)} <TokenSymbol symbol={sym} size={12} />
            </span>
          </Row>
        )}
        {orderType === "redeem" && (
          <Row label="Returns">
            <span className="inline-flex items-center gap-1 font-mono text-success">
              {money(sharesNum)} <TokenSymbol symbol={sym} size={12} />
            </span>
          </Row>
        )}
      </div>

      {blockedReason ? (
        <Button
          className="w-full"
          variant="secondary"
          disabled
          title={blockedReason}
        >
          {blockedReason}
        </Button>
      ) : (
        <Button
          className="w-full"
          variant={
            isOrder ? (side === "BUY" ? "success" : "danger") : "default"
          }
          disabled={submitting || (orderType !== "redeem" && resolved)}
          onClick={onSubmit}
        >
          {submitting ? "Working…" : actionLabel}
        </Button>
      )}

      {resolved && (
        <Button
          className="w-full"
          variant="success"
          onClick={onRedeemWinnings}
        >
          Redeem winning shares
        </Button>
      )}

      {isOrder && (
        <p className="text-center text-[11px] text-muted-foreground">
          {orderType === "limit"
            ? "Signed limit orders rest on the book until matched."
            : "Market orders take the best resting liquidity instantly."}
        </p>
      )}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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

  // Non-creators just see the cover (with fallback) — no controls.
  if (!isCreator) {
    if (!imageUrl) return null;
    return <BetThumbnail imageUrl={imageUrl} title={title} size="md" />;
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
        const j = (await uploadRes.json().catch(() => null)) as {
          error?: string;
        } | null;
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
      push({
        title: "Cover update failed",
        description: (err as Error).message,
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group/cover relative shrink-0">
      <BetThumbnail imageUrl={imageUrl} title={title} size="md" fallback />
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
