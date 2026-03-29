import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import { eq } from "drizzle-orm";

export type DemandTier = 1 | 2 | 3 | 4;

export interface PlayerDemandContext {
  tier: DemandTier;
  tierLabel: string;
  demandScore: number;
  careerStage: string;
  sport: string;
  percentileInSport: number;
  isFromCache: boolean;
}

const TIER_LABELS: Record<DemandTier, string> = {
  1: "Elite market (high competition)",
  2: "Strong market",
  3: "Mid-tier market (limited demand)",
  4: "Weak market (minimal demand)",
};

const MULTIPLIER_RANGES: Record<DemandTier, Record<string, [number, number]>> = {
  1: {
    "99_49": [1.5, 2.0],
    "49_25": [1.5, 2.0],
    "25_10": [1.5, 2.5],
    "10_5": [1.3, 2.0],
    "5_2": [1.3, 1.8],
    "2_1": [1.5, 3.0],
  },
  2: {
    "99_49": [1.3, 1.6],
    "49_25": [1.3, 1.6],
    "25_10": [1.3, 1.8],
    "10_5": [1.2, 1.5],
    "5_2": [1.1, 1.4],
    "2_1": [1.3, 2.0],
  },
  3: {
    "99_49": [1.1, 1.3],
    "49_25": [1.1, 1.3],
    "25_10": [1.1, 1.3],
    "10_5": [1.05, 1.2],
    "5_2": [1.0, 1.15],
    "2_1": [1.1, 1.5],
  },
  4: {
    "99_49": [1.0, 1.1],
    "49_25": [1.0, 1.1],
    "25_10": [1.0, 1.1],
    "10_5": [1.0, 1.05],
    "5_2": [1.0, 1.05],
    "2_1": [1.0, 1.2],
  },
};

interface SportDemandDistribution {
  scores: number[];
  generatedAt: number;
}

const sportDistributionCache = new Map<string, SportDemandDistribution>();
const DISTRIBUTION_TTL_MS = 60 * 60 * 1000;

async function getSportDemandDistribution(sport: string): Promise<number[]> {
  const cached = sportDistributionCache.get(sport);
  if (cached && Date.now() - cached.generatedAt < DISTRIBUTION_TTL_MS) {
    return cached.scores;
  }

  const rows = await db
    .select({
      outlookJson: playerOutlookCache.outlookJson,
      classificationJson: playerOutlookCache.classificationJson,
    })
    .from(playerOutlookCache)
    .where(eq(playerOutlookCache.sport, sport.toLowerCase()));

  const scores: number[] = [];
  for (const row of rows) {
    const outlook = row.outlookJson as any;
    if (!outlook) continue;

    let demandScore = outlook.marketSignals?.demandScore;
    if (demandScore == null || demandScore === 0) {
      const verdict = outlook.investmentCall?.verdict;
      if (verdict) {
        const verdictMap: Record<string, number> = {
          ACCUMULATE: 80, HOLD_CORE: 65, TRADE_THE_HYPE: 60,
          SPECULATIVE_FLYER: 45, HOLD_ROLE_RISK: 50,
          AVOID_NEW_MONEY: 25, AVOID_STRUCTURAL: 15,
          BUY: 75, HOLD: 55, MONITOR: 40, SELL: 20, AVOID: 15,
        };
        demandScore = verdictMap[verdict] ?? 40;
      } else {
        demandScore = 40;
      }
    }
    scores.push(demandScore);
  }

  scores.sort((a, b) => a - b);
  sportDistributionCache.set(sport, { scores, generatedAt: Date.now() });
  return scores;
}

function computePercentileInSport(score: number, sortedScores: number[]): number {
  if (sortedScores.length <= 1) return 50;
  let below = 0;
  let equalCount = 0;
  for (const v of sortedScores) {
    if (v < score) below++;
    else if (v === score) equalCount++;
  }
  const midrank = below + (equalCount - 1) / 2;
  return Math.round((midrank / (sortedScores.length - 1)) * 100);
}

function percentileToTier(percentile: number): DemandTier {
  const topPercentile = 100 - percentile;
  if (topPercentile <= 15) return 1;
  if (topPercentile <= 40) return 2;
  if (topPercentile <= 75) return 3;
  return 4;
}

