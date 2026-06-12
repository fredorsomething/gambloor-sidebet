"use client";

import { usePrivy } from "@privy-io/react-auth";
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
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { BetImageField } from "@/components/bets/BetImageField";
import { SettlerSelect } from "@/components/SettlerSelect";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI, SIDEBET_ESCROW_V3_ABI } from "@/lib/abi";
import { cryptoErrorSummary, formatCryptoError } from "@/lib/cryptoErrors";
import {
  getEscrowV3Address,
  getMarketCollateralToken,
  POLYGON_CHAIN_ID,
} from "@/lib/chains";
import {
  computeConditionId,
  computePositionId,
  computeQuestionId,
} from "@/lib/clob";
import { jsonFetch } from "@/lib/fetcher";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { usePlatformSettings } from "@/lib/hooks/usePlatformSettings";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { useTxSender } from "@/lib/hooks/useTxSender";
import {
  MARKET_CREATION_FEE_RAW,
  MARKET_CREATION_FEE_USD,
} from "@/lib/marketRegistration";
import { formatToken } from "@/lib/utils";

type Step = "idle" | "approving" | "registering" | "indexing" | "done";
type BinaryStyle = "yes-no" | "up-down";

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
  const { getAccessToken } = usePrivy();
  const chainId = useChainId() || POLYGON_CHAIN_ID;
  const publicClient = usePublicClient();
  const ensurePolygon = useEnsurePolygon();
  const { writeContract } = useTxSender();
  const platformQ = usePlatformSettings();
  const allowMarketCreation = platformQ.data?.allowMarketCreation ?? false;
  const platformFeeBps = platformQ.data?.sidebetFeeBps ?? 0;

  const escrowV3 = getEscrowV3Address();
  const marketToken = getMarketCollateralToken();
  const tokenAddress = marketToken.address;
  const tokenMeta = marketToken;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [binaryStyle, setBinaryStyle] = useState<BinaryStyle>("yes-no");
  const [settler, setSettler] = useState("");
  const [settlerFeeBps, setSettlerFeeBps] = useState(200);
  const [endDate, setEndDate] = useState("");

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const isBusy = step !== "idle" && step !== "done";

  const outcomes = useMemo(
    () => (binaryStyle === "up-down" ? ["Up", "Down"] : ["Yes", "No"]),
    [binaryStyle],
  );

  const termsPlaceholder =
    binaryStyle === "up-down"
      ? `If BTC closes above $100k on Dec 31, "Up" wins. Otherwise "Down" wins.`
      : `If the Knicks play in the 2026 ECF, "Yes" wins. Otherwise "No" wins.`;

  const live = useTokenInfo({
    token: tokenAddress as Address,
    owner: account,
    spender: escrowV3,
  });
  const needsApproval = (live.allowance ?? 0n) < MARKET_CREATION_FEE_RAW;
  const walletSignatures = 1 + (needsApproval ? 1 : 0);

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

  function validate(): string | null {
    if (!account) return "Connect a wallet first";
    if (!escrowV3) return "Escrow not configured for this chain";
    if (!tokenAddress || !isAddress(tokenAddress)) return "Collateral misconfigured";
    if (title.trim().length < 3) return "Title needs at least 3 characters";
    if (description.trim().length < 1) return "Add a short description";
    if (terms.trim().length < 1)
      return "Please be as specific as possible with your resolution terms";
    if (!settler || !isAddress(settler)) return "Pick an approved settler";
    if (getAddress(settler) === getAddress(account))
      return "You can't be your own settler";
    if (live.balance !== undefined && live.balance < MARKET_CREATION_FEE_RAW)
      return `Insufficient ${tokenMeta.symbol} balance — the $${MARKET_CREATION_FEE_USD.toFixed(2)} creation fee is required (${formatToken(
        live.balance,
        tokenMeta.decimals,
      )} available)`;
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!allowMarketCreation) {
      setError("Market creation is temporarily disabled");
      return;
    }
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!account || !tokenAddress || !escrowV3 || !publicClient) return;

    const nonce = crypto.randomUUID();
    const trimmedOutcomes = outcomes.map((o) => o.trim());
    const termsHash = buildMarketTermsHash({
      title,
      description,
      terms,
      creator: account,
      nonce,
      outcomes: trimmedOutcomes,
    });
    const questionId = computeQuestionId(termsHash, nonce);
    const settlerAddr = getAddress(settler);
    const conditionId = computeConditionId(
      settlerAddr,
      questionId,
      trimmedOutcomes.length,
    );
    const positionIds = trimmedOutcomes.map((_, i) =>
      computePositionId(tokenAddress as Address, conditionId, i).toString(),
    );
    const estimatedEndDate = endDate
      ? Math.floor(new Date(`${endDate}T00:00:00Z`).getTime() / 1000)
      : 0;

    try {
      await ensurePolygon();

      // 1. Approve the $1 USDC.e creation fee if needed.
      if (needsApproval) {
        setStep("approving");
        push({
          title: "Approving creation fee",
          description: `Approve $${MARKET_CREATION_FEE_USD.toFixed(2)} USDC.e for the market registry.`,
        });
        const approveHash = await writeContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [escrowV3, MARKET_CREATION_FEE_RAW],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // 2. Register the market on-chain (pulls the $1 fee).
      setStep("registering");
      push({
        title: "Registering market",
        description: `$${MARKET_CREATION_FEE_USD.toFixed(2)} USDC.e creation fee — anchors your market on-chain.`,
      });
      const registerHash = await writeContract({
        address: escrowV3,
        abi: SIDEBET_ESCROW_V3_ABI,
        functionName: "registerMarket",
        args: [
          conditionId as Hex,
          settlerAddr,
          trimmedOutcomes.length,
          termsHash,
          tokenAddress as Address,
        ],
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: registerHash,
      });
      if (receipt.status !== "success") {
        throw new Error("Market registration transaction failed");
      }

      // 3. Upload the cover + index the market (Pending until admin approval).
      setStep("indexing");

      let imageUrl: string | null = null;
      if (coverFile) {
        try {
          const token = await getAccessToken();
          if (!token) throw new Error("Your session expired. Please sign in again.");
          const fd = new FormData();
          fd.append("file", coverFile);
          fd.append("address", account);
          fd.append("chainId", String(chainId));
          fd.append("conditionId", conditionId);

          const uploadRes = await fetch("/api/upload/market-image", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          if (uploadRes.ok) {
            const uploaded = (await uploadRes.json()) as { url: string };
            imageUrl = uploaded.url;
          } else {
            push({
              title: "Cover image skipped",
              description: "The market was still created without it.",
              variant: "danger",
            });
          }
        } catch {
          push({
            title: "Cover image skipped",
            description: "The market was still created without it.",
            variant: "danger",
          });
        }
      }

      const indexed = await jsonFetch<{ id: number }>("/api/markets", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          conditionId,
          questionId,
          creator: account,
          settler: settlerAddr,
          token: tokenAddress,
          tokenSymbol: tokenMeta.symbol,
          decimals: tokenMeta.decimals ?? 6,
          title,
          description,
          imageUrl,
          terms,
          termsHash,
          nonce,
          outcomes: trimmedOutcomes,
          positionIds,
          estimatedEndDate: estimatedEndDate || 0,
          registrationTxHash: registerHash,
        }),
      });
      setStep("done");
      push({
        title: "Market submitted",
        description: "An admin will review it before it goes live.",
        variant: "success",
      });
      router.push(`/markets/${indexed.id}`);
    } catch (err: unknown) {
      const msg = cryptoErrorSummary(err, "Couldn't create market");
      setError(msg);
      const { title: errTitle, description: errDescription } = formatCryptoError(
        err,
        { fallbackTitle: "Couldn't create market" },
      );
      push({ title: errTitle, description: errDescription, variant: "danger" });
      setStep("idle");
    }
  }

  if (!platformQ.isLoading && !allowMarketCreation) {
    return (
      <div className="card p-6 text-sm text-muted-foreground">
        Market creation is temporarily disabled while we improve the order
        book. You can still propose sidebets from the create page.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5">
      <LowGasBanner />

      <Field label="Title" hint="Short headline shown in market listings.">
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

      <Field
        label="Rules"
        hint="Resolution criteria — be as specific as possible about what makes each outcome win."
      >
        <textarea
          className="textarea min-h-[120px]"
          value={terms}
          onChange={(e) => {
            setTerms(e.target.value);
            if (error) setError(null);
          }}
          placeholder={termsPlaceholder}
          maxLength={10_000}
        />
      </Field>

      {/* Outcomes — binary markets only, like sidebets. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="label">Outcomes</span>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setBinaryStyle("yes-no")}
              className={`rounded-md px-2 py-1 ${binaryStyle === "yes-no" ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]" : "text-muted-foreground"}`}
            >
              Yes / No
            </button>
            <button
              type="button"
              onClick={() => setBinaryStyle("up-down")}
              className={`rounded-md px-2 py-1 ${binaryStyle === "up-down" ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]" : "text-muted-foreground"}`}
            >
              Up / Down
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border-2 border-success/40 bg-success/10 p-3 text-center font-bold text-success">
            {outcomes[0]}
          </div>
          <div className="rounded-lg border-2 border-danger/40 bg-danger/10 p-3 text-center font-bold text-danger">
            {outcomes[1]}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Anyone can trade either side on the live orderbook once the market is
          approved.
        </p>
      </div>

      <Field label="Collateral" hint="All markets settle in USDC.e.">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
          USDC.e — USD Coin (bridged)
        </div>
      </Field>

      <Field label="Settler" hint="Approved party who reports the winning outcome.">
        <SettlerSelect
          value={settler}
          onChange={(addr, feeBps) => {
            setSettler(addr);
            setSettlerFeeBps(feeBps);
          }}
          platformFeeBps={platformFeeBps}
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

      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          ${MARKET_CREATION_FEE_USD.toFixed(2)} creation fee
        </span>
        {" · "}
        <span className="font-medium text-foreground">
          {(settlerFeeBps / 100).toFixed(2)}% settler fee
        </span>
        {" · "}
        {walletSignatures} wallet signature{walletSignatures > 1 ? "s" : ""}
        {" · "}
        an admin reviews each market before it goes live
      </div>

      {error && (
        <div className="rounded-md border border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/10 p-3 text-sm text-[hsl(var(--danger))]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button type="submit" size="lg" disabled={isBusy || !allowMarketCreation}>
          {step === "approving" && "Approving fee…"}
          {step === "registering" && "Registering…"}
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
