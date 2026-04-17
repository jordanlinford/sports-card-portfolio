export function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
