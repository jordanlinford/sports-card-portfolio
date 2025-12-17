import OpenAI from "openai";
import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { classifyPlayer, getExposureRecommendations, type ClassificationInput, type ClassificationOutput } from "./playerClassificationEngine";
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
} from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://ai.replit.dev/v1beta",
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Normalize player key for caching
function normalizePlayerKey(sport: string, playerName: string): string {
  return `${sport.toLowerCase()}:${playerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

// TTL by temperature: Hot players refresh more often
function getTtlMs(temperature: MarketTemperature): number {
  switch (temperature) {
    case "HOT": return 24 * 60 * 60 * 1000; // 1 day
    case "WARM": return 3 * 24 * 60 * 60 * 1000; // 3 days
    case "NEUTRAL": return 7 * 24 * 60 * 60 * 1000; // 7 days
    case "COOLING": return 7 * 24 * 60 * 60 * 1000; // 7 days
    default: return 3 * 24 * 60 * 60 * 1000;
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
  const isStale = record.expiresAt ? record.expiresAt < now : true;
  
  return {
    outlook: record.outlookJson as PlayerOutlookResponse | null,
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
  
  await db
    .insert(playerOutlookCache)
    .values({
      playerKey,
      sport,
      playerName,
      classificationJson: classification,
      outlookJson: outlook,
      temperature: classification.baseTemperature,
      lastFetchedAt: new Date(),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: playerOutlookCache.playerKey,
      set: {
        classificationJson: classification,
        outlookJson: outlook,
        temperature: classification.baseTemperature,
        lastFetchedAt: new Date(),
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

// Use Serper to get news/hype signals about the player
async function getPlayerNewsSignals(playerName: string, sport: string): Promise<{
  momentum: "up" | "flat" | "down";
  newsHype: "high" | "medium" | "low" | "none";
  snippets: string[];
}> {
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_API_KEY) {
    return { momentum: "flat", newsHype: "none", snippets: [] };
  }
  
  try {
    const response = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: `${playerName} ${sport} card value 2024`,
        num: 5,
      }),
    });
    
    if (!response.ok) {
      return { momentum: "flat", newsHype: "none", snippets: [] };
    }
    
    const data = await response.json();
    const news = data.news || [];
    
    if (news.length === 0) {
      return { momentum: "flat", newsHype: "none", snippets: [] };
    }
    
    const snippets = news.slice(0, 3).map((n: any) => n.snippet || n.title);
    
    // Analyze sentiment from snippets
    const positiveKeywords = ["surge", "rising", "hot", "breakout", "mvp", "record", "star", "elite", "best"];
    const negativeKeywords = ["decline", "falling", "injury", "benched", "struggling", "bust", "down", "trade"];
    
    let positiveCount = 0;
    let negativeCount = 0;
    const combined = snippets.join(" ").toLowerCase();
    
    positiveKeywords.forEach(kw => {
      if (combined.includes(kw)) positiveCount++;
    });
    negativeKeywords.forEach(kw => {
      if (combined.includes(kw)) negativeCount++;
    });
    
    const momentum = positiveCount > negativeCount + 1 ? "up" : 
                     negativeCount > positiveCount + 1 ? "down" : "flat";
    const newsHype = news.length >= 5 ? "high" : news.length >= 3 ? "medium" : news.length >= 1 ? "low" : "none";
    
    return { momentum, newsHype, snippets };
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
  newsSnippets: string[]
): Promise<{
  playerInfo: PlayerInfo;
  thesis: string[];
  verdict: PlayerVerdictResult;
  confidence: DataConfidence;
}> {
  const prompt = `You are a sports card market analyst. Analyze the investment outlook for ${playerName} in ${sport}.

PLAYER CLASSIFICATION (from our rules engine):
- Career Stage: ${classification.stage}
- Position: ${classification.position || "Unknown"}
- Team: ${classification.team || "Unknown"}
- Market Temperature: ${classification.baseTemperature}
- Volatility: ${classification.baseVolatility}
- Risk Level: ${classification.baseRisk}
- Investment Horizon: ${classification.baseHorizon}

${newsSnippets.length > 0 ? `RECENT NEWS CONTEXT:\n${newsSnippets.map(s => `- ${s}`).join("\n")}` : "No recent news available."}

RESPOND IN EXACTLY THIS JSON FORMAT:
{
  "playerInfo": {
    "position": "<position if known, or best guess>",
    "team": "<current team if known>",
    "rookieYear": <year as number or null>,
    "inferred": <true if you had to guess position/team>
  },
  "thesis": [
    "<bullet 1: main momentum/hype factor>",
    "<bullet 2: performance or role factor>",
    "<bullet 3: market behavior observation>",
    "<bullet 4: key risk or what could change>",
    "<bullet 5 optional: secondary factor>",
    "<bullet 6 optional: additional context>"
  ],
  "verdict": {
    "action": "<BUY or WATCH or AVOID>",
    "summary": "<2-4 sentence plain language summary of why>",
    "whatMustBeTrue": [
      "<condition 1 for thesis to work>",
      "<condition 2>",
      "<condition 3 optional>"
    ]
  },
  "confidence": "<HIGH or MEDIUM or LOW based on how certain you are>"
}

RULES:
- Be opinionated but transparent about uncertainty
- Do NOT hallucinate stats or percentages
- Do NOT guarantee returns
- Use the stock metaphor (player = stock, cards = exposure)
- Keep bullets SHORT and punchy (max 15 words each)
- If you don't know something, say "Unknown" or mark inferred: true
- 3-6 thesis bullets, 2-3 whatMustBeTrue conditions`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a sports card market analyst. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });
    
    const content = response.choices[0]?.message?.content || "{}";
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      playerInfo: {
        name: playerName,
        sport,
        position: parsed.playerInfo?.position || classification.position,
        team: parsed.playerInfo?.team || classification.team,
        stage: classification.stage,
        rookieYear: parsed.playerInfo?.rookieYear || classification.rookieYear,
        inferred: parsed.playerInfo?.inferred ?? true,
      },
      thesis: parsed.thesis || [
        "Market data for this player is limited",
        "Performance signals are unclear",
        "Proceed with caution and verify independently",
      ],
      verdict: {
        action: (["BUY", "WATCH", "AVOID"].includes(parsed.verdict?.action) 
          ? parsed.verdict.action 
          : "WATCH") as PlayerVerdict,
        summary: parsed.verdict?.summary || "Insufficient data to make a confident recommendation. Monitor for more signals.",
        whatMustBeTrue: parsed.verdict?.whatMustBeTrue || ["More data needed"],
      },
      confidence: (["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence) 
        ? parsed.confidence 
        : "LOW") as DataConfidence,
    };
  } catch (error) {
    console.error("[PlayerOutlook] AI generation error:", error);
    
    // Fallback response
    return {
      playerInfo: {
        name: playerName,
        sport,
        position: classification.position,
        team: classification.team,
        stage: classification.stage,
        rookieYear: classification.rookieYear,
        inferred: true,
      },
      thesis: [
        "Unable to generate detailed analysis at this time",
        "Check back later for updated outlook",
        "Consider researching this player independently",
      ],
      verdict: {
        action: "WATCH",
        summary: "Analysis temporarily unavailable. Defaulting to WATCH recommendation.",
        whatMustBeTrue: ["Analysis system needs to be available"],
      },
      confidence: "LOW",
    };
  }
}

// Main function to get player outlook
export async function getPlayerOutlook(
  request: PlayerOutlookRequest
): Promise<PlayerOutlookResponse> {
  const { playerName, sport = "football", contextCard } = request;
  const playerKey = normalizePlayerKey(sport, playerName);
  
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
  const { momentum, newsHype, snippets } = await getPlayerNewsSignals(playerName, sport);
  
  // Step 2: Run classification engine
  const classificationInput: ClassificationInput = {
    playerName,
    sport,
    recentMomentum: momentum,
    newsHype,
  };
  
  const classification = classifyPlayer(classificationInput);
  
  // Step 3: Generate AI narrative
  const { playerInfo, thesis, verdict, confidence } = await generatePlayerOutlookAI(
    playerName,
    sport,
    classification,
    snippets
  );
  
  // Step 4: Get exposure recommendations
  const exposures = getExposureRecommendations(classification, sport, playerName);
  
  // Step 5: Build snapshot
  const snapshot: PlayerSnapshot = {
    temperature: classification.baseTemperature,
    volatility: classification.baseVolatility,
    risk: classification.baseRisk,
    horizon: classification.baseHorizon,
    confidence,
  };
  
  // Step 6: Build evidence
  const evidence: EvidenceData = {
    compsSummary: {
      available: false, // Will integrate with existing comps engine later
    },
    notes: [
      snippets.length === 0 ? "Limited news data available" : `${snippets.length} recent news items analyzed`,
      `Classification: ${classification.stage} stage, ${classification.baseTemperature} market`,
    ],
    newsSnippets: snippets.slice(0, 3),
    lastUpdated: new Date().toISOString(),
  };
  
  // Step 7: Build response
  const response: PlayerOutlookResponse = {
    player: playerInfo,
    snapshot,
    thesis,
    verdict,
    exposures,
    evidence,
    generatedAt: new Date().toISOString(),
  };
  
  // Step 8: Save to cache
  await saveToCache(playerKey, sport, playerName, classification, response);
  
  return response;
}

// Export for testing
export { normalizePlayerKey, getTtlMs };
