/**
 * Growth Projections Service
 * 
 * Generates personalized collection growth projections based on:
 * - Card outlook data (upside scores, risk scores, market temperature)
 * - Market trends from the player outlook cache
 * - Historical value changes
 */

import { db } from "./db";
import { cards, displayCases, playerOutlookCache } from "@shared/schema";
import type { Card, MarketTemperature, PlayerVerdict } from "@shared/schema";
import { eq, and, isNotNull, sql, desc, inArray } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export interface GrowthProjection {
  timeframe: "3m" | "6m" | "12m";
  label: string;
  bearCase: {
    valuePct: number;
    dollarChange: number;
    projectedValue: number;
  };
  baseCase: {
    valuePct: number;
    dollarChange: number;
    projectedValue: number;
  };
  bullCase: {
    valuePct: number;
    dollarChange: number;
    projectedValue: number;
  };
}

export interface CardProjectionDetail {
  cardId: number;
  playerName: string;
  sport: string;
  currentValue: number;
  projectedGrowth: {
    "3m": number;
    "6m": number;
    "12m": number;
  };
  growthDriver: string;
  riskLevel: "low" | "medium" | "high";
  temperature: MarketTemperature | null;
  verdict: PlayerVerdict | null;
}

export interface GrowthInsight {
  type: "opportunity" | "risk" | "trend";
  title: string;
  description: string;
  impactLevel: "high" | "medium" | "low";
  affectedCards: number;
}

export interface PortfolioGrowthResponse {
  currentValue: number;
  projections: GrowthProjection[];
  topGrowers: CardProjectionDetail[];
  riskCards: CardProjectionDetail[];
  insights: GrowthInsight[];
  sportBreakdown: {
    sport: string;
    value: number;
    projectedGrowth12m: number;
    cardCount: number;
  }[];
  temperatureBreakdown: {
    temperature: MarketTemperature;
    value: number;
    cardCount: number;
  }[];
  methodology: string;
  generatedAt: string;
}

const TEMPERATURE_GROWTH_FACTORS: Record<MarketTemperature, { bear: number; base: number; bull: number }> = {
  HOT: { bear: -5, base: 15, bull: 40 },
  WARM: { bear: -8, base: 8, bull: 25 },
  NEUTRAL: { bear: -10, base: 3, bull: 15 },
  COOLING: { bear: -20, base: -5, bull: 5 },
};

const VERDICT_GROWTH_MODIFIERS: Record<string, number> = {
  ACCUMULATE: 1.3,
  HOLD_CORE: 1.0,
  TRADE_THE_HYPE: 0.7,
  AVOID_NEW_MONEY: 0.5,
  SPECULATIVE_FLYER: 1.1,
  MONITOR: 0.9,
  BUY: 1.2,
  SELL: 0.6,
  HOLD: 0.95,
};

const RISK_LEVEL_MAP: Record<string, "low" | "medium" | "high"> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

// Career stage modifiers - retired and aging players have limited/no growth potential
const CAREER_STAGE_MODIFIERS: Record<string, { multiplier: number; maxGrowth: number; minGrowth: number }> = {
  // Retired players: stable market, minimal movement
  RETIRED: { multiplier: 0.0, maxGrowth: 1, minGrowth: -2 },
  RETIRED_HOF: { multiplier: 0.1, maxGrowth: 3, minGrowth: -1 },
  // Aging vets: declining value trajectory
  AGING_VET: { multiplier: 0.2, maxGrowth: 2, minGrowth: -5 },
  // Prime players: solid but not explosive
  PRIME: { multiplier: 0.9, maxGrowth: 25, minGrowth: -15 },
  SUPERSTAR: { multiplier: 1.1, maxGrowth: 35, minGrowth: -12 },
  // Rising stars: highest upside potential
  RISING_STAR: { multiplier: 1.2, maxGrowth: 50, minGrowth: -20 },
  RISING: { multiplier: 1.2, maxGrowth: 50, minGrowth: -20 },
  BREAKOUT: { multiplier: 1.3, maxGrowth: 60, minGrowth: -25 },
  // Franchise core (established stars)
  FRANCHISE_CORE: { multiplier: 1.0, maxGrowth: 30, minGrowth: -10 },
};

const DEFAULT_CAREER_STAGE = { multiplier: 0.8, maxGrowth: 15, minGrowth: -10 };

