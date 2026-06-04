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
  getWalletStablecoins,
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

const DEPOSIT_TOKENS = () => {
  const stables = getWalletStablecoins().map((t) => ({
    symbol: t.symbol,
    decimals: t.decimals,
    address: t.address as Address,
  }));
  return [...stables, { symbol: "POL", decimals: 18, address: undefined as Address | undefined }];
};

function DepositBettingNote() {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">To bet on markets:</span> keep{" "}
        <TokenSymbol symbol={MARKET_COLLATERAL_SYMBOL} size={12} /> plus a little{" "}
        <TokenSymbol symbol="POL" size={12} /> for gas on Polygon.
      </p>
    </div>
  );
}

function DepositTokenTile({
  symbol,
  balance,
  decimals,
  onCopy,
}: {
  symbol: string;
  balance: bigint;
  decimals: number;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-muted/20 p-3 text-center transition-colors hover:border-primary/30 hover:bg-muted/40"
    >
      <TokenIcon symbol={symbol} size={28} />
      <span className="text-sm font-semibold">{symbol}</span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatToken(balance, decimals, 4)}
      </span>
    </button>
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
    <div className="fixed inset-0 z-[160] flex max-md:items-end max-md:overflow-y-auto md:items-center md:justify-center md:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md card p-5 shadow-xl max-md:max-h-[min(92dvh,100%)] max-md:overflow-y-auto max-md:rounded-b-none max-md:rounded-t-2xl max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-6 md:animate-in md:fade-in md:zoom-in-95">
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

        <div className="mt-4">
          <DepositBettingNote />
        </div>

        {address && (
          <div className="mt-4 space-y-2">
            <Button
              className="h-auto w-full justify-start gap-3 py-3"
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
              className="h-auto w-full justify-start gap-3 py-3"
              onClick={() => void onDepositFromExternalWallet()}
              disabled={fundingBusy || !polygonUsdc}
            >
              <Wallet className="h-5 w-5 shrink-0" />
              <span className="text-left">
                <span className="block font-semibold">
                  {depositAddressPending ? "Opening…" : "Deposit from another wallet"}
                </span>
                <span className="block text-xs font-normal opacity-80">
                  Send from any chain — Privy bridges to your wallet
                </span>
              </span>
            </Button>
          </div>
        )}

        <div className={cn(address && "mt-5", "space-y-4")}>
          <div>
            <p className="text-sm font-medium">Your balances</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Polygon and Ethereum at this address.
              {multipleWallets &&
                " Totals include every wallet linked to your account."}
            </p>
          </div>

          <WalletChainBalances
            chainGroups={chainGroups}
            onOpenDeposit={() => void onDepositFromExternalWallet()}
            emptyMessage="No balances yet."
          />

          <PolygonFundingNotice />

          <div className="grid grid-cols-2 gap-2">
            {DEPOSIT_TOKENS().map((t) => (
              <DepositTokenTile
                key={t.symbol}
                symbol={t.symbol}
                balance={balanceBySymbol.get(t.symbol) ?? 0n}
                decimals={t.decimals}
                onCopy={onCopyAddress}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <TokenIcon symbol="POL" size={16} />
            Your Polygon wallet address
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-sm">
              {address ? shortAddr(address) : "—"}
            </code>
            <button
              onClick={onCopyAddress}
              disabled={!address}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
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

        {(nativeUsdcBal > 0n || pusdBal > 0n) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
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
      </div>
    </div>
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
    <div className="fixed inset-0 z-[160] flex max-md:items-end max-md:overflow-y-auto md:items-center md:justify-center md:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md card p-5 shadow-xl max-md:max-h-[min(92dvh,100%)] max-md:overflow-y-auto max-md:rounded-b-none max-md:rounded-t-2xl max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-6 md:animate-in md:fade-in md:zoom-in-95">
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
          Send tokens to any address on the network you select below.
        </p>

        {hasEthereumBalances && (
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            You have funds on Ethereum (e.g. from a card deposit). Select
            Ethereum below to withdraw them — they are not on Polygon until you
            bridge.
          </p>
        )}

        <div className="mt-5 space-y-4">
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
            <p className="mt-1.5 text-xs text-danger">Enter a valid address.</p>
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
            Balance on {chainLabel}: {formatToken(balance, decimals, 4)} {symbol}
          </p>
          {overBalance && (
            <p className="mt-1 text-xs text-danger">Amount exceeds your balance.</p>
          )}
        </div>

        <Button className="mt-5 w-full gap-2" onClick={onSend} disabled={!canSend}>
          <ArrowUpRight className="h-4 w-4" />
          {pending
            ? "Sending…"
            : amountWei > 0n && toValid
              ? `Withdraw ${amount} ${symbol} on ${chainLabel}`
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
