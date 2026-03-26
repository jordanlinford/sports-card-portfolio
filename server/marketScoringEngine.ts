import type {
  MarketPhase,
  MarketSignals,
  MarketMetrics,
  PlayerStage,
  MarketTemperature,
  VolatilityLevel,
  RiskLevel,
  InvestmentHorizon,
  InvestmentVerdict,
  DataConfidence,
} from "@shared/schema";
import type { RoleTier } from "./investmentDecisionEngine";

export type MarketScoringInput = {
  metrics: MarketMetrics;
  playerName: string;
  stage: PlayerStage;
  position?: string;
  sport?: string;
  team?: string;
  roleTier: RoleTier;
  roleStabilityScore: number;
  newsHype?: "HIGH" | "MEDIUM" | "LOW";
  momentum?: "UP" | "DOWN" | "STABLE";
  newsCount?: number;
};

export type MarketScoringResult = {
  signals: MarketSignals;
  phase: MarketPhase;
  verdict: InvestmentVerdict;
  verdictReason: string;
  confidence: DataConfidence;
  temperature: MarketTemperature;
  volatility: VolatilityLevel;
  risk: RiskLevel;
  horizon: InvestmentHorizon;
};

const SIGNAL_WEIGHTS = {
  demand: 0.22,
  momentum: 0.20,
  liquidity: 0.15,
  supplyPressure: 0.12,
  volatility: 0.10,
  hype: 0.11,
  confidence: 0.10,
};

function scoreDemand(metrics: MarketMetrics, newsHype?: string): number {
  let score = 50;

  if (metrics.soldCount30d !== undefined) {
    if (metrics.soldCount30d >= 200) score = 90;
    else if (metrics.soldCount30d >= 100) score = 78;
    else if (metrics.soldCount30d >= 50) score = 65;
    else if (metrics.soldCount30d >= 20) score = 52;
    else if (metrics.soldCount30d >= 5) score = 38;
    else score = 20;
  } else if (newsHype === "HIGH") {
    score = 70;
  } else if (newsHype === "MEDIUM") {
    score = 55;
  } else if (newsHype === "LOW") {
    score = 35;
  }

  if (metrics.weeklyAdds && metrics.weeklyAdds >= 5) {
    score = Math.min(95, score + 8);
  }
  if (metrics.weeklyScans && metrics.weeklyScans >= 10) {
    score = Math.min(95, score + 5);
  }

  return Math.max(5, Math.min(95, score));
}

function scoreMomentum(metrics: MarketMetrics, momentum?: string): number {
  let score = 50;

  if (metrics.priceTrend !== undefined) {
    score = 50 + (metrics.priceTrend * 200);
    score = Math.max(10, Math.min(90, score));
  }

  if (metrics.internalPriceChange !== undefined) {
    const internalSignal = 50 + (metrics.internalPriceChange * 150);
    const clampedInternal = Math.max(10, Math.min(90, internalSignal));
    score = metrics.priceTrend !== undefined
      ? score * 0.6 + clampedInternal * 0.4
      : clampedInternal;
  }

  if (metrics.priceTrend === undefined && metrics.internalPriceChange === undefined) {
    if (momentum === "UP") score = 68;
    else if (momentum === "DOWN") score = 32;
    else score = 50;
  }

  const volumeAdj = metrics.volumeTrend === "up" ? 8 : metrics.volumeTrend === "down" ? -8 : 0;
  score += volumeAdj;

  return Math.max(5, Math.min(95, score));
}

function scoreLiquidity(metrics: MarketMetrics): number {
  let score = 50;

  if (metrics.soldCount30d !== undefined && metrics.activeListingCount !== undefined) {
    const totalActivity = metrics.soldCount30d + metrics.activeListingCount;
    if (totalActivity >= 300) score = 90;
    else if (totalActivity >= 150) score = 75;
    else if (totalActivity >= 50) score = 60;
    else if (totalActivity >= 15) score = 42;
    else score = 25;
  } else if (metrics.soldCount30d !== undefined) {
    if (metrics.soldCount30d >= 100) score = 82;
    else if (metrics.soldCount30d >= 40) score = 65;
    else if (metrics.soldCount30d >= 10) score = 48;
    else score = 28;
  }

  return Math.max(5, Math.min(95, score));
}

function scoreSupplyPressure(metrics: MarketMetrics): number {
  let score = 50;

  if (metrics.activeListingCount !== undefined && metrics.soldCount30d !== undefined && metrics.soldCount30d > 0) {
    const ratio = metrics.activeListingCount / metrics.soldCount30d;
    if (ratio >= 5) score = 85;
    else if (ratio >= 3) score = 72;
    else if (ratio >= 1.5) score = 58;
    else if (ratio >= 0.5) score = 40;
    else score = 25;
  }

  return Math.max(5, Math.min(95, score));
}

