import type {
  InvestmentVerdict,
  InvestmentCall,
  InvestmentScores,
  InvestmentActionPlan,
  DataConfidence,
  InvestmentHorizon,
  PlayerStage,
  MarketTemperature,
  VolatilityLevel,
  RiskLevel,
  ExposureRecommendation,
  VERDICT_POSTURE,
} from "@shared/schema";

export type DecisionInput = {
  stage: PlayerStage;
  temperature: MarketTemperature;
  volatility: VolatilityLevel;
  risk: RiskLevel;
  horizon: InvestmentHorizon;
  confidence: DataConfidence;
  exposures: ExposureRecommendation[];
  thesis: string[];
  marketRealityCheck: string[];
  compData?: {
    median?: number;
    low?: number;
    high?: number;
    available: boolean;
    source?: "live" | "modeled";
  };
  newsCount?: number;
  momentum?: "UP" | "DOWN" | "STABLE";
  newsHype?: "HIGH" | "MEDIUM" | "LOW";
  team?: string;
  position?: string;
};

export type DecisionDebug = {
  stage: PlayerStage;
  temperature: MarketTemperature;
  compAvailable: boolean;
  compSource: "live" | "modeled" | "unknown";
  compsReliable: boolean;
  lowMeta: boolean;
  overheated: boolean;
  trendScore: number;
  liquidityScore: number;
  volatilityScore: number;
  narrativeHeatScore: number;
  valuationScore: number;
  mispricingScore: number;
  downsideRiskScore: number;
  chosenVerdict: InvestmentVerdict;
  cappedConfidence: DataConfidence;
  verdictReason: string;
};

function computeScores(input: DecisionInput): InvestmentScores {
  const { stage, temperature, volatility, risk, confidence, newsCount = 0, compData, momentum, newsHype } = input;

  const tempToScore: Record<MarketTemperature, number> = {
    HOT: 85,
    WARM: 65,
    NEUTRAL: 45,
    COOLING: 25,
  };

  const volToScore: Record<VolatilityLevel, number> = {
    HIGH: 80,
    MEDIUM: 50,
    LOW: 25,
  };

  const riskToScore: Record<RiskLevel, number> = {
    HIGH: 80,
    MEDIUM: 50,
    LOW: 25,
  };

  const confToScore: Record<DataConfidence, number> = {
    HIGH: 80,
    MEDIUM: 55,
    LOW: 30,
  };

  const stageToTrend: Record<PlayerStage, number> = {
    PROSPECT: 70,
    ROOKIE: 75,
    YEAR_2: 70,
    PRIME: 65,
    VETERAN: 45,
    AGING: 30,
    BUST: 15,           // Career stalled - very low trend/upside
    RETIRED: 35,
    RETIRED_HOF: 55,
    UNKNOWN: 50,        // Unknown stage - neutral assumption
  };

  const stageToInjuryRisk: Record<PlayerStage, number> = {
    PROSPECT: 40,
    ROOKIE: 45,
    YEAR_2: 40,
    PRIME: 35,
    VETERAN: 55,
    AGING: 70,
    BUST: 85,           // Career stalled - high risk (could be cut, out of league)
    RETIRED: 20,
    RETIRED_HOF: 15,
    UNKNOWN: 60,        // Unknown stage - elevated risk due to uncertainty
  };

  const momentumToScore: Record<string, number> = {
    UP: 75,
    STABLE: 50,
    DOWN: 25,
  };

  const hypeToScore: Record<string, number> = {
    HIGH: 85,
    MEDIUM: 55,
    LOW: 25,
  };

  let baseTrendScore = stageToTrend[stage] ?? 50;
  if (momentum) {
    baseTrendScore = (baseTrendScore + momentumToScore[momentum]) / 2;
  }
  const trendScore = baseTrendScore;

  const liquidityScore = tempToScore[temperature] ?? 50;
  const volatilityScore = volToScore[volatility] ?? 50;
  
  let narrativeHeatScore: number;
  if (newsHype) {
    narrativeHeatScore = hypeToScore[newsHype];
  } else {
    narrativeHeatScore = Math.min(100, (newsCount * 12) + (tempToScore[temperature] ?? 50) * 0.5);
  }
  
  const injuryRoleRiskScore = Math.max(
    stageToInjuryRisk[stage] ?? 50,
    riskToScore[risk] ?? 50
  );

  let valuationScore: number;
  if (compData?.available && compData.median && compData.low && compData.high) {
    const spread = compData.high - compData.low;
    const medianPosition = (compData.median - compData.low) / (spread || 1);
    valuationScore = 100 - (medianPosition * 50) - (tempToScore[temperature] ?? 50) * 0.3;
    valuationScore = Math.max(20, Math.min(80, valuationScore));
  } else {
    valuationScore = 50 - (tempToScore[temperature] ?? 50) * 0.2;
    valuationScore = Math.max(30, Math.min(70, valuationScore));
  }

  const mispricingScore = valuationScore - narrativeHeatScore;
  const downsideRiskScore = (injuryRoleRiskScore * 0.6) + (volatilityScore * 0.4);

  return {
    trendScore: Math.round(trendScore),
    liquidityScore: Math.round(liquidityScore),
    volatilityScore: Math.round(volatilityScore),
    narrativeHeatScore: Math.round(narrativeHeatScore),
    injuryRoleRiskScore: Math.round(injuryRoleRiskScore),
    valuationScore: Math.round(valuationScore),
    mispricingScore: Math.round(mispricingScore),
    downsideRiskScore: Math.round(downsideRiskScore),
  };
}

