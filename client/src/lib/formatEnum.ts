export function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Ensure an AI-generated string ends in a complete sentence.
 * - Trims trailing whitespace and dangling punctuation like commas, dashes, ellipses.
 * - If the text contains at least one sentence terminator, truncate at the last one
 *   so we never display a partial trailing sentence (e.g. "...This is a buy. Year 3 receivers").
 * - If there is no terminator at all, append a period.
 * - Returns empty string for empty/null input.
 */
export function enforceCompleteSentences(text: string | null | undefined): string {
  if (!text) return "";
  let s = String(text).trim();
  if (!s) return "";

  s = s.replace(/[\s,;:\-–—]+$/g, "").replace(/\.{2,}$/g, "");
  if (!s) return "";

  const terminators = /[.!?]["')\]]?/g;
  let lastIdx = -1;
  let match: RegExpExecArray | null;
  while ((match = terminators.exec(s)) !== null) {
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx === -1) {
    return s + ".";
  }

  if (lastIdx === s.length) {
    return s;
  }

  const trimmed = s.slice(0, lastIdx).trim();
  return trimmed || s + ".";
}

/**
 * Extract the first complete sentence from a longer body of text.
 * Useful as a title fallback when a headline/label field is missing or empty.
 */
export function firstSentence(text: string | null | undefined): string {
  if (!text) return "";
  const s = String(text).trim();
  if (!s) return "";
  const match = s.match(/^[^.!?]+[.!?]/);
  if (match) return match[0].trim();
  return s;
}
