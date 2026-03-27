import { GoogleGenAI } from "@google/genai";
import { db } from "./db";
import { playerOutlookCache, playerOutlookHistory, cardPriceObservations, cardInterestEvents } from "@shared/schema";
import { eq, and, gt, lt, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import { classifyPlayer, getExposureRecommendations, type ClassificationInput, type ClassificationOutput } from "./playerClassificationEngine";
import { calculateValuation } from "./valuationService";
import { generateInvestmentCall, getRoleTier, getRoleStabilityScore, type RoleTier } from "./investmentDecisionEngine";
import { generateMarketVerdict, type MarketScoringInput } from "./marketScoringEngine";
import { lookupPlayer, ensureRegistryLoaded } from "./playerRegistry";
import type { MarketMetrics } from "@shared/schema";

// ============================================================
// AI-BASED ROLE TIER INFERENCE
// For players not in registry, infer role from news context
// Now also accepts roleStatus from Gemini search for more accurate inference
// ============================================================
function inferRoleTierFromContext(newsSnippets: string[], playerName: string, roleStatus?: string, injuryStatus?: string): RoleTier {
  // If we have a direct roleStatus from Gemini search, use it first (most accurate)
  if (roleStatus) {
    const status = roleStatus.toUpperCase();
    if (status === "STAR" || status === "FRANCHISE_CORE") {
      console.log(`[RoleTierInference] ${playerName}: AI detected ${status} → FRANCHISE_CORE`);
      return "FRANCHISE_CORE";
    }
    if (status === "INJURED_RESERVE") {
      console.log(`[RoleTierInference] ${playerName}: AI detected INJURED_RESERVE → BACKUP`);
      return "BACKUP";
    }
    if (status === "BUST" || status === "OUT_OF_LEAGUE" || status === "FREE_AGENT") {
      console.log(`[RoleTierInference] ${playerName}: AI detected ${status} → OUT_OF_LEAGUE`);
      return "OUT_OF_LEAGUE";
    }
    if (status === "BACKUP" || status === "ROTATIONAL") {
      console.log(`[RoleTierInference] ${playerName}: AI detected ${status} → BACKUP`);
      return "BACKUP";
    }
    if (status === "STARTER") {
      console.log(`[RoleTierInference] ${playerName}: AI detected STARTER`);
      return "STARTER";
    }
    if (status === "UNCERTAIN") {
      console.log(`[RoleTierInference] ${playerName}: AI detected UNCERTAIN → UNCERTAIN_STARTER`);
      return "UNCERTAIN_STARTER";
    }
    // For UNKNOWN, fall through to keyword analysis
  }
  
  // Fallback: keyword-based inference from news snippets
  const context = newsSnippets.join(" ").toLowerCase();
  
  // FRANCHISE_CORE indicators (clear star status)
  const franchiseIndicators = [
    "mvp", "all-pro", "all-star", "pro bowl", "superstar",
    "franchise player", "face of the franchise", "star quarterback",
    "best player", "elite", "top-5", "top 5", "top-10", "top 10",
    "super bowl favorite", "championship", "playoff contender",
    "leading the", "carries the team", "franchise qb",
    "all-nba", "all-nfl", "cy young", "triple crown",
    "#1 pick", "#1 overall", "first overall", "number one pick",
    "top prospect", "generational talent", "generational prospect",
    "franchise cornerstone", "future star", "future franchise",
    "consensus #1", "projected #1", "expected to go first",
    "number 1 pick", "no. 1 pick", "no. 1 overall",
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
    "injured reserve", "ir", "season-ending", "surgery", "missed season",
  ];
  
  // OUT_OF_LEAGUE indicators - expanded to catch free agents
  const outOfLeagueIndicators = [
    "released", "cut", "waived", "unsigned", "free agent looking",
    "no team", "without a team", "still looking for",
    "out of the league", "career in jeopardy",
    "free agent", "currently unsigned", "not on a roster",
    "remains unsigned", "hasn't signed", "has not signed",
    "cut by", "released by", "waived by", "let go by",
    "failed physical", "didn't make the roster", "training camp cut",
    "off the team", "not currently on", "former starter",
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

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// Prompt version - increment this when making significant prompt changes
// to auto-invalidate cached outlooks generated with older prompts
const PROMPT_VERSION = 19; // v19: Tiered volatility dampening for extreme CV players

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

// Generate hash for outlook snapshot to detect changes
function generateSnapshotHash(verdict: string, modifier: string, temperature: string): string {
  const input = `${verdict}:${modifier}:${temperature}`;
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

// Save outlook history snapshot (only when verdict/modifier/temperature changes)
async function saveToHistory(
  playerKey: string,
  playerName: string,
  sport: string,
  outlook: PlayerOutlookResponse
): Promise<void> {
  const verdict = outlook.investmentCall?.verdict || outlook.verdict?.action || "UNKNOWN";
  const modifier = outlook.investmentCall?.postureLabel || outlook.verdict?.modifier || "NONE";
  const temperature = outlook.snapshot?.temperature || "NEUTRAL";
  const confidence = outlook.investmentCall?.confidence || "LOW";
  
  const snapshotHash = generateSnapshotHash(verdict, modifier, temperature);
  
  // Check if we already have a snapshot with this exact hash (no change)
  const existingWithHash = await db
    .select({ id: playerOutlookHistory.id })
    .from(playerOutlookHistory)
    .where(and(
      eq(playerOutlookHistory.playerKey, playerKey),
      eq(playerOutlookHistory.snapshotHash, snapshotHash)
    ))
    .limit(1);
  
  // Only record if this is a new state (hash changed)
  if (existingWithHash.length === 0) {
    console.log(`[OutlookHistory] Recording new snapshot for ${playerName}: ${verdict}/${modifier}/${temperature}`);
    await db.insert(playerOutlookHistory).values({
      playerKey,
      playerName,
      sport,
      verdict,
      modifier,
      temperature,
      confidence,
      outlookJson: outlook,
      snapshotHash,
      snapshotAt: new Date(),
    });
  } else {
    console.log(`[OutlookHistory] No change for ${playerName}, skipping history record`);
  }
}

// Get outlook history for a player
export async function getPlayerOutlookHistory(
  playerKey: string,
  limit: number = 10
): Promise<typeof playerOutlookHistory.$inferSelect[]> {
  return await db
    .select()
    .from(playerOutlookHistory)
    .where(eq(playerOutlookHistory.playerKey, playerKey))
    .orderBy(desc(playerOutlookHistory.snapshotAt))
    .limit(limit);
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
  
  // Record to history before updating cache (only if verdict/modifier/temp changed)
  try {
    await saveToHistory(playerKey, playerName, sport, outlook);
  } catch (historyError) {
    console.error(`[OutlookHistory] Failed to save history for ${playerName}:`, historyError);
    // Don't fail the main cache operation if history fails
  }
  
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

// Get news/hype signals about the player using Gemini with Google Search grounding
async function getPlayerNewsSignals(playerName: string, sport: string): Promise<{
  momentum: "up" | "flat" | "down";
  newsHype: "high" | "medium" | "low" | "none";
  snippets: string[];
  detectedStage?: "BUST" | "RETIRED" | "RETIRED_HOF";
  teamContext?: TeamContext;
  roleStatus?: string;
  injuryStatus?: string;
  aiCareerStage?: string;
  aiRookieYear?: number;
  aiPosition?: string;
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

  const maxRetries = 3;
  let lastError: Error | null = null;
  const currentYear = new Date().getFullYear();
  
  // Use Gemini with Google Search grounding for accurate, current news
  const searchPrompt = `Search for the latest news about ${playerName} ${sport} player in ${currentYear}.

Focus on finding:
1. Current team and roster status (starter, backup, injured reserve, depth chart position)
2. Recent performance news (games played, stats, injuries)
3. Role changes (lost starting job, promoted to starter, traded, released)
4. Any injuries, surgeries, or health concerns
5. Career status (active, retired, hall of fame, deceased)

Return ONLY a JSON object with these exact fields:
{
  "snippets": ["<news snippet 1>", "<news snippet 2>", ...],
  "newsCount": <number of news articles found>,
  "momentum": "up" | "flat" | "down",
  "roleStatus": "<STAR | STARTER | BACKUP | INJURED_RESERVE | ROTATIONAL | UNCERTAIN | OUT_OF_LEAGUE | UNKNOWN>",
  "injuryStatus": "<HEALTHY | INJURED | RECOVERING | UNKNOWN>",
  "careerStatus": "<ACTIVE | RETIRED | RETIRED_HOF | DECEASED | BUST | UNKNOWN>",
  "careerStage": "<ROOKIE | YEAR_2 | YEAR_3 | YEAR_4 | PRIME | VETERAN | AGING | UNKNOWN>",
  "rookieYear": <year they were drafted or debuted professionally, or null if unknown>,
  "position": "<their primary position, e.g. QB, RB, WR, C, PG, SG, SF, PF, SS, OF, SP, etc.>",
  "details": "<brief summary of current situation>"
}

Role status rules:
- STAR: MVP candidate, All-Star/All-Pro, franchise player, #1 draft pick, generational talent, top prospect, face of the franchise
- STARTER: Named starter, starting lineup, first-string (but not a star/franchise player)
- BACKUP: Second-string, depth chart QB2+, behind another player (includes young developing backups)
- INJURED_RESERVE: On IR, season-ending injury, had surgery, missed season
- ROTATIONAL: Part-time role, platoon, time-share
- OUT_OF_LEAGUE: Released, cut, waived, unsigned free agent, not on any roster
- UNCERTAIN: Role unclear or in flux

Career stage rules (based on YEARS in the league, not age):
- ROOKIE: First professional season (drafted or debuted this year ${currentYear})
- YEAR_2: Second professional season (drafted/debuted ${currentYear - 1})
- YEAR_3: Third professional season (drafted/debuted ${currentYear - 2})
- YEAR_4: Fourth professional season (drafted/debuted ${currentYear - 3})
- PRIME: Established player in their best years (typically years 4-10 in the league)
- VETERAN: Experienced player past prime but still productive (typically 10+ years)
- AGING: Late career, declining production, retirement approaching
- UNKNOWN: Cannot determine career stage

Career status rules:
- ACTIVE: Currently playing professionally (includes starters, backups, practice squad, injured reserve - anyone on a roster)
- RETIRED: No longer playing but not HOF
- RETIRED_HOF: Hall of fame, legend, all-time great
- DECEASED: Passed away
- BUST: Career has failed - out of the league with no realistic path back (can be young OR veteran)

BUST CLARIFICATION:
- Young backup ON A TEAM = ACTIVE (still developing, has a roster spot)
- Young player OUT OF LEAGUE = can be BUST (washed out, no team wants them)
- The key is roster status: on a roster = ACTIVE, out of league = potentially BUST`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[PlayerOutlook] News fetch attempt ${attempt} for: ${playerName}`);
      
      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      let responseText = response.text || "";
      console.log(`[PlayerOutlook] Gemini news response length: ${responseText.length}`);
      
      // Strip markdown code fences if present (common in Gemini responses)
      responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const snippets = Array.isArray(parsed.snippets) ? parsed.snippets : [];
          
          // Determine momentum - override based on role/injury status
          let momentum: "up" | "flat" | "down" = parsed.momentum || "flat";
          if (parsed.roleStatus === "INJURED_RESERVE" || parsed.injuryStatus === "INJURED") {
            momentum = "down";
          } else if (parsed.roleStatus === "BACKUP" || parsed.roleStatus === "BUST") {
            momentum = "down";
          }
          
          // Determine news hype level
          const newsCount = parsed.newsCount || snippets.length;
          const newsHype = newsCount >= 5 ? "high" : newsCount >= 3 ? "medium" : newsCount >= 1 ? "low" : "none";
          
          // Map career status to detected stage
          // CRITICAL: Only use careerStatus for BUST classification, NOT roleStatus
          // roleStatus="BUST" just means "backup/fringe player" - NOT that their career is over
          // Young backups (YEAR_2 RBs like Bhayshul Tuten) were getting misclassified as BUST
          // when they're actually still developing - this caused "structural decline" messaging
          let detectedStage: "BUST" | "RETIRED" | "RETIRED_HOF" | undefined = undefined;
          const careerStatus = parsed.careerStatus?.toUpperCase();
          if (careerStatus === "RETIRED_HOF" || careerStatus === "DECEASED") {
            detectedStage = "RETIRED_HOF";
          } else if (careerStatus === "RETIRED") {
            detectedStage = "RETIRED";
          } else if (careerStatus === "BUST") {
            // Only explicit careerStatus=BUST triggers BUST stage
            // NOT roleStatus - a backup RB isn't a "bust", just developing
            detectedStage = "BUST";
          }
          
          // Analyze team context from snippets
          const teamContext = analyzeTeamContext(snippets, undefined);
          
          const aiCareerStage = parsed.careerStage || undefined;
          const aiRookieYear = parsed.rookieYear && typeof parsed.rookieYear === "number" ? parsed.rookieYear : undefined;
          const aiPosition = parsed.position || undefined;
          
          console.log(`[PlayerOutlook] News for ${playerName}: ${newsCount} articles, momentum: ${momentum}, role: ${parsed.roleStatus}, injury: ${parsed.injuryStatus}, career: ${careerStatus}, aiStage: ${aiCareerStage || "none"}, rookieYear: ${aiRookieYear || "none"}, position: ${aiPosition || "none"} → stage=${detectedStage || "none"}`);
          
          return { 
            momentum, 
            newsHype, 
            snippets, 
            detectedStage, 
            teamContext,
            roleStatus: parsed.roleStatus,
            injuryStatus: parsed.injuryStatus,
            aiCareerStage,
            aiRookieYear,
            aiPosition,
          };
        } catch (parseError) {
          console.error(`[PlayerOutlook] Failed to parse news JSON (attempt ${attempt}):`, responseText.substring(0, 200));
          // Continue to next retry attempt on parse failure
        }
      } else {
        console.log(`[PlayerOutlook] No JSON found in response (attempt ${attempt})`);
        // Continue to next retry attempt
      }
      
    } catch (error: any) {
      lastError = error;
      console.error(`[PlayerOutlook] Gemini news error (attempt ${attempt}):`, error.message);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[PlayerOutlook] Retrying news fetch in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error("[PlayerOutlook] News fetch failed after retries:", lastError?.message);
  return { momentum: "flat", newsHype: "none", snippets: [] };
}

async function aggregateInternalMetrics(playerName: string): Promise<Partial<MarketMetrics>> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const normalizedName = playerName.toLowerCase().trim();

    const [priceObs, recentEvents, olderPriceObs] = await Promise.all([
      db.select({
        count: sql<number>`count(*)::int`,
        avgPrice: sql<number>`avg(price_estimate)`,
        minPrice: sql<number>`min(price_estimate)`,
        maxPrice: sql<number>`max(price_estimate)`,
      })
        .from(cardPriceObservations)
        .where(and(
          sql`lower(player_name) = ${normalizedName}`,
          gt(cardPriceObservations.createdAt, thirtyDaysAgo)
        )),

      db.select({
        eventType: cardInterestEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
        .from(cardInterestEvents)
        .where(and(
          sql`lower(player_name) = ${normalizedName}`,
          gt(cardInterestEvents.createdAt, sevenDaysAgo)
        ))
        .groupBy(cardInterestEvents.eventType),

      db.select({
        avgPrice: sql<number>`avg(price_estimate)`,
      })
        .from(cardPriceObservations)
        .where(and(
          sql`lower(player_name) = ${normalizedName}`,
          gt(cardPriceObservations.createdAt, sixtyDaysAgo),
          lt(cardPriceObservations.createdAt, thirtyDaysAgo)
        )),
    ]);

    const obsRow = priceObs[0];
    const olderRow = olderPriceObs[0];

    const scans = recentEvents.find(e => e.eventType === "scan")?.count || 0;
    const adds = recentEvents.find(e => e.eventType === "add")?.count || 0;

    let internalPriceChange: number | undefined;
    if (obsRow?.avgPrice && olderRow?.avgPrice && olderRow.avgPrice > 0) {
      internalPriceChange = (obsRow.avgPrice - olderRow.avgPrice) / olderRow.avgPrice;
    }

    const result: Partial<MarketMetrics> = {};
    if (obsRow?.count && obsRow.count > 0) {
      result.internalObservationCount = obsRow.count;
      result.internalAvgPrice = Math.round(obsRow.avgPrice * 100) / 100;
      result.internalPriceChange = internalPriceChange !== undefined ? Math.round(internalPriceChange * 1000) / 1000 : undefined;
    }
    if (scans > 0) result.weeklyScans = scans;
    if (adds > 0) result.weeklyAdds = adds;

    console.log(`[PlayerOutlook] Internal metrics for ${playerName}: obs=${obsRow?.count || 0}, avgPrice=$${obsRow?.avgPrice?.toFixed(2) || "N/A"}, priceChange=${internalPriceChange?.toFixed(3) || "N/A"}, scans=${scans}, adds=${adds}`);

    return result;
  } catch (error) {
    console.error(`[PlayerOutlook] Internal metrics aggregation failed for ${playerName}:`, error);
    return {};
  }
}

// Fetch player market data (all cards sold) using Gemini with Google Search grounding
interface PlayerMarketData {
  available: boolean;
  totalAvgPrice?: number;
  avgSoldPrice7d?: number;
  estimatedVolume?: "high" | "medium" | "low";
  volumeTrend?: "up" | "stable" | "down";
  priceRange?: { low: number; high: number };
  soldCount30d?: number;
  soldCount7d?: number;
  soldCountPrev30d?: number;
  activeListingCount?: number;
  medianSoldPrice?: number;
  priceTrendPercent?: number;
  priceStdDev30d?: number;
  breakdown?: {
    category: string;
    avgPrice: number;
    priceRange: string;
  }[];
  source: "gemini_search" | "unavailable";
  observations?: string[];
}

async function fetchPlayerMarketData(playerName: string, sport: string): Promise<PlayerMarketData> {
  const maxRetries = 2;
  let lastError: Error | null = null;
  
  const searchPrompt = `Search for all sports cards sold for ${playerName} (${sport}) over the last 30 days on eBay and other card marketplaces.

Provide a detailed market summary with NUMERIC data:
1. Total average sale price across ALL cards (base, parallels, autos, graded, etc.) for last 30 days
2. Average sale price for the last 7 days specifically
3. Median sale price across all cards (30 days)
4. Approximate number of cards sold in the last 30 days (actual count or best estimate)
5. Approximate number of cards sold in the last 7 days specifically
6. Approximate number of cards sold in the PRIOR 30-day period (days 31-60 ago) for comparison
7. Approximate number of active/unsold listings currently available
8. Estimated sales volume category (high/medium/low)
9. Volume trend compared to previous period (up/stable/down)
10. Price trend direction as a percentage change vs prior 30 days (e.g., +15 means prices up 15%, -10 means prices down 10%)
11. Standard deviation of sale prices over the last 30 days (rough estimate)
12. Price range from lowest to highest sale
13. Breakdown by card category with average prices

Return ONLY a JSON object:
{
  "totalAvgPrice": <number - average sale price across all cards, 30d>,
  "avgSoldPrice7d": <number - average sale price last 7 days>,
  "medianSoldPrice": <number - median sale price>,
  "soldCount30d": <number - approximate cards sold in last 30 days>,
  "soldCount7d": <number - approximate cards sold in last 7 days>,
  "soldCountPrev30d": <number - approximate cards sold in prior 30 days (days 31-60)>,
  "activeListingCount": <number - approximate active unsold listings>,
  "estimatedVolume": "high" | "medium" | "low",
  "volumeTrend": "up" | "stable" | "down",
  "priceTrendPercent": <number - percentage price change vs prior period, e.g. 15 or -10>,
  "priceStdDev30d": <number - standard deviation of sale prices over 30 days>,
  "priceRange": { "low": <number>, "high": <number> },
  "breakdown": [
    { "category": "Base/Common", "avgPrice": <number>, "priceRange": "$X - $Y" },
    { "category": "Refractors/Inserts", "avgPrice": <number>, "priceRange": "$X - $Y" },
    { "category": "Numbered/Auto", "avgPrice": <number>, "priceRange": "$X - $Y" },
    { "category": "High-End/PSA 10", "avgPrice": <number>, "priceRange": "$X - $Y" }
  ],
  "observations": ["<key market observation 1>", "<key market observation 2>"]
}

If no sales data is found, return: { "available": false }`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[PlayerOutlook] Market data fetch attempt ${attempt} for: ${playerName}`);
      
      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      let responseText = response.text || "";
      console.log(`[PlayerOutlook] Gemini market data response length: ${responseText.length}`);
      
      // Strip markdown code fences if present
      responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          
          if (parsed.available === false) {
            console.log(`[PlayerOutlook] No market data available for ${playerName}`);
            return { available: false, source: "unavailable" };
          }
          
          console.log(`[PlayerOutlook] Market data for ${playerName}: avg=$${parsed.totalAvgPrice}, sold=${parsed.soldCount30d}, active=${parsed.activeListingCount}, volume=${parsed.estimatedVolume}, trend=${parsed.priceTrendPercent}%`);
          
          const validVolumes = ["high", "medium", "low"] as const;
          const estimatedVolume = validVolumes.includes(parsed.estimatedVolume) 
            ? parsed.estimatedVolume as "high" | "medium" | "low"
            : undefined;
          
          const validTrends = ["up", "stable", "down"] as const;
          const volumeTrend = validTrends.includes(parsed.volumeTrend)
            ? parsed.volumeTrend as "up" | "stable" | "down"
            : undefined;
          
          return {
            available: true,
            totalAvgPrice: parsed.totalAvgPrice,
            avgSoldPrice7d: typeof parsed.avgSoldPrice7d === "number" ? parsed.avgSoldPrice7d : undefined,
            medianSoldPrice: typeof parsed.medianSoldPrice === "number" ? parsed.medianSoldPrice : undefined,
            soldCount30d: typeof parsed.soldCount30d === "number" ? parsed.soldCount30d : undefined,
            soldCount7d: typeof parsed.soldCount7d === "number" ? parsed.soldCount7d : undefined,
            soldCountPrev30d: typeof parsed.soldCountPrev30d === "number" ? parsed.soldCountPrev30d : undefined,
            activeListingCount: typeof parsed.activeListingCount === "number" ? parsed.activeListingCount : undefined,
            priceTrendPercent: typeof parsed.priceTrendPercent === "number" ? parsed.priceTrendPercent : undefined,
            priceStdDev30d: typeof parsed.priceStdDev30d === "number" ? parsed.priceStdDev30d : undefined,
            estimatedVolume,
            volumeTrend,
            priceRange: parsed.priceRange,
            breakdown: Array.isArray(parsed.breakdown) ? parsed.breakdown : undefined,
            observations: Array.isArray(parsed.observations) ? parsed.observations.slice(0, 2) : undefined,
            source: "gemini_search",
          };
        } catch (parseError) {
          console.error(`[PlayerOutlook] Failed to parse market data JSON (attempt ${attempt}):`, responseText.substring(0, 200));
        }
      } else {
        console.log(`[PlayerOutlook] No JSON found in market data response (attempt ${attempt})`);
      }
      
    } catch (error: any) {
      lastError = error;
      console.error(`[PlayerOutlook] Gemini market data error (attempt ${attempt}):`, error.message);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.log(`[PlayerOutlook] Primary market data search failed for ${playerName}, trying simplified fallback...`);
  
  try {
    const fallbackPrompt = `What is the approximate eBay sold price and sales volume for ${playerName} ${sport} cards in the last 30 days?

Return ONLY a JSON object with your best estimates:
{
  "totalAvgPrice": <number>,
  "soldCount30d": <number>,
  "activeListingCount": <number>,
  "estimatedVolume": "high" | "medium" | "low",
  "volumeTrend": "up" | "stable" | "down"
}

If truly unknown, return: { "available": false }`;

    const fallbackResponse = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fallbackPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    let fallbackText = fallbackResponse.text || "";
    fallbackText = fallbackText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
    const jsonMatch = fallbackText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.available !== false && typeof parsed.totalAvgPrice === "number") {
        console.log(`[PlayerOutlook] Fallback market data for ${playerName}: avg=$${parsed.totalAvgPrice}, sold=${parsed.soldCount30d}, volume=${parsed.estimatedVolume}`);
        const validVolumes = ["high", "medium", "low"] as const;
        const estimatedVolume = validVolumes.includes(parsed.estimatedVolume) 
          ? parsed.estimatedVolume as "high" | "medium" | "low"
          : undefined;
        const validTrends = ["up", "stable", "down"] as const;
        const volumeTrend = validTrends.includes(parsed.volumeTrend)
          ? parsed.volumeTrend as "up" | "stable" | "down"
          : undefined;
        return {
          available: true,
          totalAvgPrice: parsed.totalAvgPrice,
          soldCount30d: typeof parsed.soldCount30d === "number" ? parsed.soldCount30d : undefined,
          activeListingCount: typeof parsed.activeListingCount === "number" ? parsed.activeListingCount : undefined,
          estimatedVolume,
          volumeTrend,
          source: "gemini_search",
        };
      }
    }
  } catch (fallbackError: any) {
    console.error("[PlayerOutlook] Fallback market data search also failed:", fallbackError.message);
  }

  console.error("[PlayerOutlook] All market data fetch attempts failed for:", playerName);
  return { available: false, source: "unavailable" };
}