type VerdictResult = {
  verdict: InvestmentVerdict;
  reason: string;
};

function decideVerdict(
  scores: InvestmentScores, 
  stage: PlayerStage | undefined,
  compsReliable: boolean,
  overheated: boolean,
  input: DecisionInput
): VerdictResult {
  const { downsideRiskScore, valuationScore, mispricingScore, narrativeHeatScore, liquidityScore } = scores;

  // ============================================================
  // CALIBRATED VERDICT LOGIC (Dec 2024)
  // Key insight: "unknown expected value" ≠ "negative expected value"
  //
  // ACCUMULATE = positive expected value
  // HOLD_CORE = neutral expected value  
  // SPECULATIVE_FLYER = unknown expected value (uncertainty)
  // AVOID_NEW_MONEY = negative expected value (structural problem)
  // TRADE_THE_HYPE = timing-based exit (rare, needs reliable comps)
  // ============================================================

  // PRECEDENCE 1: BUST → AVOID_NEW_MONEY by default
  // Busts represent failure, not uncertainty. Speculative is reserved for
  // rare cases with exceptional value + liquidity.
  if (stage === "BUST") {
    // Only allow SPECULATIVE for busts with exceptional value (dead cat bounce lotto)
    if (valuationScore >= 75 && liquidityScore >= 45) {
      return { verdict: "SPECULATIVE_FLYER", reason: "BUST with exceptional value - dead cat bounce potential" };
    }
    return { verdict: "AVOID_NEW_MONEY", reason: "BUST - career stalled, avoid new money" };
  }

  // PRECEDENCE 2: Retired / HOF → HOLD_CORE by default
  // Legends/vintage markets should not be treated as hype trades
  const isRetiredOrHOF = stage === "RETIRED" || stage === "RETIRED_HOF";
  if (isRetiredOrHOF) {
    if (stage === "RETIRED_HOF" && valuationScore >= 50 && liquidityScore >= 50) {
      return { verdict: "ACCUMULATE", reason: "HOF with good value/liquidity" };
    }
    if (downsideRiskScore >= 80 && liquidityScore <= 30) {
      return { verdict: "AVOID_NEW_MONEY", reason: "Retired with poor fundamentals" };
    }
    return { verdict: "HOLD_CORE", reason: "Retired/HOF - stable legacy hold" };
  }

  // PRECEDENCE 3: TRADE_THE_HYPE (rare - requires reliable comps)
  // Only fires when we have live comps data showing actual price spikes
  if (overheated && compsReliable) {
    return { verdict: "TRADE_THE_HYPE", reason: "Overheated with reliable comps - sell into spikes" };
  }

  // PRECEDENCE 4: Early-career or UNKNOWN stage default to SPECULATIVE unless clearly cheap
  // Young/unknown players without reliable comps = uncertainty, not HOLD
  const earlyCareerOrUnknown = stage === "ROOKIE" || stage === "YEAR_2" || stage === "UNKNOWN";
  if (!compsReliable && earlyCareerOrUnknown) {
    // If clearly underpriced with good fundamentals, they can ACCUMULATE
    if (mispricingScore >= 15 && liquidityScore >= 55 && downsideRiskScore <= 65) {
      return { verdict: "ACCUMULATE", reason: "Early-career/unknown with compelling value" };
    }
    // Extreme downside risk → AVOID even for rookies
    if (downsideRiskScore >= 75) {
      return { verdict: "AVOID_NEW_MONEY", reason: "Early-career with extreme downside risk" };
    }
    // Otherwise, speculative by default (not HOLD)
    return { verdict: "SPECULATIVE_FLYER", reason: "Early-career/unknown without reliable comps - uncertainty" };
  }

  // ============================================================
  // PRIME PLAYER HANDLING (with modeled comps)
  // Key insight: PRIME vets should NOT auto-fall into SPECULATIVE
  // We need to distinguish stable cores from shaky starters/backups
  // ============================================================
  const isPrime = stage === "PRIME";
  
  // PRECEDENCE 5: Veteran Core Override (Mike Evans, Derrick Henry)
  // Stable PRIME players with modeled comps → HOLD_CORE, not SPECULATIVE
  const stableCoreProfile = isPrime && liquidityScore >= 55 && downsideRiskScore <= 60;
  if (!compsReliable && stableCoreProfile) {
    return { verdict: "HOLD_CORE", reason: "Veteran core - stable profile with modeled comps" };
  }
  
  // PRECEDENCE 6: Shaky Market Avoid (Kenny Pickett, Mac Jones)
  // PRIME players with weak demand signals → AVOID, not SPECULATIVE
  // Low liquidity + low trend = nobody wants this player's cards
  const weakDemandProfile = isPrime && liquidityScore <= 45 && scores.trendScore <= 55;
  if (!compsReliable && weakDemandProfile) {
    return { verdict: "AVOID_NEW_MONEY", reason: "Weak market demand - thin liquidity with poor trend" };
  }

  // PRECEDENCE 7: Mid-tier AVOID for active players with deteriorating setup
  // Catches Daniel Jones types: low liquidity + bad signals
  // Note: BUST/RETIRED/RETIRED_HOF already handled above, so only active stages reach here
  const deteriorating = 
    input.momentum === "DOWN" || 
    input.risk === "HIGH" || 
    input.volatility === "HIGH";
  
  if (!compsReliable && liquidityScore <= 35 && deteriorating) {
    return { verdict: "AVOID_NEW_MONEY", reason: "Low liquidity with deteriorating signals" };
  }

  // PRECEDENCE 8: ACCUMULATE (strong value signals)
  if (mispricingScore >= 15 && liquidityScore >= 55 && downsideRiskScore <= 65) {
    return { verdict: "ACCUMULATE", reason: "Underpriced with good liquidity/risk profile" };
  }

  // PRECEDENCE 9: AVOID_NEW_MONEY - extreme risk cases
  // Only fires for genuinely negative expected value situations
  if (downsideRiskScore >= 70 && valuationScore <= 40) {
    return { verdict: "AVOID_NEW_MONEY", reason: "Extreme downside risk with poor valuation" };
  }

  // PRECEDENCE 10: HOLD_CORE - widened to catch fairly priced stars
  // Stars who are "fully priced but not cheap" belong here, not AVOID
  if (downsideRiskScore < 70 && valuationScore >= 35) {
    return { verdict: "HOLD_CORE", reason: "Fair value with acceptable risk" };
  }
  
  // PRECEDENCE 11: PRIME players who don't match other criteria → HOLD_CORE fallback
  // PRIME vets should not default to SPECULATIVE - they are established
  if (isPrime) {
    return { verdict: "HOLD_CORE", reason: "Established player - default to hold" };
  }

  // PRECEDENCE 12: SPECULATIVE_FLYER as final fallback
  // Should only reach here for edge cases not covered above
  return { verdict: "SPECULATIVE_FLYER", reason: "High uncertainty - treat as lottery ticket" };
}

