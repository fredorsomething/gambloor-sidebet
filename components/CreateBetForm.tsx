"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "wagmi";
import { usePrivy } from "@privy-io/react-auth";

import { BetImageField } from "@/components/bets/BetImageField";
import { SettlerSelect } from "@/components/SettlerSelect";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI, SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useTxSender } from "@/lib/hooks/useTxSender";
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
type Mode = "binary" | "custom";

export function CreateBetForm() {
  const router = useRouter();
  const { push } = useToast();
  const { address: account } = useAccount();
  const { getAccessToken } = usePrivy();
  const chainId = useChainId();
  const { escrow, tokens } = useEscrow();
  const publicClient = usePublicClient();
  const ensurePolygon = useEnsurePolygon();

  const [tokenAddress, setTokenAddress] = useState<Address | "">(
    (tokens[0]?.address as Address) ?? "",
  );
  const tokenMeta = tokens.find(
    (t) => t.address.toLowerCase() === (tokenAddress || "").toLowerCase(),
  );

  // Content
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Outcomes + stance
  const [mode, setMode] = useState<Mode>("binary");
  const [stance, setStance] = useState<"yes" | "no">("yes");
  const [customOutcomes, setCustomOutcomes] = useState<string[]>(["", ""]);
  const [proposerOutcome, setProposerOutcome] = useState(0);
  const [acceptorOutcome, setAcceptorOutcome] = useState(1);

  // Stakes
  const [yourStakeStr, setYourStakeStr] = useState("");
  const [theirStakeStr, setTheirStakeStr] = useState("");

  // Settler + end date
  const [settler, setSettler] = useState("");
  const [settlerFeeBps, setSettlerFeeBps] = useState(200);
  const [endDate, setEndDate] = useState(""); // yyyy-mm-dd

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokens.length) return;
    if (!tokens.some((t) => t.address.toLowerCase() === (tokenAddress || "").toLowerCase())) {
      setTokenAddress(tokens[0].address as Address);
    }
  }, [chainId, tokens, tokenAddress]);

  // Pre-fill from an accepted sidebet negotiation ("relaunch with these terms").
  // The negotiation UI stashes the agreed terms in sessionStorage before routing
  // here; we read it once on mount so the proposer can re-create with one click.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("sidebet:relaunch");
      if (raw) sessionStorage.removeItem("sidebet:relaunch");
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as {
        title?: string;
        description?: string;
        terms?: string;
        token?: string;
        settler?: string;
        feeBps?: number;
        endDate?: string;
        outcomes?: string[];
        proposerOutcome?: number;
        acceptorOutcome?: number;
        yourStakeStr?: string;
        theirStakeStr?: string;
      };
      if (p.title) setTitle(p.title);
      if (p.description) setDescription(p.description);
      if (p.terms) setTerms(p.terms);
      if (p.token && isAddress(p.token)) setTokenAddress(getAddress(p.token) as Address);
      if (p.settler && isAddress(p.settler)) setSettler(getAddress(p.settler));
      if (typeof p.feeBps === "number") setSettlerFeeBps(p.feeBps);
      if (p.endDate) setEndDate(p.endDate);
      if (p.yourStakeStr) setYourStakeStr(p.yourStakeStr);
      if (p.theirStakeStr) setTheirStakeStr(p.theirStakeStr);

      const outs = p.outcomes ?? [];
      const pOut = p.proposerOutcome ?? 0;
      const aOut = p.acceptorOutcome ?? 1;
      const isBinaryYesNo =
        outs.length === 2 && outs[0] === "Yes" && outs[1] === "No";
      if (isBinaryYesNo) {
        setMode("binary");
        setStance(pOut === 0 ? "yes" : "no");
      } else if (outs.length >= 2) {
        setMode("custom");
        setCustomOutcomes(outs);
        setProposerOutcome(pOut);
        setAcceptorOutcome(aOut);
      }
    } catch {
      /* ignore malformed prefill */
    }
  }, []);

  const decimals = tokenMeta?.decimals ?? 6;
  const live = useTokenInfo({
    token: tokenAddress ? (tokenAddress as Address) : undefined,
    owner: account,
    spender: escrow as Address | undefined,
  });
  const effectiveDecimals = live.decimals ?? decimals;

  // Resolve the active outcomes + the indices each side backs.
  const outcomes = useMemo(() => {
    if (mode === "binary") return ["Yes", "No"];
    return customOutcomes.map((o) => o.trim());
  }, [mode, customOutcomes]);

  const myOutcome = mode === "binary" ? (stance === "yes" ? 0 : 1) : proposerOutcome;
  const theirOutcome = mode === "binary" ? (stance === "yes" ? 1 : 0) : acceptorOutcome;

  const yourStake = useMemo(() => {
    try {
      return parseAmount(yourStakeStr, effectiveDecimals);
    } catch {
      return 0n;
    }
  }, [yourStakeStr, effectiveDecimals]);

  const theirStake = useMemo(() => {
    try {
      return parseAmount(theirStakeStr, effectiveDecimals);
    } catch {
      return 0n;
    }
  }, [theirStakeStr, effectiveDecimals]);

  const needsApproval = yourStake > 0n && (live.allowance ?? 0n) < yourStake;

  const { writeContract } = useTxSender();
  const [approveHash, setApproveHash] = useState<Hex>();
  const [createHash, setCreateHash] = useState<Hex>();
  const approveWait = useWaitForTransactionReceipt({ hash: approveHash });
  const createWait = useWaitForTransactionReceipt({ hash: createHash });

  const isBusy = step !== "idle" && step !== "done";

  const onPickCover = useCallback(
    (file: File, url: string) => {
      if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
      setCoverFile(file);
      setCoverPreview(url);
    },
    [coverPreview],
  );

  const onClearCover = useCallback(() => {
    if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
  }, [coverPreview]);

  useEffect(() => {
    return () => {
      if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  function addOutcome() {
    setCustomOutcomes((prev) => (prev.length >= 16 ? prev : [...prev, ""]));
  }
  function removeOutcome(idx: number) {
    setCustomOutcomes((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, i) => i !== idx);
      // Keep selected indices valid.
      setProposerOutcome((p) => Math.min(p, next.length - 1));
      setAcceptorOutcome((a) => Math.min(a, next.length - 1));
      return next;
    });
  }
  function setOutcomeLabel(idx: number, label: string) {
    setCustomOutcomes((prev) => prev.map((o, i) => (i === idx ? label : o)));
  }

  function validate(): string | null {
    if (!account) return "Connect a wallet first";
    if (!escrow) return "Escrow not configured for this chain";
    if (!tokenAddress || !isAddress(tokenAddress)) return "Pick a valid token";
    if (title.trim().length < 3) return "Title needs at least 3 characters";
    if (description.trim().length < 1) return "Add a short description";
    if (terms.trim().length < 1) return "Spell out the resolution terms";
    if (outcomes.length < 2) return "Add at least two outcomes";
    if (outcomes.some((o) => o.length < 1)) return "Every outcome needs a label";
    if (new Set(outcomes.map((o) => o.toLowerCase())).size !== outcomes.length)
      return "Outcomes must be unique";
    if (myOutcome === theirOutcome)
      return "You and your counterparty must back different outcomes";
    if (myOutcome >= outcomes.length || theirOutcome >= outcomes.length)
      return "Outcome selection is invalid";
    if (yourStake <= 0n) return "Your stake must be positive";
    if (theirStake <= 0n) return "Their stake must be positive";
    if (live.balance !== undefined && live.balance < yourStake)
      return `Insufficient ${tokenMeta?.symbol ?? "token"} balance (${formatToken(
        live.balance,
        effectiveDecimals,
      )} < ${yourStakeStr})`;
    if (!settler || !isAddress(settler)) return "Pick an approved settler";
    if (getAddress(settler) === getAddress(account))
      return "You can't be your own settler";
    return null;
  }

  const [pendingCreate, setPendingCreate] = useState<null | {
    nonce: string;
    termsHash: Hex;
    estimatedEndDate: number;
    acceptDeadline: number;
    outcomes: string[];
    proposerOutcome: number;
    acceptorOutcome: number;
  }>(null);

  async function runCreate(pc: NonNullable<typeof pendingCreate>) {
    setStep("creating");
    push({
      title: "Submitting bet",
      description: "Confirm the create transaction in your wallet.",
    });
    await ensurePolygon();
    const hash = await writeContract({
      address: escrow as Address,
      abi: SIDEBET_ESCROW_V2_ABI,
      functionName: "createBet",
      args: [
        getAddress(settler),
        tokenAddress as Address,
        yourStake,
        theirStake,
        pc.proposerOutcome,
        pc.acceptorOutcome,
        pc.outcomes.length,
        BigInt(pc.acceptDeadline), // unfilled offers auto-expire after 1 week
        BigInt(pc.estimatedEndDate),
        pc.termsHash,
      ],
    });
    setCreateHash(hash);
  }

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
    const trimmedOutcomes = outcomes.map((o) => o.trim());
    const termsHash = buildTermsHash({
      title,
      description,
      terms,
      proposer: account,
      nonce,
      outcomes: trimmedOutcomes,
    });
    const estimatedEndDate = endDate
      ? Math.floor(new Date(`${endDate}T00:00:00Z`).getTime() / 1000)
      : 0;
    // Offers must be taken within a week, otherwise they expire and the
    // proposer can reclaim their stake.
    const acceptDeadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    const pc = {
      nonce,
      termsHash,
      estimatedEndDate,
      acceptDeadline,
      outcomes: trimmedOutcomes,
      proposerOutcome: myOutcome,
      acceptorOutcome: theirOutcome,
    };
    setPendingCreate(pc);

    try {
      if (needsApproval) {
        setStep("approving");
        push({
          title: "Approving token",
          description: "Confirm the approval in your wallet.",
        });
        await ensurePolygon();
        const hash = await writeContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [escrow as Address, maxUint256],
        });
        setApproveHash(hash);
      } else {
        await runCreate(pc);
      }
    } catch (err: unknown) {
      setStep("idle");
      setPendingCreate(null);
      const msg = (err as Error)?.message || "Transaction rejected";
      setError(msg);
      push({ title: "Failed", description: msg, variant: "danger" });
    }
  }

  // After approval confirms, kick off create.
  useEffect(() => {
    if (step !== "approving") return;
    if (!approveWait.isSuccess) return;
    if (!pendingCreate) return;
    void (async () => {
      try {
        await runCreate(pendingCreate);
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

  // After create confirms, parse BetCreated + index.
  useEffect(() => {
    if (step !== "creating") return;
    if (!createWait.isSuccess) return;
    if (!createHash) return;
    if (!pendingCreate || !account || !escrow || !tokenAddress) return;
    void (async () => {
      setStep("indexing");
      try {
        const receipt =
          createWait.data ??
          (await publicClient!.waitForTransactionReceipt({ hash: createHash }));

        let onchainId: bigint | null = null;
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== (escrow as string).toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: SIDEBET_ESCROW_V2_ABI,
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

        let imageUrl: string | null = null;
        if (coverFile) {
          const token = await getAccessToken();
          if (!token) throw new Error("Your session expired. Please sign in again.");
          const fd = new FormData();
          fd.append("file", coverFile);
          fd.append("address", account);
          fd.append("chainId", String(chainId));
          fd.append("escrowAddress", escrow);
          fd.append("onchainId", onchainId.toString());

          const uploadRes = await fetch("/api/upload/bet-image", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          if (!uploadRes.ok) {
            let msg = "Cover image upload failed";
            try {
              const body = await uploadRes.json();
              if (body?.error) msg = body.error;
            } catch {
              /* ignore */
            }
            throw new Error(msg);
          }
          const uploaded = (await uploadRes.json()) as { url: string };
          imageUrl = uploaded.url;
        }

        const indexed = await jsonFetch<{ id: number }>("/api/bets", {
          method: "POST",
          body: JSON.stringify({
            chainId,
            escrowAddress: escrow,
            onchainId: onchainId.toString(),
            txHash: createHash,
            proposer: account,
            settler: getAddress(settler),
            token: tokenAddress,
            tokenSymbol: tokenMeta?.symbol,
            decimals: effectiveDecimals,
            proposerStake: yourStake.toString(),
            acceptorStake: theirStake.toString(),
            outcomes: pendingCreate.outcomes,
            proposerOutcome: pendingCreate.proposerOutcome,
            acceptorOutcome: pendingCreate.acceptorOutcome,
            title,
            description,
            imageUrl,
            terms,
            termsHash: pendingCreate.termsHash,
            nonce: pendingCreate.nonce,
            feeBps: settlerFeeBps,
            acceptDeadline: pendingCreate.acceptDeadline,
            estimatedEndDate: pendingCreate.estimatedEndDate || 0,
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
      <LowGasBanner />
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

        <Field label="Cover image" hint="Optional — thumbnail on market cards and search.">
          <BetImageField
            previewUrl={coverPreview}
            onPick={onPickCover}
            onClear={onClearCover}
            disabled={isBusy}
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
            placeholder={`If the Knicks play in the 2026 ECF, "Yes" wins. Otherwise "No" wins.`}
            maxLength={10_000}
          />
        </Field>

        {/* Outcomes + stance */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="label">Outcomes & your side</span>
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => setMode("binary")}
                className={`rounded-md px-2 py-1 ${mode === "binary" ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]" : "text-muted-foreground"}`}
              >
                Yes / No
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("custom");
                  setCustomOutcomes(["Yes", "No"]);
                  setProposerOutcome(0);
                  setAcceptorOutcome(1);
                }}
                className={`rounded-md px-2 py-1 ${mode === "custom" ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]" : "text-muted-foreground"}`}
              >
                Custom outcomes
              </button>
            </div>
          </div>

          {mode === "binary" ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStance("yes")}
                className={`rounded-lg border-2 p-4 text-center font-bold transition-all ${
                  stance === "yes"
                    ? "border-success bg-success/15 text-success"
                    : "border-border text-muted-foreground hover:border-success/40"
                }`}
              >
                <div className="text-lg">YES</div>
                <div className="mt-1 text-[11px] font-normal">You back this</div>
              </button>
              <button
                type="button"
                onClick={() => setStance("no")}
                className={`rounded-lg border-2 p-4 text-center font-bold transition-all ${
                  stance === "no"
                    ? "border-danger bg-danger/15 text-danger"
                    : "border-border text-muted-foreground hover:border-danger/40"
                }`}
              >
                <div className="text-lg">NO</div>
                <div className="mt-1 text-[11px] font-normal">You back this</div>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {customOutcomes.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={o}
                    onChange={(e) => setOutcomeLabel(i, e.target.value)}
                    placeholder={`Outcome ${i + 1}`}
                    maxLength={80}
                  />
                  {customOutcomes.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOutcome(i)}
                      className="text-muted-foreground hover:text-[hsl(var(--danger))]"
                      aria-label="Remove outcome"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {customOutcomes.length < 16 && (
                <button
                  type="button"
                  onClick={addOutcome}
                  className="text-sm text-[hsl(var(--primary))] hover:underline"
                >
                  + Add outcome
                </button>
              )}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Field label="You back">
                  <select
                    className="select"
                    value={proposerOutcome}
                    onChange={(e) => setProposerOutcome(Number(e.target.value))}
                  >
                    {customOutcomes.map((o, i) => (
                      <option key={i} value={i}>
                        {o.trim() || `Outcome ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Counterparty backs">
                  <select
                    className="select"
                    value={acceptorOutcome}
                    onChange={(e) => setAcceptorOutcome(Number(e.target.value))}
                  >
                    {customOutcomes.map((o, i) => (
                      <option key={i} value={i}>
                        {o.trim() || `Outcome ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}
        </div>

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
            label="Your stake"
            hint={
              live.balance !== undefined && tokenMeta
                ? `Balance: ${formatToken(live.balance, effectiveDecimals)} ${tokenMeta.symbol}`
                : undefined
            }
          >
            <input
              className="input font-mono"
              inputMode="decimal"
              value={yourStakeStr}
              onChange={(e) => setYourStakeStr(e.target.value)}
              placeholder="100"
            />
          </Field>
        </div>

        <Field
          label="Their stake"
          hint="Asymmetric stakes are allowed — set what the other side must put up."
        >
          <input
            className="input font-mono"
            inputMode="decimal"
            value={theirStakeStr}
            onChange={(e) => setTheirStakeStr(e.target.value)}
            placeholder="100"
          />
        </Field>

        <Field
          label="Settler"
          hint="An approved neutral party who declares the winning outcome. You can't settle your own bet."
        >
          <SettlerSelect
            value={settler}
            onChange={(addr, feeBps) => {
              setSettler(addr);
              setSettlerFeeBps(feeBps);
            }}
            excludeAddress={account}
          />
        </Field>

        <Field
          label="Estimated end date"
          hint="Optional — informational date the market is expected to resolve."
        >
          <input
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <div>
          Escrow: <span className="font-mono">{shortAddr(escrow ?? "")}</span>
        </div>
        <div>
          Settler fee: <b>{(settlerFeeBps / 100).toFixed(2)}%</b> of the pool
          (set by the settler). Winner takes the pool less this fee. If the
          winning outcome is one nobody backed, both stakes are refunded.
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
          . Your stake is pulled into escrow on the create tx.
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
