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
  SignalContributions,
  DerivedMetrics,
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
  demand: 0.25,
  momentum: 0.20,
  liquidity: 0.15,
  supply: 0.15,
  volatility: 0.10,
  antiHype: 0.15,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function computeDerivedMetrics(metrics: MarketMetrics): DerivedMetrics {
  const sales30d = metrics.soldCount30d ?? 0;
  const sales7d = metrics.soldCount7d ?? Math.round(sales30d * 7 / 30);
  const salesPrev30d = metrics.soldCountPrev30d ?? sales30d;
  const activeListings = metrics.activeListingCount ?? 0;
  const price30dAvg = metrics.avgSoldPrice ?? metrics.medianSoldPrice ?? 0;
  const price7dAvg = metrics.avgSoldPrice7d ?? price30dAvg;
  const priceStd = metrics.priceStdDev30d ?? 0;

  const salesVelocity = sales7d / 7;
  const volumeTrend = salesPrev30d > 0 ? sales30d / salesPrev30d : 1;
  const priceTrend = metrics.priceTrend !== undefined
    ? metrics.priceTrend
    : (price30dAvg > 0 ? (price7dAvg - price30dAvg) / price30dAvg : 0);
  const sellThrough = activeListings > 0 ? sales30d / activeListings : (sales30d > 0 ? 2 : 0);
  const cv = price30dAvg > 0 ? priceStd / price30dAvg : 0;
  const sampleFactor = Math.min(1.0, Math.log(1 + sales30d) / Math.log(50));
  const supplyRatio = sales30d > 0 ? activeListings / sales30d : (activeListings > 0 ? 5 : 1);
  const weeklyAvg = sales30d / 4;
  const volumeAcceleration = weeklyAvg > 0 ? sales7d / weeklyAvg : 1;

  return {
    salesVelocity,
    volumeTrend,
    priceTrend,
    sellThrough,
    cv,
    sampleFactor,
    supplyRatio,
    volumeAcceleration,
    signalAgreement: 0,
  };
}

function scoreDemand(derived: DerivedMetrics): number {
  const demandRaw = Math.log(1 + derived.salesVelocity);
  const maxVelocityLog = Math.log(1 + 20);
  const score = normalize(demandRaw, 0, maxVelocityLog) * 100;
  return clamp(score * derived.sampleFactor, 0, 100);
}

function scoreMomentum(derived: DerivedMetrics): number {
  const score = 50 + (derived.priceTrend * 120);
  return clamp(score * derived.sampleFactor, 0, 100);
}

function scoreLiquidity(derived: DerivedMetrics, metrics: MarketMetrics): number {
  const raw = clamp(derived.sellThrough * 100, 0, 100);
  const sales30d = metrics.soldCount30d ?? 0;
  const volumeDampener = Math.min(1, Math.log(1 + sales30d) / 3);
  let score = clamp(raw * volumeDampener, 0, 100);
  if (sales30d < 10) {
    score *= 0.6;
  }
  return clamp(score, 0, 100);
}

function scoreSupply(derived: DerivedMetrics): number {
  return clamp(100 - (derived.supplyRatio * 15), 0, 100);
}

function scoreVolatility(derived: DerivedMetrics): number {
  return clamp(100 - (derived.cv * 150), 0, 100);
}

function scoreHype(derived: DerivedMetrics): number {
  const priceSignal = derived.priceTrend;
  const volumeSignal = derived.volumeTrend - 1;
  const hypeRaw = priceSignal - volumeSignal;
  return clamp(50 + (hypeRaw * 100), 0, 100);
}

function scoreConfidence(derived: DerivedMetrics, metrics: MarketMetrics): number {
  const sales30d = metrics.soldCount30d ?? 0;
  let score = clamp(derived.sampleFactor * 100, 0, 100);
  if (sales30d < 5) {
    score *= 0.5;
  }
  return clamp(score, 0, 100);
}

