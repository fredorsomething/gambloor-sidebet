"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  decodeEventLog,
  getAddress,
  isAddress,
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
import { TokenSymbol } from "@/components/ui/TokenIcon";
import { LowGasBanner } from "@/components/wallet/FundWalletModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { ERC20_ABI, SIDEBET_ESCROW_V2_ABI } from "@/lib/abi";
import { cryptoErrorSummary, formatCryptoError } from "@/lib/cryptoErrors";
import { useEnsurePolygon } from "@/lib/hooks/useEnsurePolygon";
import { usePlatformSettings } from "@/lib/hooks/usePlatformSettings";
import { useTxSender } from "@/lib/hooks/useTxSender";
import { useEscrow } from "@/lib/hooks/useEscrow";
import { useTokenInfo } from "@/lib/hooks/useTokenInfo";
import { jsonFetch } from "@/lib/fetcher";
import { ADMIN_ADDRESS } from "@/lib/admin";
import { getMarketCollateralToken } from "@/lib/chains";
import {
  ACCEPT_EXPIRY_PRESETS,
  NO_ACCEPT_DEADLINE,
  acceptDeadlineUnixFromDuration,
  resolveAcceptExpirySeconds,
  validateAcceptDeadlineUnix,
  type AcceptExpiryPresetId,
  type AcceptExpiryUnit,
} from "@/lib/sidebetExpiry";
import {
  SIDEBET_CREATION_FEE_RAW,
  SIDEBET_CREATION_FEE_USD,
} from "@/lib/sidebetCreationFee";
import { buildTermsHash, formatToken, parseAmount } from "@/lib/utils";

type Step = "idle" | "payingFee" | "approving" | "creating" | "indexing" | "done";
type BinaryStyle = "yes-no" | "up-down";

