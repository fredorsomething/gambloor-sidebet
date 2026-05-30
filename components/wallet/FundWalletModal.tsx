"use client";

import { useFundWallet as usePrivyFundWallet, usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { ArrowDownUp, ArrowUpRight, Check, Copy, CreditCard, Fuel, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { encodeFunctionData, isAddress, parseUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  useBalance,
  useReadContracts,
  useWaitForTransactionReceipt,
} from "wagmi";
import { polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { useToast } from "@/components/ui/Toast";
import { TxSuccessDialog } from "@/components/wallet/TxSuccessDialog";
import { ERC20_ABI } from "@/lib/abi";
import {
  getMarketCollateralToken,
  getTokenBySymbol,
  getTokens,
  MARKET_COLLATERAL_SYMBOL,
} from "@/lib/chains";
import { formatCryptoError } from "@/lib/cryptoErrors";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { logWalletNotification } from "@/lib/hooks/useNotifications";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { cn, formatToken, shortAddr } from "@/lib/utils";

type ModalMode = "fund" | "withdraw" | null;

type WalletFundsCtx = {
  /** @deprecated use openFund */
  open: () => void;
  openFund: () => void;
  openWithdraw: () => void;
  fundGas: () => Promise<void>;
  close: () => void;
  isOpen: boolean;
};

const Ctx = createContext<WalletFundsCtx | null>(null);

export function useWalletFunds() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useWalletFunds must be used within FundWalletProvider");
  }
  return ctx;
}

/** @deprecated use useWalletFunds */
export const useFundWallet = useWalletFunds;

export function FundWalletProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ModalMode>(null);
  const { address } = useAccount();
  const { fundWallet: privyFundWallet } = usePrivyFundWallet();
  const { push } = useToast();

  const close = useCallback(() => setMode(null), []);
  const openFund = useCallback(() => setMode("fund"), []);
  const openWithdraw = useCallback(() => setMode("withdraw"), []);

  const fundGas = useCallback(async () => {
    if (!address) return;
    try {
      await privyFundWallet({
        address,
        options: {
          chain: polygon,
          asset: "native-currency",
          amount: "1",
        },
      });
    } catch (err) {
      const raw = (err as Error)?.message ?? "";
      if (raw.toLowerCase().includes("closed")) return;
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Couldn't open funding",
      });
      push({ title, description, variant: "danger" });
    }
  }, [address, privyFundWallet, push]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, close]);

  const value = useMemo(
    () => ({
      open: openFund,
      openFund,
      openWithdraw,
      fundGas,
      close,
      isOpen: mode !== null,
    }),
    [openFund, openWithdraw, fundGas, close, mode],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {mode === "fund" && <FundWalletModal onClose={close} />}
      {mode === "withdraw" && <WithdrawWalletModal onClose={close} />}
    </Ctx.Provider>
  );
}

function FundWalletModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const { push } = useToast();
  const { getAccessToken } = usePrivy();
  const { fundWallet: privyFundWallet } = usePrivyFundWallet();
  const { data: balance } = useBalance({
    address,
    chainId: polygon.id,
    query: { enabled: !!address },
  });
  const nativeUsdc = getTokenBySymbol(polygon.id, "USDC")!;
  const marketUsdc = getMarketCollateralToken();
  const { data: stableBalances } = useReadContracts({
    allowFailure: true,
    contracts: address
      ? [
          {
            address: nativeUsdc.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
            chainId: polygon.id,
          },
          {
            address: marketUsdc.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
            chainId: polygon.id,
          },
        ]
      : [],
    query: { enabled: !!address },
  });
  const nativeUsdcBal =
    (stableBalances?.[0]?.result as bigint | undefined) ?? 0n;
  const usdceBal = (stableBalances?.[1]?.result as bigint | undefined) ?? 0n;
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<"usdc" | "pol" | null>(null);

  const onCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  async function onPrivyFund(asset: "USDC" | "native-currency", amount: string) {
    if (!address) return;
    setPending(asset === "USDC" ? "usdc" : "pol");
    try {
      await privyFundWallet({
        address,
        options: { chain: polygon, asset, amount },
      });
      const label = asset === "USDC" ? "USDC" : "POL";
      void logWalletNotification(
        getAccessToken,
        address,
        "deposit",
        "Deposit started",
        `You started a ${label} deposit via Privy. Funds may take a few minutes to arrive.`,
      );
      push({
        title: "Funding started",
        description: "Complete checkout in the Privy window. Funds may take a few minutes to arrive.",
        variant: "success",
      });
      onClose();
    } catch (err) {
      const raw = (err as Error)?.message ?? "";
      const lc = raw.toLowerCase();
      const userClosed =
        lc.includes("closed") || lc.includes("cancel") || lc.includes("exited");
      if (!userClosed) {
        console.error("Privy fundWallet failed", err);
        const { title, description } = formatCryptoError(err, {
          fallbackTitle: "Couldn't start funding",
        });
        push({ title, description, variant: "danger" });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md card p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add funds</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Prediction markets settle in{" "}
          <TokenSymbol symbol={MARKET_COLLATERAL_SYMBOL} size={12} /> (bridged).
          Privy card checkout deposits native USDC — swap to{" "}
          {MARKET_COLLATERAL_SYMBOL} before trading. POL covers gas.
        </p>

        {address && (
          <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Native USDC</span>
              <span className="font-mono tabular-nums">
                {formatToken(nativeUsdcBal, nativeUsdc.decimals)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-muted-foreground">
                {MARKET_COLLATERAL_SYMBOL} (markets)
              </span>
              <span className="font-mono tabular-nums text-primary">
                {formatToken(usdceBal, marketUsdc.decimals)}
              </span>
            </div>
            {nativeUsdcBal > usdceBal && nativeUsdcBal > 0n && (
              <Link
                href="/swap?sell=USDC&buy=USDC.e"
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <ArrowDownUp className="h-3 w-3" />
                Swap USDC → {MARKET_COLLATERAL_SYMBOL}
              </Link>
            )}
          </div>
        )}

        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Your wallet address
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-sm">
              {address ? shortAddr(address) : "—"}
            </code>
            <button
              onClick={onCopy}
              disabled={!address}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            POL balance:{" "}
            <span className="font-mono">
              {balance ? `${Number(balance.formatted).toFixed(4)} POL` : "—"}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Button
            className="w-full justify-start gap-3"
            onClick={() => onPrivyFund("USDC", "25")}
            disabled={!address || pending !== null}
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="text-left">
              <span className="block font-semibold">Buy / deposit USDC (native)</span>
              <span className="block text-xs font-normal opacity-80">
                Card or transfer — then swap to {MARKET_COLLATERAL_SYMBOL} for
                markets
              </span>
            </span>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={() => onPrivyFund("native-currency", "1")}
            disabled={!address || pending !== null}
          >
            <Fuel className="h-4 w-4 shrink-0" />
            <span className="text-left">
              <span className="block font-semibold">
                {pending === "pol" ? "Opening…" : "Top up POL (gas)"}
              </span>
              <span className="block text-xs font-normal opacity-80">
                Recommended ~1 POL for many transactions
              </span>
            </span>
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Or send {MARKET_COLLATERAL_SYMBOL} (contract{" "}
          <span className="font-mono">{shortAddr(marketUsdc.address)}</span>) or
          POL directly to your address. Use the swap page to convert native USDC
          ↔ {MARKET_COLLATERAL_SYMBOL}.
        </p>
      </div>
    </div>
  );
}

const WITHDRAW_ASSETS = () => {
  const stables = getTokens()
    .filter((t) =>
      ["USDC.e", "USDC", "pUSD"].includes(t.symbol),
    )
    .map((t) => ({
      symbol: t.symbol,
      decimals: t.decimals,
      address: t.address as Address,
    }));
  return [...stables, { symbol: "POL", decimals: 18, address: undefined as Address | undefined }];
};

function WithdrawWalletModal({ onClose }: { onClose: () => void }) {
  const { address: from } = useAccount();
  const { push } = useToast();
  const { getAccessToken } = usePrivy();
  const ensurePolygon = useEnsurePolygon();
  const options = useMemo(() => WITHDRAW_ASSETS(), []);

  const [symbol, setSymbol] = useState(options[0]?.symbol ?? "USDC");
  const asset = options.find((o) => o.symbol === symbol) ?? options[0];
  const isPol = symbol === "POL";
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const info = useTokenInfo({
    token: asset?.address,
    owner: from,
  });
  const native = useBalance({
    address: from,
    chainId: polygon.id,
    query: { enabled: !!from && isPol },
  });
  const balance = isPol ? native.data?.value ?? 0n : info.balance ?? 0n;
  const decimals = asset?.decimals ?? 6;

  const { sendTx } = useTxSender();
  const [txHash, setTxHash] = useState<Hex>();
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const wait = useWaitForTransactionReceipt({ hash: txHash });

  const toValid = isAddress(to.trim());
  let amountWei = 0n;
  let parseError: string | null = null;
  try {
    amountWei = amount.trim() ? parseUnits(amount.trim(), decimals) : 0n;
  } catch {
    parseError = "Enter a valid amount";
  }
  const overBalance = amountWei > balance;
  const canSend =
    !!from &&
    !!asset &&
    toValid &&
    amountWei > 0n &&
    !overBalance &&
    !parseError &&
    !sending &&
    !wait.isLoading;

  useEffect(() => {
    if (!wait.isSuccess || confirmed) return;
    setConfirmed(true);
    if (from) {
      void logWalletNotification(
        getAccessToken,
        from,
        "withdrawal",
        "Withdrawal sent",
        `You withdrew ${amount} ${symbol}.`,
      );
    }
  }, [wait.isSuccess, confirmed, from, getAccessToken, amount, symbol]);

  if (confirmed && txHash) {
    return (
      <TxSuccessDialog
        title="Withdrawal sent!"
        description={`Sent ${amount} ${symbol} to ${shortAddr(to.trim())}.`}
        txHash={txHash}
        chainId={polygon.id}
        onClose={onClose}
      />
    );
  }

  function setMax() {
    if (isPol) {
      // Leave a little POL for gas if withdrawing native.
      const reserve = parseUnits("0.01", 18);
      const max = balance > reserve ? balance - reserve : 0n;
      setAmount(formatToken(max, decimals, 6));
      return;
    }
    setAmount(formatToken(balance, decimals, 6));
  }

  async function onSend() {
    if (!asset || !from || !toValid) return;
    const dest = to.trim() as Address;
    setSending(true);
    try {
      // Make sure the (embedded) wallet is on Polygon before sending, otherwise
      // the transfer targets the wrong network and silently fails.
      await ensurePolygon();
      let hash: Hex;
      if (isPol) {
        hash = await sendTx({ to: dest, value: amountWei });
      } else {
        hash = await sendTx({
          to: asset.address as Address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [dest, amountWei],
          }),
        });
      }
      setTxHash(hash);
      push({ title: "Withdrawal submitted", description: "Waiting for confirmation…" });
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Withdrawal failed",
      });
      push({ title, description, variant: "danger" });
    } finally {
      setSending(false);
    }
  }

  const pending = sending || wait.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md card p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Withdraw</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Send funds from your wallet to an external address on Polygon. You&apos;ll
          confirm the transaction with Privy.
        </p>

        <div className="mt-5 flex gap-2">
          {options.map((o) => (
            <button
              key={o.symbol}
              type="button"
              onClick={() => setSymbol(o.symbol)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                symbol === o.symbol
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/60",
              )}
            >
              <TokenSymbol symbol={o.symbol} />
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="withdraw-to">
            Destination address
          </label>
          <input
            id="withdraw-to"
            className={cn(
              "input mt-1.5 font-mono text-sm",
              to.trim() && !toValid && "border-danger focus:ring-danger/40",
            )}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
          />
          {to.trim() && !toValid && (
            <p className="mt-1.5 text-xs text-danger">Enter a valid Polygon address.</p>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="withdraw-amount">
              Amount
            </label>
            <button
              type="button"
              onClick={setMax}
              className="text-xs font-medium text-primary hover:underline"
            >
              Max
            </button>
          </div>
          <input
            id="withdraw-amount"
            inputMode="decimal"
            className="input mt-1.5"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Balance: {formatToken(balance, decimals, 4)} {symbol}
          </p>
          {overBalance && (
            <p className="mt-1 text-xs text-danger">Amount exceeds your balance.</p>
          )}
          {!isPol && balance > 0n && (
            <p className="mt-1 text-xs text-muted-foreground">
              ERC-20 transfers require a small amount of POL for gas.
            </p>
          )}
        </div>

        <Button className="mt-5 w-full gap-2" onClick={onSend} disabled={!canSend}>
          <ArrowUpRight className="h-4 w-4" />
          {pending
            ? "Sending…"
            : amountWei > 0n && toValid
              ? `Withdraw ${amount} ${symbol}`
              : "Enter address and amount"}
        </Button>

        {txHash && wait.isLoading && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Waiting for confirmation…
          </p>
        )}
      </div>
    </div>
  );
}

/** Slim inline prompt shown on tx pages when the wallet has no POL for gas. */
export function LowGasBanner({ className }: { className?: string }) {
  const { address, isConnected } = useAccount();
  const { fundGas } = useWalletFunds();
  const { data: balance } = useBalance({
    address,
    chainId: polygon.id,
    query: { enabled: !!address },
  });

  if (!isConnected || !address) return null;
  if (!balance || balance.value > 0n) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm",
        className,
      )}
    >
      <div>
        <div className="font-medium">No POL for gas</div>
        <p className="text-muted-foreground">
          On-chain actions need a little POL for gas. Top up via Privy to
          continue.
        </p>
      </div>
      <Button size="sm" onClick={() => void fundGas()}>
        Top up gas
      </Button>
    </div>
  );
}