export function computeMarketSignals(input: MarketScoringInput): MarketSignals {
  const { metrics } = input;

  const derived = computeDerivedMetrics(metrics);

  const demandScore = scoreDemand(derived);
  const momentumScore = scoreMomentum(derived);
  const liquidityScore = scoreLiquidity(derived, metrics);
  const supplyPressureScore = scoreSupply(derived);
  const volatilityScore = scoreVolatility(derived);
  const hypeScore = scoreHype(derived);
  const confidenceScore = scoreConfidence(derived, metrics);

  const signalAgreement = [
    demandScore > 60,
    momentumScore > 60,
    liquidityScore > 60,
    supplyPressureScore > 50,
    volatilityScore > 50,
    hypeScore < 50,
  ].filter(Boolean).length;

  const contributions: SignalContributions = {
    demand: demandScore * SIGNAL_WEIGHTS.demand,
    momentum: momentumScore * SIGNAL_WEIGHTS.momentum,
    liquidity: liquidityScore * SIGNAL_WEIGHTS.liquidity,
    supply: supplyPressureScore * SIGNAL_WEIGHTS.supply,
    volatility: volatilityScore * SIGNAL_WEIGHTS.volatility,
    antiHype: (100 - hypeScore) * SIGNAL_WEIGHTS.antiHype,
  };

  const composite =
    contributions.demand +
    contributions.momentum +
    contributions.liquidity +
    contributions.supply +
    contributions.volatility +
    contributions.antiHype;

  return {
    demandScore: Math.round(demandScore),
    momentumScore: Math.round(momentumScore),
    liquidityScore: Math.round(liquidityScore),
    supplyPressureScore: Math.round(supplyPressureScore),
    volatilityScore: Math.round(volatilityScore),
    hypeScore: Math.round(hypeScore),
    confidenceScore: Math.round(confidenceScore),
    composite: Math.round(composite),
    contributions: {
      demand: Math.round(contributions.demand * 10) / 10,
      momentum: Math.round(contributions.momentum * 10) / 10,
      liquidity: Math.round(contributions.liquidity * 10) / 10,
      supply: Math.round(contributions.supply * 10) / 10,
      volatility: Math.round(contributions.volatility * 10) / 10,
      antiHype: Math.round(contributions.antiHype * 10) / 10,
    },
    derivedMetrics: {
      salesVelocity: Math.round(derived.salesVelocity * 100) / 100,
      volumeTrend: Math.round(derived.volumeTrend * 100) / 100,
      priceTrend: Math.round(derived.priceTrend * 1000) / 1000,
      sellThrough: Math.round(derived.sellThrough * 100) / 100,
      cv: Math.round(derived.cv * 1000) / 1000,
      sampleFactor: Math.round(derived.sampleFactor * 100) / 100,
      supplyRatio: Math.round(derived.supplyRatio * 100) / 100,
      volumeAcceleration: Math.round(derived.volumeAcceleration * 100) / 100,
      signalAgreement,
    },
  };
}

export function classifyMarketPhase(derived: DerivedMetrics): MarketPhase {
  const { priceTrend, volumeTrend, supplyRatio } = derived;

  if (priceTrend < -0.05 && supplyRatio > 1.5) {
    return "DECLINE";
  }

  if (priceTrend > 0.05 && volumeTrend <= 1.0) {
    return "EXHAUSTION";
  }

  if (priceTrend > 0.05 && volumeTrend > 1.2) {
    if (supplyRatio > 10) {
      return "EXPANSION";
    }
    return "BREAKOUT";
  }

  if (Math.abs(priceTrend) < 0.03 && volumeTrend > 1.1) {
    return "ACCUMULATION";
  }

  if (priceTrend > 0) {
    if (supplyRatio > 10) {
      return "EXHAUSTION";
    }
    return "EXPANSION";
  }

  return "ACCUMULATION";
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

  return clamp(baseScore + modifier, 5, 95);
}