function scoreVolatility(metrics: MarketMetrics): number {
  let score = 50;

  if (metrics.volatilityEstimate !== undefined) {
    if (metrics.volatilityEstimate >= 0.8) score = 85;
    else if (metrics.volatilityEstimate >= 0.5) score = 70;
    else if (metrics.volatilityEstimate >= 0.3) score = 55;
    else if (metrics.volatilityEstimate >= 0.1) score = 40;
    else score = 25;
  } else if (metrics.priceRangeLow !== undefined && metrics.priceRangeHigh !== undefined && metrics.avgSoldPrice) {
    const spread = (metrics.priceRangeHigh - metrics.priceRangeLow) / metrics.avgSoldPrice;
    if (spread >= 10) score = 85;
    else if (spread >= 5) score = 70;
    else if (spread >= 2) score = 55;
    else score = 35;
  }

  return Math.max(5, Math.min(95, score));
}

function scoreHype(newsHype?: string, newsCount?: number, metrics?: MarketMetrics): number {
  let score = 40;

  if (newsHype === "HIGH") score = 82;
  else if (newsHype === "MEDIUM") score = 55;
  else if (newsHype === "LOW") score = 30;

  if (newsCount !== undefined) {
    if (newsCount >= 8) score = Math.max(score, 80);
    else if (newsCount >= 5) score = Math.max(score, 65);
  }

  if (metrics?.weeklyScans && metrics.weeklyScans >= 15) {
    score = Math.min(95, score + 10);
  }

  return Math.max(5, Math.min(95, score));
}

function scoreConfidence(metrics: MarketMetrics): number {
  let score = 30;

  if (metrics.source === "blended") score = 75;
  else if (metrics.source === "gemini_search") score = 60;
  else if (metrics.source === "internal") score = 50;
  else score = 25;

  if (metrics.soldCount30d !== undefined && metrics.soldCount30d >= 30) {
    score = Math.min(90, score + 15);
  }
  if (metrics.internalObservationCount !== undefined && metrics.internalObservationCount >= 5) {
    score = Math.min(90, score + 10);
  }

  return Math.max(5, Math.min(95, score));
}

export function computeMarketSignals(input: MarketScoringInput): MarketSignals {
  const { metrics, newsHype, momentum, newsCount } = input;

  const demandScore = scoreDemand(metrics, newsHype);
  const momentumScore = scoreMomentum(metrics, momentum);
  const liquidityScore = scoreLiquidity(metrics);
  const supplyPressureScore = scoreSupplyPressure(metrics);
  const volatilityScore = scoreVolatility(metrics);
  const hypeScore = scoreHype(newsHype, newsCount, metrics);
  const confidenceScore = scoreConfidence(metrics);

  const composite =
    demandScore * SIGNAL_WEIGHTS.demand +
    momentumScore * SIGNAL_WEIGHTS.momentum +
    liquidityScore * SIGNAL_WEIGHTS.liquidity +
    (100 - supplyPressureScore) * SIGNAL_WEIGHTS.supplyPressure +
    (100 - volatilityScore) * SIGNAL_WEIGHTS.volatility +
    hypeScore * SIGNAL_WEIGHTS.hype +
    confidenceScore * SIGNAL_WEIGHTS.confidence;

  return {
    demandScore: Math.round(demandScore),
    momentumScore: Math.round(momentumScore),
    liquidityScore: Math.round(liquidityScore),
    supplyPressureScore: Math.round(supplyPressureScore),
    volatilityScore: Math.round(volatilityScore),
    hypeScore: Math.round(hypeScore),
    confidenceScore: Math.round(confidenceScore),
    composite: Math.round(composite),
  };
}

export function classifyMarketPhase(signals: MarketSignals): MarketPhase {
  const { demandScore, momentumScore, liquidityScore, supplyPressureScore, hypeScore, composite } = signals;

  if (composite >= 72 && momentumScore >= 70 && hypeScore >= 70) {
    return demandScore >= 75 ? "EXPANSION" : "EXHAUSTION";
  }

  if (composite >= 65 && momentumScore >= 65) {
    return "BREAKOUT";
  }

  if (composite <= 35 || (momentumScore <= 30 && demandScore <= 35)) {
    return "DECLINE";
  }

  if (momentumScore >= 50 && liquidityScore >= 45 && supplyPressureScore <= 60) {
    return "ACCUMULATION";
  }

  if (hypeScore >= 75 && momentumScore <= 45) {
    return "EXHAUSTION";
  }

  if (demandScore >= 55 && momentumScore >= 45) {
    return "ACCUMULATION";
  }

  return "UNKNOWN";
}

