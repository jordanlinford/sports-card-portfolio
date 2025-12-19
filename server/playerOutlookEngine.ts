import OpenAI from "openai";
import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { classifyPlayer, getExposureRecommendations, type ClassificationInput, type ClassificationOutput } from "./playerClassificationEngine";
import { calculateValuation } from "./valuationService";
import { generateInvestmentCall } from "./investmentDecisionEngine";
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
    const newsHype = allNews.length >= 5 ? "high" : allNews.length >= 3 ? "medium" : allNews.length >= 1 ? "low" : "none";
    
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
  marketRealityCheck: string[];
  verdict: PlayerVerdictResult;
  confidence: DataConfidence;
  dataQuality: DataConfidence;
  discountAnalysis?: {
    whyDiscounted: string[];
    repricingCatalysts: string[];
    trapRisks: string[];
  };
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

  const prompt = `Analyze the investment outlook for ${playerName} in ${sport}.

PLAYER DATA (from our classification engine):
- Career Stage: ${classification.stage}
- Position: ${classification.position || "Unknown"}
- Team: ${classification.team || "Unknown"}
- Market Temperature: ${classification.baseTemperature}
- Volatility: ${classification.baseVolatility}
- Risk Level: ${classification.baseRisk}
- Investment Horizon: ${classification.baseHorizon}

${newsSnippets.length > 0 ? `CRITICAL - REAL-TIME NEWS (THIS IS GROUND TRUTH - YOUR TRAINING DATA MAY BE OUTDATED):
${newsSnippets.map(s => `- ${s}`).join("\n")}

IMPORTANT: The news above is from TODAY'S search results. If the news indicates the player has been drafted, traded, signed, or is playing in the NBA, you MUST use that information. Do NOT contradict this news with outdated information from your training data. For example, if news says a player was drafted or is playing in the NBA, they are NOT a prospect - they are a professional player.` : "No recent news available - use conditional reasoning."}

RESPOND IN EXACTLY THIS JSON FORMAT:
{
  "playerInfo": {
    "position": "<position if known, or 'Unknown'>",
    "team": "<current team if known, or 'Unknown'>",
    "rookieYear": <year as number or null>,
    "inferredFields": ["<list any fields you guessed: 'position', 'team', 'rookieYear'>"]
  },
  "thesis": [
    "<bullet 1: main momentum/hype factor - SPECIFIC to this player>",
    "<bullet 2: performance or role factor>",
    "<bullet 3: market behavior observation>",
    "<bullet 4: key risk or what could change>"
  ],
  "marketRealityCheck": [
    "<uncomfortable truth 1: honest skeptical observation>",
    "<uncomfortable truth 2: historical cautionary note or pricing vs reality>"
  ],
  "verdict": {
    "action": "BUY|MONITOR|AVOID",
    "modifier": "Momentum|Speculative|Value|Long-Term|Late Cycle",
    "summary": "<2-4 sentence plain language summary>",
    "whatMustBeTrue": [
      "<condition 1 for thesis to work>",
      "<condition 2>"
    ]
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

ANTI-FLUFF CHECK (critical):
Before finalizing, verify: if any thesis bullet could apply to 10+ random players, rewrite it to be more specific to ${playerName} OR mark the missing input as Unknown and use conditional language.

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
  const { playerInfo, thesis, marketRealityCheck, verdict, confidence, dataQuality } = await generatePlayerOutlookAI(
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
  
  // Step 6: Calculate valuation using heuristic model
  const valuation = calculateValuation(sport, classification, verdict.modifier);
  
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
      `Classification: ${classification.stage} stage, ${classification.baseTemperature} market`,
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
  
  const investmentCall = generateInvestmentCall({
    stage: classification.stage,
    temperature: classification.baseTemperature,
    volatility: classification.baseVolatility,
    risk: classification.baseRisk,
    horizon: classification.baseHorizon,
    confidence,
    exposures,
    thesis,
    marketRealityCheck,
    compData: evidence.compsSummary,
    newsCount: snippets.length,
    momentum: momentumMap[momentum] || "STABLE",
    newsHype: hypeMap[newsHype] || "LOW",
  });
  
  // Step 9: Build response
  const response: PlayerOutlookResponse = {
    player: playerInfo,
    snapshot,
    thesis,
    marketRealityCheck,
    verdict,
    investmentCall,
    exposures,
    evidence,
    generatedAt: new Date().toISOString(),
  };
  
  // Step 10: Save to cache
  await saveToCache(playerKey, sport, playerName, classification, response);
  
  return response;
}

// Export for testing
export { normalizePlayerKey, getTtlMs };
