import OpenAI from "openai";
import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { classifyPlayer, getExposureRecommendations, type ClassificationInput, type ClassificationOutput } from "./playerClassificationEngine";
import { calculateValuation } from "./valuationService";
import { generateInvestmentCall, type RoleTier } from "./investmentDecisionEngine";
import { lookupPlayer, ensureRegistryLoaded } from "./playerRegistry";

// ============================================================
// AI-BASED ROLE TIER INFERENCE
// For players not in registry, infer role from news context
// ============================================================
function inferRoleTierFromContext(newsSnippets: string[], playerName: string): RoleTier {
  const context = newsSnippets.join(" ").toLowerCase();
  
  // FRANCHISE_CORE indicators (clear star status)
  const franchiseIndicators = [
    "mvp", "all-pro", "all-star", "pro bowl", "superstar",
    "franchise player", "face of the franchise", "star quarterback",
    "best player", "elite", "top-5", "top 5", "top-10", "top 10",
    "super bowl favorite", "championship", "playoff contender",
    "leading the", "carries the team", "franchise qb",
    "all-nba", "all-nfl", "cy young", "triple crown",
  ];
  
  // STARTER indicators (clear starting role)
  const starterIndicators = [
    "starting", "starter", "start for", "named starter",
    "will start", "gets the start", "starting lineup",
    "first-string", "first string", "starting qb", "starting rb",
    "starting pitcher", "opening day starter", "starting point guard",
    "earned the job", "won the job", "takes over as",
  ];
  
  // BACKUP/UNCERTAIN indicators
  const backupIndicators = [
    "backup", "second-string", "second string", "bench",
    "reserve", "depth chart", "behind", "lost the job",
    "demoted", "third-string", "practice squad",
  ];
  
  // OUT_OF_LEAGUE indicators
  const outOfLeagueIndicators = [
    "released", "cut", "waived", "unsigned", "free agent looking",
    "no team", "without a team", "still looking for",
    "out of the league", "career in jeopardy",
  ];
  
  // Count matches for each tier
  const franchiseScore = franchiseIndicators.filter(i => context.includes(i)).length;
  const starterScore = starterIndicators.filter(i => context.includes(i)).length;
  const backupScore = backupIndicators.filter(i => context.includes(i)).length;
  const outOfLeagueScore = outOfLeagueIndicators.filter(i => context.includes(i)).length;
  
  console.log(`[RoleTierInference] ${playerName}: franchise=${franchiseScore}, starter=${starterScore}, backup=${backupScore}, out=${outOfLeagueScore}`);
  
  // Prioritize by tier (higher tiers need stronger evidence)
  if (franchiseScore >= 2) {
    console.log(`[RoleTierInference] Inferred FRANCHISE_CORE for ${playerName}`);
    return "FRANCHISE_CORE";
  }
  if (starterScore >= 1 || franchiseScore >= 1) {
    console.log(`[RoleTierInference] Inferred STARTER for ${playerName}`);
    return "STARTER";
  }
  if (outOfLeagueScore >= 1) {
    console.log(`[RoleTierInference] Inferred OUT_OF_LEAGUE for ${playerName}`);
    return "OUT_OF_LEAGUE";
  }
  if (backupScore >= 1) {
    console.log(`[RoleTierInference] Inferred BACKUP for ${playerName}`);
    return "BACKUP";
  }
  
  // Default: UNKNOWN (not enough signal)
  console.log(`[RoleTierInference] No strong signal for ${playerName}, defaulting to UNKNOWN`);
  return "UNKNOWN";
}
import type {
  PlayerOutlookResponse,
  PlayerOutlookRequest,
  PlayerInfo,
  PlayerSnapshot,
  PlayerVerdictResult,
  EvidenceData,
  PlayerStage,
  MarketTemperature,
  PlayerVerdict,
  DataConfidence,
  VerdictModifier,
  InvestmentCall,
} from "@shared/schema";
import { VERDICT_MODIFIER } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://ai.replit.dev/v1beta",
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Prompt version - increment this when making significant prompt changes
// to auto-invalidate cached outlooks generated with older prompts
const PROMPT_VERSION = 4; // v4: Added fallback generation for peakTiming/tieredRecommendations when AI omits them