function buildMarketMetrics(
  geminiData: PlayerMarketData,
  internalData: Partial<MarketMetrics>
): MarketMetrics {
  const hasGemini = geminiData.available && geminiData.totalAvgPrice !== undefined;
  const hasInternal = (internalData.internalObservationCount ?? 0) > 0;

  const volumeFallbackMap: Record<string, number> = { high: 150, medium: 50, low: 15 };

  const metrics: MarketMetrics = {
    source: hasGemini && hasInternal ? "blended" : hasGemini ? "gemini_search" : hasInternal ? "internal" : "unavailable",
    soldCount30d: hasGemini && geminiData.soldCount30d !== undefined
      ? geminiData.soldCount30d
      : hasGemini && geminiData.estimatedVolume
        ? volumeFallbackMap[geminiData.estimatedVolume]
        : undefined,
    soldCount7d: hasGemini ? geminiData.soldCount7d : undefined,
    soldCountPrev30d: hasGemini ? geminiData.soldCountPrev30d : undefined,
    activeListingCount: hasGemini ? geminiData.activeListingCount : undefined,
    avgSoldPrice: hasGemini ? geminiData.totalAvgPrice : internalData.internalAvgPrice,
    avgSoldPrice7d: hasGemini ? geminiData.avgSoldPrice7d : undefined,
    medianSoldPrice: hasGemini && geminiData.medianSoldPrice ? geminiData.medianSoldPrice : (hasGemini ? geminiData.totalAvgPrice : internalData.internalAvgPrice),
    priceTrend: undefined,
    priceStdDev30d: hasGemini ? geminiData.priceStdDev30d : undefined,
    volumeTrend: hasGemini ? geminiData.volumeTrend : undefined,
    priceRangeLow: hasGemini && geminiData.priceRange ? geminiData.priceRange.low : undefined,
    priceRangeHigh: hasGemini && geminiData.priceRange ? geminiData.priceRange.high : undefined,
    internalObservationCount: internalData.internalObservationCount,
    internalAvgPrice: internalData.internalAvgPrice,
    internalPriceChange: internalData.internalPriceChange,
    weeklyScans: internalData.weeklyScans,
    weeklyAdds: internalData.weeklyAdds,
  };

  if (hasGemini && geminiData.priceTrendPercent !== undefined) {
    metrics.priceTrend = geminiData.priceTrendPercent / 100;
  } else if (internalData.internalPriceChange !== undefined) {
    metrics.priceTrend = internalData.internalPriceChange;
  }

  if (metrics.priceRangeLow !== undefined && metrics.priceRangeHigh !== undefined && metrics.avgSoldPrice && metrics.avgSoldPrice > 0) {
    const spread = (metrics.priceRangeHigh - metrics.priceRangeLow) / metrics.avgSoldPrice;
    metrics.volatilityEstimate = Math.min(1, Math.max(0, spread / 5));
  }

  return metrics;
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
  marketDataConfidence: DataConfidence;
  newsCoverageConfidence: DataConfidence;
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
- "ACTIVE": Player is currently on a roster (includes starters, backups, practice squad, injured reserve)
- "RETIRED": Player has retired from professional play but is not a Hall of Famer
- "RETIRED_HOF": Player is retired AND in the Hall of Fame (or clearly HOF-bound legend)
- "DECEASED": Player has passed away (always set this if the player is deceased, even if they're also HOF)
- "BUST": Player is OUT OF THE LEAGUE with no realistic path back (can be young OR veteran)

CRITICAL BUST CLARIFICATION:
- The key distinction is ROSTER STATUS, not years in league
- Backup player ON A TEAM = ACTIVE (they have a roster spot, still developing)
- Player OUT OF LEAGUE = potentially BUST (no team wants them)
- Bhayshul Tuten is ON the Jaguars roster as RB3 = ACTIVE, not BUST

Examples:
- Babe Ruth → "DECEASED" (he died in 1948)
- Bart Starr → "DECEASED" (he died in 2019)
- Tom Brady → "RETIRED_HOF" (retired, will be HOF)
- Trey Lance → "BUST" (out of the league, no team signed him)
- JaMarcus Russell → "BUST" (out of league after multiple failed seasons)
- Bhayshul Tuten → "ACTIVE" (backup RB on Jaguars roster - has a team)
- Kenny Pickett → "ACTIVE" (backup QB on a roster)
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
  "dataQuality": "HIGH|MEDIUM|LOW",
  "marketDataConfidence": "HIGH|MEDIUM|LOW",
  "newsCoverageConfidence": "HIGH|MEDIUM|LOW"
}

CONFIDENCE ASSESSMENT RULES (all 4 fields required):
- confidence: How certain are you about your overall investment verdict?
  * HIGH: Well-known player with clear career trajectory, reliable data, obvious investment thesis
  * MEDIUM: Good player data but some uncertainty (injury recovery, role changes, etc.)
  * LOW: Sparse data, unknown player, highly speculative thesis

- dataQuality: How much reliable player/career data did you find?
  * HIGH: Established player, clear stats history, defined role on team
  * MEDIUM: Known player but some gaps in data or recent changes
  * LOW: Unknown/obscure player, minimal background info

- marketDataConfidence: How confident are you about card market activity for this player?
  * HIGH: Star player whose cards trade frequently (All-Stars, MVPs, popular players)
  * MEDIUM: Solid player with moderate card market activity
  * LOW: Obscure player with likely minimal card market activity

- newsCoverageConfidence: How much current news/media coverage exists?
  * HIGH: Major news, trending topics, recent headlines about this player
  * MEDIUM: Some recent coverage or mentions
  * LOW: Minimal to no recent news found

CRITICAL: For established star players (All-Stars, MVPs, Pro Bowlers, franchise QBs like Josh Allen, Patrick Mahomes, etc.), ALL FOUR confidence fields should typically be MEDIUM or HIGH. Reserve LOW only for truly obscure players or genuine data gaps.

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
- Reference team context, position premium, historical patterns for ${sport}
- NEVER refer to ${playerName} as "unknown" or "this unknown player." Use their actual career context (MVP, All-Star, starter, etc.) — only use "unknown" for genuinely unrecognizable players.`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${systemMessage}\n\n${prompt}`,
    });
    
    const content = response.text || "{}";
    
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
    
    // Determine market data confidence (from Gemini)
    const marketDataConfidence = (["HIGH", "MEDIUM", "LOW"].includes(parsed.marketDataConfidence) 
      ? parsed.marketDataConfidence 
      : "MEDIUM") as DataConfidence;
    
    // Determine news coverage confidence (from Gemini)
    const newsCoverageConfidence = (["HIGH", "MEDIUM", "LOW"].includes(parsed.newsCoverageConfidence) 
      ? parsed.newsCoverageConfidence 
      : newsSnippets.length >= 3 ? "HIGH" : newsSnippets.length >= 1 ? "MEDIUM" : "LOW") as DataConfidence;
    
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
      marketDataConfidence,
      newsCoverageConfidence,
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
      marketDataConfidence: "LOW",
      newsCoverageConfidence: "LOW",
    };
  }
}

