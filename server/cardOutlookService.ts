import OpenAI from "openai";
import type { Card } from "@shared/schema";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export type OutlookAction = "BUY" | "WATCH" | "SELL";

export type LegacyTier = 
  | "PROSPECT" 
  | "RISING_STAR" 
  | "STAR" 
  | "SUPERSTAR" 
  | "AGING_VET" 
  | "RETIRED" 
  | "HOF" 
  | "LEGEND_DECEASED";

export type InjuryRisk = "LOW" | "MED" | "HIGH";
export type TeamMarketSize = "SMALL" | "MEDIUM" | "LARGE";
export type InsertTier = "base" | "silver" | "refractor" | "case-hit";

export interface CardOutlookResult {
  cardId: number;
  playerName: string | null;
  sport: string | null;
  position: string | null;
  timeHorizonMonths: number;
  action: OutlookAction;
  upsideScore: number;
  riskScore: number;
  confidenceScore: number;
  projectedOutlook: {
    bearCaseChangePct: number;
    baseCaseChangePct: number;
    bullCaseChangePct: number;
  };
  factors: {
    cardTypeScore: number;
    positionScore: number;
    legacyScore: number;
    liquidityScore: number;
    volatilityScore: number;
    hypeScore: number;
  };
  explanation: {
    short: string;
    long: string;
  };
}

const POSITION_SCORES: Record<string, Record<string, number>> = {
  football: {
    QB: 1.35,
    WR: 1.2,
    RB: 1.15,
    TE: 0.95,
    DEF: 0.6,
    K: 0.5,
    OL: 0.5,
  },
  basketball: {
    PG: 1.2,
    SG: 1.25,
    SF: 1.3,
    PF: 1.0,
    C: 0.9,
  },
  baseball: {
    OF: 1.2,
    SS: 1.15,
    "1B": 1.1,
    "2B": 1.0,
    "3B": 1.0,
    C: 0.95,
    P: 0.8,
    DH: 1.0,
  },
  hockey: {
    C: 1.25,
    RW: 1.2,
    LW: 1.2,
    D: 1.0,
    G: 0.85,
  },
  soccer: {
    FW: 1.3,
    MF: 1.15,
    DF: 0.9,
    GK: 0.8,
  },
  tcg: {
    chase: 1.4,
    ultra_rare: 1.3,
    rare: 1.1,
    uncommon: 0.8,
    common: 0.6,
  },
};

// Player lifecycle profiles define realistic score ranges for each career stage
// These reflect the INVESTMENT reality, not the player's quality
interface LifecycleProfile {
  upsideRange: { min: number; max: number };  // Lower for established, higher for prospects
  riskRange: { min: number; max: number };     // Lower for proven, higher for unknowns
  confidenceFloor: number;                      // Minimum confidence for well-known players
  stabilityBonus: number;                       // Reduces risk for stable markets
}

const LIFECYCLE_PROFILES: Record<LegacyTier, LifecycleProfile> = {
  // Rookies and prospects: HIGH upside potential, HIGH risk, LOW confidence
  PROSPECT: {
    upsideRange: { min: 50, max: 95 },
    riskRange: { min: 55, max: 90 },
    confidenceFloor: 25,
    stabilityBonus: 0,
  },
  // Rising stars (3-5 years): Still HIGH upside, MODERATE risk
  RISING_STAR: {
    upsideRange: { min: 45, max: 85 },
    riskRange: { min: 40, max: 75 },
    confidenceFloor: 40,
    stabilityBonus: 0.1,
  },
  // Established stars: MODERATE upside, MODERATE risk
  STAR: {
    upsideRange: { min: 30, max: 65 },
    riskRange: { min: 30, max: 55 },
    confidenceFloor: 55,
    stabilityBonus: 0.2,
  },
  // Superstars (MVP-caliber active): MODERATE upside (priced in), LOW-MODERATE risk
  SUPERSTAR: {
    upsideRange: { min: 25, max: 55 },
    riskRange: { min: 20, max: 45 },
    confidenceFloor: 65,
    stabilityBonus: 0.25,
  },
  // Aging veterans: LOW upside (declining), MODERATE-HIGH risk (injury/retirement)
  AGING_VET: {
    upsideRange: { min: 15, max: 40 },
    riskRange: { min: 35, max: 65 },
    confidenceFloor: 50,
    stabilityBonus: 0.1,
  },
  // Retired (not HOF): VERY LOW upside (stable), LOW risk, HIGH confidence
  RETIRED: {
    upsideRange: { min: 5, max: 25 },
    riskRange: { min: 15, max: 35 },
    confidenceFloor: 70,
    stabilityBonus: 0.4,
  },
  // Hall of Fame: VERY LOW upside (fully priced in), VERY LOW risk, VERY HIGH confidence
  HOF: {
    upsideRange: { min: 3, max: 20 },
    riskRange: { min: 8, max: 25 },
    confidenceFloor: 80,
    stabilityBonus: 0.5,
  },
  // Deceased legends: MINIMAL upside, MINIMAL risk, HIGHEST confidence
  LEGEND_DECEASED: {
    upsideRange: { min: 2, max: 15 },
    riskRange: { min: 5, max: 20 },
    confidenceFloor: 85,
    stabilityBonus: 0.6,
  },
};

// Sport-specific modifiers affect how career stages impact scores
interface SportConfig {
  positionVolatility: Record<string, number>;  // How volatile is this position's market?
  careerLongevity: number;                      // How long do careers typically last?
  rookieHypeMultiplier: number;                 // How much does the hobby hype rookies?
  retiredStabilityBonus: number;                // Extra stability for retired players
}

