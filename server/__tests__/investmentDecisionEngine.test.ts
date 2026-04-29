import { describe, it, expect } from "vitest";
import {
  getRoleTier,
  getRoleStabilityScore,
  generateInvestmentCall,
  type DecisionInput,
  type RoleTier,
} from "../investmentDecisionEngine";
import type { ExposureRecommendation } from "@shared/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExposures(): ExposureRecommendation[] {
  return [
    {
      tier: "GROWTH",
      cardTargets: ["Prizm Silver Rookie"],
      why: "Test exposure",
      liquidity: "HIGH",
      riskNote: "Standard risk",
      buyerProfile: "INVESTOR",
      timingGuidance: "Buy on dips",
    },
  ];
}

function makeDecisionInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    stage: "PRIME",
    temperature: "WARM",
    volatility: "MEDIUM",
    risk: "MEDIUM",
    horizon: "MID",
    confidence: "MEDIUM",
    exposures: makeExposures(),
    thesis: ["Strong fundamentals"],
    marketRealityCheck: ["Market is active"],
    playerName: "Test Player",
    team: "Dallas Cowboys",
    position: "WR",
    sport: "NFL",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getRoleTier
// ---------------------------------------------------------------------------

describe("getRoleTier", () => {
  it("returns FRANCHISE_CORE for a known franchise player", () => {
    expect(getRoleTier("Patrick Mahomes")).toBe("FRANCHISE_CORE");
  });

  it("returns FRANCHISE_CORE case-insensitive", () => {
    expect(getRoleTier("patrick mahomes")).toBe("FRANCHISE_CORE");
  });

  it("returns STARTER for a known starter", () => {
    expect(getRoleTier("Mike Evans")).toBe("STARTER");
  });

  it("returns BACKUP for a known backup", () => {
    expect(getRoleTier("Kenny Pickett")).toBe("BACKUP");
  });

  it("returns OUT_OF_LEAGUE for a known inactive player", () => {
    expect(getRoleTier("Trey Lance")).toBe("OUT_OF_LEAGUE");
  });

  it("returns UNKNOWN for an unrecognized player", () => {
    expect(getRoleTier("Completely Fake Player Name XYZ123")).toBe("UNKNOWN");
  });

  it("handles hyphenated names like Ja'Marr Chase", () => {
    const tier = getRoleTier("Ja'Marr Chase");
    expect(tier).toBe("FRANCHISE_CORE");
  });
});

// ---------------------------------------------------------------------------
// getRoleStabilityScore
// ---------------------------------------------------------------------------

