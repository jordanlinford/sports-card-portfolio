/**
 * Probabilistic expected-value math for "should I grade this card?" decisions.
 *
 * Used by the raw-card scan result modal (graded-value-matrix) AND the sealed
 * product per-hit gradingRecommendation so both surfaces always agree.
 *
 * The math:
 *   expectedNet = P(PSA10) * net(PSA10) + P(PSA9) * net(PSA9)
 *               + P(lower) * (rawValue * lowerGradeRecoveryRatio)
 *   expectedProfit = expectedNet - rawValue - gradingFee
 * where net(price) = price * (1 - eBayFee) - shipping.
 *
 * All constants are documented and can be overridden per-call.
 */

export const PSA_GRADING_COSTS = {
  economy: 17,
  regular: 25,
  express: 75,
} as const;

export type GradingTier = keyof typeof PSA_GRADING_COSTS;

export const EBAY_FEE_RATE = 0.13;
export const EBAY_SHIPPING = 1.5;

export const DEFAULT_PSA10_HIT_RATE = 0.35;
export const DEFAULT_PSA9_HIT_RATE = 0.45;
export const DEFAULT_LOWER_GRADE_RECOVERY = 0.5;

export type GradingDataTier = 1 | 2 | 3;

export interface GradingEvOptions {
  rawValue: number;
  psa9Price: number | null;
  psa10Price: number | null;
  gradingTier?: GradingTier;
  psa10HitRate?: number;
  psa9HitRate?: number;
  lowerGradeRecovery?: number;
  /** Data quality tier of the PSA 9/10 inputs. Used only to label/qualify the verdict. */
  dataTier?: GradingDataTier;
}

export interface GradingEvResult {
  verdict: "YES" | "MAYBE" | "NO";
  reason: string;
  gradingFee: number;
  expectedNet: number;
  expectedProfit: number;
  psa10Net: number;
  psa9Net: number;
  lowerNet: number;
  psa10HitRate: number;
  psa9HitRate: number;
  lowerHitRate: number;
  dataTier: GradingDataTier;
}

function netAfterFees(salePrice: number): number {
  return Math.max(0, salePrice * (1 - EBAY_FEE_RATE) - EBAY_SHIPPING);
}

function formatCurrency(value: number): string {
  if (value >= 100) return `$${Math.round(value)}`;
  if (value >= 10) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * Compute probabilistic grading EV.
 *
 * Returns a verdict only when at least one PSA price is provided. If both are
 * null the caller should not surface a recommendation at all.
 */
export function computeGradingEv(opts: GradingEvOptions): GradingEvResult {
  const {
    rawValue,
    psa9Price,
    psa10Price,
    gradingTier = "regular",
    psa10HitRate = DEFAULT_PSA10_HIT_RATE,
    psa9HitRate = DEFAULT_PSA9_HIT_RATE,
    lowerGradeRecovery = DEFAULT_LOWER_GRADE_RECOVERY,
    dataTier = 1,
  } = opts;

  const gradingFee = PSA_GRADING_COSTS[gradingTier];

  const psa10Net = psa10Price ? netAfterFees(psa10Price) : 0;
  const psa9Net = psa9Price ? netAfterFees(psa9Price) : 0;
  const lowerNet = netAfterFees(rawValue * lowerGradeRecovery);

  // Normalize hit rates so they sum to 1 even if the caller misconfigures.
  let p10 = Math.max(0, psa10Price ? psa10HitRate : 0);
  let p9 = Math.max(0, psa9Price ? psa9HitRate : 0);
  const sumTop = p10 + p9;
  if (sumTop > 1) {
    p10 = p10 / sumTop;
    p9 = p9 / sumTop;
  }
  const pLower = Math.max(0, 1 - p10 - p9);

  const expectedNet = psa10Net * p10 + psa9Net * p9 + lowerNet * pLower;
  const expectedProfit = expectedNet - rawValue - gradingFee;

  // Verdict thresholds — based on the probabilistic profit, not just PSA 10 upside.
  // YES requires meaningfully positive expected profit (>20% of raw OR >$25 absolute).
  // MAYBE requires positive expected profit at all (above grading cost+fees+raw).
  // NO otherwise.
  let verdict: GradingEvResult["verdict"];
  let reason: string;

  const profitFloor = Math.max(rawValue * 0.2, 25);

  if (expectedProfit >= profitFloor) {
    verdict = "YES";
    reason = `Expected profit ~${formatCurrency(expectedProfit)} after grading + eBay fees (assumes ${Math.round(p10 * 100)}% PSA 10 / ${Math.round(p9 * 100)}% PSA 9 hit rate).`;
  } else if (expectedProfit > 0) {
    verdict = "MAYBE";
    reason = `Slim expected profit ~${formatCurrency(expectedProfit)} after grading + fees. Only worth it if you can hit a PSA 10 (~${formatCurrency(psa10Net - rawValue - gradingFee)} upside).`;
  } else {
    verdict = "NO";
    if (psa10Net - rawValue - gradingFee > 0) {
      reason = `Even a PSA 10 only nets ~${formatCurrency(psa10Net - rawValue - gradingFee)} after fees, and the probability isn't high enough to justify the risk.`;
    } else {
      reason = `Grading fee + eBay fees exceed the upside even at PSA 10.`;
    }
  }

  // Tier 2/3 confidence haircut: never let a no-comp guess scream YES.
  if (dataTier === 2 && verdict === "YES") {
    verdict = "MAYBE";
    reason = `${reason} Estimate based on sibling parallel comps — confidence is moderate.`;
  } else if (dataTier === 3) {
    if (verdict === "YES") {
      verdict = "MAYBE";
      reason = `${reason} Numbers are heuristic (no direct comps) — treat as a directional guess only.`;
    } else if (verdict === "MAYBE") {
      reason = `${reason} Numbers are heuristic (no direct comps).`;
    }
  }

  return {
    verdict,
    reason,
    gradingFee,
    expectedNet,
    expectedProfit,
    psa10Net,
    psa9Net,
    lowerNet,
    psa10HitRate: p10,
    psa9HitRate: p9,
    lowerHitRate: pLower,
    dataTier,
  };
}

export const GRADING_DISCLAIMER = "PSA pricing changes — verify current rates at psacard.com.";
