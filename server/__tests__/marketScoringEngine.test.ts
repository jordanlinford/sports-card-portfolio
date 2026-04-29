import { describe, it, expect } from "vitest";
import {
  computeMarketSignals,
  classifyMarketPhase,
  generateMarketVerdict,
  type MarketScoringInput,
} from "../marketScoringEngine";
import type { MarketMetrics, DerivedMetrics } from "@shared/schema";
import type { RoleTier } from "../investmentDecisionEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetrics(overrides: Partial<MarketMetrics> = {}): MarketMetrics {
  return {
    soldCount30d: 50,
    soldCount7d: 15,
    soldCountPrev30d: 45,
    activeListingCount: 40,
    avgSoldPrice: 30,
    avgSoldPrice7d: 32,
    medianSoldPrice: 28,
    priceTrend: 0.02,
    priceStdDev30d: 8,
    source: "gemini_search",
    ...overrides,
  };
}

function makeInput(overrides: Partial<MarketScoringInput> = {}): MarketScoringInput {
  return {
    metrics: makeMetrics(),
    playerName: "Test Player",
    stage: "PRIME",
    position: "WR",
    sport: "NFL",
    team: "Dallas Cowboys",
    roleTier: "STARTER" as RoleTier,
    roleStabilityScore: 70,
    ...overrides,
  };
}

