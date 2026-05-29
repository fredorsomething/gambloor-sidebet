"use client";

import { useEffect, useMemo, useState } from "react";

import { jsonFetch } from "@/lib/fetcher";
import { shortAddr } from "@/lib/utils";
import type { ApprovedSettlerInfo } from "@/lib/settlers";

type Props = {
  value: string;
  onChange: (address: string, feeBps: number) => void;
  /** Hide this address from the list (the creator can't settle their own bet). */
  excludeAddress?: string | null;
};

/**
 * Dropdown of approved settlers (username + address + fee), excluding the
 * creator. Selecting one reports its address and snapshot fee to the parent.
 */
export function SettlerSelect({ value, onChange, excludeAddress }: Props) {
  const [settlers, setSettlers] = useState<ApprovedSettlerInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Auto-select the first available settler when none chosen yet.
  useEffect(() => {
    if (!value && options.length > 0) {
      onChange(options[0].address, options[0].feeBps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, value]);

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

  if (options.length === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
        No approved settlers are available to you yet. A settler other than
        yourself must be approved before you can create this.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((s) => {
        const selected = value.toLowerCase() === s.address.toLowerCase();
        return (
          <button
            type="button"
            key={s.address}
            onClick={() => onChange(s.address, s.feeBps)}
            className={`flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left text-sm transition-colors ${
              selected
                ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10"
                : "border-border hover:border-border/80"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {s.username ? `@${s.username}` : "Settler"}
              </span>
              <span className="block font-mono text-xs text-muted-foreground">
                {shortAddr(s.address)} · fee {(s.feeBps / 100).toFixed(2)}%
              </span>
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
      })}
    </div>
  );
}
