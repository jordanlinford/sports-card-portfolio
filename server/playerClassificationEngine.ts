import type {
  PlayerStage,
  MarketTemperature,
  VolatilityLevel,
  RiskLevel,
  InvestmentHorizon,
  StockTier,
  LiquidityLevel,
  BuyerProfile,
  ExposureRecommendation,
} from "@shared/schema";

// Classification output from deterministic rules
export type ClassificationOutput = {
  stage: PlayerStage;
  position?: string;
  team?: string;
  rookieYear?: number;
  baseTemperature: MarketTemperature;
  baseVolatility: VolatilityLevel;
  baseRisk: RiskLevel;
  baseHorizon: InvestmentHorizon;
};

// Input signals for classification
export type ClassificationInput = {
  playerName: string;
  sport: string;
  position?: string;
  team?: string;
  rookieYear?: number;
  careerStage?: PlayerStage;
  recentMomentum?: "up" | "flat" | "down";
  newsHype?: "high" | "medium" | "low" | "none";
  isStarter?: boolean;
  isInjured?: boolean;
};

// Position premium by sport - premium positions command higher card values
const POSITION_PREMIUM: Record<string, Record<string, number>> = {
  football: {
    qb: 10,
    quarterback: 10,
    rb: 6,
    "running back": 6,
    wr: 7,
    "wide receiver": 7,
    te: 4,
    "tight end": 4,
    lb: 3,
    linebacker: 3,
    cb: 3,
    cornerback: 3,
    s: 2,
    safety: 2,
    de: 3,
    "defensive end": 3,
    dt: 2,
    "defensive tackle": 2,
    ol: 1,
    "offensive line": 1,
    k: 1,
    kicker: 1,
    p: 1,
    punter: 1,
  },
  basketball: {
    pg: 7,
    "point guard": 7,
    sg: 6,
    "shooting guard": 6,
    sf: 6,
    "small forward": 6,
    pf: 5,
    "power forward": 5,
    c: 5,
    center: 5,
    g: 6,
    guard: 6,
    f: 5,
    forward: 5,
  },
  baseball: {
    p: 5,
    pitcher: 5,
    sp: 6,
    "starting pitcher": 6,
    rp: 4,
    "relief pitcher": 4,
    c: 4,
    catcher: 4,
    "1b": 4,
    "first base": 4,
    "2b": 5,
    "second base": 5,
    ss: 6,
    shortstop: 6,
    "3b": 5,
    "third base": 5,
    of: 6,
    outfield: 6,
    outfielder: 6,
    cf: 6,
    "center field": 6,
    lf: 5,
    rf: 5,
    dh: 4,
  },
  hockey: {
    c: 7,
    center: 7,
    lw: 6,
    "left wing": 6,
    rw: 6,
    "right wing": 6,
    d: 5,
    defense: 5,
    defenseman: 5,
    g: 8,
    goalie: 8,
    goaltender: 8,
  },
  soccer: {
    st: 8,
    striker: 8,
    forward: 7,
    fw: 7,
    cam: 6,
    "attacking midfielder": 6,
    cm: 5,
    midfielder: 5,
    mf: 5,
    dm: 4,
    "defensive midfielder": 4,
    rb: 3,
    lb: 3,
    fullback: 3,
    cb: 4,
    "center back": 4,
    gk: 5,
    goalkeeper: 5,
  },
};

// Get position premium score (0-10)
function getPositionPremium(sport: string, position?: string): number {
  if (!position) return 5; // Default middle value
  const sportPositions = POSITION_PREMIUM[sport.toLowerCase()];
  if (!sportPositions) return 5;
  return sportPositions[position.toLowerCase()] ?? 5;
}

// Calculate career stage from rookie year
function inferCareerStage(rookieYear?: number, currentYear: number = new Date().getFullYear()): PlayerStage {
  if (!rookieYear) return "PRIME"; // Default assumption
  const yearsInLeague = currentYear - rookieYear;
  
  if (yearsInLeague < 0) return "PROSPECT";
  if (yearsInLeague === 0) return "ROOKIE";
  if (yearsInLeague === 1) return "YEAR_2";
  if (yearsInLeague <= 6) return "PRIME";
  if (yearsInLeague <= 12) return "VETERAN";
  return "AGING";
}

