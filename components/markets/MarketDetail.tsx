"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  formatUnits,
  maxUint256,
  parseUnits,
  type Address,
} from "viem";
import {
  useAccount,
  useSignTypedData,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { useToast } from "@/components/ui/Toast";
import {
  CONDITIONAL_TOKENS_ABI,
  ERC20_ABI,
  EXCHANGE_ABI,
} from "@/lib/abi";
import { exchangeDomain, ORDER_EIP712_TYPES, randomSalt } from "@/lib/clob";
import { jsonFetch } from "@/lib/fetcher";
import { shortAddr } from "@/lib/utils";
import type { MarketDetailResponse, OrderRow } from "@/lib/types";

export function MarketDetail({ id }: { id: number }) {
  const { address: account } = useAccount();
  const { push } = useToast();

  const viewerQ = account ? `?viewer=${account}` : "";
  const query = useQuery<MarketDetailResponse>({
    queryKey: ["market", id, account],
    queryFn: () => jsonFetch(`/api/markets/${id}${viewerQ}`),
    refetchInterval: 12_000,
  });

  const data = query.data;
  const market = data?.market;

  const approveTx = useWriteContract();
  const ctfApproveTx = useWriteContract();
  const setApprovalTx = useWriteContract();
  const splitTx = useWriteContract();
  const mergeTx = useWriteContract();
  const redeemTx = useWriteContract();
  const fillTx = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const [splitAmt, setSplitAmt] = useState("");
  const [mergeAmt, setMergeAmt] = useState("");

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

  async function approveCollateral() {
    try {
      // Approve both the exchange (trading) and CTF (splitting).
      await approveTx.writeContractAsync({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [exchange, maxUint256],
      });
      await ctfApproveTx.writeContractAsync({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ctf, maxUint256],
      });
      push({ title: "Collateral approved", variant: "success" });
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
      await setApprovalTx.writeContractAsync({
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "setApprovalForAll",
        args: [exchange, true],
      });
      push({ title: "Shares approved for trading", variant: "success" });
    } catch (err) {
      push({
        title: "Approval failed",
        description: (err as Error).message,
        variant: "danger",
      });
    }
  }

  async function doSplit() {
    try {
      const amt = parseUnits(splitAmt || "0", decimals);
      if (amt <= 0n) return;
      await splitTx.writeContractAsync({
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "splitPosition",
        args: [conditionId, amt],
      });
      push({
        title: "Minted a full set",
        description: `You now hold ${splitAmt} of every outcome.`,
        variant: "success",
      });
      setSplitAmt("");
      query.refetch();
    } catch (err) {
      push({ title: "Split failed", description: (err as Error).message, variant: "danger" });
    }
  }

  async function doMerge() {
    try {
      const amt = parseUnits(mergeAmt || "0", decimals);
      if (amt <= 0n) return;
      await mergeTx.writeContractAsync({
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "mergePositions",
        args: [conditionId, amt],
      });
      push({ title: "Redeemed a full set for collateral", variant: "success" });
      setMergeAmt("");
      query.refetch();
    } catch (err) {
      push({ title: "Merge failed", description: (err as Error).message, variant: "danger" });
    }
  }

  async function doRedeem() {
    try {
      await redeemTx.writeContractAsync({
        address: ctf,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "redeemPositions",
        args: [conditionId],
      });
      push({ title: "Redeemed winning shares", variant: "success" });
      query.refetch();
    } catch (err) {
      push({ title: "Redeem failed", description: (err as Error).message, variant: "danger" });
    }
  }

  async function fillResting(order: OrderRow) {
    if (!account) return;
    try {
      const remainingTaker = BigInt(order.takerAmount) - BigInt(order.filled);
      if (remainingTaker <= 0n) return;
      const makerAmount = BigInt(order.makerAmount);
      const takerAmount = BigInt(order.takerAmount);
      const makerGives = (remainingTaker * makerAmount) / takerAmount;

      // shares / cost for the trade record (taker perspective).
      const isSellOrder = order.side === "SELL";
      const shares = isSellOrder ? makerGives : remainingTaker;
      const cost = isSellOrder ? remainingTaker : makerGives;

      await fillTx.writeContractAsync({
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
          remainingTaker,
        ],
      });

      await jsonFetch(`/api/markets/${id}/fills`, {
        method: "POST",
        body: JSON.stringify({
          orderHash: order.hash,
          taker: account,
          shares: shares.toString(),
          cost: cost.toString(),
          takerFillAmount: remainingTaker.toString(),
          txHash: fillTx.data,
        }),
      });

      push({ title: "Order filled", variant: "success" });
      query.refetch();
    } catch (err) {
      push({ title: "Fill failed", description: (err as Error).message, variant: "danger" });
    }
  }

  async function placeOrder(args: {
    outcomeIndex: number;
    positionId: string;
    side: "BUY" | "SELL";
    priceStr: string;
    sharesStr: string;
  }) {
    if (!account) return;
    try {
      const price = Number(args.priceStr);
      if (!(price > 0) || price >= 1) {
        push({ title: "Price must be between 0 and 1", variant: "danger" });
        return;
      }
      const sharesRaw = parseUnits(args.sharesStr || "0", decimals);
      if (sharesRaw <= 0n) return;
      // collateral = shares * price (rounded).
      const collateralRaw = BigInt(Math.round(Number(sharesRaw) * price));
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
        description: "Your signed order is on the book.",
        variant: "success",
      });
      query.refetch();
    } catch (err) {
      push({ title: "Order failed", description: (err as Error).message, variant: "danger" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              resolved ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"
            }`}
          >
            {resolved ? "Resolved" : "Trading"}
          </span>
          <span className="text-xs text-muted-foreground">market #{market.id}</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold">{market.title}</h1>
        <p className="text-muted-foreground">{market.description}</p>
        {resolved && market.winningOutcome != null && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            Winning outcome: <b>{market.outcomes[market.winningOutcome]?.label}</b>
          </div>
        )}
      </div>

      {!account && (
        <div className="card p-4 text-sm text-muted-foreground">
          Sign in to trade, mint, or redeem shares.
        </div>
      )}

      {account && (
        <>
          <LowGasBanner />

          {/* Approvals + mint/redeem */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="card p-5 space-y-3">
              <h3 className="font-semibold text-sm">Approvals</h3>
              <p className="text-xs text-muted-foreground">
                Approve once before trading. Collateral approval covers buying +
                minting; share approval covers selling shares.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={approveCollateral}>
                  Approve {sym}
                </Button>
                <Button size="sm" variant="outline" onClick={approveShares}>
                  Approve shares
                </Button>
              </div>
            </section>

            <section className="card p-5 space-y-3">
              <h3 className="font-semibold text-sm">Mint / redeem a full set</h3>
              <p className="text-xs text-muted-foreground">
                Split {sym} into one share of every outcome (always redeemable for{" "}
                {sym} 1:1 by merging).
              </p>
              <div className="flex gap-2">
                <input
                  className="input font-mono"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={splitAmt}
                  onChange={(e) => setSplitAmt(e.target.value)}
                />
                <Button size="sm" onClick={doSplit}>
                  Split
                </Button>
              </div>
              <div className="flex gap-2">
                <input
                  className="input font-mono"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={mergeAmt}
                  onChange={(e) => setMergeAmt(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={doMerge}>
                  Merge
                </Button>
              </div>
              {resolved && (
                <Button size="sm" className="w-full" onClick={doRedeem}>
                  Redeem winning shares
                </Button>
              )}
            </section>
          </div>

          {/* Order books per outcome */}
          <div className="space-y-4">
            {market.outcomes.map((o) => {
              const book = data?.orderBook?.[o.index] ?? { buys: [], sells: [] };
              const myPos = positions[o.index]
                ? formatUnits(BigInt(positions[o.index]), decimals)
                : "0";
              return (
                <OutcomeBook
                  key={o.index}
                  label={o.label}
                  outcomeIndex={o.index}
                  positionId={o.positionId}
                  buys={book.buys}
                  sells={book.sells}
                  decimals={decimals}
                  sym={sym}
                  myPosition={myPos}
                  account={account}
                  resolved={resolved}
                  onFill={fillResting}
                  onPlace={placeOrder}
                />
              );
            })}
          </div>

          <section className="card p-5 text-xs text-muted-foreground space-y-1">
            <div>
              CTF: <span className="font-mono">{shortAddr(market.ctfAddress)}</span>
            </div>
            <div>
              Exchange: <span className="font-mono">{shortAddr(market.exchangeAddress)}</span>
            </div>
            <div>
              Settler: <span className="font-mono">{shortAddr(market.settler)}</span> · fee{" "}
              {(market.feeBps / 100).toFixed(2)}%
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function OutcomeBook({
  label,
  outcomeIndex,
  positionId,
  buys,
  sells,
  decimals,
  sym,
  myPosition,
  account,
  resolved,
  onFill,
  onPlace,
}: {
  label: string;
  outcomeIndex: number;
  positionId: string;
  buys: OrderRow[];
  sells: OrderRow[];
  decimals: number;
  sym: string;
  myPosition: string;
  account: string;
  resolved: boolean;
  onFill: (order: OrderRow) => void;
  onPlace: (args: {
    outcomeIndex: number;
    positionId: string;
    side: "BUY" | "SELL";
    priceStr: string;
    sharesStr: string;
  }) => void;
}) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [priceStr, setPriceStr] = useState("");
  const [sharesStr, setSharesStr] = useState("");

  function sharesOf(o: OrderRow): string {
    const remainingTaker = BigInt(o.takerAmount) - BigInt(o.filled);
    const makerAmount = BigInt(o.makerAmount);
    const takerAmount = BigInt(o.takerAmount);
    const shares =
      o.side === "SELL"
        ? (remainingTaker * makerAmount) / (takerAmount || 1n)
        : remainingTaker;
    return formatUnits(shares, decimals);
  }

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">
          Your position: <span className="font-mono">{myPosition}</span> shares
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BookSide
          title="Buy orders (bids)"
          orders={buys}
          decimals={decimals}
          account={account}
          actionLabel="Sell into"
          sharesOf={sharesOf}
          onFill={onFill}
          disabled={resolved}
        />
        <BookSide
          title="Sell orders (asks)"
          orders={sells}
          decimals={decimals}
          account={account}
          actionLabel="Buy"
          sharesOf={sharesOf}
          onFill={onFill}
          disabled={resolved}
        />
      </div>

      {!resolved && (
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setSide("BUY")}
              className={`rounded-md px-2 py-1 ${side === "BUY" ? "bg-success/15 text-success" : "text-muted-foreground"}`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setSide("SELL")}
              className={`rounded-md px-2 py-1 ${side === "SELL" ? "bg-danger/15 text-danger" : "text-muted-foreground"}`}
            >
              Sell
            </button>
            <span className="ml-auto self-center text-muted-foreground">
              Post a signed {side.toLowerCase()} order
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input font-mono"
              inputMode="decimal"
              placeholder={`Price (0–1) in ${sym}`}
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
            />
            <input
              className="input font-mono"
              inputMode="decimal"
              placeholder="Shares"
              value={sharesStr}
              onChange={(e) => setSharesStr(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              onPlace({ outcomeIndex, positionId, side, priceStr, sharesStr });
              setPriceStr("");
              setSharesStr("");
            }}
          >
            Post {side === "BUY" ? "bid" : "ask"}
          </Button>
        </div>
      )}
    </section>
  );
}

function BookSide({
  title,
  orders,
  decimals,
  account,
  actionLabel,
  sharesOf,
  onFill,
  disabled,
}: {
  title: string;
  orders: OrderRow[];
  decimals: number;
  account: string;
  actionLabel: string;
  sharesOf: (o: OrderRow) => string;
  onFill: (o: OrderRow) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="label">{title}</div>
      {orders.length === 0 && (
        <div className="text-xs text-muted-foreground">No resting orders.</div>
      )}
      {orders.map((o) => {
        const mine = o.maker.toLowerCase() === account.toLowerCase();
        return (
          <div
            key={o.hash}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
          >
            <span className="font-mono">
              {Number(o.price).toFixed(3)} · {sharesOf(o)} sh
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">{shortAddr(o.maker)}</span>
              {!mine && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onFill(o)}
                  className="rounded bg-[hsl(var(--primary))] px-2 py-0.5 font-medium text-white disabled:opacity-50"
                >
                  {actionLabel}
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
