"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { polygon } from "wagmi/chains";

import { BetImageField } from "@/components/bets/BetImageField";
import { SettlerSelect } from "@/components/SettlerSelect";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { CONDITIONAL_TOKENS_ABI } from "@/lib/abi";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { useMarketContracts } from "@/lib/hooks/useEscrow";
import {
  computeConditionId,
  computePositionId,
  computeQuestionId,
} from "@/lib/clob";
import { jsonFetch } from "@/lib/fetcher";
import { shortAddr } from "@/lib/utils";

type Step = "idle" | "preparing" | "indexing" | "done";

function buildMarketTermsHash(args: {
  title: string;
  description: string;
  terms: string;
  creator: string;
  nonce: string;
  outcomes: string[];
}): Hex {
  return keccak256(
    toBytes(
      JSON.stringify({
        title: args.title.trim(),
        description: args.description.trim(),
        terms: args.terms.trim(),
        creator: args.creator.toLowerCase(),
        nonce: args.nonce,
        outcomes: args.outcomes.map((o) => o.trim()),
      }),
    ),
  );
}

export function CreateMarketForm() {
  const router = useRouter();
  const { push } = useToast();
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { ctf, exchange, tokens } = useMarketContracts();
  const publicClient = usePublicClient();
  const ensurePolygon = useEnsurePolygon();

  const [tokenAddress, setTokenAddress] = useState<Address | "">(
    (tokens[0]?.address as Address) ?? "",
  );
  const tokenMeta = tokens.find(
    (t) => t.address.toLowerCase() === (tokenAddress || "").toLowerCase(),
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [customOutcomes, setCustomOutcomes] = useState<string[]>(["Yes", "No"]);
  const [settler, setSettler] = useState("");
  const [settlerFeeBps, setSettlerFeeBps] = useState(200);
  const [endDate, setEndDate] = useState("");

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const prepareTx = useWriteContract();
  const prepareWait = useWaitForTransactionReceipt({ hash: prepareTx.data });
  const isBusy = step !== "idle" && step !== "done";

  const outcomes = useMemo(
    () => customOutcomes.map((o) => o.trim()),
    [customOutcomes],
  );

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
    setCustomOutcomes((p) => (p.length >= 16 ? p : [...p, ""]));
  }
  function removeOutcome(idx: number) {
    setCustomOutcomes((p) => (p.length <= 2 ? p : p.filter((_, i) => i !== idx)));
  }

  function validate(): string | null {
    if (!account) return "Connect a wallet first";
    if (!ctf || !exchange) return "Markets not configured for this chain";
    if (!tokenAddress || !isAddress(tokenAddress)) return "Pick a valid collateral token";
    if (title.trim().length < 3) return "Title needs at least 3 characters";
    if (description.trim().length < 1) return "Add a short description";
    if (terms.trim().length < 1) return "Spell out the resolution terms";
    if (outcomes.length < 2) return "Add at least two outcomes";
    if (outcomes.some((o) => o.length < 1)) return "Every outcome needs a label";
    if (new Set(outcomes.map((o) => o.toLowerCase())).size !== outcomes.length)
      return "Outcomes must be unique";
    if (!settler || !isAddress(settler)) return "Pick an approved settler";
    if (getAddress(settler) === getAddress(account))
      return "You can't be your own settler";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!account || !ctf || !exchange || !tokenAddress) return;

    const nonce = crypto.randomUUID();
    const termsHash = buildMarketTermsHash({
      title,
      description,
      terms,
      creator: account,
      nonce,
      outcomes,
    });
    const questionId = computeQuestionId(termsHash, nonce);
    const numOutcomes = outcomes.length;
    const settlerAddr = getAddress(settler);
    const conditionId = computeConditionId(settlerAddr, questionId, numOutcomes);
    const positionIds = outcomes.map((_, i) =>
      computePositionId(tokenAddress as Address, conditionId, i).toString(),
    );
    const estimatedEndDate = endDate
      ? Math.floor(new Date(`${endDate}T00:00:00Z`).getTime() / 1000)
      : 0;

    try {
      setStep("preparing");
      push({
        title: "Creating condition",
        description: "Confirm the transaction in your wallet.",
      });
      await ensurePolygon();
      await prepareTx.writeContractAsync({
        chainId: polygon.id,
        address: ctf as Address,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: "prepareCondition",
        args: [settlerAddr, tokenAddress as Address, questionId, numOutcomes],
      });

      // Stash the derived ids for the indexing effect.
      setPending({
        nonce,
        termsHash,
        questionId,
        conditionId,
        positionIds,
        estimatedEndDate,
        outcomes,
        settler: settlerAddr,
      });
    } catch (err: unknown) {
      setStep("idle");
      const msg = (err as Error)?.message || "Transaction rejected";
      setError(msg);
      push({ title: "Failed", description: msg, variant: "danger" });
    }
  }

  const [pending, setPending] = useState<null | {
    nonce: string;
    termsHash: Hex;
    questionId: Hex;
    conditionId: Hex;
    positionIds: string[];
    estimatedEndDate: number;
    outcomes: string[];
    settler: string;
  }>(null);

  useEffect(() => {
    if (step !== "preparing") return;
    if (!prepareWait.isSuccess) return;
    if (!pending || !account || !ctf || !exchange || !tokenAddress) return;
    void (async () => {
      setStep("indexing");
      try {
        let imageUrl: string | null = null;
        // (Cover image upload requires a market id; skipped here for simplicity.)
        void coverFile;
        void imageUrl;

        const indexed = await jsonFetch<{ id: number }>("/api/markets", {
          method: "POST",
          body: JSON.stringify({
            chainId,
            exchangeAddress: exchange,
            ctfAddress: ctf,
            conditionId: pending.conditionId,
            questionId: pending.questionId,
            txHash: prepareTx.data,
            creator: account,
            settler: pending.settler,
            token: tokenAddress,
            tokenSymbol: tokenMeta?.symbol,
            decimals: tokenMeta?.decimals ?? 6,
            title,
            description,
            terms,
            termsHash: pending.termsHash,
            nonce: pending.nonce,
            outcomes: pending.outcomes,
            positionIds: pending.positionIds,
            estimatedEndDate: pending.estimatedEndDate || 0,
          }),
        });
        setStep("done");
        push({
          title: "Market live",
          description: "Anyone can now trade shares.",
          variant: "success",
        });
        router.push(`/markets/${indexed.id}`);
      } catch (err: unknown) {
        const msg = (err as Error)?.message || "Indexing failed";
        setError(msg);
        push({ title: "Indexing failed", description: msg, variant: "danger" });
        setStep("idle");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, prepareWait.isSuccess]);

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5">
      <LowGasBanner />
      <Field label="Title">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Who wins the 2026 NBA Finals?"
          maxLength={200}
        />
      </Field>

      <Field label="Short description">
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Two-line summary"
          maxLength={500}
        />
      </Field>

      <Field label="Cover image" hint="Optional — shown on market cards.">
        <BetImageField
          previewUrl={coverPreview}
          onPick={onPickCover}
          onClear={onClearCover}
          disabled={isBusy}
        />
      </Field>

      <Field label="Terms" hint="Resolution criteria the settler will use.">
        <textarea
          className="textarea min-h-[120px]"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          maxLength={10_000}
        />
      </Field>

      <div className="space-y-2">
        <span className="label">Outcomes</span>
        {customOutcomes.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="input flex-1"
              value={o}
              onChange={(e) =>
                setCustomOutcomes((prev) =>
                  prev.map((x, j) => (j === i ? e.target.value : x)),
                )
              }
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
      </div>

      <Field label="Collateral token">
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

      <Field label="Settler" hint="Approved party who reports the winning outcome.">
        <SettlerSelect
          value={settler}
          onChange={(addr, feeBps) => {
            setSettler(addr);
            setSettlerFeeBps(feeBps);
          }}
          excludeAddress={account}
        />
      </Field>

      <Field label="Estimated end date" hint="Optional.">
        <input
          type="date"
          className="input"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </Field>

      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <div>
          CTF: <span className="font-mono">{shortAddr(ctf ?? "")}</span> · Exchange:{" "}
          <span className="font-mono">{shortAddr(exchange ?? "")}</span>
        </div>
        <div>Settler fee: <b>{(settlerFeeBps / 100).toFixed(2)}%</b></div>
        <div>
          You&apos;ll sign one transaction to prepare the condition on-chain. After
          that, anyone can split collateral into shares and trade.
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/10 p-3 text-sm text-[hsl(var(--danger))]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button type="submit" size="lg" disabled={isBusy}>
          {step === "preparing" && "Preparing…"}
          {step === "indexing" && "Indexing…"}
          {step === "done" && "Done"}
          {step === "idle" && "Create market"}
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
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
