"use client";

import { Plus, Trash2 } from "lucide-react";

import {
  MAX_OUTCOMES,
  MIN_OUTCOMES,
  OUTCOME_PRESETS,
  defaultOutcomeLabel,
  type OutcomePresetId,
} from "@/lib/outcomes";
import { cn } from "@/lib/utils";

type Props = {
  outcomes: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Show Yes/No and Up/Down quick-start presets. */
  showPresets?: boolean;
  hint?: string;
};

export function OutcomesEditor({
  outcomes,
  onChange,
  disabled,
  showPresets = true,
  hint,
}: Props) {
  function applyPreset(id: OutcomePresetId) {
    onChange([...OUTCOME_PRESETS[id]]);
  }

  function updateAt(index: number, value: string) {
    const next = [...outcomes];
    next[index] = value;
    onChange(next);
  }

  function removeAt(index: number) {
    if (outcomes.length <= MIN_OUTCOMES) return;
    onChange(outcomes.filter((_, i) => i !== index));
  }

  function addOutcome() {
    if (outcomes.length >= MAX_OUTCOMES) return;
    onChange([...outcomes, defaultOutcomeLabel(outcomes.length)]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label">
          Outcomes{" "}
          <span className="font-normal text-muted-foreground">
            ({outcomes.length}/{MAX_OUTCOMES})
          </span>
        </span>
        {showPresets && (
          <div className="flex gap-1 text-xs">
            {(Object.keys(OUTCOME_PRESETS) as OutcomePresetId[]).map((id) => (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => applyPreset(id)}
                className={cn(
                  "rounded-md px-2 py-1 transition-colors",
                  "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  disabled && "pointer-events-none opacity-50",
                )}
              >
                {id === "yes-no" ? "Yes / No" : "Up / Down"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {outcomes.map((label, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-xs font-mono text-muted-foreground">
              {index + 1}
            </span>
            <input
              className="input flex-1"
              value={label}
              onChange={(e) => updateAt(index, e.target.value)}
              placeholder={defaultOutcomeLabel(index)}
              maxLength={80}
              disabled={disabled}
            />
            <button
              type="button"
              disabled={disabled || outcomes.length <= MIN_OUTCOMES}
              onClick={() => removeAt(index)}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors",
                "hover:border-danger/40 hover:text-danger",
                (disabled || outcomes.length <= MIN_OUTCOMES) &&
                  "pointer-events-none opacity-40",
              )}
              aria-label={`Remove outcome ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {outcomes.length < MAX_OUTCOMES && (
        <button
          type="button"
          disabled={disabled}
          onClick={addOutcome}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm text-muted-foreground transition-colors",
            "hover:border-primary/40 hover:text-foreground",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <Plus className="h-4 w-4" />
          Add outcome
        </button>
      )}

      {hint && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