// Classify player based on deterministic rules
export function classifyPlayer(input: ClassificationInput): ClassificationOutput {
  const stage = input.careerStage || inferCareerStage(input.rookieYear);
  const positionPremium = getPositionPremium(input.sport, input.position);
  
  // Base temperature by stage + momentum
  let baseTemperature: MarketTemperature = "NEUTRAL";
  if (stage === "ROOKIE" || stage === "PROSPECT") {
    baseTemperature = input.recentMomentum === "up" ? "HOT" : "WARM";
  } else if (stage === "YEAR_2") {
    baseTemperature = input.recentMomentum === "up" ? "HOT" : 
                      input.recentMomentum === "down" ? "COOLING" : "WARM";
  } else if (stage === "PRIME") {
    baseTemperature = input.recentMomentum === "up" ? "WARM" : "NEUTRAL";
  } else if (stage === "VETERAN" || stage === "AGING") {
    baseTemperature = input.recentMomentum === "up" ? "NEUTRAL" : "COOLING";
  } else if (stage === "RETIRED" || stage === "RETIRED_HOF") {
    baseTemperature = "NEUTRAL"; // Retired players are stable
  }
  
  // Adjust for news hype
  if (input.newsHype === "high" && baseTemperature !== "HOT") {
    baseTemperature = baseTemperature === "COOLING" ? "NEUTRAL" : "WARM";
  }
  
  // Base volatility by stage
  let baseVolatility: VolatilityLevel = "MEDIUM";
  if (stage === "ROOKIE" || stage === "PROSPECT" || stage === "YEAR_2") {
    baseVolatility = "HIGH"; // Young players = volatile
  } else if (stage === "RETIRED" || stage === "RETIRED_HOF") {
    baseVolatility = "LOW"; // Retired = stable
  } else if (stage === "PRIME" && positionPremium >= 7) {
    baseVolatility = "MEDIUM"; // Elite position in prime = moderate
  }
  
  // Base risk by stage + position
  let baseRisk: RiskLevel = "MEDIUM";
  if (stage === "ROOKIE" || stage === "PROSPECT") {
    baseRisk = "HIGH"; // Unproven
  } else if (stage === "YEAR_2") {
    baseRisk = "HIGH"; // Sophomore slump risk
  } else if (stage === "PRIME" && positionPremium >= 6) {
    baseRisk = "MEDIUM"; // Established but market can shift
  } else if (stage === "RETIRED_HOF") {
    baseRisk = "LOW"; // Legacy locked in
  } else if (stage === "AGING") {
    baseRisk = "HIGH"; // Decline risk
  }
  
  // Adjust for injury
  if (input.isInjured) {
    baseRisk = "HIGH";
    baseVolatility = "HIGH";
  }
  
  // Base horizon by stage
  let baseHorizon: InvestmentHorizon = "MID";
  if (stage === "ROOKIE" || stage === "PROSPECT" || stage === "YEAR_2") {
    baseHorizon = "SHORT"; // Quick moves based on performance
  } else if (stage === "PRIME") {
    baseHorizon = "MID";
  } else if (stage === "VETERAN" || stage === "AGING") {
    baseHorizon = "LONG"; // Waiting for HOF narrative
  } else if (stage === "RETIRED" || stage === "RETIRED_HOF") {
    baseHorizon = "LONG";
  }
  
  return {
    stage,
    position: input.position,
    team: input.team,
    rookieYear: input.rookieYear,
    baseTemperature,
    baseVolatility,
    baseRisk,
    baseHorizon,
  };
}

// Card exposure framework by sport
type SportExposureFramework = {
  premium: string[];
  growth: string[];
  core: string[];
  common: string[];
  speculative: string[];
};