// Normalize player key for caching
function normalizePlayerKey(sport: string, playerName: string): string {
  return `${sport.toLowerCase()}:${playerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

// TTL by temperature: Hot players refresh more often, but all have extended TTLs
function getTtlMs(temperature: MarketTemperature): number {
  switch (temperature) {
    case "HOT": return 7 * 24 * 60 * 60 * 1000; // 7 days (was 1 day)
    case "WARM": return 14 * 24 * 60 * 60 * 1000; // 14 days (was 3 days)
    case "NEUTRAL": return 30 * 24 * 60 * 60 * 1000; // 30 days (was 7 days)
    case "COOLING": return 30 * 24 * 60 * 60 * 1000; // 30 days (was 7 days)
    default: return 14 * 24 * 60 * 60 * 1000;
  }
}

// Check cache for player outlook
async function getCachedOutlook(playerKey: string): Promise<{
  outlook: PlayerOutlookResponse | null;
  isStale: boolean;
  cacheRecord: typeof playerOutlookCache.$inferSelect | null;
}> {
  const cached = await db
    .select()
    .from(playerOutlookCache)
    .where(eq(playerOutlookCache.playerKey, playerKey))
    .limit(1);
  
  if (!cached.length) {
    return { outlook: null, isStale: false, cacheRecord: null };
  }
  
  const record = cached[0];
  const now = new Date();
  const isExpired = record.expiresAt ? record.expiresAt < now : true;
  
  // Check if cached outlook was generated with an older prompt version
  const cachedOutlook = record.outlookJson as (PlayerOutlookResponse & { _promptVersion?: number }) | null;
  const isOldPromptVersion = !cachedOutlook?._promptVersion || cachedOutlook._promptVersion < PROMPT_VERSION;
  
  const isStale = isExpired || isOldPromptVersion;
  
  if (isOldPromptVersion && cachedOutlook) {
    console.log(`[PlayerOutlook] Cache outdated (v${cachedOutlook._promptVersion || 1} < v${PROMPT_VERSION}) for ${playerKey}`);
  }
  
  return {
    outlook: cachedOutlook,
    isStale,
    cacheRecord: record,
  };
}

// Save outlook to cache
async function saveToCache(
  playerKey: string,
  sport: string,
  playerName: string,
  classification: ClassificationOutput,
  outlook: PlayerOutlookResponse
): Promise<void> {
  const ttlMs = getTtlMs(classification.baseTemperature);
  const expiresAt = new Date(Date.now() + ttlMs);
  
  // Add prompt version to cached outlook for version checking on retrieval
  const outlookWithVersion = { ...outlook, _promptVersion: PROMPT_VERSION };
  
  await db
    .insert(playerOutlookCache)
    .values({
      playerKey,
      sport,
      playerName,
      classificationJson: classification,
      outlookJson: outlookWithVersion,
      temperature: classification.baseTemperature,
      lastFetchedAt: new Date(),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: playerOutlookCache.playerKey,
      set: {
        classificationJson: classification,
        outlookJson: outlookWithVersion,
        temperature: classification.baseTemperature,
        lastFetchedAt: new Date(),
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

// Known legendary players who are deceased or Hall of Famers
// These players should ALWAYS be classified as RETIRED_HOF regardless of news
const KNOWN_LEGENDS: Record<string, string[]> = {
  // Baseball legends (deceased or HOF)
  baseball: [
    "babe ruth", "lou gehrig", "ty cobb", "jackie robinson", "willie mays", "hank aaron",
    "mickey mantle", "ted williams", "joe dimaggio", "roberto clemente", "satchel paige",
    "cy young", "honus wagner", "stan musial", "sandy koufax", "bob gibson", "nolan ryan",
    "cal ripken", "tony gwynn", "ken griffey", "derek jeter", "mariano rivera", "wade boggs",
    "johnny bench", "yogi berra", "ernie banks", "brooks robinson", "frank robinson",
    "reggie jackson", "rod carew", "george brett", "mike schmidt", "ozzie smith",
    "kirby puckett", "ryne sandberg", "chipper jones", "greg maddux", "tom glavine",
    "john smoltz", "pedro martinez", "randy johnson", "roy halladay", "christy mathewson",
    "walter johnson", "grover alexander", "lefty grove", "warren spahn", "bob feller",
  ],
  // Football legends (deceased or HOF)
  football: [
    "bart starr", "johnny unitas", "joe montana", "tom brady", "peyton manning", "dan marino",
    "john elway", "brett favre", "drew brees", "aaron rodgers", "terry bradshaw", "roger staubach",
    "joe namath", "jim brown", "walter payton", "barry sanders", "emmitt smith", "jerry rice",
    "randy moss", "terrell owens", "michael irvin", "cris carter", "deion sanders", "dick butkus",
    "ray lewis", "lawrence taylor", "reggie white", "bruce smith", "mike singletary", "ronnie lott",
    "ed reed", "troy polamalu", "chuck bednarik", "jack lambert", "mean joe greene", "alan page",
    "jim thorpe", "red grange", "don hutson", "otto graham", "sammy baugh", "gale sayers",
    "earl campbell", "tony dorsett", "eric dickerson", "marshall faulk", "ladainian tomlinson",
    "jim kelly", "steve young", "warren moon", "fran tarkenton", "dan fouts", "troy aikman",
  ],
  // Basketball legends (deceased or HOF)
  basketball: [
    "michael jordan", "lebron james", "kobe bryant", "kareem abdul-jabbar", "magic johnson",
    "larry bird", "bill russell", "wilt chamberlain", "shaquille oneal", "tim duncan",
    "hakeem olajuwon", "oscar robertson", "jerry west", "elgin baylor", "julius erving",
    "isaiah thomas", "john stockton", "karl malone", "charles barkley", "scottie pippen",
    "david robinson", "patrick ewing", "allen iverson", "kevin garnett", "dirk nowitzki",
    "steve nash", "ray allen", "paul pierce", "dwyane wade", "chris bosh", "tony parker",
    "manu ginobili", "pete maravich", "george mikan", "bob cousy", "bob pettit", "elvin hayes",
    "moses malone", "dominique wilkins", "clyde drexler", "gary payton", "reggie miller",
    "chris mullin", "kevin mchale", "robert parish", "james worthy", "dennis rodman",
  ],
  // Hockey legends
  hockey: [
    "wayne gretzky", "mario lemieux", "gordie howe", "bobby orr", "maurice richard",
    "jean beliveau", "guy lafleur", "mark messier", "steve yzerman", "jaromir jagr",
    "patrick roy", "martin brodeur", "dominik hasek", "sidney crosby", "alexander ovechkin",
    "bobby hull", "stan mikita", "phil esposito", "marcel dionne", "mike bossy", "denis potvin",
    "ray bourque", "chris chelios", "nicklas lidstrom", "scott stevens", "brian leetch",
  ],
};

// Normalize sport codes to generic sport names for KNOWN_LEGENDS lookup
function normalizeSportForLegends(sport: string): string {
  const sportLower = sport.toLowerCase().trim();
  const mapping: Record<string, string> = {
    "nfl": "football",
    "nba": "basketball", 
    "mlb": "baseball",
    "nhl": "hockey",
    "football": "football",
    "basketball": "basketball",
    "baseball": "baseball",
    "hockey": "hockey",
    "soccer": "soccer",
  };
  return mapping[sportLower] || sportLower;
}

// Check if player is a known legend
function isKnownLegend(playerName: string, sport: string): boolean {
  const normalizedName = playerName.toLowerCase().trim();
  const normalizedSport = normalizeSportForLegends(sport);
  const sportLegends = KNOWN_LEGENDS[normalizedSport] || [];
  
  // Check all sports if sport doesn't match
  const allLegends = Object.values(KNOWN_LEGENDS).flat();
  const legendsToCheck = sportLegends.length > 0 ? sportLegends : allLegends;
  
  const isLegend = legendsToCheck.some(legend => 
    normalizedName.includes(legend) || legend.includes(normalizedName)
  );
  
  if (isLegend) {
    console.log(`[PlayerOutlook] isKnownLegend: "${playerName}" matched as legend (sport: ${sport} → ${normalizedSport})`);
  }
  
  return isLegend;
}

// Team context assessment - how is the team performing?
interface TeamContext {
  playoffOutlook: "CONTENDER" | "BUBBLE" | "REBUILDING" | "UNKNOWN";
  teamMomentum: "ASCENDING" | "STABLE" | "DECLINING" | "UNKNOWN";
  narrativeStrength: "STRONG" | "MODERATE" | "WEAK" | "UNKNOWN";
}

// Peak timing assessment - has the player's market likely peaked?
interface PeakTimingAssessment {
  peakStatus: "PRE_PEAK" | "AT_PEAK" | "POST_PEAK" | "UNKNOWN";
  peakReason: string;
  shortTermOutlook: string;
  longTermOutlook: string;
}

// Tiered card recommendations
interface TieredRecommendations {
  baseCards: {
    verdict: "SELL" | "HOLD" | "BUY";
    reasoning: string;
  };
  midTierParallels: {
    verdict: "SELL" | "HOLD" | "BUY";
    reasoning: string;
  };
  premiumGraded: {
    verdict: "SELL" | "HOLD" | "BUY";
    reasoning: string;
  };
}

// Analyze team context from news snippets
function analyzeTeamContext(snippets: string[], team: string | undefined): TeamContext {
  if (!team || team === "Unknown") {
    return { playoffOutlook: "UNKNOWN", teamMomentum: "UNKNOWN", narrativeStrength: "UNKNOWN" };
  }
  
  const context = snippets.join(" ").toLowerCase();
  
  // Playoff outlook indicators
  const contenderIndicators = ["playoff", "contender", "super bowl", "championship", "finals", "postseason", "clinch", "first place", "division lead"];
  const rebuildingIndicators = ["rebuilding", "tank", "draft pick", "young team", "development", "miss playoffs", "missed playoffs", "out of contention"];
  
  const contenderScore = contenderIndicators.filter(i => context.includes(i)).length;
  const rebuildingScore = rebuildingIndicators.filter(i => context.includes(i)).length;
  
  let playoffOutlook: TeamContext["playoffOutlook"] = "UNKNOWN";
  if (contenderScore >= 2) playoffOutlook = "CONTENDER";
  else if (rebuildingScore >= 2) playoffOutlook = "REBUILDING";
  else if (contenderScore >= 1) playoffOutlook = "BUBBLE";
  
  // Team momentum
  const ascendingIndicators = ["win streak", "hot start", "turning around", "on fire", "best record", "dominating"];
  const decliningIndicators = ["losing streak", "struggling", "injuries", "regression", "disappointing", "missed expectations"];
  
  const ascendingScore = ascendingIndicators.filter(i => context.includes(i)).length;
  const decliningScore = decliningIndicators.filter(i => context.includes(i)).length;
  
  let teamMomentum: TeamContext["teamMomentum"] = "UNKNOWN";
  if (ascendingScore > decliningScore) teamMomentum = "ASCENDING";
  else if (decliningScore > ascendingScore) teamMomentum = "DECLINING";
  else if (ascendingScore >= 1 || decliningScore >= 1) teamMomentum = "STABLE";
  
  // Narrative strength
  const narrativeIndicators = ["pro bowl", "all-pro", "mvp", "record", "historic", "franchise record", "best in"];
  const narrativeScore = narrativeIndicators.filter(i => context.includes(i)).length;
  
  let narrativeStrength: TeamContext["narrativeStrength"] = "UNKNOWN";
  if (narrativeScore >= 2) narrativeStrength = "STRONG";
  else if (narrativeScore >= 1) narrativeStrength = "MODERATE";
  else narrativeStrength = "WEAK";
  
  return { playoffOutlook, teamMomentum, narrativeStrength };
}

// Use Serper to get news/hype signals about the player
async function getPlayerNewsSignals(playerName: string, sport: string): Promise<{
  momentum: "up" | "flat" | "down";
  newsHype: "high" | "medium" | "low" | "none";
  snippets: string[];
  detectedStage?: "BUST" | "RETIRED" | "RETIRED_HOF";
  teamContext?: TeamContext;
}> {
  // First check if this is a known legend - override everything
  if (isKnownLegend(playerName, sport)) {
    console.log(`[PlayerOutlook] ${playerName} is a known legend → RETIRED_HOF`);
    return { 
      momentum: "flat", 
      newsHype: "low", 
      snippets: [], 
      detectedStage: "RETIRED_HOF" 
    };
  }

  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_API_KEY) {
    return { momentum: "flat", newsHype: "none", snippets: [] };
  }
  
  try {
    // Use current year to get the latest news
    const currentYear = new Date().getFullYear();
    
    // Run two parallel queries for better coverage
    const [generalResponse, performanceResponse] = await Promise.all([
      // Query 1: General news about the player
      fetch("https://google.serper.dev/news", {
        method: "POST",
        headers: {
          "X-API-KEY": SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: `${playerName} ${sport} ${currentYear}`,
          num: 6,
        }),
      }),
      // Query 2: Specific game performance and stats
      fetch("https://google.serper.dev/news", {
        method: "POST",
        headers: {
          "X-API-KEY": SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: `${playerName} points game stats NBA`,
          num: 4,
        }),
      }),
    ]);
    
    let allNews: any[] = [];
    
    if (generalResponse.ok) {
      const data = await generalResponse.json();
      allNews = [...(data.news || [])];
    }
    
    if (performanceResponse.ok) {
      const data = await performanceResponse.json();
      allNews = [...allNews, ...(data.news || [])];
    }
    
    if (allNews.length === 0) {
      return { momentum: "flat", newsHype: "none", snippets: [] };
    }
    
    // Deduplicate and prioritize news that mentions specific stats or team
    const seen = new Set<string>();
    const uniqueNews = allNews.filter((n: any) => {
      const key = (n.title || "").toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    // Prioritize snippets that mention points, drafted, or team names
    const priorityKeywords = ["points", "drafted", "mavericks", "dallas", "scored", "game", "debut", "rookie"];
    const sortedNews = uniqueNews.sort((a: any, b: any) => {
      const aText = ((a.snippet || "") + " " + (a.title || "")).toLowerCase();
      const bText = ((b.snippet || "") + " " + (b.title || "")).toLowerCase();
      const aScore = priorityKeywords.filter(kw => aText.includes(kw)).length;
      const bScore = priorityKeywords.filter(kw => bText.includes(kw)).length;
      return bScore - aScore;
    });
    
    const snippets = sortedNews.slice(0, 5).map((n: any) => n.snippet || n.title);
    
    // Analyze sentiment from snippets
    const positiveKeywords = ["surge", "rising", "hot", "breakout", "mvp", "record", "star", "elite", "best"];
    const negativeKeywords = ["decline", "falling", "injury", "benched", "struggling", "bust", "down", "trade"];
    // Keywords that indicate a player is a bust / career has stalled
    const bustKeywords = ["3rd string", "third string", "backup", "released", "cut", "waived", "demoted", "benched", "practice squad", "bust", "failed", "out of league", "unsigned", "free agent"];
    // Keywords that indicate player is deceased
    const deceasedKeywords = ["passed away", "died", "death of", "rip ", "r.i.p.", "in memoriam", "funeral", "obituary", "late great", "remembered", "tribute to", "legacy of", "1934-", "1940-", "1950-", "1960-", "1970-"];
    // Keywords that indicate player is retired/HOF
    const retiredHofKeywords = ["hall of fame", "hof", "inducted", "enshrinement", "canton", "cooperstown", "springfield", "retired jersey", "jersey retirement", "ring of honor", "former nfl", "former nba", "former mlb", "former nhl", "legendary", "all-time great", "greatest of all time", "goat"];
    // Keywords that indicate player is simply retired (not HOF)
    const retiredKeywords = ["retired", "retirement", "hung up", "called it a career", "final season", "last game", "farewell tour"];
    
    let positiveCount = 0;
    let negativeCount = 0;
    let bustIndicators = 0;
    let deceasedIndicators = 0;
    let hofIndicators = 0;
    let retiredIndicators = 0;
    const combined = snippets.join(" ").toLowerCase();
    
    positiveKeywords.forEach(kw => {
      if (combined.includes(kw)) positiveCount++;
    });
    negativeKeywords.forEach(kw => {
      if (combined.includes(kw)) negativeCount++;
    });
    bustKeywords.forEach(kw => {
      if (combined.includes(kw)) bustIndicators++;
    });
    deceasedKeywords.forEach(kw => {
      if (combined.includes(kw)) deceasedIndicators++;
    });
    retiredHofKeywords.forEach(kw => {
      if (combined.includes(kw)) hofIndicators++;
    });
    retiredKeywords.forEach(kw => {
      if (combined.includes(kw)) retiredIndicators++;
    });
    
    const momentum = positiveCount > negativeCount + 1 ? "up" : 
                     negativeCount > positiveCount + 1 ? "down" : "flat";
    const newsHype = allNews.length >= 5 ? "high" : allNews.length >= 3 ? "medium" : allNews.length >= 1 ? "low" : "none";
    
    // Determine detected career stage from news
    let detectedStage: "BUST" | "RETIRED" | "RETIRED_HOF" | undefined = undefined;
    if (deceasedIndicators >= 1 || hofIndicators >= 2) {
      // Deceased or strong HOF indicators = RETIRED_HOF (legacy player)
      detectedStage = "RETIRED_HOF";
    } else if (hofIndicators >= 1) {
      // Single HOF mention = likely RETIRED_HOF
      detectedStage = "RETIRED_HOF";
    } else if (retiredIndicators >= 1) {
      // Retired but not HOF
      detectedStage = "RETIRED";
    } else if (bustIndicators >= 2 || (bustIndicators >= 1 && negativeCount > positiveCount)) {
      // Multiple bust indicators = BUST
      detectedStage = "BUST";
    }
    
    console.log(`[PlayerOutlook] News analysis: deceased=${deceasedIndicators}, hof=${hofIndicators}, retired=${retiredIndicators}, bust=${bustIndicators} → stage=${detectedStage || "none"}`);
    
    // Analyze team context from the snippets
    // We'll get the team from the classification later, but we can still analyze the snippets
    // for team-related signals even without knowing the exact team
    const teamContext = analyzeTeamContext(snippets, undefined);
    
    return { momentum, newsHype, snippets, detectedStage, teamContext };
  } catch (error) {
    console.error("[PlayerOutlook] News fetch error:", error);
    return { momentum: "flat", newsHype: "none", snippets: [] };
  }
}

// Use AI to infer player info and generate thesis
async function generatePlayerOutlookAI(
  playerName: string,
  sport: string,
  classification: ClassificationOutput,
  newsSnippets: string[],
  teamContext?: TeamContext
): Promise<{
  playerInfo: PlayerInfo;
  thesis: string[];
  marketRealityCheck: string[];
  verdict: PlayerVerdictResult;
  confidence: DataConfidence;
  dataQuality: DataConfidence;
  aiDetectedCareerStatus?: "ACTIVE" | "RETIRED" | "RETIRED_HOF" | "DECEASED" | "BUST";
  discountAnalysis?: {
    whyDiscounted: string[];
    repricingCatalysts: string[];
    trapRisks: string[];
  };
  peakTiming?: PeakTimingAssessment;
  tieredRecommendations?: TieredRecommendations;
}> {
  // Build the system message with strict guardrails
  const systemMessage = `You are MyDisplayCase Player Outlook, a skeptical sports-card market analyst. You help collectors decide whether to invest in a player like a stock, and choose the right card exposure (Premium/Growth/Core/Speculative) based on risk, liquidity, and timing.

Style rules (non-negotiable):
- Be clear, direct, and grounded. No hype. No marketing fluff.
- Never invent facts, stats, awards, or news. If unknown, say "Unknown" and proceed with conditional reasoning.
- No fake precision (no percentages, no "72% upside").
- Every analysis must include one uncomfortable truth under "Market Reality Check."
- Verdict must be one of: BUY / MONITOR / AVOID, and must include a modifier: (Momentum / Speculative / Value / Long-Term / Late Cycle).
- Keep all sections scannable: bullets + short sentences. No long paragraphs.

Reasoning rules:
- Use "If X, then Y" logic.
- Separate "Conviction (Thesis Confidence)" from "Price certainty."

Output format rules:
- Return valid JSON only, matching the schema provided. Do not include markdown, commentary, or extra keys.`;

  // Calculate current year for context
  const currentYear = new Date().getFullYear();
  const yearsInLeague = classification.rookieYear ? currentYear - classification.rookieYear : null;
  
  const prompt = `Analyze the investment outlook for ${playerName} in ${sport}.

CURRENT DATE: December ${currentYear}

PLAYER DATA (from our classification engine - TRUST THIS OVER YOUR TRAINING DATA):
- Career Stage: ${classification.stage}${classification.rookieYear ? ` (Drafted/Rookie Year: ${classification.rookieYear}, now in year ${yearsInLeague} of career)` : ""}
- Position: ${classification.position || "Unknown"}
- Team: ${classification.team || "Unknown"}
- Market Temperature: ${classification.baseTemperature}
- Volatility: ${classification.baseVolatility}
- Risk Level: ${classification.baseRisk}
- Investment Horizon: ${classification.baseHorizon}

CRITICAL CAREER STAGE RULE:
- ONLY use the word "rookie" if Career Stage above is "ROOKIE" (year 0-1 in the league)
- If Career Stage is "YEAR_2", "PRIME", "VETERAN", "AGING", or "RETIRED", the player is NOT a rookie
- For a player drafted in ${currentYear - 2} or earlier, they are NOT a rookie - they are an established player
- Your training data may be outdated. The career stage above is calculated from current data.

${newsSnippets.length > 0 ? `CRITICAL - REAL-TIME NEWS (THIS IS GROUND TRUTH - YOUR TRAINING DATA MAY BE OUTDATED):
${newsSnippets.map(s => `- ${s}`).join("\n")}

IMPORTANT: The news above is from TODAY'S search results. If the news indicates the player has been drafted, traded, signed, or is playing in the NBA, you MUST use that information. Do NOT contradict this news with outdated information from your training data. For example, if news says a player was drafted or is playing in the NBA, they are NOT a prospect - they are a professional player.` : "No recent news available - use conditional reasoning."}

CAREER STATUS RULES (CRITICAL - you MUST set careerStatus correctly):
- "ACTIVE": Player is currently playing professionally
- "RETIRED": Player has retired from professional play but is not a Hall of Famer
- "RETIRED_HOF": Player is retired AND in the Hall of Fame (or clearly HOF-bound legend)
- "DECEASED": Player has passed away (always set this if the player is deceased, even if they're also HOF)
- "BUST": Player's career has failed/stalled (backup, out of league, never lived up to potential)

Examples:
- Babe Ruth → "DECEASED" (he died in 1948)
- Bart Starr → "DECEASED" (he died in 2019)
- Tom Brady → "RETIRED_HOF" (retired, will be HOF)
- Zach Wilson → "BUST" (failed as starter, now backup/out of league)
- Patrick Mahomes → "ACTIVE" (currently playing)

RESPOND IN EXACTLY THIS JSON FORMAT:
{
  "playerInfo": {
    "position": "<position if known, or 'Unknown'>",
    "team": "<current team if known, or 'Unknown'>",
    "rookieYear": <year as number or null>,
    "careerStatus": "ACTIVE|RETIRED|RETIRED_HOF|DECEASED|BUST",
    "inferredFields": ["<list any fields you guessed: 'position', 'team', 'rookieYear', 'careerStatus'>"]
  },
  "thesis": [
    "<bullet 1: PATTERN-BASED market rule applied to this player (e.g., 'Year 3 WRs with Pro Bowl selection historically appreciate 30-50%')>",
    "<bullet 2: Role/production pattern (e.g., 'Franchise QBs on playoff teams maintain demand floors')>",
    "<bullet 3: Team/situation pattern (e.g., 'Players in small markets often trade at discounts to production')>",
    "<bullet 4: Key pattern-based risk (e.g., 'RBs after age 27 see 40-60% value compression')>"
  ],
  "marketRealityCheck": [
    "<uncomfortable truth 1: honest skeptical observation>",
    "<uncomfortable truth 2: historical cautionary note or pricing vs reality>"
  ],
  "verdict": {
    "action": "BUY|MONITOR|AVOID",
    "modifier": "Momentum|Speculative|Value|Long-Term|Late Cycle",
    "summary": "<2-4 sentence ADVISOR VOICE summary: State the call, the pattern-level why, and what changes it. Sound like a trusted financial advisor, not a data explainer. Example: 'This is a buy. Year 3 receivers with All-Pro selection historically see 30-40% appreciation. This changes if injury or production decline breaks the pattern.'>",
    "whatMustBeTrue": [
      "<condition 1 for thesis to work>",
      "<condition 2>"
    ]
  },
  "peakTiming": {
    "peakStatus": "PRE_PEAK|AT_PEAK|POST_PEAK",
    "peakReason": "<1-2 sentence explanation of why the player's card market is at this peak stage>",
    "shortTermOutlook": "<1-2 sentence what happens to card values in next 3-6 months>",
    "longTermOutlook": "<1-2 sentence what happens to card values over next 1-2 years>"
  },
  "tieredRecommendations": {
    "baseCards": {
      "verdict": "SELL|HOLD|BUY",
      "reasoning": "<1 sentence reasoning for base card strategy>"
    },
    "midTierParallels": {
      "verdict": "SELL|HOLD|BUY",
      "reasoning": "<1 sentence reasoning for mid-tier parallel strategy>"
    },
    "premiumGraded": {
      "verdict": "SELL|HOLD|BUY",
      "reasoning": "<1 sentence reasoning for premium/graded rookie strategy>"
    }
  },
  "discountAnalysis": {
    "whyDiscounted": [
      "<reason 1: main hypothesis for why cards are underpriced relative to talent/performance>",
      "<reason 2: secondary factor (market size, narrative gap, supply, belief inertia, etc.)>"
    ],
    "repricingCatalysts": [
      "<event 1: what would cause the market to reprice higher>",
      "<event 2: secondary catalyst>"
    ],
    "trapRisks": [
      "<risk 1: what could confirm the discount is justified (player stays cheap or drops)>"
    ]
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "dataQuality": "HIGH|MEDIUM|LOW"
}

CONFIDENCE & DATA QUALITY RULES:
- confidence: How certain are you about your analysis/verdict?
  * HIGH: Well-known player with clear career trajectory, reliable data, obvious investment thesis
  * MEDIUM: Good player data but some uncertainty in outlook (injury recovery, role changes, etc.)
  * LOW: Sparse data, unknown player, highly speculative thesis, multiple key unknowns
- dataQuality: How much real-time data did you have to work with?
  * HIGH: 3+ recent news items, player is well-covered, clear current situation
  * MEDIUM: 1-2 news items, some gaps but enough to analyze
  * LOW: No recent news, relying mostly on historical knowledge

IMPORTANT: For established star players (All-Stars, MVPs, Pro Bowlers) with recent news coverage, confidence should typically be MEDIUM or HIGH, not LOW. Reserve LOW confidence for truly obscure players or situations with major unknowns.

PEAK TIMING RULES (critical for collectors):
- PRE_PEAK: Player's narrative is still building. Cards have more upside. Examples: emerging stars, pre-All-Star selection, before breakout playoff run.
- AT_PEAK: Player is at maximum visibility/hype. Cards may be at ceiling. Examples: just made All-Pro, Super Bowl run, MVP talk, franchise records.
- POST_PEAK: Peak visibility has passed. Cards may trend down without new catalysts. Examples: team missed playoffs after success, entering RB cliff years (27+), coming off injury, narrative fatigue.

TIERED RECOMMENDATIONS RULES:
- baseCards: Common base cards ($1-5 range). High supply, low demand ceiling. Often SELL at peak, BUY during dips.
- midTierParallels: Numbered parallels, premium inserts ($10-100 range). Moderate liquidity. More nuanced timing.
- premiumGraded: PSA 10/BGS 9.5+ graded rookies, low serial autos ($100+ range). Hold for long-term upside or sell at absolute peak visibility.

For RBs entering Year 4+: Generally recommend SELL on base/mid-tier due to positional depreciation, but HOLD premium graded if elite production continues.
For players on struggling teams: Base cards suffer first, premium holds better if individual stats remain strong.

ANTI-FLUFF CHECK (critical):
Before finalizing, verify: if any thesis bullet could apply to 10+ random players, rewrite it using a PATTERN-BASED market rule that specifically applies to ${playerName}'s situation (career stage, position, team context). 

PATTERN-BASED LANGUAGE EXAMPLES:
GOOD: "Year 3 WRs with back-to-back 1,000 yard seasons historically appreciate 20-40%"
GOOD: "QBs in contract years on contending teams see demand spikes"
GOOD: "RBs entering Year 4 with high workload historically decline 30-50% in value"
BAD: "This player is exciting and has upside"
BAD: "Cards could appreciate if performance continues"
BAD: "Elite talent with room to grow"

MODIFIER SELECTION:
- "Speculative": High upside, high downside, projection-driven (rookies, unproven talent)
- "Momentum": Riding current hype, short-term window (hot streaks, trending players)
- "Value": Mispriced or dip opportunity (post-injury recovery, narrative fatigue)
- "Long-Term": Slow burn, fundamentals-driven (proven stars, HOF trajectory)
- "Late Cycle": Risky entry even if still hot (prices reflect best-case, limited upside)

DISCOUNT ANALYSIS LOGIC (apply to BUY/WATCH verdicts):
- whyDiscounted: Explain WHY cards might be cheap using these lenses:
  * Market size / hobby ceiling (smaller market teams cap casual demand)
  * Narrative gap (fewer viral moments, less media gravity)
  * Position/archetype premium (game managers get discounted vs. "superhero" types)
  * Belief inertia (draft capital anchoring, pre-draft hype lag)
  * Supply pressure (heavy product releases, parallel flooding)
  * Liquidity discount (no obvious "chase card" exit paths)
  * Time horizon mismatch (market hates slow burns)
  * Role fragility (coach changes, competition, short leash)
- repricingCatalysts: What SPECIFIC events would flip pricing (playoff wins, prime-time moments, iconic card emerging)
- trapRisks: What would CONFIRM the discount is justified (more of same, ceiling exposed, situation worsens)

TONE ENFORCEMENT:
- NEVER use: "elite", "can't miss", "skyrocketing", "must own", "generational"
- PREFER: "short leash", "fragile demand", "projection-heavy", "limited proof", "if X then Y"
- NO percentages or fake precision
- Reference team context, position premium, historical patterns for ${sport}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1600,
    });
    
    const content = response.choices[0]?.message?.content || "{}";
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize modifier
    const validModifiers = Object.values(VERDICT_MODIFIER);
    const rawModifier = parsed.verdict?.modifier || "Speculative";
    const normalizedModifier = validModifiers.find(m => 
      m.toLowerCase() === rawModifier.toLowerCase() || 
      m.toLowerCase().replace("-", " ") === rawModifier.toLowerCase().replace("-", " ")
    ) || VERDICT_MODIFIER.SPECULATIVE;
    
    // Determine inferred fields
    const inferredFields: string[] = parsed.playerInfo?.inferredFields || [];
    if (!classification.position && parsed.playerInfo?.position) inferredFields.push("position");
    if (!classification.team && parsed.playerInfo?.team) inferredFields.push("team");
    
    // Determine data quality
    const dataQuality = (["HIGH", "MEDIUM", "LOW"].includes(parsed.dataQuality) 
      ? parsed.dataQuality 
      : newsSnippets.length >= 3 ? "MEDIUM" : "LOW") as DataConfidence;
    
    // Extract AI-detected career status
    const validCareerStatuses = ["ACTIVE", "RETIRED", "RETIRED_HOF", "DECEASED", "BUST"];
    const rawCareerStatus = parsed.playerInfo?.careerStatus?.toUpperCase();
    const aiDetectedCareerStatus = validCareerStatuses.includes(rawCareerStatus) 
      ? rawCareerStatus as "ACTIVE" | "RETIRED" | "RETIRED_HOF" | "DECEASED" | "BUST"
      : undefined;
    
    if (aiDetectedCareerStatus) {
      console.log(`[PlayerOutlook] AI detected career status for ${playerName}: ${aiDetectedCareerStatus}`);
    }
    
    // Parse peak timing - with fallback generation based on classification
    const validPeakStatuses = ["PRE_PEAK", "AT_PEAK", "POST_PEAK"];
    let peakTiming: PeakTimingAssessment;
    
    if (parsed.peakTiming) {
      peakTiming = {
        peakStatus: validPeakStatuses.includes(parsed.peakTiming.peakStatus) 
          ? parsed.peakTiming.peakStatus 
          : "UNKNOWN",
        peakReason: parsed.peakTiming.peakReason || "Unable to assess peak timing",
        shortTermOutlook: parsed.peakTiming.shortTermOutlook || "Monitor for signals",
        longTermOutlook: parsed.peakTiming.longTermOutlook || "Depends on continued performance",
      };
    } else {
      // Generate fallback peak timing based on stage and classification
      const stage = classification.stage;
      const isRB = classification.position?.toUpperCase() === "RB";
      
      if (stage === "ROOKIE" || stage === "YEAR_2") {
        peakTiming = {
          peakStatus: "PRE_PEAK",
          peakReason: `${playerName} is in early career years with significant upside potential.`,
          shortTermOutlook: "Card values likely to appreciate with continued strong performance.",
          longTermOutlook: "Long-term value depends on establishing consistent production and avoiding injuries.",
        };
      } else if (stage === "YEAR_3" || stage === "YEAR_4") {
        peakTiming = {
          peakStatus: isRB ? "AT_PEAK" : "PRE_PEAK",
          peakReason: isRB 
            ? `RBs typically peak in Years 3-4. ${playerName} may be near maximum card value.`
            : `${playerName} is entering prime production years with room for growth.`,
          shortTermOutlook: isRB ? "Consider taking profits on base cards if performance dips." : "Strong performance could drive further appreciation.",
          longTermOutlook: isRB ? "RB positional depreciation is a factor after Year 4." : "Premium cards hold value if elite production continues.",
        };
      } else if (stage === "PRIME") {
        peakTiming = {
          peakStatus: "AT_PEAK",
          peakReason: `${playerName} is in prime years with established market position.`,
          shortTermOutlook: "Prices reflect current production. Monitor for any decline signals.",
          longTermOutlook: "Long-term value depends on sustained elite performance and narrative moments.",
        };
      } else {
        peakTiming = {
          peakStatus: "POST_PEAK",
          peakReason: `${playerName} is past prime years. Cards may trend down without new catalysts.`,
          shortTermOutlook: "Consider reducing exposure on base and mid-tier cards.",
          longTermOutlook: "Premium graded cards may retain value better for career/HOF trajectory.",
        };
      }
    }
    
    // Parse tiered recommendations - with fallback generation
    const validTierVerdicts = ["SELL", "HOLD", "BUY"];
    let tieredRecommendations: TieredRecommendations;
    
    if (parsed.tieredRecommendations) {
      tieredRecommendations = {
        baseCards: {
          verdict: validTierVerdicts.includes(parsed.tieredRecommendations.baseCards?.verdict) 
            ? parsed.tieredRecommendations.baseCards.verdict 
            : "HOLD",
          reasoning: parsed.tieredRecommendations.baseCards?.reasoning || "Standard base card guidance applies",
        },
        midTierParallels: {
          verdict: validTierVerdicts.includes(parsed.tieredRecommendations.midTierParallels?.verdict) 
            ? parsed.tieredRecommendations.midTierParallels.verdict 
            : "HOLD",
          reasoning: parsed.tieredRecommendations.midTierParallels?.reasoning || "Standard parallel guidance applies",
        },
        premiumGraded: {
          verdict: validTierVerdicts.includes(parsed.tieredRecommendations.premiumGraded?.verdict) 
            ? parsed.tieredRecommendations.premiumGraded.verdict 
            : "HOLD",
          reasoning: parsed.tieredRecommendations.premiumGraded?.reasoning || "Standard graded guidance applies",
        },
      };
    } else {
      // Generate fallback tiered recommendations based on verdict and stage
      const verdictAction = parsed.verdict?.action || "MONITOR";
      const stage = classification.stage;
      const isRB = classification.position?.toUpperCase() === "RB";
      const isYear4PlusRB = isRB && (stage === "YEAR_4" || stage === "PRIME" || stage === "VETERAN" || stage === "AGING");
      
      if (verdictAction === "BUY") {
        tieredRecommendations = {
          baseCards: { verdict: "BUY", reasoning: "Low cost entry point with upside." },
          midTierParallels: { verdict: "BUY", reasoning: "Good risk/reward at current prices." },
          premiumGraded: { verdict: "HOLD", reasoning: "Wait for a dip before adding premium exposure." },
        };
      } else if (verdictAction === "AVOID") {
        tieredRecommendations = {
          baseCards: { verdict: "SELL", reasoning: "Reduce exposure on high-supply cards." },
          midTierParallels: { verdict: "SELL", reasoning: "Take profits while demand exists." },
          premiumGraded: { verdict: "HOLD", reasoning: "Premium may hold value better - sell only if needed." },
        };
      } else {
        // MONITOR/HOLD logic
        if (isYear4PlusRB) {
          tieredRecommendations = {
            baseCards: { verdict: "SELL", reasoning: "RB positional depreciation affects base cards first." },
            midTierParallels: { verdict: "HOLD", reasoning: "Hold if production remains elite." },
            premiumGraded: { verdict: "HOLD", reasoning: "Premium graded holds value for career totals." },
          };
        } else {
          tieredRecommendations = {
            baseCards: { verdict: "HOLD", reasoning: "Maintain current position." },
            midTierParallels: { verdict: "HOLD", reasoning: "Wait for clearer signals." },
            premiumGraded: { verdict: "HOLD", reasoning: "No urgency to buy or sell at current levels." },
          };
        }
      }
    }
    
    return {
      playerInfo: {
        name: playerName,
        sport,
        position: parsed.playerInfo?.position || classification.position || "Unknown",
        team: parsed.playerInfo?.team || classification.team || "Unknown",
        stage: classification.stage,
        rookieYear: parsed.playerInfo?.rookieYear || classification.rookieYear,
        inferred: inferredFields.length > 0,
        inferredFields,
      },
      aiDetectedCareerStatus,
      thesis: parsed.thesis || [
        "Market data for this player is limited",
        "Performance signals are unclear",
        "Proceed with caution and verify independently",
      ],
      marketRealityCheck: parsed.marketRealityCheck || [
        "Limited historical data makes pattern matching difficult",
        "Collector sentiment can shift quickly without warning",
      ],
      verdict: {
        action: (["BUY", "MONITOR", "AVOID"].includes(parsed.verdict?.action) 
          ? parsed.verdict.action 
          : "MONITOR") as PlayerVerdict,
        modifier: normalizedModifier as VerdictModifier,
        summary: parsed.verdict?.summary || "Insufficient data to make a confident recommendation. Monitor for more signals.",
        whatMustBeTrue: parsed.verdict?.whatMustBeTrue || ["More data needed"],
      },
      peakTiming,
      tieredRecommendations,
      discountAnalysis: parsed.discountAnalysis ? {
        whyDiscounted: parsed.discountAnalysis.whyDiscounted || [],
        repricingCatalysts: parsed.discountAnalysis.repricingCatalysts || [],
        trapRisks: parsed.discountAnalysis.trapRisks || [],
      } : undefined,
      confidence: (["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence) 
        ? parsed.confidence 
        : "LOW") as DataConfidence,
      dataQuality,
    };
  } catch (error) {
    console.error("[PlayerOutlook] AI generation error:", error);
    
    // Fallback response
    return {
      playerInfo: {
        name: playerName,
        sport,
        position: classification.position || "Unknown",
        team: classification.team || "Unknown",
        stage: classification.stage,
        rookieYear: classification.rookieYear,
        inferred: true,
        inferredFields: ["position", "team"],
      },
      thesis: [
        "Unable to generate detailed analysis at this time",
        "Check back later for updated outlook",
        "Consider researching this player independently",
      ],
      marketRealityCheck: [
        "Analysis system temporarily unavailable",
        "Verify any investment decisions with independent research",
      ],
      verdict: {
        action: "MONITOR",
        modifier: VERDICT_MODIFIER.SPECULATIVE as VerdictModifier,
        summary: "Analysis temporarily unavailable. Defaulting to MONITOR recommendation.",
        whatMustBeTrue: ["Analysis system needs to be available"],
      },
      confidence: "LOW",
      dataQuality: "LOW",
    };
  }
}