export interface DemandTierHints {
  isRookie?: boolean;
  set?: string;
  year?: number;
  variation?: string;
  marketDesirability?: string;
  draftPosition?: number;
  isHallOfFamer?: boolean;
  isAllStar?: boolean;
}

const PREMIUM_SETS = /\b(national treasures|flawless|immaculate|noir|one and one|eminence|logoman)\b/i;
const HIGH_END_SETS = /\b(prizm|select|optic|spectra|obsidian|chronicles|mosaic|topps chrome)\b/i;

function estimateDemandFromHints(hints: DemandTierHints | undefined, sport: string): { score: number; stage: string; reason: string } {
  if (!hints) return { score: 40, stage: "UNKNOWN", reason: "no hints" };

  let score = 40;
  let stage = "UNKNOWN";
  const reasons: string[] = [];

  if (hints.isRookie) {
    score += 15;
    stage = "RISING";
    reasons.push("rookie");
  }

  if (hints.set && PREMIUM_SETS.test(hints.set)) {
    score += 10;
    reasons.push("premium set");
  } else if (hints.set && HIGH_END_SETS.test(hints.set)) {
    score += 5;
    reasons.push("high-end set");
  }

  const currentYear = new Date().getFullYear();
  if (hints.year && hints.year >= currentYear - 1) {
    score += 5;
    reasons.push("current year");
  }

  if (hints.marketDesirability === "high" || hints.marketDesirability === "very-high") {
    score += 10;
    reasons.push(`desirability: ${hints.marketDesirability}`);
  }

  if (hints.draftPosition && hints.draftPosition <= 5) {
    score += 20;
    stage = "RISING";
    reasons.push(`#${hints.draftPosition} overall pick`);
  } else if (hints.draftPosition && hints.draftPosition <= 15) {
    score += 10;
    stage = stage === "UNKNOWN" ? "RISING" : stage;
    reasons.push(`lottery pick #${hints.draftPosition}`);
  }

  if (hints.isHallOfFamer) {
    score += 20;
    stage = "LEGEND";
    reasons.push("Hall of Famer");
  }

  if (hints.isAllStar) {
    score += 12;
    reasons.push("All-Star/Pro Bowl");
  }

  score = Math.min(score, 95);

  return { score, stage, reason: reasons.join(", ") || "default" };
}