function computeConfidence(scores: InvestmentScores): DataConfidence {
  const { liquidityScore, downsideRiskScore, mispricingScore } = scores;

  if (liquidityScore >= 70 && downsideRiskScore <= 55 && Math.abs(mispricingScore) >= 15) {
    return "HIGH";
  }

  if (liquidityScore >= 50 && downsideRiskScore <= 70) {
    return "MEDIUM";
  }

  return "LOW";
}

const POSTURE_LABELS: Record<InvestmentVerdict, string> = {
  ACCUMULATE: "Buy during dips",
  HOLD_CORE: "Hold, don't chase",
  TRADE_THE_HYPE: "Sell into spikes",
  AVOID_NEW_MONEY: "Stay away",
  SPECULATIVE_FLYER: "Small lottery bet",
};

function getContextAwarePostureLabel(
  verdict: InvestmentVerdict, 
  overheated: boolean, 
  downsideRiskScore: number
): string {
  if (verdict === "TRADE_THE_HYPE") {
    return "Sell into spikes";
  }
  
  if (verdict === "AVOID_NEW_MONEY") {
    if (overheated) {
      return "Don't chase at these prices";
    }
    if (downsideRiskScore >= 75) {
      return "Avoid downside risk";
    }
    return "Stay away";
  }
  
  return POSTURE_LABELS[verdict];
}

