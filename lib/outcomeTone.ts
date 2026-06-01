export type OutcomeTone = "success" | "danger" | "muted";

/** Green/red styling for binary Yes/No and Up/Down outcome labels. */
export function outcomeLabelTone(label: string): OutcomeTone {
  const l = label.trim().toLowerCase();
  if (l === "yes" || l === "up") return "success";
  if (l === "no" || l === "down") return "danger";
  return "muted";
}

/** Tone for an outcome index when the market uses a binary Yes/No or Up/Down pair. */
export function binaryOutcomeIndexTone(
  outcomes: string[],
  index: number,
): OutcomeTone {
  if (outcomes.length !== 2) return "muted";
  const a = outcomes[0]?.trim().toLowerCase();
  const b = outcomes[1]?.trim().toLowerCase();
  const isYesNo = a === "yes" && b === "no";
  const isUpDown = a === "up" && b === "down";
  if (!isYesNo && !isUpDown) return "muted";
  return index === 0 ? "success" : "danger";
}

export function outcomeToneClass(tone: OutcomeTone): string {
  switch (tone) {
    case "success":
      return "bg-success/15 text-success";
    case "danger":
      return "bg-danger/15 text-danger";
    default:
      return "bg-muted text-muted-foreground";
  }
}
