import { db } from "./db";
import { cards, displayCases, playerWatchlist, portfolioSnapshots, nextBuys, cardOutlooks, hiddenGems, dismissedRecommendations } from "@shared/schema";
import type { 
  PortfolioProfile, 
  PortfolioExposures, 
  RiskSignal, 
  PortfolioSnapshot, 
  InsertPortfolioSnapshot,
  RecommendedAction
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { fetchPlayerNews } from "./outlookEngine";

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

type CareerStage = "Rookie" | "Rising" | "Prime" | "Decline" | "Retired" | "Unknown";

function inferCareerStage(card: any): CareerStage {
  // Check legacyTier FIRST - this is the user-entered career stage from edit modal
  if (card.legacyTier) {
    const tier = card.legacyTier.toUpperCase();
    // Handle standard internal enum values
    if (tier === "PROSPECT") return "Rookie";
    if (tier === "RISING_STAR") return "Rising";
    if (tier === "STAR" || tier === "SUPERSTAR") return "Prime";
    if (tier === "AGING_VET" || tier === "BUST") return "Decline";
    if (tier === "RETIRED" || tier === "HOF" || tier === "LEGEND_DECEASED") return "Retired";
    // Handle legacy/alternate values
    if (tier === "ROOKIE") return "Rookie";
    if (tier === "RISING" || tier === "BREAKOUT") return "Rising";
    if (tier === "PRIME" || tier === "ELITE" || tier === "PEAK") return "Prime";
    if (tier === "VETERAN" || tier === "DECLINE" || tier === "DECLINING") return "Decline";
    if (tier === "LEGEND") return "Retired";
  }
  // Fall back to AI-detected career stage override
  if (card.careerStageOverride) {
    const override = card.careerStageOverride.toUpperCase();
    if (override === "ROOKIE" || override === "PROSPECT") return "Rookie";
    if (override === "RISING" || override === "RISING_STAR") return "Rising";
    if (override === "PRIME" || override === "ELITE" || override === "STAR" || override === "SUPERSTAR") return "Prime";
    if (override === "VETERAN" || override === "DECLINE" || override === "AGING_VET" || override === "BUST") return "Decline";
    if (override === "RETIRED" || override === "LEGEND" || override === "HOF" || override === "LEGEND_DECEASED") return "Retired";
  }
  // Fall back to AI auto-detected career stage
  if (card.careerStageAuto) {
    const auto = card.careerStageAuto.toUpperCase();
    if (auto === "ROOKIE" || auto === "PROSPECT") return "Rookie";
    if (auto === "RISING" || auto === "RISING_STAR") return "Rising";
    if (auto === "PRIME" || auto === "ELITE" || auto === "STAR" || auto === "SUPERSTAR") return "Prime";
    if (auto === "VETERAN" || auto === "DECLINE" || auto === "AGING_VET" || auto === "BUST") return "Decline";
    if (auto === "RETIRED" || auto === "LEGEND" || auto === "HOF" || auto === "LEGEND_DECEASED") return "Retired";
  }
  // Fall back to isRookie flag
  if (card.isRookie) return "Rookie";
  // Fall back to age-based inference
  if (card.playerAge) {
    if (card.playerAge <= 24) return "Rising";
    if (card.playerAge <= 30) return "Prime";
    if (card.playerAge <= 35) return "Decline";
    return "Retired";
  }
  return "Unknown";
}

function inferTeamMarketSize(teamMarket: string | null): "Large" | "Mid" | "Small" | "Unknown" {
  if (!teamMarket) return "Unknown";
  const market = teamMarket.toLowerCase();
  if (market === "large" || market === "big") return "Large";
  if (market === "mid" || market === "medium") return "Mid";
  if (market === "small") return "Small";
  return "Unknown";
}

// NBA Teams
const NBA_TEAMS = [
  "Hawks", "Celtics", "Nets", "Hornets", "Bulls", "Cavaliers", "Mavericks", "Nuggets",
  "Pistons", "Warriors", "Rockets", "Pacers", "Clippers", "Lakers", "Grizzlies", "Heat",
  "Bucks", "Timberwolves", "Pelicans", "Knicks", "Thunder", "Magic", "76ers", "Suns",
  "Trail Blazers", "Blazers", "Kings", "Spurs", "Raptors", "Jazz", "Wizards",
  // Full names for better matching
  "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls",
  "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets", "Detroit Pistons",
  "Golden State Warriors", "Houston Rockets", "Indiana Pacers", "LA Clippers", "Los Angeles Clippers",
  "LA Lakers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat", "Milwaukee Bucks",
  "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks", "Oklahoma City Thunder",
  "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns", "Portland Trail Blazers",
  "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors", "Utah Jazz", "Washington Wizards"
];

// NFL Teams
const NFL_TEAMS = [
  "Cardinals", "Falcons", "Ravens", "Bills", "Panthers", "Bears", "Bengals", "Browns",
  "Cowboys", "Broncos", "Lions", "Packers", "Texans", "Colts", "Jaguars", "Chiefs",
  "Raiders", "Chargers", "Rams", "Dolphins", "Vikings", "Patriots", "Saints", "Giants",
  "Jets", "Eagles", "Steelers", "49ers", "Seahawks", "Buccaneers", "Titans", "Commanders",
  // Full names
  "Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills",
  "Carolina Panthers", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns",
  "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers",
  "Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Kansas City Chiefs",
  "Las Vegas Raiders", "Los Angeles Chargers", "Los Angeles Rams", "Miami Dolphins",
  "Minnesota Vikings", "New England Patriots", "New Orleans Saints", "New York Giants",
  "New York Jets", "Philadelphia Eagles", "Pittsburgh Steelers", "San Francisco 49ers",
  "Seattle Seahawks", "Tampa Bay Buccaneers", "Tennessee Titans", "Washington Commanders"
];

// MLB Teams
const MLB_TEAMS = [
  "Diamondbacks", "Braves", "Orioles", "Red Sox", "Cubs", "White Sox", "Reds", "Guardians",
  "Rockies", "Tigers", "Astros", "Royals", "Angels", "Dodgers", "Marlins", "Brewers",
  "Twins", "Mets", "Yankees", "Athletics", "Phillies", "Pirates", "Padres", "Giants",
  "Mariners", "Cardinals", "Rays", "Rangers", "Blue Jays", "Nationals"
];

// NHL Teams
const NHL_TEAMS = [
  "Ducks", "Coyotes", "Bruins", "Sabres", "Flames", "Hurricanes", "Blackhawks", "Avalanche",
  "Blue Jackets", "Stars", "Red Wings", "Oilers", "Panthers", "Kings", "Wild", "Canadiens",
  "Predators", "Devils", "Islanders", "Rangers", "Senators", "Flyers", "Penguins", "Sharks",
  "Kraken", "Blues", "Lightning", "Maple Leafs", "Canucks", "Golden Knights", "Capitals", "Jets"
];

const ALL_TEAMS = [...NBA_TEAMS, ...NFL_TEAMS, ...MLB_TEAMS, ...NHL_TEAMS];

// Maps team nicknames to their full canonical names for reliable matching
const TEAM_CANONICAL_NAMES: Record<string, string> = {
  // NBA
  "Hawks": "Atlanta Hawks", "Celtics": "Boston Celtics", "Nets": "Brooklyn Nets",
  "Hornets": "Charlotte Hornets", "Bulls": "Chicago Bulls", "Cavaliers": "Cleveland Cavaliers",
  "Mavericks": "Dallas Mavericks", "Nuggets": "Denver Nuggets", "Pistons": "Detroit Pistons",
  "Warriors": "Golden State Warriors", "Rockets": "Houston Rockets", "Pacers": "Indiana Pacers",
  "Clippers": "LA Clippers", "Lakers": "LA Lakers", "Grizzlies": "Memphis Grizzlies",
  "Heat": "Miami Heat", "Bucks": "Milwaukee Bucks", "Timberwolves": "Minnesota Timberwolves",
  "Pelicans": "New Orleans Pelicans", "Knicks": "New York Knicks", "Thunder": "Oklahoma City Thunder",
  "Magic": "Orlando Magic", "76ers": "Philadelphia 76ers", "Suns": "Phoenix Suns",
  "Trail Blazers": "Portland Trail Blazers", "Blazers": "Portland Trail Blazers",
  "Kings": "Sacramento Kings", "Spurs": "San Antonio Spurs", "Raptors": "Toronto Raptors",
  "Jazz": "Utah Jazz", "Wizards": "Washington Wizards",
  // NFL
  "Cardinals": "Arizona Cardinals", "Falcons": "Atlanta Falcons", "Ravens": "Baltimore Ravens",
  "Bills": "Buffalo Bills", "Panthers": "Carolina Panthers", "Bears": "Chicago Bears",
  "Bengals": "Cincinnati Bengals", "Browns": "Cleveland Browns", "Cowboys": "Dallas Cowboys",
  "Broncos": "Denver Broncos", "Lions": "Detroit Lions", "Packers": "Green Bay Packers",
  "Texans": "Houston Texans", "Colts": "Indianapolis Colts", "Jaguars": "Jacksonville Jaguars",
  "Chiefs": "Kansas City Chiefs", "Raiders": "Las Vegas Raiders", "Chargers": "LA Chargers",
  "Rams": "LA Rams", "Dolphins": "Miami Dolphins", "Vikings": "Minnesota Vikings",
  "Patriots": "New England Patriots", "Saints": "New Orleans Saints", "Giants": "New York Giants",
  "Jets": "New York Jets", "Eagles": "Philadelphia Eagles", "Steelers": "Pittsburgh Steelers",
  "49ers": "San Francisco 49ers", "Seahawks": "Seattle Seahawks", "Buccaneers": "Tampa Bay Buccaneers",
  "Titans": "Tennessee Titans", "Commanders": "Washington Commanders",
};

function extractTeamFromText(text: string | null): string | null {
  if (!text) return null;
  const textUpper = text.toUpperCase();
  
  // Check full team names first (more specific) - return full canonical name
  for (const team of ALL_TEAMS) {
    if (textUpper.includes(team.toUpperCase())) {
      // If it's already a full name (has space), return it
      if (team.includes(" ")) {
        return team;
      }
      // Otherwise, convert nickname to canonical name
      return TEAM_CANONICAL_NAMES[team] || team;
    }
  }
  return null;
}

// Normalize any team string (nickname or full name) to canonical form
function normalizeTeamName(teamStr: string | null): string | null {
  if (!teamStr) return null;
  
  // Check if it's already a canonical name
  if (Object.values(TEAM_CANONICAL_NAMES).includes(teamStr)) {
    return teamStr;
  }
  
  // Try to find it as a nickname
  const normalized = TEAM_CANONICAL_NAMES[teamStr];
  if (normalized) return normalized;
  
  // Try case-insensitive match
  const teamUpper = teamStr.toUpperCase();
  for (const [nickname, canonical] of Object.entries(TEAM_CANONICAL_NAMES)) {
    if (nickname.toUpperCase() === teamUpper || canonical.toUpperCase() === teamUpper) {
      return canonical;
    }
  }
  
  return teamStr;
}

// Check if two team strings match (handles nicknames vs canonical names)
function teamsMatch(team1: string | null, team2: string | null): boolean {
  if (!team1 || !team2) return false;
  
  const canonical1 = normalizeTeamName(team1);
  const canonical2 = normalizeTeamName(team2);
  
  if (canonical1 && canonical2 && canonical1 === canonical2) return true;
  
  // Fallback to substring matching for edge cases
  const t1Lower = team1.toLowerCase();
  const t2Lower = team2.toLowerCase();
  return t1Lower.includes(t2Lower) || t2Lower.includes(t1Lower);
}

// Comprehensive player-to-team mapping for reliable team detection
// This is more reliable than parsing titles which often don't contain team names
const PLAYER_TEAM_MAP: Record<string, string> = {
  // Utah Jazz
  "lauri markkanen": "Utah Jazz",
  "walker kessler": "Utah Jazz",
  "keyonte george": "Utah Jazz",
  "collin sexton": "Utah Jazz",
  "jordan clarkson": "Utah Jazz",
  "john collins": "Utah Jazz",
  "john stockton": "Utah Jazz",
  "karl malone": "Utah Jazz",
  "donovan mitchell": "Utah Jazz", // Former Jazz
  "rudy gobert": "Utah Jazz", // Former Jazz (still counts for collection theme)
  
  // Boston Celtics
  "jayson tatum": "Boston Celtics",
  "jaylen brown": "Boston Celtics",
  "derrick white": "Boston Celtics",
  "jrue holiday": "Boston Celtics",
  "kristaps porzingis": "Boston Celtics",
  
  // LA Lakers
  "lebron james": "LA Lakers",
  "anthony davis": "LA Lakers",
  "austin reaves": "LA Lakers",
  "d'angelo russell": "LA Lakers",
  "kobe bryant": "LA Lakers",
  "magic johnson": "LA Lakers",
  
  // Golden State Warriors
  "stephen curry": "Golden State Warriors",
  "klay thompson": "Golden State Warriors",
  "draymond green": "Golden State Warriors",
  
  // San Antonio Spurs
  "victor wembanyama": "San Antonio Spurs",
  "devin vassell": "San Antonio Spurs",
  "tim duncan": "San Antonio Spurs",
  
  // Oklahoma City Thunder
  "shai gilgeous-alexander": "Oklahoma City Thunder",
  "chet holmgren": "Oklahoma City Thunder",
  "jalen williams": "Oklahoma City Thunder",
  
  // Minnesota Timberwolves
  "anthony edwards": "Minnesota Timberwolves",
  "karl-anthony towns": "Minnesota Timberwolves",
  
  // Indiana Pacers
  "tyrese haliburton": "Indiana Pacers",
  "pascal siakam": "Indiana Pacers",
  
  // Phoenix Suns
  "kevin durant": "Phoenix Suns",
  "devin booker": "Phoenix Suns",
  "bradley beal": "Phoenix Suns",
  
  // Dallas Mavericks
  "luka doncic": "Dallas Mavericks",
  "kyrie irving": "Dallas Mavericks",
  
  // Denver Nuggets
  "nikola jokic": "Denver Nuggets",
  "jamal murray": "Denver Nuggets",
  
  // Milwaukee Bucks
  "giannis antetokounmpo": "Milwaukee Bucks",
  "damian lillard": "Milwaukee Bucks",
  
  // Philadelphia 76ers
  "joel embiid": "Philadelphia 76ers",
  "tyrese maxey": "Philadelphia 76ers",
  
  // Miami Heat
  "jimmy butler": "Miami Heat",
  "bam adebayo": "Miami Heat",
  
  // Chicago Bulls
  "michael jordan": "Chicago Bulls",
  "zach lavine": "Chicago Bulls",
  "demar derozan": "Chicago Bulls",
  
  // Cleveland Cavaliers
  "evan mobley": "Cleveland Cavaliers",
  "darius garland": "Cleveland Cavaliers",
};

// Player to team lookup cache (populated from hidden gems and other sources)
const playerTeamCache: Record<string, string> = {};

async function lookupPlayerTeam(playerName: string): Promise<string | null> {
  if (!playerName) return null;
  
  const normalizedName = playerName.toLowerCase().trim();
  
  // Check hardcoded mapping first (most reliable)
  if (PLAYER_TEAM_MAP[normalizedName]) {
    return PLAYER_TEAM_MAP[normalizedName];
  }
  
  // Check cache
  const cachedTeam = playerTeamCache[normalizedName];
  if (cachedTeam) return cachedTeam;
  
  try {
    // Try to find team from hidden gems and normalize to canonical name
    const [gem] = await db
      .select({ team: hiddenGems.team })
      .from(hiddenGems)
      .where(sql`LOWER(${hiddenGems.playerName}) = LOWER(${playerName})`)
      .limit(1);
    
    if (gem?.team) {
      // Normalize team to canonical name
      const canonicalTeam = TEAM_CANONICAL_NAMES[gem.team] || gem.team;
      playerTeamCache[normalizedName] = canonicalTeam;
      return canonicalTeam;
    }
  } catch (error) {
    // Ignore lookup errors
  }
  
  return null;
}

function normalizeGrader(grader: string | null, grade: string | null = null): string {
  // First check the grader field
  if (grader) {
    const normalized = grader.toUpperCase().trim();
    if (normalized.includes("PSA")) return "PSA";
    if (normalized.includes("BGS") || normalized.includes("BECKETT")) return "BGS";
    if (normalized.includes("SGC")) return "SGC";
    if (normalized.includes("CGC")) return "CGC";
    if (normalized.includes("HGA")) return "HGA";
    if (normalized.includes("CSG")) return "CSG";
    if (normalized !== "RAW" && normalized !== "") return "Other";
  }
  // If no grader field, try to parse it from the grade field (e.g., "PSA 10", "BGS 9.5")
  if (grade) {
    const gradeUpper = grade.toUpperCase().trim();
    if (gradeUpper.startsWith("PSA") || gradeUpper.includes("PSA ")) return "PSA";
    if (gradeUpper.startsWith("BGS") || gradeUpper.includes("BGS ") || gradeUpper.includes("BECKETT")) return "BGS";
    if (gradeUpper.startsWith("SGC") || gradeUpper.includes("SGC ")) return "SGC";
    if (gradeUpper.startsWith("CGC") || gradeUpper.includes("CGC ")) return "CGC";
    if (gradeUpper.startsWith("HGA") || gradeUpper.includes("HGA ")) return "HGA";
    if (gradeUpper.startsWith("CSG") || gradeUpper.includes("CSG ")) return "CSG";
    // Check if grade looks like a numeric grade (indicates graded card)
    if (/^\d+(\.\d+)?$/.test(gradeUpper) || /^(GEM\s*)?MINT/.test(gradeUpper)) return "Other";
  }
  return "Raw";
}

export async function buildPortfolioProfile(userId: string): Promise<PortfolioProfile> {
  const userCards = await db
    .select({
      id: cards.id,
      title: cards.title,
      playerName: cards.playerName,
      sport: cards.sport,
      position: cards.position,
      estimatedValue: cards.estimatedValue,
      grader: cards.grader,
      grade: cards.grade,
      isRookie: cards.isRookie,
      playerAge: cards.playerAge,
      teamMarketSize: cards.teamMarketSize,
      salesLast30Days: cards.salesLast30Days,
      displayCaseId: cards.displayCaseId,
      legacyTier: cards.legacyTier,
      // Include AI-detected career stages as fallback
      careerStageOverride: cardOutlooks.careerStageOverride,
      careerStageAuto: cardOutlooks.careerStageAuto,
    })
    .from(cards)
    .innerJoin(displayCases, eq(cards.displayCaseId, displayCases.id))
    .leftJoin(cardOutlooks, eq(cards.id, cardOutlooks.cardId))
    .where(eq(displayCases.userId, userId));

  const cardCount = userCards.length;
  const totalValue = userCards.reduce((sum, card) => sum + (card.estimatedValue || 0), 0);

  const sports: Record<string, number> = {};
  const positions: Record<string, number> = {};
  const careerStages: Record<string, number> = {};
  const teamMarkets: Record<string, number> = {};
  const grades: Record<string, number> = {};
  const playerValues: Record<string, number> = {};
  const teamValues: Record<string, number> = {};
  const playersNeedingTeamLookup: Array<{ playerName: string; value: number }> = [];
  
  let highLiquidityCount = 0;
  let lowLiquidityCount = 0;

  const notableHoldings: PortfolioProfile["notableHoldings"] = [];

  for (const card of userCards) {
    const value = card.estimatedValue || 0;
    const weight = totalValue > 0 ? value / totalValue : 0;

    const sport = card.sport || "Unknown";
    sports[sport] = (sports[sport] || 0) + weight;

    const position = card.position || "Unknown";
    positions[position] = (positions[position] || 0) + weight;

    const stage = inferCareerStage(card);
    careerStages[stage] = (careerStages[stage] || 0) + weight;

    const market = inferTeamMarketSize(card.teamMarketSize);
    teamMarkets[market] = (teamMarkets[market] || 0) + weight;

    const grader = normalizeGrader(card.grader, card.grade);
    grades[grader] = (grades[grader] || 0) + weight;

    const playerName = card.playerName || "Unknown";
    playerValues[playerName] = (playerValues[playerName] || 0) + value;

    // Extract team from card title and add to team values
    const detectedTeam = extractTeamFromText(card.title);
    if (detectedTeam) {
      teamValues[detectedTeam] = (teamValues[detectedTeam] || 0) + value;
    }
    
    // Track players for later team lookup if title didn't contain team
    if (!detectedTeam && playerName !== "Unknown") {
      playersNeedingTeamLookup.push({ playerName, value });
    }

    if (card.salesLast30Days !== null) {
      if (card.salesLast30Days >= 10) highLiquidityCount++;
      else if (card.salesLast30Days <= 2) lowLiquidityCount++;
    }

    if (value >= 100) {
      notableHoldings.push({
        cardId: card.id,
        title: card.title,
        estValue: value,
        player: playerName,
        position: card.position || "Unknown",
        stage: stage,
      });
    }
  }

  // Aggregate team lookups by unique player (not card) to capture full collection value
  const playerValueTotals: Record<string, number> = {};
  for (const { playerName, value } of playersNeedingTeamLookup) {
    playerValueTotals[playerName] = (playerValueTotals[playerName] || 0) + value;
  }
  
  // Look up teams for all unique players to ensure accurate team theme detection
  // Sort by combined value so most valuable players get looked up first (for cache efficiency)
  const uniquePlayersToLookup = Object.entries(playerValueTotals)
    .sort(([, a], [, b]) => b - a);
  
  for (const [playerName, totalValue] of uniquePlayersToLookup) {
    const team = await lookupPlayerTeam(playerName);
    if (team) {
      teamValues[team] = (teamValues[team] || 0) + totalValue;
    }
  }

  notableHoldings.sort((a, b) => b.estValue - a.estValue);

  const topPlayers = Object.entries(playerValues)
    .map(([player, value]) => ({
      player,
      value,
      pct: totalValue > 0 ? value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topTeams = Object.entries(teamValues)
    .map(([team, value]) => ({
      team,
      pct: totalValue > 0 ? value / totalValue : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const weakSpots: PortfolioProfile["weakSpots"] = [];
  
  const qbExposure = positions["QB"] || 0;
  const wrExposure = positions["WR"] || 0;
  const primeExposure = careerStages["Prime"] || 0;
  
  if (wrExposure < 0.15) {
    weakSpots.push({
      label: "Low WR exposure",
      detail: `Only ${Math.round(wrExposure * 100)}% of value in WRs`,
    });
  }
  if (primeExposure < 0.20) {
    weakSpots.push({
      label: "Limited prime player exposure",
      detail: `Only ${Math.round(primeExposure * 100)}% in prime career players`,
    });
  }

  return {
    portfolioValueEstimate: totalValue,
    cardCount,
    sports,
    positions,
    careerStage: careerStages,
    teamMarket: teamMarkets,
    grades,
    concentration: {
      topPlayers,
      topTeams,
    },
    liquiditySignals: {
      highLiquidityPct: cardCount > 0 ? highLiquidityCount / cardCount : 0,
      lowLiquidityPct: cardCount > 0 ? lowLiquidityCount / cardCount : 0,
    },
    notableHoldings: notableHoldings.slice(0, 10),
    weakSpots,
  };
}

export function generateRiskSignals(profile: PortfolioProfile): RiskSignal[] {
  const signals: RiskSignal[] = [];

  const topPlayer = profile.concentration.topPlayers[0];
  if (topPlayer && topPlayer.pct > 0.15) {
    signals.push({
      code: "HIGH_PLAYER_CONCENTRATION",
      label: "High Player Concentration",
      severity: topPlayer.pct > 0.25 ? "high" : "med",
      explanation: `${topPlayer.player} represents ${Math.round(topPlayer.pct * 100)}% of your portfolio value. Consider diversifying.`,
      affectedCardIds: profile.notableHoldings
        .filter(h => h.player === topPlayer.player)
        .map(h => h.cardId),
    });
  }

  const qbExposure = profile.positions["QB"] || 0;
  if (qbExposure > 0.55) {
    signals.push({
      code: "HIGH_POSITION_CONCENTRATION",
      label: "Heavy QB Concentration",
      severity: qbExposure > 0.70 ? "high" : "med",
      explanation: `QBs make up ${Math.round(qbExposure * 100)}% of your value. Position risk is elevated.`,
      affectedCardIds: profile.notableHoldings
        .filter(h => h.position === "QB")
        .map(h => h.cardId),
    });
  }

  const rookieRisingExposure = (profile.careerStage["Rookie"] || 0) + (profile.careerStage["Rising"] || 0);
  if (rookieRisingExposure > 0.45) {
    signals.push({
      code: "HIGH_ROOKIE_EXPOSURE",
      label: "Heavy Early Career Exposure",
      severity: rookieRisingExposure > 0.60 ? "high" : "med",
      explanation: `${Math.round(rookieRisingExposure * 100)}% of value in rookies/rising players. Higher volatility expected.`,
      affectedCardIds: profile.notableHoldings
        .filter(h => h.stage === "Rookie" || h.stage === "Rising")
        .map(h => h.cardId),
    });
  }

  const smallMarketExposure = profile.teamMarket["Small"] || 0;
  if (smallMarketExposure > 0.35) {
    signals.push({
      code: "SMALL_MARKET_BIAS",
      label: "Small Market Concentration",
      severity: smallMarketExposure > 0.50 ? "high" : "med",
      explanation: `${Math.round(smallMarketExposure * 100)}% of value in small market teams. May limit liquidity.`,
      affectedCardIds: [],
    });
  }

  if (profile.liquiditySignals.lowLiquidityPct > 0.25) {
    signals.push({
      code: "LOW_LIQUIDITY",
      label: "Liquidity Concerns",
      severity: profile.liquiditySignals.lowLiquidityPct > 0.40 ? "high" : "med",
      explanation: `${Math.round(profile.liquiditySignals.lowLiquidityPct * 100)}% of cards have low recent sales volume. Exit may be difficult.`,
      affectedCardIds: [],
    });
  }

  const rawExposure = profile.grades["Raw"] || 0;
  if (rawExposure > 0.40) {
    signals.push({
      code: "GRADE_RISK",
      label: "High Raw Card Exposure",
      severity: rawExposure > 0.60 ? "high" : "med",
      explanation: `${Math.round(rawExposure * 100)}% of value in raw cards. Consider grading high-value items.`,
      affectedCardIds: [],
    });
  }

  return signals;
}

const PORTFOLIO_OUTLOOK_SYSTEM_PROMPT = `You are PortfolioOutlookAI for a sports card investing platform.
Tone: confident, honest, non-hype, collector-native. No cringe. No financial advice disclaimers beyond: "Not financial advice."
You must be explainable. Avoid obvious takes. Use the user's actual exposures.
Never claim certainty. Prefer "likely / tends to / historically" language.
Return ONLY valid JSON matching the schema. No markdown, no extra keys.`;

function buildPortfolioOutlookPrompt(profile: PortfolioProfile, riskSignals: RiskSignal[], playerNews: Record<string, string[]>): string {
  // Build news section for top players
  const newsSection = Object.entries(playerNews).length > 0 
    ? `\nRECENT PLAYER NEWS (REAL-TIME - use this for current context, may supersede your training data):\n${Object.entries(playerNews).map(([player, snippets]) => 
        `${player}:\n${snippets.map(s => `  - ${s}`).join('\n')}`
      ).join('\n\n')}\n`
    : "";

  return `Generate a portfolio outlook for this user based on the portfolio profile and risk signals.

Portfolio Profile:
${JSON.stringify(profile, null, 2)}

Risk Signals:
${JSON.stringify(riskSignals, null, 2)}
${newsSection}
Required Output JSON schema:
{
  "overallStance": "Speculative Growth | Balanced | Value | Legacy | Aggressive Speculation",
  "stanceSummary": "One clear sentence resolving stable vs risky tension, e.g. 'This portfolio is stable but growth-limited.' or 'High volatility with strong upside potential.'",
  "confidenceScore": 1-100,
  "primaryDriver": "short phrase",
  "summaryShort": "1-2 sentences",
  "summaryLong": "5-8 sentences with specific exposures and tradeoffs. Structure as: What this portfolio is → Why it looks this way → What that means going forward.",
  "opportunities": ["3 bullets, specific and numerically personalized, not generic"],
  "watchouts": ["3 bullets, specific and numerically personalized, not generic"],
  "recommendedNextActions": [
    {"label":"short action-oriented label", "why":"specific numeric impact, e.g. 'Adding 2-3 prime WRs would reduce retired exposure by ~10%'", "cta":"string", "target":"portfolio|nextBuys|watchlist|marketOutlook"}
  ]
}

Rules:
- Mention 2-3 concrete exposure facts (like "QB is 58% of value", "rookie+rising is 53%").
- Use language that encourages planning: diversification, liquidity, cycle timing.
- If concentration is high, recommend reducing it via next buys that diversify.
- Keep it punchy and readable. No long paragraphs.
- recommendedNextActions.why MUST include specific numbers when possible (e.g. "would reduce X exposure by ~Y%").
- If RECENT PLAYER NEWS mentions injuries or volatility, use time-bound language like "recent injury-related uncertainty" or "short-term news-driven volatility" rather than stating injury facts as permanent conditions.
- If RECENT PLAYER NEWS is provided, use it to inform your analysis about players in the portfolio. The news is real-time and supersedes outdated training data.`;
}

type AIOutlookResponse = {
  overallStance: string;
  stanceSummary?: string;
  confidenceScore: number;
  primaryDriver: string;
  summaryShort: string;
  summaryLong: string;
  opportunities: string[];
  watchouts: string[];
  recommendedNextActions: RecommendedAction[];
};

export async function generatePortfolioOutlook(userId: string): Promise<PortfolioSnapshot> {
  const profile = await buildPortfolioProfile(userId);
  const riskSignals = generateRiskSignals(profile);

  const exposures: PortfolioExposures = {
    bySport: profile.sports,
    byPosition: profile.positions,
    byCareerStage: profile.careerStage,
    byTeamMarket: profile.teamMarket,
    byGradeCompany: profile.grades,
    topPlayersConcentration: profile.concentration.topPlayers,
    topTeamsConcentration: profile.concentration.topTeams,
  };

  // Fetch real-time news for top players in portfolio (up to 5)
  const playerNews: Record<string, string[]> = {};
  const topPlayerNames = profile.concentration.topPlayers.slice(0, 5).map(p => p.player);
  
  for (const playerName of topPlayerNames) {
    if (playerName && playerName !== "Unknown") {
      try {
        const newsData = await fetchPlayerNews(playerName, null);
        if (newsData.snippets.length > 0) {
          playerNews[playerName] = newsData.snippets.slice(0, 3);
        }
      } catch (e) {
        console.log(`[PortfolioOutlook] Failed to fetch news for ${playerName}`);
      }
    }
  }
  console.log(`[PortfolioOutlook] Fetched news for ${Object.keys(playerNews).length} players`);

  if (profile.cardCount === 0) {
    const emptySnapshot: InsertPortfolioSnapshot = {
      userId,
      asOfDate: new Date(),
      overallStance: "No Portfolio",
      confidenceScore: 0,
      primaryDriver: "Empty portfolio",
      summaryShort: "Add cards to your portfolio to get AI-powered insights.",
      summaryLong: "Your portfolio is currently empty. Start by adding cards to your collection, and we'll analyze your exposures, concentration risks, and provide personalized recommendations for building a diversified sports card portfolio.",
      portfolioValueEstimate: 0,
      cardCount: 0,
      exposures,
      riskSignals: [],
      opportunities: ["Start building your collection", "Browse the Explore page for inspiration", "Use Quick Card Check before buying"],
      watchouts: [],
      recommendedNextActions: [
        { label: "Browse Portfolios", why: "Get inspiration from other collectors", cta: "View", target: "portfolio" },
        { label: "Check Market", why: "See trending players and cards", cta: "Explore", target: "marketOutlook" },
      ],
    };

    const [saved] = await db.insert(portfolioSnapshots).values(emptySnapshot).returning();
    return saved;
  }

  let aiResponse: AIOutlookResponse;
  
  try {
    const systemPrompt = PORTFOLIO_OUTLOOK_SYSTEM_PROMPT;
    const userPrompt = buildPortfolioOutlookPrompt(profile, riskSignals, playerNews);
    
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${systemPrompt}\n\n${userPrompt}`,
    });

    const content = response.text || "";
    if (!content) throw new Error("No AI response");
    
    aiResponse = JSON.parse(content);
  } catch (error) {
    console.error("AI portfolio outlook failed:", error);
    aiResponse = {
      overallStance: "Balanced",
      confidenceScore: 50,
      primaryDriver: "Unable to generate AI insights",
      summaryShort: "Portfolio analysis temporarily unavailable. Your collection shows interesting patterns.",
      summaryLong: "We encountered an issue generating your personalized outlook. Based on basic analysis, your portfolio has a mix of positions and career stages. Check back soon for full AI-powered insights.",
      opportunities: ["Review your top holdings", "Consider diversification", "Monitor player performance"],
      watchouts: ["Market conditions vary", "Stay informed on player news"],
      recommendedNextActions: [
        { label: "View Cards", why: "Review your collection", cta: "Browse", target: "portfolio" },
      ],
    };
  }

  const snapshot: InsertPortfolioSnapshot = {
    userId,
    asOfDate: new Date(),
    overallStance: aiResponse.overallStance,
    confidenceScore: aiResponse.confidenceScore,
    primaryDriver: aiResponse.primaryDriver,
    summaryShort: aiResponse.summaryShort,
    summaryLong: aiResponse.summaryLong,
    portfolioValueEstimate: profile.portfolioValueEstimate,
    cardCount: profile.cardCount,
    exposures,
    riskSignals,
    opportunities: aiResponse.opportunities,
    watchouts: aiResponse.watchouts,
    recommendedNextActions: aiResponse.recommendedNextActions,
  };

  const [saved] = await db.insert(portfolioSnapshots).values(snapshot).returning();
  return saved;
}

export async function getLatestPortfolioSnapshot(userId: string): Promise<PortfolioSnapshot | null> {
  const [latest] = await db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.userId, userId))
    .orderBy(desc(portfolioSnapshots.asOfDate))
    .limit(1);

  return latest || null;
}

export async function isSnapshotFresh(userId: string, maxAgeHours: number = 24): Promise<boolean> {
  const latest = await getLatestPortfolioSnapshot(userId);
  if (!latest || !latest.asOfDate) return false;
  
  const ageMs = Date.now() - new Date(latest.asOfDate).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return ageHours < maxAgeHours;
}

// =============================================
// NEXT BUYS ENGINE
// =============================================

type NextBuyCandidate = {
  title: string;
  playerName: string;
  sport: string;
  year?: number;
  setName?: string;
  cardNumber?: string;
  variation?: string;
  gradeCompany?: string;
  grade?: string;
  estPrice?: number;
  source: string;
  sourceUrl?: string;
  position?: string;
  stage?: string;
  compsConfidence?: number;
  priceDiscount?: number;
  momentumTrend?: "up" | "flat" | "down";
};

function generateCardFingerprint(candidate: NextBuyCandidate): string {
  const parts = [
    candidate.playerName?.toLowerCase().trim() || "",
    candidate.year?.toString() || "",
    candidate.setName?.toLowerCase().trim() || "",
    candidate.variation?.toLowerCase().trim() || "",
    candidate.gradeCompany?.toLowerCase().trim() || "",
    candidate.grade?.toLowerCase().trim() || "",
  ];
  return parts.join("|");
}

function scoreValue(candidate: NextBuyCandidate): number {
  // Start with a base that varies by candidate characteristics
  // This prevents flat 50s across all cards
  let score = 45 + Math.floor(Math.random() * 10); // 45-54 base with natural variance
  
  // Adjust for comps confidence
  if (candidate.compsConfidence) {
    score += (candidate.compsConfidence - 50) * 0.3;
  }
  
  // Price discount is the main value driver
  if (candidate.priceDiscount) {
    if (candidate.priceDiscount > 20) score += 28;
    else if (candidate.priceDiscount > 15) score += 22;
    else if (candidate.priceDiscount > 10) score += 16;
    else if (candidate.priceDiscount > 5) score += 10;
    else if (candidate.priceDiscount > 0) score += 4;
    else if (candidate.priceDiscount < -15) score -= 18;
    else if (candidate.priceDiscount < -10) score -= 12;
    else if (candidate.priceDiscount < -5) score -= 6;
  }
  
  // Stage affects perceived value
  if (candidate.stage === "Prime") score += 6;
  else if (candidate.stage === "Rising") score += 4;
  else if (candidate.stage === "Rookie") score += 2;
  else if (candidate.stage === "Decline") score -= 4;
  
  // Position-based value adjustment (some positions more liquid)
  if (candidate.position === "QB") score += 5;
  else if (candidate.position === "WR") score += 3;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreFit(candidate: NextBuyCandidate, profile: PortfolioProfile): number {
  let score = 50;
  
  // TEAM THEME BONUS - Moderate boost (not dominant)
  if (candidate.source === "TeamTheme") {
    score += 12; // Meaningful but not dominant
  }
  
  // WATCHLIST BONUS - User explicitly interested
  if (candidate.source === "Watchlist") {
    score += 18; // High priority - user actively tracking
  }
  
  // BREAKOUT BONUS - High upside potential
  if (candidate.source === "Breakout") {
    score += 15; // Strong investment signal
  }
  
  // DIVERSIFICATION BONUSES - Fill portfolio gaps
  
  // Position diversification
  const qbExposure = profile.positions["QB"] || 0;
  if (qbExposure > 0.50 && candidate.position !== "QB") {
    score += 15; // Reduce QB concentration
  }
  if (qbExposure < 0.20 && candidate.position === "QB") {
    score += 10; // Add QB exposure
  }
  
  const wrExposure = profile.positions["WR"] || 0;
  if (wrExposure < 0.15 && candidate.position === "WR") {
    score += 18; // WR underweight - high bonus
  }
  
  // New position exposure (adds diversity)
  if (candidate.position && !(candidate.position in profile.positions)) {
    score += 12; // Adding new position type
  }
  
  // Career stage balance
  const rookieExposure = (profile.careerStage["Rookie"] || 0) + (profile.careerStage["Rising"] || 0);
  const primeExposure = profile.careerStage["Prime"] || 0;
  
  if (rookieExposure > 0.50 && (candidate.stage === "Prime")) {
    score += 15; // Balance with proven players
  }
  if (rookieExposure < 0.30 && candidate.stage === "Rookie") {
    score += 10; // Add growth potential
  }
  if (primeExposure < 0.20 && candidate.stage === "Prime") {
    score += 12; // Need more proven performers
  }
  
  // Concentration risk - favor non-top-player cards
  const topPlayer = profile.concentration.topPlayers[0];
  if (topPlayer && topPlayer.pct > 0.15 && candidate.playerName !== topPlayer.player) {
    score += 10; // Diversify away from concentration
  }
  
  // VALUE RANGE ALIGNMENT - Match user's typical investment level
  // Use actual card count for accurate per-card average
  const avgCardValue = profile.cardCount > 0 
    ? profile.portfolioValueEstimate / profile.cardCount 
    : 50; // Default $50 for new collectors
  
  if (candidate.estPrice && avgCardValue > 0) {
    const priceRatio = candidate.estPrice / avgCardValue;
    if (priceRatio >= 0.3 && priceRatio <= 3.0) {
      score += 6; // Within reasonable range
    } else if (priceRatio > 5.0) {
      score -= 8; // Much more expensive than typical
    }
    // Don't penalize cheaper cards - they could be good value picks
  }
  
  // MOMENTUM BONUS - Upward trends are attractive
  if (candidate.momentumTrend === "up") {
    score += 8;
  } else if (candidate.momentumTrend === "down") {
    score -= 5;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreMomentum(candidate: NextBuyCandidate): number {
  let score = 50;
  
  if (candidate.momentumTrend === "up") score += 25;
  else if (candidate.momentumTrend === "down") score -= 15;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateWhyBullets(
  candidate: NextBuyCandidate, 
  profile: PortfolioProfile,
  scores: { value: number; fit: number; momentum: number }
): string[] {
  const bullets: string[] = [];
  
  // SOURCE-BASED EXPLANATIONS (pick the most relevant one)
  if (candidate.source === "Watchlist") {
    bullets.push("From your watchlist - you've been tracking this player");
  } else if (candidate.source === "Breakout") {
    bullets.push("Breakout potential: showing strong upward momentum");
  } else if (candidate.source === "HiddenGems") {
    bullets.push("Identified as undervalued by market analysis");
  } else if (candidate.source === "TeamTheme") {
    // Find which specific team the candidate matches from user's collection
    const userTeams = profile.concentration.topTeams
      .filter(t => t.pct > 0.05)
      .map(t => t.team);
    
    let candidateTeam: string | null = null;
    if (candidate.team) {
      candidateTeam = normalizeTeamName(candidate.team) || candidate.team;
    } else {
      const mappedTeam = PLAYER_TEAM_MAP[candidate.playerName.toLowerCase().trim()];
      candidateTeam = mappedTeam || normalizeTeamName(extractTeamFromText(candidate.title));
    }
    
    const matchingTheme = candidateTeam 
      ? userTeams.find(ut => teamsMatch(ut, candidateTeam))
      : userTeams[0];
    
    if (matchingTheme) {
      bullets.push(`Fits your ${matchingTheme} collection theme`);
    }
  }
  
  // INVESTMENT SIGNAL BULLETS
  if (scores.value >= 70 && candidate.priceDiscount && candidate.priceDiscount > 10) {
    bullets.push(`Priced ${Math.round(candidate.priceDiscount)}% below recent comps`);
  }
  
  if (scores.momentum >= 70 && candidate.source !== "Breakout") {
    bullets.push("Price momentum trending upward");
  }
  
  // PORTFOLIO FIT BULLETS
  const qbExposure = profile.positions["QB"] || 0;
  if (qbExposure > 0.50 && candidate.position !== "QB") {
    bullets.push(`Diversifies beyond your QB-heavy portfolio`);
  } else if (qbExposure < 0.20 && candidate.position === "QB") {
    bullets.push("Adds QB exposure to your collection");
  }
  
  const wrExposure = profile.positions["WR"] || 0;
  if (wrExposure < 0.15 && candidate.position === "WR") {
    bullets.push("Fills WR gap in your portfolio");
  }
  
  // Career stage balance
  const rookieExposure = (profile.careerStage["Rookie"] || 0) + (profile.careerStage["Rising"] || 0);
  const primeExposure = profile.careerStage["Prime"] || 0;
  
  if (rookieExposure > 0.50 && candidate.stage === "Prime") {
    bullets.push("Adds proven performer to balance young prospects");
  } else if (primeExposure < 0.20 && candidate.stage === "Prime") {
    bullets.push("Brings established value to your collection");
  } else if (rookieExposure < 0.30 && candidate.stage === "Rookie") {
    bullets.push("Adds upside potential with young talent");
  }
  
  // New position type
  if (candidate.position && !(candidate.position in profile.positions)) {
    bullets.push(`Adds ${candidate.position} - new position for your collection`);
  }
  
  // Concentration diversification
  const topPlayer = profile.concentration.topPlayers[0];
  if (topPlayer && topPlayer.pct > 0.20 && candidate.playerName !== topPlayer.player) {
    bullets.push(`Reduces concentration in ${topPlayer.player}`);
  }
  
  // Default if no specific reasons found
  if (bullets.length === 0) {
    if (candidate.stage === "Rookie" || candidate.stage === "Rising") {
      bullets.push("Growth potential with upside");
    } else if (candidate.stage === "Prime") {
      bullets.push("Stable investment with proven performance");
    } else {
      bullets.push("Solid addition to diversify your collection");
    }
  }
  
  return bullets.slice(0, 4); // Limit to 4 most relevant bullets
}

function computePortfolioImpact(
  candidate: NextBuyCandidate,
  profile: PortfolioProfile
): import("@shared/schema").NextBuyPortfolioImpact {
  const candidateWeight = (candidate.estPrice || 100) / (profile.portfolioValueEstimate || 1000);
  
  const impact: import("@shared/schema").NextBuyPortfolioImpact = {};
  
  if (candidate.position === "QB") {
    impact.qbExposureDelta = Math.round(candidateWeight * 100);
  } else if ((profile.positions["QB"] || 0) > 0.50) {
    impact.qbExposureDelta = -Math.round(candidateWeight * (profile.positions["QB"] || 0) * 100);
  }
  
  if (candidate.stage === "Rookie") {
    impact.rookieExposureDelta = Math.round(candidateWeight * 100);
  } else if ((profile.careerStage["Rookie"] || 0) > 0.30) {
    impact.rookieExposureDelta = -Math.round(candidateWeight * 50);
  }
  
  if (candidate.position && !(candidate.position in profile.positions)) {
    impact.diversificationGain = `Adds ${candidate.position} exposure`;
  }
  
  return impact;
}

export async function generateNextBuys(userId: string): Promise<import("@shared/schema").NextBuy[]> {
  const profile = await buildPortfolioProfile(userId);
  
  // Get players the user already owns (to exclude from recommendations)
  const ownedPlayerNames = new Set(
    profile.concentration.topPlayers.map(p => p.player.toLowerCase().trim())
  );
  
  // Also get ALL player names from user's collection (not just top players)
  const allOwnedCards = await db
    .select({ playerName: cards.playerName })
    .from(cards)
    .innerJoin(displayCases, eq(cards.displayCaseId, displayCases.id))
    .where(eq(displayCases.userId, userId));
  
  for (const card of allOwnedCards) {
    if (card.playerName) {
      ownedPlayerNames.add(card.playerName.toLowerCase().trim());
    }
  }
  
  // Get dismissed players
  const dismissedPlayers = await db
    .select({ playerName: dismissedRecommendations.playerName })
    .from(dismissedRecommendations)
    .where(eq(dismissedRecommendations.userId, userId));
  
  const dismissedPlayerNames = new Set(
    dismissedPlayers.map(d => d.playerName.toLowerCase().trim())
  );
  
  console.log(`[NextBuys] User owns ${ownedPlayerNames.size} players, dismissed ${dismissedPlayerNames.size} players`);
  
  // Helper to check if a player should be excluded
  const shouldExcludePlayer = (playerName: string): boolean => {
    const normalized = playerName.toLowerCase().trim();
    return ownedPlayerNames.has(normalized) || dismissedPlayerNames.has(normalized);
  };
  
  // Detect user's team preferences from their portfolio
  const topTeams = profile.concentration.topTeams
    .filter(t => t.pct > 0.05) // Teams with at least 5% of portfolio
    .map(t => t.team);
  
  // Detect user's sport preferences  
  const dominantSports = Object.entries(profile.sports)
    .filter(([, pct]) => pct > 0.1) // Sports with at least 10% exposure
    .map(([sport]) => sport.toLowerCase());
  
  console.log(`[NextBuys] Detected team themes: ${topTeams.join(", ") || "none"}`);
  console.log(`[NextBuys] Detected sport preferences: ${dominantSports.join(", ") || "none"}`);
  
  const watchlistPlayers = await db
    .select()
    .from(playerWatchlist)
    .where(eq(playerWatchlist.userId, userId))
    .limit(10);

  const candidates: NextBuyCandidate[] = [];
  
  // Source 1: User's watchlist (skip if already owned or dismissed)
  for (const watched of watchlistPlayers) {
    if (shouldExcludePlayer(watched.playerName)) {
      console.log(`[NextBuys] Skipping watchlist player ${watched.playerName} - already owned or dismissed`);
      continue;
    }
    candidates.push({
      title: `${watched.playerName} Base Rookie`,
      playerName: watched.playerName,
      sport: watched.sport || "football",
      source: "Watchlist",
      position: "Unknown",
      stage: "Unknown",
      estPrice: 50,
      compsConfidence: 60,
      momentumTrend: watched.verdictAtAdd === "BUY" ? "up" : "flat",
    });
  }
  
  // Source 2: Hidden Gems with CAPPED sources to prevent any single type from dominating
  try {
    const activeGems = await db
      .select()
      .from(hiddenGems)
      .where(eq(hiddenGems.isActive, true))
      .limit(50);
    
    // Sort by confidence score to get best candidates from each source
    const sortedGems = [...activeGems].sort((a, b) => 
      (b.confidenceScore || 0) - (a.confidenceScore || 0)
    );
    
    // Source 2a: BREAKOUT players (HOT temperature) - CAP at 3
    let breakoutCount = 0;
    for (const gem of sortedGems) {
      if (breakoutCount >= 3) break;
      if (shouldExcludePlayer(gem.playerName)) continue; // Skip owned/dismissed
      if (gem.temperature === "HOT" && !candidates.some(c => c.playerName === gem.playerName)) {
        candidates.push({
          title: `${gem.playerName} - ${gem.team || gem.sport}`,
          playerName: gem.playerName,
          sport: gem.sport,
          team: gem.team || undefined,
          source: "Breakout",
          position: gem.position || "Unknown",
          stage: "Unknown",
          estPrice: 25 + Math.random() * 50,
          compsConfidence: gem.confidenceScore || 70,
          momentumTrend: "up",
        });
        breakoutCount++;
        console.log(`[NextBuys] Added ${gem.playerName} as BREAKOUT candidate (${breakoutCount}/3)`);
      }
    }
    
    // Source 2b: Team theme matches - CAP at 3
    let teamThemeCount = 0;
    if (topTeams.length > 0) {
      for (const gem of sortedGems) {
        if (teamThemeCount >= 3) break;
        if (shouldExcludePlayer(gem.playerName)) continue; // Skip owned/dismissed
        const matchesTeam = gem.team && topTeams.some(userTeam => 
          teamsMatch(gem.team, userTeam)
        );
        
        if (matchesTeam && !candidates.some(c => c.playerName === gem.playerName)) {
          candidates.push({
            title: `${gem.playerName} - ${gem.team || gem.sport}`,
            playerName: gem.playerName,
            sport: gem.sport,
            team: gem.team || undefined,
            source: "TeamTheme",
            position: gem.position || "Unknown",
            stage: "Unknown",
            estPrice: 25 + Math.random() * 50,
            compsConfidence: gem.confidenceScore || 70,
            momentumTrend: gem.temperature === "HOT" ? "up" : gem.temperature === "COOLING" ? "down" : "flat",
          });
          teamThemeCount++;
          console.log(`[NextBuys] Added ${gem.playerName} (${gem.team}) matching team theme (${teamThemeCount}/3)`);
        }
      }
    }
    
    // Source 2c: Sport preference matches - CAP at 4
    let sportMatchCount = 0;
    for (const gem of sortedGems) {
      if (sportMatchCount >= 4) break;
      if (shouldExcludePlayer(gem.playerName)) continue; // Skip owned/dismissed
      const matchesSport = dominantSports.includes(gem.sport.toLowerCase());
      
      if (matchesSport && !candidates.some(c => c.playerName === gem.playerName)) {
        candidates.push({
          title: `${gem.playerName} - ${gem.team || gem.sport}`,
          playerName: gem.playerName,
          sport: gem.sport,
          team: gem.team || undefined,
          source: "HiddenGems",
          position: gem.position || "Unknown",
          stage: "Unknown",
          estPrice: 25 + Math.random() * 50,
          compsConfidence: gem.confidenceScore || 70,
          momentumTrend: gem.temperature === "HOT" ? "up" : gem.temperature === "COOLING" ? "down" : "flat",
        });
        sportMatchCount++;
      }
    }
  } catch (error) {
    console.log("[NextBuys] Error fetching hidden gems:", error);
  }
  
  // Source 3: Sport-specific trending players if not enough candidates
  if (candidates.length < 5) {
    // Add players based on user's sport preferences
    const sportSpecificPlayers: Record<string, Array<{ name: string; position: string; stage: string; team?: string }>> = {
      basketball: [
        { name: "Victor Wembanyama", position: "C", stage: "Rookie", team: "Spurs" },
        { name: "Chet Holmgren", position: "C", stage: "Rising", team: "Thunder" },
        { name: "Anthony Edwards", position: "SG", stage: "Prime", team: "Timberwolves" },
        { name: "Tyrese Haliburton", position: "PG", stage: "Rising", team: "Pacers" },
        { name: "Jayson Tatum", position: "SF", stage: "Prime", team: "Celtics" },
        { name: "Lauri Markkanen", position: "PF", stage: "Prime", team: "Jazz" },
        { name: "Walker Kessler", position: "C", stage: "Rising", team: "Jazz" },
        { name: "Keyonte George", position: "PG", stage: "Rookie", team: "Jazz" },
      ],
      football: [
        { name: "Jayden Daniels", position: "QB", stage: "Rookie" },
        { name: "Caleb Williams", position: "QB", stage: "Rookie" },
        { name: "Marvin Harrison Jr", position: "WR", stage: "Rookie" },
        { name: "Malik Nabers", position: "WR", stage: "Rookie" },
        { name: "Brock Bowers", position: "TE", stage: "Rookie" },
      ],
      baseball: [
        { name: "Gunnar Henderson", position: "SS", stage: "Rising" },
        { name: "Corbin Carroll", position: "OF", stage: "Rising" },
        { name: "Elly De La Cruz", position: "SS", stage: "Rookie" },
        { name: "Jackson Chourio", position: "OF", stage: "Rookie" },
      ],
      hockey: [
        { name: "Connor Bedard", position: "C", stage: "Rookie" },
        { name: "Macklin Celebrini", position: "C", stage: "Rookie" },
      ],
    };
    
    // Prioritize user's preferred sports
    const sportsToCheck = dominantSports.length > 0 
      ? dominantSports 
      : ["football", "basketball"];
    
    for (const sport of sportsToCheck) {
      const players = sportSpecificPlayers[sport] || [];
      
      // If user has team themes, prioritize players from those teams
      const prioritizedPlayers = [...players].sort((a, b) => {
        const aMatchesTeam = a.team && topTeams.some(t => teamsMatch(a.team!, t));
        const bMatchesTeam = b.team && topTeams.some(t => teamsMatch(b.team!, t));
        if (aMatchesTeam && !bMatchesTeam) return -1;
        if (!aMatchesTeam && bMatchesTeam) return 1;
        return 0;
      });
      
      for (const player of prioritizedPlayers) {
        if (shouldExcludePlayer(player.name)) continue; // Skip owned/dismissed
        if (!candidates.some(c => c.playerName === player.name) && candidates.length < 10) {
          const matchesTeam = player.team && topTeams.some(t => teamsMatch(player.team!, t));
          
          candidates.push({
            title: `${player.name} 2024 ${sport === "basketball" ? "Prizm" : "Donruss"} Base`,
            playerName: player.name,
            sport: sport,
            year: 2024,
            setName: sport === "basketball" ? "Prizm" : "Donruss",
            source: matchesTeam ? "TeamTheme" : "MarketOutlook",
            position: player.position,
            stage: player.stage,
            estPrice: 15 + Math.random() * 30,
            compsConfidence: 70,
            momentumTrend: "up",
          });
        }
      }
    }
  }

  const scoredCandidates = candidates.map(candidate => {
    const valueScore = scoreValue(candidate);
    const fitScore = scoreFit(candidate, profile);
    const momentumScore = scoreMomentum(candidate);
    const overallScore = Math.round(0.45 * fitScore + 0.35 * valueScore + 0.20 * momentumScore);
    
    return {
      candidate,
      valueScore,
      fitScore,
      momentumScore,
      overallScore,
      verdict: overallScore >= 78 ? "BUY" : overallScore >= 60 ? "MONITOR" : "SKIP",
    };
  });

  // RESERVED SLOT SYSTEM: Ensure diverse recommendations from multiple sources
  // Instead of pure score sorting (which lets one source dominate), reserve slots
  const validBySource = new Map<string, typeof scoredCandidates>();
  
  for (const c of scoredCandidates.filter(c => c.verdict !== "SKIP")) {
    const source = c.candidate.source;
    if (!validBySource.has(source)) {
      validBySource.set(source, []);
    }
    validBySource.get(source)!.push(c);
  }
  
  // Sort each source by score
  for (const [, list] of validBySource) {
    list.sort((a, b) => b.overallScore - a.overallScore);
  }
  
  // Build final list with HARD CAPS per source (ensures true diversity)
  const validCandidates: typeof scoredCandidates = [];
  
  // Hard caps per source - no source can exceed these limits
  const sourceMaxCaps: Record<string, number> = {
    "Watchlist": 2,      // User's explicit interests - max 2
    "Breakout": 2,       // Hot momentum players - max 2
    "TeamTheme": 2,      // Collection fit - max 2
    "HiddenGems": 2,     // General undervalued picks - max 2
    "MarketOutlook": 2,  // Trending fallback - max 2
  };
  
  // Track how many we've added from each source
  const sourceCount: Record<string, number> = {};
  
  // Round-robin selection: take best from each source in rotation until we have 7
  let addedThisRound = true;
  const sourceOrder = ["Watchlist", "Breakout", "TeamTheme", "HiddenGems", "MarketOutlook"];
  
  while (validCandidates.length < 7 && addedThisRound) {
    addedThisRound = false;
    
    for (const source of sourceOrder) {
      if (validCandidates.length >= 7) break;
      
      const currentCount = sourceCount[source] || 0;
      const maxAllowed = sourceMaxCaps[source] || 2;
      
      if (currentCount >= maxAllowed) continue;
      
      const sourceList = validBySource.get(source) || [];
      if (sourceList.length > 0) {
        const best = sourceList.shift()!; // Take the best (pre-sorted)
        validCandidates.push(best);
        sourceCount[source] = currentCount + 1;
        addedThisRound = true;
      }
    }
  }
  
  // If still need more, take any remaining BUT still enforce source caps
  if (validCandidates.length < 5) {
    const allRemaining = Array.from(validBySource.values())
      .flat()
      .sort((a, b) => b.overallScore - a.overallScore);
    
    while (validCandidates.length < 5 && allRemaining.length > 0) {
      const next = allRemaining.shift()!;
      if (!validCandidates.includes(next)) {
        // Still enforce caps even in fallback
        const source = next.candidate.source;
        const currentCount = sourceCount[source] || 0;
        const maxAllowed = sourceMaxCaps[source] || 2;
        
        if (currentCount < maxAllowed) {
          validCandidates.push(next);
          sourceCount[source] = currentCount + 1;
        }
      }
    }
  }
  
  // Final sort by score for display order
  validCandidates.sort((a, b) => b.overallScore - a.overallScore);

  await db.delete(nextBuys).where(eq(nextBuys.userId, userId));

  const results: import("@shared/schema").NextBuy[] = [];
  
  for (const { candidate, valueScore, fitScore, momentumScore, overallScore, verdict } of validCandidates) {
    const whyBullets = generateWhyBullets(candidate, profile, { value: valueScore, fit: fitScore, momentum: momentumScore });
    const portfolioImpact = computePortfolioImpact(candidate, profile);
    
    try {
      const [inserted] = await db.insert(nextBuys).values({
        userId,
        asOfDate: new Date(),
        title: candidate.title,
        playerName: candidate.playerName,
        sport: candidate.sport,
        year: candidate.year,
        setName: candidate.setName,
        cardNumber: candidate.cardNumber,
        variation: candidate.variation,
        gradeCompany: candidate.gradeCompany,
        grade: candidate.grade,
        estPrice: candidate.estPrice,
        valueScore,
        fitScore,
        momentumScore,
        overallScore,
        verdict,
        whyBullets,
        portfolioImpact,
        source: candidate.source,
        sourceUrl: candidate.sourceUrl,
        cardFingerprint: generateCardFingerprint(candidate),
      }).returning();
      
      results.push(inserted);
    } catch (error) {
      console.error("Error inserting next buy:", error);
    }
  }

  return results;
}

export async function getLatestNextBuys(userId: string): Promise<import("@shared/schema").NextBuy[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buys = await db
    .select()
    .from(nextBuys)
    .where(and(
      eq(nextBuys.userId, userId),
      gte(nextBuys.asOfDate, today)
    ))
    .orderBy(desc(nextBuys.overallScore));

  return buys;
}

export interface PortfolioNextBuyRecommendation {
  playerName: string;
  cardSuggestion: string;
  sport: string;
  position?: string;
  estimatedPrice: number;
  whyItFits: string;
  investmentRationale: string;
}

export interface PortfolioThemeAnalysis {
  identifiedTheme: string;
  themeDescription: string;
  detectedPatterns: {
    teams: string[];
    sports: string[];
    positions: string[];
    eras: string[];
    players: string[];
    cardTypes: string[];
  };
  recommendations: PortfolioNextBuyRecommendation[];
}

export async function generatePortfolioNextBuys(
  displayCaseId: number,
  userId: string
): Promise<PortfolioThemeAnalysis> {
  const displayCase = await db
    .select()
    .from(displayCases)
    .where(and(
      eq(displayCases.id, displayCaseId),
      eq(displayCases.userId, userId)
    ))
    .limit(1);

  if (displayCase.length === 0) {
    throw new Error("Display case not found or access denied");
  }

  const caseInfo = displayCase[0];

  const caseCards = await db
    .select()
    .from(cards)
    .where(eq(cards.displayCaseId, displayCaseId));

  if (caseCards.length === 0) {
    return {
      identifiedTheme: "Empty Portfolio",
      themeDescription: "Add some cards to this portfolio to get personalized recommendations.",
      detectedPatterns: {
        teams: [],
        sports: [],
        positions: [],
        eras: [],
        players: [],
        cardTypes: [],
      },
      recommendations: [],
    };
  }

  const teams: string[] = [];
  const sports: string[] = [];
  const positions: string[] = [];
  const years: number[] = [];
  const players: string[] = [];
  const cardTypes: string[] = [];
  const grades: string[] = [];
  const sets: string[] = [];

  for (const card of caseCards) {
    if (card.playerName) players.push(card.playerName);
    if (card.sport) sports.push(card.sport.toLowerCase());
    if (card.position) positions.push(card.position);
    if (card.year) years.push(card.year);
    if (card.grade) grades.push(card.grade);
    if (card.set) sets.push(card.set);
    
    const team = extractTeamFromText(card.title) || extractTeamFromText(card.variation);
    if (team) teams.push(team);
    
    if (card.isRookie) cardTypes.push("Rookie");
    if (card.hasAuto) cardTypes.push("Auto");
    if (card.isNumbered) cardTypes.push("Numbered");
    if (card.variation) cardTypes.push(card.variation);
  }

  const uniqueTeams = Array.from(new Set(teams));
  const uniqueSports = Array.from(new Set(sports));
  const uniquePositions = Array.from(new Set(positions));
  const uniquePlayers = Array.from(new Set(players));
  const uniqueCardTypes = Array.from(new Set(cardTypes));
  const uniqueSets = Array.from(new Set(sets));
  const avgYear = years.length > 0 ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : null;
  const yearRange = years.length > 0 ? `${Math.min(...years)}-${Math.max(...years)}` : null;

  const avgPrice = caseCards.reduce((sum, c) => {
    const val = c.manualValue ?? c.estimatedValue ?? c.purchasePrice ?? 0;
    return sum + val;
  }, 0) / caseCards.length;

  const prompt = `You are a sports card investment expert. Analyze this portfolio and recommend 5 specific cards that would perfectly complement the collection.

PORTFOLIO NAME: "${caseInfo.name}"
PORTFOLIO DESCRIPTION: "${caseInfo.description || 'None provided'}"

CARDS IN PORTFOLIO (${caseCards.length} cards):
${caseCards.map(c => `- ${c.playerName || c.title} | ${c.set || 'Unknown Set'} ${c.year || ''} | ${c.grade || 'Raw'} | ${c.sport || 'Unknown Sport'} | ${c.position || ''}`).join('\n')}

DETECTED PATTERNS:
- Teams: ${uniqueTeams.join(', ') || 'Various'}
- Sports: ${uniqueSports.join(', ') || 'Mixed'}
- Positions: ${uniquePositions.join(', ') || 'Various'}
- Era: ${yearRange || 'Mixed years'}
- Card Types: ${uniqueCardTypes.join(', ') || 'Base cards'}
- Common Sets: ${uniqueSets.slice(0, 5).join(', ') || 'Various'}
- Average Card Value: $${avgPrice.toFixed(0)}

Based on your analysis:
1. First, identify the THEME of this portfolio (e.g., "Super Bowl Winning QBs", "Utah Jazz Legends", "2020 Rookie Class", etc.)
2. Then recommend 5 SPECIFIC cards that would fit this theme perfectly - players/cards the collector likely doesn't have yet

Respond in this exact JSON format:
{
  "identifiedTheme": "Short theme name (3-6 words)",
  "themeDescription": "One sentence explaining the collection theme and what makes it cohesive",
  "recommendations": [
    {
      "playerName": "Full player name",
      "cardSuggestion": "Specific card recommendation (e.g., '2020 Prizm Base PSA 10')",
      "sport": "Sport name",
      "position": "Position if applicable",
      "estimatedPrice": estimated price as number,
      "whyItFits": "One sentence on why this fits the theme",
      "investmentRationale": "One sentence on investment potential"
    }
  ]
}

Important:
- DO NOT recommend players already in the portfolio: ${uniquePlayers.join(', ')}
- Recommend cards at similar price points ($${Math.round(avgPrice * 0.5)} - $${Math.round(avgPrice * 2)})
- Focus on cards that complete or enhance the theme
- Include a mix of safe picks and upside plays`;

  try {
    const model = gemini.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    const response = await model;
    const text = response.text || "";
    
    console.log("[PortfolioNextBuys] AI Response text length:", text.length);
    console.log("[PortfolioNextBuys] AI Response preview:", text.substring(0, 500));
    
    let parsed: any;
    try {
      // First try direct JSON parse (if responseMimeType worked)
      try {
        parsed = JSON.parse(text);
      } catch {
        // Fall back to extracting JSON from markdown code blocks or raw text
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          parsed = JSON.parse(codeBlockMatch[1].trim());
        } else {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found in response");
          }
        }
      }
    } catch (parseError) {
      console.error("[PortfolioNextBuys] Failed to parse AI response:", parseError);
      parsed = {
        identifiedTheme: caseInfo.name || "Custom Collection",
        themeDescription: `A curated collection of ${uniqueSports[0] || 'sports'} cards`,
        recommendations: [],
      };
    }

    return {
      identifiedTheme: parsed.identifiedTheme || caseInfo.name || "Custom Collection",
      themeDescription: parsed.themeDescription || "A personalized sports card collection",
      detectedPatterns: {
        teams: uniqueTeams,
        sports: uniqueSports,
        positions: uniquePositions,
        eras: yearRange ? [yearRange] : [],
        players: uniquePlayers,
        cardTypes: uniqueCardTypes,
      },
      recommendations: (parsed.recommendations || []).slice(0, 5).map((rec: any) => ({
        playerName: rec.playerName || "Unknown Player",
        cardSuggestion: rec.cardSuggestion || "Base Card",
        sport: rec.sport || uniqueSports[0] || "Unknown",
        position: rec.position,
        estimatedPrice: typeof rec.estimatedPrice === 'number' ? rec.estimatedPrice : avgPrice,
        whyItFits: rec.whyItFits || "Complements your collection theme",
        investmentRationale: rec.investmentRationale || "Good investment potential",
      })),
    };
  } catch (error) {
    console.error("[PortfolioNextBuys] AI analysis failed:", error);
    
    return {
      identifiedTheme: caseInfo.name || "Custom Collection",
      themeDescription: caseInfo.description || `A collection of ${uniqueSports[0] || 'sports'} cards`,
      detectedPatterns: {
        teams: uniqueTeams,
        sports: uniqueSports,
        positions: uniquePositions,
        eras: yearRange ? [yearRange] : [],
        players: uniquePlayers,
        cardTypes: uniqueCardTypes,
      },
      recommendations: [],
    };
  }
}