function generateActionPlan(verdict: InvestmentVerdict, input: DecisionInput): InvestmentActionPlan {
  const { stage, temperature } = input;

  const actionPlans: Record<InvestmentVerdict, InvestmentActionPlan> = {
    ACCUMULATE: {
      whatToDoNow: "Start building a position in flagship rookies and key parallels.",
      entryPlan: temperature === "COOLING" 
        ? "Buy now while prices are soft. The market is sleeping on this player."
        : "Wait for a temporary dip (bad game, team loss) to buy at better prices.",
      positionSizing: stage === "ROOKIE" || stage === "YEAR_2"
        ? "Core position - allocate 10-15% of your card budget here."
        : "Moderate position - 5-10% allocation is appropriate.",
    },
    HOLD_CORE: {
      whatToDoNow: "Keep what you have. Don't add unless prices drop significantly.",
      entryPlan: "Only buy on meaningful pullbacks of 20%+ from recent highs.",
      positionSizing: "Maintain current position. No need to chase higher prices.",
    },
    TRADE_THE_HYPE: {
      whatToDoNow: "List your high-end pieces for sale. Take profits while demand is hot.",
      entryPlan: "Don't buy anything new. Prices reflect hype, not fundamentals.",
      positionSizing: "Reduce exposure. Sell 50-75% of your position into strength.",
    },
    AVOID_NEW_MONEY: {
      whatToDoNow: "Do not buy any cards of this player right now.",
      entryPlan: "Wait for a major catalyst or 40%+ price drop before reconsidering.",
      positionSizing: "Zero allocation. If you hold, consider selling to redeploy capital.",
    },
    SPECULATIVE_FLYER: {
      whatToDoNow: "Consider a small position only if you can afford to lose it.",
      entryPlan: "Buy cheap base cards or low-end parallels. Don't overpay for premium.",
      positionSizing: "Lottery ticket only - max 2-3% of budget. High risk, high reward.",
    },
  };

  return actionPlans[verdict];
}

