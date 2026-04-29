import { describe, it, expect } from "vitest";
import {
  classifyPlayer,
  getExposureRecommendations,
  type ClassificationInput,
  type ClassificationOutput,
} from "../playerClassificationEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

function makeClassificationInput(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    playerName: "Test Player",
    sport: "football",
    position: "WR",
    team: "Dallas Cowboys",
    rookieYear: CURRENT_YEAR - 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyPlayer
// ---------------------------------------------------------------------------

describe("classifyPlayer", () => {
  it("returns all required fields", () => {
    const result = classifyPlayer(makeClassificationInput());
    expect(result).toHaveProperty("stage");
    expect(result).toHaveProperty("baseTemperature");
    expect(result).toHaveProperty("baseVolatility");
    expect(result).toHaveProperty("baseRisk");
    expect(result).toHaveProperty("baseHorizon");
  });

  describe("career stage inference", () => {
    it("ROOKIE: rookieYear = current year", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR,
      }));
      expect(result.stage).toBe("ROOKIE");
    });

    it("YEAR_2: rookieYear = current year - 1", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 1,
      }));
      expect(result.stage).toBe("YEAR_2");
    });

    it("YEAR_3: rookieYear = current year - 2", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 2,
      }));
      expect(result.stage).toBe("YEAR_3");
    });

    it("YEAR_4: rookieYear = current year - 3", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 3,
      }));
      expect(result.stage).toBe("YEAR_4");
    });

    it("PRIME: rookieYear = current year - 5", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 5,
      }));
      expect(result.stage).toBe("PRIME");
    });

    it("VETERAN: rookieYear = 10+ years ago", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 10,
      }));
      expect(result.stage).toBe("VETERAN");
    });

    it("AGING: rookieYear = 14+ years ago", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 14,
      }));
      expect(result.stage).toBe("AGING");
    });

    it("UNKNOWN: no rookieYear provided", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: undefined,
      }));
      expect(result.stage).toBe("UNKNOWN");
    });

    it("UNKNOWN: future rookieYear", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR + 1,
      }));
      expect(result.stage).toBe("UNKNOWN");
    });

    it("uses careerStage override when provided", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "BUST",
        rookieYear: CURRENT_YEAR - 3, // Would normally be YEAR_4
      }));
      expect(result.stage).toBe("BUST");
    });
  });

  describe("BUST stage properties", () => {
    it("BUST has HIGH volatility", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "BUST",
      }));
      expect(result.baseVolatility).toBe("HIGH");
    });

    it("BUST has HIGH risk", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "BUST",
      }));
      expect(result.baseRisk).toBe("HIGH");
    });

    it("BUST has COOLING temperature", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "BUST",
      }));
      expect(result.baseTemperature).toBe("COOLING");
    });

    it("BUST has SHORT horizon", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "BUST",
      }));
      expect(result.baseHorizon).toBe("SHORT");
    });
  });

  describe("ROOKIE stage properties", () => {
    it("ROOKIE has HIGH risk", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR,
      }));
      expect(result.baseRisk).toBe("HIGH");
    });

    it("ROOKIE has SHORT horizon", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR,
      }));
      expect(result.baseHorizon).toBe("SHORT");
    });

    it("ROOKIE has HIGH volatility", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR,
      }));
      expect(result.baseVolatility).toBe("HIGH");
    });

    it("ROOKIE with upward momentum has HOT temperature", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR,
        recentMomentum: "up",
      }));
      expect(result.baseTemperature).toBe("HOT");
    });

    it("ROOKIE without momentum has WARM temperature", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR,
        recentMomentum: undefined,
      }));
      expect(result.baseTemperature).toBe("WARM");
    });
  });

  describe("VETERAN stage properties", () => {
    it("VETERAN has LONG horizon", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 11,
      }));
      expect(result.baseHorizon).toBe("LONG");
    });

    it("VETERAN without upward momentum has COOLING temperature", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 11,
        recentMomentum: "flat",
      }));
      expect(result.baseTemperature).toBe("COOLING");
    });

    it("VETERAN with upward momentum has NEUTRAL temperature", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 11,
        recentMomentum: "up",
      }));
      expect(result.baseTemperature).toBe("NEUTRAL");
    });
  });

  describe("RETIRED and RETIRED_HOF", () => {
    it("RETIRED has NEUTRAL temperature", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "RETIRED",
      }));
      expect(result.baseTemperature).toBe("NEUTRAL");
    });

    it("RETIRED has LOW volatility", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "RETIRED",
      }));
      expect(result.baseVolatility).toBe("LOW");
    });

    it("RETIRED_HOF has LOW risk", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "RETIRED_HOF",
      }));
      expect(result.baseRisk).toBe("LOW");
    });

    it("RETIRED_HOF has LONG horizon", () => {
      const result = classifyPlayer(makeClassificationInput({
        careerStage: "RETIRED_HOF",
      }));
      expect(result.baseHorizon).toBe("LONG");
    });
  });

  describe("injury adjustments", () => {
    it("injured player gets HIGH risk", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 5, // PRIME
        isInjured: true,
      }));
      expect(result.baseRisk).toBe("HIGH");
    });

    it("injured player gets HIGH volatility", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 5, // PRIME
        isInjured: true,
      }));
      expect(result.baseVolatility).toBe("HIGH");
    });
  });

  describe("news hype adjustments", () => {
    it("high news hype warms a COOLING player to NEUTRAL", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: CURRENT_YEAR - 11, // VETERAN → COOLING
        recentMomentum: "flat",
        newsHype: "high",
      }));
      expect(result.baseTemperature).toBe("NEUTRAL");
    });
  });

  describe("position and team pass-through", () => {
    it("preserves position in output", () => {
      const result = classifyPlayer(makeClassificationInput({
        position: "QB",
      }));
      expect(result.position).toBe("QB");
    });

    it("preserves team in output", () => {
      const result = classifyPlayer(makeClassificationInput({
        team: "Green Bay Packers",
      }));
      expect(result.team).toBe("Green Bay Packers");
    });

    it("preserves rookieYear in output", () => {
      const result = classifyPlayer(makeClassificationInput({
        rookieYear: 2020,
      }));
      expect(result.rookieYear).toBe(2020);
    });
  });
});

