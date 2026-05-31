/** Whether this bet names an off-chain custom resolver (on-chain settler stays @admin). */
export function hasCustomSettler(bet: {
  customSettler?: string | null;
}): boolean {
  return !!bet.customSettler?.trim();
}

/** Address shown as the human-chosen resolver (custom if set, else on-chain settler). */
export function displayResolver(bet: {
  settler: string;
  customSettler?: string | null;
}): string {
  return bet.customSettler?.trim() || bet.settler;
}