const SPORT_CONFIGS: Record<string, SportConfig> = {
  football: {
    positionVolatility: { QB: 0.7, WR: 0.85, RB: 1.0, TE: 0.8, DEF: 0.6, K: 0.5 },
    careerLongevity: 0.7,  // Shorter careers = more risk
    rookieHypeMultiplier: 1.3,
    retiredStabilityBonus: 0.15,
  },
  basketball: {
    positionVolatility: { PG: 0.75, SG: 0.8, SF: 0.8, PF: 0.75, C: 0.7 },
    careerLongevity: 0.85,
    rookieHypeMultiplier: 1.4,
    retiredStabilityBonus: 0.1,
  },
  baseball: {
    positionVolatility: { OF: 0.7, SS: 0.75, "1B": 0.65, "2B": 0.7, "3B": 0.7, C: 0.65, P: 0.85, DH: 0.6 },
    careerLongevity: 1.0,  // Longer careers = more stability
    rookieHypeMultiplier: 1.2,
    retiredStabilityBonus: 0.2,
  },
  hockey: {
    positionVolatility: { C: 0.75, RW: 0.8, LW: 0.8, D: 0.7, G: 0.65 },
    careerLongevity: 0.9,
    rookieHypeMultiplier: 1.1,
    retiredStabilityBonus: 0.15,
  },
  soccer: {
    positionVolatility: { FW: 0.85, MF: 0.75, DF: 0.65, GK: 0.6 },
    careerLongevity: 0.8,
    rookieHypeMultiplier: 1.2,
    retiredStabilityBonus: 0.1,
  },
  tcg: {
    positionVolatility: { chase: 1.0, ultra_rare: 0.9, rare: 0.7, uncommon: 0.5, common: 0.3 },
    careerLongevity: 1.0,
    rookieHypeMultiplier: 1.5,
    retiredStabilityBonus: 0.3,
  },
};

// Accolades detection patterns
interface DetectedAccolades {
  hasMVP: boolean;
  hasChampionship: boolean;
  hasAllStar: boolean;
  hasROY: boolean;
  accoladeCount: number;
}

function detectAccolades(title: string, playerName: string | null): DetectedAccolades {
  const combined = `${title} ${playerName || ""}`.toLowerCase();
  
  const mvpPatterns = ["mvp", "most valuable"];
  const championshipPatterns = ["super bowl", "world series", "nba champion", "stanley cup", "champion"];
  const allStarPatterns = ["all-star", "all star", "pro bowl", "all-pro"];
  const royPatterns = ["roy", "rookie of the year"];
  
  const hasMVP = mvpPatterns.some(p => combined.includes(p));
  const hasChampionship = championshipPatterns.some(p => combined.includes(p));
  const hasAllStar = allStarPatterns.some(p => combined.includes(p));
  const hasROY = royPatterns.some(p => combined.includes(p));
  
  return {
    hasMVP,
    hasChampionship,
    hasAllStar,
    hasROY,
    accoladeCount: [hasMVP, hasChampionship, hasAllStar, hasROY].filter(Boolean).length,
  };
}

// Market stability assessment
function assessMarketStability(card: Card): number {
  let stability = 0.5;  // Base stability
  
  // Card age contributes to stability (older = more stable market)
  if (card.year) {
    const cardAge = new Date().getFullYear() - card.year;
    if (cardAge >= 20) stability += 0.3;
    else if (cardAge >= 10) stability += 0.2;
    else if (cardAge >= 5) stability += 0.1;
    else if (cardAge <= 2) stability -= 0.1;  // New cards are volatile
  }
  
  // Graded cards are more stable
  if (card.grade) {
    const gradeUpper = card.grade.toUpperCase();
    if (gradeUpper.includes("10") || gradeUpper.includes("9.5")) stability += 0.15;
    else if (gradeUpper.includes("9")) stability += 0.1;
    else stability += 0.05;
  }
  
  // Low price volatility = stable
  if (card.priceStdDevPct !== null) {
    if (card.priceStdDevPct <= 10) stability += 0.2;
    else if (card.priceStdDevPct <= 25) stability += 0.1;
    else if (card.priceStdDevPct >= 50) stability -= 0.15;
  }
  
  // Good liquidity = stable
  if (card.salesLast30Days !== null) {
    if (card.salesLast30Days >= 10) stability += 0.1;
    else if (card.salesLast30Days === 0) stability -= 0.1;
  }
  
  return clamp(stability, 0, 1);
}

const LEGACY_SCORES: Record<LegacyTier, number> = {
  PROSPECT: 0.7,
  RISING_STAR: 0.9,
  STAR: 0.95,
  SUPERSTAR: 1.0,
  AGING_VET: 0.7,
  RETIRED: 0.8,
  HOF: 0.95,
  LEGEND_DECEASED: 1.0,
};