function applyCareerModifier(baseScore: number, stage: PlayerStage, position?: string, sport?: string): number {
  let modifier = 0;

  if (stage === "ROOKIE" || stage === "YEAR_2") modifier = -8;
  else if (stage === "YEAR_3" || stage === "YEAR_4") modifier = -3;
  else if (stage === "PRIME") modifier = 5;
  else if (stage === "VETERAN") modifier = -5;
  else if (stage === "AGING") modifier = -12;
  else if (stage === "BUST") modifier = -20;
  else if (stage === "RETIRED") modifier = -15;
  else if (stage === "RETIRED_HOF") modifier = 0;

  const pos = position?.toUpperCase();
  if (sport?.toUpperCase() === "NFL" && pos === "RB") {
    if (stage === "PRIME" || stage === "VETERAN" || stage === "AGING") {
      modifier -= 10;
    }
  }
  if (sport?.toUpperCase() === "MLB" && (pos === "SP" || pos === "P" || pos === "PITCHER")) {
    if (stage === "VETERAN" || stage === "AGING") {
      modifier -= 8;
    }
  }

  return Math.max(5, Math.min(95, baseScore + modifier));
}

export function generateMarketVerdict(input: MarketScoringInput): MarketScoringResult {
  const signals = computeMarketSignals(input);
  const phase = classifyMarketPhase(signals);
  const { stage, roleTier, roleStabilityScore, position, sport } = input;

  const adjustedComposite = applyCareerModifier(signals.composite, stage, position, sport);

  let verdict: InvestmentVerdict;
  let verdictReason: string;

  if (stage === "BUST" && roleStabilityScore <= 15) {
    verdict = "AVOID_STRUCTURAL";
    verdictReason = "Career stalled with no realistic path back";
  } else if (stage === "RETIRED" && adjustedComposite < 50) {
    verdict = "HOLD_CORE";
    verdictReason = "Retired player - stable legacy hold";
  } else if (stage === "RETIRED_HOF") {
    verdict = adjustedComposite >= 55 ? "ACCUMULATE" : "HOLD_CORE";
    verdictReason = stage === "RETIRED_HOF" ? "Hall of Fame legacy value" : "Retired - stable hold";
  } else if (phase === "EXHAUSTION" && signals.hypeScore >= 70 && signals.momentumScore <= 50) {
    if (roleStabilityScore >= 75 && stage === "PRIME") {
      verdict = "HOLD_CORE";
      verdictReason = "Franchise star at peak visibility - hold, don't chase";
    } else {
      verdict = "TRADE_THE_HYPE";
      verdictReason = `Market exhaustion: hype (${signals.hypeScore}) exceeds momentum (${signals.momentumScore})`;
    }
  } else if (phase === "DECLINE") {
    if (roleStabilityScore <= 30) {
      verdict = "AVOID_STRUCTURAL";
      verdictReason = `Declining market + low role stability (${roleStabilityScore})`;
    } else if (adjustedComposite <= 30) {
      verdict = "AVOID_NEW_MONEY";
      verdictReason = `Market in decline phase - composite score ${adjustedComposite}`;
    } else {
      verdict = "HOLD_CORE";
      verdictReason = "Market softening but fundamentals intact";
    }
  } else if (phase === "EXPANSION" && adjustedComposite >= 72) {
    if (signals.hypeScore > signals.demandScore + 15) {
      verdict = "TRADE_THE_HYPE";
      verdictReason = `Expansion driven by hype (${signals.hypeScore}) over demand (${signals.demandScore})`;
    } else {
      verdict = "HOLD_CORE";
      verdictReason = "Strong expansion phase - hold and ride the wave";
    }
  } else if (phase === "BREAKOUT") {
    if (roleStabilityScore >= 55 && adjustedComposite >= 60) {
      verdict = "ACCUMULATE";
      verdictReason = `Breakout phase with solid role stability - momentum (${signals.momentumScore}), demand (${signals.demandScore})`;
    } else if (stage === "ROOKIE" || stage === "YEAR_2") {
      verdict = "SPECULATIVE_FLYER";
      verdictReason = "Early-career breakout - high upside but unproven";
    } else {
      verdict = "ACCUMULATE";
      verdictReason = `Breakout with positive signals - composite ${adjustedComposite}`;
    }
  } else if (phase === "ACCUMULATION") {
    if (adjustedComposite >= 60 && roleStabilityScore >= 55) {
      verdict = "ACCUMULATE";
      verdictReason = `Accumulation phase - fair prices with upside. Demand ${signals.demandScore}, momentum ${signals.momentumScore}`;
    } else if (adjustedComposite >= 50 && stage !== "BUST") {
      verdict = "HOLD_CORE";
      verdictReason = "Stable accumulation zone - hold position";
    } else if (stage === "ROOKIE" || stage === "YEAR_2" || stage === "YEAR_3") {
      verdict = "SPECULATIVE_FLYER";
      verdictReason = "Early-career in accumulation zone - speculative upside";
    } else {
      verdict = "HOLD_CORE";
      verdictReason = "Accumulation phase with moderate signals";
    }
  } else {
    if (adjustedComposite >= 65 && roleStabilityScore >= 60) {
      verdict = "ACCUMULATE";
      verdictReason = `Strong composite (${adjustedComposite}) with role stability`;
    } else if (adjustedComposite >= 55) {
      verdict = "HOLD_CORE";
      verdictReason = "Moderate market signals - hold position";
    } else if (adjustedComposite >= 40) {
      if (stage === "ROOKIE" || stage === "YEAR_2" || stage === "YEAR_3") {
        verdict = "SPECULATIVE_FLYER";
        verdictReason = "Early-career with mixed signals - speculative";
      } else {
        verdict = "HOLD_CORE";
        verdictReason = "Mixed signals - maintain position";
      }
    } else {
      if (roleStabilityScore <= 25) {
        verdict = "AVOID_NEW_MONEY";
        verdictReason = `Weak market signals (${adjustedComposite}) with uncertain role`;
      } else {
        verdict = "HOLD_CORE";
        verdictReason = "Below-average market signals - hold but monitor";
      }
    }
  }

  if (roleStabilityScore <= 45 && verdict === "ACCUMULATE") {
    if (stage === "ROOKIE" || stage === "YEAR_2" || stage === "YEAR_3") {
      verdict = "SPECULATIVE_FLYER";
      verdictReason += " (downgraded: early-career role uncertainty)";
    } else if (roleStabilityScore <= 25) {
      verdict = "HOLD_ROLE_RISK";
      verdictReason += " (downgraded: low role stability)";
    }
  }

  if (roleStabilityScore <= 15 && (stage === "VETERAN" || stage === "AGING") && verdict !== "AVOID_STRUCTURAL") {
    verdict = "AVOID_STRUCTURAL";
    verdictReason = "Fading veteran with no path to meaningful role";
  }

  const temperature = deriveTemperature(signals, phase);
  const volatility = deriveVolatility(signals);
  const risk = deriveRisk(signals, stage, roleStabilityScore);
  const horizon = deriveHorizon(stage, phase);
  const confidence = deriveConfidence(signals);

  console.log(`[MarketScoring] ${input.playerName}: phase=${phase}, composite=${adjustedComposite}, verdict=${verdict}, demand=${signals.demandScore}, momentum=${signals.momentumScore}, hype=${signals.hypeScore}, liquidity=${signals.liquidityScore}`);

  return {
    signals,
    phase,
    verdict,
    verdictReason,
    confidence,
    temperature,
    volatility,
    risk,
    horizon,
  };
}

