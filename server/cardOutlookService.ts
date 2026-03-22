import { GoogleGenAI } from "@google/genai";
import type { Card } from "@shared/schema";

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export type OutlookAction = "BUY" | "MONITOR" | "SELL" | "LONG_HOLD" | "LEGACY_HOLD" | "LITTLE_VALUE";

export type LegacyTier = 
  | "PROSPECT" 
  | "RISING_STAR" 
  | "STAR" 
  | "SUPERSTAR" 
  | "AGING_VET" 
  | "BUST"
  | "RETIRED" 
  | "HOF" 
  | "LEGEND_DECEASED";

export type InjuryRisk = "LOW" | "MED" | "HIGH";
export type TeamMarketSize = "SMALL" | "MEDIUM" | "LARGE";
export type InsertTier = "base" | "silver" | "refractor" | "case-hit";

// Card category types
export type CardCategory = "sports" | "tcg" | "non_sport";

// TCG Character Tiers - affects upside ceiling
export type CharacterTier = 
  | "S_TIER_ICON"      // Charizard, Pikachu, Black Lotus
  | "A_TIER_FAVORITE"  // Popular fan favorites
  | "B_TIER_POPULAR"   // Well-known characters
  | "C_TIER_NICHE"     // Niche or background characters
  | "D_TIER_COMMON";   // Generic/forgettable

// TCG Rarity Tiers - affects value floor and upside
export type RarityTier =
  | "SECRET_RARE"      // Gold stars, alt arts, chase variants
  | "ULTRA_RARE"       // Full art, VMAX, EX, GX
  | "RARE_HOLO"        // Standard holos
  | "RARE"             // Non-holo rares
  | "UNCOMMON"
  | "COMMON";

// Era Prestige - vintage vs modern
export type EraPrestige =
  | "VINTAGE_WOTC"     // 1999-2003 WotC era
  | "EARLY_MODERN"     // 2004-2015
  | "MODERN"           // 2016-present
  | "SPECIAL_SET";     // Celebrations, Hidden Fates, etc.