export function generateMarketVerdict(input: MarketScoringInput): MarketScoringResult {
  const signals = computeMarketSignals(input);
  const derived = signals.derivedMetrics!;
  const phase = classifyMarketPhase(derived);
  const { stage, roleStabilityScore, position, sport } = input;

  const adjustedComposite = applyCareerModifier(signals.composite, stage, position, sport);

  let verdict: InvestmentVerdict;
  let verdictReason: string;

  const agreement = derived.signalAgreement;
  const agreementLabel = agreement >= 5 ? "strong conviction" : agreement >= 3 ? "mixed signals" : "weak alignment";
  const accel = derived.volumeAcceleration;

  if (stage === "BUST" && roleStabilityScore <= 15) {
    verdict = "AVOID_STRUCTURAL";
    verdictReason = "Career stalled with no realistic path back";
  } else if (stage === "RETIRED" && adjustedComposite < 50) {
    verdict = "HOLD_CORE";
    verdictReason = "Retired player - stable legacy hold";
  } else if (stage === "RETIRED_HOF") {
    verdict = adjustedComposite >= 55 ? "ACCUMULATE" : "HOLD_CORE";
    verdictReason = "Hall of Fame legacy value";
  } else if (signals.confidenceScore < 40) {
    verdict = "SPECULATIVE_FLYER";
    verdictReason = `Low data confidence (${signals.confidenceScore}) — sample factor ${derived.sampleFactor}, insufficient data for strong conviction`;
  } else if (adjustedComposite > 75 && (phase === "ACCUMULATION" || phase === "BREAKOUT")) {
    verdict = "ACCUMULATE";
    verdictReason = `Strong composite (${adjustedComposite}) in ${phase.toLowerCase()} phase — ${agreementLabel} (${agreement}/6)${accel > 1.3 ? `, volume accelerating ${accel.toFixed(1)}x` : ""}`;
  } else if (signals.hypeScore > 70 && (phase === "EXHAUSTION" || (signals.momentumScore > 65 && signals.liquidityScore > 50))) {
    verdict = "TRADE_THE_HYPE";
    verdictReason = `Overheated market: prices up ${(derived.priceTrend * 100).toFixed(0)}% but volume trend ${derived.volumeTrend.toFixed(2)}x${accel < 0.7 ? `, volume decelerating ${accel.toFixed(1)}x` : ""} — hype outpacing participation, high liquidity means exit opportunity`;
  } else if (adjustedComposite > 65) {
    verdict = "HOLD_CORE";
    verdictReason = `Solid composite (${adjustedComposite}) — ${agreementLabel} (${agreement}/6)`;
  } else if (adjustedComposite < 40 && !(signals.liquidityScore > 60 && signals.demandScore > 60)) {
    verdict = "AVOID_NEW_MONEY";
    verdictReason = `Weak composite (${adjustedComposite}) — supply ratio ${derived.supplyRatio.toFixed(1)}x, ${agreementLabel} (${agreement}/6)`;
  } else if (adjustedComposite < 40 && signals.liquidityScore > 60 && signals.demandScore > 60) {
    verdict = "TRADE_THE_HYPE";
    verdictReason = `Weak composite (${adjustedComposite}) but high liquidity (${signals.liquidityScore}) and demand (${signals.demandScore}) — sell opportunity, not avoidance`;
  } else {
    verdict = "SPECULATIVE_FLYER";
    verdictReason = `Mixed signals — composite ${adjustedComposite}, ${agreementLabel} (${agreement}/6), phase ${phase.toLowerCase()}`;
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

  const topContribs = Object.entries(signals.contributions!)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  console.log(`[MarketScoring] ${input.playerName}: phase=${phase}, composite=${adjustedComposite}, verdict=${verdict}, sampleFactor=${derived.sampleFactor}, topContribs=[${topContribs}], demand=${signals.demandScore}, momentum=${signals.momentumScore}, hype=${signals.hypeScore}, liquidity=${signals.liquidityScore}, supply=${signals.supplyPressureScore}, vol=${signals.volatilityScore}, conf=${signals.confidenceScore}`);

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
  if (signals.volatilityScore <= 35) return "HIGH";
  if (signals.volatilityScore <= 60) return "MEDIUM";
  return "LOW";
}

function deriveRisk(signals: MarketSignals, stage: PlayerStage, roleStability: number): RiskLevel {
  if (stage === "BUST" || roleStability <= 15) return "HIGH";
  if (signals.volatilityScore <= 30 || signals.supplyPressureScore <= 25) return "HIGH";
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