function deriveTemperature(signals: MarketSignals, phase: MarketPhase): MarketTemperature {
  if (phase === "EXPANSION" || (signals.hypeScore >= 75 && signals.momentumScore >= 65)) return "HOT";
  if (phase === "BREAKOUT" || signals.composite >= 62) return "WARM";
  if (phase === "DECLINE" || signals.composite <= 35) return "COOLING";
  return "NEUTRAL";
}

function deriveVolatility(signals: MarketSignals): VolatilityLevel {
  if (signals.volatilityScore >= 65) return "HIGH";
  if (signals.volatilityScore >= 40) return "MEDIUM";
  return "LOW";
}

function deriveRisk(signals: MarketSignals, stage: PlayerStage, roleStability: number): RiskLevel {
  if (stage === "BUST" || roleStability <= 15) return "HIGH";
  if (signals.volatilityScore >= 70 || signals.supplyPressureScore >= 75) return "HIGH";
  if (signals.confidenceScore <= 30) return "HIGH";
  if (stage === "ROOKIE" || stage === "YEAR_2") return "MEDIUM";
  if (signals.composite >= 60 && roleStability >= 55) return "LOW";
  return "MEDIUM";
}

function deriveHorizon(stage: PlayerStage, phase: MarketPhase): InvestmentHorizon {
  if (stage === "ROOKIE" || stage === "YEAR_2" || phase === "BREAKOUT") return "SHORT";
  if (stage === "VETERAN" || stage === "AGING" || stage === "RETIRED" || stage === "RETIRED_HOF") return "LONG";
  return "MID";
}

function deriveConfidence(signals: MarketSignals): DataConfidence {
  if (signals.confidenceScore >= 65 && signals.liquidityScore >= 55) return "HIGH";
  if (signals.confidenceScore >= 40) return "MEDIUM";
  return "LOW";
}
