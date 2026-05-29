"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ArrowDownUp, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatUnits,
  maxUint256,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI } from "@/lib/abi";
import { explorerTx } from "@/lib/chains";
import { jsonFetch } from "@/lib/fetcher";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import {
  COLLATERAL_OFFRAMP,
  COLLATERAL_ONRAMP,
  isWrapDirection,
  isWrapPair,
  usdceAddress,
  WRAP_ABI,
} from "@/lib/pusdWrap";
import { formatToken } from "@/lib/utils";
import {
  getSwapAsset,
  SWAP_ASSETS,
  type SwapAssetSymbol,
  type ZeroXPriceResponse,
  type ZeroXQuoteResponse,
} from "@/lib/zerox";

const SLIPPAGE_BPS = 100;

export function SwapPanel() {
  const { authenticated, login } = usePrivy();
  const { address } = useAccount();
  const { push } = useToast();
  const ensurePolygon = useEnsurePolygon();

  const [sellSymbol, setSellSymbol] = useState<SwapAssetSymbol>("USDC.e");
  const [buySymbol, setBuySymbol] = useState<SwapAssetSymbol>("pUSD");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState<ZeroXPriceResponse | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<Hex | undefined>();

  const sellAsset = getSwapAsset(sellSymbol)!;
  const buyAsset = getSwapAsset(buySymbol)!;
  const wrapMode = isWrapPair(sellSymbol, buySymbol);
  const wrapping = isWrapDirection(sellSymbol, buySymbol);

  const sellAmountWei = useMemo(() => {
    try {
      return amount.trim()
        ? parseUnits(amount.trim(), sellAsset.decimals)
        : 0n;
    } catch {
      return 0n;
    }
  }, [amount, sellAsset.decimals]);

  const balance = useTokenBalance(address, sellAsset);
  const sendTx = useSendTransaction();
  const approveTx = useWriteContract();
  const wrapTx = useWriteContract();
  const waitTx = useWaitForTransactionReceipt({ hash: txHash });

  const flip = () => {
    setSellSymbol(buySymbol);
    setBuySymbol(sellSymbol);
    setPrice(null);
  };

  const fetchPrice = useCallback(async () => {
    if (!address || sellAmountWei <= 0n || wrapMode) {
      setPrice(null);
      return;
    }
    if (sellSymbol === buySymbol) {
      setPrice(null);
      return;
    }
    setPriceLoading(true);
    try {
      const q = new URLSearchParams({
        mode: "price",
        sellToken: sellAsset.zeroxAddress,
        buyToken: buyAsset.zeroxAddress,
        sellAmount: sellAmountWei.toString(),
        taker: address,
        slippageBps: String(SLIPPAGE_BPS),
      });
      const data = await jsonFetch<ZeroXPriceResponse>(
        `/api/swap/quote?${q}`,
      );
      setPrice(data);
    } catch (err) {
      setPrice(null);
      push({
        title: "Could not load quote",
        description: (err as Error).message,
        variant: "danger",
      });
    } finally {
      setPriceLoading(false);
    }
  }, [
    address,
    sellAmountWei,
    wrapMode,
    sellSymbol,
    buySymbol,
    sellAsset.zeroxAddress,
    buyAsset.zeroxAddress,
    push,
  ]);

  useEffect(() => {
    const t = setTimeout(() => void fetchPrice(), 400);
    return () => clearTimeout(t);
  }, [fetchPrice]);

  useEffect(() => {
    if (waitTx.isSuccess) {
      push({ title: "Transaction confirmed", variant: "success" });
      setAmount("");
      setPrice(null);
      setTxHash(undefined);
    }
  }, [waitTx.isSuccess, push]);

  async function ensureApproval(
    token: Address,
    spender: Address,
    needed: bigint,
  ) {
    if (!address) return;
    const allowance = await readAllowance(token, spender, address);
    if (allowance >= needed) return;
    await approveTx.writeContractAsync({
      chainId: polygon.id,
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, maxUint256],
    });
  }

  async function executeWrap() {
    if (!address || sellAmountWei <= 0n) return;
    await ensurePolygon();
    const usdce = usdceAddress();
    if (wrapping) {
      await ensureApproval(usdce, COLLATERAL_ONRAMP, sellAmountWei);
      const hash = await wrapTx.writeContractAsync({
        chainId: polygon.id,
        address: COLLATERAL_ONRAMP,
        abi: WRAP_ABI,
        functionName: "wrap",
        args: [usdce, address, sellAmountWei],
      });
      setTxHash(hash);
    } else {
      await ensureApproval(sellAsset.address!, COLLATERAL_OFFRAMP, sellAmountWei);
      const hash = await wrapTx.writeContractAsync({
        chainId: polygon.id,
        address: COLLATERAL_OFFRAMP,
        abi: WRAP_ABI,
        functionName: "unwrap",
        args: [usdce, address, sellAmountWei],
      });
      setTxHash(hash);
    }
    push({
      title: wrapping ? "Wrapping to pUSD" : "Unwrapping to USDC.e",
      description: "Waiting for confirmation…",
    });
  }

  async function executeSwap() {
    if (!address || sellAmountWei <= 0n) return;
    await ensurePolygon();

    const q = new URLSearchParams({
      mode: "quote",
      sellToken: sellAsset.zeroxAddress,
      buyToken: buyAsset.zeroxAddress,
      sellAmount: sellAmountWei.toString(),
      taker: address,
      slippageBps: String(SLIPPAGE_BPS),
    });
    const quote = await jsonFetch<ZeroXQuoteResponse>(`/api/swap/quote?${q}`);

    if (quote.liquidityAvailable === false) {
      throw new Error("Not enough liquidity for this trade");
    }

    const spender = quote.issues?.allowance?.spender as Address | undefined;
    if (spender && sellAsset.address) {
      await ensureApproval(sellAsset.address, spender, sellAmountWei);
    }

    const hash = await sendTx.sendTransactionAsync({
      chainId: polygon.id,
      to: quote.transaction.to as Address,
      data: quote.transaction.data as Hex,
      value: BigInt(quote.transaction.value || "0"),
    });
    setTxHash(hash);
    push({ title: "Swap submitted", description: "Waiting for confirmation…" });
  }

  async function onSubmit() {
    if (!authenticated) {
      void login();
      return;
    }
    if (!address) return;
    if (sellAmountWei <= 0n) {
      push({ title: "Enter an amount", variant: "danger" });
      return;
    }
    if (sellAmountWei > balance) {
      push({ title: "Insufficient balance", variant: "danger" });
      return;
    }
    if (sellSymbol === buySymbol) {
      push({ title: "Choose different tokens", variant: "danger" });
      return;
    }

    setSubmitting(true);
    try {
      if (wrapMode) await executeWrap();
      else await executeSwap();
    } catch (err) {
      const msg = (err as Error).message || "Transaction failed";
      push({
        title: msg.toLowerCase().includes("reject")
          ? "Transaction rejected"
          : "Swap failed",
        description: msg,
        variant: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const buyDisplay = wrapMode
    ? amount
    : price
      ? formatUnits(BigInt(price.buyAmount), buyAsset.decimals)
      : null;

  const pending =
    submitting ||
    sendTx.isPending ||
    approveTx.isPending ||
    wrapTx.isPending ||
    waitTx.isLoading;

  let actionLabel = "Swap";
  if (wrapMode) actionLabel = wrapping ? "Wrap to pUSD" : "Unwrap to USDC.e";
  else if (sellSymbol === "POL") actionLabel = "Swap POL";
  else actionLabel = `Swap ${sellSymbol}`;

  return (
    <div className="card mx-auto max-w-md p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Swap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Exchange USDC.e, pUSD, USDC, and POL on Polygon. USDC.e ↔ pUSD wraps
          1:1 via Polymarket; other pairs route through 0x.
        </p>
      </div>

      {/* Sell */}
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>You pay</span>
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() =>
              setAmount(formatUnits(balance, sellAsset.decimals))
            }
          >
            Balance: {formatToken(balance, sellAsset.decimals, 4)}{" "}
            {sellSymbol}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            className="input min-w-0 flex-1 font-mono text-lg"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) =>
              setAmount(e.target.value.replace(/[^0-9.]/g, ""))
            }
          />
          <AssetSelect
            value={sellSymbol}
            onChange={(s) => {
              setSellSymbol(s);
              setPrice(null);
            }}
            exclude={buySymbol}
          />
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={flip}
          className="rounded-full border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Flip tokens"
        >
          <ArrowDownUp className="h-4 w-4" />
        </button>
      </div>

      {/* Buy */}
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="mb-2 text-xs text-muted-foreground">You receive</div>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 font-mono text-lg text-foreground">
            {priceLoading && !wrapMode ? (
              <span className="text-muted-foreground">…</span>
            ) : buyDisplay ? (
              Number(buyDisplay).toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <AssetSelect
            value={buySymbol}
            onChange={(s) => {
              setBuySymbol(s);
              setPrice(null);
            }}
            exclude={sellSymbol}
          />
        </div>
        {wrapMode && (
          <p className="mt-2 text-xs text-success">
            1:1 wrap — no slippage (Polymarket onramp)
          </p>
        )}
        {!wrapMode && price?.minBuyAmount && (
          <p className="mt-2 text-xs text-muted-foreground">
            Min received:{" "}
            {formatToken(
              BigInt(price.minBuyAmount),
              buyAsset.decimals,
              4,
            )}{" "}
            {buySymbol}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="shrink-0"
          disabled={priceLoading || wrapMode}
          onClick={() => void fetchPrice()}
        >
          <RefreshCw
            className={`h-4 w-4 ${priceLoading ? "animate-spin" : ""}`}
          />
        </Button>
        <Button
          className="flex-1"
          disabled={
            pending ||
            sellAmountWei <= 0n ||
            sellSymbol === buySymbol ||
            (!wrapMode && !price && sellAmountWei > 0n)
          }
          onClick={onSubmit}
        >
          {pending ? "Working…" : authenticated ? actionLabel : "Sign in to swap"}
        </Button>
      </div>

      {txHash && (
        <a
          href={explorerTx(polygon.id, txHash)}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          View transaction
        </a>
      )}
    </div>
  );
}

function AssetSelect({
  value,
  onChange,
  exclude,
}: {
  value: SwapAssetSymbol;
  onChange: (s: SwapAssetSymbol) => void;
  exclude: SwapAssetSymbol;
}) {
  return (
    <select
      className="select w-[7.5rem] shrink-0 py-2.5 text-sm font-medium"
      value={value}
      onChange={(e) => onChange(e.target.value as SwapAssetSymbol)}
    >
      {SWAP_ASSETS.filter((a) => a.symbol !== exclude).map((a) => (
        <option key={a.symbol} value={a.symbol}>
          {a.symbol}
        </option>
      ))}
    </select>
  );
}

function useTokenBalance(
  owner: string | undefined,
  asset: ReturnType<typeof getSwapAsset>,
) {
  const isPol = asset?.symbol === "POL";
  const native = useBalance({
    address: owner as Address | undefined,
    chainId: polygon.id,
    query: { enabled: !!owner && isPol },
  });
  const erc20 = useReadContract({
    address: asset?.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: owner ? [owner as Address] : undefined,
    chainId: polygon.id,
    query: { enabled: !!owner && !!asset?.address && !isPol },
  });
  if (!asset) return 0n;
  if (isPol) return native.data?.value ?? 0n;
  return (erc20.data as bigint | undefined) ?? 0n;
}

async function readAllowance(
  token: Address,
  spender: Address,
  owner: Address,
): Promise<bigint> {
  const { createPublicClient, http } = await import("viem");
  const { polygon } = await import("wagmi/chains");
  const rpc =
    process.env.NEXT_PUBLIC_POLYGON_RPC ||
    "https://polygon-bor-rpc.publicnode.com";
  const client = createPublicClient({ chain: polygon, transport: http(rpc) });
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  });
}
