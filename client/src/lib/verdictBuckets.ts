export type VerdictBucket = "bullish" | "bearish" | "neutral";

const BULLISH = new Set(["BUY", "ACCUMULATE", "STRONG_BUY"]);
const BEARISH = new Set(["SELL", "AVOID", "AVOID_NEW_MONEY", "TRADE_THE_HYPE"]);
const NEUTRAL = new Set([
  "HOLD",
  "HOLD_CORE",
  "WATCH",
  "MONITOR",
  "LONG_HOLD",
  "LEGACY_HOLD",
  "LITTLE_VALUE",
  "SPECULATIVE_FLYER",
]);

export function bucketVerdict(verdict?: string | null): VerdictBucket | null {
  if (!verdict) return null;
  const v = String(verdict).toUpperCase().trim();
  if (!v) return null;
  if (BULLISH.has(v)) return "bullish";
  if (BEARISH.has(v)) return "bearish";
  if (NEUTRAL.has(v)) return "neutral";
  // Lowercase signal types from /api/alpha/signals/player
  const lower = v.toLowerCase();
  if (lower === "buy") return "bullish";
  if (lower === "sell") return "bearish";
  if (lower === "hold") return "neutral";
  return null;
}

export function formatVerdictLabel(verdict?: string | null): string {
  if (!verdict) return "";
  return String(verdict).toUpperCase().replace(/_/g, " ");
}

/**
 * Reduce an array of player-level signals (each with signalType buy/sell/hold)
 * to a single aggregate bucket using simple majority. Returns null if empty.
 */
export function aggregatePlayerSignalBucket(
  signals: Array<{ signalType?: string | null }> | undefined | null
): { bucket: VerdictBucket; label: string } | null {
  if (!signals || signals.length === 0) return null;
  const counts: Record<VerdictBucket, number> = { bullish: 0, bearish: 0, neutral: 0 };
  for (const s of signals) {
    const b = bucketVerdict(s.signalType);
    if (b) counts[b]++;
  }
  const total = counts.bullish + counts.bearish + counts.neutral;
  if (total === 0) return null;
  let winner: VerdictBucket = "neutral";
  if (counts.bullish > counts.bearish && counts.bullish > counts.neutral) winner = "bullish";
  else if (counts.bearish > counts.bullish && counts.bearish > counts.neutral) winner = "bearish";
  else if (counts.neutral >= counts.bullish && counts.neutral >= counts.bearish) winner = "neutral";
  const labelMap: Record<VerdictBucket, string> = {
    bullish: "BUY",
    bearish: "SELL",
    neutral: "HOLD",
  };
  return { bucket: winner, label: labelMap[winner] };
}
