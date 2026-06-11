"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Gift, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, parseUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useWaitForTransactionReceipt,
} from "wagmi";
import { polygon } from "@/lib/viemChains";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { TxSuccessDialog } from "@/components/wallet/TxSuccessDialog";
import { ERC20_ABI } from "@/lib/abi";
import { getTokens } from "@/lib/chains";
import { formatCryptoError } from "@/lib/cryptoErrors";
import { jsonFetch } from "@/lib/fetcher";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { formatToken, shortAddr } from "@/lib/utils";

const QUICK = [1, 5, 25];
const POL_DECIMALS = 18;

export function TipButton({
  to,
  username,
}: {
  to: string;
  username?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Gift className="h-4 w-4" />
        Tip
      </Button>
      {open && <TipModal to={to} username={username} onClose={() => setOpen(false)} />}
    </>
  );
}

function TipModal({
  to,
  username,
  onClose,
}: {
  to: string;
  username?: string | null;
  onClose: () => void;
}) {
  const { authenticated, login, getAccessToken } = usePrivy();
  const { address: from } = useAccount();
  const chainId = useChainId();
  const { push } = useToast();

  // All platform stables (including USDC.e) + native POL for gas tips.
  const options = useMemo(() => {
    const stables = getTokens().map((t) => ({
      symbol: t.symbol,
      decimals: t.decimals,
      address: t.address as Address,
    }));
    return [...stables, { symbol: "POL", decimals: POL_DECIMALS, address: undefined }];
  }, []);

  const [symbol, setSymbol] = useState("USDC.e");
  const asset = options.find((o) => o.symbol === symbol) ?? options[0];
  const isPol = symbol === "POL";
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
  const ensurePolygon = useEnsurePolygon();
  const [txHash, setTxHash] = useState<Hex>();
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const wait = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPolygon = chainId === polygon.id;

  let amountWei = 0n;
  let parseError: string | null = null;
  try {
    amountWei = amount.trim() ? parseUnits(amount.trim(), decimals) : 0n;
  } catch {
    parseError = "Enter a valid amount";
  }
  const overBalance = amountWei > balance;
  const canSend =
    onPolygon &&
    !!from &&
    !!asset &&
    amountWei > 0n &&
    !overBalance &&
    !parseError &&
    !sending &&
    !wait.isLoading;

  useEffect(() => {
    if (!wait.isSuccess || confirmed || !txHash) return;

    async function onConfirmed() {
      setConfirmed(true);
      try {
        const token = await getAccessToken();
        if (token) {
          await jsonFetch("/api/chat/tip", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              from,
              to,
              amount: amount.trim(),
              symbol,
            }),
          });
        }
      } catch {
        /* chat announce is best-effort */
      }
    }

    void onConfirmed();
  }, [
    wait.isSuccess,
    confirmed,
    txHash,
    getAccessToken,
    from,
    to,
    amount,
    symbol,
  ]);

  function closeAll() {
    onClose();
  }

  if (confirmed && txHash) {
    return (
      <TxSuccessDialog
        title="Tip sent!"
        description={`You tipped ${username ? `@${username}` : shortAddr(to)} ${amount} ${symbol}.`}
        txHash={txHash}
        chainId={polygon.id}
        onClose={closeAll}
      />
    );
  }

  async function onSend() {
    if (!authenticated) {
      void login();
      return;
    }
    if (!asset || !from) return;
    setSending(true);
    try {
      await ensurePolygon();
      let hash: Hex;
      if (isPol) {
        hash = await sendTx({ to: to as Address, value: amountWei });
      } else {
        hash = await sendTx({
          to: asset.address as Address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [to as Address, amountWei],
          }),
        });
      }
      setTxHash(hash);
      push({ title: "Tip submitted", description: "Waiting for confirmation…" });
    } catch (err) {
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Tip failed",
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
          <h2 className="text-lg font-semibold">
            Tip {username ? `@${username}` : shortAddr(to)}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Send a tip directly to{" "}
          <span className="font-mono">{shortAddr(to)}</span> on Polygon. This is
          an on-chain transfer and costs a little POL for gas.
        </p>

        {/* Asset selector */}
        <div className="mt-5 flex gap-2">
          {options.map((o) => (
            <button
              key={o.symbol}
              onClick={() => setSymbol(o.symbol)}
              className={
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
                (symbol === o.symbol
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/60")
              }
            >
              {o.symbol}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="tip-amount">
              Amount
            </label>
            <span className="text-xs text-muted-foreground">
              Balance: {formatToken(balance, decimals, 2)} {symbol}
            </span>
          </div>
          <input
            id="tip-amount"
            inputMode="decimal"
            className="input mt-1.5"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
          />
          <div className="mt-2 flex gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/60"
              >
                {q} {symbol}
              </button>
            ))}
          </div>
          {overBalance && (
            <p className="mt-2 text-xs text-danger">Amount exceeds your balance.</p>
          )}
        </div>

        {!onPolygon ? (
          <Button
            className="mt-5 w-full"
            onClick={() => void ensurePolygon()}
          >
            Switch to Polygon
          </Button>
        ) : (
          <Button className="mt-5 w-full" onClick={onSend} disabled={!canSend}>
            {pending
              ? "Sending…"
              : amountWei > 0n
                ? `Tip ${amount} ${symbol}`
                : "Enter an amount"}
          </Button>
        )}

        {txHash && wait.isLoading && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Waiting for confirmation…
          </p>
        )}
      </div>
    </div>
  );
}
