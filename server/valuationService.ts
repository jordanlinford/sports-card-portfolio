/**
 * Heuristic-Based Valuation Service
 * 
 * Provides modeled price estimates for sports cards based on player classification
 * rather than relying on live eBay data which can be unreliable.
 * 
 * Uses a price baseline matrix keyed on sport, position archetype, tier, and temperature.
 */

import type { PlayerStage, MarketTemperature, VerdictModifier, DataConfidence } from "@shared/schema";
import { ClassificationOutput } from "./playerClassificationEngine";

export interface ValuationResult {
  estimatedRange: {
    low: number;
    mid: number;
    high: number;
  };
  referenceComps: ReferenceComp[];
  confidence: DataConfidence;
  source: "modeled";
  methodology: string;
}

export interface ReferenceComp {
  cardType: string;
  estimatedValue: number;
  liquidity: "high" | "medium" | "low";
}

// Position archetypes that command premium pricing
type PositionArchetype = "premium" | "standard" | "specialist" | "depth";

// Base price ranges by sport (for a mid-tier, neutral temperature player)
const SPORT_BASE_RANGES: Record<string, { low: number; mid: number; high: number }> = {
  football: { low: 8, mid: 20, high: 45 },
  basketball: { low: 10, mid: 25, high: 55 },
  baseball: { low: 6, mid: 15, high: 35 },
  hockey: { low: 5, mid: 12, high: 28 },
  soccer: { low: 7, mid: 18, high: 40 },
};

// Position premium multipliers by sport
const POSITION_MULTIPLIERS: Record<string, Record<string, number>> = {
  football: {
    QB: 2.0,
    RB: 1.4,
    WR: 1.3,
    TE: 1.0,
    K: 0.3,
    DEF: 0.6,
    LB: 0.7,
    DB: 0.7,
    CB: 0.7,
    S: 0.7,
    DL: 0.6,
    OL: 0.4,
  },
  basketball: {
    PG: 1.3,
    SG: 1.2,
    SF: 1.4,
    PF: 1.1,
    C: 1.0,
    G: 1.2,
    F: 1.2,
  },
  baseball: {
    P: 0.9,
    SP: 1.0,
    RP: 0.6,
    C: 0.8,
    "1B": 0.9,
    "2B": 0.85,
    "3B": 0.95,
    SS: 1.1,
    OF: 1.0,
    DH: 0.7,
  },
  hockey: {
    C: 1.3,
    LW: 1.1,
    RW: 1.1,
    D: 0.9,
    G: 1.0,
  },
  soccer: {
    ST: 1.4,
    CAM: 1.2,
    CM: 1.0,
    CDM: 0.85,
    LW: 1.2,
    RW: 1.2,
    LB: 0.7,
    RB: 0.7,
    CB: 0.8,
    GK: 0.6,
  },
};

// Stage multipliers (career phase impact on card value)
const STAGE_MULTIPLIERS: Record<PlayerStage, number> = {
  PROSPECT: 1.2,      // Pre-rookie hype
  ROOKIE: 1.5,        // Rookie premium
  YEAR_2: 1.4,        // Sophomore breakout potential
  PRIME: 1.0,         // Peak value baseline
  VETERAN: 0.7,       // Declining demand
  AGING: 0.5,         // Late career
  RETIRED: 0.4,       // Legacy play only
  RETIRED_HOF: 0.8,   // HOF trajectory premium
};

// Temperature multipliers (market heat)
const TEMPERATURE_MULTIPLIERS: Record<MarketTemperature, number> = {
  HOT: 1.6,
  WARM: 1.2,
  NEUTRAL: 1.0,
  COOLING: 0.75,
};

// Tier multipliers for exposure recommendations
const TIER_MULTIPLIERS: Record<string, number> = {
  Premium: 2.5,
  Growth: 1.5,
  Core: 1.0,
  Speculative: 0.6,
  Common: 0.3,
};

// Reference card templates by tier
const REFERENCE_CARDS: Record<string, { template: string; liquidity: "high" | "medium" | "low" }[]> = {
  Premium: [
    { template: "Prizm Silver PSA 10", liquidity: "high" },
    { template: "Select Concourse PSA 10", liquidity: "high" },
    { template: "Optic Holo PSA 10", liquidity: "medium" },
  ],
  Growth: [
    { template: "Prizm Base PSA 10", liquidity: "high" },
    { template: "Donruss Rated Rookie PSA 10", liquidity: "high" },
    { template: "Select Base PSA 9", liquidity: "medium" },
  ],
  Core: [
    { template: "Prizm Base Raw NM", liquidity: "high" },
    { template: "Donruss Base Raw", liquidity: "medium" },
    { template: "Topps Chrome Base", liquidity: "high" },
  ],
  Speculative: [
    { template: "Bowman 1st Chrome Auto", liquidity: "low" },
    { template: "Prizm Draft Picks Auto", liquidity: "low" },
    { template: "Contenders RPS Auto", liquidity: "medium" },
  ],
  Common: [
    { template: "Base Card Raw", liquidity: "high" },
    { template: "Parallel Insert", liquidity: "medium" },
  ],
};