// Main function to get player outlook
export async function getPlayerOutlook(
  request: PlayerOutlookRequest
): Promise<PlayerOutlookResponse> {
  const { playerName, sport = "football", contextCard } = request;
  const playerKey = normalizePlayerKey(sport, playerName);
  
  // Ensure registry is fully loaded from database before lookups
  await ensureRegistryLoaded();
  
  console.log(`[PlayerOutlook] Generating outlook for: ${playerName} (${sport})`);
  
  // Check cache first
  const { outlook: cachedOutlook, isStale, cacheRecord } = await getCachedOutlook(playerKey);
  
  // Return cached if fresh
  if (cachedOutlook && !isStale) {
    console.log(`[PlayerOutlook] Cache HIT (fresh) for ${playerName}`);
    return { ...cachedOutlook, cacheStatus: "fresh" };
  }
  
  // If stale, return cached immediately and refresh async
  if (cachedOutlook && isStale) {
    console.log(`[PlayerOutlook] Cache HIT (stale) for ${playerName}, refreshing async`);
    
    // Fire-and-forget refresh
    generateFreshOutlook(playerName, sport, playerKey).catch(err => {
      console.error(`[PlayerOutlook] Background refresh failed:`, err);
    });
    
    return { ...cachedOutlook, cacheStatus: "stale" };
  }
  
  // Cache miss - generate fresh
  console.log(`[PlayerOutlook] Cache MISS for ${playerName}, generating fresh`);
  const freshOutlook = await generateFreshOutlook(playerName, sport, playerKey);
  return { ...freshOutlook, cacheStatus: "miss" };
}

