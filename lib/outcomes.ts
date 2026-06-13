/** Max outcomes for new sidebets and markets (V3 allows up to 16 on-chain). */
export const MIN_OUTCOMES = 2;
export const MAX_OUTCOMES = 12;

export const OUTCOME_PRESETS = {
  "yes-no": ["Yes", "No"],
  "up-down": ["Up", "Down"],
} as const;

export type OutcomePresetId = keyof typeof OUTCOME_PRESETS;

export function defaultOutcomeLabel(index: number): string {
  return `Outcome ${index + 1}`;
}

export function normalizeOutcomes(raw: string[]): string[] {
  return raw.map((o) => o.trim()).filter(Boolean);
}

/** Validate outcome labels for creation forms and API payloads. */
export function validateOutcomes(
  raw: string[],
): { ok: true; outcomes: string[] } | { ok: false; error: string } {
  const outcomes = normalizeOutcomes(raw);
  if (outcomes.length < MIN_OUTCOMES) {
    return { ok: false, error: `Add at least ${MIN_OUTCOMES} outcomes` };
  }
  if (outcomes.length > MAX_OUTCOMES) {
    return {
      ok: false,
      error: `At most ${MAX_OUTCOMES} outcomes allowed`,
    };
  }
  if (outcomes.some((o) => o.length > 80)) {
    return { ok: false, error: "Each outcome label must be 80 characters or less" };
  }
  const lower = outcomes.map((o) => o.toLowerCase());
  if (new Set(lower).size !== outcomes.length) {
    return { ok: false, error: "Outcome labels must be unique" };
  }
  return { ok: true, outcomes };
}

export function isBinaryPreset(outcomes: string[]): OutcomePresetId | null {
  const a = outcomes[0]?.trim();
  const b = outcomes[1]?.trim();
  if (outcomes.length !== 2 || !a || !b) return null;
  if (a === "Yes" && b === "No") return "yes-no";
  if (a === "Up" && b === "Down") return "up-down";
  return null;
}