// Main function to get player outlook
export async function getPlayerOutlook(
  request: PlayerOutlookRequest,
  options?: { forceRefresh?: boolean }
): Promise<PlayerOutlookResponse> {
  const { playerName, sport = "football", contextCard } = request;
  const playerKey = normalizePlayerKey(sport, playerName);
  
  // Ensure registry is fully loaded from database before lookups
  await ensureRegistryLoaded();
  
  console.log(`[PlayerOutlook] Generating outlook for: ${playerName} (${sport})`);
  
  // Check cache first
  const { outlook: cachedOutlook, isStale, cacheRecord } = await getCachedOutlook(playerKey);
  
  // Force refresh mode: always generate fresh (used by prewarm job)
  if (options?.forceRefresh) {
    console.log(`[PlayerOutlook] Force refresh requested for ${playerName}`);
    const freshOutlook = await generateFreshOutlook(playerName, sport, playerKey);
    return { ...freshOutlook, cacheStatus: "miss" };
  }
  
  // Return cached if fresh
  if (cachedOutlook && !isStale) {
    console.log(`[PlayerOutlook] Cache HIT (fresh) for ${playerName}`);
    return { ...cachedOutlook, cacheStatus: "fresh" };
  }
  
  // If stale, check if the cached outlook has zero market data
  if (cachedOutlook && isStale) {
    const hasZeroMarketData = !cachedOutlook.marketSignals?.derivedMetrics?.sampleFactor 
      || cachedOutlook.marketSignals?.derivedMetrics?.sampleFactor === 0;
    
    if (hasZeroMarketData) {
      console.log(`[PlayerOutlook] Cache HIT (stale + zero market data) for ${playerName}, forcing synchronous refresh`);
      const freshOutlook = await generateFreshOutlook(playerName, sport, playerKey);
      return { ...freshOutlook, cacheStatus: "miss" };
    }
    
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
  // Step 1: Start market data + internal metrics fetch in background
  const marketDataPromise = fetchPlayerMarketData(playerName, sport);
  const internalMetricsPromise = aggregateInternalMetrics(playerName);
  
  // Step 1b: Fetch news signals (blocks until complete — classification + narrative depend on this)
  const { momentum, newsHype, snippets, detectedStage, roleStatus, injuryStatus, aiCareerStage, aiRookieYear, aiPosition } = await getPlayerNewsSignals(playerName, sport);
  
  // Step 2: Run classification engine (depends on news signals)
  // Priority for career stage: detectedStage (BUST/RETIRED/HOF from careerStatus) > aiCareerStage (from Gemini) > inferCareerStage
  // For players not in registry, Gemini's careerStage is our best source of truth
  let resolvedCareerStage: PlayerStage | undefined = detectedStage;
  if (!resolvedCareerStage && aiCareerStage) {
    const validStages: Record<string, PlayerStage> = {
      "ROOKIE": "ROOKIE", "YEAR_2": "YEAR_2", "YEAR_3": "YEAR_3", "YEAR_4": "YEAR_4",
      "PRIME": "PRIME", "VETERAN": "VETERAN", "AGING": "AGING",
    };
    resolvedCareerStage = validStages[aiCareerStage.toUpperCase()];
    if (resolvedCareerStage) {
      console.log(`[PlayerOutlook] Using AI-detected career stage for ${playerName}: ${resolvedCareerStage}`);
    }
  }
  
  const classificationInput: ClassificationInput = {
    playerName,
    sport,
    recentMomentum: momentum,
    newsHype,
    careerStage: resolvedCareerStage,
    rookieYear: aiRookieYear,
    position: aiPosition,
  };
  
  const classification = classifyPlayer(classificationInput);
  console.log(`[PlayerOutlook] Classification for ${playerName}: stage=${classification.stage}, temp=${classification.baseTemperature}, aiStage=${aiCareerStage || "none"}, rookieYear=${aiRookieYear || "none"}, position=${aiPosition || "none"}`);
  
  // Step 2.5: Re-analyze team context with detected team
  const teamContextWithTeam = analyzeTeamContext(snippets, classification.team);
  
  // Step 3: Generate AI narrative
  const { playerInfo, thesis, marketRealityCheck, verdict, confidence, dataQuality, marketDataConfidence, newsCoverageConfidence, aiDetectedCareerStatus, peakTiming, tieredRecommendations } = await generatePlayerOutlookAI(
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
    
    // If registry position is UNKNOWN but AI provided a valid position, use AI's value
    if ((!entry.positionGroup || entry.positionGroup === "UNKNOWN") && 
        playerInfo.position && playerInfo.position.toLowerCase() !== "unknown") {
      console.log(`[PlayerOutlook] Registry position is UNKNOWN, using AI-inferred: ${playerInfo.position}`);
      enrichedPlayerInfo.position = playerInfo.position;
      enrichedPlayerInfo.inferredFields = ["position"];
    }
    
    // Team is not in registry, always use AI-inferred team if available
    if (playerInfo.team && playerInfo.team.toLowerCase() !== "unknown") {
      enrichedPlayerInfo.team = playerInfo.team;
    }
    
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
    let registryStage = registryStageMap[entry.careerStage];
    
    // GUARDRAIL: Don't trust stale PRIME from registry when rookie year proves VETERAN/AGING.
    // The registry was bulk-populated and many long-tenured players were incorrectly tagged PRIME.
    // If AI or rookie year indicates VETERAN/AGING, prefer the more accurate stage.
    if (registryStage === "PRIME" && aiRookieYear) {
      const yearsPro = new Date().getFullYear() - aiRookieYear;
      if (yearsPro >= 14) {
        console.log(`[PlayerOutlook] Registry PRIME override → AGING: ${playerName} has ${yearsPro} years pro (rookie ${aiRookieYear})`);
        registryStage = "AGING";
        enrichedPlayerInfo.stage = "AGING";
      } else if (yearsPro >= 10) {
        console.log(`[PlayerOutlook] Registry PRIME override → VETERAN: ${playerName} has ${yearsPro} years pro (rookie ${aiRookieYear})`);
        registryStage = "VETERAN";
        enrichedPlayerInfo.stage = "VETERAN";
      }
    }
    // Also trust AI career stage over stale registry PRIME when AI says VETERAN/AGING
    if (registryStage === "PRIME" && aiCareerStage) {
      const aiUpper = aiCareerStage.toUpperCase();
      if (aiUpper === "VETERAN" || aiUpper === "AGING") {
        console.log(`[PlayerOutlook] Registry PRIME override by AI → ${aiUpper}: ${playerName}`);
        registryStage = aiUpper as PlayerStage;
        enrichedPlayerInfo.stage = aiUpper as PlayerStage;
      }
    }
    
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
      "DECEASED": "RETIRED_HOF",
      "RETIRED_HOF": "RETIRED_HOF",
      "RETIRED": "RETIRED",
      "BUST": "BUST",
    };
    const correctedStage = stageMap[aiDetectedCareerStatus];
    
    if (correctedStage && correctedStage !== classification.stage) {
      console.log(`[PlayerOutlook] AI override (no registry entry): ${playerName} stage ${classification.stage} → ${correctedStage}`);
      
      const correctedInput: ClassificationInput = {
        playerName,
        sport,
        recentMomentum: momentum,
        newsHype,
        careerStage: correctedStage,
        rookieYear: aiRookieYear,
        position: aiPosition,
      };
      finalClassification = classifyPlayer(correctedInput);
    }
  }
  
  // For players NOT in registry, enrich playerInfo with AI-detected fields
  if (!playerInRegistry) {
    if (aiPosition && (!enrichedPlayerInfo.position || enrichedPlayerInfo.position === "Unknown")) {
      enrichedPlayerInfo.position = aiPosition;
    }
    if (resolvedCareerStage && resolvedCareerStage !== "UNKNOWN") {
      enrichedPlayerInfo.stage = resolvedCareerStage;
    }
  }
  
  // Step 4: Get exposure recommendations
  const exposures = getExposureRecommendations(finalClassification, sport, playerName);
  
  // Step 5: Build snapshot (use finalClassification which may have been corrected by AI)
  // Note: Temperature may be adjusted later for verdict consistency
  let snapshotTemperature: MarketTemperature = finalClassification.baseTemperature;
  
  const snapshot: PlayerSnapshot = {
    temperature: snapshotTemperature,
    volatility: finalClassification.baseVolatility,
    risk: finalClassification.baseRisk,
    horizon: finalClassification.baseHorizon,
    confidence,
  };
  
  // Step 6: Calculate valuation using heuristic model
  const valuation = calculateValuation(sport, finalClassification, verdict.modifier);
  
  // Step 6.5: Await market data + internal metrics (started in Step 1)
  const [marketData, internalMetrics] = await Promise.all([marketDataPromise, internalMetricsPromise]);
  
  // Step 6.6: Build unified market metrics from Gemini + internal data
  const marketMetrics = buildMarketMetrics(marketData, internalMetrics);
  
  // Step 7: Build evidence with real market data when available, fallback to modeled
  const useRealMarketData = marketData.available && marketData.totalAvgPrice !== undefined;
  
  const evidence: EvidenceData = {
    compsSummary: {
      available: true,
      median: useRealMarketData ? marketData.totalAvgPrice! : valuation.estimatedRange.mid,
      low: useRealMarketData && marketData.priceRange ? marketData.priceRange.low : valuation.estimatedRange.low,
      high: useRealMarketData && marketData.priceRange ? marketData.priceRange.high : valuation.estimatedRange.high,
      soldCount: marketMetrics.soldCount30d,
      source: useRealMarketData ? "gemini_search" : "modeled",
      estimatedVolume: marketData.estimatedVolume,
      volumeTrend: marketData.volumeTrend,
      breakdown: marketData.breakdown,
    },
    referenceComps: valuation.referenceComps,
    notes: [
      snippets.length === 0 ? "Limited news data available" : `${snippets.length} recent news items analyzed`,
      `Classification: ${finalClassification.stage} stage, ${finalClassification.baseTemperature} market`,
      ...(useRealMarketData && marketData.observations ? marketData.observations : [valuation.methodology]),
      useRealMarketData 
        ? `Market data from search - avg across all ${playerName} cards sold in last 30 days.`
        : "Modeled estimate - not live market data. Use as directional guidance.",
      marketMetrics.source !== "unavailable" ? `Market scoring: ${marketMetrics.source} data source` : "",
    ].filter(Boolean),
    newsSnippets: snippets.slice(0, 3),
    lastUpdated: new Date().toISOString(),
    dataQuality,
    marketDataConfidence,
    newsCoverageConfidence,
  };
  
  // Step 8: Market Scoring Engine V2 — market-behavior-first verdict
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
  
  const inferredRoleTier = inferRoleTierFromContext(snippets, playerName, roleStatus, injuryStatus);
  const roleTier = getRoleTier(playerName) !== "UNKNOWN" ? getRoleTier(playerName) : inferredRoleTier;
  const roleStabilityScore = getRoleStabilityScore(playerName);
  
  const marketScoringInput: MarketScoringInput = {
    metrics: marketMetrics,
    playerName,
    stage: enrichedPlayerInfo.stage || finalClassification.stage,
    position: enrichedPlayerInfo.position,
    sport,
    team: enrichedPlayerInfo.team,
    roleTier,
    roleStabilityScore: roleStabilityScore > 0 ? roleStabilityScore : 50,
    newsHype: hypeMap[newsHype] || "LOW",
    momentum: momentumMap[momentum] || "STABLE",
    newsCount: snippets.length,
  };
  
  const marketResult = generateMarketVerdict(marketScoringInput);
  
  // Step 8.1: Generate Investment Call using market scoring as primary, legacy as fallback enrichment
  const investmentCall = generateInvestmentCall({
    stage: finalClassification.stage,
    temperature: marketResult.temperature,
    volatility: marketResult.volatility,
    risk: marketResult.risk,
    horizon: marketResult.horizon,
    confidence: marketResult.confidence,
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
  
  // Step 8.2: Override investment call with market scoring results
  // The market scoring engine is now the primary verdict source
  const legacyVerdict = investmentCall.verdict;
  investmentCall.verdict = marketResult.verdict;
  investmentCall.oneLineRationale = marketResult.verdictReason;
  investmentCall.confidence = marketResult.confidence;
  investmentCall.timeHorizon = marketResult.horizon;

  if (legacyVerdict !== marketResult.verdict) {
    console.log(`[PlayerOutlook] Verdict override: ${legacyVerdict} → ${marketResult.verdict} (market scoring). Phase: ${marketResult.phase}, composite: ${marketResult.signals.composite}`);
  }

  const sig = marketResult.signals;
  const met = marketMetrics;
  const metricsWhyBullets: string[] = [];

  if (met.soldCount30d !== undefined) {
    const supplyRatioNote = met.activeListingCount && met.soldCount30d > 0
      ? ` (${(met.activeListingCount / met.soldCount30d).toFixed(0)}x supply-to-sales ratio)`
      : "";
    metricsWhyBullets.push(`${met.soldCount30d} cards sold in 30 days${met.activeListingCount ? `, ${met.activeListingCount} active listings${supplyRatioNote}` : ""}`);
  }
  if (met.priceTrend !== undefined) {
    const dir = met.priceTrend >= 0 ? "up" : "down";
    const volNote = met.volumeTrend !== undefined 
      ? ` while volume is ${met.volumeTrend === "up" ? "rising" : met.volumeTrend === "down" ? "falling" : "stable"}`
      : "";
    metricsWhyBullets.push(`Prices ${dir} ${Math.abs(Math.round(met.priceTrend * 100))}%${volNote}`);
  }
  if (marketResult.phase !== "UNKNOWN") {
    const signalSummary = sig.demandScore > 70 ? "strong demand" : sig.demandScore < 40 ? "weak demand" : "moderate demand";
    metricsWhyBullets.push(`${marketResult.phase.toLowerCase().charAt(0).toUpperCase() + marketResult.phase.toLowerCase().slice(1)} phase with ${signalSummary} — score ${sig.composite}/100`);
  }

  if (metricsWhyBullets.length > 0) {
    investmentCall.whyBullets = metricsWhyBullets.slice(0, 3);
  }

  const phasePostureMap: Record<string, string> = {
    ACCUMULATION: "Buy on weakness",
    BREAKOUT: "Add with momentum",
    EXPANSION: "Hold and ride",
    EXHAUSTION: "Trim into strength",
    DECLINE: "Wait for stabilization",
  };
  if (marketResult.phase !== "UNKNOWN" && phasePostureMap[marketResult.phase]) {
    investmentCall.postureLabel = phasePostureMap[marketResult.phase];
  }

  const phaseName = marketResult.phase !== "UNKNOWN" ? marketResult.phase.toLowerCase() : "current";
  const priceStr = met.avgSoldPrice ? `$${met.avgSoldPrice.toFixed(0)} avg` : "";
  const soldStr = met.soldCount30d ? `${met.soldCount30d} sold/30d` : "";
  const trendStr = met.priceTrend !== undefined ? `${met.priceTrend >= 0 ? "+" : ""}${Math.round(met.priceTrend * 100)}%` : "";
  const metricsSnippet = [priceStr, soldStr, trendStr].filter(Boolean).join(", ");

  const supplyStr = met.activeListingCount && met.soldCount30d 
    ? `${(met.activeListingCount / Math.max(met.soldCount30d, 1)).toFixed(0)}x supply-to-sales ratio`
    : "";
  const demandStr = sig.demandScore > 70 ? "strong demand" : sig.demandScore > 50 ? "moderate demand" : "weak demand";
  const momentumStr = sig.momentumScore > 70 ? "accelerating" : sig.momentumScore > 50 ? "stable momentum" : "decelerating";
  const hypeStr = sig.hypeScore > 70 ? "overheated" : sig.hypeScore > 50 ? "elevated attention" : "";

  const mqScore = sig.derivedMetrics?.marketQuality ?? 0;
  const mqLabel = mqScore >= 60 ? "strong structure" : mqScore >= 40 ? "mixed structure" : "weak structure";

  const topContribStr = sig.contributions ? (() => {
    const c = sig.contributions!;
    const scored = [
      { name: "demand", v: c.demand }, { name: "momentum", v: c.momentum },
      { name: "liquidity", v: c.liquidity }, { name: "supply", v: c.supply },
      { name: "anti-hype", v: c.antiHype }, { name: "volatility", v: c.volatility },
    ].sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const top2 = scored.slice(0, 2);
    return top2.map(s => `${s.name} ${s.v > 0 ? "+" : ""}${s.v.toFixed(0)}`).join(", ");
  })() : "";

  const verdictActionMap: Record<string, { advisorTake: string; packHit: string; collectorTip: string; actionPlan: { whatToDoNow: string; entryPlan: string; positionSizing: string } }> = {
    ACCUMULATE: {
      advisorTake: `Market is in ${phaseName} phase with ${demandStr} and ${momentumStr}, ${mqLabel}${metricsSnippet ? ` (${metricsSnippet})` : ""}${topContribStr ? `. Key drivers: ${topContribStr}` : ""}. This is a buying window — prices haven't caught up to the demand signal. Add exposure on dips while the window is open.`,
      packHit: "Great pull — hold it. This player is in an accumulation zone with upside ahead.",
      collectorTip: "Look for dips on quiet news days to add at better prices.",
      actionPlan: { whatToDoNow: "Accumulate on weakness — buy dips in base rookies and mid-tier parallels.", entryPlan: "Target pullbacks on quiet news days; avoid chasing spikes.", positionSizing: "Build a core position across 3-5 cards." },
    },
    HOLD_CORE: {
      advisorTake: `Stable market position in ${phaseName} phase with ${demandStr}, ${mqLabel}${metricsSnippet ? ` (${metricsSnippet})` : ""}${topContribStr ? `. Key drivers: ${topContribStr}` : ""}. Prices reflect the current story — no urgency to add or sell. Hold your core cards and wait for a catalyst.`,
      packHit: "Solid pull — worth keeping. Not a sell-now situation.",
      collectorTip: "No rush to buy more. Wait for a clear catalyst before adding.",
      actionPlan: { whatToDoNow: "Hold your current position — no urgency to add or sell.", entryPlan: "Wait for a clear catalyst before adding new exposure.", positionSizing: "Maintain current allocation; don't average up." },
    },
    TRADE_THE_HYPE: {
      advisorTake: `Market is ${hypeStr || "showing exhaustion signals"} in ${phaseName} phase, ${mqLabel}${metricsSnippet ? ` (${metricsSnippet})` : ""}${supplyStr ? `. ${supplyStr} — more sellers than the market can absorb` : ""}${topContribStr ? `. Key drivers: ${topContribStr}` : ""}. Hype exceeds sustainable demand. Sell into strength, not weakness.`,
      packHit: "Sell into the hype. List quickly while demand is elevated.",
      collectorTip: "If you want to collect long-term, wait for the correction before buying.",
      actionPlan: { whatToDoNow: "Sell into strength — trim non-core holdings first.", entryPlan: "Don't buy now; wait for post-hype correction.", positionSizing: "Reduce exposure by 30-50%." },
    },
    SPECULATIVE_FLYER: {
      advisorTake: `Speculative profile in ${phaseName} phase with ${demandStr}${metricsSnippet ? ` (${metricsSnippet})` : ""}${topContribStr ? `. Key drivers: ${topContribStr}` : ""}. The upside runway exists but there's not enough data for a high-conviction call. Small position only.`,
      packHit: "Interesting pull — hold a copy but don't go deep. Let the career develop first.",
      collectorTip: "Keep exposure small. This is a lottery ticket, not a core holding.",
      actionPlan: { whatToDoNow: "Small speculative position only — one or two cards max.", entryPlan: "Buy base/common at current prices; save premium for role confirmation.", positionSizing: "Keep under 5% of portfolio." },
    },
    HOLD_ROLE_RISK: {
      advisorTake: `Role uncertainty is the main concern${metricsSnippet ? ` (${metricsSnippet})` : ""}. The talent may be there but the opportunity isn't locked in. Hold what you have but don't add until the role clarifies.`,
      packHit: "Keep it for now, but watch the role situation closely.",
      collectorTip: "Wait for role clarity before making any moves.",
      actionPlan: { whatToDoNow: "Hold but don't add — wait for role clarity.", entryPlan: "Only add if promoted to starter or key role.", positionSizing: "Freeze current allocation." },
    },
    AVOID_NEW_MONEY: {
      advisorTake: `Market signals are weak — ${demandStr} with ${momentumStr}, ${mqLabel}${metricsSnippet ? ` (${metricsSnippet})` : ""}${supplyStr ? `. ${supplyStr}` : ""}${topContribStr ? `. Key drivers: ${topContribStr}` : ""}. Better opportunities exist elsewhere. If you hold, monitor for a bounce before selling.`,
      packHit: "Sell when you can get a fair price. Don't hold hoping for a turnaround.",
      collectorTip: "Steer clear for investment purposes. Better value elsewhere.",
      actionPlan: { whatToDoNow: "No new money — look for exits on bounces.", entryPlan: "Don't buy; capital is better deployed elsewhere.", positionSizing: "Reduce to zero if possible." },
    },
    AVOID_STRUCTURAL: {
      advisorTake: `Structural decline with no clear path to recovery${metricsSnippet ? ` (${metricsSnippet})` : ""}. Cards are likely to keep losing value. Sell into any bounces.`,
      packHit: "Sell as soon as you can. This is not a hold situation.",
      collectorTip: "Only buy if you're a personal fan collecting for nostalgia, not investment.",
      actionPlan: { whatToDoNow: "Exit position — sell into any bounces.", entryPlan: "Do not buy at any price for investment.", positionSizing: "Zero allocation." },
    },
  };

  const narrativeOverride = verdictActionMap[marketResult.verdict];
  if (narrativeOverride) {
    investmentCall.advisorTake = narrativeOverride.advisorTake;
    investmentCall.packHitReaction = narrativeOverride.packHit;
    investmentCall.collectorTip = narrativeOverride.collectorTip;
    investmentCall.actionPlan = narrativeOverride.actionPlan;
  }
  
  // Step 8.5: Apply market-derived temperature to snapshot
  snapshot.temperature = marketResult.temperature;
  snapshot.volatility = marketResult.volatility;
  snapshot.risk = marketResult.risk;
  snapshot.horizon = marketResult.horizon;
  snapshot.confidence = marketResult.confidence;
  finalClassification.baseTemperature = marketResult.temperature;
  
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
    marketPhase: marketResult.phase,
    marketSignals: marketResult.signals,
    marketMetrics,
    peakTiming,
    tieredRecommendations,
    teamContext: teamContextWithTeam,
    generatedAt: new Date().toISOString(),
  };
  
  // Step 10: Save to cache (use finalClassification which includes market-derived temperature)
  await saveToCache(playerKey, sport, playerName, finalClassification, response);
  
  return response;
}

// Export for testing
export { normalizePlayerKey, getTtlMs };
