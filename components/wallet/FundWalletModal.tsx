"use client";

import {
  useDepositAddress,
  useFiatOnramp,
  usePrivy,
} from "@privy-io/react-auth";
import Link from "next/link";
import {
  ArrowDownUp,
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  Wallet,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { encodeFunctionData, isAddress, parseUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  useBalance,
  useWaitForTransactionReceipt,
} from "wagmi";
import { mainnet, polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import { useToast } from "@/components/ui/Toast";
import { PolygonFundingNotice } from "@/components/wallet/PolygonFundingNotice";
import { WalletChainBalances } from "@/components/wallet/WalletChainBalances";
import { TxSuccessDialog } from "@/components/wallet/TxSuccessDialog";
import { ERC20_ABI } from "@/lib/abi";
import {
  CHAIN_LABELS,
  ETHEREUM_CHAIN_ID,
  getTokenBySymbol,
  getAllWithdrawAssets,
  MARKET_COLLATERAL_SYMBOL,
  POLYGON_CHAIN_ID,
  withdrawAssetKey,
  type WithdrawAsset,
} from "@/lib/chains";
import { formatCryptoError } from "@/lib/cryptoErrors";
import { useEnsureChain } from "@/lib/hooks/useEnsureChain";
import { useWalletStableBalances } from "@/lib/hooks/useWalletStableBalances";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { logWalletNotification } from "@/lib/hooks/useNotifications";
import { cn, formatToken, shortAddr } from "@/lib/utils";

type ModalMode = "fund" | "withdraw" | null;

type WalletFundsCtx = {
  /** @deprecated use openFund */
  open: () => void;
  openFund: () => void;
  openWithdraw: () => void;
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

const POLYGON_CAIP2 = `eip155:${polygon.id}` as const;

function isUserDismissedFundingError(err: unknown): boolean {
  const lc = ((err as Error)?.message ?? "").toLowerCase();
  return (
    lc.includes("closed") ||
    lc.includes("cancel") ||
    lc.includes("exited") ||
    lc.includes("dismiss")
  );
}

export function FundWalletProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ModalMode>(null);

  const close = useCallback(() => setMode(null), []);
  const openFund = useCallback(() => setMode("fund"), []);
  const openWithdraw = useCallback(() => setMode("withdraw"), []);

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
      close,
      isOpen: mode !== null,
    }),
    [openFund, openWithdraw, close, mode],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {mode === "fund" && <FundWalletModal onClose={close} />}
      {mode === "withdraw" && <WithdrawWalletModal onClose={close} />}
    </Ctx.Provider>
  );
}

function WalletFundsModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center md:items-center md:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-funds-modal-title"
        className="relative flex w-full max-h-[min(90dvh,100%)] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl md:max-h-[min(85dvh,720px)] md:max-w-2xl md:rounded-2xl md:animate-in md:fade-in md:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 md:px-5">
          <h2 id="wallet-funds-modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-5 md:pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function FundWalletModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const { push } = useToast();
  const { getAccessToken } = usePrivy();
  const { fund: startFiatOnramp } = useFiatOnramp();
  const { createDepositAddress } = useDepositAddress();
  const polygonUsdc = getTokenBySymbol(polygon.id, "USDC");
  const polygonPusd = getTokenBySymbol(polygon.id, "pUSD");

  const { balanceBySymbol, chainGroups, multipleWallets } =
    useWalletStableBalances();

  const [copied, setCopied] = useState(false);
  const [onrampPending, setOnrampPending] = useState(false);
  const [depositAddressPending, setDepositAddressPending] = useState(false);
  const fundingBusy = onrampPending || depositAddressPending;

  const nativeUsdcBal = balanceBySymbol.get("USDC") ?? 0n;
  const pusdBal = balanceBySymbol.get("pUSD") ?? 0n;

  const onCopyAddress = useCallback(() => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    push({ title: "Address copied", variant: "success" });
    setTimeout(() => setCopied(false), 1500);
  }, [address, push]);

  async function onBuyWithCard() {
    if (!address) return;
    setOnrampPending(true);
    try {
      const result = await startFiatOnramp({
        source: {
          assets: ["usd", "eur", "gbp"],
          defaultAsset: "usd",
        },
        destination: {
          asset: "usdc",
          chain: POLYGON_CAIP2,
          address,
        },
        environment: "production",
        defaultAmount: "25",
      });

      void logWalletNotification(
        getAccessToken,
        address,
        "deposit",
        result.status === "confirmed" ? "Deposit confirmed" : "Deposit started",
        result.status === "confirmed"
          ? "Your USDC purchase was confirmed."
          : "You started a USDC purchase — funds may take a few minutes to arrive.",
      );
      push({
        title:
          result.status === "confirmed" ? "Purchase confirmed" : "Purchase started",
        description:
          result.status === "confirmed"
            ? "USDC should appear in your wallet shortly."
            : "Complete checkout in the Privy window. Funds may take a few minutes.",
        variant: "success",
      });
      onClose();
    } catch (err) {
      if (!isUserDismissedFundingError(err)) {
        console.error("Privy fiat onramp failed", err);
        const { title, description } = formatCryptoError(err, {
          fallbackTitle: "Couldn't start checkout",
        });
        push({ title, description, variant: "danger" });
      }
    } finally {
      setOnrampPending(false);
    }
  }

  async function onDepositFromExternalWallet() {
    if (!address || !polygonUsdc) return;
    setDepositAddressPending(true);
    try {
      await createDepositAddress({
        destinationChain: POLYGON_CAIP2,
        destinationCurrency: polygonUsdc.address,
        destinationAddress: address,
      });
      void logWalletNotification(
        getAccessToken,
        address,
        "deposit",
        "Deposit started",
        "Send crypto to your Privy deposit address — funds will arrive in your wallet.",
      );
      onClose();
    } catch (err) {
      if (!isUserDismissedFundingError(err)) {
        console.error("Privy deposit address flow failed", err);
        const { title, description } = formatCryptoError(err, {
          fallbackTitle: "Couldn't open deposit flow",
        });
        push({ title, description, variant: "danger" });
      }
    } finally {
      setDepositAddressPending(false);
    }
  }

  return (
    <WalletFundsModalShell title="Add funds" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-5">
        <div className="space-y-3">
          {address ? (
            <>
              <Button
                className="h-auto w-full justify-start gap-2.5 py-2.5"
                onClick={() => void onBuyWithCard()}
                disabled={fundingBusy}
              >
                <CreditCard className="h-5 w-5 shrink-0" />
                <span className="text-left">
                  <span className="block font-semibold">
                    {onrampPending ? "Opening…" : "Buy with card"}
                  </span>
                  <span className="block text-xs font-normal opacity-80">
                    Debit, credit, Apple Pay & more
                  </span>
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto w-full justify-start gap-2.5 py-2.5"
                onClick={() => void onDepositFromExternalWallet()}
                disabled={fundingBusy || !polygonUsdc}
              >
                <Wallet className="h-5 w-5 shrink-0" />
                <span className="text-left">
                  <span className="block font-semibold">
                    {depositAddressPending
                      ? "Opening…"
                      : "Deposit from another wallet"}
                  </span>
                  <span className="block text-xs font-normal opacity-80">
                    Any chain — Privy bridges to your wallet
                  </span>
                </span>
              </Button>

              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <TokenIcon symbol="POL" size={16} />
                  Polygon wallet address
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-sm">
                    {shortAddr(address)}
                  </code>
                  <button
                    type="button"
                    onClick={onCopyAddress}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <PolygonFundingNotice compact />

              <p className="text-xs text-muted-foreground">
                To bet on markets, keep{" "}
                <TokenSymbol symbol={MARKET_COLLATERAL_SYMBOL} size={12} /> and a
                little <TokenSymbol symbol="POL" size={12} /> for gas.
              </p>

              {(nativeUsdcBal > 0n || pusdBal > 0n) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {nativeUsdcBal > 0n && (
                    <Link
                      href="/swap?sell=USDC&buy=USDC.e"
                      onClick={onClose}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ArrowDownUp className="h-3 w-3" />
                      Swap USDC → {MARKET_COLLATERAL_SYMBOL}
                    </Link>
                  )}
                  {pusdBal > 0n && polygonPusd && (
                    <Link
                      href="/swap?sell=pUSD&buy=USDC.e"
                      onClick={onClose}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ArrowDownUp className="h-3 w-3" />
                      Swap pUSD → {MARKET_COLLATERAL_SYMBOL}
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect a wallet to add funds.
            </p>
          )}
        </div>

        <div className="space-y-2 md:min-w-0">
          <div>
            <p className="text-sm font-medium">Your balances</p>
            {multipleWallets && (
              <p className="text-xs text-muted-foreground">
                Includes every wallet linked to your account.
              </p>
            )}
          </div>
          <WalletChainBalances
            chainGroups={chainGroups}
            compact
            showBridgeNotice={false}
            emptyMessage="No balances yet."
          />
        </div>
      </div>
    </WalletFundsModalShell>
  );
}

function withdrawBalanceForAsset(
  asset: WithdrawAsset,
  balanceBySymbol: Map<string, bigint>,
  ethereumUsdcRaw: bigint,
  ethereumEthRaw: bigint,
): bigint {
  if (asset.chainId === ETHEREUM_CHAIN_ID) {
    if (asset.symbol === "USDC") return ethereumUsdcRaw;
    if (asset.symbol === "ETH") return ethereumEthRaw;
    return 0n;
  }
  if (asset.symbol === "POL") return balanceBySymbol.get("POL") ?? 0n;
  return balanceBySymbol.get(asset.symbol) ?? 0n;
}

function isNativeWithdrawAsset(asset: WithdrawAsset): boolean {
  return !asset.address;
}

function WithdrawAssetSection({
  chainId,
  label,
  assets,
  selectedKey,
  from,
  onSelect,
  balanceBySymbol,
  ethereumUsdcRaw,
  ethereumEthRaw,
}: {
  chainId: number;
  label: string;
  assets: WithdrawAsset[];
  selectedKey: string;
  from?: string;
  onSelect: (key: string) => void;
  balanceBySymbol: Map<string, bigint>;
  ethereumUsdcRaw: bigint;
  ethereumEthRaw: bigint;
}) {
  const sectionAssets = assets.filter((a) => a.chainId === chainId);
  if (sectionAssets.length === 0) return null;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {chainId === POLYGON_CHAIN_ID && <TokenIcon symbol="POL" size={14} />}
        {chainId === ETHEREUM_CHAIN_ID && <TokenIcon symbol="ETH" size={14} />}
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sectionAssets.map((o) => {
          const key = withdrawAssetKey(o);
          const optBal = withdrawBalanceForAsset(
            o,
            balanceBySymbol,
            ethereumUsdcRaw,
            ethereumEthRaw,
          );
          const displaySymbol =
            o.chainId === ETHEREUM_CHAIN_ID && o.symbol === "USDC"
              ? "USDC"
              : o.symbol;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors",
                selectedKey === key
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/60",
              )}
            >
              <TokenIcon symbol={displaySymbol} size={20} />
              {displaySymbol}
              {from && (
                <span className="font-mono text-[10px] font-normal tabular-nums opacity-80">
                  {formatToken(optBal, o.decimals, 4)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WithdrawWalletModal({ onClose }: { onClose: () => void }) {
  const { address: from } = useAccount();
  const { push } = useToast();
  const { getAccessToken } = usePrivy();
  const options = useMemo(() => getAllWithdrawAssets(), []);
  const defaultKey = withdrawAssetKey(
    options.find((o) => o.symbol === MARKET_COLLATERAL_SYMBOL) ?? options[0]!,
  );

  const [selectedKey, setSelectedKey] = useState(defaultKey);
  const asset =
    options.find((o) => withdrawAssetKey(o) === selectedKey) ?? options[0];
  const chainId = asset?.chainId ?? POLYGON_CHAIN_ID;
  const receiptChainId =
    chainId === ETHEREUM_CHAIN_ID ? mainnet.id : polygon.id;
  const ensureChain = useEnsureChain(chainId);
  const symbol = asset?.symbol ?? "USDC.e";
  const isNative = asset ? isNativeWithdrawAsset(asset) : false;

  const {
    balanceBySymbol,
    ethereumUsdcRaw,
    ethereumEthRaw,
    hasEthereumBalances,
  } = useWalletStableBalances();

  const balance = asset
    ? withdrawBalanceForAsset(
        asset,
        balanceBySymbol,
        ethereumUsdcRaw,
        ethereumEthRaw,
      )
    : 0n;
  const decimals = asset?.decimals ?? 6;
  const chainLabel = CHAIN_LABELS[chainId] ?? "network";

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const { sendTx } = useTxSender();
  const [txHash, setTxHash] = useState<Hex>();
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const wait = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: receiptChainId,
  });

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
        `You withdrew ${amount} ${symbol} on ${chainLabel}.`,
      );
    }
  }, [
    wait.isSuccess,
    confirmed,
    from,
    getAccessToken,
    amount,
    symbol,
    chainLabel,
  ]);

  if (confirmed && txHash && asset) {
    return (
      <TxSuccessDialog
        title="Withdrawal sent!"
        description={`Sent ${amount} ${symbol} on ${chainLabel} to ${shortAddr(to.trim())}.`}
        txHash={txHash}
        chainId={asset.chainId}
        onClose={onClose}
      />
    );
  }

  function setMax() {
    if (!asset) return;
    if (isNative) {
      const reserve = parseUnits(chainId === ETHEREUM_CHAIN_ID ? "0.002" : "0.01", 18);
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
      await ensureChain();
      let hash: Hex;
      if (isNative) {
        hash = await sendTx(
          { to: dest, value: amountWei },
          { chainId: asset.chainId },
        );
      } else {
        hash = await sendTx(
          {
            to: asset.address as Address,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "transfer",
              args: [dest, amountWei],
            }),
          },
          { chainId: asset.chainId },
        );
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
    <WalletFundsModalShell title="Withdraw" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Send tokens to any address on the network you select.
      </p>

      {hasEthereumBalances && (
        <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          You have funds on Ethereum — select Ethereum below to withdraw them.
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start md:gap-5">
        <div className="space-y-3">
          <WithdrawAssetSection
            chainId={POLYGON_CHAIN_ID}
            label={CHAIN_LABELS[POLYGON_CHAIN_ID] ?? "Polygon"}
            assets={options}
            selectedKey={selectedKey}
            from={from}
            onSelect={setSelectedKey}
            balanceBySymbol={balanceBySymbol}
            ethereumUsdcRaw={ethereumUsdcRaw}
            ethereumEthRaw={ethereumEthRaw}
          />
          <WithdrawAssetSection
            chainId={ETHEREUM_CHAIN_ID}
            label={CHAIN_LABELS[ETHEREUM_CHAIN_ID] ?? "Ethereum"}
            assets={options}
            selectedKey={selectedKey}
            from={from}
            onSelect={setSelectedKey}
            balanceBySymbol={balanceBySymbol}
            ethereumUsdcRaw={ethereumUsdcRaw}
            ethereumEthRaw={ethereumEthRaw}
          />
        </div>

        <div className="space-y-4">
          <div>
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
              <p className="mt-1.5 text-xs text-danger">Enter a valid address.</p>
            )}
          </div>

          <div>
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
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder="0.00"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Balance on {chainLabel}: {formatToken(balance, decimals, 4)}{" "}
              {symbol}
            </p>
            {overBalance && (
              <p className="mt-1 text-xs text-danger">
                Amount exceeds your balance.
              </p>
            )}
          </div>

          <Button className="w-full gap-2" onClick={onSend} disabled={!canSend}>
            <ArrowUpRight className="h-4 w-4" />
            {pending
              ? "Sending…"
              : amountWei > 0n && toValid
                ? `Withdraw ${amount} ${symbol} on ${chainLabel}`
                : "Enter address and amount"}
          </Button>

          {txHash && wait.isLoading && (
            <p className="text-center text-xs text-muted-foreground">
              Waiting for confirmation…
            </p>
          )}
        </div>
      </div>
    </WalletFundsModalShell>
  );
}

/** Slim inline prompt shown on tx pages when the wallet has no POL for gas. */
export function LowGasBanner({ className }: { className?: string }) {
  const { address, isConnected } = useAccount();
  const { openFund } = useWalletFunds();
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
        <div className="font-medium">Need POL for gas</div>
        <p className="text-muted-foreground">
          Add funds to your wallet to continue.
        </p>
      </div>
      <Button size="sm" onClick={openFund}>
        Add funds
      </Button>
    </div>
  );
}