const SPORT_FRAMEWORKS: Record<string, SportExposureFramework> = {
  football: {
    premium: [
      "On-card autograph rookie",
      "Numbered parallels /99 or lower",
      "National Treasures RPA",
      "Prizm Gold /10",
      "Optic Downtown",
      "Contenders Championship Ticket Auto",
    ],
    growth: [
      "Prizm Silver Rookie",
      "Optic Rated Rookie Holo",
      "Select Silver Rookie",
      "Mosaic Silver Rookie",
      "Donruss Optic Holo",
    ],
    core: [
      "Prizm Base Rookie",
      "Optic Rated Rookie Base",
      "Donruss Rated Rookie",
      "Select Base Rookie",
      "Panini Certified",
    ],
    common: [
      "Donruss Base Rookie",
      "Score Base Rookie",
      "Prestige Base",
      "Panini Chronicles",
    ],
    speculative: [
      "Wild Card releases",
      "Leaf products",
      "Sage Hit rookies",
      "Off-brand parallels",
      "Insert sets from budget brands",
    ],
  },
  basketball: {
    premium: [
      "On-card autograph rookie",
      "Numbered parallels /99 or lower",
      "National Treasures RPA",
      "Prizm Gold /10",
      "Fleer autographs",
      "Immaculate Collection",
    ],
    growth: [
      "Prizm Silver Rookie",
      "Optic Rated Rookie Holo",
      "Select Silver Rookie",
      "Mosaic Silver Rookie",
      "NBA Hoops Premium Stock",
    ],
    core: [
      "Prizm Base Rookie",
      "Optic Rated Rookie Base",
      "Donruss Rated Rookie",
      "Select Base Rookie",
      "Revolution",
    ],
    common: [
      "NBA Hoops Base Rookie",
      "Donruss Base Rookie",
      "Chronicles Base",
      "Court Kings Base",
    ],
    speculative: [
      "Panini Instant",
      "Contenders Draft Picks",
      "International league cards",
      "Retail exclusives",
    ],
  },
  baseball: {
    premium: [
      "On-card autograph rookie",
      "Bowman Chrome 1st Auto",
      "Numbered parallels /99 or lower",
      "Topps Chrome Gold /50",
      "Sapphire Edition",
      "Transcendent Collection",
    ],
    growth: [
      "Bowman Chrome 1st Refractor",
      "Topps Chrome Rookie Refractor",
      "Bowman 1st Paper",
      "Stadium Club Chrome",
    ],
    core: [
      "Topps Series 1/2 Base Rookie",
      "Topps Chrome Base Rookie",
      "Bowman Base",
      "Topps Update Rookie",
    ],
    common: [
      "Topps Base",
      "Donruss Base",
      "Panini Prizm Base",
      "Big League Base",
    ],
    speculative: [
      "Minor league autos",
      "Panini products",
      "Pre-debut cards",
      "International league",
    ],
  },
  hockey: {
    premium: [
      "Upper Deck Young Guns Auto",
      "The Cup RPA",
      "Numbered parallels /99 or lower",
      "SP Authentic Future Watch Auto",
      "Clear Cut Rookie Auto",
    ],
    growth: [
      "Upper Deck Young Guns",
      "SP Authentic Future Watch",
      "O-Pee-Chee Platinum",
      "Synergy FX",
    ],
    core: [
      "Upper Deck Series 1/2 Rookie",
      "O-Pee-Chee Rookie",
      "MVP Rookie",
    ],
    common: [
      "Upper Deck Base",
      "O-Pee-Chee Base",
      "MVP Base",
    ],
    speculative: [
      "Parkhurst rookies",
      "Artifacts",
      "Team sets",
      "AHL/Minor league",
    ],
  },
  soccer: {
    premium: [
      "Topps Chrome UCL Auto",
      "Panini Prizm World Cup Auto",
      "National Treasures Soccer",
      "Immaculate Collection",
      "Numbered /99 or lower",
    ],
    growth: [
      "Topps Chrome UCL Refractor",
      "Panini Prizm World Cup Silver",
      "Topps Finest Refractor",
      "Donruss Optic Soccer",
    ],
    core: [
      "Topps Chrome UCL Base",
      "Panini Prizm World Cup Base",
      "Topps Finest Base",
      "Donruss Soccer Base",
    ],
    common: [
      "Topps UCL Base",
      "Panini Adrenalyn",
      "Match Attax",
    ],
    speculative: [
      "Panini Mosaic Soccer",
      "Leaf cards",
      "Regional league cards",
      "Pre-pro cards",
    ],
  },
};