// Generate fresh outlook (used for cache miss and background refresh)
async function generateFreshOutlook(
  playerName: string,
  sport: string,
  playerKey: string
): Promise<PlayerOutlookResponse> {
  // Step 1: Get news signals
  const { momentum, newsHype, snippets, detectedStage } = await getPlayerNewsSignals(playerName, sport);
  
  // Step 2: Run classification engine
  // If news detected a special stage (BUST, RETIRED, RETIRED_HOF), use it
  const classificationInput: ClassificationInput = {
    playerName,
    sport,
    recentMomentum: momentum,
    newsHype,
    careerStage: detectedStage,
  };
  
  const classification = classifyPlayer(classificationInput);
  console.log(`[PlayerOutlook] Classification for ${playerName}: stage=${classification.stage}, temp=${classification.baseTemperature}`);
  
  // Step 2.5: Re-analyze team context with detected team
  const teamContextWithTeam = analyzeTeamContext(snippets, classification.team);
  
  // Step 3: Generate AI narrative
  const { playerInfo, thesis, marketRealityCheck, verdict, confidence, dataQuality, aiDetectedCareerStatus, peakTiming, tieredRecommendations } = await generatePlayerOutlookAI(
    playerName,
    sport,
    classification,
    snippets,
    teamContextWithTeam
  );
  
  // Step 3.5: If AI detected a non-active career status (DECEASED, RETIRED_HOF, BUST, RETIRED),
  // re-run classification with the AI's stage to get correct investment verdict
  // IMPORTANT: Only trust AI career status if the player is NOT in the registry.
  // Registry is authoritative - AI often misreads "HOF?" or "Future HOF" from eBay titles.
  let finalClassification = classification;
  
  // Check registry first - registry is ALWAYS authoritative
  const registryResult = lookupPlayer(playerName);
  const playerInRegistry = registryResult.found;
  
  // Apply registry data to playerInfo if available
  let enrichedPlayerInfo = { ...playerInfo };
  
  if (playerInRegistry && registryResult.entry) {
    console.log(`[PlayerOutlook] Player "${playerName}" found in registry - applying authoritative data`);
    const entry = registryResult.entry;
    
    // Apply registry career stage (authoritative)
    if (entry.careerStage) {
      const stageMap: Record<string, PlayerStage> = {
        "ROOKIE": "ROOKIE",
        "YEAR_2": "YEAR_2",
        "YEAR_3": "YEAR_3",
        "YEAR_4": "YEAR_4",
        "PRIME": "PRIME",
        "VETERAN": "VETERAN",
        "AGING": "AGING",
        "RETIRED": "RETIRED",
        "RETIRED_HOF": "RETIRED_HOF",
        "BUST": "BUST",
      };
      const mappedStage = stageMap[entry.careerStage];
      if (mappedStage) {
        enrichedPlayerInfo.stage = mappedStage;
      }
    }
    
    // Apply registry position group (authoritative)
    if (entry.positionGroup && entry.positionGroup !== "UNKNOWN") {
      enrichedPlayerInfo.position = entry.positionGroup;
    }
    
    // Player is in registry - mark as NOT inferred since we have authoritative data
    // The registry is our source of truth for this player
    enrichedPlayerInfo.inferred = false;
    enrichedPlayerInfo.inferredFields = [];
    
    // Re-run classification with registry stage for correct investment signals
    const registryStageMap: Record<string, PlayerStage> = {
      "ROOKIE": "ROOKIE",
      "YEAR_2": "YEAR_2",
      "YEAR_3": "YEAR_3",
      "YEAR_4": "YEAR_4",
      "PRIME": "PRIME",
      "VETERAN": "VETERAN",
      "AGING": "AGING",
      "RETIRED": "RETIRED",
      "RETIRED_HOF": "RETIRED_HOF",
      "BUST": "BUST",
    };
    const registryStage = registryStageMap[entry.careerStage];
    if (registryStage && registryStage !== classification.stage) {
      console.log(`[PlayerOutlook] Registry override: ${playerName} stage ${classification.stage} → ${registryStage}`);
      const correctedInput: ClassificationInput = {
        playerName,
        sport,
        recentMomentum: momentum,
        newsHype,
        careerStage: registryStage,
      };
      finalClassification = classifyPlayer(correctedInput);
    }
  } else if (aiDetectedCareerStatus && aiDetectedCareerStatus !== "ACTIVE") {
    // Only apply AI override for players NOT in the registry
    // Map AI career status to our PlayerStage enum
    const stageMap: Record<string, PlayerStage> = {
      "DECEASED": "RETIRED_HOF",    // Deceased legends = RETIRED_HOF for investment purposes
      "RETIRED_HOF": "RETIRED_HOF",
      "RETIRED": "RETIRED",
      "BUST": "BUST",
    };
    const correctedStage = stageMap[aiDetectedCareerStatus];
    
    if (correctedStage && correctedStage !== classification.stage) {
      console.log(`[PlayerOutlook] AI override (no registry entry): ${playerName} stage ${classification.stage} → ${correctedStage}`);
      
      // Re-run classification with corrected stage
      const correctedInput: ClassificationInput = {
        playerName,
        sport,
        recentMomentum: momentum,
        newsHype,
        careerStage: correctedStage,
      };
      finalClassification = classifyPlayer(correctedInput);
    }
  }
  
  // Step 4: Get exposure recommendations
  const exposures = getExposureRecommendations(finalClassification, sport, playerName);
  
  // Step 5: Build snapshot (use finalClassification which may have been corrected by AI)
  const snapshot: PlayerSnapshot = {
    temperature: finalClassification.baseTemperature,
    volatility: finalClassification.baseVolatility,
    risk: finalClassification.baseRisk,
    horizon: finalClassification.baseHorizon,
    confidence,
  };
  
  // Step 6: Calculate valuation using heuristic model
  const valuation = calculateValuation(sport, finalClassification, verdict.modifier);
  
  // Step 7: Build evidence with modeled valuation
  const evidence: EvidenceData = {
    compsSummary: {
      available: true,
      median: valuation.estimatedRange.mid,
      low: valuation.estimatedRange.low,
      high: valuation.estimatedRange.high,
      soldCount: undefined,
      source: "modeled",
    },
    referenceComps: valuation.referenceComps,
    notes: [
      snippets.length === 0 ? "Limited news data available" : `${snippets.length} recent news items analyzed`,
      `Classification: ${finalClassification.stage} stage, ${finalClassification.baseTemperature} market`,
      valuation.methodology,
      "Modeled estimate - not live market data. Use as directional guidance.",
    ],
    newsSnippets: snippets.slice(0, 3),
    lastUpdated: new Date().toISOString(),
    dataQuality,
  };
  
  // Step 8: Generate Investment Call (new 5-state forced-decision system)
  const momentumMap: Record<string, "UP" | "DOWN" | "STABLE"> = {
    up: "UP",
    down: "DOWN",
    flat: "STABLE",
  };
  const hypeMap: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
    high: "HIGH",
    medium: "MEDIUM",
    low: "LOW",
    none: "LOW",
  };
  
  // Infer role tier from news context for players not in registry
  const inferredRoleTier = inferRoleTierFromContext(snippets, playerName);
  
  const investmentCall = generateInvestmentCall({
    stage: finalClassification.stage,
    temperature: finalClassification.baseTemperature,
    volatility: finalClassification.baseVolatility,
    risk: finalClassification.baseRisk,
    horizon: finalClassification.baseHorizon,
    confidence,
    exposures,
    thesis,
    marketRealityCheck,
    compData: evidence.compsSummary,
    newsCount: snippets.length,
    momentum: momentumMap[momentum] || "STABLE",
    newsHype: hypeMap[newsHype] || "LOW",
    team: enrichedPlayerInfo.team,
    position: enrichedPlayerInfo.position,
    playerName: playerName,
    inferredRoleTier: inferredRoleTier,
  });
  
  // Step 9: Build response
  const response: PlayerOutlookResponse = {
    player: enrichedPlayerInfo,
    snapshot,
    thesis,
    marketRealityCheck,
    verdict,
    investmentCall,
    exposures,
    evidence,
    peakTiming,
    tieredRecommendations,
    teamContext: teamContextWithTeam,
    generatedAt: new Date().toISOString(),
  };
  
  // Step 10: Save to cache
  await saveToCache(playerKey, sport, playerName, classification, response);
  
  return response;
}

// Export for testing
export { normalizePlayerKey, getTtlMs };
