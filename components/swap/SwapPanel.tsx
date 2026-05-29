"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ArrowDownUp, ChevronDown, RefreshCw } from "lucide-react";
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
import { TokenIcon } from "@/components/ui/TokenIcon";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
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
    const hash = await approveTx.writeContractAsync({
      chainId: polygon.id,
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, maxUint256],
    });
    // Embedded (managed) wallets auto-sign without a prompt, so the approval and
    // the swap fire back-to-back. We must wait for the approval to be mined —
    // otherwise the swap's gas estimation runs against a 0 allowance, reverts,
    // and the whole thing fails silently. Block until the new allowance lands.
    await waitForApproval(token, spender, address, needed, hash);
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
      // Use 0x's gas estimate so we don't rely on the embedded wallet's own
      // eth_estimateGas, which can be flaky and stall the auto-signed tx.
      gas: quote.transaction.gas ? BigInt(quote.transaction.gas) : undefined,
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
    <div className="card mx-auto max-w-md overflow-hidden p-0">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold">Swap</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          USDC.e, pUSD, USDC &amp; POL on Polygon
        </p>
      </div>

      <div className="space-y-1 p-4">
        <div className="rounded-xl bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">You pay</span>
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() =>
                setAmount(formatUnits(balance, sellAsset.decimals))
              }
            >
              Max · {formatToken(balance, sellAsset.decimals, 4)}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-semibold outline-none placeholder:text-muted-foreground/50"
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

        <div className="relative z-10 -my-3 flex justify-center">
          <button
            type="button"
            onClick={flip}
            className="rounded-full border border-border bg-card p-2.5 shadow-sm transition-colors hover:bg-muted"
            aria-label="Flip tokens"
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl bg-muted/30 p-3">
          <div className="mb-2 text-xs text-muted-foreground">You receive</div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 font-mono text-2xl font-semibold">
              {priceLoading && !wrapMode ? (
                <span className="text-muted-foreground">…</span>
              ) : buyDisplay ? (
                Number(buyDisplay).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })
              ) : (
                <span className="text-muted-foreground">0</span>
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
            <p className="mt-2 text-[11px] text-success">1:1 · no slippage</p>
          )}
          {!wrapMode && price?.minBuyAmount && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Min{" "}
              {formatToken(BigInt(price.minBuyAmount), buyAsset.decimals, 4)}{" "}
              {buySymbol}
            </p>
          )}
        </div>

        <Button
          className="mt-3 w-full"
          size="lg"
          disabled={
            pending ||
            sellAmountWei <= 0n ||
            sellSymbol === buySymbol ||
            (!wrapMode && !price && sellAmountWei > 0n)
          }
          onClick={onSubmit}
        >
          {pending ? (
            "Working…"
          ) : (
            <span className="inline-flex items-center gap-2">
              {!wrapMode && priceLoading && (
                <RefreshCw className="h-4 w-4 animate-spin" />
              )}
              {authenticated ? actionLabel : "Sign in to swap"}
            </span>
          )}
        </Button>
      </div>

      {txHash && (
        <a
          href={explorerTx(polygon.id, txHash)}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-border py-3 text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
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
  const options = SWAP_ASSETS.filter((a) => a.symbol !== exclude);
  return (
    <div className="relative shrink-0">
      <div className="pointer-events-none flex items-center gap-2 rounded-xl border border-border bg-card py-2 pl-2.5 pr-8">
        <TokenIcon symbol={value} size={24} />
        <span className="text-sm font-semibold">{value}</span>
      </div>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <select
        className={cn(
          "absolute inset-0 cursor-pointer opacity-0",
          "w-full appearance-none",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value as SwapAssetSymbol)}
        aria-label={`Select token, current ${value}`}
      >
        {options.map((a) => (
          <option key={a.symbol} value={a.symbol}>
            {a.symbol}
          </option>
        ))}
      </select>
    </div>
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

async function getPublicClient() {
  const { createPublicClient, http } = await import("viem");
  const { polygon } = await import("wagmi/chains");
  const rpc =
    process.env.NEXT_PUBLIC_POLYGON_RPC ||
    "https://polygon-bor-rpc.publicnode.com";
  return createPublicClient({ chain: polygon, transport: http(rpc) });
}

async function readAllowance(
  token: Address,
  spender: Address,
  owner: Address,
): Promise<bigint> {
  const client = await getPublicClient();
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  });
}

/**
 * Wait until an ERC-20 approval is effective: confirm the receipt, then poll the
 * allowance until it covers `needed`. Embedded wallets sign instantly, so this
 * guards the follow-up swap from racing an unmined approval.
 */
async function waitForApproval(
  token: Address,
  spender: Address,
  owner: Address,
  needed: bigint,
  hash: Hex,
): Promise<void> {
  const client = await getPublicClient();
  try {
    await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  } catch {
    /* fall through to allowance polling */
  }
  for (let i = 0; i < 30; i++) {
    const allowance = await client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    });
    if (allowance >= needed) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Approval did not confirm in time. Please try again.");
}