// Get exposure recommendations based on player classification
export function getExposureRecommendations(
  classification: ClassificationOutput,
  sport: string,
  playerName: string
): ExposureRecommendation[] {
  const framework = SPORT_FRAMEWORKS[sport.toLowerCase()] || SPORT_FRAMEWORKS.football;
  const recommendations: ExposureRecommendation[] = [];
  const positionPremium = getPositionPremium(sport, classification.position);
  
  const { stage, baseTemperature, baseRisk } = classification;
  
  // Premium tier - for hot/established players at premium positions
  if (
    (stage === "PRIME" || stage === "RETIRED_HOF") ||
    (baseTemperature === "HOT" && positionPremium >= 7) ||
    (stage === "ROOKIE" && positionPremium >= 8)
  ) {
    recommendations.push({
      tier: "PREMIUM",
      cardTargets: framework.premium.slice(0, 3),
      why: stage === "RETIRED_HOF" 
        ? `${playerName}'s legacy is locked in. Premium cards are long-term holds.`
        : stage === "ROOKIE"
        ? `High draft capital at a premium position creates immediate blue-chip demand.`
        : `Established production at an elite position commands premium card values.`,
      liquidity: positionPremium >= 8 ? "HIGH" : "MEDIUM",
      riskNote: stage === "ROOKIE" 
        ? "Rookie bust risk exists. Size positions appropriately."
        : baseRisk === "HIGH" 
        ? "Injury or decline could impact values." 
        : "Established value, lower risk profile.",
      buyerProfile: "INVESTOR",
    });
  }
  
  // Growth tier - main recommendation for most scenarios
  if (
    stage === "ROOKIE" || 
    stage === "YEAR_2" || 
    (stage === "PRIME" && baseTemperature !== "COOLING")
  ) {
    recommendations.push({
      tier: "GROWTH",
      cardTargets: framework.growth.slice(0, 3),
      why: stage === "ROOKIE"
        ? `Flagship silver parallels offer best risk-adjusted exposure to ${playerName}'s upside.`
        : stage === "YEAR_2"
        ? `Year 2 breakout potential makes growth-tier cards attractive entry points.`
        : `Prime production supports steady appreciation in flagship parallels.`,
      liquidity: "HIGH",
      riskNote: stage === "ROOKIE" || stage === "YEAR_2"
        ? "Young player volatility. Watch performance closely."
        : "Market can shift on injury news or role changes.",
      buyerProfile: stage === "ROOKIE" ? "FLIPPER" : "INVESTOR",
    });
  }
  
  // Core tier - solid for any stage except cooling/avoid
  if (baseTemperature !== "COOLING" && baseRisk !== "HIGH") {
    recommendations.push({
      tier: "CORE",
      cardTargets: framework.core.slice(0, 3),
      why: `Solid brand recognition with lower entry cost. Good for building position.`,
      liquidity: "HIGH",
      riskNote: "Standard market risk. Easy to exit if needed.",
      buyerProfile: "COLLECTOR",
    });
  }
  
  // Common tier - budget entry or cooling players
  if (baseTemperature === "COOLING" || baseRisk === "HIGH" || stage === "AGING") {
    recommendations.push({
      tier: "COMMON",
      cardTargets: framework.common.slice(0, 2),
      why: baseTemperature === "COOLING"
        ? `Lower entry point while market cools. Reduces downside exposure.`
        : `Budget-friendly entry for speculative position.`,
      liquidity: "HIGH",
      riskNote: "Limited upside but minimal capital at risk.",
      buyerProfile: "BUDGET",
    });
  }
  
  // Speculative tier - only for specific scenarios
  if (
    stage === "PROSPECT" ||
    (stage === "ROOKIE" && positionPremium <= 4) ||
    baseTemperature === "HOT"
  ) {
    recommendations.push({
      tier: "SPECULATIVE",
      cardTargets: framework.speculative.slice(0, 2),
      why: stage === "PROSPECT"
        ? `Pre-draft speculation. High risk, potential high reward.`
        : baseTemperature === "HOT"
        ? `Lottery tickets on off-brand cards can 10x if hype continues.`
        : `Lower-profile position limits mainstream appeal. Niche plays only.`,
      liquidity: "LOW",
      riskNote: "Difficult to sell. Only allocate what you can lose.",
      buyerProfile: "FLIPPER",
    });
  }
  
  // Sort by tier priority
  const tierOrder: StockTier[] = ["GROWTH", "PREMIUM", "CORE", "COMMON", "SPECULATIVE"];
  recommendations.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
  
  return recommendations.slice(0, 4); // Max 4 recommendations
}

// Export framework for testing/debugging
export { SPORT_FRAMEWORKS, POSITION_PREMIUM };
