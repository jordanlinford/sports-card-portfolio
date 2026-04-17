/**
 * Strip debug/error strings (e.g. "Err (14 CMP should be 114)") that occasionally
 * leak into card.set / card.variation / card subtitle fields. Returns "" for
 * obvious error payloads so they never render in the UI.
 */
export function sanitizeCardField(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";
  if (/^err\b/i.test(s)) return "";
  if (/CMP should be/i.test(s)) return "";
  return s;
}
