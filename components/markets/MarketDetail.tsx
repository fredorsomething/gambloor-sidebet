"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { Check, ImagePlus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  formatUnits,
  maxUint256,
  parseUnits,
  type Address,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useSignTypedData,
} from "wagmi";
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
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { useToast } from "@/components/ui/Toast";
import {
  CONDITIONAL_TOKENS_ABI,
  ERC20_ABI,
  EXCHANGE_ABI,
} from "@/lib/abi";
import { exchangeDomain, ORDER_EIP712_TYPES, randomSalt } from "@/lib/clob";
import { MarketUsdceBanner } from "@/components/wallet/MarketUsdceBanner";
import { formatCryptoError } from "@/lib/cryptoErrors";
import { getMarketCollateralToken } from "@/lib/chains";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { waitForAllowance, waitForTxReceipt } from "@/lib/txWait";
import { jsonFetch } from "@/lib/fetcher";
import { formatToken, shortAddr } from "@/lib/utils";
import type { MarketDetailResponse, OrderRow } from "@/lib/types";

type Side = "BUY" | "SELL";
type OrderType = "limit" | "market" | "mint" | "redeem";

/** A book level in the unified view. `_complementary` rows come from the
 * opposing outcome and are filled by minting/merging a full set. */
type UnifiedOrder = OrderRow & { _complementary?: boolean };

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
  const publicClient = usePublicClient({ chainId: polygon.id });
  const { push } = useToast();
  const searchParams = useSearchParams();

  const viewerQ = account ? `?viewer=${account}` : "";
  const query = useQuery<MarketDetailResponse>({
    queryKey: ["market", id, account],
    queryFn: () => jsonFetch(`/api/markets/${id}${viewerQ}`),
    // Poll briskly so the book/positions stay live without manual refreshes;
    // pause polling while the tab is hidden to avoid wasted requests.
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
  });

  const data = query.data;
  const market = data?.market;

  // The collateral token is whatever this market's on-chain condition uses
  // (reported by the API from chain). Newer markets use USDC.e; some older ones
  // used native USDC. Always trust the market's own token so balance/allowance
  // checks match what splitPosition / fillOrder actually move.
  const fallbackCollateral = getMarketCollateralToken();
  const collateralAddress =
    (market?.token as Address | undefined) ?? fallbackCollateral.address;

  // Unified sender works for both Privy-managed (embedded) and external wallets.
  const { writeContract } = useTxSender();
  const { signTypedDataAsync } = useSignTypedData();
  const ensurePolygon = useEnsurePolygon();
  const collateralLive = useTokenInfo({
    token: collateralAddress,
    owner: account,
    spender: market?.exchangeAddress as Address | undefined,
  });

  // Pending flags for the approval popup actions.
  const [approvingExchange, setApprovingExchange] = useState(false);
  const [approvingCtf, setApprovingCtf] = useState(false);
  const [approvingShares, setApprovingShares] = useState(false);
  const [approvalsDismissed, setApprovalsDismissed] = useState(false);

  // On-chain approval state for the checklist (this market's real collateral).
  const tokenAddr = collateralAddress;
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
  const exchangeCollateralApproved = exchangeAllowance > 0n;
  const ctfCollateralApproved = ctfAllowance > 0n;
  const collateralApproved =
    exchangeCollateralApproved && ctfCollateralApproved;
  const sharesApproved = (approvalReads.data?.[2]?.result as boolean) ?? false;

  const approvalUi = { showWalletUIs: true as const };

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

  const decimals =
    market?.decimals ?? collateralLive.decimals ?? fallbackCollateral.decimals;
  const sym =
    market?.tokenSymbol ?? collateralLive.symbol ?? fallbackCollateral.symbol;
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
  const token = collateralAddress;
  const conditionId = market.conditionId as `0x${string}`;
  const resolved = market.status === "Resolved";
  const outcomes = market.outcomes;
  const selected = outcomes[selectedIdx] ?? outcomes[0];
  const book = data?.orderBook?.[selected.index] ?? { buys: [], sells: [] };

  // ---- Unified (combined Yes/No) order book ----------------------------
  // For binary markets the two outcomes are complementary (price sums to 1),
  // so we fold the *other* outcome's liquidity into a single book denominated
  // in the selected outcome. A resting BUY on the other side is, economically,
  // an ASK on this side at (1 - price); a resting SELL on the other side is a
  // BID here at (1 - price). Complementary rows are still fillable peer-to-peer
  // by minting (split) or merging a full set around the native fill.
  const isBinary = outcomes.length === 2;
  const otherOutcome = isBinary
    ? outcomes.find((o) => o.index !== selected.index) ?? null
    : null;
  const otherBook =
    otherOutcome != null
      ? data?.orderBook?.[otherOutcome.index] ?? { buys: [], sells: [] }
      : { buys: [], sells: [] };

  const compl = (o: OrderRow): UnifiedOrder => ({
    ...o,
    price: String(1 - Number(o.price)),
    _complementary: true,
  });

  const unifiedSells: UnifiedOrder[] = isBinary
    ? [...book.sells, ...otherBook.buys.map(compl)].sort(
        (a, b) => Number(a.price) - Number(b.price),
      )
    : (book.sells as UnifiedOrder[]);
  const unifiedBuys: UnifiedOrder[] = isBinary
    ? [...book.buys, ...otherBook.sells.map(compl)].sort(
        (a, b) => Number(b.price) - Number(a.price),
      )
    : (book.buys as UnifiedOrder[]);

  // Best prices reflect combined liquidity across both outcomes.
  const bestAsk = unifiedSells[0] ? Number(unifiedSells[0].price) : null;
  const bestBid = unifiedBuys[0] ? Number(unifiedBuys[0].price) : null;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const mid =
    bestAsk != null && bestBid != null
      ? (bestAsk + bestBid) / 2
      : (bestAsk ?? bestBid);

  // Best ask per outcome (cost to buy), combining native asks with the
  // complementary bids from the opposing outcome.
  function outcomeBuyPrice(idx: number): number | null {
    const b = data?.orderBook?.[idx];
    let best = b?.sells[0] ? Number(b.sells[0].price) : null;
    if (isBinary) {
      const other = outcomes.find((o) => o.index !== idx);
      const ob = other ? data?.orderBook?.[other.index] : undefined;
      if (ob?.buys[0]) {
        const p = 1 - Number(ob.buys[0].price);
        best = best == null ? p : Math.min(best, p);
      }
    }
    return best;
  }

  // ---- on-chain actions -------------------------------------------------

  async function approveExchangeCollateral() {
    if (!account || !token) return;
    setApprovingExchange(true);
    try {
      await ensurePolygon();
      const hash = await writeContract(
        {
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [exchange, maxUint256],
        },
        approvalUi,
      );
      await waitForAllowance(token, exchange, account as Address, 1n, hash);
      push({
        title: `${sym} approved for trading`,
        description: "Exchange can move your collateral for buys.",
        variant: "success",
      });
      await approvalReads.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Approval failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setApprovingExchange(false);
    }
  }

  async function approveCtfCollateral() {
    if (!account || !token) return;
    setApprovingCtf(true);
    try {
      await ensurePolygon();
      const hash = await writeContract(
        {
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ctf, maxUint256],
        },
        approvalUi,
      );
      await waitForAllowance(token, ctf, account as Address, 1n, hash);
      push({
        title: `${sym} approved for minting`,
        description: "Outcome tokens can pull collateral when you mint sets.",
        variant: "success",
      });
      await approvalReads.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Approval failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setApprovingCtf(false);
    }
  }

  async function approveShares() {
    setApprovingShares(true);
    try {
      await ensurePolygon();
      await writeContract(
        {
          address: ctf,
          abi: CONDITIONAL_TOKENS_ABI,
          functionName: "setApprovalForAll",
          args: [exchange, true],
        },
        approvalUi,
      );
      push({ title: "Shares approved for trading", variant: "success" });
      approvalReads.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Approval failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setApprovingShares(false);
    }
  }

  async function readCollateralBalance(): Promise<bigint> {
    if (!publicClient || !account || !token) return 0n;
    return publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account as Address],
    });
  }

  function assertCollateralFor(amt: bigint, balance: bigint) {
    const tokenDecimals = collateralLive.decimals ?? decimals;
    if (amt > balance) {
      throw new Error(
        `Need ${formatToken(amt, tokenDecimals)} ${sym} — you have ${formatToken(balance, tokenDecimals)}`,
      );
    }
  }

  async function doSplit(amountStr: string) {
    try {
      const tokenDecimals = collateralLive.decimals ?? decimals;
      const amt = parseUnits(amountStr || "0", tokenDecimals);
      if (amt <= 0n) return;
      if (!ctfCollateralApproved) {
        setApprovalsDismissed(false);
        throw new Error(`Approve ${sym} for minting first`);
      }
      await ensurePolygon();
      const balance = await readCollateralBalance();
      assertCollateralFor(amt, balance);
      const hash = await writeContract(
        {
          address: ctf,
          abi: CONDITIONAL_TOKENS_ABI,
          functionName: "splitPosition",
          args: [conditionId, amt],
        },
        approvalUi,
      );
      await waitForTxReceipt(hash);
      push({
        title: "Minted a full set",
        description: `You now hold ${amountStr} of every outcome.`,
        variant: "success",
      });
      setShares("");
      await collateralLive.refetch();
      query.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Mint failed",
      });
      push({ title, description, variant: "danger" });
    }
  }

  async function doMerge(amountStr: string) {
    try {
      const amt = parseUnits(amountStr || "0", decimals);
      if (amt <= 0n) return;
      await ensurePolygon();
      await writeContract({
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "mergePositions",
        args: [conditionId, amt],
      });
      push({ title: `Merged a full set back into ${sym}`, variant: "success" });
      setShares("");
      query.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Merge failed",
      });
      push({ title, description, variant: "danger" });
    }
  }

  async function doRedeem() {
    try {
      await ensurePolygon();
      await writeContract({
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "redeemPositions",
        args: [conditionId],
      });
      push({ title: "Redeemed winning shares", variant: "success" });
      query.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Redeem failed",
      });
      push({ title, description, variant: "danger" });
    }
  }

  function sharesForOutcome(idx: number): bigint {
    return BigInt(positions[idx] ?? "0");
  }

  async function readShareBalance(
    positionId: string,
    owner?: Address,
  ): Promise<bigint> {
    if (!publicClient || !owner) return 0n;
    return publicClient.readContract({
      address: ctf,
      abi: CONDITIONAL_TOKENS_ABI,
      functionName: "balanceOf",
      args: [BigInt(positionId), owner],
    });
  }

  /** Taker-side fill units for `fillOrder`, matching fillUnifiedShares. */
  function takerFillFor(order: UnifiedOrder, sharesTake: bigint): bigint {
    const makerAmount = BigInt(order.makerAmount);
    const takerAmount = BigInt(order.takerAmount);
    const remainingTaker = takerAmount - BigInt(order.filled);
    const avail = sharesRemainingRaw(order);
    const whole = sharesTake >= avail;

    if (!order._complementary) {
      if (order.side === "SELL") {
        return whole
          ? remainingTaker
          : (takerAmount * sharesTake) / (makerAmount || 1n);
      }
      return whole ? remainingTaker : sharesTake;
    }
    if (order.side === "BUY") {
      return whole ? remainingTaker : sharesTake;
    }
    return whole
      ? remainingTaker
      : (takerAmount * sharesTake) / (makerAmount || 1n);
  }

  function makerGivesFor(order: OrderRow, takerFill: bigint): bigint {
    const makerAmount = BigInt(order.makerAmount);
    const takerAmount = BigInt(order.takerAmount);
    return (takerFill * makerAmount) / (takerAmount || 1n);
  }

  /** Pre-flight on-chain so fills fail in-app with a clear message, not a raw revert. */
  async function assertCanFill(order: UnifiedOrder, sharesTake: bigint) {
    const fmt = (wei: bigint) => formatToken(wei, decimals);
    const takerFill = takerFillFor(order, sharesTake);
    const makerGives = makerGivesFor(order, takerFill);
    const collateralBal = await readCollateralBalance();

    // Resting SELL (ask or complementary bid): maker must still hold outcome shares.
    if (order.side === "SELL") {
      const makerBal = await readShareBalance(
        order.positionId,
        order.maker as Address,
      );
      if (makerBal < makerGives) {
        throw new Error(
          "This order can't be filled — the maker no longer has enough outcome shares on-chain. Try another price level.",
        );
      }
    }

    if (!order._complementary) {
      if (order.side === "SELL") {
        if (collateralBal < takerFill) {
          throw new Error(
            `Need ${fmt(takerFill)} ${sym} to buy — you have ${fmt(collateralBal)}`,
          );
        }
        return;
      }
      if (!sharesApproved) {
        throw new Error("Approve outcome shares for the exchange before selling");
      }
      const have = await readShareBalance(order.positionId, account as Address);
      const need = sharesTake;
      if (have < need) {
        const label =
          outcomes.find((o) => o.positionId === order.positionId)?.label ??
          "outcome";
        throw new Error(
          `Need ${fmt(need)} ${label} shares to sell — you have ${fmt(have)}. Mint a set or buy shares first.`,
        );
      }
      return;
    }

    if (order.side === "BUY") {
      if (collateralBal < sharesTake) {
        throw new Error(
          `Need ${fmt(sharesTake)} ${sym} to mint a set and fill — you have ${fmt(collateralBal)}`,
        );
      }
      return;
    }

    if (collateralBal < takerFill) {
      throw new Error(
        `Need ${fmt(takerFill)} ${sym} for this fill — you have ${fmt(collateralBal)}`,
      );
    }
    if (!sharesApproved) {
      throw new Error(
        `Approve ${selected.label} shares for the exchange before filling this bid`,
      );
    }
    const haveSelected = await readShareBalance(
      selected.positionId,
      account as Address,
    );
    if (haveSelected < sharesTake) {
      throw new Error(
        `Need ${fmt(sharesTake)} ${selected.label} shares to complete this fill — you have ${fmt(haveSelected)}. Mint a set or buy shares first.`,
      );
    }
  }

  /** Fill `takerFill` (taker-side raw units) against one resting order. */
  async function fillOrderRaw(
    order: OrderRow,
    takerFill: bigint,
  ): Promise<import("viem").Hex> {
    const makerAmount = BigInt(order.makerAmount);
    const takerAmount = BigInt(order.takerAmount);
    if (takerFill <= 0n) throw new Error("Fill amount must be positive");
    const makerGives = (takerFill * makerAmount) / (takerAmount || 1n);
    const isSellOrder = order.side === "SELL";
    const sharesMoved = isSellOrder ? makerGives : takerFill;
    const cost = isSellOrder ? takerFill : makerGives;

    const txHash = await writeContract({
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
        txHash,
      }),
    });
    return txHash;
  }

  /**
   * Fill `sharesTake` (selected-outcome share units) of a resting order. Handles
   * both native orders and complementary orders (from the opposing outcome) by
   * minting/merging a full set around the native fill.
   */
  async function fillUnifiedShares(order: UnifiedOrder, sharesTake: bigint) {
    if (sharesTake <= 0n) return;
    await assertCanFill(order, sharesTake);

    const takerFill = takerFillFor(order, sharesTake);

    if (!order._complementary) {
      if (order.side === "SELL") {
        await fillOrderRaw(order, takerFill);
      } else {
        await fillOrderRaw(order, takerFill);
      }
      return;
    }

    if (order.side === "BUY") {
      const splitHash = await writeContract(
        {
          address: ctf,
          abi: CONDITIONAL_TOKENS_ABI,
          functionName: "splitPosition",
          args: [conditionId, sharesTake],
        },
        approvalUi,
      );
      await waitForTxReceipt(splitHash);
      const have = await readShareBalance(
        order.positionId,
        account as Address,
      );
      if (have < takerFill) {
        throw new Error(
          `Minted shares aren't available yet (need ${formatToken(takerFill, decimals)}, have ${formatToken(have, decimals)}). Wait a moment and try again.`,
        );
      }
      await fillOrderRaw(order, takerFill);
      return;
    }

    const fillHash = await fillOrderRaw(order, takerFill);
    await waitForTxReceipt(fillHash);
    const mergeHash = await writeContract(
      {
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "mergePositions",
        args: [conditionId, sharesTake],
      },
      approvalUi,
    );
    await waitForTxReceipt(mergeHash);
  }

  /** Fill a single resting order completely (used by the book "take" buttons). */
  async function takeOrder(order: UnifiedOrder) {
    if (!account) return;
    try {
      const availShares = sharesRemainingRaw(order);
      if (availShares <= 0n) return;
      await ensurePolygon();
      await fillUnifiedShares(order, availShares);
      push({ title: "Order filled", variant: "success" });
      query.refetch();
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Fill failed",
      });
      push({ title, description, variant: "danger" });
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
    // BUY consumes asks (sells); SELL consumes bids (buys) across the unified book.
    const resting = (takeSide === "BUY" ? unifiedSells : unifiedBuys).filter(
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

        const sharesTaken =
          remainingShares >= availShares ? availShares : remainingShares;
        await fillUnifiedShares(order, sharesTaken);
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
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Order failed",
      });
      push({ title, description, variant: "danger" });
      query.refetch();
    }
  }

  /** Sign + post one resting limit order for `sharesRaw` shares at `price`. */
  async function postRestingOrder(a: {
    outcomeIndex: number;
    positionId: string;
    side: Side;
    price: number;
    sharesRaw: bigint;
  }) {
    const collateralRaw = BigInt(Math.round(Number(a.sharesRaw) * a.price));
    if (collateralRaw <= 0n || a.sharesRaw <= 0n) return;

    const sideNum = a.side === "BUY" ? 0 : 1;
    const makerAmount = a.side === "BUY" ? collateralRaw : a.sharesRaw;
    const takerAmount = a.side === "BUY" ? a.sharesRaw : collateralRaw;
    const salt = randomSalt();
    const expiration = 0n;

    const signature = await signTypedDataAsync({
      domain: exchangeDomain(market!.chainId, exchange),
      types: ORDER_EIP712_TYPES,
      primaryType: "Order",
      message: {
        salt,
        maker: account as Address,
        tokenId: BigInt(a.positionId),
        makerAmount,
        takerAmount,
        expiration,
        side: sideNum,
      },
    } as Parameters<typeof signTypedDataAsync>[0]);

    await jsonFetch(`/api/markets/${id}/orders`, {
      method: "POST",
      body: JSON.stringify({
        outcomeIndex: a.outcomeIndex,
        side: a.side,
        salt: salt.toString(),
        maker: account,
        tokenId: a.positionId,
        makerAmount: makerAmount.toString(),
        takerAmount: takerAmount.toString(),
        expiration: expiration.toString(),
        signature,
      }),
    });
  }

  /**
   * Place a limit order. First it crosses any marketable resting liquidity (a
   * BUY at/above the best asks, or a SELL at/below the best bids) and fills it
   * on-chain, then rests the unfilled remainder on the book. This is why a limit
   * order priced into the spread now fills instead of just sitting at a 0¢
   * spread against an existing order.
   */
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

    // Marketable side: a BUY crosses asks priced <= limit; a SELL crosses bids
    // priced >= limit. Use a tiny epsilon so an exact-price match still fills.
    const EPS = 1e-9;
    const opposing = args.side === "BUY" ? unifiedSells : unifiedBuys;
    const crossable = opposing.filter(
      (o) =>
        o.maker.toLowerCase() !== account.toLowerCase() &&
        sharesRemainingRaw(o) > 0n &&
        (args.side === "BUY"
          ? Number(o.price) <= args.price + EPS
          : Number(o.price) >= args.price - EPS),
    );

    let remaining = sharesRaw;
    let fills = 0;
    try {
      if (crossable.length > 0) await ensurePolygon();
      for (const o of crossable) {
        if (remaining <= 0n || fills >= 12) break;
        const avail = sharesRemainingRaw(o);
        if (avail <= 0n) continue;
        const take = remaining >= avail ? avail : remaining;
        await fillUnifiedShares(o, take);
        remaining -= take;
        fills += 1;
      }
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Fill failed",
      });
      push({ title, description, variant: "danger" });
      query.refetch();
      return;
    }

    // Rest whatever didn't immediately fill.
    if (remaining > 0n) {
      await postRestingOrder({
        outcomeIndex: args.outcomeIndex,
        positionId: args.positionId,
        side: args.side,
        price: args.price,
        sharesRaw: remaining,
      });
    }

    const filledAll = remaining <= 0n;
    push({
      title:
        fills > 0
          ? filledAll
            ? "Order filled"
            : "Partially filled — rest posted"
          : "Order posted",
      description:
        fills > 0
          ? `${fills} order${fills === 1 ? "" : "s"} taken${
              filledAll ? "" : "; remainder resting on the book"
            }.`
          : "Your signed order is resting on the book.",
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
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Action failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setSubmitting(false);
    }
  }

  const tokenDecimals = collateralLive.decimals ?? decimals;
  const collateralBal = collateralLive.balance ?? 0n;
  const walletBalanceLabel = formatToken(collateralBal, tokenDecimals);

  /** Disable trade/mint/redeem actions with a clear reason before sending txs. */
  function getTradeBlockedReason(): string | null {
    let amt = 0n;
    try {
      amt = parseUnits(shares || "0", tokenDecimals);
    } catch {
      return "Invalid amount";
    }

    if (orderType === "limit" || orderType === "market") {
      if (side === "BUY" && !exchangeCollateralApproved) {
        return `Approve ${sym} to buy`;
      }
      if (side === "SELL" && !sharesApproved) {
        return "Approve shares to sell";
      }
      if (side === "BUY" && amt > 0n) {
        const price =
          orderType === "limit"
            ? Number(limitCents) / 100
            : (bestAsk ?? 0);
        if (price > 0) {
          const priceBps = Math.round(price * 10_000);
          const cost = (amt * BigInt(priceBps)) / 10_000n;
          if (cost > collateralBal) {
            return `Need ${formatToken(cost, tokenDecimals)} ${sym} — you have ${walletBalanceLabel}`;
          }
        }
      }
      return null;
    }

    if (orderType === "mint") {
      if (!ctfCollateralApproved) return `Approve ${sym} to mint`;
      if (amt > 0n && amt > collateralBal) {
        return `Need ${formatToken(amt, tokenDecimals)} ${sym} — you have ${walletBalanceLabel}`;
      }
      return null;
    }

    if (orderType === "redeem") {
      if (!sharesApproved) return "Approve shares to merge";
      let minHeld: bigint | null = null;
      for (const o of outcomes) {
        const h = BigInt(positions[o.index] ?? "0");
        minHeld = minHeld === null || h < minHeld ? h : minHeld;
      }
      const held = minHeld ?? 0n;
      if (amt > 0n && amt > held) {
        return `Need ${formatToken(amt, tokenDecimals)} shares per outcome — you have ${formatToken(held, tokenDecimals)}`;
      }
    }

    return null;
  }

  const tradeBlockedReason = getTradeBlockedReason();

  function setMaxMintAmount() {
    if (collateralBal <= 0n) {
      setShares("");
      return;
    }
    setShares(formatUnits(collateralBal, tokenDecimals));
  }

  // Approvals are surfaced as an unavoidable popup rather than a permanent
  // panel: it appears when the market is tradeable and approvals are missing,
  // and disappears automatically once both approvals are satisfied.
  const tradeable = market.status === "Open" && !resolved;
  const approvalsReady = collateralApproved && sharesApproved;
  const needsApprovals = tradeable && !approvalsReady;
  const showApprovalModal =
    !!account && needsApprovals && !approvalsDismissed;

  return (
    <div className="space-y-6">
      {showApprovalModal && (
        <ApprovalsModal
          sym={sym}
          exchangeCollateralApproved={exchangeCollateralApproved}
          ctfCollateralApproved={ctfCollateralApproved}
          sharesApproved={sharesApproved}
          loading={approvalReads.isLoading}
          onApproveExchange={approveExchangeCollateral}
          onApproveCtf={approveCtfCollateral}
          onApproveShares={approveShares}
          exchangePending={approvingExchange}
          ctfPending={approvingCtf}
          sharesPending={approvingShares}
          onClose={() => setApprovalsDismissed(true)}
        />
      )}
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
              !!account &&
              account.toLowerCase() === market.creator.toLowerCase()
            }
            account={account}
            onDone={() => query.refetch()}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold md:text-3xl">
              {market.title}
            </h1>
            <CollapsibleBlurb
              text={market.description}
              maxLines={3}
              className="mt-2"
            />
          </div>
        </div>
        {market.status === "Pending" && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <b>Awaiting admin approval.</b> This market isn&apos;t shown in the
            public feed until a verifier approves it.
          </div>
        )}
        {market.status === "Rejected" && (
          <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            This market was not approved by the admin.
          </div>
        )}
        {resolved && market.winningOutcome != null && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            Winning outcome:{" "}
            <b>{market.outcomes[market.winningOutcome]?.label}</b>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column: order book, rules, comments. On mobile this renders
            after the trade panel so traders don't have to scroll past it. */}
        <div className="order-2 space-y-6 lg:order-none lg:col-start-1 lg:row-start-1">
          <OrderBookPanel
            outcomes={outcomes}
            selectedIdx={selected.index}
            onSelectOutcome={setSelectedIdx}
            outcomeBuyPrice={outcomeBuyPrice}
            buys={unifiedBuys}
            sells={unifiedSells}
            decimals={decimals}
            bestAsk={bestAsk}
            bestBid={bestBid}
            spread={spread}
            mid={mid}
            account={account}
            resolved={resolved}
            unified={isBinary}
            selectedLabel={selected.label}
            otherLabel={otherOutcome?.label ?? null}
            onTake={takeOrder}
            onPickOrder={(o, tone) => {
              setOrderType("limit");
              setSide(tone === "ask" ? "BUY" : "SELL");
              setLimitCents((Number(o.price) * 100).toFixed(1));
              setShares(
                formatUnits(sharesRemainingRaw(o), decimals),
              );
            }}
          />

          {account && (
            <MarketPortfolio
              marketId={market.id}
              account={account}
              exchange={exchange}
              positions={positions}
              onChanged={() => query.refetch()}
            />
          )}

          <RulesPanel terms={market.terms} description={market.description} />

          <Resolvers
            subjectType="market"
            subjectId={market.id}
            settler={market.settler}
            feeBps={market.feeBps}
          />

          {market.status === "Open" && (
            <ProposeResolutionButton
              subjectType="market"
              subjectId={market.id}
              outcomes={market.outcomes.map((o) => o.label)}
              participants={[market.creator, market.settler]}
            />
          )}

          <Comments basePath={`/api/markets/${market.id}/comments`} />
        </div>

        {/* Right column: trade panel. Ordered first on mobile so it's reachable
            without scrolling past the book/comments. */}
        <aside className="order-1 space-y-4 lg:order-none lg:col-start-2 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
          {!account ? (
            <div className="card p-5 text-sm text-muted-foreground">
              Sign in to trade, mint, or redeem shares.
            </div>
          ) : (
            <>
              <LowGasBanner />
              <MarketUsdceBanner />

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
                blockedReason={tradeBlockedReason}
                walletBalance={walletBalanceLabel}
                submitting={submitting}
                onSubmit={onSubmit}
                onMaxMint={setMaxMintAmount}
                onRedeemWinnings={doRedeem}
                onApprovalNeeded={() => setApprovalsDismissed(false)}
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
// Approvals popup
// ---------------------------------------------------------------------------

function ApprovalsModal({
  sym,
  exchangeCollateralApproved,
  ctfCollateralApproved,
  sharesApproved,
  loading,
  onApproveExchange,
  onApproveCtf,
  onApproveShares,
  exchangePending,
  ctfPending,
  sharesPending,
  onClose,
}: {
  sym: string;
  exchangeCollateralApproved: boolean;
  ctfCollateralApproved: boolean;
  sharesApproved: boolean;
  loading: boolean;
  onApproveExchange: () => void;
  onApproveCtf: () => void;
  onApproveShares: () => void;
  exchangePending: boolean;
  ctfPending: boolean;
  sharesPending: boolean;
  onClose: () => void;
}) {
  // Lock background scroll while the popup is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-1 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--warning))] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[hsl(var(--warning))]" />
          </span>
          <h3 className="text-lg font-semibold">Approve to trade</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Three one-time wallet confirmations let you trade. Do them in order —
          one at a time.
        </p>

        <ul className="space-y-2.5">
          <ChecklistRow
            done={exchangeCollateralApproved}
            loading={loading}
            title={
              <span className="inline-flex items-center gap-1">
                1. <TokenSymbol symbol={sym} size={13} /> for exchange
              </span>
            }
            hint="Required to buy shares on the book"
            actionLabel={exchangePending ? "Approving…" : "Approve"}
            onAction={onApproveExchange}
            pending={exchangePending || ctfPending || sharesPending}
            disabled={exchangeCollateralApproved}
          />
          <ChecklistRow
            done={ctfCollateralApproved}
            loading={loading}
            title={
              <span className="inline-flex items-center gap-1">
                2. <TokenSymbol symbol={sym} size={13} /> for minting
              </span>
            }
            hint="Required to mint outcome token sets"
            actionLabel={ctfPending ? "Approving…" : "Approve"}
            onAction={onApproveCtf}
            pending={exchangePending || ctfPending || sharesPending}
            disabled={ctfCollateralApproved || !exchangeCollateralApproved}
          />
          <ChecklistRow
            done={sharesApproved}
            loading={loading}
            title="3. Approve shares"
            hint="Required to sell or merge shares"
            actionLabel={sharesPending ? "Approving…" : "Approve"}
            onAction={onApproveShares}
            pending={exchangePending || ctfPending || sharesPending}
            disabled={
              !exchangeCollateralApproved ||
              !ctfCollateralApproved ||
              sharesApproved
            }
          />
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Maybe later
        </button>
      </div>
    </div>
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
  disabled,
}: {
  done: boolean;
  loading: boolean;
  title: React.ReactNode;
  hint: string;
  actionLabel: string;
  onAction: () => void;
  pending: boolean;
  disabled?: boolean;
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
          disabled={disabled || pending || loading}
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
  unified,
  selectedLabel,
  otherLabel,
  onTake,
  onPickOrder,
}: {
  outcomes: { index: number; label: string; positionId: string }[];
  selectedIdx: number;
  onSelectOutcome: (idx: number) => void;
  outcomeBuyPrice: (idx: number) => number | null;
  buys: UnifiedOrder[];
  sells: UnifiedOrder[];
  decimals: number;
  bestAsk: number | null;
  bestBid: number | null;
  spread: number | null;
  mid: number | null;
  account?: string;
  resolved: boolean;
  unified?: boolean;
  selectedLabel: string;
  otherLabel?: string | null;
  onTake: (o: UnifiedOrder) => void;
  onPickOrder: (o: UnifiedOrder, tone: "ask" | "bid") => void;
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
        <h3 className="font-semibold">
          Order book{" "}
          <span className="text-muted-foreground">· {selectedLabel}</span>
        </h3>
        {unified && <span className="badge badge-accent">Unified</span>}
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
      <div className="mb-1 px-2 text-[11px] font-medium text-[hsl(var(--danger))]">
        Asks · buy {selectedLabel} here
      </div>
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
            selectedLabel={selectedLabel}
            mine={!!account && o.maker.toLowerCase() === account.toLowerCase()}
            canTake={!resolved && !!account}
            otherLabel={otherLabel}
            onTake={onTake}
            onPickOrder={onPickOrder}
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
      <div className="mb-1 px-2 text-[11px] font-medium text-[hsl(var(--success))]">
        Bids · sell {selectedLabel} here
      </div>
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
            selectedLabel={selectedLabel}
            mine={!!account && o.maker.toLowerCase() === account.toLowerCase()}
            canTake={!resolved && !!account}
            otherLabel={otherLabel}
            onTake={onTake}
            onPickOrder={onPickOrder}
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
  order,
  decimals,
  total,
  tone,
  selectedLabel,
  mine,
  canTake,
  otherLabel,
  onTake,
  onPickOrder,
}: {
  order: UnifiedOrder;
  decimals: number;
  total: number;
  tone: "ask" | "bid";
  selectedLabel: string;
  mine: boolean;
  canTake: boolean;
  otherLabel?: string | null;
  onTake: (o: UnifiedOrder) => void;
  onPickOrder: (o: UnifiedOrder, tone: "ask" | "bid") => void;
}) {
  const price = Number(order.price);
  const sharesNum = Number(formatUnits(sharesRemainingRaw(order), decimals));
  const isAsk = tone === "ask";
  const complementary = !!order._complementary;
  const tint = isAsk ? "hsl(var(--danger))" : "hsl(var(--success))";

  return (
    <button
      type="button"
      onClick={() => onPickOrder(order, tone)}
      title={`Load ${cents(price)} × ${sharesNum.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} ${selectedLabel} into the ticket`}
      className="group relative grid w-full grid-cols-[1fr_1fr_1fr] items-center gap-2 rounded-md px-2 py-1 text-xs hover:ring-1 hover:ring-border"
      style={{
        background: `linear-gradient(to left, ${tint}0F ${Math.min(
          100,
          total,
        )}%, transparent 0)`,
      }}
    >
      <span
        className="text-left font-mono font-medium"
        style={{ color: tint }}
      >
        {cents(price)}
      </span>
      <span className="text-right font-mono text-foreground">
        {sharesNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        {complementary && otherLabel && (
          <span
            className="ml-1 text-[9px] uppercase text-muted-foreground"
            title={`Liquidity routed from the ${otherLabel} book`}
          >
            ·{otherLabel.slice(0, 4)}
          </span>
        )}
      </span>
      <span className="flex items-center justify-end gap-2">
        <span className="font-mono text-muted-foreground">{money(total)}</span>
        {canTake && !mine && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onTake(order);
            }}
            className={`hidden rounded px-2 py-0.5 font-medium text-white group-hover:inline-block ${
              isAsk ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--danger))]"
            }`}
          >
            {isAsk ? "Buy" : "Sell"}
          </span>
        )}
        {mine && <span className="text-[10px] text-muted-foreground">you</span>}
      </span>
    </button>
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
  blockedReason: string | null;
  walletBalance: string;
  submitting: boolean;
  onSubmit: () => void;
  onMaxMint: () => void;
  onRedeemWinnings: () => void;
  onApprovalNeeded: () => void;
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
    blockedReason,
    walletBalance,
    submitting,
    onSubmit,
    onMaxMint,
    onRedeemWinnings,
    onApprovalNeeded,
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
          {orderType === "mint" && (
            <button
              type="button"
              onClick={onMaxMint}
              className="mt-1.5 text-xs font-medium text-primary hover:underline"
            >
              Use max {sym}
            </button>
          )}
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
          <>
            <Row label={`${sym} balance`}>
              <span className="inline-flex items-center gap-1 font-mono">
                {walletBalance}
                <TokenSymbol symbol={sym} size={12} />
              </span>
            </Row>
            <Row label="Cost">
              <span className="inline-flex items-center gap-1 font-mono text-primary">
                {money(sharesNum)} <TokenSymbol symbol={sym} size={12} />
              </span>
            </Row>
          </>
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
          onClick={
            blockedReason.includes("Approve")
              ? onApprovalNeeded
              : undefined
          }
          disabled={!blockedReason.includes("Approve")}
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
          onClick={() => void onSubmit()}
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
    return (
      <BetThumbnail imageUrl={imageUrl} title={title} size="lg" fallback />
    );
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