function calculateCardGrowth(
  card: Card,
  temperature: MarketTemperature | null,
  upsideScore: number | null,
  riskScore: number | null,
  verdict: string | null,
  monthsAhead: number
): { bear: number; base: number; bull: number } {
  const temp = temperature || "NEUTRAL";
  const baseFactor = TEMPERATURE_GROWTH_FACTORS[temp];
  
  // Get career stage modifier
  const legacyTier = card.legacyTier?.toUpperCase() || "";
  const careerMod = CAREER_STAGE_MODIFIERS[legacyTier] || DEFAULT_CAREER_STAGE;
  
  const upsideMod = upsideScore ? (upsideScore - 50) / 100 : 0;
  const riskMod = riskScore ? (riskScore - 50) / 100 : 0;
  const verdictMod = verdict ? (VERDICT_GROWTH_MODIFIERS[verdict] || 1.0) : 1.0;
  
  const timeScale = monthsAhead / 12;
  
  // Apply career stage multiplier to dampen growth for retired/aging players
  const baseGrowth = {
    bear: (baseFactor.bear - riskMod * 10) * timeScale * verdictMod * careerMod.multiplier,
    base: (baseFactor.base + upsideMod * 5) * timeScale * verdictMod * careerMod.multiplier,
    bull: (baseFactor.bull + upsideMod * 15) * timeScale * verdictMod * careerMod.multiplier,
  };
  
  // Clamp growth to career stage limits
  return {
    bear: Math.round(Math.max(careerMod.minGrowth, Math.min(careerMod.maxGrowth, baseGrowth.bear)) * 10) / 10,
    base: Math.round(Math.max(careerMod.minGrowth, Math.min(careerMod.maxGrowth, baseGrowth.base)) * 10) / 10,
    bull: Math.round(Math.max(careerMod.minGrowth, Math.min(careerMod.maxGrowth, baseGrowth.bull)) * 10) / 10,
  };
}

function determineGrowthDriver(
  temperature: MarketTemperature | null,
  verdict: string | null,
  upsideScore: number | null,
  sport: string | null,
  legacyTier: string | null
): string {
  const tier = legacyTier?.toUpperCase() || "";
  
  // Career stage takes priority for retired/aging players
  if (tier === "RETIRED") {
    return "Retired - stable pricing";
  }
  if (tier === "RETIRED_HOF") {
    return "Hall of Famer - legacy value";
  }
  if (tier === "AGING_VET") {
    return "Aging veteran - limited upside";
  }
  
  if (!temperature && !verdict) {
    return "Limited data available";
  }
  
  if (temperature === "HOT") {
    return "High market demand driving value";
  }
  if (verdict === "ACCUMULATE" || verdict === "BUY") {
    return "Strong investment signals";
  }
  if (upsideScore && upsideScore > 70) {
    return "High upside potential";
  }
  if (verdict === "SPECULATIVE_FLYER") {
    return "Speculative upside opportunity";
  }
  if (temperature === "WARM") {
    return "Positive market momentum";
  }
  if (temperature === "COOLING") {
    return "Market correction phase";
  }
  
  // Career stage messaging for active players
  if (tier === "RISING_STAR" || tier === "RISING" || tier === "BREAKOUT") {
    return "Rising star potential";
  }
  if (tier === "SUPERSTAR" || tier === "FRANCHISE_CORE") {
    return "Elite player status";
  }
  if (tier === "PRIME") {
    return "Prime years value";
  }
  
  return "Stable market conditions";
}

