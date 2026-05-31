"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress } from "viem";

import { jsonFetch } from "@/lib/fetcher";
import { formatSettlerLabel, isAdminAddress } from "@/lib/admin";
import { shortAddr } from "@/lib/utils";
import type { ApprovedSettlerInfo } from "@/lib/settlers";

type Props = {
  value: string;
  onChange: (address: string, feeBps: number, isCustom?: boolean) => void;
  /** Platform fee (bps) used for custom per-bet settlers. */
  platformFeeBps: number;
  /** Hide this address from the list (the creator can't settle their own bet). */
  excludeAddress?: string | null;
};

/**
 * Pick an approved settler or paste a custom wallet that resolves just this bet.
 * Custom settlers use the platform fee; @admin can always settle as a fallback.
 */
export function SettlerSelect({
  value,
  onChange,
  platformFeeBps,
  excludeAddress,
}: Props) {
  const [settlers, setSettlers] = useState<ApprovedSettlerInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [customActive, setCustomActive] = useState(false);

  useEffect(() => {
    let active = true;
    jsonFetch<{ settlers: ApprovedSettlerInfo[] }>("/api/settlers")
      .then((d) => {
        if (active) setSettlers(d.settlers);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  const exclude = excludeAddress?.toLowerCase();
  const options = useMemo(
    () =>
      (settlers ?? []).filter((s) => s.address.toLowerCase() !== exclude),
    [settlers, exclude],
  );

  const adminOption = options.find((s) => isAdminAddress(s.address));
  const listOptions = options.filter((s) => !isAdminAddress(s.address));

  // Default to @admin when nothing chosen yet.
  useEffect(() => {
    if (value || customActive) return;
    const pick = adminOption ?? options[0];
    if (pick) onChange(pick.address, pick.feeBps, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, value, customActive, adminOption]);

  const customTrim = customInput.trim();
  let customValid = false;
  let customNormalized = "";
  let customError: string | null = null;
  if (customTrim) {
    if (!isAddress(customTrim)) {
      customError = "Enter a valid wallet address";
    } else {
      try {
        customNormalized = getAddress(customTrim);
        customValid = true;
        if (exclude && customNormalized.toLowerCase() === exclude) {
          customValid = false;
          customError = "You can't be your own settler";
        }
      } catch {
        customError = "Enter a valid wallet address";
      }
    }
  }

  function selectApproved(addr: string, feeBps: number) {
    setCustomActive(false);
    setCustomInput("");
    onChange(addr, feeBps, false);
  }

  function applyCustom() {
    if (!customValid) return;
    setCustomActive(true);
    onChange(customNormalized, platformFeeBps, true);
  }

  useEffect(() => {
    if (!customActive || !customValid) return;
    onChange(customNormalized, platformFeeBps, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customActive, customValid, customNormalized, platformFeeBps]);

  if (error) {
    return (
      <div className="rounded-md border border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/10 p-3 text-sm text-[hsl(var(--danger))]">
        Failed to load settlers: {error}
      </div>
    );
  }

  if (settlers === null) {
    return <div className="text-sm text-muted-foreground">Loading settlers…</div>;
  }

  if (options.length === 0 && !adminOption) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
        No approved settlers are available yet. Paste a custom settler wallet
        below, or ask an admin to approve one.
      </div>
    );
  }

  const showCustomSelected =
    customActive && customValid && value.toLowerCase() === customNormalized.toLowerCase();

  return (
    <div className="space-y-3">
      {adminOption && (
        <SettlerOption
          selected={!showCustomSelected && value.toLowerCase() === adminOption.address.toLowerCase()}
          label={formatSettlerLabel(adminOption.address)}
          sub={`${shortAddr(adminOption.address)} · fee ${(adminOption.feeBps / 100).toFixed(2)}%`}
          onSelect={() => selectApproved(adminOption.address, adminOption.feeBps)}
        />
      )}

      {listOptions.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Whitelisted settlers
          </span>
          {listOptions.map((s) => (
            <SettlerOption
              key={s.address}
              selected={
                !showCustomSelected &&
                value.toLowerCase() === s.address.toLowerCase()
              }
              label={formatSettlerLabel(s.address)}
              sub={`fee ${(s.feeBps / 100).toFixed(2)}%`}
              onSelect={() => selectApproved(s.address, s.feeBps)}
            />
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-md border border-dashed border-border/80 p-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Add custom settler
        </span>
        <p className="text-[11px] text-muted-foreground">
          Paste a wallet that will declare the winning outcome for this sidebet. Once they've determined the outcome, payout settles automatically.
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1 font-mono text-sm"
            value={customInput}
            onChange={(e) => {
              setCustomInput(e.target.value);
              if (customActive) setCustomActive(false);
            }}
            placeholder="0x…"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!customValid}
            className="shrink-0 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-40"
          >
            Use
          </button>
        </div>
        {customError && (
          <p className="text-xs text-[hsl(var(--danger))]">{customError}</p>
        )}
        {showCustomSelected && (
          <p className="text-xs text-success">
            Custom settler selected: {shortAddr(customNormalized)}
          </p>
        )}
      </div>
    </div>
  );
}

function SettlerOption({
  selected,
  label,
  sub,
  onSelect,
}: {
  selected: boolean;
  label: string;
  sub: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left text-sm transition-colors ${
        selected
          ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10"
          : "border-border hover:border-border/80"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{label}</span>
        <span className="block font-mono text-xs text-muted-foreground">{sub}</span>
      </span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white"
            : "border-border text-transparent"
        }`}
        aria-hidden
      >
        ✓
      </span>
    </button>
  );
}
