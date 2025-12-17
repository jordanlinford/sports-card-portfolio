// Card Outlook AI 2.0 - Deterministic Signal Computation Engine
// "AI should explain, not decide" - all action logic is transparent and rule-based

import OpenAI from "openai";
import type { Card, CardOutlook, PricePoint } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://ai.replit.dev/v1beta",
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Static score mappings
const SPORT_SCORES: Record<string, number> = {
  basketball: 10,
  football: 9,
  baseball: 8,
  hockey: 6,
  soccer: 7,
  golf: 5,
  tennis: 4,
  boxing: 5,
  mma: 5,
  wrestling: 4,
  racing: 3,
  other: 3,
};

const POSITION_SCORES: Record<string, Record<string, number>> = {
  basketball: { pg: 9, sg: 8, sf: 8, pf: 7, c: 7 },
  football: { qb: 10, rb: 8, wr: 9, te: 6, ol: 3, dl: 4, lb: 5, db: 6, k: 2, p: 1 },
  baseball: { p: 8, c: 6, "1b": 5, "2b": 6, "3b": 6, ss: 7, of: 7, dh: 4 },
  hockey: { c: 8, lw: 7, rw: 7, d: 6, g: 7 },
  soccer: { gk: 6, cb: 5, fb: 5, cm: 7, am: 8, fw: 9 },
};

const CAREER_STAGE_BOOST: Record<string, number> = {
  ROOKIE: 1.3,      // High upside potential
  RISING: 1.2,      // Growing value
  ELITE: 1.0,       // Peak value, stable
  VETERAN: 0.8,     // Declining potential
  RETIRED: 0.6,     // Fixed legacy value
  LEGEND: 1.1,      // Premium for legends
  UNKNOWN: 1.0,     // Neutral
};

// Compute Liquidity Score (1-10) based on sold comp count
export function computeLiquidityScore(pricePoints: PricePoint[], daysWindow: number = 90): number {
  const now = new Date();
  const windowStart = new Date(now.getTime() - daysWindow * 24 * 60 * 60 * 1000);
  
  const recentComps = pricePoints.filter(pp => {
    const ppDate = new Date(pp.date);
    return ppDate >= windowStart;
  });
  
  const count = recentComps.length;
  
  if (count === 0) return 1;
  if (count <= 2) return 2;
  if (count <= 5) return 4;
  if (count <= 10) return 6;
  if (count <= 20) return 8;
  return 10;
}

// Compute Trend Score (1-10) based on price movement
// 1 = strong downtrend, 5 = flat, 10 = strong uptrend
export function computeTrendScore(pricePoints: PricePoint[]): number {
  if (pricePoints.length < 2) return 5; // Not enough data, assume flat
  
  // Sort by date ascending
  const sorted = [...pricePoints].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Use simple linear regression slope
  const n = sorted.length;
  const prices = sorted.map(pp => pp.price);
  const meanPrice = prices.reduce((a, b) => a + b, 0) / n;
  
  // Calculate percentage change from first half to second half
  const halfN = Math.floor(n / 2);
  const firstHalfAvg = prices.slice(0, halfN).reduce((a, b) => a + b, 0) / halfN;
  const secondHalfAvg = prices.slice(halfN).reduce((a, b) => a + b, 0) / (n - halfN);
  
  if (firstHalfAvg === 0) return 5;
  
  const pctChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
  
  // Map percentage change to 1-10 scale
  // -30% or worse = 1, +30% or better = 10
  if (pctChange <= -30) return 1;
  if (pctChange <= -20) return 2;
  if (pctChange <= -10) return 3;
  if (pctChange <= -5) return 4;
  if (pctChange <= 5) return 5;
  if (pctChange <= 10) return 6;
  if (pctChange <= 20) return 7;
  if (pctChange <= 30) return 8;
  if (pctChange <= 50) return 9;
  return 10;
}

