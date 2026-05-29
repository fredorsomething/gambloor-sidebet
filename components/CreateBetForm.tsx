"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  decodeEventLog,
  getAddress,
  isAddress,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI, SIDEBET_ESCROW_ABI } from "@/lib/abi";
import { useEscrow } from "@/lib/hooks/useEscrow";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { jsonFetch } from "@/lib/fetcher";
import {
  buildTermsHash,
  formatToken,
  parseAmount,
  shortAddr,
} from "@/lib/utils";

type Step = "idle" | "approving" | "creating" | "indexing" | "done";

export function CreateBetForm() {
  const router = useRouter();
  const { push } = useToast();
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { escrow, tokens } = useEscrow();
  const publicClient = usePublicClient();

  // Default token = first configured for the chain.
  const [tokenAddress, setTokenAddress] = useState<Address | "">(
    (tokens[0]?.address as Address) ?? "",
  );
  const tokenMeta = tokens.find(
    (t) => t.address.toLowerCase() === (tokenAddress || "").toLowerCase(),
  );

  // Form state.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [settler, setSettler] = useState("");
  const [acceptHours, setAcceptHours] = useState("72");
  const [settleHours, setSettleHours] = useState("168");
  const [feeBpsStr, setFeeBpsStr] = useState("0");

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  // Re-sync token default when chain changes.
  useEffect(() => {
    if (!tokens.length) return;
    if (!tokens.some((t) => t.address.toLowerCase() === (tokenAddress || "").toLowerCase())) {
      setTokenAddress(tokens[0].address as Address);
    }
  }, [chainId, tokens, tokenAddress]);

  const decimals = tokenMeta?.decimals ?? 6;
  const live = useTokenInfo({
    token: tokenAddress ? (tokenAddress as Address) : undefined,
    owner: account,
    spender: escrow as Address | undefined,
  });
  const effectiveDecimals = live.decimals ?? decimals;

  const amount = useMemo(() => {
    try {
      return parseAmount(amountStr, effectiveDecimals);
    } catch {
      return 0n;
    }
  }, [amountStr, effectiveDecimals]);

  const needsApproval =
    amount > 0n && (live.allowance ?? 0n) < amount;

  const feeBps = Math.max(0, Math.min(1000, Number(feeBpsStr) || 0));

  // ---- write hooks ----
  const approveTx = useWriteContract();
  const createTx = useWriteContract();
  const approveWait = useWaitForTransactionReceipt({ hash: approveTx.data });
  const createWait = useWaitForTransactionReceipt({ hash: createTx.data });

  const isBusy = step !== "idle" && step !== "done";

  function validate(): string | null {
    if (!account) return "Connect a wallet first";
    if (!escrow) return "Escrow not configured for this chain";
    if (!tokenAddress || !isAddress(tokenAddress)) return "Pick a valid token";
    if (title.trim().length < 3) return "Title needs at least 3 characters";
    if (description.trim().length < 1) return "Add a short description";
    if (terms.trim().length < 1) return "Spell out the resolution terms";
    if (amount <= 0n) return "Stake amount must be positive";
    if (live.balance !== undefined && live.balance < amount)
      return `Insufficient ${tokenMeta?.symbol ?? "token"} balance (${formatToken(
        live.balance,
        effectiveDecimals,
      )} < ${amountStr})`;
    if (!isAddress(settler)) return "Settler must be a valid address";
    if (getAddress(settler) === getAddress(account)) {
      // soft-allow but warn? The contract still allows it. We'll just warn.
    }
    if (feeBps < 0 || feeBps > 1000) return "Fee must be 0–10%";
    const ah = Number(acceptHours);
    const sh = Number(settleHours);
    if (!Number.isFinite(ah) || ah < 0) return "Accept deadline (hours) invalid";
    if (!Number.isFinite(sh) || sh <= ah)
      return "Settle deadline must be after accept deadline";
    return null;
  }

  const [pendingCreate, setPendingCreate] = useState<null | {
    nonce: string;
    termsHash: Hex;
    acceptDeadline: number;
    settleDeadline: number;
  }>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!account || !escrow || !tokenAddress) return;

    const nonce = crypto.randomUUID();
    const termsHash = buildTermsHash({
      title,
      description,
      terms,
      proposer: account,
      nonce,
    });
    const now = Math.floor(Date.now() / 1000);
    const acceptDeadline =
      Number(acceptHours) > 0 ? now + Number(acceptHours) * 3600 : 0;
    const settleDeadline =
      Number(settleHours) > 0 ? now + Number(settleHours) * 3600 : 0;

    setPendingCreate({ nonce, termsHash, acceptDeadline, settleDeadline });

    if (needsApproval) {
      try {
        setStep("approving");
        push({
          title: "Approving token",
          description: "Confirm the approval in your wallet.",
        });
        await approveTx.writeContractAsync({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [escrow as Address, maxUint256],
        });
        // The effect on approveWait will fire runCreate after confirmation.
      } catch (err: unknown) {
        setStep("idle");
        setPendingCreate(null);
        const msg = (err as Error)?.message || "Approval rejected";
        setError(msg);
        push({ title: "Approval failed", description: msg, variant: "danger" });
      }
    } else {
      try {
        setStep("creating");
        push({
          title: "Submitting bet",
          description: "Confirm the create transaction in your wallet.",
        });
        await createTx.writeContractAsync({
          address: escrow as Address,
          abi: SIDEBET_ESCROW_ABI,
          functionName: "createBet",
          args: [
            getAddress(settler),
            tokenAddress as Address,
            amount,
            BigInt(acceptDeadline),
            BigInt(settleDeadline),
            feeBps,
            termsHash,
          ],
        });
      } catch (err: unknown) {
        setStep("idle");
        setPendingCreate(null);
        const msg = (err as Error)?.message || "Create rejected";
        setError(msg);
        push({ title: "Create failed", description: msg, variant: "danger" });
      }
    }
  }

  // After approval confirms, kick off the create tx.
  useEffect(() => {
    if (step !== "approving") return;
    if (!approveWait.isSuccess) return;
    if (!pendingCreate) return;
    void (async () => {
      try {
        setStep("creating");
        push({
          title: "Submitting bet",
          description: "Confirm the create transaction in your wallet.",
        });
        await createTx.writeContractAsync({
          address: escrow as Address,
          abi: SIDEBET_ESCROW_ABI,
          functionName: "createBet",
          args: [
            getAddress(settler),
            tokenAddress as Address,
            amount,
            BigInt(pendingCreate.acceptDeadline),
            BigInt(pendingCreate.settleDeadline),
            feeBps,
            pendingCreate.termsHash,
          ],
        });
      } catch (err: unknown) {
        setStep("idle");
        setPendingCreate(null);
        const msg = (err as Error)?.message || "Create rejected";
        setError(msg);
        push({ title: "Create failed", description: msg, variant: "danger" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, approveWait.isSuccess]);

  // After create confirms, parse the BetCreated event and index into the DB.
  useEffect(() => {
    if (step !== "creating") return;
    if (!createWait.isSuccess) return;
    if (!createTx.data) return;
    if (!pendingCreate || !account || !escrow || !tokenAddress) return;
    void (async () => {
      setStep("indexing");
      try {
        const receipt =
          createWait.data ??
          (await publicClient!.waitForTransactionReceipt({ hash: createTx.data! }));

        let onchainId: bigint | null = null;
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== (escrow as string).toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: SIDEBET_ESCROW_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "BetCreated") {
              onchainId = (decoded.args as { id: bigint }).id;
              break;
            }
          } catch {
            /* not our event */
          }
        }

        if (onchainId === null) {
          throw new Error("Couldn't find BetCreated event in receipt");
        }

        const indexed = await jsonFetch<{ id: number }>("/api/bets", {
          method: "POST",
          body: JSON.stringify({
            chainId,
            escrowAddress: escrow,
            onchainId: onchainId.toString(),
            txHash: createTx.data,
            proposer: account,
            settler: getAddress(settler),
            token: tokenAddress,
            tokenSymbol: tokenMeta?.symbol,
            decimals: effectiveDecimals,
            amount: amount.toString(),
            title,
            description,
            terms,
            termsHash: pendingCreate.termsHash,
            nonce: pendingCreate.nonce,
            feeBps,
            acceptDeadline: pendingCreate.acceptDeadline || 0,
            settleDeadline: pendingCreate.settleDeadline || 0,
          }),
        });

        setStep("done");
        push({
          title: "Bet live",
          description: "Others can now take the other side.",
          variant: "success",
        });
        router.push(`/bets/${indexed.id}`);
      } catch (err: unknown) {
        const msg = (err as Error)?.message || "Indexing failed";
        setError(msg);
        push({ title: "Indexing failed", description: msg, variant: "danger" });
        setStep("idle");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, createWait.isSuccess]);

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5">
      <div className="grid grid-cols-1 gap-5">
        <Field label="Title" hint="Short headline shown in market listings.">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Will the Knicks make the ECF this year?"
            maxLength={200}
          />
        </Field>

        <Field label="Short description">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Two-line summary of the bet"
            maxLength={500}
          />
        </Field>

        <Field
          label="Terms"
          hint="Resolution criteria. Be specific — this is what the settler will read."
        >
          <textarea
            className="textarea min-h-[140px]"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={`If the Knicks play in the 2026 ECF — or are eliminated from the East Conference Finals — proposer wins. Otherwise acceptor wins. Push if season is cancelled.`}
            maxLength={10_000}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Token">
            <select
              className="select"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value as Address)}
            >
              {tokens.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol} — {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Stake per side"
            hint={
              live.balance !== undefined && tokenMeta
                ? `Balance: ${formatToken(live.balance, effectiveDecimals)} ${tokenMeta.symbol}`
                : undefined
            }
          >
            <input
              className="input font-mono"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="100"
            />
          </Field>
        </div>

        <Field
          label="Settler"
          hint="The address authorized to declare the winner. Usually a neutral third party."
        >
          <input
            className="input font-mono"
            value={settler}
            onChange={(e) => setSettler(e.target.value)}
            placeholder="0x…"
          />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Accept deadline (hours)">
            <input
              className="input"
              inputMode="numeric"
              value={acceptHours}
              onChange={(e) => setAcceptHours(e.target.value)}
              placeholder="72"
            />
          </Field>
          <Field label="Settle deadline (hours)">
            <input
              className="input"
              inputMode="numeric"
              value={settleHours}
              onChange={(e) => setSettleHours(e.target.value)}
              placeholder="168"
            />
          </Field>
          <Field label="Settler fee (bps)" hint="Max 1000 = 10%.">
            <input
              className="input"
              inputMode="numeric"
              value={feeBpsStr}
              onChange={(e) => setFeeBpsStr(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <div>
          Escrow:{" "}
          <span className="font-mono">{shortAddr(escrow ?? "")}</span>
        </div>
        <div>
          You will sign{" "}
          {needsApproval ? (
            <span>
              <b>two</b> transactions: an ERC-20 approval, then{" "}
              <code>createBet</code>
            </span>
          ) : (
            <span>
              <b>one</b> transaction: <code>createBet</code>
            </span>
          )}
          . Your stake is pulled into escrow on the second tx.
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/10 p-3 text-sm text-[hsl(var(--danger))]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" size="lg" disabled={isBusy}>
          {step === "approving" && "Approving…"}
          {step === "creating" && "Creating…"}
          {step === "indexing" && "Indexing…"}
          {step === "done" && "Done"}
          {step === "idle" && (needsApproval ? "Approve & create" : "Create bet")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5 block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">{label}</span>
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}