// Franchise Heat - is the IP currently popular?
export type FranchiseHeat = "HOT" | "STABLE" | "COOLING";

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
    seasonalMultiplier?: number;
    franchiseMultiplier?: number;
    setPrestigeTier?: string;
  };
  explanation: {
    short: string;
    long: string;
  };
  // NEW: Enhanced outlook data
  priceTargets?: PriceTargets;
  confidenceBreakdown?: ConfidenceBreakdown;
  seasonalContext?: {
    currentMultiplier: number;
    isInSeason: boolean;
    isPlayoffSeason: boolean;
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
  // Bust: Career stalled/failed - VERY LOW upside, HIGH risk
  BUST: {
    upsideRange: { min: 5, max: 20 },
    riskRange: { min: 65, max: 90 },
    confidenceFloor: 40,
    stabilityBonus: 0,
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

// ============================================
// NEW ENHANCEMENT FACTORS
// ============================================

// SEASONAL ADJUSTMENTS - Card values fluctuate with sports calendars
interface SeasonalConfig {
  peakMonths: number[];        // 1-12, months when this sport is hottest
  playoffMonths: number[];     // Championship/playoff months
  peakMultiplier: number;      // Upside boost during peak
  playoffMultiplier: number;   // Extra boost during playoffs
  offseasonPenalty: number;    // Upside reduction during offseason
}

export const SEASONAL_CONFIGS: Record<string, SeasonalConfig> = {
  football: {
    peakMonths: [9, 10, 11, 12, 1, 2],  // Sept-Feb (NFL season + Super Bowl)
    playoffMonths: [1, 2],              // January/February playoffs
    peakMultiplier: 1.15,
    playoffMultiplier: 1.25,
    offseasonPenalty: 0.85,
  },
  basketball: {
    peakMonths: [11, 12, 1, 2, 3, 4, 5, 6],  // Nov-June (NBA season)
    playoffMonths: [4, 5, 6],
    peakMultiplier: 1.1,
    playoffMultiplier: 1.2,
    offseasonPenalty: 0.9,
  },
  baseball: {
    peakMonths: [4, 5, 6, 7, 8, 9, 10],  // April-October
    playoffMonths: [10],                  // October World Series
    peakMultiplier: 1.1,
    playoffMultiplier: 1.2,
    offseasonPenalty: 0.88,
  },
  hockey: {
    peakMonths: [10, 11, 12, 1, 2, 3, 4, 5, 6],  // Oct-June
    playoffMonths: [4, 5, 6],
    peakMultiplier: 1.08,
    playoffMultiplier: 1.15,
    offseasonPenalty: 0.92,
  },
  soccer: {
    peakMonths: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5],  // Most leagues Aug-May
    playoffMonths: [5, 6, 7],  // World Cup years, Champions League
    peakMultiplier: 1.1,
    playoffMultiplier: 1.3,  // World Cup boost is significant
    offseasonPenalty: 0.9,
  },
  tcg: {
    peakMonths: [11, 12],  // Holiday season
    playoffMonths: [],
    peakMultiplier: 1.15,
    playoffMultiplier: 1.0,
    offseasonPenalty: 0.95,
  },
};

// ============================================
// TCG / NON-SPORT SCORING ENGINE
// ============================================

// Character tier scoring - determines upside ceiling (like legacy tier for sports)
const CHARACTER_TIER_SCORES: Record<CharacterTier, { upsideBase: number; riskModifier: number; confidenceFloor: number }> = {
  S_TIER_ICON: { upsideBase: 0.85, riskModifier: 0.7, confidenceFloor: 75 },      // Charizard, Pikachu
  A_TIER_FAVORITE: { upsideBase: 0.70, riskModifier: 0.8, confidenceFloor: 60 },  // Popular fan favorites
  B_TIER_POPULAR: { upsideBase: 0.50, riskModifier: 0.9, confidenceFloor: 50 },   // Well-known characters
  C_TIER_NICHE: { upsideBase: 0.25, riskModifier: 1.0, confidenceFloor: 40 },     // Niche characters
  D_TIER_COMMON: { upsideBase: 0.10, riskModifier: 1.1, confidenceFloor: 30 },    // Generic/forgettable
};

// Rarity tier scoring - affects both value floor and upside potential
const RARITY_TIER_SCORES: Record<RarityTier, { upsideMultiplier: number; riskReduction: number; valueFloor: number }> = {
  SECRET_RARE: { upsideMultiplier: 1.4, riskReduction: 0.15, valueFloor: 0.9 },   // Gold stars, alt arts
  ULTRA_RARE: { upsideMultiplier: 1.25, riskReduction: 0.10, valueFloor: 0.8 },   // Full art, VMAX
  RARE_HOLO: { upsideMultiplier: 1.1, riskReduction: 0.05, valueFloor: 0.6 },     // Standard holos
  RARE: { upsideMultiplier: 1.0, riskReduction: 0, valueFloor: 0.4 },             // Non-holo rares
  UNCOMMON: { upsideMultiplier: 0.7, riskReduction: -0.05, valueFloor: 0.2 },     // Low interest
  COMMON: { upsideMultiplier: 0.4, riskReduction: -0.10, valueFloor: 0.1 },       // Near-zero upside
};

// Era prestige - vintage vs modern affects collectibility
const ERA_PRESTIGE_SCORES: Record<EraPrestige, { upsideBonus: number; stabilityBonus: number }> = {
  VINTAGE_WOTC: { upsideBonus: 0.25, stabilityBonus: 0.3 },      // 1999-2003 WotC era (most valuable)
  EARLY_MODERN: { upsideBonus: 0.10, stabilityBonus: 0.15 },     // 2004-2015
  MODERN: { upsideBonus: 0, stabilityBonus: 0 },                  // 2016-present (baseline)
  SPECIAL_SET: { upsideBonus: 0.15, stabilityBonus: 0.1 },        // Celebrations, Hidden Fates
};

// Franchise heat - current IP popularity
const FRANCHISE_HEAT_SCORES: Record<FranchiseHeat, { upsideModifier: number; riskModifier: number }> = {
  HOT: { upsideModifier: 1.2, riskModifier: 1.1 },      // New games/movies = high demand, some volatility
  STABLE: { upsideModifier: 1.0, riskModifier: 1.0 },   // Consistent interest
  COOLING: { upsideModifier: 0.8, riskModifier: 1.15 }, // Declining interest = lower upside, higher risk
};

// Calculate TCG-specific upside score
function calculateTCGUpside(card: Card): number {
  const charTier = (card.characterTier as CharacterTier) || "C_TIER_NICHE";
  const rarityTier = (card.rarityTier as RarityTier) || "RARE";
  const era = (card.eraPrestige as EraPrestige) || "MODERN";
  const heat = (card.franchiseHeat as FranchiseHeat) || "STABLE";
  
  const charScore = CHARACTER_TIER_SCORES[charTier] || CHARACTER_TIER_SCORES.C_TIER_NICHE;
  const rarityScore = RARITY_TIER_SCORES[rarityTier] || RARITY_TIER_SCORES.RARE;
  const eraScore = ERA_PRESTIGE_SCORES[era] || ERA_PRESTIGE_SCORES.MODERN;
  const heatScore = FRANCHISE_HEAT_SCORES[heat] || FRANCHISE_HEAT_SCORES.STABLE;
  
  // Base upside from character tier
  let upside = charScore.upsideBase * 100;
  
  // Apply rarity multiplier
  upside *= rarityScore.upsideMultiplier;
  
  // Add era prestige bonus
  upside += eraScore.upsideBonus * 100;
  
  // Apply franchise heat modifier
  upside *= heatScore.upsideModifier;
  
  return clamp(Math.round(upside), 0, 100);
}

// Calculate TCG-specific risk score
function calculateTCGRisk(card: Card): number {
  const charTier = (card.characterTier as CharacterTier) || "C_TIER_NICHE";
  const rarityTier = (card.rarityTier as RarityTier) || "RARE";
  const era = (card.eraPrestige as EraPrestige) || "MODERN";
  const heat = (card.franchiseHeat as FranchiseHeat) || "STABLE";
  
  const charScore = CHARACTER_TIER_SCORES[charTier] || CHARACTER_TIER_SCORES.C_TIER_NICHE;
  const rarityScore = RARITY_TIER_SCORES[rarityTier] || RARITY_TIER_SCORES.RARE;
  const eraScore = ERA_PRESTIGE_SCORES[era] || ERA_PRESTIGE_SCORES.MODERN;
  const heatScore = FRANCHISE_HEAT_SCORES[heat] || FRANCHISE_HEAT_SCORES.STABLE;
  
  // Base risk (inverse of character tier strength)
  let risk = 50 * charScore.riskModifier;
  
  // Reduce risk for higher rarity (more collectible = stronger floor)
  risk -= rarityScore.riskReduction * 100;
  
  // Reduce risk for vintage era (proven long-term value)
  risk -= eraScore.stabilityBonus * 50;
  
  // Apply franchise heat risk modifier
  risk *= heatScore.riskModifier;
  
  return clamp(Math.round(risk), 5, 95);
}

// Calculate TCG-specific confidence score
function calculateTCGConfidence(card: Card): number {
  const charTier = (card.characterTier as CharacterTier) || "C_TIER_NICHE";
  const rarityTier = (card.rarityTier as RarityTier) || "RARE";
  const era = (card.eraPrestige as EraPrestige) || "MODERN";
  
  const charScore = CHARACTER_TIER_SCORES[charTier] || CHARACTER_TIER_SCORES.C_TIER_NICHE;
  const eraScore = ERA_PRESTIGE_SCORES[era] || ERA_PRESTIGE_SCORES.MODERN;
  
  // Start with character tier confidence floor
  let confidence = charScore.confidenceFloor;
  
  // Vintage era = more historical data = higher confidence
  confidence += eraScore.stabilityBonus * 30;
  
  // Has price history? Boost confidence
  if (card.avgSalePrice30 && card.avgSalePrice30 > 0) {
    confidence += 10;
  }
  if (card.salesLast30Days && card.salesLast30Days > 5) {
    confidence += 10;
  }
  
  return clamp(Math.round(confidence), 20, 95);
}

// Generate TCG outlook result
function generateTCGOutlook(card: Card, timeHorizonMonths: number): Omit<CardOutlookResult, 'explanation'> {
  const upsideScore = calculateTCGUpside(card);
  const riskScore = calculateTCGRisk(card);
  const confidenceScore = calculateTCGConfidence(card);
  const action = determineAction(upsideScore, riskScore, card);
  
  const charTier = (card.characterTier as CharacterTier) || "C_TIER_NICHE";
  const rarityTier = (card.rarityTier as RarityTier) || "RARE";
  
  return {
    cardId: card.id,
    playerName: card.playerName || card.title,
    sport: card.sport || "tcg",
    position: rarityTier,
    timeHorizonMonths,
    action,
    upsideScore,
    riskScore,
    confidenceScore,
    projectedOutlook: {
      bearCaseChangePct: -5 - (riskScore * 0.15),
      baseCaseChangePct: (upsideScore - riskScore) * 0.1,
      bullCaseChangePct: upsideScore * 0.25,
    },
    factors: {
      cardTypeScore: RARITY_TIER_SCORES[rarityTier]?.upsideMultiplier || 1.0,
      positionScore: 1.0,
      legacyScore: CHARACTER_TIER_SCORES[charTier]?.upsideBase || 0.5,
      liquidityScore: 0.5,
      volatilityScore: 0.5,
      hypeScore: FRANCHISE_HEAT_SCORES[(card.franchiseHeat as FranchiseHeat) || "STABLE"]?.upsideModifier || 1.0,
    },
    priceTargets: calculatePriceTargets(card),
    confidenceBreakdown: {
      salesDataConfidence: card.salesLast30Days && card.salesLast30Days > 5 ? 70 : 40,
      priceStabilityConfidence: card.priceStdDevPct && card.priceStdDevPct < 20 ? 75 : 50,
      playerStatusConfidence: confidenceScore,
      overallConfidence: confidenceScore,
      factors: [
        `Character tier: ${charTier.replace(/_/g, ' ').toLowerCase()}`,
        `Rarity: ${rarityTier.replace(/_/g, ' ').toLowerCase()}`,
        `Era: ${(card.eraPrestige || 'modern').replace(/_/g, ' ').toLowerCase()}`,
        `IP Heat: ${(card.franchiseHeat || 'stable').toLowerCase()}`,
      ],
    },
  };
}

// Generate TCG-specific explanation
async function generateTCGExplanation(
  card: Card,
  result: Omit<CardOutlookResult, 'explanation'>
): Promise<{ short: string; long: string }> {
  const charTier = (card.characterTier as CharacterTier) || "C_TIER_NICHE";
  const rarityTier = (card.rarityTier as RarityTier) || "RARE";
  const era = (card.eraPrestige as EraPrestige) || "MODERN";
  const heat = (card.franchiseHeat as FranchiseHeat) || "STABLE";
  
  const charLabel = charTier.replace(/_/g, ' ').toLowerCase();
  const rarityLabel = rarityTier.replace(/_/g, ' ').toLowerCase();
  const eraLabel = era.replace(/_/g, ' ').toLowerCase();
  
  // Build short explanation
  let short = "";
  if (result.action === "BUY") {
    if (charTier === "S_TIER_ICON" || charTier === "A_TIER_FAVORITE") {
      short = `Strong collectible with ${charLabel} character status and ${rarityLabel} rarity. The combination of iconic character recognition and scarcity suggests solid long-term value retention.`;
    } else {
      short = `This ${rarityLabel} card shows buy potential based on its rarity tier and current market position.`;
    }
  } else if (result.action === "MONITOR") {
    short = `Monitor this ${rarityLabel} card. ${heat === "HOT" ? "The franchise is currently popular but volatility is elevated." : "Market conditions suggest waiting for a better entry point."}`;
  } else {
    short = `Consider reducing exposure. ${charTier === "C_TIER_NICHE" || charTier === "D_TIER_COMMON" ? "Niche characters typically have limited upside." : "Current risk/reward balance favors taking profits."}`;
  }
  
  // Build long explanation
  const longParts = [
    `Character Analysis: This card features a ${charLabel} character, which ${charTier.includes("S_TIER") || charTier.includes("A_TIER") ? "commands strong collector interest" : "has more limited collector appeal"}.`,
    `Rarity Factor: As a ${rarityLabel}, this card ${rarityTier.includes("SECRET") || rarityTier.includes("ULTRA") ? "has scarcity working in its favor" : "faces competition from higher-tier variants"}.`,
    `Era Consideration: ${era === "VINTAGE_WOTC" ? "Vintage WotC-era cards have proven long-term value appreciation." : era === "SPECIAL_SET" ? "Special set releases often maintain collector interest." : "Modern era cards need time to establish collectible status."}`,
    `Market Heat: The franchise is currently ${heat.toLowerCase()}, ${heat === "HOT" ? "which drives demand but also volatility" : heat === "COOLING" ? "suggesting caution on new positions" : "providing stable but not explosive conditions"}.`,
  ];
  
  return {
    short,
    long: longParts.join(" "),
  };
}

function getSeasonalMultiplier(sport: string | null): number {
  if (!sport) return 1.0;
  const config = SEASONAL_CONFIGS[sport.toLowerCase()];
  if (!config) return 1.0;
  
  const currentMonth = new Date().getMonth() + 1;  // 1-12
  
  if (config.playoffMonths.includes(currentMonth)) {
    return config.playoffMultiplier;
  }
  if (config.peakMonths.includes(currentMonth)) {
    return config.peakMultiplier;
  }
  return config.offseasonPenalty;
}

// FRANCHISE POPULARITY - Big market teams command premiums
const FRANCHISE_POPULARITY: Record<string, Record<string, number>> = {
  football: {
    "cowboys": 1.2, "dallas cowboys": 1.2,
    "patriots": 1.15, "new england patriots": 1.15,
    "packers": 1.15, "green bay packers": 1.15,
    "49ers": 1.12, "san francisco 49ers": 1.12,
    "raiders": 1.1, "las vegas raiders": 1.1,
    "chiefs": 1.15, "kansas city chiefs": 1.15,
    "steelers": 1.12, "pittsburgh steelers": 1.12,
    "bears": 1.1, "chicago bears": 1.1,
    "eagles": 1.08, "philadelphia eagles": 1.08,
    "broncos": 1.05, "denver broncos": 1.05,
  },
  basketball: {
    "lakers": 1.25, "los angeles lakers": 1.25, "la lakers": 1.25,
    "celtics": 1.18, "boston celtics": 1.18,
    "bulls": 1.15, "chicago bulls": 1.15,
    "warriors": 1.12, "golden state warriors": 1.12,
    "knicks": 1.1, "new york knicks": 1.1,
    "heat": 1.08, "miami heat": 1.08,
    "spurs": 1.05, "san antonio spurs": 1.05,
    "76ers": 1.05, "philadelphia 76ers": 1.05,
  },
  baseball: {
    "yankees": 1.25, "new york yankees": 1.25,
    "dodgers": 1.18, "los angeles dodgers": 1.18, "la dodgers": 1.18,
    "red sox": 1.12, "boston red sox": 1.12,
    "cubs": 1.1, "chicago cubs": 1.1,
    "cardinals": 1.08, "st. louis cardinals": 1.08,
    "giants": 1.05, "san francisco giants": 1.05,
    "mets": 1.05, "new york mets": 1.05,
  },
  hockey: {
    "maple leafs": 1.15, "toronto maple leafs": 1.15,
    "canadiens": 1.12, "montreal canadiens": 1.12,
    "rangers": 1.1, "new york rangers": 1.1,
    "blackhawks": 1.08, "chicago blackhawks": 1.08,
    "bruins": 1.08, "boston bruins": 1.08,
    "penguins": 1.05, "pittsburgh penguins": 1.05,
  },
  soccer: {
    "real madrid": 1.25,
    "barcelona": 1.2, "fc barcelona": 1.2,
    "manchester united": 1.18, "man united": 1.18,
    "liverpool": 1.12,
    "bayern munich": 1.1, "bayern": 1.1,
    "psg": 1.08, "paris saint-germain": 1.08,
    "juventus": 1.05,
  },
};

function getFranchiseMultiplier(sport: string | null, title: string, playerName: string | null): number {
  if (!sport) return 1.0;
  const franchises = FRANCHISE_POPULARITY[sport.toLowerCase()];
  if (!franchises) return 1.0;
  
  const combined = `${title} ${playerName || ""}`.toLowerCase();
  
  for (const [team, multiplier] of Object.entries(franchises)) {
    if (combined.includes(team)) {
      return multiplier;
    }
  }
  return 1.0;
}

// CARD SET/BRAND PRESTIGE - Premium brands command premiums
interface SetPrestige {
  tier: "ultra_premium" | "premium" | "mid" | "base" | "budget";
  multiplier: number;
  stabilityBonus: number;  // Premium sets are more stable
}

const SET_PRESTIGE: Record<string, SetPrestige> = {
  // Ultra Premium (1.3x+)
  "national treasures": { tier: "ultra_premium", multiplier: 1.35, stabilityBonus: 0.15 },
  "flawless": { tier: "ultra_premium", multiplier: 1.4, stabilityBonus: 0.18 },
  "immaculate": { tier: "ultra_premium", multiplier: 1.3, stabilityBonus: 0.15 },
  "one": { tier: "ultra_premium", multiplier: 1.25, stabilityBonus: 0.12 },
  "noir": { tier: "ultra_premium", multiplier: 1.25, stabilityBonus: 0.12 },
  
  // Premium (1.15-1.25x)
  "prizm": { tier: "premium", multiplier: 1.2, stabilityBonus: 0.1 },
  "select": { tier: "premium", multiplier: 1.15, stabilityBonus: 0.08 },
  "optic": { tier: "premium", multiplier: 1.18, stabilityBonus: 0.1 },
  "mosaic": { tier: "premium", multiplier: 1.12, stabilityBonus: 0.08 },
  "spectra": { tier: "premium", multiplier: 1.2, stabilityBonus: 0.1 },
  "contenders": { tier: "premium", multiplier: 1.1, stabilityBonus: 0.06 },
  "topps chrome": { tier: "premium", multiplier: 1.2, stabilityBonus: 0.12 },
  "bowman chrome": { tier: "premium", multiplier: 1.25, stabilityBonus: 0.12 },
  "upper deck": { tier: "premium", multiplier: 1.1, stabilityBonus: 0.08 },
  
  // Mid Tier (1.0-1.1x)
  "donruss": { tier: "mid", multiplier: 1.05, stabilityBonus: 0.05 },
  "chronicles": { tier: "mid", multiplier: 1.05, stabilityBonus: 0.04 },
  "absolute": { tier: "mid", multiplier: 1.08, stabilityBonus: 0.05 },
  "phoenix": { tier: "mid", multiplier: 1.05, stabilityBonus: 0.04 },
  "topps": { tier: "mid", multiplier: 1.05, stabilityBonus: 0.06 },
  "bowman": { tier: "mid", multiplier: 1.08, stabilityBonus: 0.06 },
  
  // Base (1.0x)
  "score": { tier: "base", multiplier: 1.0, stabilityBonus: 0.02 },
  "prestige": { tier: "base", multiplier: 1.0, stabilityBonus: 0.02 },
  
  // Budget/Mass Market (0.9-0.95x)
  "pro set": { tier: "budget", multiplier: 0.85, stabilityBonus: 0 },
  "hoops": { tier: "base", multiplier: 0.95, stabilityBonus: 0.02 },
};

function getSetPrestige(title: string, setName: string | null): SetPrestige {
  const combined = `${title} ${setName || ""}`.toLowerCase();
  
  for (const [setKey, prestige] of Object.entries(SET_PRESTIGE)) {
    if (combined.includes(setKey)) {
      return prestige;
    }
  }
  return { tier: "base", multiplier: 1.0, stabilityBonus: 0 };
}

// PRICE TARGETS - Calculate buy/sell thresholds from historical data
interface PriceTargets {
  strongBuyBelow: number | null;
  buyBelow: number | null;
  fairValue: number | null;
  sellAbove: number | null;
  strongSellAbove: number | null;
}

function calculatePriceTargets(card: Card): PriceTargets {
  // Need price history to calculate targets
  if (!card.avgSalePrice90 && !card.avgSalePrice30 && !card.estimatedValue) {
    return { strongBuyBelow: null, buyBelow: null, fairValue: null, sellAbove: null, strongSellAbove: null };
  }
  
  // Use available price data to establish fair value
  const fairValue = card.avgSalePrice90 || card.avgSalePrice30 || card.estimatedValue || 0;
  if (fairValue === 0) {
    return { strongBuyBelow: null, buyBelow: null, fairValue: null, sellAbove: null, strongSellAbove: null };
  }
  
  // Use volatility to set target ranges
  const volatility = card.priceStdDevPct || 15;  // Default 15% if unknown
  const volMultiplier = volatility / 100;
  
  return {
    strongBuyBelow: Math.round(fairValue * (1 - volMultiplier * 1.5) * 100) / 100,
    buyBelow: Math.round(fairValue * (1 - volMultiplier * 0.75) * 100) / 100,
    fairValue: Math.round(fairValue * 100) / 100,
    sellAbove: Math.round(fairValue * (1 + volMultiplier * 0.75) * 100) / 100,
    strongSellAbove: Math.round(fairValue * (1 + volMultiplier * 1.5) * 100) / 100,
  };
}

// CONFIDENCE BREAKDOWN - Show what factors drive uncertainty
interface ConfidenceBreakdown {
  salesDataConfidence: number;    // Based on sales volume
  priceStabilityConfidence: number;  // Based on volatility
  playerStatusConfidence: number;    // Based on career stage clarity
  overallConfidence: number;
  factors: string[];              // Human-readable factor descriptions
}

function calculateConfidenceBreakdown(
  card: Card,
  marketStability: number,
  accolades: DetectedAccolades
): ConfidenceBreakdown {
  const factors: string[] = [];
  
  // Sales data confidence (0-100)
  let salesDataConfidence = 50;
  if (card.salesLast30Days !== null) {
    if (card.salesLast30Days >= 20) {
      salesDataConfidence = 90;
      factors.push("Strong sales volume provides reliable data");
    } else if (card.salesLast30Days >= 10) {
      salesDataConfidence = 75;
      factors.push("Moderate sales volume supports analysis");
    } else if (card.salesLast30Days >= 3) {
      salesDataConfidence = 55;
      factors.push("Limited recent sales data");
    } else {
      salesDataConfidence = 30;
      factors.push("Very few recent sales - pricing uncertain");
    }
  } else {
    factors.push("No sales data available");
    salesDataConfidence = 25;
  }
  
  // Price stability confidence (0-100)
  let priceStabilityConfidence = 60;
  if (card.priceStdDevPct !== null) {
    if (card.priceStdDevPct <= 10) {
      priceStabilityConfidence = 90;
      factors.push("Very stable pricing history");
    } else if (card.priceStdDevPct <= 25) {
      priceStabilityConfidence = 70;
      factors.push("Reasonably stable prices");
    } else if (card.priceStdDevPct <= 50) {
      priceStabilityConfidence = 45;
      factors.push("Moderate price swings observed");
    } else {
      priceStabilityConfidence = 25;
      factors.push("High price volatility reduces certainty");
    }
  }
  
  // Player status confidence (0-100)
  let playerStatusConfidence = 50;
  const legacyTier = (card.legacyTier as LegacyTier) || "STAR";
  
  if (legacyTier === "HOF" || legacyTier === "LEGEND_DECEASED") {
    playerStatusConfidence = 95;
    factors.push("Established legacy provides clear valuation");
  } else if (legacyTier === "RETIRED") {
    playerStatusConfidence = 80;
    factors.push("Retired player - career arc complete");
  } else if (legacyTier === "SUPERSTAR") {
    playerStatusConfidence = 70;
    factors.push("Elite active player with proven track record");
  } else if (legacyTier === "STAR") {
    playerStatusConfidence = 55;
    factors.push("Established player but future uncertain");
  } else if (legacyTier === "PROSPECT" || legacyTier === "RISING_STAR") {
    playerStatusConfidence = 35;
    factors.push("Early career - trajectory still developing");
  } else if (legacyTier === "AGING_VET") {
    playerStatusConfidence = 45;
    factors.push("Aging player - decline risk present");
  }
  
  // Accolades boost confidence
  if (accolades.accoladeCount >= 2) {
    playerStatusConfidence = Math.min(100, playerStatusConfidence + 15);
    factors.push("Multiple accolades provide clearer picture");
  }
  
  const overallConfidence = Math.round(
    (salesDataConfidence * 0.35 + priceStabilityConfidence * 0.3 + playerStatusConfidence * 0.35)
  );
  
  return {
    salesDataConfidence,
    priceStabilityConfidence,
    playerStatusConfidence,
    overallConfidence,
    factors,
  };
}

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
  BUST: 0.3,            // Career stalled - low legacy value
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
  BUST: 1.1,            // Career stalled - highest risk
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
// Map user-facing career stages to internal LegacyTier values
function normalizeLegacyTier(tier: string | null): LegacyTier {
  if (!tier) return "STAR";
  
  // Handle exact matches first
  if (tier in LIFECYCLE_PROFILES) {
    return tier as LegacyTier;
  }
  
  // Map old/alternate values to internal values
  const tierMap: Record<string, LegacyTier> = {
    "ROOKIE": "PROSPECT",
    "RISING": "RISING_STAR",
    "PRIME": "SUPERSTAR",
    "VETERAN": "AGING_VET",
    "LEGEND": "HOF",
  };
  
  return tierMap[tier] || "STAR";
}

function calculateLifecycleAwareUpside(
  card: Card,
  cardTypeScore: number,
  positionScore: number,
  hypeScore: number,
  marketStability: number,
  sportConfig: SportConfig | null
): number {
  const legacyTier = normalizeLegacyTier(card.legacyTier);
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
  const legacyTier = normalizeLegacyTier(card.legacyTier);
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
  const legacyTier = normalizeLegacyTier(card.legacyTier);
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

function determineAction(
  upsideScore: number, 
  riskScore: number,
  card?: Card
): OutlookAction {
  // LEGACY_HOLD detection - MUST happen first (archetype is authoritative)
  if (card) {
    const cardYear = card.year ? parseInt(String(card.year)) : 0;
    const currentYear = new Date().getFullYear();
    const cardAge = cardYear > 0 ? currentYear - cardYear : 0;
    const isVintage = cardAge >= 25;
    const legacyTier = card.legacyTier as LegacyTier | null;
    const isRetiredOrLegend = legacyTier === "HOF" || legacyTier === "LEGEND_DECEASED" || legacyTier === "RETIRED";
    const marketValue = card.estimatedValue || card.avgSalePrice30 || 0;
    
    // LEGACY_HOLD: Vintage (25+ years) + retired/HOF + has meaningful value ($50+)
    // Once classified as LEGACY, this is AUTHORITATIVE - never falls back to WATCH
    if (isVintage && isRetiredOrLegend && marketValue >= 50) {
      return "LEGACY_HOLD";
    }
    
    // LONG_HOLD: Retired/HOF but not vintage - stable modern hold
    if (isRetiredOrLegend && !isVintage && riskScore <= 40) {
      return "LONG_HOLD";
    }
    
    // LITTLE_VALUE: Very low value cards
    if (marketValue < 10 && upsideScore < 30) {
      return "LITTLE_VALUE";
    }
  }
  
  // Standard action determination for non-legacy cards
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
  // MONITOR: Everything else - stable holds, uncertain situations, etc.
  return "MONITOR";
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
  try {
    const trendPct = card.avgSalePrice30 && card.avgSalePrice90 && card.avgSalePrice90 > 0
      ? ((card.avgSalePrice30 - card.avgSalePrice90) / card.avgSalePrice90 * 100).toFixed(1)
      : "unknown";
    
    const systemPrompt = `You are an assistant helping sports card collectors decide whether to invest in specific cards. You will receive structured data about a card, the player, and a set of pre-calculated scores.

Return:
1. A 1-2 sentence summary for beginners (labeled "SHORT:").
2. A 3-6 sentence detailed explanation using hobby language, no promises or guarantees (labeled "LONG:").`;

    const userPrompt = `Data:
- Player: ${card.playerName || card.title}, ${card.sport || "unknown sport"}, ${card.position || "unknown position"}, legacy tier: ${card.legacyTier || "unknown"}.
- Card: rookie=${card.isRookie || false}, numbered=${card.isNumbered || false} (/${card.serialNumber || "N/A"}), auto=${card.hasAuto || false}, graded=${card.grade || "raw"}.
- Scores: upside=${upsideScore}, risk=${riskScore}, confidence=${confidenceScore}.
- Market: recent sales=${card.salesLast30Days || "unknown"}, trend (30 vs 90 days)=${trendPct}%.

Explain the reasoning behind the scores and end with a plain-language tag like:
"Overall view: ${action} for the next ${timeHorizonMonths} months."`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${systemPrompt}\n\n${userPrompt}`,
    });

    const content = response.text || "";
    
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
    return `Strong upside potential (${upsideScore}/100) with manageable downside. Worth adding to your collection.`;
  } else if (action === "SELL") {
    return `Elevated downside risk (${riskScore}/100) relative to upside. Consider selling or trading.`;
  }
  return `Balanced outlook with moderate upside (${upsideScore}/100). Timing your entry matters here.`;
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
  const legacyTier = (card.legacyTier as LegacyTier) || "STAR";
  
  // Build context for narrative
  const lifecycleContext = getLifecycleNarrative(legacyTier, card);
  const cardContext = getCardNarrative(card);
  const stabilityContext = getStabilityNarrative(marketStability, legacyTier);
  
  try {
    const trendPct = card.avgSalePrice30 && card.avgSalePrice90 && card.avgSalePrice90 > 0
      ? ((card.avgSalePrice30 - card.avgSalePrice90) / card.avgSalePrice90 * 100).toFixed(1)
      : "unknown";
    
    // Detect if card is likely mass-produced (junk wax era or high-volume set)
    const cardYear = card.year ? parseInt(String(card.year)) : 0;
    const currentYear = new Date().getFullYear();
    const cardAge = cardYear > 0 ? currentYear - cardYear : 0;
    const isVintage = cardAge >= 25;
    const isLegacyHold = action === "LEGACY_HOLD";
    const isMassProduced = (cardYear >= 1987 && cardYear <= 1993) || 
      (card.salesLast30Days && card.salesLast30Days > 50) ||
      (card.avgSalePrice30 && card.avgSalePrice30 < 20 && !card.isNumbered && !card.hasAuto);
    
    const prompt = `You are writing like a sharp collector in a Discord chat who explains why cards are priced the way they are. Be narrative and thesis-driven, not metric-first. Sound like Hidden Gems explanations, not AI output.

VOICE & TONE RULES:
- Write like you're explaining to a friend at a card show, not generating a report
- Lead with the NARRATIVE (why the market thinks what it thinks), not numbers
- Use collector-native language: "belief inertia", "narrative gap", "priced-in already", "market hasn't caught up", "secular demand"
- NEVER say "low demand" - say "high supply" or "oversaturation"
- NEVER use phrases like "caution is warranted", "careful consideration", "worth noting" - too formal
- DO use phrases like: "The market still sees him as...", "Prices reflect...", "The discount exists because...", "What the market is missing..."
- Be specific about the market psychology, not just the numbers
${isLegacyHold ? `
LEGACY HOLD SPECIAL RULES (this is a LEGACY_HOLD card):
- This is a CLASSIC VINTAGE COLLECTIBLE, not a speculative asset
- Suppress ALL speculative or cautionary language
- Downside Risk should be framed as "Low" - these are stable long-term assets
- Market Friction should be framed as "thin market" NOT as danger/risk/caution
- Upside should be "Limited" or "Long-term / Steady" NOT "Medium" or "High"
- Explain that value is driven by condition, eye appeal, and cultural relevance
- Frame as "personal collection hold" or "legacy asset" rather than investment
- Example language: "This is a classic vintage card with proven long-term demand. Prices vary due to eye appeal and infrequent sales, making it better suited as a personal collection hold than a short-term trade."
` : ""}

CRITICAL CONTEXT:
- Upside score reflects GROWTH POTENTIAL, not player quality. Hall of Famers and retired legends have LOW upside because their value is already established. Rookies and rising stars have HIGH upside because they have room to grow.
- Downside Risk reflects potential for price decline (volatility + negative trends).${isLegacyHold ? " For LEGACY_HOLD cards, downside is inherently LOW." : ""}
- Market Friction reflects ease of selling (liquidity + sales volume).${isLegacyHold ? " For vintage cards, high friction is normal (thin market) - not a warning sign." : ""}
- Confidence reflects how certain we are about the prediction.
${isMassProduced ? "- NOTE: This appears to be a mass-produced card (high print run era or common set). Be conservative with upside language - use 'Limited' or 'Low' rather than 'Medium' for upside unless there's a specific catalyst." : ""}
${isVintage && !isMassProduced ? "- NOTE: This is a vintage card (25+ years old). Value driven by condition, eye appeal, and cultural significance rather than player performance catalysts." : ""}

Player & Card:
- Name: ${card.playerName || card.title}
- Sport: ${card.sport || "unknown"}, Position: ${card.position || "unknown"}
- Career Stage: ${legacyTier} (${lifecycleContext})
- Card: ${cardContext}
- Year: ${card.year || "unknown"}, Grade: ${card.grade || "raw"}

Investment Scores:
- Upside: ${upsideScore}/100 (${isMassProduced && upsideScore < 60 ? "Limited - high supply era" : upsideScore < 25 ? "Low - value already established" : upsideScore < 50 ? "Moderate" : "High - room for growth"})
- Downside Risk: ${riskScore < 30 ? "Low" : riskScore < 50 ? "Moderate" : "Elevated"}
- Market Friction: ${(card.salesLast30Days || 0) < 5 ? "High - thin market" : (card.salesLast30Days || 0) < 20 ? "Moderate" : "Low - liquid market"}
- Confidence: ${confidenceScore}/100

Market Context:
- Price trend (30d vs 90d): ${trendPct}%
- Market stability: ${marketStability > 0.7 ? "Very stable, established market" : marketStability > 0.5 ? "Moderately stable" : "More volatile, newer to market"}
${accolades.accoladeCount > 0 ? `- Known accolades: ${accolades.hasMVP ? "MVP" : ""} ${accolades.hasChampionship ? "Champion" : ""} ${accolades.hasAllStar ? "All-Star" : ""}`.trim() : ""}

Write like a sharp collector explaining the thesis:
1. SHORT: (1 sentence) Lead with what the market believes and whether it's right. Examples:
   - "Prices haven't caught up to his consistent MVP-level play - still trading at Super Bowl loss discount."
   - "Already priced as a legend. Upside is capped, but so is downside."
   - "The market sees 'game manager' when results say otherwise. That's the opportunity."
   
2. LONG: (3-4 sentences) Explain the WHY behind the pricing. What narrative is the market buying? Is it correct? What would change the price? End with actionable context, not "Overall view: ${action}".

Format response as:
SHORT: [your thesis-driven summary]
LONG: [your narrative explanation]`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const content = response.text || "";
    
    const shortMatch = content.match(/SHORT:\s*([\s\S]+?)(?=LONG:|$)/);
    const longMatch = content.match(/LONG:\s*([\s\S]+)/);
    
    const aiExplanation = {
      short: shortMatch?.[1]?.trim() || "",
      long: longMatch?.[1]?.trim() || "",
    };
    
    // LEGACY ARCHETYPE VALIDATION
    // If AI-generated explanation violates LEGACY rules, discard and use fallback
    if (action === "LEGACY_HOLD" && !validateLegacyExplanation(aiExplanation, action)) {
      console.log("LEGACY_HOLD: AI explanation failed validation, using fallback templates");
      return {
        short: generateEditorialFallbackShort(action, upsideScore, riskScore, legacyTier, card),
        long: generateEditorialFallbackLong(card, action, upsideScore, riskScore, confidenceScore, legacyTier, lifecycleContext, cardContext, stabilityContext),
      };
    }
    
    return {
      short: aiExplanation.short || generateEditorialFallbackShort(action, upsideScore, riskScore, legacyTier, card),
      long: aiExplanation.long || generateEditorialFallbackLong(card, action, upsideScore, riskScore, confidenceScore, legacyTier, lifecycleContext, cardContext, stabilityContext),
    };
  } catch (error) {
    console.error("Error generating editorial explanation:", error);
    return {
      short: generateEditorialFallbackShort(action, upsideScore, riskScore, legacyTier, card),
      long: generateEditorialFallbackLong(card, action, upsideScore, riskScore, confidenceScore, legacyTier, lifecycleContext, cardContext, stabilityContext),
    };
  }
}

// LEGACY ARCHETYPE VALIDATOR
// Enforces forbidden language for LEGACY_HOLD cards - regenerates if violations found
const LEGACY_FORBIDDEN_PATTERNS = [
  /\blow\s+demand\b/i,
  /\bvolatility\b(?!.*normal|.*expected|.*typical)/i,  // volatility unless framed as normal
  /\bcaution\b/i,
  /\buncertain(?:ty)?\b/i,
  /\brisk(?:y|ier)?\b(?!.*low|.*minimal|.*limited)/i,  // risk unless framed as low
  /\bMONITOR\b/,  // Should never mention MONITOR for LEGACY cards
  /\bspeculat(?:ive|ion)\b/i,
  /\bdangerous\b/i,
  /\bavoid\b/i,
  /\bsell(?:ing)?\b(?!.*not|.*don't|.*shouldn't)/i,  // sell unless framed negatively
];

function validateLegacyExplanation(explanation: { short: string; long: string }, action: OutlookAction): boolean {
  if (action !== "LEGACY_HOLD") return true;
  
  const fullText = `${explanation.short} ${explanation.long}`;
  
  for (const pattern of LEGACY_FORBIDDEN_PATTERNS) {
    if (pattern.test(fullText)) {
      console.log(`LEGACY validation failed: found forbidden pattern ${pattern}`);
      return false;
    }
  }
  
  return true;
}

function getLifecycleNarrative(legacyTier: LegacyTier, card: Card): string {
  const narratives: Record<LegacyTier, string> = {
    PROSPECT: "Early career, unknown ceiling, high volatility",
    RISING_STAR: "Showing promise, building reputation, prices still have room to grow",
    STAR: "Established player, proven track record, moderate growth potential",
    SUPERSTAR: "Elite active player, premium pricing already reflects status",
    AGING_VET: "Past prime but still active, uncertain trajectory ahead",
    BUST: "Career has stalled or failed to develop, limited value and high risk of further decline",
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
  
  // LEGACY_HOLD special handling - collector-native conversational tone
  if (action === "LEGACY_HOLD") {
    return `${playerName} is a classic vintage card with steady collector interest that trades infrequently. Best suited as a long-term personal collection hold rather than a short-term move.`;
  }
  
  if (legacyTier === "HOF" || legacyTier === "LEGEND_DECEASED") {
    return `${playerName}'s legacy is secure - this is a stable hold with limited upside but very low downside. A safe collector's piece.`;
  }
  if (legacyTier === "RETIRED") {
    return `${playerName} is retired and their market has stabilized. Limited upside but also low downside - prices unlikely to move dramatically.`;
  }
  if (legacyTier === "PROSPECT" || legacyTier === "RISING_STAR") {
    return `${playerName} has significant room for growth (upside ${upsideScore}) but with the typical uncertainty of an emerging player (risk ${riskScore}).`;
  }
  if (legacyTier === "AGING_VET") {
    return `${playerName} is past their prime - limited upside (${upsideScore}) with elevated risk (${riskScore}) as retirement approaches.`;
  }
  
  // Check for high supply/mass-produced indicators
  const cardYear = card.year ? parseInt(String(card.year)) : 0;
  const isMassProduced = (cardYear >= 1987 && cardYear <= 1993) || 
    (card.salesLast30Days && card.salesLast30Days > 50) ||
    (card.avgSalePrice30 && card.avgSalePrice30 < 20 && !card.isNumbered && !card.hasAuto);
  
  if (isMassProduced) {
    return `${playerName} - high supply keeps prices steady but limits upside (${upsideScore}). Pricing spreads can be wide, so timing your entry matters.`;
  }
  
  return `${playerName} shows moderate potential with upside of ${upsideScore}. Worth monitoring - patience pays here.`;
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
  
  // LEGACY_HOLD special handling - collector-native conversational tone
  if (action === "LEGACY_HOLD") {
    parts.push(`${playerName} is a classic vintage card with steady collector interest.`);
    parts.push(`Demand is stable, but trades are infrequent, which leads to wide pricing spreads.`);
    parts.push(`The range you see reflects eye appeal and condition differences - that's normal for vintage.`);
    parts.push(`This is best suited as a long-term personal collection hold rather than a short-term flip.`);
    return parts.join(" ");
  }
  
  // Opening with career stage context
  if (legacyTier === "HOF" || legacyTier === "LEGEND_DECEASED") {
    parts.push(`${playerName} is a ${legacyTier === "HOF" ? "Hall of Famer" : "deceased legend"} whose place in history is secure.`);
    parts.push(`Their card values are fully established with years of market data supporting stable pricing.`);
    parts.push(`This means limited upside - the market already reflects their legacy - but also minimal downside for the same reason.`);
  } else if (legacyTier === "RETIRED") {
    parts.push(`${playerName} has retired, which means their on-field story is complete.`);
    parts.push(`The market has had time to settle on their value, making this a stable but low-growth hold.`);
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
  
  // Check for high supply indicators
  const cardYear = card.year ? parseInt(String(card.year)) : 0;
  const isMassProduced = (cardYear >= 1987 && cardYear <= 1993) || 
    (card.salesLast30Days && card.salesLast30Days > 50) ||
    (card.avgSalePrice30 && card.avgSalePrice30 < 20 && !card.isNumbered && !card.hasAuto);
  
  if (isMassProduced) {
    parts.push(`High supply from this era means pricing spreads can be wide - timing your entry matters.`);
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

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const content = response.text || "";
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
  // Check card category - use TCG engine for non-sports cards
  const category = (card.cardCategory as CardCategory) || "sports";
  
  if (category === "tcg" || category === "non_sport") {
    // Use TCG/Non-Sport scoring engine
    const tcgResult = generateTCGOutlook(card, timeHorizonMonths);
    const explanation = await generateTCGExplanation(card, tcgResult);
    return { ...tcgResult, explanation };
  }
  
  // Sports card scoring continues below...
  // Calculate base scores
  const cardTypeScore = calculateCardTypeScore(card);
  const positionScore = calculatePositionScore(card.sport, card.position);
  const legacyScore = calculateLegacyScore(card.legacyTier);
  const liquidityScore = calculateLiquidityScore(card.salesLast30Days);
  const volatilityScore = calculateVolatilityScore(card.priceStdDevPct);
  const hypeScore = calculateHypeScore(card.avgSalePrice30, card.avgSalePrice90);
  
  // Get lifecycle-aware context
  const marketStability = assessMarketStability(card);
  const accolades = detectAccolades(card.title, card.playerName);
  const sportConfig = card.sport ? SPORT_CONFIGS[card.sport.toLowerCase()] || null : null;
  
  // NEW: Get enhancement factors
  const seasonalMultiplier = getSeasonalMultiplier(card.sport);
  const franchiseMultiplier = getFranchiseMultiplier(card.sport, card.title, card.playerName);
  const setPrestige = getSetPrestige(card.title, card.set);
  const priceTargets = calculatePriceTargets(card);
  const confidenceBreakdown = calculateConfidenceBreakdown(card, marketStability, accolades);
  
  // Get seasonal context
  const seasonConfig = card.sport ? SEASONAL_CONFIGS[card.sport.toLowerCase()] : null;
  const currentMonth = new Date().getMonth() + 1;
  const isPlayoffSeason = seasonConfig?.playoffMonths.includes(currentMonth) ?? false;
  const isInSeason = seasonConfig?.peakMonths.includes(currentMonth) ?? false;
  
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
  
  const action = determineAction(upsideScore, riskScore, card);
  
  // LEGACY_HOLD ENFORCEMENT: Cap risk and upside for legacy cards
  // This ensures archetype is authoritative - LEGACY cards can never show "Very High" downside
  let finalRiskScore = riskScore;
  let finalUpsideScore = upsideScore;
  
  if (action === "LEGACY_HOLD") {
    finalRiskScore = Math.min(riskScore, 30);  // Cap at LOW
    finalUpsideScore = Math.min(upsideScore, 40);  // Cap at LIMITED
  } else if (action === "LONG_HOLD") {
    finalRiskScore = Math.min(riskScore, 50);  // Cap at MEDIUM
  }
  
  const projectedOutlook = calculateProjectedOutlook(finalUpsideScore, finalRiskScore, hypeScore);
  
  const factors = {
    cardTypeScore: Math.round(cardTypeScore * 100) / 100,
    positionScore: Math.round(positionScore * 100) / 100,
    legacyScore: Math.round(legacyScore * 100) / 100,
    liquidityScore: Math.round(liquidityScore * 100) / 100,
    volatilityScore: Math.round(volatilityScore * 100) / 100,
    hypeScore: Math.round(hypeScore * 100) / 100,
    // NEW: Enhancement factors
    seasonalMultiplier: Math.round(seasonalMultiplier * 100) / 100,
    franchiseMultiplier: Math.round(franchiseMultiplier * 100) / 100,
    setPrestigeTier: setPrestige.tier,
  };
  
  // Apply seasonal and franchise multipliers to upside (within bounds)
  // Use finalUpsideScore which respects LEGACY/LONG_HOLD caps
  const adjustedUpside = Math.round(clamp(
    finalUpsideScore * seasonalMultiplier * franchiseMultiplier * setPrestige.multiplier,
    0,
    action === "LEGACY_HOLD" ? 40 : 100  // Maintain cap through multipliers
  ));
  
  // NEW: Pass additional context to explanation generator
  const explanation = await generateEditorialExplanation(
    card,
    factors,
    adjustedUpside,
    finalRiskScore,
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
    upsideScore: adjustedUpside,
    riskScore: finalRiskScore,
    confidenceScore,
    projectedOutlook,
    factors,
    explanation,
    // NEW: Enhanced data
    priceTargets,
    confidenceBreakdown,
    seasonalContext: {
      currentMultiplier: seasonalMultiplier,
      isInSeason,
      isPlayoffSeason,
    },
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
  
  // NEW: Get enhancement factors
  const seasonalMultiplier = getSeasonalMultiplier(card.sport);
  const franchiseMultiplier = getFranchiseMultiplier(card.sport, card.title, card.playerName);
  const setPrestige = getSetPrestige(card.title, card.set);
  
  // NEW: Use lifecycle-aware scoring
  const baseUpside = calculateLifecycleAwareUpside(
    card,
    cardTypeScore,
    positionScore,
    hypeScore,
    marketStability,
    sportConfig
  );
  
  // Apply multipliers
  const upsideScore = Math.round(clamp(
    baseUpside * seasonalMultiplier * franchiseMultiplier * setPrestige.multiplier,
    0,
    100
  ));
  
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
  
  const action = determineAction(upsideScore, riskScore, card);
  
  return { action, upsideScore, riskScore, confidenceScore };
}