const PROSPECT_RISK_FACTORS: Record<LegacyTier, number> = {
  PROSPECT: 1.0,
  RISING_STAR: 0.7,
  STAR: 0.4,
  SUPERSTAR: 0.3,
  AGING_VET: 0.8,
  RETIRED: 0.5,
  HOF: 0.3,
  LEGEND_DECEASED: 0.2,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateCardTypeScore(card: Card): number {
  let base = 0.4;
  
  if (card.isRookie) base += 0.2;
  if (card.hasAuto) base += 0.2;
  
  if (card.isNumbered && card.serialNumber) {
    if (card.serialNumber <= 10) base += 0.15;
    else if (card.serialNumber <= 25) base += 0.12;
    else if (card.serialNumber <= 99) base += 0.08;
    else if (card.serialNumber <= 199) base += 0.05;
  }
  
  const grade = card.grade?.toUpperCase() || "";
  if (grade.includes("PSA 10") || grade.includes("BGS 9.5") || grade.includes("BGS 10") || grade.includes("SGC 10")) {
    base += 0.1;
  } else if (grade.includes("PSA 9") || grade.includes("BGS 9") || grade.includes("SGC 9.5")) {
    base += 0.05;
  }
  
  if (card.insertTier) {
    const tier = card.insertTier.toLowerCase();
    if (tier === "case-hit") base += 0.1;
    else if (tier === "refractor") base += 0.07;
    else if (tier === "silver") base += 0.04;
  }
  
  return clamp(base, 0, 1);
}

function calculatePositionScore(sport: string | null, position: string | null): number {
  if (!sport || !position) return 1.0;
  
  const sportScores = POSITION_SCORES[sport.toLowerCase()];
  if (!sportScores) return 1.0;
  
  return sportScores[position.toUpperCase()] || 1.0;
}

function calculateLegacyScore(legacyTier: string | null): number {
  if (!legacyTier) return 0.8;
  return LEGACY_SCORES[legacyTier as LegacyTier] || 0.8;
}

function calculateLiquidityScore(salesLast30Days: number | null): number {
  if (salesLast30Days === null) return 0.5;
  
  if (salesLast30Days >= 10) return 1.0;
  if (salesLast30Days >= 5) return 0.8;
  if (salesLast30Days >= 1) return 0.6;
  return 0.3;
}

function calculateVolatilityScore(priceStdDevPct: number | null): number {
  if (priceStdDevPct === null) return 0.5;
  
  if (priceStdDevPct <= 10) return 0.3;
  if (priceStdDevPct <= 25) return 0.5;
  if (priceStdDevPct <= 50) return 0.7;
  return 0.9;
}

function calculateHypeScore(avgSalePrice30: number | null, avgSalePrice90: number | null): number {
  if (avgSalePrice30 === null || avgSalePrice90 === null || avgSalePrice90 === 0) {
    return 0;
  }
  
  const trendPct = (avgSalePrice30 - avgSalePrice90) / avgSalePrice90;
  
  if (trendPct >= 0.5) return 1.0;
  if (trendPct >= 0.2) return 0.7;
  if (trendPct >= 0.05) return 0.4;
  if (trendPct >= -0.05) return 0.0;
  if (trendPct >= -0.2) return -0.4;
  if (trendPct >= -0.5) return -0.7;
  return -1.0;
}

function normalizePositionScore(positionScore: number): number {
  const minScore = 0.5;
  const maxScore = 1.4;
  return (positionScore - minScore) / (maxScore - minScore);
}

// NEW: Lifecycle-aware upside calculation
function calculateLifecycleAwareUpside(
  card: Card,
  cardTypeScore: number,
  positionScore: number,
  hypeScore: number,
  marketStability: number,
  sportConfig: SportConfig | null
): number {
  const legacyTier = (card.legacyTier as LegacyTier) || "STAR";
  const profile = LIFECYCLE_PROFILES[legacyTier];
  
  // Start with the base range for this lifecycle stage
  const { min: minUpside, max: maxUpside } = profile.upsideRange;
  const rangeSize = maxUpside - minUpside;
  
  // Calculate modifiers that push us within the range
  let modifier = 0;
  
  // Card type contribution (rookies, autos, numbered boost upside for prospects/rising stars)
  if (legacyTier === "PROSPECT" || legacyTier === "RISING_STAR") {
    modifier += cardTypeScore * 0.4;  // Premium cards have more upside for young players
  } else if (legacyTier === "HOF" || legacyTier === "LEGEND_DECEASED" || legacyTier === "RETIRED") {
    // For established legends, card type matters less for "upside" 
    // (the player is known, value is established)
    modifier += cardTypeScore * 0.15;
  } else {
    modifier += cardTypeScore * 0.25;
  }
  
  // Position contribution (QBs, stars at premium positions)
  const posNorm = normalizePositionScore(positionScore);
  modifier += posNorm * 0.2;
  
  // Hype contribution (recent price trends)
  if (hypeScore > 0) {
    modifier += hypeScore * 0.25;  // Positive momentum increases upside
  } else {
    modifier += hypeScore * 0.1;  // Negative momentum slightly decreases
  }
  
  // Sport-specific rookie hype multiplier
  if (sportConfig && (legacyTier === "PROSPECT" || legacyTier === "RISING_STAR")) {
    modifier *= sportConfig.rookieHypeMultiplier;
  }
  
  // Apply modifier to range
  const upsideWithinRange = minUpside + (modifier * rangeSize);
  
  return clamp(Math.round(upsideWithinRange), minUpside, maxUpside);
}

// NEW: Lifecycle-aware risk calculation
function calculateLifecycleAwareRisk(
  card: Card,
  volatilityScore: number,
  liquidityScore: number,
  hypeScore: number,
  marketStability: number,
  sportConfig: SportConfig | null
): number {
  const legacyTier = (card.legacyTier as LegacyTier) || "STAR";
  const profile = LIFECYCLE_PROFILES[legacyTier];
  
  // Start with the base range for this lifecycle stage
  const { min: minRisk, max: maxRisk } = profile.riskRange;
  const rangeSize = maxRisk - minRisk;
  
  // Calculate modifiers that push us within the range
  let modifier = 0;
  
  // Volatility is a major risk factor
  modifier += volatilityScore * 0.35;
  
  // Low liquidity increases risk
  modifier += (1 - liquidityScore) * 0.25;
  
  // Negative hype (declining prices) increases risk
  if (hypeScore < 0) {
    modifier += Math.abs(hypeScore) * 0.2;
  }
  
  // Market stability reduces risk
  modifier -= marketStability * profile.stabilityBonus;
  
  // Sport-specific career longevity affects risk for active players
  if (sportConfig && (legacyTier === "PROSPECT" || legacyTier === "RISING_STAR" || legacyTier === "STAR")) {
    // Shorter career sports (football) = higher risk for active players
    modifier += (1 - sportConfig.careerLongevity) * 0.15;
  }
  
  // Sport-specific stability bonus for retired players
  if (sportConfig && (legacyTier === "RETIRED" || legacyTier === "HOF" || legacyTier === "LEGEND_DECEASED")) {
    modifier -= sportConfig.retiredStabilityBonus;
  }
  
  // Apply modifier to range
  const riskWithinRange = minRisk + (modifier * rangeSize);
  
  return clamp(Math.round(riskWithinRange), minRisk, maxRisk);
}

// NEW: Lifecycle-aware confidence calculation
function calculateLifecycleAwareConfidence(
  card: Card,
  salesLast30Days: number | null,
  marketStability: number,
  accolades: DetectedAccolades
): number {
  const legacyTier = (card.legacyTier as LegacyTier) || "STAR";
  const profile = LIFECYCLE_PROFILES[legacyTier];
  
  // Start with the confidence floor for this lifecycle stage
  let confidence = profile.confidenceFloor;
  
  // Data completeness adds confidence
  let knownFields = 0;
  const totalFields = 8;
  if (card.sport) knownFields++;
  if (card.position) knownFields++;
  if (card.legacyTier) knownFields++;
  if (card.grade) knownFields++;
  if (card.estimatedValue) knownFields++;
  if (card.avgSalePrice30) knownFields++;
  if (card.avgSalePrice90) knownFields++;
  if (card.playerName) knownFields++;
  
  const dataCompleteness = knownFields / totalFields;
  confidence += dataCompleteness * 10;
  
  // Sales depth adds confidence
  if (salesLast30Days !== null) {
    if (salesLast30Days >= 10) confidence += 10;
    else if (salesLast30Days >= 5) confidence += 6;
    else if (salesLast30Days >= 1) confidence += 3;
  }
  
  // Market stability adds confidence
  confidence += marketStability * 8;
  
  // Known accolades increase confidence (we know more about the player)
  confidence += accolades.accoladeCount * 2;
  
  return clamp(Math.round(confidence), profile.confidenceFloor, 98);
}

function calculateUpsideScore(
  cardTypeScore: number,
  positionScore: number,
  legacyScore: number,
  volatilityScore: number,
  hypeScore: number
): number {
  const positionScoreNormalized = normalizePositionScore(positionScore);
  
  const hypeContribution = hypeScore >= 0 
    ? hypeScore * 0.15 
    : hypeScore * 0.1;
  
  const rawUpside =
    (cardTypeScore * 0.35) +
    (positionScoreNormalized * 0.2) +
    (legacyScore * 0.15) +
    ((1 - volatilityScore) * 0.1) +
    hypeContribution;
  
  return clamp(Math.round(rawUpside * 100), 0, 100);
}

function calculateRiskScore(
  volatilityScore: number,
  legacyTier: string | null,
  liquidityScore: number,
  hypeScore: number
): number {
  const prospectRiskFactor = legacyTier 
    ? PROSPECT_RISK_FACTORS[legacyTier as LegacyTier] || 0.4
    : 0.5;
  
  const negativeHypeRisk = hypeScore < 0 ? Math.abs(hypeScore) * 0.15 : 0;
  
  const rawRisk =
    (volatilityScore * 0.4) +
    (prospectRiskFactor * 0.25) +
    ((1 - liquidityScore) * 0.2) +
    negativeHypeRisk;
  
  return clamp(Math.round(rawRisk * 100), 0, 100);
}

function calculateConfidenceScore(
  card: Card,
  salesLast30Days: number | null
): number {
  let dataDepthFactor = 0.4;
  if (salesLast30Days !== null) {
    if (salesLast30Days >= 10) dataDepthFactor = 1.0;
    else if (salesLast30Days >= 5) dataDepthFactor = 0.8;
    else if (salesLast30Days >= 1) dataDepthFactor = 0.6;
  }
  
  let knownFields = 0;
  const totalFields = 10;
  
  if (card.sport) knownFields++;
  if (card.position) knownFields++;
  if (card.legacyTier) knownFields++;
  if (card.isRookie !== null) knownFields++;
  if (card.hasAuto !== null) knownFields++;
  if (card.isNumbered !== null) knownFields++;
  if (card.grade) knownFields++;
  if (card.estimatedValue) knownFields++;
  if (card.avgSalePrice30) knownFields++;
  if (card.avgSalePrice90) knownFields++;
  
  const cardDataCompleteness = knownFields / totalFields;
  
  return clamp(
    Math.round((dataDepthFactor * 0.6 + cardDataCompleteness * 0.4) * 100),
    0,
    100
  );
}

function determineAction(upsideScore: number, riskScore: number): OutlookAction {
  // NEW: Adjusted thresholds for lifecycle-aware scoring
  // BUY: High upside (60+) relative to risk, OR very favorable risk/reward ratio
  if (upsideScore >= 60 && riskScore <= 50) {
    return "BUY";
  }
  // Also BUY if upside significantly exceeds risk
  if (upsideScore > riskScore + 20 && upsideScore >= 50) {
    return "BUY";
  }
  // SELL: Low upside with high risk (bad risk/reward)
  if (upsideScore <= 30 && riskScore >= 50) {
    return "SELL";
  }
  // Also SELL if risk significantly exceeds upside
  if (riskScore > upsideScore + 25 && riskScore >= 45) {
    return "SELL";
  }
  // WATCH: Everything else - stable holds, uncertain situations, etc.
  return "WATCH";
}

function calculateProjectedOutlook(
  upsideScore: number,
  riskScore: number,
  hypeScore: number
): { bearCaseChangePct: number; baseCaseChangePct: number; bullCaseChangePct: number } {
  const riskMultiplier = riskScore / 50;
  const upsideMultiplier = upsideScore / 50;
  
  const bearCase = Math.round(-10 - (riskMultiplier * 15) + (hypeScore < 0 ? hypeScore * 10 : 0));
  const baseCase = Math.round((upsideScore - 50) / 4 + (hypeScore * 5));
  const bullCase = Math.round(10 + (upsideMultiplier * 25) + (hypeScore > 0 ? hypeScore * 15 : 0));
  
  return {
    bearCaseChangePct: clamp(bearCase, -50, 10),
    baseCaseChangePct: clamp(baseCase, -20, 30),
    bullCaseChangePct: clamp(bullCase, 5, 100),
  };
}

async function generateExplanation(
  card: Card,
  factors: CardOutlookResult["factors"],
  upsideScore: number,
  riskScore: number,
  confidenceScore: number,
  action: OutlookAction,
  timeHorizonMonths: number
): Promise<{ short: string; long: string }> {
  const openai = getOpenAI();
  
  if (!openai) {
    return {
      short: generateFallbackShort(action, upsideScore, riskScore),
      long: generateFallbackLong(card, action, factors, upsideScore, riskScore),
    };
  }
  
  try {
    const trendPct = card.avgSalePrice30 && card.avgSalePrice90 && card.avgSalePrice90 > 0
      ? ((card.avgSalePrice30 - card.avgSalePrice90) / card.avgSalePrice90 * 100).toFixed(1)
      : "unknown";
    
    const prompt = `You are an assistant helping sports card collectors decide whether to invest in specific cards. You will receive structured data about a card, the player, and a set of pre-calculated scores.

Return:
1. A 1-2 sentence summary for beginners (labeled "SHORT:").
2. A 3-6 sentence detailed explanation using hobby language, no promises or guarantees (labeled "LONG:").

Data:
- Player: ${card.playerName || card.title}, ${card.sport || "unknown sport"}, ${card.position || "unknown position"}, legacy tier: ${card.legacyTier || "unknown"}.
- Card: rookie=${card.isRookie || false}, numbered=${card.isNumbered || false} (/${card.serialNumber || "N/A"}), auto=${card.hasAuto || false}, graded=${card.grade || "raw"}.
- Scores: upside=${upsideScore}, risk=${riskScore}, confidence=${confidenceScore}.
- Market: recent sales=${card.salesLast30Days || "unknown"}, trend (30 vs 90 days)=${trendPct}%.

Explain the reasoning behind the scores and end with a plain-language tag like:
"Overall view: ${action} for the next ${timeHorizonMonths} months."`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    
    const shortMatch = content.match(/SHORT:\s*([\s\S]+?)(?=LONG:|$)/);
    const longMatch = content.match(/LONG:\s*([\s\S]+)/);
    
    return {
      short: shortMatch?.[1]?.trim() || generateFallbackShort(action, upsideScore, riskScore),
      long: longMatch?.[1]?.trim() || generateFallbackLong(card, action, factors, upsideScore, riskScore),
    };
  } catch (error) {
    console.error("Error generating AI explanation:", error);
    return {
      short: generateFallbackShort(action, upsideScore, riskScore),
      long: generateFallbackLong(card, action, factors, upsideScore, riskScore),
    };
  }
}

function generateFallbackShort(action: OutlookAction, upsideScore: number, riskScore: number): string {
  if (action === "BUY") {
    return `Strong upside potential (${upsideScore}/100) with manageable risk. Consider adding to your collection.`;
  } else if (action === "SELL") {
    return `Higher risk (${riskScore}/100) relative to upside. May want to consider selling or trading.`;
  }
  return `Balanced outlook with moderate upside (${upsideScore}/100) and risk (${riskScore}/100). Monitor market conditions.`;
}

function generateFallbackLong(
  card: Card,
  action: OutlookAction,
  factors: CardOutlookResult["factors"],
  upsideScore: number,
  riskScore: number
): string {
  const playerName = card.playerName || card.title;
  const parts: string[] = [];
  
  if (factors.cardTypeScore >= 0.7) {
    parts.push(`This ${card.isRookie ? "rookie" : ""} ${card.hasAuto ? "auto" : ""}${card.isNumbered ? ` numbered /${card.serialNumber}` : ""} card has premium features that typically hold value well.`);
  }
  
  if (factors.positionScore >= 1.2) {
    parts.push(`${playerName}'s position is historically strong for card appreciation.`);
  }
  
  if (factors.hypeScore > 0.5) {
    parts.push(`Recent price momentum is positive, showing increased collector interest.`);
  } else if (factors.hypeScore < -0.3) {
    parts.push(`Recent prices have softened, which could present a buying opportunity or signal weakening demand.`);
  }
  
  if (factors.liquidityScore < 0.5) {
    parts.push(`Low trading volume makes pricing less reliable and sales may take longer.`);
  }
  
  parts.push(`Overall view: ${action} for the next 12 months.`);
  
  return parts.join(" ");
}

// NEW: Enhanced editorial explanation with investment rationale
async function generateEditorialExplanation(
  card: Card,
  factors: CardOutlookResult["factors"],
  upsideScore: number,
  riskScore: number,
  confidenceScore: number,
  action: OutlookAction,
  timeHorizonMonths: number,
  marketStability: number,
  accolades: DetectedAccolades,
  sportConfig: SportConfig | null
): Promise<{ short: string; long: string }> {
  const openai = getOpenAI();
  const legacyTier = (card.legacyTier as LegacyTier) || "STAR";
  
  // Build context for narrative
  const lifecycleContext = getLifecycleNarrative(legacyTier, card);
  const cardContext = getCardNarrative(card);
  const stabilityContext = getStabilityNarrative(marketStability, legacyTier);
  
  if (!openai) {
    return {
      short: generateEditorialFallbackShort(action, upsideScore, riskScore, legacyTier, card),
      long: generateEditorialFallbackLong(card, action, upsideScore, riskScore, confidenceScore, legacyTier, lifecycleContext, cardContext, stabilityContext),
    };
  }
  
  try {
    const trendPct = card.avgSalePrice30 && card.avgSalePrice90 && card.avgSalePrice90 > 0
      ? ((card.avgSalePrice30 - card.avgSalePrice90) / card.avgSalePrice90 * 100).toFixed(1)
      : "unknown";
    
    const prompt = `You are an expert sports card investment analyst writing for collectors. Your analysis should be insightful, editorial, and explain the "why" behind each score like a knowledgeable hobbyist would.

CRITICAL CONTEXT:
- Upside score reflects GROWTH POTENTIAL, not player quality. Hall of Famers and retired legends have LOW upside because their value is already established. Rookies and rising stars have HIGH upside because they have room to grow.
- Risk score reflects INVESTMENT RISK. Established players (HOF, retired) have LOW risk because markets are stable. Prospects have HIGH risk due to uncertainty.
- Confidence reflects how certain we are about the prediction.

Player & Card:
- Name: ${card.playerName || card.title}
- Sport: ${card.sport || "unknown"}, Position: ${card.position || "unknown"}
- Career Stage: ${legacyTier} (${lifecycleContext})
- Card: ${cardContext}
- Year: ${card.year || "unknown"}, Grade: ${card.grade || "raw"}

Investment Scores:
- Upside: ${upsideScore}/100 (${upsideScore < 25 ? "Low - value already established" : upsideScore < 50 ? "Moderate" : "High - room for growth"})
- Risk: ${riskScore}/100 (${riskScore < 25 ? "Very Low - stable market" : riskScore < 45 ? "Low-Moderate" : "Higher uncertainty"})
- Confidence: ${confidenceScore}/100

Market Context:
- Price trend (30d vs 90d): ${trendPct}%
- Market stability: ${marketStability > 0.7 ? "Very stable, established market" : marketStability > 0.5 ? "Moderately stable" : "More volatile, newer to market"}
${accolades.accoladeCount > 0 ? `- Known accolades: ${accolades.hasMVP ? "MVP" : ""} ${accolades.hasChampionship ? "Champion" : ""} ${accolades.hasAllStar ? "All-Star" : ""}`.trim() : ""}

Write an investment memo-style analysis:
1. SHORT: (1-2 sentences) Quick verdict with the key insight. Example: "This is a Hall of Fame lock whose value is already priced in - minimal upside but also minimal risk. A safe hold."
2. LONG: (3-5 sentences) Explain the rationale. Be specific about WHY the scores are what they are. Mention career stage, market dynamics, and what collectors should consider. End with "Overall view: ${action} for the next ${timeHorizonMonths} months."

Format response as:
SHORT: [your short summary]
LONG: [your detailed analysis]`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    
    const shortMatch = content.match(/SHORT:\s*([\s\S]+?)(?=LONG:|$)/);
    const longMatch = content.match(/LONG:\s*([\s\S]+)/);
    
    return {
      short: shortMatch?.[1]?.trim() || generateEditorialFallbackShort(action, upsideScore, riskScore, legacyTier, card),
      long: longMatch?.[1]?.trim() || generateEditorialFallbackLong(card, action, upsideScore, riskScore, confidenceScore, legacyTier, lifecycleContext, cardContext, stabilityContext),
    };
  } catch (error) {
    console.error("Error generating editorial explanation:", error);
    return {
      short: generateEditorialFallbackShort(action, upsideScore, riskScore, legacyTier, card),
      long: generateEditorialFallbackLong(card, action, upsideScore, riskScore, confidenceScore, legacyTier, lifecycleContext, cardContext, stabilityContext),
    };
  }
}

function getLifecycleNarrative(legacyTier: LegacyTier, card: Card): string {
  const narratives: Record<LegacyTier, string> = {
    PROSPECT: "Early career, unknown ceiling, high volatility",
    RISING_STAR: "Showing promise, building reputation, prices still have room to grow",
    STAR: "Established player, proven track record, moderate growth potential",
    SUPERSTAR: "Elite active player, premium pricing already reflects status",
    AGING_VET: "Past prime but still active, uncertain trajectory ahead",
    RETIRED: "No longer playing, market has stabilized, value is established",
    HOF: "Hall of Fame inductee, fully priced-in legacy, minimal upside but very safe",
    LEGEND_DECEASED: "Historical legend, stable market, collector's piece with predictable value",
  };
  return narratives[legacyTier];
}

function getCardNarrative(card: Card): string {
  const parts: string[] = [];
  if (card.isRookie) parts.push("Rookie");
  if (card.hasAuto) parts.push("Autograph");
  if (card.isNumbered && card.serialNumber) parts.push(`/${card.serialNumber}`);
  if (card.grade) parts.push(card.grade);
  if (parts.length === 0) return "Base card";
  return parts.join(", ");
}

function getStabilityNarrative(marketStability: number, legacyTier: LegacyTier): string {
  if (marketStability >= 0.8) return "Very established market with predictable pricing";
  if (marketStability >= 0.6) return "Stable market conditions";
  if (marketStability >= 0.4) return "Moderate market volatility";
  return "Newer to market with less price history";
}

function generateEditorialFallbackShort(
  action: OutlookAction,
  upsideScore: number,
  riskScore: number,
  legacyTier: LegacyTier,
  card: Card
): string {
  const playerName = card.playerName || card.title;
  
  if (legacyTier === "HOF" || legacyTier === "LEGEND_DECEASED") {
    return `${playerName}'s legacy is secure - this is a stable hold with minimal upside (${upsideScore}) but very low risk (${riskScore}). A safe collector's piece.`;
  }
  if (legacyTier === "RETIRED") {
    return `${playerName} is retired and their market has stabilized. Low upside (${upsideScore}) but also low risk (${riskScore}) - prices unlikely to move dramatically.`;
  }
  if (legacyTier === "PROSPECT" || legacyTier === "RISING_STAR") {
    return `${playerName} has significant room for growth (upside ${upsideScore}) but with the typical uncertainty of an emerging player (risk ${riskScore}).`;
  }
  if (legacyTier === "AGING_VET") {
    return `${playerName} is past their prime - limited upside (${upsideScore}) with elevated risk (${riskScore}) as retirement approaches.`;
  }
  
  return `${playerName} shows moderate potential with upside of ${upsideScore} and risk of ${riskScore}. Monitor market conditions.`;
}

function generateEditorialFallbackLong(
  card: Card,
  action: OutlookAction,
  upsideScore: number,
  riskScore: number,
  confidenceScore: number,
  legacyTier: LegacyTier,
  lifecycleContext: string,
  cardContext: string,
  stabilityContext: string
): string {
  const playerName = card.playerName || card.title;
  const parts: string[] = [];
  
  // Opening with career stage context
  if (legacyTier === "HOF" || legacyTier === "LEGEND_DECEASED") {
    parts.push(`${playerName} is a ${legacyTier === "HOF" ? "Hall of Famer" : "deceased legend"} whose place in history is secure.`);
    parts.push(`Their card values are fully established with years of market data supporting stable pricing.`);
    parts.push(`This means minimal upside - the market already reflects their legacy - but also minimal risk for the same reason.`);
  } else if (legacyTier === "RETIRED") {
    parts.push(`${playerName} has retired, which means their on-field story is complete.`);
    parts.push(`The market has had time to settle on their value, making this a stable but low-growth investment.`);
  } else if (legacyTier === "PROSPECT" || legacyTier === "RISING_STAR") {
    parts.push(`${playerName} is ${legacyTier === "PROSPECT" ? "early in their career" : "an emerging talent"} with ${lifecycleContext}.`);
    parts.push(`This creates significant upside potential if they develop into a star, but also substantial risk if they don't pan out.`);
    if (card.isRookie) {
      parts.push(`The rookie designation adds both collector appeal and price volatility.`);
    }
  } else if (legacyTier === "SUPERSTAR") {
    parts.push(`${playerName} is an elite active player whose status is already reflected in premium pricing.`);
    parts.push(`While they're among the best in their sport, much of that value is already priced in, limiting upside.`);
  } else if (legacyTier === "AGING_VET") {
    parts.push(`${playerName} is past their prime but still active, creating uncertainty about their trajectory.`);
    parts.push(`Cards of aging veterans often face downward pressure as collectors pivot to newer stars.`);
  } else {
    parts.push(`${playerName} is an established player in their sport.`);
    parts.push(`Their market shows ${stabilityContext.toLowerCase()}.`);
  }
  
  // Confidence context
  if (confidenceScore >= 80) {
    parts.push(`We have high confidence (${confidenceScore}/100) in this assessment based on substantial market data.`);
  } else if (confidenceScore <= 50) {
    parts.push(`Our confidence is moderate (${confidenceScore}/100) due to limited market data.`);
  }
  
  parts.push(`Overall view: ${action} for the next 12 months.`);
  
  return parts.join(" ");
}

export interface InferredCardMetadata {
  playerName: string | null;
  sport: string | null;
  position: string | null;
  isRookie: boolean | null;
  hasAuto: boolean | null;
  isNumbered: boolean | null;
  serialNumber: number | null;
  legacyTier: LegacyTier | null;
  grader: string | null;
}

function inferLegacyTierFromYear(year: number | null, title: string): LegacyTier | null {
  if (!year) return null;
  
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  
  const titleLower = title.toLowerCase();
  if (titleLower.includes("hof") || titleLower.includes("hall of fame")) {
    return "HOF";
  }
  if (titleLower.includes("legend") || titleLower.includes("deceased") || titleLower.includes("memorial")) {
    return "LEGEND_DECEASED";
  }
  
  if (age <= 2) return "PROSPECT";
  if (age <= 5) return "RISING_STAR";
  if (age <= 10) return "STAR";
  if (age <= 15) return "SUPERSTAR";
  if (age <= 25) return "RETIRED";
  return "HOF";
}

function inferFromTitle(title: string, set: string | null, grade: string | null): Partial<InferredCardMetadata> {
  const result: Partial<InferredCardMetadata> = {};
  const combined = `${title} ${set || ""} ${grade || ""}`.toLowerCase();
  
  if (combined.includes("rookie") || combined.includes(" rc ") || combined.includes(" rc") || 
      combined.includes("1st bowman") || combined.includes("first bowman") || combined.includes("rated rookie")) {
    result.isRookie = true;
  }
  
  if (combined.includes("auto") || combined.includes("autograph") || combined.includes("signed") || combined.includes("on-card")) {
    result.hasAuto = true;
  }
  
  const numberedMatch = combined.match(/\/(\d+)/);
  if (numberedMatch) {
    result.isNumbered = true;
    result.serialNumber = parseInt(numberedMatch[1], 10);
  } else if (combined.includes("numbered") || combined.includes("serial") || combined.includes("ssp") || combined.includes("sp ")) {
    result.isNumbered = true;
  }
  
  const graderPatterns = [
    { pattern: /psa\s*\d+/i, grader: "PSA" },
    { pattern: /bgs\s*[\d.]+/i, grader: "BGS" },
    { pattern: /sgc\s*[\d.]+/i, grader: "SGC" },
    { pattern: /cgc\s*[\d.]+/i, grader: "CGC" },
  ];
  for (const { pattern, grader } of graderPatterns) {
    if (pattern.test(combined)) {
      result.grader = grader;
      break;
    }
  }
  
  const sportPatterns = [
    { keywords: ["topps baseball", "bowman baseball", "mlb", "baseball"], sport: "baseball" },
    { keywords: ["topps chrome", "bowman chrome", "bowman 1st", "topps heritage"], sport: "baseball" },
    { keywords: ["panini prizm basketball", "nba", "hoops basketball", "select basketball"], sport: "basketball" },
    { keywords: ["panini prizm football", "nfl", "donruss football", "select football", "topps football"], sport: "football" },
    { keywords: ["upper deck hockey", "nhl", "o-pee-chee", "young guns"], sport: "hockey" },
    { keywords: ["panini soccer", "topps soccer", "premier league", "champions league"], sport: "soccer" },
    { keywords: ["pokemon", "pikachu", "charizard", "trainer", "scarlet & violet", "sword & shield"], sport: "tcg" },
    { keywords: ["magic the gathering", "mtg", "planeswalker"], sport: "tcg" },
    { keywords: ["yugioh", "yu-gi-oh"], sport: "tcg" },
  ];
  
  for (const { keywords, sport } of sportPatterns) {
    if (keywords.some(k => combined.includes(k))) {
      result.sport = sport;
      break;
    }
  }
  
  if (!result.sport) {
    const footballIndicators = ["nfl", "football", "quarterback", "qb", "wr", "rb", "te", "cb", "lb"];
    const basketballIndicators = ["nba", "basketball"];
    const hockeyIndicators = ["nhl", "hockey"];
    const soccerIndicators = ["soccer", "premier league", "champions league", "mls"];
    
    const hasFootball = footballIndicators.some(k => combined.includes(k));
    const hasBasketball = basketballIndicators.some(k => combined.includes(k));
    const hasHockey = hockeyIndicators.some(k => combined.includes(k));
    const hasSoccer = soccerIndicators.some(k => combined.includes(k));
    
    if ((combined.includes("topps") || combined.includes("bowman")) && !hasFootball && !hasBasketball && !hasHockey && !hasSoccer) {
      result.sport = "baseball";
    }
  }
  
  return result;
}

export async function inferCardMetadata(
  card: Card
): Promise<InferredCardMetadata> {
  const basicInference = inferFromTitle(card.title, card.set, card.grade);
  
  const result: InferredCardMetadata = {
    playerName: card.playerName || null,
    sport: card.sport || basicInference.sport || null,
    position: card.position || null,
    isRookie: card.isRookie ?? basicInference.isRookie ?? null,
    hasAuto: card.hasAuto ?? basicInference.hasAuto ?? null,
    isNumbered: card.isNumbered ?? basicInference.isNumbered ?? null,
    serialNumber: card.serialNumber ?? basicInference.serialNumber ?? null,
    legacyTier: (card.legacyTier as LegacyTier) || null,
    grader: card.grader || basicInference.grader || null,
  };
  
  const needsAI = !result.playerName || !result.sport || !result.position || !result.legacyTier;
  
  if (!needsAI) {
    return result;
  }
  
  const openai = getOpenAI();
  if (!openai) {
    result.legacyTier = result.legacyTier || inferLegacyTierFromYear(card.year, card.title);
    return result;
  }
  
  try {
    const prompt = `Analyze this trading card and extract metadata. Return ONLY valid JSON.

Card Title: ${card.title}
Set: ${card.set || "unknown"}
Year: ${card.year || "unknown"}
Grade: ${card.grade || "ungraded"}

Extract:
- playerName: The person/character name (string or null)
- sport: One of "football", "basketball", "baseball", "hockey", "soccer", "tcg" (string or null)
- position: Player position like QB, WR, PG, SF, etc. For TCG use rarity like "chase", "ultra_rare" (string or null)
- legacyTier: One of "PROSPECT", "RISING_STAR", "STAR", "SUPERSTAR", "AGING_VET", "RETIRED", "HOF", "LEGEND_DECEASED" (string or null)

Rules for legacyTier:
- PROSPECT: Rookie or 1-2 years in league
- RISING_STAR: 3-5 years, showing promise
- STAR: Established player, 5-10 years
- SUPERSTAR: Elite player, MVP candidate
- AGING_VET: Past prime, still active
- RETIRED: No longer playing
- HOF: Hall of Fame inductee
- LEGEND_DECEASED: Deceased legends

Return only JSON: {"playerName":"...","sport":"...","position":"...","legacyTier":"..."}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (typeof parsed === "object" && parsed !== null) {
          if (!result.playerName && parsed.playerName && typeof parsed.playerName === "string") {
            const trimmed = parsed.playerName.trim();
            if (trimmed.length > 0) {
              result.playerName = trimmed;
            }
          }
          if (!result.sport && parsed.sport && typeof parsed.sport === "string") {
            const normalizedSport = parsed.sport.trim().toLowerCase();
            const validSports = ["football", "basketball", "baseball", "hockey", "soccer", "tcg"];
            if (validSports.includes(normalizedSport)) {
              result.sport = normalizedSport;
            }
          }
          if (!result.position && parsed.position && typeof parsed.position === "string") {
            const trimmed = parsed.position.trim();
            if (trimmed.length > 0) {
              result.position = trimmed;
            }
          }
          if (!result.legacyTier && parsed.legacyTier && typeof parsed.legacyTier === "string") {
            const normalizedTier = parsed.legacyTier.trim().toUpperCase().replace(/\s+/g, "_");
            const validTiers: LegacyTier[] = ["PROSPECT", "RISING_STAR", "STAR", "SUPERSTAR", "AGING_VET", "RETIRED", "HOF", "LEGEND_DECEASED"];
            if (validTiers.includes(normalizedTier as LegacyTier)) {
              result.legacyTier = normalizedTier as LegacyTier;
            }
          }
        }
      } catch (parseError) {
        console.error("Error parsing AI response JSON:", parseError);
      }
    }
  } catch (error) {
    console.error("Error inferring card metadata with AI:", error);
  }
  
  result.legacyTier = result.legacyTier || inferLegacyTierFromYear(card.year, card.title);
  
  return result;
}

export async function generateCardOutlook(
  card: Card,
  timeHorizonMonths: number = 12
): Promise<CardOutlookResult> {
  // Calculate base scores
  const cardTypeScore = calculateCardTypeScore(card);
  const positionScore = calculatePositionScore(card.sport, card.position);
  const legacyScore = calculateLegacyScore(card.legacyTier);
  const liquidityScore = calculateLiquidityScore(card.salesLast30Days);
  const volatilityScore = calculateVolatilityScore(card.priceStdDevPct);
  const hypeScore = calculateHypeScore(card.avgSalePrice30, card.avgSalePrice90);
  
  // NEW: Get lifecycle-aware context
  const marketStability = assessMarketStability(card);
  const accolades = detectAccolades(card.title, card.playerName);
  const sportConfig = card.sport ? SPORT_CONFIGS[card.sport.toLowerCase()] || null : null;
  
  // NEW: Use lifecycle-aware scoring that respects career stage ranges
  const upsideScore = calculateLifecycleAwareUpside(
    card,
    cardTypeScore,
    positionScore,
    hypeScore,
    marketStability,
    sportConfig
  );
  
  const riskScore = calculateLifecycleAwareRisk(
    card,
    volatilityScore,
    liquidityScore,
    hypeScore,
    marketStability,
    sportConfig
  );
  
  const confidenceScore = calculateLifecycleAwareConfidence(
    card,
    card.salesLast30Days,
    marketStability,
    accolades
  );
  
  const action = determineAction(upsideScore, riskScore);
  const projectedOutlook = calculateProjectedOutlook(upsideScore, riskScore, hypeScore);
  
  const factors = {
    cardTypeScore: Math.round(cardTypeScore * 100) / 100,
    positionScore: Math.round(positionScore * 100) / 100,
    legacyScore: Math.round(legacyScore * 100) / 100,
    liquidityScore: Math.round(liquidityScore * 100) / 100,
    volatilityScore: Math.round(volatilityScore * 100) / 100,
    hypeScore: Math.round(hypeScore * 100) / 100,
  };
  
  // NEW: Pass additional context to explanation generator
  const explanation = await generateEditorialExplanation(
    card,
    factors,
    upsideScore,
    riskScore,
    confidenceScore,
    action,
    timeHorizonMonths,
    marketStability,
    accolades,
    sportConfig
  );
  
  return {
    cardId: card.id,
    playerName: card.playerName,
    sport: card.sport,
    position: card.position,
    timeHorizonMonths,
    action,
    upsideScore,
    riskScore,
    confidenceScore,
    projectedOutlook,
    factors,
    explanation,
  };
}

export function generateQuickOutlook(card: Card): {
  action: OutlookAction;
  upsideScore: number;
  riskScore: number;
  confidenceScore: number;
} {
  // Calculate base scores
  const cardTypeScore = calculateCardTypeScore(card);
  const positionScore = calculatePositionScore(card.sport, card.position);
  const liquidityScore = calculateLiquidityScore(card.salesLast30Days);
  const volatilityScore = calculateVolatilityScore(card.priceStdDevPct);
  const hypeScore = calculateHypeScore(card.avgSalePrice30, card.avgSalePrice90);
  
  // NEW: Get lifecycle-aware context
  const marketStability = assessMarketStability(card);
  const accolades = detectAccolades(card.title, card.playerName);
  const sportConfig = card.sport ? SPORT_CONFIGS[card.sport.toLowerCase()] || null : null;
  
  // NEW: Use lifecycle-aware scoring
  const upsideScore = calculateLifecycleAwareUpside(
    card,
    cardTypeScore,
    positionScore,
    hypeScore,
    marketStability,
    sportConfig
  );
  
  const riskScore = calculateLifecycleAwareRisk(
    card,
    volatilityScore,
    liquidityScore,
    hypeScore,
    marketStability,
    sportConfig
  );
  
  const confidenceScore = calculateLifecycleAwareConfidence(
    card,
    card.salesLast30Days,
    marketStability,
    accolades
  );
  
  const action = determineAction(upsideScore, riskScore);
  
  return { action, upsideScore, riskScore, confidenceScore };
}
