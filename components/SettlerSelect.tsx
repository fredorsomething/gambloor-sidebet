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
 * Pick the default admin settler, a whitelisted settler, or a custom wallet.
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

  const showCustomSelected =
    customActive &&
    customValid &&
    value.toLowerCase() === customNormalized.toLowerCase();

  const dropdownOptions = [
    ...(adminOption ? [adminOption] : []),
    ...listOptions,
  ];

  function clearCustom() {
    setCustomActive(false);
    setCustomInput("");
    const pick = adminOption ?? options[0];
    if (pick) selectApproved(pick.address, pick.feeBps);
  }

  return (
    <div className="space-y-4">
      {dropdownOptions.length > 0 && !showCustomSelected && (
        <select
          className="input"
          value={value}
          onChange={(e) => {
            const addr = e.target.value;
            const pick = dropdownOptions.find(
              (s) => s.address.toLowerCase() === addr.toLowerCase(),
            );
            if (pick) selectApproved(pick.address, pick.feeBps);
          }}
        >
          {adminOption && (
            <option value={adminOption.address}>
              {formatSettlerLabel(adminOption.address)} ·{" "}
              {(adminOption.feeBps / 100).toFixed(2)}% fee
            </option>
          )}
          {listOptions.length > 0 && (
            <optgroup label="Whitelisted">
              {listOptions.map((s) => (
                <option key={s.address} value={s.address}>
                  {formatSettlerLabel(s.address)} · {(s.feeBps / 100).toFixed(2)}% fee
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}

      {showCustomSelected && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
          <span>
            Custom: <span className="font-mono">{shortAddr(customNormalized)}</span>
          </span>
          <button
            type="button"
            onClick={clearCustom}
            className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Use @Admin instead
          </button>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
        <span className="text-sm font-medium">Custom settler</span>
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
            Using {shortAddr(customNormalized)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Your counterparty will see this wallet and has to agree before the bet
          locks in.
        </p>
      </div>
    </div>
  );
}
