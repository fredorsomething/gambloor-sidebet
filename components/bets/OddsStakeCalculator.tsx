"use client";

import { useMemo, useState } from "react";

import { TokenIcon } from "@/components/ui/TokenIcon";
import {
  clampOddsPercent,
  formatCalculatedStake,
  MAX_ODDS_PERCENT,
  MIN_ODDS_PERCENT,
  oddsPercentFromStakes,
  parseStakeFloat,
  theirStakeFromYoursAndOdds,
  yourStakeFromTheirsAndOdds,
} from "@/lib/sidebetOdds";

type Props = {
  tokenSymbol: string;
  yourStakeStr: string;
  theirStakeStr: string;
  onYourStakeChange: (value: string) => void;
  onTheirStakeChange: (value: string) => void;
  yourStakeHint?: string;
  disabled?: boolean;
};

export function OddsStakeCalculator({
  tokenSymbol,
  yourStakeStr,
  theirStakeStr,
  onYourStakeChange,
  onTheirStakeChange,
  yourStakeHint,
  disabled,
}: Props) {
  const [oddsPercent, setOddsPercent] = useState(() => {
    const y = parseStakeFloat(yourStakeStr);
    const t = parseStakeFloat(theirStakeStr);
    if (y != null && t != null) return oddsPercentFromStakes(y, t) ?? 50;
    return 50;
  });

  const yourNum = useMemo(() => parseStakeFloat(yourStakeStr), [yourStakeStr]);
  const theirNum = useMemo(
    () => parseStakeFloat(theirStakeStr),
    [theirStakeStr],
  );

  function applyTheirFromOdds(nextOdds: number, yourStake = yourNum) {
    if (yourStake == null || yourStake <= 0) return;
    const theirs = theirStakeFromYoursAndOdds(yourStake, nextOdds);
    if (theirs == null) return;
    onTheirStakeChange(formatCalculatedStake(theirs));
  }

  function applyYourFromOdds(nextOdds: number, theirStake = theirNum) {
    if (theirStake == null || theirStake <= 0) return;
    const yours = yourStakeFromTheirsAndOdds(theirStake, nextOdds);
    if (yours == null) return;
    onYourStakeChange(formatCalculatedStake(yours));
  }

  function handleOddsChange(raw: number) {
    const nextOdds = clampOddsPercent(raw);
    setOddsPercent(nextOdds);
    if (yourNum != null && yourNum > 0) {
      applyTheirFromOdds(nextOdds, yourNum);
    } else if (theirNum != null && theirNum > 0) {
      applyYourFromOdds(nextOdds, theirNum);
    }
  }

  function handleYourStakeChange(value: string) {
    onYourStakeChange(value);
    const yours = parseStakeFloat(value);
    if (yours == null || yours <= 0) return;
    applyTheirFromOdds(oddsPercent, yours);
  }

  function handleTheirStakeChange(value: string) {
    onTheirStakeChange(value);
    const yours = parseStakeFloat(yourStakeStr);
    const theirs = parseStakeFloat(value);
    if (yours == null || theirs == null || yours <= 0 || theirs <= 0) return;
    const nextOdds = oddsPercentFromStakes(yours, theirs);
    if (nextOdds != null) setOddsPercent(nextOdds);
  }

  const showSummary = yourNum != null && theirNum != null && yourNum > 0 && theirNum > 0;

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/15 p-4">
      <div className="space-y-1">
        <span className="label">Stakes & odds</span>
        <p className="text-xs text-muted-foreground">
          Set your stake and target odds — we&apos;ll fill the counterparty stake.
          At 80%, you&apos;d risk $4 to win $1.
        </p>
      </div>

      <label className="space-y-1.5 block">
        <div className="flex items-baseline justify-between gap-2">
          <span className="label">Your stake</span>
          {yourStakeHint && (
            <span className="text-[11px] text-muted-foreground">{yourStakeHint}</span>
          )}
        </div>
        <input
          className="input font-mono"
          inputMode="decimal"
          value={yourStakeStr}
          onChange={(e) => handleYourStakeChange(e.target.value)}
          placeholder="4"
          disabled={disabled}
        />
      </label>

      <div className="space-y-3 rounded-xl border border-border/60 bg-card/70 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="label">Your odds</div>
            <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-foreground">
              {oddsPercent.toFixed(oddsPercent % 1 === 0 ? 0 : 1)}%
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="sr-only">Odds percent</span>
            <input
              type="number"
              className="input w-20 font-mono text-right"
              min={MIN_ODDS_PERCENT}
              max={MAX_ODDS_PERCENT}
              step={0.1}
              value={oddsPercent}
              onChange={(e) => handleOddsChange(Number(e.target.value))}
              disabled={disabled}
            />
            <span>%</span>
          </label>
        </div>

        <input
          type="range"
          min={MIN_ODDS_PERCENT}
          max={MAX_ODDS_PERCENT}
          step={1}
          value={Math.round(oddsPercent)}
          onChange={(e) => handleOddsChange(Number(e.target.value))}
          disabled={disabled}
          className="h-2 w-full cursor-pointer accent-[hsl(var(--primary))]"
          aria-label="Odds slider"
        />

        <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Long shot</span>
          <span>Even</span>
          <span>Favorite</span>
        </div>
      </div>

      {showSummary && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-card/80 px-3 py-2.5 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              You risk
            </div>
            <div className="mt-1 inline-flex items-center justify-center gap-1 font-mono text-base font-bold tabular-nums text-foreground">
              {yourStakeStr}
              <TokenIcon symbol={tokenSymbol} size={14} />
            </div>
          </div>
          <div className="rounded-xl border border-success/35 bg-success/10 px-3 py-2.5 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-success">
              To win
            </div>
            <div className="mt-1 inline-flex items-center justify-center gap-1 font-mono text-base font-bold tabular-nums text-success">
              {theirStakeStr}
              <TokenIcon symbol={tokenSymbol} size={14} />
            </div>
          </div>
        </div>
      )}

      <label className="space-y-1.5 block">
        <span className="label">Their stake</span>
        <input
          className="input font-mono"
          inputMode="decimal"
          value={theirStakeStr}
          onChange={(e) => handleTheirStakeChange(e.target.value)}
          placeholder="1"
          disabled={disabled}
        />
        <p className="text-[11px] text-muted-foreground">
          Auto-filled from your stake and odds — edit manually to tweak the line.
        </p>
      </label>
    </div>
  );
}
