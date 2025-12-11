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
  if (upsideScore >= 70 && riskScore <= 60) {
    return "BUY";
  } else if (upsideScore <= 40 && riskScore >= 60) {
    return "SELL";
  }
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

export async function generateCardOutlook(
  card: Card,
  timeHorizonMonths: number = 12
): Promise<CardOutlookResult> {
  const cardTypeScore = calculateCardTypeScore(card);
  const positionScore = calculatePositionScore(card.sport, card.position);
  const legacyScore = calculateLegacyScore(card.legacyTier);
  const liquidityScore = calculateLiquidityScore(card.salesLast30Days);
  const volatilityScore = calculateVolatilityScore(card.priceStdDevPct);
  const hypeScore = calculateHypeScore(card.avgSalePrice30, card.avgSalePrice90);
  
  const upsideScore = calculateUpsideScore(
    cardTypeScore,
    positionScore,
    legacyScore,
    volatilityScore,
    hypeScore
  );
  
  const riskScore = calculateRiskScore(
    volatilityScore,
    card.legacyTier,
    liquidityScore,
    hypeScore
  );
  
  const confidenceScore = calculateConfidenceScore(card, card.salesLast30Days);
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
  
  const explanation = await generateExplanation(
    card,
    factors,
    upsideScore,
    riskScore,
    confidenceScore,
    action,
    timeHorizonMonths
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
  const cardTypeScore = calculateCardTypeScore(card);
  const positionScore = calculatePositionScore(card.sport, card.position);
  const legacyScore = calculateLegacyScore(card.legacyTier);
  const liquidityScore = calculateLiquidityScore(card.salesLast30Days);
  const volatilityScore = calculateVolatilityScore(card.priceStdDevPct);
  const hypeScore = calculateHypeScore(card.avgSalePrice30, card.avgSalePrice90);
  
  const upsideScore = calculateUpsideScore(
    cardTypeScore,
    positionScore,
    legacyScore,
    volatilityScore,
    hypeScore
  );
  
  const riskScore = calculateRiskScore(
    volatilityScore,
    card.legacyTier,
    liquidityScore,
    hypeScore
  );
  
  const confidenceScore = calculateConfidenceScore(card, card.salesLast30Days);
  const action = determineAction(upsideScore, riskScore);
  
  return { action, upsideScore, riskScore, confidenceScore };
}