function generateWhyBullets(verdict: InvestmentVerdict, scores: InvestmentScores, input: DecisionInput): string[] {
  const bullets: string[] = [];
  const { stage, temperature } = input;
  const { mispricingScore, downsideRiskScore, narrativeHeatScore, liquidityScore } = scores;

  switch (verdict) {
    case "ACCUMULATE":
      if (mispricingScore >= 15) bullets.push("Cards are underpriced relative to current buzz and attention.");
      if (stage === "ROOKIE" || stage === "YEAR_2") bullets.push("Young player with significant upside runway ahead.");
      if (liquidityScore >= 60) bullets.push("Strong market demand makes buying and selling easy.");
      break;

    case "HOLD_CORE":
      bullets.push("Current prices fairly reflect the player's market position.");
      if (downsideRiskScore <= 50) bullets.push("Limited downside risk protects your existing position.");
      bullets.push("Better opportunities exist elsewhere for new money right now.");
      break;

    case "TRADE_THE_HYPE":
      if (narrativeHeatScore >= 70) bullets.push("Hype is running ahead of actual on-field production.");
      if (mispricingScore <= -20) bullets.push("Cards are expensive relative to realistic expectations.");
      bullets.push("Selling now locks in gains before the market corrects.");
      break;

    case "AVOID_NEW_MONEY":
      if (downsideRiskScore >= 70) bullets.push("High risk of injury, role change, or performance decline.");
      if (liquidityScore <= 40) bullets.push("Thin market makes it hard to exit if things go wrong.");
      bullets.push("Better ways to deploy your card budget right now.");
      break;

    case "SPECULATIVE_FLYER":
      bullets.push("Uncertain outlook but potential for a breakout surprise.");
      if (temperature === "COOLING") bullets.push("Low prices mean limited downside if the bet fails.");
      bullets.push("Only makes sense as a small, high-risk position.");
      break;
  }

  return bullets.slice(0, 3);
}

function generateThesisBreakers(verdict: InvestmentVerdict, input: DecisionInput): string[] {
  const { stage } = input;
  const breakers: string[] = [];

  const commonBreakers = {
    injury: "Significant injury that sidelines the player for extended time.",
    roleChange: "Loss of starting role or reduced playing time.",
    teamChange: "Trade to a small-market team with less media exposure.",
    performance: "Sustained poor performance over 4+ weeks.",
    scandal: "Off-field issues or controversy affecting reputation.",
  };

  switch (verdict) {
    case "ACCUMULATE":
      breakers.push(commonBreakers.injury);
      if (stage === "ROOKIE" || stage === "YEAR_2") breakers.push(commonBreakers.roleChange);
      breakers.push(commonBreakers.performance);
      break;

    case "HOLD_CORE":
      breakers.push(commonBreakers.performance);
      breakers.push(commonBreakers.injury);
      breakers.push("Price drops 30%+ signaling market shift.");
      break;

    case "TRADE_THE_HYPE":
      breakers.push("Actual performance catches up to justify current prices.");
      breakers.push("Major award win or championship that sustains hype.");
      breakers.push("You miss the window and prices drop before you can sell.");
      break;

    case "AVOID_NEW_MONEY":
      breakers.push("Full recovery from injury with return to prior form.");
      breakers.push("Trade to a contending team with increased role.");
      breakers.push("Prices drop 50%+ making risk/reward more attractive.");
      break;

    case "SPECULATIVE_FLYER":
      breakers.push(commonBreakers.injury);
      breakers.push("Confirmation the player won't get the opportunity.");
      breakers.push("Prices rise before the catalyst, eliminating upside.");
      break;
  }

  return breakers.slice(0, 3);
}