export async function getPlayerDemandContext(
  playerName: string,
  sport: string,
  hints?: DemandTierHints
): Promise<PlayerDemandContext> {
  const normalizedSport = sport.toLowerCase();
  const playerKey = `${normalizedSport}:${playerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  const rows = await db
    .select()
    .from(playerOutlookCache)
    .where(eq(playerOutlookCache.playerKey, playerKey))
    .limit(1);

  const cacheRow = rows[0];

  if (!cacheRow || !cacheRow.outlookJson) {
    const hintResult = estimateDemandFromHints(hints, normalizedSport);
    const sportScores = await getSportDemandDistribution(normalizedSport);
    const percentile = sportScores.length > 1
      ? computePercentileInSport(hintResult.score, sportScores)
      : 50;
    const tier = percentileToTier(percentile);
    console.log(`[DemandTier] No cache for ${playerName} (${normalizedSport}). Hint-based: score=${hintResult.score}, tier=${tier}, reason="${hintResult.reason}"`);
    return {
      tier,
      tierLabel: TIER_LABELS[tier],
      demandScore: hintResult.score,
      careerStage: hintResult.stage,
      sport: normalizedSport,
      percentileInSport: percentile,
      isFromCache: false,
    };
  }

  const outlook = cacheRow.outlookJson as any;
  const classification = cacheRow.classificationJson as any;
  let demandScore = outlook.marketSignals?.demandScore;

  if (demandScore == null || demandScore === 0) {
    const verdict = outlook.investmentCall?.verdict;
    if (verdict) {
      const verdictMap: Record<string, number> = {
        ACCUMULATE: 80, HOLD_CORE: 65, TRADE_THE_HYPE: 60,
        SPECULATIVE_FLYER: 45, HOLD_ROLE_RISK: 50,
        AVOID_NEW_MONEY: 25, AVOID_STRUCTURAL: 15,
        BUY: 75, HOLD: 55, MONITOR: 40, SELL: 20, AVOID: 15,
      };
      demandScore = verdictMap[verdict] ?? 40;
    } else {
      demandScore = 40;
    }
  }

  const sportScores = await getSportDemandDistribution(normalizedSport);
  const percentile = computePercentileInSport(demandScore, sportScores);
  const tier = percentileToTier(percentile);
  const careerStage = classification?.stage || "UNKNOWN";

  return {
    tier,
    tierLabel: TIER_LABELS[tier],
    demandScore,
    careerStage,
    sport: normalizedSport,
    percentileInSport: percentile,
    isFromCache: true,
  };
}

export function getMultiplierRangesForTier(tier: DemandTier): Record<string, [number, number]> {
  return MULTIPLIER_RANGES[tier];
}

export function buildDemandAdjustedMultiplierPrompt(context: PlayerDemandContext): string {
  const ranges = MULTIPLIER_RANGES[context.tier];
  const tierDesc = context.tier === 1 ? "elite demand — high buyer competition for scarce cards"
    : context.tier === 2 ? "solid demand — moderate buyer competition"
    : context.tier === 3 ? "mid-tier demand — limited buyer pool, scarcity premiums are modest"
    : "weak demand — very few active buyers, scarcity adds minimal premium";

  const stageNote = context.careerStage !== "UNKNOWN"
    ? `Career stage: ${context.careerStage}. `
    : "";

  return `
PLAYER MARKET CONTEXT (Tier ${context.tier} — ${tierDesc}):
${stageNote}This player ranks in the ${100 - context.percentileInSport <= 50 ? `top ${100 - context.percentileInSport}%` : `bottom ${context.percentileInSport}%`} of ${context.sport} player markets by demand.
${context.tier >= 3 ? `IMPORTANT: This is a mid-to-low demand player. Scarcity does NOT create value without buyers. Use CONSERVATIVE multipliers.` : ""}
${context.tier === 4 ? `WARNING: Very low demand. A /5 of this player is NOT significantly more valuable than a /25 — there simply aren't enough buyers competing.` : ""}

DEMAND-ADJUSTED scarcity premiums (apply to the NEAREST parallel comp, NOT from base):
  - /99 → /49: multiply by ${ranges["99_49"][0]}-${ranges["99_49"][1]}x
  - /49 → /25: multiply by ${ranges["49_25"][0]}-${ranges["49_25"][1]}x
  - /25 → /10: multiply by ${ranges["25_10"][0]}-${ranges["25_10"][1]}x
  - /10 → /5: multiply by ${ranges["10_5"][0]}-${ranges["10_5"][1]}x
  - /5 → /2: multiply by ${ranges["5_2"][0]}-${ranges["5_2"][1]}x
  - /2 → 1/1: multiply by ${ranges["2_1"][0]}-${ranges["2_1"][1]}x
- ALWAYS triangulate from the CLOSEST available parallel, not from base or /99.
- REALITY CHECK: After triangulating, ask yourself "would a real collector pay this much for THIS player's card?" If the player doesn't command elite prices, the answer is probably no.
- CITE which specific comp(s) you used and what multiplier you applied in the notes field.`;
}

const CEILING_MULTIPLIERS: Record<DemandTier, number> = {
  1: Infinity,
  2: Infinity,
  3: 3.0,
  4: 2.0,
};

export function applyCeilingCheck(
  estimatedPrice: number,
  nearestCompPrice: number,
  tier: DemandTier,
  soldCount: number
): { price: number; wasCapped: boolean; capReason?: string } {
  if (tier <= 2 || soldCount > 0) {
    return { price: estimatedPrice, wasCapped: false };
  }

  const ceilingMultiplier = CEILING_MULTIPLIERS[tier];
  if (!isFinite(ceilingMultiplier)) {
    return { price: estimatedPrice, wasCapped: false };
  }

  const ceiling = nearestCompPrice * ceilingMultiplier;

  if (estimatedPrice > ceiling) {
    return {
      price: Math.round(ceiling),
      wasCapped: true,
      capReason: `Tier ${tier} ceiling: capped at ${ceilingMultiplier}x nearest comp ($${nearestCompPrice.toFixed(2)})`,
    };
  }

  return { price: estimatedPrice, wasCapped: false };
}