// ---------------------------------------------------------------------------
// getExposureRecommendations
// ---------------------------------------------------------------------------

describe("getExposureRecommendations", () => {
  function makeClassification(overrides: Partial<ClassificationOutput> = {}): ClassificationOutput {
    return {
      stage: "PRIME",
      position: "WR",
      team: "Dallas Cowboys",
      rookieYear: CURRENT_YEAR - 5,
      baseTemperature: "WARM",
      baseVolatility: "MEDIUM",
      baseRisk: "MEDIUM",
      baseHorizon: "MID",
      ...overrides,
    };
  }

  it("returns at least 1 recommendation", () => {
    const recs = getExposureRecommendations(
      makeClassification(),
      "football",
      "CeeDee Lamb"
    );
    expect(recs.length).toBeGreaterThanOrEqual(1);
  });

  it("returns at most 4 recommendations", () => {
    const recs = getExposureRecommendations(
      makeClassification({ stage: "ROOKIE", baseTemperature: "HOT", baseRisk: "HIGH" }),
      "football",
      "Some Hot Rookie"
    );
    expect(recs.length).toBeLessThanOrEqual(4);
  });

  it("each recommendation has tier, non-empty cardTargets, and why string", () => {
    const recs = getExposureRecommendations(
      makeClassification(),
      "football",
      "Test Player"
    );
    for (const rec of recs) {
      expect(rec.tier).toBeDefined();
      expect(["PREMIUM", "GROWTH", "CORE", "COMMON", "SPECULATIVE"]).toContain(rec.tier);
      expect(rec.cardTargets).toBeDefined();
      expect(rec.cardTargets.length).toBeGreaterThan(0);
      expect(typeof rec.why).toBe("string");
      expect(rec.why.length).toBeGreaterThan(0);
    }
  });

  it("each recommendation has liquidity, riskNote, buyerProfile, timingGuidance", () => {
    const recs = getExposureRecommendations(
      makeClassification(),
      "football",
      "Test Player"
    );
    for (const rec of recs) {
      expect(rec.liquidity).toBeDefined();
      expect(rec.riskNote).toBeDefined();
      expect(rec.buyerProfile).toBeDefined();
      expect(rec.timingGuidance).toBeDefined();
    }
  });

  describe("PRIME player with warm market", () => {
    it("includes PREMIUM and GROWTH tiers", () => {
      const recs = getExposureRecommendations(
        makeClassification({ stage: "PRIME", baseTemperature: "WARM" }),
        "football",
        "Prime WR"
      );
      const tiers = recs.map(r => r.tier);
      expect(tiers).toContain("PREMIUM");
      expect(tiers).toContain("GROWTH");
    });
  });

  describe("ROOKIE player", () => {
    it("includes GROWTH tier for rookie", () => {
      const recs = getExposureRecommendations(
        makeClassification({ stage: "ROOKIE", baseTemperature: "WARM", baseRisk: "HIGH" }),
        "football",
        "Rookie QB"
      );
      const tiers = recs.map(r => r.tier);
      expect(tiers).toContain("GROWTH");
    });
  });

  describe("COOLING market", () => {
    it("includes COMMON tier for cooling/high-risk players", () => {
      const recs = getExposureRecommendations(
        makeClassification({
          stage: "VETERAN",
          baseTemperature: "COOLING",
          baseRisk: "HIGH",
        }),
        "football",
        "Aging Vet"
      );
      const tiers = recs.map(r => r.tier);
      expect(tiers).toContain("COMMON");
    });
  });

  describe("RETIRED_HOF player", () => {
    it("includes PREMIUM tier for HOF legacy", () => {
      const recs = getExposureRecommendations(
        makeClassification({
          stage: "RETIRED_HOF",
          baseTemperature: "NEUTRAL",
          baseRisk: "LOW",
        }),
        "football",
        "HOF Legend"
      );
      const tiers = recs.map(r => r.tier);
      expect(tiers).toContain("PREMIUM");
    });
  });

  describe("sport framework selection", () => {
    it("uses basketball card targets for NBA sport", () => {
      const recs = getExposureRecommendations(
        makeClassification({ stage: "PRIME" }),
        "basketball",
        "NBA Star"
      );
      // Basketball frameworks should include basketball-specific cards
      const allTargets = recs.flatMap(r => r.cardTargets);
      const hasBasketballCard = allTargets.some(t =>
        t.includes("Prizm") || t.includes("Optic") || t.includes("Hoops")
      );
      expect(hasBasketballCard).toBe(true);
    });

    it("handles sport normalization (NBA → basketball)", () => {
      const recs = getExposureRecommendations(
        makeClassification({ stage: "PRIME" }),
        "NBA",
        "NBA Star"
      );
      expect(recs.length).toBeGreaterThanOrEqual(1);
    });

    it("handles sport normalization (NFL → football)", () => {
      const recs = getExposureRecommendations(
        makeClassification({ stage: "PRIME" }),
        "NFL",
        "NFL Star"
      );
      expect(recs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("recommendations are sorted by tier priority", () => {
    it("GROWTH comes before PREMIUM when both present", () => {
      const recs = getExposureRecommendations(
        makeClassification({ stage: "PRIME", baseTemperature: "WARM" }),
        "football",
        "Star Player"
      );
      const tiers = recs.map(r => r.tier);
      if (tiers.includes("GROWTH") && tiers.includes("PREMIUM")) {
        expect(tiers.indexOf("GROWTH")).toBeLessThan(tiers.indexOf("PREMIUM"));
      }
    });
  });

  describe("vintage framework for retired legends", () => {
    it("uses vintage cards for pre-modern era retired player", () => {
      const recs = getExposureRecommendations(
        makeClassification({
          stage: "RETIRED_HOF",
          rookieYear: 2000, // Pre-Prizm era for football
          baseTemperature: "NEUTRAL",
          baseRisk: "LOW",
        }),
        "football",
        "Vintage Legend"
      );
      // Should use vintage framework cards (Topps, Upper Deck, etc.)
      const allTargets = recs.flatMap(r => r.cardTargets);
      const hasVintageCard = allTargets.some(t =>
        t.includes("Topps") || t.includes("Upper Deck") || t.includes("Bowman") || t.includes("Fleer")
      );
      expect(hasVintageCard).toBe(true);
    });
  });
});