function generateCardTargets(
  verdict: InvestmentVerdict,
  exposures: ExposureRecommendation[]
): { whatToBuy?: string[]; whatToSell?: string[]; whatToAvoid?: string[] } {
  const growthCards = exposures.find(e => e.tier === "GROWTH")?.cardTargets || [];
  const premiumCards = exposures.find(e => e.tier === "PREMIUM")?.cardTargets || [];
  const coreCards = exposures.find(e => e.tier === "CORE")?.cardTargets || [];
  const specCards = exposures.find(e => e.tier === "SPECULATIVE")?.cardTargets || [];

  switch (verdict) {
    case "ACCUMULATE":
      return {
        whatToBuy: [...growthCards.slice(0, 2), ...coreCards.slice(0, 2)].slice(0, 4),
      };

    case "HOLD_CORE":
      return {
        whatToBuy: coreCards.slice(0, 2),
        whatToAvoid: premiumCards.slice(0, 2),
      };

    case "TRADE_THE_HYPE":
      return {
        whatToSell: [...premiumCards.slice(0, 2), ...growthCards.slice(0, 2)].slice(0, 4),
        whatToAvoid: [...premiumCards, ...growthCards].slice(0, 4),
      };

    case "AVOID_NEW_MONEY":
      return {
        whatToAvoid: [...premiumCards.slice(0, 2), ...growthCards.slice(0, 2)].slice(0, 4),
      };

    case "SPECULATIVE_FLYER":
      return {
        whatToBuy: [...specCards.slice(0, 2), ...coreCards.slice(0, 2)].slice(0, 4),
        whatToAvoid: premiumCards.slice(0, 2),
      };
  }
}

function generateOneLineRationale(verdict: InvestmentVerdict, input: DecisionInput, scores: InvestmentScores): string {
  const { stage, temperature } = input;
  const stageLabel = stage.toLowerCase().replace(/_/g, " ");

  const templates: Record<InvestmentVerdict, string> = {
    ACCUMULATE: `${stageLabel} player with room to grow and cards priced below where demand is heading. Build your position now.`,
    HOLD_CORE: `Prices reflect reality for this ${stageLabel} player. Keep what you have but don't chase higher prices right now.`,
    TRADE_THE_HYPE: `Market buzz has pushed prices beyond what the on-field product supports. Take profits before the correction.`,
    AVOID_NEW_MONEY: `Too many red flags for new investment. High risk of price drops with limited upside to justify the gamble.`,
    SPECULATIVE_FLYER: `Long shot with potential payoff. Small position only - treat it like a lottery ticket, not a core investment.`,
  };

  return templates[verdict];
}

function generateTriggers(verdict: InvestmentVerdict, input: DecisionInput): { upgrade?: string[]; downgrade?: string[] } {
  const triggers: { upgrade?: string[]; downgrade?: string[] } = {};

  switch (verdict) {
    case "ACCUMULATE":
      triggers.downgrade = [
        "Injury or significant performance decline",
        "Prices spike 40%+ eliminating the value opportunity",
        "Team situation deteriorates (coaching change, rebuild)",
      ];
      break;

    case "HOLD_CORE":
      triggers.upgrade = [
        "Prices drop 20%+ creating a buying opportunity",
        "Breakout performance or award consideration",
        "Trade to a better team situation",
      ];
      triggers.downgrade = [
        "Injury or extended slump",
        "Role reduction or benching",
        "Better opportunities emerge elsewhere",
      ];
      break;

    case "TRADE_THE_HYPE":
      triggers.upgrade = [
        "Performance catches up to justify prices",
        "Major accomplishment (MVP, championship)",
        "You successfully exit and prices keep rising (rare)",
      ];
      break;

    case "AVOID_NEW_MONEY":
      triggers.upgrade = [
        "Prices drop 40%+ improving risk/reward",
        "Return to form after injury or slump",
        "Trade to contending team with clear role",
      ];
      break;

    case "SPECULATIVE_FLYER":
      triggers.upgrade = [
        "Breakout performance confirms the upside",
        "Role increase or opportunity emerges",
        "Market starts recognizing the potential",
      ];
      triggers.downgrade = [
        "Catalyst doesn't materialize",
        "Better speculative opportunities appear",
        "Prices rise before breakout (eliminating value)",
      ];
      break;
  }

  return triggers;
}