// Compute Volatility Score (1-10) based on price variance
// 1 = very stable, 10 = highly volatile
export function computeVolatilityScore(pricePoints: PricePoint[]): number {
  if (pricePoints.length < 2) return 5; // Not enough data
  
  const prices = pricePoints.map(pp => pp.price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  if (mean === 0) return 5;
  
  // Coefficient of variation (CV) = stddev / mean
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stddev = Math.sqrt(variance);
  const cv = (stddev / mean) * 100; // As percentage
  
  // Map CV to 1-10 scale
  if (cv < 5) return 1;
  if (cv < 10) return 3;
  if (cv < 20) return 5;
  if (cv < 35) return 7;
  return 10;
}

// Compute Sport Score (1-10)
export function computeSportScore(sport: string | null | undefined): number {
  if (!sport) return 5;
  const normalized = sport.toLowerCase().trim();
  return SPORT_SCORES[normalized] || 5;
}

// Compute Position Score (1-10)
export function computePositionScore(sport: string | null | undefined, position: string | null | undefined): number {
  if (!sport || !position) return 5;
  
  const normalizedSport = sport.toLowerCase().trim();
  const normalizedPosition = position.toLowerCase().trim();
  
  const sportPositions = POSITION_SCORES[normalizedSport];
  if (!sportPositions) return 5;
  
  return sportPositions[normalizedPosition] || 5;
}

// Compute Card Type Score (1-10) based on rarity/brand/grade
export function computeCardTypeScore(card: Card): number {
  let score = 5; // Base score
  
  // Grade bonus
  if (card.grade) {
    const gradeUpper = card.grade.toUpperCase();
    if (gradeUpper.includes("10") || gradeUpper.includes("GEM")) score += 2;
    else if (gradeUpper.includes("9.5")) score += 1.5;
    else if (gradeUpper.includes("9")) score += 1;
    else if (gradeUpper.includes("8")) score += 0.5;
  }
  
  // Rookie bonus
  if (card.isRookie) score += 1.5;
  
  // Auto bonus
  if (card.hasAuto) score += 1;
  
  // Numbered bonus
  if (card.isNumbered) {
    const serialNum = card.serialNumber;
    if (serialNum && serialNum <= 10) score += 2;
    else if (serialNum && serialNum <= 25) score += 1.5;
    else if (serialNum && serialNum <= 99) score += 1;
    else score += 0.5;
  }
  
  // Variation/parallel bonus
  if (card.variation) {
    const varLower = card.variation.toLowerCase();
    if (varLower.includes("1/1") || varLower.includes("one of one")) score += 3;
    else if (varLower.includes("gold") || varLower.includes("superfractor")) score += 2;
    else if (varLower.includes("refractor") || varLower.includes("prizm") || varLower.includes("holo")) score += 1;
  }
  
  return Math.min(10, Math.max(1, Math.round(score)));
}

// Composite Scores (0-100)
export function computeDemandScore(liquidityScore: number, sportScore: number, positionScore: number): number {
  const weighted = (liquidityScore * 0.5 + sportScore * 0.3 + positionScore * 0.2) * 10;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function computeMomentumScore(trendScore: number, volatilityScore: number): number {
  // High trend + low volatility = high momentum
  const weighted = (trendScore * 0.7 + (11 - volatilityScore) * 0.3) * 10;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function computeQualityScore(cardTypeScore: number, careerStage: string | null | undefined): number {
  const stageBoost = CAREER_STAGE_BOOST[careerStage || "UNKNOWN"] || 1.0;
  const weighted = cardTypeScore * stageBoost * 10;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function computeUpsideScore(
  qualityScore: number, 
  momentumScore: number, 
  careerStage: string | null | undefined
): number {
  const stageBoost = CAREER_STAGE_BOOST[careerStage || "UNKNOWN"] || 1.0;
  const weighted = (qualityScore * 0.4 + momentumScore * 0.6) * stageBoost;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function computeRiskScore(
  volatilityScore: number, 
  liquidityScore: number, 
  confidence: string | null | undefined
): number {
  // High volatility + low liquidity + low confidence = high risk
  const confidencePenalty = confidence === "LOW" ? 20 : confidence === "MEDIUM" ? 10 : 0;
  const liquidityPenalty = (10 - liquidityScore) * 3;
  const volatilityPenalty = volatilityScore * 5;
  
  const risk = volatilityPenalty + liquidityPenalty + confidencePenalty;
  return Math.min(100, Math.max(0, Math.round(risk)));
}

// Career Stage Auto-Detection
export function detectCareerStage(card: Card): string {
  // TCG cards don't have career stages
  if (card.cardCategory === "tcg" || card.cardCategory === "non_sport") {
    return "UNKNOWN";
  }
  
  // Check for rookie indicators
  const titleLower = (card.title || "").toLowerCase();
  const setLower = (card.set || "").toLowerCase();
  
  const isRookieCard = card.isRookie || 
    titleLower.includes("rookie") || 
    titleLower.includes("rc") ||
    setLower.includes("rookie") ||
    setLower.includes("draft") ||
    setLower.includes("bowman 1st");
  
  // Check legacy tier if set
  if (card.legacyTier) {
    const tierMap: Record<string, string> = {
      PROSPECT: "ROOKIE",
      RISING_STAR: "RISING",
      STAR: "ELITE",
      SUPERSTAR: "ELITE",
      AGING_VET: "VETERAN",
      RETIRED: "RETIRED",
      HOF: "LEGEND",
      LEGEND_DECEASED: "LEGEND",
    };
    return tierMap[card.legacyTier] || "UNKNOWN";
  }
  
  // Use card year to estimate career stage
  const currentYear = new Date().getFullYear();
  const cardYear = card.year;
  
  if (!cardYear) {
    return isRookieCard ? "ROOKIE" : "UNKNOWN";
  }
  
  const yearsAgo = currentYear - cardYear;
  
  if (yearsAgo <= 2) {
    return isRookieCard ? "ROOKIE" : "RISING";
  } else if (yearsAgo <= 5) {
    return "RISING";
  } else if (yearsAgo <= 12) {
    return "ELITE";
  } else if (yearsAgo <= 20) {
    return "VETERAN";
  } else {
    // Could be retired or legend - check for indicators
    if (titleLower.includes("hof") || titleLower.includes("hall of fame") || 
        titleLower.includes("legend") || titleLower.includes("goat")) {
      return "LEGEND";
    }
    return "RETIRED";
  }
}

// Deterministic Action Logic
export type OutlookAction = "BUY" | "WATCH" | "SELL" | "LONG_HOLD" | "LITTLE_VALUE";

interface ActionDecision {
  action: OutlookAction;
  reasons: string[];
}

export function computeAction(
  qualityScore: number,
  demandScore: number,
  momentumScore: number,
  trendScore: number,
  volatilityScore: number,
  liquidityScore: number,
  marketValue: number | null,
  careerStage: string | null | undefined
): ActionDecision {
  const reasons: string[] = [];
  
  // LITTLE_VALUE: Low quality + low demand + low value
  if (qualityScore < 30 && demandScore < 30 && (marketValue === null || marketValue < 10)) {
    reasons.push("Low card quality and minimal demand");
    reasons.push("Market value below collectible threshold");
    return { action: "LITTLE_VALUE", reasons };
  }
  
  // LONG_HOLD: Retired/Legend + low volatility + decent demand
  if ((careerStage === "RETIRED" || careerStage === "LEGEND") && 
      volatilityScore <= 4 && demandScore >= 40) {
    reasons.push(`${careerStage} player with established legacy`);
    reasons.push("Stable price history with low volatility");
    if (careerStage === "LEGEND") reasons.push("Hall of Fame premium applies");
    return { action: "LONG_HOLD", reasons };
  }
  
  // SELL: Recent price run-up + high liquidity + rising volatility
  if (trendScore >= 8 && liquidityScore >= 6 && volatilityScore >= 6) {
    reasons.push("Recent significant price increase");
    reasons.push("High market liquidity - easy to exit");
    reasons.push("Volatility suggests potential peak");
    return { action: "SELL", reasons };
  }
  
  // Also SELL if momentum is decelerating after a spike
  if (trendScore >= 7 && momentumScore < 40 && liquidityScore >= 5) {
    reasons.push("Price momentum slowing after run-up");
    reasons.push("Good liquidity for profitable exit");
    return { action: "SELL", reasons };
  }
  
  // BUY: High quality + recent dip (low trend) + decent liquidity
  if (qualityScore >= 60 && trendScore <= 4 && liquidityScore >= 4) {
    reasons.push("High-quality card at discounted price");
    reasons.push("Recent price dip creates buying opportunity");
    if (careerStage === "ROOKIE" || careerStage === "RISING") {
      reasons.push("Young player with upside potential");
    }
    return { action: "BUY", reasons };
  }
  
  // Also BUY for undervalued quality
  if (qualityScore >= 70 && demandScore >= 50 && momentumScore >= 50) {
    reasons.push("Premium card with strong fundamentals");
    reasons.push("Solid demand and positive momentum");
    return { action: "BUY", reasons };
  }
  
  // WATCH: Default - not clearly a buy or sell
  reasons.push("Market conditions unclear for decisive action");
  if (volatilityScore >= 5) reasons.push("Price volatility warrants caution");
  if (liquidityScore < 4) reasons.push("Limited market liquidity");
  if (momentumScore >= 40 && momentumScore <= 60) reasons.push("Neutral momentum");
  
  return { action: "WATCH", reasons };
}

// Big Mover Detection
// Flags cards with asymmetric upside potential (high upside + moderate risk + liquidity + non-parabolic)
interface BigMoverResult {
  flag: boolean;
  reason: string | null;
}

export function computeBigMover(
  upsideScore: number,
  riskScore: number,
  liquidityScore: number,
  trendScore: number,
  volatilityScore: number,
  careerStage: string | null | undefined,
  dataConfidence: "HIGH" | "MEDIUM" | "LOW"
): BigMoverResult {
  // Big Mover requires:
  // 1. High upside (≥65)
  // 2. Moderate risk (25-60) - not too risky, not too safe
  // 3. Decent liquidity (≥4) - can actually trade the card
  // 4. Price not already parabolic (trend ≤ 7) - room to grow
  // 5. Not LOW confidence - need reliable data
  // 6. Not already at peak volatility (≤7) - not a bubble
  
  if (dataConfidence === "LOW") {
    return { flag: false, reason: null };
  }
  
  const highUpside = upsideScore >= 65;
  const moderateRisk = riskScore >= 25 && riskScore <= 60;
  const hasLiquidity = liquidityScore >= 4;
  const notParabolic = trendScore <= 7;
  const notBubble = volatilityScore <= 7;
  
  if (!highUpside || !moderateRisk || !hasLiquidity || !notParabolic || !notBubble) {
    return { flag: false, reason: null };
  }
  
  // Build the reason based on what makes this a Big Mover
  const reasons: string[] = [];
  
  // Career stage insights
  if (careerStage === "ROOKIE") {
    reasons.push("First-year player with breakout potential");
  } else if (careerStage === "RISING") {
    reasons.push("Rising talent not yet priced at peak");
  } else if (careerStage === "ELITE") {
    reasons.push("Elite performer with room for legacy appreciation");
  }
  
  // Market condition insights
  if (trendScore <= 4) {
    reasons.push("Currently undervalued relative to quality");
  } else if (trendScore <= 6) {
    reasons.push("Stable pricing leaves room for catalysts");
  }
  
  // Liquidity insight
  if (liquidityScore >= 7) {
    reasons.push("High liquidity allows easy entry/exit");
  }
  
  // Risk profile
  if (riskScore <= 40) {
    reasons.push("Favorable risk/reward profile");
  }
  
  // Default reason if none specific
  if (reasons.length === 0) {
    reasons.push("Asymmetric upside if key events occur");
  }
  
  return {
    flag: true,
    reason: reasons.join(". ") + "."
  };
}

// Data Confidence Computation
export function computeDataConfidence(
  pricePoints: PricePoint[],
  volatilityScore: number
): { confidence: "HIGH" | "MEDIUM" | "LOW"; reason: string } {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  
  const recent90 = pricePoints.filter(pp => new Date(pp.date) >= ninetyDaysAgo).length;
  const recent180 = pricePoints.filter(pp => new Date(pp.date) >= oneEightyDaysAgo).length;
  const total = pricePoints.length;
  
  // HIGH: 10+ comps in 180 days + low volatility
  if (recent180 >= 10 && volatilityScore <= 5) {
    return {
      confidence: "HIGH",
      reason: `${recent180} recent sold comps with tight price range`
    };
  }
  
  // MEDIUM: 4-9 comps or moderate volatility
  if (recent180 >= 4 || (total >= 6 && volatilityScore <= 7)) {
    return {
      confidence: "MEDIUM",
      reason: `${recent180} comps in last 180 days - moderate coverage`
    };
  }
  
  // LOW: sparse data
  if (total === 0) {
    return { confidence: "LOW", reason: "No sold comps found" };
  }
  
  return {
    confidence: "LOW",
    reason: `Only ${total} price point(s) - sparse data, use cautiously`
  };
}

// Main computation function that generates all signals
export interface ComputedOutlookSignals {
  // Raw scores (1-10)
  trendScore: number;
  liquidityScore: number;
  volatilityScore: number;
  sportScore: number;
  positionScore: number;
  cardTypeScore: number;
  
  // Composite scores (0-100)
  demandScore: number;
  momentumScore: number;
  qualityScore: number;
  upsideScore: number;
  riskScore: number;
  
  // Action
  action: OutlookAction;
  actionReasons: string[];
  
  // Confidence
  dataConfidence: "HIGH" | "MEDIUM" | "LOW";
  confidenceReason: string;
  
  // Career stage
  careerStageAuto: string;
  
  // Big Mover flag
  bigMoverFlag: boolean;
  bigMoverReason: string | null;
}

// AI Explanation Generator
// The AI ONLY explains the already-computed action - it does NOT decide the action

export interface OutlookExplanation {
  short: string;
  long: string;
  bullets: string[];
}

export async function generateOutlookExplanation(
  card: Card,
  signals: ComputedOutlookSignals,
  pricePoints: PricePoint[],
  marketValue: number | null
): Promise<OutlookExplanation> {
  // Sample top 5 price points for context
  const samplePrices = pricePoints.slice(0, 5).map(pp => 
    `$${pp.price} on ${pp.date} (${pp.source})`
  ).join(", ");

  const prompt = `You are a sports card market analyst. Explain WHY the following action was computed for this card.

CARD: ${card.title}
Set: ${card.set || "Unknown"} | Year: ${card.year || "Unknown"} | Grade: ${card.grade || "Ungraded"}
Category: ${card.cardCategory || "sports"} | Player: ${card.playerName || "Unknown"}

COMPUTED ACTION: ${signals.action}
Market Value: ${marketValue ? `$${marketValue.toFixed(2)}` : "Unknown"}
Career Stage: ${signals.careerStageAuto}

SIGNAL SCORES (these determined the action):
- Demand: ${signals.demandScore}/100 (Liquidity: ${signals.liquidityScore}/10)
- Momentum: ${signals.momentumScore}/100 (Trend: ${signals.trendScore}/10)
- Quality: ${signals.qualityScore}/100 (Card Type: ${signals.cardTypeScore}/10)
- Upside: ${signals.upsideScore}/100
- Risk: ${signals.riskScore}/100
- Volatility: ${signals.volatilityScore}/10
- Data Confidence: ${signals.dataConfidence}

REASONS (computed): ${signals.actionReasons.join("; ")}

RECENT PRICES: ${samplePrices || "No recent data"}

Generate a brief explanation of why ${signals.action} is the recommendation. Return JSON:
{
  "bullets": ["reason 1", "reason 2", "reason 3"],
  "short": "One sentence summary",
  "long": "2-3 paragraph detailed explanation for Pro users"
}

Keep explanations honest and data-driven. Reference the actual scores and prices.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You explain card market recommendations based on computed signals. Be concise and data-driven." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        bullets: parsed.bullets || signals.actionReasons,
        short: parsed.short || `${signals.action} based on ${signals.dataConfidence.toLowerCase()} confidence data.`,
        long: parsed.long || `The ${signals.action} recommendation is based on computed market signals.`
      };
    }
  } catch (error) {
    console.error("Failed to generate AI explanation:", error);
  }

  // Fallback to computed reasons
  return {
    bullets: signals.actionReasons,
    short: `${signals.action} recommendation based on ${signals.dataConfidence.toLowerCase()} confidence market data.`,
    long: `This ${signals.action} recommendation is computed from market signals: Demand ${signals.demandScore}/100, Momentum ${signals.momentumScore}/100, Quality ${signals.qualityScore}/100, Risk ${signals.riskScore}/100. Career stage: ${signals.careerStageAuto}. Data confidence: ${signals.dataConfidence} - ${signals.confidenceReason}.`
  };
}

export function computeAllSignals(
  card: Card,
  pricePoints: PricePoint[],
  marketValue: number | null
): ComputedOutlookSignals {
  // Compute raw scores
  const liquidityScore = computeLiquidityScore(pricePoints);
  const trendScore = computeTrendScore(pricePoints);
  const volatilityScore = computeVolatilityScore(pricePoints);
  const sportScore = computeSportScore(card.sport);
  const positionScore = computePositionScore(card.sport, card.position);
  const cardTypeScore = computeCardTypeScore(card);
  
  // Detect career stage
  const careerStageAuto = detectCareerStage(card);
  
  // Compute composite scores
  const demandScore = computeDemandScore(liquidityScore, sportScore, positionScore);
  const momentumScore = computeMomentumScore(trendScore, volatilityScore);
  const qualityScore = computeQualityScore(cardTypeScore, careerStageAuto);
  const upsideScore = computeUpsideScore(qualityScore, momentumScore, careerStageAuto);
  
  // Compute confidence first (needed for risk)
  const { confidence: dataConfidence, reason: confidenceReason } = computeDataConfidence(pricePoints, volatilityScore);
  
  const riskScore = computeRiskScore(volatilityScore, liquidityScore, dataConfidence);
  
  // Compute action
  const { action, reasons: actionReasons } = computeAction(
    qualityScore,
    demandScore,
    momentumScore,
    trendScore,
    volatilityScore,
    liquidityScore,
    marketValue,
    careerStageAuto
  );
  
  // Compute Big Mover flag
  const { flag: bigMoverFlag, reason: bigMoverReason } = computeBigMover(
    upsideScore,
    riskScore,
    liquidityScore,
    trendScore,
    volatilityScore,
    careerStageAuto,
    dataConfidence
  );
  
  return {
    trendScore,
    liquidityScore,
    volatilityScore,
    sportScore,
    positionScore,
    cardTypeScore,
    demandScore,
    momentumScore,
    qualityScore,
    upsideScore,
    riskScore,
    action,
    actionReasons,
    dataConfidence,
    confidenceReason,
    careerStageAuto,
    bigMoverFlag,
    bigMoverReason,
  };
}