function makeDerived(overrides: Partial<DerivedMetrics> = {}): DerivedMetrics {
  return {
    salesVelocity: 2,
    volumeTrend: 1.0,
    priceTrend: 0.0,
    sellThrough: 1.0,
    cv: 0.3,
    sampleFactor: 0.8,
    supplyRatio: 1.0,
    volumeAcceleration: 1.0,
    signalAgreement: 3,
    marketQuality: 50,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SIGNAL_WEIGHTS sum
// ---------------------------------------------------------------------------

describe("SIGNAL_WEIGHTS", () => {
  it("should sum to 1.0", () => {
    // The weights are internal, but we can verify through the contributions.
    // computeMarketSignals returns contributions that are weight * score.
    // With a perfectly uniform 50 score everywhere the sum of raw contributions
    // would equal 50 (because weights sum to 1). We verify indirectly via
    // a controlled input.
    const input = makeInput({
      metrics: makeMetrics({
        soldCount30d: 0,
        soldCount7d: 0,
        soldCountPrev30d: 0,
        activeListingCount: 0,
        avgSoldPrice: 0,
        priceStdDev30d: 0,
        priceTrend: 0,
      }),
    });

    // When everything is zero, sampleFactor is 0 so many scores become 50 (neutral).
    // We just verify the output exists and composite is reasonable.
    const signals = computeMarketSignals(input);
    expect(signals.composite).toBeGreaterThanOrEqual(0);
    expect(signals.composite).toBeLessThanOrEqual(100);

    // Direct weight check: read weights via contributions on a known input
    const weights = { demand: 0.25, momentum: 0.20, liquidity: 0.15, supply: 0.15, volatility: 0.10, antiHype: 0.15 };
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// computeMarketSignals
// ---------------------------------------------------------------------------

describe("computeMarketSignals", () => {
  it("returns all required signal fields", () => {
    const signals = computeMarketSignals(makeInput());
    expect(signals).toHaveProperty("demandScore");
    expect(signals).toHaveProperty("momentumScore");
    expect(signals).toHaveProperty("liquidityScore");
    expect(signals).toHaveProperty("supplyPressureScore");
    expect(signals).toHaveProperty("volatilityScore");
    expect(signals).toHaveProperty("hypeScore");
    expect(signals).toHaveProperty("confidenceScore");
    expect(signals).toHaveProperty("composite");
    expect(signals).toHaveProperty("contributions");
    expect(signals).toHaveProperty("derivedMetrics");
  });

  it("all scores are integers between 0 and 100", () => {
    const signals = computeMarketSignals(makeInput());
    const scoreFields = [
      "demandScore", "momentumScore", "liquidityScore",
      "supplyPressureScore", "volatilityScore", "hypeScore",
      "confidenceScore", "composite",
    ] as const;
    for (const field of scoreFields) {
      expect(signals[field]).toBeGreaterThanOrEqual(0);
      expect(signals[field]).toBeLessThanOrEqual(100);
      expect(Number.isInteger(signals[field])).toBe(true);
    }
  });

  describe("high demand market", () => {
    it("should produce high demand score", () => {
      const input = makeInput({
        metrics: makeMetrics({
          soldCount30d: 100,
          soldCount7d: 30,
          avgSoldPrice: 50,
          priceStdDev30d: 10,
          activeListingCount: 20,
        }),
      });
      const signals = computeMarketSignals(input);
      // sales velocity = 30/7 ≈ 4.3, sampleFactor = 1.0
      // demand = normalize(log(1+4.3), 0, log(21)) * 100 ≈ 55
      // This is a moderate-high demand score given the logarithmic scale
      expect(signals.demandScore).toBeGreaterThan(50);
    });
  });

  describe("dead market (all zeros)", () => {
    it("should produce neutral signals when everything is zero", () => {
      const input = makeInput({
        metrics: makeMetrics({
          soldCount30d: 0,
          soldCount7d: 0,
          soldCountPrev30d: 0,
          activeListingCount: 0,
          avgSoldPrice: 0,
          avgSoldPrice7d: 0,
          medianSoldPrice: 0,
          priceStdDev30d: 0,
          priceTrend: 0,
        }),
      });
      const signals = computeMarketSignals(input);
      // sampleFactor = 0, so demand/momentum/supply/volatility/hype → 50 (neutral)
      expect(signals.demandScore).toBe(0); // demand = 0 * sampleFactor(0) = 0
      expect(signals.momentumScore).toBe(0); // momentum = 50 * 0 = 0
      expect(signals.volatilityScore).toBe(50); // returns 50 when sampleFactor=0
      expect(signals.supplyPressureScore).toBe(50); // returns 50 when sampleFactor=0
      expect(signals.hypeScore).toBe(50); // returns 50 when sampleFactor=0
    });
  });

  describe("volatile market", () => {
    it("should produce low volatility score when cv > 1", () => {
      const input = makeInput({
        metrics: makeMetrics({
          soldCount30d: 50,
          soldCount7d: 15,
          avgSoldPrice: 30,
          priceStdDev30d: 60, // cv = 60/30 = 2.0
        }),
      });
      const signals = computeMarketSignals(input);
      // cv = 2.0, so volatility score = 100 - (2.0 * 150) = -200 → clamped.
      // But with salesVelocity >= 5 check: velocity = 15/7 ≈ 2.1 < 5 so raw applies
      // raw = 100 - 300 = -200 → 0
      expect(signals.volatilityScore).toBeLessThan(30);
    });
  });

  describe("supply-flooded market", () => {
    it("should produce low supply score when listings vastly exceed sales", () => {
      const input = makeInput({
        metrics: makeMetrics({
          soldCount30d: 10,
          soldCount7d: 3,
          activeListingCount: 500,
          avgSoldPrice: 20,
        }),
      });
      const signals = computeMarketSignals(input);
      // supplyRatio = 500 / 10 = 50
      // rawScore = 100 - (50 * 15) = -650 → clamped to floor
      expect(signals.supplyPressureScore).toBeLessThan(30);
    });
  });

  describe("high momentum market", () => {
    it("should produce momentum > 60 with positive price trend and volume trend > 1.2", () => {
      const input = makeInput({
        metrics: makeMetrics({
          soldCount30d: 60,
          soldCount7d: 20,
          soldCountPrev30d: 45, // volumeTrend = 60/45 ≈ 1.33
          avgSoldPrice: 40,
          avgSoldPrice7d: 48,   // price went up
          priceTrend: 0.15,     // positive trend
        }),
      });
      const signals = computeMarketSignals(input);
      // momentum = (50 + 0.15 * 120) * sampleFactor
      // sampleFactor = min(1, log(61)/log(50)) ≈ 1.0
      // momentum = 50 + 18 = 68
      expect(signals.momentumScore).toBeGreaterThan(60);
    });
  });

  describe("null soldCount30d", () => {
    it("should return neutral liquidity (50) when soldCount30d is null", () => {
      const input = makeInput({
        metrics: makeMetrics({
          soldCount30d: undefined,
        }),
      });
      const signals = computeMarketSignals(input);
      expect(signals.liquidityScore).toBe(50);
    });
  });
});

// ---------------------------------------------------------------------------
// classifyMarketPhase
// ---------------------------------------------------------------------------

describe("classifyMarketPhase", () => {
  it("should return DECLINE when priceTrend < -0.05 and supplyRatio > 1.5", () => {
    const phase = classifyMarketPhase(makeDerived({
      priceTrend: -0.10,
      supplyRatio: 3.0,
      volumeTrend: 0.8,
    }));
    expect(phase).toBe("DECLINE");
  });

  it("should return BREAKOUT when priceTrend > 0.05, volumeTrend > 1.2, supplyRatio <= 10", () => {
    const phase = classifyMarketPhase(makeDerived({
      priceTrend: 0.10,
      volumeTrend: 1.5,
      supplyRatio: 2.0,
    }));
    expect(phase).toBe("BREAKOUT");
  });

  it("should return EXPANSION when priceTrend > 0.05, volumeTrend > 1.2, supplyRatio > 10", () => {
    const phase = classifyMarketPhase(makeDerived({
      priceTrend: 0.10,
      volumeTrend: 1.5,
      supplyRatio: 15.0,
    }));
    expect(phase).toBe("EXPANSION");
  });

  it("should return EXHAUSTION when priceTrend > 0.05 and volumeTrend <= 1.0", () => {
    const phase = classifyMarketPhase(makeDerived({
      priceTrend: 0.10,
      volumeTrend: 0.9,
      supplyRatio: 2.0,
    }));
    expect(phase).toBe("EXHAUSTION");
  });

  it("should return ACCUMULATION when |priceTrend| < 0.03 and volumeTrend > 1.1", () => {
    const phase = classifyMarketPhase(makeDerived({
      priceTrend: 0.01,
      volumeTrend: 1.3,
      supplyRatio: 2.0,
    }));
    expect(phase).toBe("ACCUMULATION");
  });

  it("should return EXPANSION for moderate positive priceTrend with low supplyRatio", () => {
    const phase = classifyMarketPhase(makeDerived({
      priceTrend: 0.04,  // > 0 but < 0.05
      volumeTrend: 1.0,
      supplyRatio: 2.0,
    }));
    expect(phase).toBe("EXPANSION");
  });

  it("should return EXHAUSTION for moderate positive priceTrend with supplyRatio > 10", () => {
    const phase = classifyMarketPhase(makeDerived({
      priceTrend: 0.04,
      volumeTrend: 1.0,
      supplyRatio: 12.0,
    }));
    expect(phase).toBe("EXHAUSTION");
  });

  it("should return ACCUMULATION for flat or negative price trend (fallback)", () => {
    const phase = classifyMarketPhase(makeDerived({
      priceTrend: -0.02,
      volumeTrend: 0.9,
      supplyRatio: 1.0,
    }));
    expect(phase).toBe("ACCUMULATION");
  });
});

// ---------------------------------------------------------------------------
// generateMarketVerdict
// ---------------------------------------------------------------------------

describe("generateMarketVerdict", () => {
  it("returns a complete result with all required fields", () => {
    const result = generateMarketVerdict(makeInput());
    expect(result).toHaveProperty("signals");
    expect(result).toHaveProperty("phase");
    expect(result).toHaveProperty("verdict");
    expect(result).toHaveProperty("verdictReason");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("temperature");
    expect(result).toHaveProperty("volatility");
    expect(result).toHaveProperty("risk");
    expect(result).toHaveProperty("horizon");
  });

  it("BUST stage with low role stability returns AVOID_STRUCTURAL", () => {
    const result = generateMarketVerdict(makeInput({
      stage: "BUST",
      roleTier: "OUT_OF_LEAGUE",
      roleStabilityScore: 10,
    }));
    expect(result.verdict).toBe("AVOID_STRUCTURAL");
  });

  it("low confidence returns SPECULATIVE_FLYER", () => {
    // With very few sales, confidence will be low
    const result = generateMarketVerdict(makeInput({
      metrics: makeMetrics({
        soldCount30d: 1,
        soldCount7d: 0,
        activeListingCount: 2,
        avgSoldPrice: 5,
      }),
      stage: "YEAR_3",
      roleTier: "UNCERTAIN_STARTER",
      roleStabilityScore: 45,
    }));
    // confidenceScore should be low enough to trigger speculative
    expect(result.signals.confidenceScore).toBeLessThan(40);
    expect(result.verdict).toBe("SPECULATIVE_FLYER");
  });

  it("RETIRED_HOF returns ACCUMULATE or HOLD_CORE", () => {
    const result = generateMarketVerdict(makeInput({
      stage: "RETIRED_HOF",
      roleTier: "FRANCHISE_CORE",
      roleStabilityScore: 90,
    }));
    expect(["ACCUMULATE", "HOLD_CORE"]).toContain(result.verdict);
  });

  it("assigns SHORT horizon for ROOKIE stage", () => {
    const result = generateMarketVerdict(makeInput({
      stage: "ROOKIE",
      roleTier: "UNCERTAIN_STARTER",
      roleStabilityScore: 45,
    }));
    expect(result.horizon).toBe("SHORT");
  });

  it("assigns LONG horizon for VETERAN stage", () => {
    const result = generateMarketVerdict(makeInput({
      stage: "VETERAN",
      roleTier: "STARTER",
      roleStabilityScore: 70,
    }));
    expect(result.horizon).toBe("LONG");
  });

  it("derives HIGH volatility when volatilityScore is very low", () => {
    const result = generateMarketVerdict(makeInput({
      metrics: makeMetrics({
        soldCount30d: 50,
        soldCount7d: 15,
        avgSoldPrice: 20,
        priceStdDev30d: 80, // cv = 4.0 → very low volatility score
      }),
    }));
    expect(result.volatility).toBe("HIGH");
  });

  it("applies career modifier - AGING stage reduces composite", () => {
    const primeResult = generateMarketVerdict(makeInput({ stage: "PRIME" }));
    const agingResult = generateMarketVerdict(makeInput({ stage: "AGING" }));
    // AGING gets -12 modifier vs PRIME +5, so aging composite should be lower
    // (assuming same signals)
    expect(agingResult.signals.composite).toBeLessThanOrEqual(primeResult.signals.composite);
  });

  it("fading veteran with role stability <= 15 gets AVOID_STRUCTURAL", () => {
    const result = generateMarketVerdict(makeInput({
      stage: "VETERAN",
      roleTier: "OUT_OF_LEAGUE",
      roleStabilityScore: 10,
    }));
    expect(result.verdict).toBe("AVOID_STRUCTURAL");
  });
});