describe("getRoleStabilityScore", () => {
  it("returns 90 for FRANCHISE_CORE", () => {
    expect(getRoleStabilityScore("Patrick Mahomes")).toBe(90);
  });

  it("returns 70 for STARTER", () => {
    expect(getRoleStabilityScore("Mike Evans")).toBe(70);
  });

  it("returns 25 for BACKUP", () => {
    expect(getRoleStabilityScore("Kenny Pickett")).toBe(25);
  });

  it("returns 10 for OUT_OF_LEAGUE", () => {
    expect(getRoleStabilityScore("Trey Lance")).toBe(10);
  });

  it("returns 55 for UNKNOWN player", () => {
    expect(getRoleStabilityScore("Unknown Player XYZ")).toBe(55);
  });

  it("returns 45 for UNCERTAIN_STARTER", () => {
    expect(getRoleStabilityScore("Caleb Williams")).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// generateInvestmentCall
// ---------------------------------------------------------------------------

describe("generateInvestmentCall", () => {
  it("returns a complete InvestmentCall with all required fields", () => {
    const result = generateInvestmentCall(makeDecisionInput());
    expect(result).toHaveProperty("verdict");
    expect(result).toHaveProperty("postureLabel");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("timeHorizon");
    expect(result).toHaveProperty("oneLineRationale");
    expect(result).toHaveProperty("whyBullets");
    expect(result).toHaveProperty("actionPlan");
    expect(result).toHaveProperty("thesisBreakers");
  });

  it("returns decisionDebug with scoring details", () => {
    const result = generateInvestmentCall(makeDecisionInput());
    expect(result.decisionDebug).toBeDefined();
    expect(result.decisionDebug).toHaveProperty("roleTier");
    expect(result.decisionDebug).toHaveProperty("roleStabilityScore");
    expect(result.decisionDebug).toHaveProperty("maturityTier");
    expect(result.decisionDebug).toHaveProperty("chosenVerdict");
  });

  describe("BUST stage", () => {
    it("returns AVOID_STRUCTURAL for BUST with high downside", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "BUST",
        temperature: "COOLING",
        volatility: "HIGH",
        risk: "HIGH",
        playerName: "Johnny Manziel",
      }));
      expect(result.verdict).toBe("AVOID_STRUCTURAL");
    });
  });

  describe("high downside risk", () => {
    it("returns AVOID_NEW_MONEY or AVOID_STRUCTURAL for high downside aging player", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "AGING",
        temperature: "COOLING",
        volatility: "HIGH",
        risk: "HIGH",
        horizon: "LONG",
        playerName: "Some Aging Player",
        position: "RB",
      }));
      // Aging RB with HIGH volatility and HIGH risk → downside score >= 70
      expect(["AVOID_NEW_MONEY", "AVOID_STRUCTURAL"]).toContain(result.verdict);
    });
  });

  describe("overheated rookie", () => {
    it("should not return ACCUMULATE for overheated rookie with negative mispricing", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "ROOKIE",
        temperature: "HOT",
        volatility: "HIGH",
        risk: "HIGH",
        horizon: "SHORT",
        newsHype: "HIGH",
        newsCount: 10,
        playerName: "Hyped Rookie Nobody",
      }));
      expect(result.verdict).not.toBe("ACCUMULATE");
    });
  });

  describe("franchise core veteran", () => {
    it("should not be SPECULATIVE_FLYER for established franchise core", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "PRIME",
        temperature: "WARM",
        volatility: "LOW",
        risk: "LOW",
        horizon: "MID",
        confidence: "HIGH",
        playerName: "Nikola Jokic",
        team: "Denver Nuggets",
        position: "C",
      }));
      // Franchise core veteran should be ACCUMULATE or HOLD_CORE, never SPECULATIVE
      expect(result.verdict).not.toBe("SPECULATIVE_FLYER");
      expect(["ACCUMULATE", "HOLD_CORE"]).toContain(result.verdict);
    });
  });

  describe("low confidence", () => {
    it("should return SPECULATIVE_FLYER for low confidence input", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "YEAR_2",
        temperature: "NEUTRAL",
        volatility: "MEDIUM",
        risk: "MEDIUM",
        horizon: "SHORT",
        confidence: "LOW",
        playerName: "Unknown Youngster",
      }));
      // Low confidence early-career player → SPECULATIVE_FLYER
      expect(result.verdict).toBe("SPECULATIVE_FLYER");
    });
  });

  describe("retired HOF player", () => {
    it("should return ACCUMULATE or HOLD_CORE for retired HOF", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "RETIRED_HOF",
        temperature: "NEUTRAL",
        volatility: "LOW",
        risk: "LOW",
        horizon: "LONG",
        confidence: "MEDIUM",
        playerName: "Michael Jordan",
      }));
      expect(["ACCUMULATE", "HOLD_CORE"]).toContain(result.verdict);
    });
  });

  describe("ACCUMULATE restriction for low role stability", () => {
    it("should not ACCUMULATE when roleStabilityScore <= 55", () => {
      // Player with uncertain starter role should not get ACCUMULATE
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "YEAR_3",
        temperature: "WARM",
        volatility: "MEDIUM",
        risk: "MEDIUM",
        playerName: "Caleb Williams",
        position: "QB",
      }));
      // Caleb Williams is UNCERTAIN_STARTER (roleStability=45)
      if (result.verdict === "ACCUMULATE") {
        // If somehow accumulate, it's a bug - but the guardrail should prevent it
        expect(result.decisionDebug?.roleStabilityScore).toBeGreaterThan(55);
      }
    });
  });

  describe("franchise core protection", () => {
    it("franchise core should not get AVOID for moderate downside", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "PRIME",
        temperature: "NEUTRAL",
        volatility: "MEDIUM",
        risk: "MEDIUM",
        playerName: "Josh Allen",
        team: "Buffalo Bills",
        position: "QB",
      }));
      // Josh Allen is FRANCHISE_CORE, should be protected from AVOID
      expect(result.verdict).not.toBe("AVOID_NEW_MONEY");
      expect(result.verdict).not.toBe("SPECULATIVE_FLYER");
    });
  });

  describe("backup player evaluation", () => {
    it("backup player gets role-appropriate verdict", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "YEAR_3",
        temperature: "COOLING",
        volatility: "HIGH",
        risk: "HIGH",
        playerName: "Zach Wilson",
        position: "QB",
      }));
      // Zach Wilson is BACKUP (roleStability=25)
      // Should get a cautious verdict but not necessarily full AVOID for young player
      const cautious = [
        "HOLD_ROLE_RISK", "HOLD_INJURY_CONTINGENT",
        "SPECULATIVE_FLYER", "SPECULATIVE_SUPPRESSED",
        "AVOID_NEW_MONEY", "AVOID_STRUCTURAL",
      ];
      expect(cautious).toContain(result.verdict);
    });
  });

  describe("free agent team detection", () => {
    it("forces OUT_OF_LEAGUE for free agent team", () => {
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "PRIME",
        temperature: "NEUTRAL",
        volatility: "MEDIUM",
        risk: "HIGH",
        team: "Free Agent",
        playerName: "Some Free Agent",
      }));
      expect(result.decisionDebug?.roleTier).toBe("OUT_OF_LEAGUE");
    });
  });

  describe("posture labels", () => {
    it("ACCUMULATE maps to 'Buy' posture label", () => {
      // Create ideal conditions for ACCUMULATE
      const result = generateInvestmentCall(makeDecisionInput({
        stage: "PRIME",
        temperature: "WARM",
        volatility: "LOW",
        risk: "LOW",
        confidence: "HIGH",
        playerName: "Nikola Jokic",
        team: "Denver Nuggets",
        position: "C",
      }));
      if (result.verdict === "ACCUMULATE") {
        expect(result.postureLabel).toBe("Buy");
      }
    });
  });

  describe("position risk adjustments", () => {
    it("NFL RB in PRIME gets elevated downside risk", () => {
      const rbResult = generateInvestmentCall(makeDecisionInput({
        stage: "PRIME",
        position: "RB",
        team: "Dallas Cowboys",
        sport: "NFL",
        playerName: "Some RB",
      }));
      const wrResult = generateInvestmentCall(makeDecisionInput({
        stage: "PRIME",
        position: "WR",
        team: "Dallas Cowboys",
        sport: "NFL",
        playerName: "Some WR",
      }));
      // RB should have higher downside risk than WR at same stage
      expect(rbResult.decisionDebug!.downsideRiskScore).toBeGreaterThan(
        wrResult.decisionDebug!.downsideRiskScore
      );
    });
  });
});