export function CreateBetForm() {
  const router = useRouter();
  const { push } = useToast();
  const { address: account } = useAccount();
  const { getAccessToken } = usePrivy();
  const chainId = useChainId();
  const { escrow } = useEscrow();
  const publicClient = usePublicClient();
  const ensurePolygon = useEnsurePolygon();

  const usdceToken = useMemo(() => getMarketCollateralToken(), []);
  const tokenAddress = usdceToken.address as Address;
  const tokenMeta = usdceToken;

  // Content
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Outcomes + stance
  const [binaryStyle, setBinaryStyle] = useState<BinaryStyle>("yes-no");
  const [stance, setStance] = useState<"yes" | "no">("yes");

  // Stakes
  const [yourStakeStr, setYourStakeStr] = useState("");
  const [theirStakeStr, setTheirStakeStr] = useState("");

  const platformQ = usePlatformSettings();
  const platformFeeBps = platformQ.data?.sidebetFeeBps ?? 0;

  // Settler + end date
  const [settler, setSettler] = useState("");
  const [customSettler, setCustomSettler] = useState<string | null>(null);
  const [settlerFeeBps, setSettlerFeeBps] = useState(0);
  const [endDate, setEndDate] = useState(""); // yyyy-mm-dd
  const [offerExpires, setOfferExpires] = useState(false);
  const [expiryPreset, setExpiryPreset] = useState<AcceptExpiryPresetId>("24h");
  const [customExpiryValue, setCustomExpiryValue] = useState("1");
  const [customExpiryUnit, setCustomExpiryUnit] =
    useState<AcceptExpiryUnit>("days");

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (platformQ.data != null && !settler) {
      setSettlerFeeBps(platformFeeBps);
    }
  }, [platformFeeBps, platformQ.data, settler]);

  const decimals = tokenMeta?.decimals ?? 6;
  const live = useTokenInfo({
    token: tokenAddress ? (tokenAddress as Address) : undefined,
    owner: account,
    spender: escrow as Address | undefined,
  });
  const effectiveDecimals = live.decimals ?? decimals;

  const binaryOutcomes = useMemo(
    () => (binaryStyle === "up-down" ? (["Up", "Down"] as const) : (["Yes", "No"] as const)),
    [binaryStyle],
  );

  const termsPlaceholder =
    binaryStyle === "up-down"
      ? `If BTC closes above $100k on Dec 31, "Up" wins. Otherwise "Down" wins.`
      : `If the Knicks play in the 2026 ECF, "Yes" wins. Otherwise "No" wins.`;

  const outcomes = useMemo(() => [...binaryOutcomes], [binaryOutcomes]);

  const myOutcome = stance === "yes" ? 0 : 1;
  const theirOutcome = stance === "yes" ? 1 : 0;

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
  const [creationFeeHash, setCreationFeeHash] = useState<Hex>();
  const [approveHash, setApproveHash] = useState<Hex>();
  const [createHash, setCreateHash] = useState<Hex>();
  const creationFeeWait = useWaitForTransactionReceipt({ hash: creationFeeHash });
  const approveWait = useWaitForTransactionReceipt({ hash: approveHash });
  const createWait = useWaitForTransactionReceipt({ hash: createHash });

  const isBusy = step !== "idle" && step !== "done";

  const walletSignatures = 2 + (needsApproval ? 1 : 0);

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
    if (!escrow) return "Escrow not configured for this chain";
    if (!tokenAddress || !isAddress(tokenAddress)) return "Pick a valid token";
    if (title.trim().length < 3) return "Title needs at least 3 characters";
    if (description.trim().length < 1) return "Add a short description";
    if (terms.trim().length < 1)
      return "Please be as specific as possible with your resolution terms";
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
    if (live.balance !== undefined && live.balance < yourStake + SIDEBET_CREATION_FEE_RAW)
      return `Insufficient ${tokenMeta?.symbol ?? "token"} balance — need ${yourStakeStr} stake plus $${SIDEBET_CREATION_FEE_USD.toFixed(2)} creation fee (${formatToken(
        live.balance,
        effectiveDecimals,
      )} available)`;
    if (!settler || !isAddress(settler)) return "Pick or add a settler";
    if (customSettler && getAddress(customSettler) === getAddress(account))
      return "You can't be your own settler";
    if (!customSettler && getAddress(settler) === getAddress(account))
      return "You can't be your own settler";
    if (offerExpires) {
      const durationSec = resolveAcceptExpirySeconds(
        expiryPreset,
        expiryPreset === "custom"
          ? {
              value: Number(customExpiryValue),
              unit: customExpiryUnit,
            }
          : undefined,
      );
      if (durationSec == null) return "Pick a valid offer expiry";
      const acceptDeadline = acceptDeadlineUnixFromDuration(durationSec);
      const dlErr = validateAcceptDeadlineUnix(acceptDeadline);
      if (dlErr) return dlErr;
    }
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

  async function runPayCreationFee() {
    setStep("payingFee");
    push({
      title: "Creation fee",
      description: `$${SIDEBET_CREATION_FEE_USD.toFixed(2)} USDC.e sent to Sidebet — required before creating a bet.`,
    });
    await ensurePolygon();
    const hash = await writeContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [ADMIN_ADDRESS, SIDEBET_CREATION_FEE_RAW],
    });
    setCreationFeeHash(hash);
  }

  async function runApproval() {
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
      args: [escrow as Address, yourStake],
    });
    setApproveHash(hash);
  }

  async function continueAfterCreationFee(pc: NonNullable<typeof pendingCreate>) {
    if (needsApproval) {
      await runApproval();
    } else {
      await runCreate(pc);
    }
  }

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
        BigInt(pc.acceptDeadline),
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
    const acceptDeadline = offerExpires
      ? acceptDeadlineUnixFromDuration(
          resolveAcceptExpirySeconds(
            expiryPreset,
            expiryPreset === "custom"
              ? {
                  value: Number(customExpiryValue),
                  unit: customExpiryUnit,
                }
              : undefined,
          )!,
        )
      : NO_ACCEPT_DEADLINE;

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
      await runPayCreationFee();
    } catch (err: unknown) {
      setStep("idle");
      setPendingCreate(null);
      const msg = cryptoErrorSummary(err, "Couldn't create bet");
      setError(msg);
      const { title, description } = formatCryptoError(err, {
        fallbackTitle: "Couldn't create bet",
      });
      push({ title, description, variant: "danger" });
    }
  }

  // After creation fee confirms, approve or create.
  useEffect(() => {
    if (step !== "payingFee") return;
    if (!creationFeeWait.isSuccess) return;
    if (!pendingCreate) return;
    void (async () => {
      try {
        await continueAfterCreationFee(pendingCreate);
      } catch (err: unknown) {
        setStep("idle");
        setPendingCreate(null);
        const msg = cryptoErrorSummary(err, "Couldn't create bet");
        setError(msg);
        const { title, description } = formatCryptoError(err, {
          fallbackTitle: "Couldn't create bet",
        });
        push({ title, description, variant: "danger" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, creationFeeWait.isSuccess]);

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
        const msg = cryptoErrorSummary(err, "Couldn't create bet");
        setError(msg);
        const { title, description } = formatCryptoError(err, {
          fallbackTitle: "Couldn't create bet",
        });
        push({ title, description, variant: "danger" });
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
            creationFeeTxHash: creationFeeHash,
            proposer: account,
            settler: getAddress(settler),
            customSettler: customSettler ? getAddress(customSettler) : null,
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
          label="Rules"
          hint="Resolution criteria — please be as specific as possible about what makes each outcome win."
        >
          <textarea
            className="textarea min-h-[140px]"
            value={terms}
            onChange={(e) => {
              setTerms(e.target.value);
              if (error) setError(null);
            }}
            placeholder={termsPlaceholder}
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
            <button
              type="button"
              onClick={() => setStance("yes")}
              className={`rounded-lg border-2 p-4 text-center font-bold transition-all ${
                stance === "yes"
                  ? "border-success bg-success/15 text-success"
                  : "border-border text-muted-foreground hover:border-success/40"
              }`}
            >
              <div className="text-lg">
                {binaryStyle === "up-down" ? "UP" : "YES"}
              </div>
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
              <div className="text-lg">
                {binaryStyle === "up-down" ? "DOWN" : "NO"}
              </div>
              <div className="mt-1 text-[11px] font-normal">You back this</div>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="label">Token:</span>
          <TokenSymbol
            symbol={tokenMeta?.symbol ?? "USDC.e"}
            size={16}
            className="font-medium text-foreground"
          />
        </div>

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

        <Field label="Who settles it?">
          <SettlerSelect
            value={customSettler ?? settler}
            onChange={(addr, feeBps, isCustom) => {
              if (isCustom) {
                setCustomSettler(addr);
                setSettler(ADMIN_ADDRESS);
                setSettlerFeeBps(platformFeeBps);
              } else {
                setCustomSettler(null);
                setSettler(addr);
                setSettlerFeeBps(feeBps);
              }
            }}
            platformFeeBps={platformFeeBps}
            excludeAddress={account}
          />
        </Field>

        <Field label="Offer expiry">
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={offerExpires}
                onChange={(e) => setOfferExpires(e.target.checked)}
                disabled={isBusy}
              />
              <span>Expire if nobody takes the other side</span>
            </label>
            {offerExpires && (
              <div className="space-y-2">
                <select
                  className="input"
                  value={expiryPreset}
                  onChange={(e) =>
                    setExpiryPreset(e.target.value as AcceptExpiryPresetId)
                  }
                  disabled={isBusy}
                >
                  {ACCEPT_EXPIRY_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
                {expiryPreset === "custom" && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="input w-24 font-mono"
                      min={1}
                      value={customExpiryValue}
                      onChange={(e) => setCustomExpiryValue(e.target.value)}
                      disabled={isBusy}
                    />
                    <select
                      className="input flex-1"
                      value={customExpiryUnit}
                      onChange={(e) =>
                        setCustomExpiryUnit(e.target.value as AcceptExpiryUnit)
                      }
                      disabled={isBusy}
                    >
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Unmatched? Your stake comes back automatically.
                </p>
              </div>
            )}
          </div>
        </Field>

        <Field label="Expected end date (optional)">
          <input
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          ${SIDEBET_CREATION_FEE_USD.toFixed(2)} creation fee
        </span>
        {" · "}
        <span className="font-medium text-foreground">{(settlerFeeBps / 100).toFixed(2)}% platform fee</span>
        {" · "}
        {walletSignatures} wallet signatures
        {" · "}
        stake goes into escrow on create
      </div>

      {error && (
        <div className="rounded-md border border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/10 p-3 text-sm text-[hsl(var(--danger))]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" size="lg" disabled={isBusy}>
          {step === "payingFee" && "Paying fee…"}
          {step === "approving" && "Approving…"}
          {step === "creating" && "Creating…"}
          {step === "indexing" && "Indexing…"}
          {step === "done" && "Done"}
          {step === "idle" && "Create bet"}
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