export function generateInvestmentCall(input: DecisionInput): InvestmentCall & { decisionDebug?: DecisionDebug } {
  const scores = computeScores(input);
  
  // Compute helper flags for gating logic
  const hasCompData = input.compData?.available === true;
  const compSource: "live" | "modeled" | "unknown" = input.compData?.source ?? "unknown";
  const compsReliable = hasCompData && compSource === "live";
  
  // lowMeta: team or position is unknown/missing/placeholder
  // Normalize and check for common placeholder values
  const isUnknownValue = (val: string | undefined | null): boolean => {
    if (val == null) return true;
    const normalized = val.toLowerCase().trim();
    return normalized === "unknown" || 
           normalized === "n/a" || 
           normalized === "tbd" || 
           normalized === "" ||
           normalized === "none";
  };
  const lowMeta = isUnknownValue(input.team) || isUnknownValue(input.position);
  
  // overheated: high narrative heat with negative mispricing
  const overheated = (scores.mispricingScore <= -20 && scores.narrativeHeatScore >= 65);
  
  // Get verdict with new precedence-based logic
  const { verdict, reason } = decideVerdict(scores, input.stage, compsReliable, overheated, input);
  
  // Compute base confidence
  let confidence = computeConfidence(scores);
  
  // Confidence capping rules (CRITICAL: enforce at the end, no overrides after this)
  // If comps are not reliable (modeled or missing) → MUST be LOW
  // Only allow MEDIUM/HIGH with reliable (live) comps
  if (!compsReliable) {
    // No reliable comps = LOW confidence, period
    confidence = "LOW";
  }
  // lowMeta also forces LOW even with reliable comps (can't trust data)
  if (lowMeta) {
    confidence = "LOW";
  }
  
  // Get context-aware posture label
  const postureLabel = getContextAwarePostureLabel(verdict, overheated, scores.downsideRiskScore);

  const triggers = generateTriggers(verdict, input);
  const cardTargets = generateCardTargets(verdict, input.exposures);

  // Build decisionDebug for QA
  const decisionDebug: DecisionDebug = {
    stage: input.stage,
    temperature: input.temperature,
    compAvailable: hasCompData,
    compSource,
    compsReliable,
    lowMeta,
    overheated,
    trendScore: scores.trendScore,
    liquidityScore: scores.liquidityScore,
    volatilityScore: scores.volatilityScore,
    narrativeHeatScore: scores.narrativeHeatScore,
    valuationScore: scores.valuationScore,
    mispricingScore: scores.mispricingScore,
    downsideRiskScore: scores.downsideRiskScore,
    chosenVerdict: verdict,
    cappedConfidence: confidence,
    verdictReason: reason,
  };

  console.log(`[InvestmentDecision] Verdict: ${verdict} (${reason}), Scores:`, JSON.stringify(scores));
  console.log(`[InvestmentDecision] Debug: compsReliable=${compsReliable}, lowMeta=${lowMeta}, overheated=${overheated}`);

  return {
    verdict,
    postureLabel,
    confidence,
    timeHorizon: input.horizon,
    oneLineRationale: generateOneLineRationale(verdict, input, scores),
    whyBullets: generateWhyBullets(verdict, scores, input),
    actionPlan: generateActionPlan(verdict, input),
    ...cardTargets,
    thesisBreakers: generateThesisBreakers(verdict, input),
    triggersToUpgrade: triggers.upgrade,
    triggersToDowngrade: triggers.downgrade,
    scores,
    decisionDebug,
  };
}

export { computeScores, decideVerdict, computeConfidence };