export async function getPortfolioGrowthProjections(userId: string): Promise<PortfolioGrowthResponse> {
  const userCases = await db
    .select()
    .from(displayCases)
    .where(eq(displayCases.userId, userId));
  
  if (userCases.length === 0) {
    return {
      currentValue: 0,
      projections: [],
      topGrowers: [],
      riskCards: [],
      insights: [],
      sportBreakdown: [],
      temperatureBreakdown: [],
      methodology: "No cards in collection to project.",
      generatedAt: new Date().toISOString(),
    };
  }
  
  const caseIds = userCases.map(c => c.id);
  
  const userCards = await db
    .select()
    .from(cards)
    .where(inArray(cards.displayCaseId, caseIds));
  
  if (userCards.length === 0) {
    return {
      currentValue: 0,
      projections: [],
      topGrowers: [],
      riskCards: [],
      insights: [],
      sportBreakdown: [],
      temperatureBreakdown: [],
      methodology: "No cards in collection to project.",
      generatedAt: new Date().toISOString(),
    };
  }
  
  const uniqueCardsMap = new Map<string, Card>();
  for (const card of userCards) {
    const key = card.imagePath || `card-${card.id}`;
    const existing = uniqueCardsMap.get(key);
    if (!existing || (card.estimatedValue || 0) > (existing.estimatedValue || 0)) {
      uniqueCardsMap.set(key, card);
    }
  }
  const uniqueCards = Array.from(uniqueCardsMap.values());
  
  const cachedOutlooks = await db
    .select()
    .from(playerOutlookCache)
    .where(isNotNull(playerOutlookCache.outlookJson));
  
  const outlookMap = new Map<string, any>();
  for (const cache of cachedOutlooks) {
    try {
      const outlook = typeof cache.outlookJson === 'string' 
        ? JSON.parse(cache.outlookJson) 
        : cache.outlookJson;
      const verdict = outlook?.investmentCall?.verdict || outlook?.snapshot?.investmentCall?.verdict || null;
      outlookMap.set(cache.playerKey.toLowerCase(), {
        temperature: cache.temperature,
        verdict,
        outlook
      });
    } catch (e) {
    }
  }
  
  const currentValue = uniqueCards.reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
  
  const cardProjections: CardProjectionDetail[] = [];
  const sportStats: Record<string, { value: number; growth12m: number; count: number }> = {};
  const tempStats: Record<string, { value: number; count: number }> = {};
  
  let totalBear3m = 0, totalBase3m = 0, totalBull3m = 0;
  let totalBear6m = 0, totalBase6m = 0, totalBull6m = 0;
  let totalBear12m = 0, totalBase12m = 0, totalBull12m = 0;
  
  for (const card of uniqueCards) {
    const cardValue = card.estimatedValue || 0;
    if (cardValue === 0) continue;
    
    let temperature: MarketTemperature | null = null;
    let verdict: PlayerVerdict | null = null;
    let upsideScore = card.outlookUpsideScore;
    let riskScore = card.outlookRiskScore;
    
    if (card.playerName && card.sport) {
      const key = `${card.sport.toLowerCase()}:${card.playerName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const cached = outlookMap.get(key);
      if (cached) {
        temperature = cached.temperature as MarketTemperature;
        verdict = cached.verdict as PlayerVerdict;
        if (cached.outlook?.investmentCall?.scores) {
          upsideScore = upsideScore || cached.outlook.investmentCall.scores.upside;
          riskScore = riskScore || cached.outlook.investmentCall.scores.risk;
        }
      }
    }
    
    const growth3m = calculateCardGrowth(card, temperature, upsideScore || null, riskScore || null, verdict, 3);
    const growth6m = calculateCardGrowth(card, temperature, upsideScore || null, riskScore || null, verdict, 6);
    const growth12m = calculateCardGrowth(card, temperature, upsideScore || null, riskScore || null, verdict, 12);
    
    totalBear3m += cardValue * (1 + growth3m.bear / 100);
    totalBase3m += cardValue * (1 + growth3m.base / 100);
    totalBull3m += cardValue * (1 + growth3m.bull / 100);
    
    totalBear6m += cardValue * (1 + growth6m.bear / 100);
    totalBase6m += cardValue * (1 + growth6m.base / 100);
    totalBull6m += cardValue * (1 + growth6m.bull / 100);
    
    totalBear12m += cardValue * (1 + growth12m.bear / 100);
    totalBase12m += cardValue * (1 + growth12m.base / 100);
    totalBull12m += cardValue * (1 + growth12m.bull / 100);
    
    const sport = card.sport || "unknown";
    if (!sportStats[sport]) {
      sportStats[sport] = { value: 0, growth12m: 0, count: 0 };
    }
    sportStats[sport].value += cardValue;
    sportStats[sport].growth12m += cardValue * growth12m.base / 100;
    sportStats[sport].count++;
    
    const tempKey = temperature || "UNKNOWN";
    if (!tempStats[tempKey]) {
      tempStats[tempKey] = { value: 0, count: 0 };
    }
    tempStats[tempKey].value += cardValue;
    tempStats[tempKey].count++;
    
    cardProjections.push({
      cardId: card.id,
      playerName: card.playerName || card.title,
      sport: card.sport || "unknown",
      currentValue: cardValue,
      projectedGrowth: {
        "3m": growth3m.base,
        "6m": growth6m.base,
        "12m": growth12m.base,
      },
      growthDriver: determineGrowthDriver(temperature, verdict, upsideScore || null, card.sport, card.legacyTier),
      riskLevel: riskScore ? (riskScore > 65 ? "high" : riskScore > 40 ? "medium" : "low") : "medium",
      temperature,
      verdict,
    });
  }
  
  const projections: GrowthProjection[] = [
    {
      timeframe: "3m",
      label: "3 Months",
      bearCase: {
        valuePct: Math.round((totalBear3m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBear3m - currentValue),
        projectedValue: Math.round(totalBear3m),
      },
      baseCase: {
        valuePct: Math.round((totalBase3m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBase3m - currentValue),
        projectedValue: Math.round(totalBase3m),
      },
      bullCase: {
        valuePct: Math.round((totalBull3m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBull3m - currentValue),
        projectedValue: Math.round(totalBull3m),
      },
    },
    {
      timeframe: "6m",
      label: "6 Months",
      bearCase: {
        valuePct: Math.round((totalBear6m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBear6m - currentValue),
        projectedValue: Math.round(totalBear6m),
      },
      baseCase: {
        valuePct: Math.round((totalBase6m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBase6m - currentValue),
        projectedValue: Math.round(totalBase6m),
      },
      bullCase: {
        valuePct: Math.round((totalBull6m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBull6m - currentValue),
        projectedValue: Math.round(totalBull6m),
      },
    },
    {
      timeframe: "12m",
      label: "12 Months",
      bearCase: {
        valuePct: Math.round((totalBear12m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBear12m - currentValue),
        projectedValue: Math.round(totalBear12m),
      },
      baseCase: {
        valuePct: Math.round((totalBase12m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBase12m - currentValue),
        projectedValue: Math.round(totalBase12m),
      },
      bullCase: {
        valuePct: Math.round((totalBull12m / currentValue - 1) * 1000) / 10,
        dollarChange: Math.round(totalBull12m - currentValue),
        projectedValue: Math.round(totalBull12m),
      },
    },
  ];
  
  const topGrowers = [...cardProjections]
    .filter(c => c.currentValue > 0)
    .sort((a, b) => b.projectedGrowth["12m"] - a.projectedGrowth["12m"])
    .slice(0, 5);
  
  // More comprehensive risk detection - every collection has some risk profile
  const riskCards = [...cardProjections]
    .filter(c => {
      // Explicit high risk
      if (c.riskLevel === "high") return true;
      // Negative projected growth
      if (c.projectedGrowth["12m"] < 0) return true;
      // Near-flat growth indicates stagnant value (retired/aging players)
      if (c.projectedGrowth["12m"] <= 1 && c.currentValue >= 20) return true;
      // Negative verdicts
      if (c.verdict === "AVOID") return true;
      // Cooling markets with meaningful value
      if (c.temperature === "COOLING" && c.currentValue >= 30) return true;
      return false;
    })
    .sort((a, b) => {
      // Sort by risk priority: negative growth first, then flat growth, then by value at risk
      const aScore = a.projectedGrowth["12m"] - (a.riskLevel === "high" ? 10 : 0);
      const bScore = b.projectedGrowth["12m"] - (b.riskLevel === "high" ? 10 : 0);
      return aScore - bScore;
    })
    .slice(0, 5);
  
  const insights = generateInsights(cardProjections, sportStats, tempStats, currentValue);
  
  const sportBreakdown = Object.entries(sportStats)
    .map(([sport, stats]) => ({
      sport,
      value: Math.round(stats.value),
      projectedGrowth12m: stats.value > 0 ? Math.round(stats.growth12m / stats.value * 1000) / 10 : 0,
      cardCount: stats.count,
    }))
    .sort((a, b) => b.value - a.value);
  
  const temperatureBreakdown = Object.entries(tempStats)
    .filter(([temp]) => temp !== "UNKNOWN")
    .map(([temperature, stats]) => ({
      temperature: temperature as MarketTemperature,
      value: Math.round(stats.value),
      cardCount: stats.count,
    }))
    .sort((a, b) => b.value - a.value);
  
  return {
    currentValue: Math.round(currentValue),
    projections,
    topGrowers,
    riskCards,
    insights,
    sportBreakdown,
    temperatureBreakdown,
    methodology: "Projections based on market temperature, investment verdicts, and upside/risk scores from AI analysis. Bear/base/bull cases represent pessimistic, expected, and optimistic scenarios.",
    generatedAt: new Date().toISOString(),
  };
}

function generateInsights(
  cardProjections: CardProjectionDetail[],
  sportStats: Record<string, { value: number; growth12m: number; count: number }>,
  tempStats: Record<string, { value: number; count: number }>,
  totalValue: number
): GrowthInsight[] {
  const insights: GrowthInsight[] = [];
  
  const hotCards = cardProjections.filter(c => c.temperature === "HOT");
  if (hotCards.length > 0) {
    const hotValue = hotCards.reduce((sum, c) => sum + c.currentValue, 0);
    const hotPct = Math.round(hotValue / totalValue * 100);
    insights.push({
      type: "opportunity",
      title: "Hot Market Cards",
      description: `${hotCards.length} cards (${hotPct}% of value) are in high-demand markets with strong growth potential.`,
      impactLevel: hotPct > 30 ? "high" : hotPct > 15 ? "medium" : "low",
      affectedCards: hotCards.length,
    });
  }
  
  const coolingCards = cardProjections.filter(c => c.temperature === "COOLING");
  if (coolingCards.length > 0) {
    const coolingValue = coolingCards.reduce((sum, c) => sum + c.currentValue, 0);
    const coolingPct = Math.round(coolingValue / totalValue * 100);
    insights.push({
      type: "risk",
      title: "Cooling Market Positions",
      description: `${coolingCards.length} cards (${coolingPct}% of value) are in cooling markets. Consider selling or holding through the cycle.`,
      impactLevel: coolingPct > 30 ? "high" : coolingPct > 15 ? "medium" : "low",
      affectedCards: coolingCards.length,
    });
  }
  
  const highRiskCards = cardProjections.filter(c => c.riskLevel === "high");
  if (highRiskCards.length >= 3) {
    insights.push({
      type: "risk",
      title: "Portfolio Risk Concentration",
      description: `${highRiskCards.length} cards have elevated risk profiles. Diversification may reduce volatility.`,
      impactLevel: highRiskCards.length > 5 ? "high" : "medium",
      affectedCards: highRiskCards.length,
    });
  }
  
  // Stagnant value cards (retired/aging players with near-flat growth)
  const stagnantCards = cardProjections.filter(c => 
    c.projectedGrowth["12m"] <= 1 && c.currentValue >= 20
  );
  if (stagnantCards.length > 0) {
    const stagnantValue = stagnantCards.reduce((sum, c) => sum + c.currentValue, 0);
    const stagnantPct = Math.round(stagnantValue / totalValue * 100);
    insights.push({
      type: "risk",
      title: "Stagnant Value Holdings",
      description: `${stagnantCards.length} cards ($${Math.round(stagnantValue)}, ${stagnantPct}% of portfolio) have minimal growth potential. Consider reallocating to active players.`,
      impactLevel: stagnantPct > 30 ? "high" : stagnantPct > 15 ? "medium" : "low",
      affectedCards: stagnantCards.length,
    });
  }
  
  const sportEntries = Object.entries(sportStats);
  if (sportEntries.length === 1) {
    const [sport] = sportEntries[0];
    insights.push({
      type: "trend",
      title: "Single Sport Focus",
      description: `Your collection is concentrated in ${sport}. Consider diversifying across sports for stability.`,
      impactLevel: "medium",
      affectedCards: cardProjections.length,
    });
  }
  
  const highGrowthCards = cardProjections.filter(c => c.projectedGrowth["12m"] > 15);
  if (highGrowthCards.length > 0) {
    insights.push({
      type: "opportunity",
      title: "High Growth Potential",
      description: `${highGrowthCards.length} cards are projected to grow 15%+ in the next 12 months.`,
      impactLevel: highGrowthCards.length > 3 ? "high" : "medium",
      affectedCards: highGrowthCards.length,
    });
  }
  
  return insights;
}

export async function generateAIGrowthSummary(projections: PortfolioGrowthResponse): Promise<string> {
  if (projections.currentValue === 0) {
    return "Add cards to your collection to see personalized growth projections.";
  }
  
  try {
    const systemPrompt = "You are a sports card investment analyst. Provide a concise 2-3 sentence summary of the portfolio growth outlook. Be specific about opportunities and risks. Do not use emojis.";
    const userPrompt = `Analyze this portfolio:
Current Value: $${projections.currentValue}
12-Month Base Case Growth: ${projections.projections.find(p => p.timeframe === "12m")?.baseCase.valuePct || 0}%
Top Growth Drivers: ${projections.topGrowers.slice(0, 3).map(c => c.playerName).join(", ")}
Risk Cards: ${projections.riskCards.slice(0, 2).map(c => c.playerName).join(", ")}
Sport Mix: ${projections.sportBreakdown.map(s => `${s.sport} (${s.cardCount} cards)`).join(", ")}
Market Temperature: ${projections.temperatureBreakdown.map(t => `${t.temperature} (${t.cardCount})`).join(", ")}`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${systemPrompt}\n\n${userPrompt}`,
    });
    
    return response.text || "Unable to generate summary.";
  } catch (error) {
    console.error("[GrowthProjections] AI summary error:", error);
    return `Your $${projections.currentValue.toLocaleString()} portfolio is projected to grow ${projections.projections.find(p => p.timeframe === "12m")?.baseCase.valuePct || 0}% over the next 12 months in the base case scenario.`;
  }
}