function getPositionMultiplier(sport: string, position: string | undefined): number {
  if (!position) return 1.0;
  
  const sportPositions = POSITION_MULTIPLIERS[sport.toLowerCase()];
  if (!sportPositions) return 1.0;
  
  // Try exact match
  const normalized = position.toUpperCase().trim();
  if (sportPositions[normalized]) return sportPositions[normalized];
  
  // Try partial matches for football
  if (sport.toLowerCase() === "football") {
    if (normalized.includes("QUARTERBACK") || normalized === "QB") return sportPositions.QB || 1.0;
    if (normalized.includes("RUNNING") || normalized === "RB") return sportPositions.RB || 1.0;
    if (normalized.includes("WIDE") || normalized === "WR") return sportPositions.WR || 1.0;
    if (normalized.includes("TIGHT") || normalized === "TE") return sportPositions.TE || 1.0;
  }
  
  return 1.0;
}

function determinePrimaryTier(classification: ClassificationOutput): string {
  // Use temperature and stage to infer tier
  if (classification.baseTemperature === "HOT" && classification.stage === "PRIME") {
    return "Premium";
  }
  if (classification.baseTemperature === "HOT" && classification.stage === "ROOKIE") {
    return "Speculative";
  }
  if (classification.baseTemperature === "WARM") {
    return classification.stage === "YEAR_2" ? "Growth" : "Core";
  }
  if (classification.stage === "ROOKIE" || classification.stage === "YEAR_2" || classification.stage === "PROSPECT") {
    return "Growth";
  }
  return "Core";
}

export function calculateValuation(
  sport: string,
  classification: ClassificationOutput,
  verdictModifier?: VerdictModifier
): ValuationResult {
  // Get base range for sport
  const baseRange = SPORT_BASE_RANGES[sport.toLowerCase()] || SPORT_BASE_RANGES.football;
  
  // Calculate multipliers
  const positionMult = getPositionMultiplier(sport, classification.position);
  const stageMult = STAGE_MULTIPLIERS[classification.stage] || 1.0;
  const tempMult = TEMPERATURE_MULTIPLIERS[classification.baseTemperature] || 1.0;
  
  // Determine primary tier for this player
  const primaryTier = determinePrimaryTier(classification);
  const tierMult = TIER_MULTIPLIERS[primaryTier] || 1.0;
  
  // Apply modifiers based on verdict
  let verdictAdjust = 1.0;
  if (verdictModifier === "Momentum") verdictAdjust = 1.15;
  if (verdictModifier === "Value") verdictAdjust = 0.85;
  if (verdictModifier === "Late Cycle") verdictAdjust = 1.1;
  if (verdictModifier === "Speculative") verdictAdjust = 0.9;
  
  // Calculate final range
  const totalMult = positionMult * stageMult * tempMult * tierMult * verdictAdjust;
  
  const estimatedRange = {
    low: Math.round(baseRange.low * totalMult),
    mid: Math.round(baseRange.mid * totalMult),
    high: Math.round(baseRange.high * totalMult),
  };
  
  // Ensure minimum values
  estimatedRange.low = Math.max(estimatedRange.low, 2);
  estimatedRange.mid = Math.max(estimatedRange.mid, estimatedRange.low + 3);
  estimatedRange.high = Math.max(estimatedRange.high, estimatedRange.mid + 5);
  
  // Generate reference comps
  const compTemplates = REFERENCE_CARDS[primaryTier] || REFERENCE_CARDS.Core;
  const referenceComps: ReferenceComp[] = compTemplates.map((template, idx) => {
    // Distribute values across range
    const valueFactor = idx === 0 ? 0.8 : idx === 1 ? 0.5 : 0.3;
    const estimatedValue = Math.round(estimatedRange.low + (estimatedRange.high - estimatedRange.low) * valueFactor);
    
    return {
      cardType: template.template,
      estimatedValue,
      liquidity: template.liquidity,
    };
  });
  
  // Determine confidence based on data quality
  let confidence: DataConfidence = "MEDIUM";
  if (classification.position && classification.team) {
    confidence = "HIGH";
  } else if (!classification.position && !classification.team) {
    confidence = "LOW";
  }
  
  const methodology = `Modeled estimate based on ${sport} ${classification.position || "player"} at ${classification.stage} stage with ${classification.baseTemperature} market temperature. ${primaryTier} tier exposure.`;
  
  return {
    estimatedRange,
    referenceComps,
    confidence,
    source: "modeled",
    methodology,
  };
}
