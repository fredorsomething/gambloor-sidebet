"use client";

import { isBinaryPreset } from "@/lib/outcomes";
import { cn } from "@/lib/utils";

type Props = {
  outcomes: string[];
  proposerOutcome: number;
  acceptorOutcome: number;
  onProposerChange: (index: number) => void;
  onAcceptorChange: (index: number) => void;
  disabled?: boolean;
};

/** Pick which outcome the proposer backs and which the counterparty must back. */
export function SidebetSidesPicker({
  outcomes,
  proposerOutcome,
  acceptorOutcome,
  onProposerChange,
  onAcceptorChange,
  disabled,
}: Props) {
  const preset = isBinaryPreset(outcomes);

  function pickProposer(index: number) {
    onProposerChange(index);
    if (preset) {
      const other = index === 0 ? 1 : 0;
      onAcceptorChange(other);
      return;
    }
    if (index === acceptorOutcome) {
      const alt = outcomes.findIndex((_, i) => i !== index);
      if (alt >= 0) onAcceptorChange(alt);
    }
  }

  if (preset === "yes-no" || preset === "up-down") {
    const labels =
      preset === "up-down"
        ? { a: "UP", b: "DOWN", aIdx: 0, bIdx: 1 }
        : { a: "YES", b: "NO", aIdx: 0, bIdx: 1 };

    return (
      <div className="space-y-3">
        <span className="label">Your side</span>
        <div className="grid grid-cols-2 gap-3">
          <SideButton
            label={labels.a}
            sub="You back this"
            active={proposerOutcome === labels.aIdx}
            tone="success"
            disabled={disabled}
            onClick={() => pickProposer(labels.aIdx)}
          />
          <SideButton
            label={labels.b}
            sub="You back this"
            active={proposerOutcome === labels.bIdx}
            tone="danger"
            disabled={disabled}
            onClick={() => pickProposer(labels.bIdx)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Counterparty takes{" "}
          <b>{outcomes[proposerOutcome === 0 ? 1 : 0]}</b>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OutcomePick
        title="You back"
        outcomes={outcomes}
        selected={proposerOutcome}
        disabled={disabled}
        onSelect={pickProposer}
      />
      <OutcomePick
        title="Counterparty must back"
        outcomes={outcomes}
        selected={acceptorOutcome}
        disabled={disabled}
        exclude={proposerOutcome}
        onSelect={onAcceptorChange}
      />
    </div>
  );
}

function SideButton({
  label,
  sub,
  active,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  tone: "success" | "danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg border-2 p-4 text-center font-bold transition-all",
        tone === "success"
          ? active
            ? "border-success bg-success/15 text-success"
            : "border-border text-muted-foreground hover:border-success/40"
          : active
            ? "border-danger bg-danger/15 text-danger"
            : "border-border text-muted-foreground hover:border-danger/40",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="text-lg">{label}</div>
      <div className="mt-1 text-[11px] font-normal">{sub}</div>
    </button>
  );
}

function OutcomePick({
  title,
  outcomes,
  selected,
  exclude,
  disabled,
  onSelect,
}: {
  title: string;
  outcomes: string[];
  selected: number;
  exclude?: number;
  disabled?: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="label">{title}</span>
      <div className="flex flex-wrap gap-2">
        {outcomes.map((label, index) => {
          if (index === exclude) return null;
          const active = selected === index;
          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(index)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              {label.trim() || `Outcome ${index + 1}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
