import { db } from "./db";
import { hiddenGems, playerOutlookCache, cards, type HiddenGem, type InsertHiddenGem, type PlayerOutlookResponse } from "@shared/schema";
import { eq, desc, and, isNotNull, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

function generateBatchId(): string {
  const now = new Date();
  return `gems-${now.toISOString().replace(/[:.]/g, "-")}`;
}

function normalizePlayerName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .replace(/\bMc(\w)/g, (_, c) => `Mc${c.toUpperCase()}`)
    .replace(/\bO'(\w)/g, (_, c) => `O'${c.toUpperCase()}`)
    .replace(/\bDe'(\w)/g, (_, c) => `De'${c.toUpperCase()}`)
    .replace(/\bSt\.\s/g, "St. ")
    .replace(/\bJr\b/gi, "Jr")
    .replace(/\bIi\b/g, "II")
    .replace(/\bIii\b/g, "III");
}

function normalizePlayerKey(name: string, sport: string): string {
  return `${sport.toLowerCase()}:${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

function normalizeSport(sport: string): string {
  const upper = sport.toUpperCase();
  const sportMap: Record<string, string> = {
    "FOOTBALL": "NFL", "NFL": "NFL",
    "BASKETBALL": "NBA", "NBA": "NBA",
    "BASEBALL": "MLB", "MLB": "MLB",
    "HOCKEY": "NHL", "NHL": "NHL",
    "SOCCER": "Soccer", "MLS": "Soccer",
  };
  return sportMap[upper] || sport;
}

function calculateDiscountScore(outlook: PlayerOutlookResponse): number {
  const scores = outlook.investmentCall?.scores;
  const upsideScore = scores?.valuationScore ?? 50;
  const riskScore = scores?.downsideRiskScore ?? 50;
  const confidence = outlook.snapshot?.confidence;
  const confidenceScore = confidence === "HIGH" ? 85 : confidence === "MEDIUM" ? 60 : 40;
  
  const call = outlook.investmentCall;
  if (!call) return 0;
  
  let discountBonus = 0;
  if (call.verdict === "ACCUMULATE") discountBonus = 30;
  else if (call.verdict === "HOLD_CORE") discountBonus = 15;
  else if (call.verdict === "SPECULATIVE_FLYER") discountBonus = 20;
  
  const temp = outlook.snapshot?.temperature;
  const tempBonus = 
    temp === "COOLING" ? 15 :
    temp === "NEUTRAL" ? 10 :
    temp === "WARM" ? 5 : 0;
  
  return Math.min(100, Math.max(0, 
    upsideScore * 0.4 + 
    (100 - riskScore) * 0.2 + 
    confidenceScore * 0.2 +
    discountBonus + 
    tempBonus
  ));
}

function determineRiskLevel(outlook: PlayerOutlookResponse): "LOW" | "MEDIUM" | "HIGH" {
  const riskScore = outlook.investmentCall?.scores?.downsideRiskScore ?? 50;
  if (riskScore < 40) return "LOW";
  if (riskScore < 60) return "MEDIUM";
  return "HIGH";
}

function determineTier(outlook: PlayerOutlookResponse): string {
  const call = outlook.investmentCall;
  if (!call) return "SPECULATIVE";
  
  if (call.verdict === "ACCUMULATE") return "GROWTH";
  if (call.verdict === "HOLD_CORE") return "PREMIUM";
  if (call.verdict === "SPECULATIVE_FLYER") return "SPECULATIVE";
  return "CORE";
}

// Return the actual verdict for display consistency with the analysis page
function getDisplayVerdict(verdict?: string): string {
  // Return the actual verdict so hidden gems matches full analysis page
  if (verdict) return verdict;
  return "MONITOR";
}

function calculateCautionScore(outlook: PlayerOutlookResponse): number {
  const scores = outlook.investmentCall?.scores;
  const riskScore = scores?.downsideRiskScore ?? 50;
  const valuationScore = scores?.valuationScore ?? 50;
  const confidence = outlook.snapshot?.confidence;
  const confidenceScore = confidence === "HIGH" ? 85 : confidence === "MEDIUM" ? 60 : 40;
  
  const call = outlook.investmentCall;
  if (!call) return 0;
  
  let avoidBonus = 0;
  if (call.verdict === "AVOID_NEW_MONEY") avoidBonus = 30;
  else if (call.verdict === "TRADE_THE_HYPE") avoidBonus = 25;
  
  const temp = outlook.snapshot?.temperature;
  const tempBonus = 
    temp === "HOT" ? 20 :
    temp === "WARM" ? 10 :
    temp === "NEUTRAL" ? 5 : 0;
  
  return Math.min(100, Math.max(0, 
    riskScore * 0.3 + 
    (100 - valuationScore) * 0.2 + 
    confidenceScore * 0.2 +
    avoidBonus + 
    tempBonus
  ));
}

async function generateGemContent(
  playerName: string,
  sport: string,
  outlook: PlayerOutlookResponse,
  isAvoid: boolean = false
): Promise<{
  thesis: string;
  whyDiscounted: string[];
  repricingCatalysts: string[];
  trapRisks: string[];
}> {
  const call = outlook.investmentCall;
  const thesisPoints = outlook.thesis || [];
  const realityCheck = outlook.marketRealityCheck || [];
  
  const existingRationale = outlook.investmentCall?.oneLineRationale || "";
  const playerInfo = outlook.player;
  const playerContext = playerInfo 
    ? `\nPlayer Info: ${playerInfo.team || "Unknown team"}, ${playerInfo.position || "Unknown position"}, ${playerInfo.stage || "Unknown stage"}`
    : "";
  const newsContext = existingRationale 
    ? `\n\nCACHED ANALYSIS CONTEXT:${playerContext}\n${existingRationale}`
    : playerContext;
  
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const prompt = isAvoid 
    ? `Generate AVOID analysis for ${playerName} (${sport}):

IMPORTANT: Today is ${currentDate}. Use ONLY current, verified information. Do NOT reference outdated facts.
${newsContext}

Current Investment Call: ${call?.verdict || "UNKNOWN"}
Market Temperature: ${outlook.snapshot?.temperature || "UNKNOWN"}
Risk Score: ${call?.scores?.downsideRiskScore || "N/A"}/100

Existing Thesis Points:
${thesisPoints.join("\n")}

Market Reality Check:
${realityCheck.join("\n")}

Generate a JSON object with:
1. "thesis": A single sentence (max 100 chars) summarizing why collectors should AVOID this player right now
2. "whyOverpriced": 2 specific reasons the market has overpriced this player (MUST be current/accurate)
3. "downwardCatalysts": 2 specific events that could push card values lower
4. "contraryBullCase": 1-2 scenarios where avoiding would be wrong (balanced view)

CRITICAL: Base analysis on current news and verified facts. Be specific to ${sport} and ${playerName}.
Return ONLY valid JSON, no markdown.`
    : `Generate hidden gem analysis for ${playerName} (${sport}):

IMPORTANT: Today is ${currentDate}. Use ONLY current, verified information. Do NOT reference outdated facts.
${newsContext}

Current Investment Call: ${call?.verdict || "UNKNOWN"}
Market Temperature: ${outlook.snapshot?.temperature || "UNKNOWN"}
Valuation Score: ${call?.scores?.valuationScore || "N/A"}/100
Risk Score: ${call?.scores?.downsideRiskScore || "N/A"}/100

Existing Thesis Points:
${thesisPoints.join("\n")}

Market Reality Check:
${realityCheck.join("\n")}

Generate a JSON object with:
1. "thesis": A single sentence (max 100 chars) summarizing why this player is undervalued
2. "whyDiscounted": 2 specific reasons the market has discounted this player (MUST be current/accurate)
3. "repricingCatalysts": 2 specific events that would reprice cards higher (based on current situation)
4. "trapRisks": 1-2 risks that could confirm the discount is justified (current risks only)

CRITICAL: Base analysis on current news and verified facts. Do NOT make assumptions about team rosters, player status, or season stage that aren't confirmed in the news.
Be specific to ${sport} and ${playerName}. Reference team, position, market dynamics.
Return ONLY valid JSON, no markdown.`;

  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const systemPrompt = "You are a sports card market analyst. Generate concise, specific analysis. Return only valid JSON.";
      
      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${systemPrompt}\n\n${prompt}`,
      });

      const content = response.text || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (isAvoid) {
        return {
          thesis: parsed.thesis || `${playerName} cards appear overpriced relative to current situation.`,
          whyDiscounted: Array.isArray(parsed.whyOverpriced) ? parsed.whyOverpriced.slice(0, 2) : ["Market hasn't fully priced in recent concerns."],
          repricingCatalysts: Array.isArray(parsed.downwardCatalysts) ? parsed.downwardCatalysts.slice(0, 2) : ["Continued poor performance could trigger sell-off."],
          trapRisks: Array.isArray(parsed.contraryBullCase) ? parsed.contraryBullCase.slice(0, 2) : ["Situation could improve unexpectedly."],
        };
      }
      
      return {
        thesis: parsed.thesis || `${playerName} may be undervalued relative to talent level.`,
        whyDiscounted: Array.isArray(parsed.whyDiscounted) ? parsed.whyDiscounted.slice(0, 2) : ["Market hasn't recognized full potential yet."],
        repricingCatalysts: Array.isArray(parsed.repricingCatalysts) ? parsed.repricingCatalysts.slice(0, 2) : ["Strong performance could shift market sentiment."],
        trapRisks: Array.isArray(parsed.trapRisks) ? parsed.trapRisks.slice(0, 2) : ["Situation could deteriorate further."],
      };
    } catch (error: any) {
      console.error(`[HiddenGems] Content generation attempt ${attempt} failed for ${playerName}:`, error?.message || error);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        continue;
      }
    }
  }

  console.warn(`[HiddenGems] All retries exhausted for ${playerName}, using fallback content`);
  if (isAvoid) {
    return {
      thesis: `${playerName} cards may be overpriced based on current analysis.`,
      whyDiscounted: ["Market sentiment overly optimistic.", "Risk factors not fully reflected in pricing."],
      repricingCatalysts: ["Poor performance could shift perception.", "Negative news could trigger correction."],
      trapRisks: ["Player could outperform expectations."],
    };
  }
  return {
    thesis: `${playerName} may be undervalued based on current market analysis.`,
    whyDiscounted: ["Market sentiment not aligned with talent level.", "External factors creating temporary discount."],
    repricingCatalysts: ["Strong performance could shift perception.", "Positive news catalyst could reprice cards."],
    trapRisks: ["Situation could remain unchanged or worsen."],
  };
}

export async function getActiveHiddenGems(): Promise<HiddenGem[]> {
  const gems = await db
    .select()
    .from(hiddenGems)
    .where(eq(hiddenGems.isActive, true))
    .orderBy(desc(hiddenGems.discountScore));
  
  return gems;
}

// Get unique players from all user portfolios (no AI cost - just database query)
async function getPlayersFromPortfolios(): Promise<Array<{ playerName: string; sport: string }>> {
  const portfolioCards = await db
    .select({
      playerName: cards.playerName,
      sport: cards.sport,
    })
    .from(cards)
    .where(isNotNull(cards.playerName));
  
  // Deduplicate by player name + sport
  const uniquePlayers = new Map<string, { playerName: string; sport: string }>();
  for (const card of portfolioCards) {
    if (!card.playerName || !card.sport) continue;
    const key = `${card.playerName.toLowerCase()}-${card.sport.toLowerCase()}`;
    if (!uniquePlayers.has(key)) {
      uniquePlayers.set(key, {
        playerName: card.playerName,
        sport: card.sport,
      });
    }
  }
  
  console.log(`[HiddenGems] Found ${uniquePlayers.size} unique players from user portfolios`);
  return Array.from(uniquePlayers.values());
}

interface AiDiscoveredGem {
  playerName: string;
  sport: string;
  position: string;
  team: string;
  verdict: string;
  temperature: string;
  tier: string;
  riskLevel: string;
  thesis: string;
  whyDiscounted: string[];
  repricingCatalysts: string[];
  trapRisks: string[];
  upsideScore: number;
  confidenceScore: number;
  discountScore: number;
  isAvoid: boolean;
}

async function discoverGemsFromAI(sport: string, count: number, existingNames: Set<string>): Promise<AiDiscoveredGem[]> {
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const existingList = existingNames.size > 0
    ? `\nDO NOT include any of these players (already selected): ${Array.from(existingNames).join(", ")}`
    : "";

  const prompt = `You are a sports card market analyst. Today is ${currentDate}.

Search the internet for current ${sport} player news, injuries, trades, performances, and card market trends.

Based on CURRENT real-time information, identify ${count} players whose sports cards represent interesting investment opportunities RIGHT NOW. Mix of:
- ~70% undervalued/buy opportunities (players whose cards are cheaper than they should be)
- ~30% overvalued/avoid warnings (players whose cards are overpriced relative to current situation)

For EACH player, provide fresh, specific analysis based on what's happening RIGHT NOW — not generic takes.
${existingList}

Return a JSON array of objects with this exact structure:
[
  {
    "playerName": "Full Name (properly capitalized)",
    "sport": "${sport}",
    "position": "Position abbreviation",
    "team": "Team abbreviation",
    "isAvoid": false,
    "verdict": "ACCUMULATE or HOLD_CORE or SPECULATIVE_FLYER or TRADE_THE_HYPE or AVOID_NEW_MONEY",
    "temperature": "HOT or WARM or NEUTRAL or COOLING",
    "tier": "PREMIUM or GROWTH or SPECULATIVE or CAUTION",
    "riskLevel": "LOW or MEDIUM or HIGH",
    "thesis": "One specific sentence about why this is an opportunity RIGHT NOW (max 120 chars)",
    "whyDiscounted": ["Specific current reason 1", "Specific current reason 2"],
    "repricingCatalysts": ["Specific upcoming catalyst 1", "Specific upcoming catalyst 2"],
    "trapRisks": ["Specific risk that could make this wrong"],
    "upsideScore": 65,
    "confidenceScore": 70,
    "discountScore": 72
  }
]

RULES:
- Use ONLY verifiable current information from your search results
- Reference specific recent events, stats, trades, injuries happening NOW
- Do NOT use generic/evergreen analysis like "hasn't reached full potential"
- Scores should be 40-95 range, with discountScore reflecting how compelling the opportunity is
- For avoid picks: set isAvoid=true, use TRADE_THE_HYPE or AVOID_NEW_MONEY verdict, tier=CAUTION
- For buy picks: set isAvoid=false, use ACCUMULATE/HOLD_CORE/SPECULATIVE_FLYER verdict
- Each player must be currently active in ${sport} (no retired players unless very recently retired)
- Prefer interesting/surprising picks over obvious superstar picks

Return ONLY valid JSON array, no markdown.`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const content = response.text || "[]";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`[HiddenGems] No JSON array found in AI discovery response for ${sport}`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as AiDiscoveredGem[];
    const validGems = parsed.filter(g =>
      g.playerName && g.sport && g.thesis &&
      Array.isArray(g.whyDiscounted) && g.whyDiscounted.length > 0 &&
      Array.isArray(g.repricingCatalysts) && g.repricingCatalysts.length > 0
    );

    console.log(`[HiddenGems] AI discovered ${validGems.length} valid gems for ${sport}`);
    return validGems;
  } catch (error: any) {
    console.error(`[HiddenGems] AI discovery failed for ${sport}:`, error?.message || error);
    return [];
  }
}

export async function refreshHiddenGems(targetCount: number = 25): Promise<{
  success: boolean;
  gemsCreated: number;
  batchId: string;
  error?: string;
}> {
  const batchId = generateBatchId();
  console.log(`[HiddenGems] Starting fresh AI-powered refresh, batchId: ${batchId}, target: ${targetCount}`);

  try {
    const sports = ["NFL", "NBA", "MLB", "NHL"];
    const perSport = Math.ceil(targetCount / sports.length);
    const allGems: AiDiscoveredGem[] = [];
    const seenPlayerKeys = new Set<string>();

    for (const sport of sports) {
      const existingNames = new Set(allGems.map(g => g.playerName));
      const discovered = await discoverGemsFromAI(sport, perSport + 2, existingNames);

      for (const gem of discovered) {
        const normalizedName = normalizePlayerName(gem.playerName);
        const normalizedSport = normalizeSport(gem.sport || sport);
        const key = normalizePlayerKey(normalizedName, normalizedSport);

        if (seenPlayerKeys.has(key)) continue;
        seenPlayerKeys.add(key);

        gem.playerName = normalizedName;
        gem.sport = normalizedSport;
        allGems.push(gem);
      }

      if (sports.indexOf(sport) < sports.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[HiddenGems] Total unique gems discovered: ${allGems.length}`);

    if (allGems.length === 0) {
      return { success: false, gemsCreated: 0, batchId, error: "AI discovery returned no results" };
    }

    await db.update(hiddenGems).set({ isActive: false }).where(eq(hiddenGems.isActive, true));

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    let gemsCreated = 0;
    const sortedGems = allGems
      .sort((a, b) => (b.discountScore || 60) - (a.discountScore || 60))
      .slice(0, targetCount);

    for (let i = 0; i < sortedGems.length; i++) {
      const gem = sortedGems[i];

      try {
        const normalizedSport = normalizeSport(gem.sport);
        const normalizedName = normalizePlayerName(gem.playerName);
        const playerKey = normalizePlayerKey(normalizedName, normalizedSport);

        const validVerdicts = ["ACCUMULATE", "HOLD_CORE", "SPECULATIVE_FLYER", "TRADE_THE_HYPE", "AVOID_NEW_MONEY"];
        const verdict = validVerdicts.includes(gem.verdict) ? gem.verdict : (gem.isAvoid ? "AVOID_NEW_MONEY" : "ACCUMULATE");

        const validTemps = ["HOT", "WARM", "NEUTRAL", "COOLING"];
        const temperature = validTemps.includes(gem.temperature) ? gem.temperature : "NEUTRAL";

        const validTiers = ["PREMIUM", "GROWTH", "SPECULATIVE", "CAUTION", "CORE"];
        const tier = gem.isAvoid ? "CAUTION" : (validTiers.includes(gem.tier) ? gem.tier : "GROWTH");

        const validRisks = ["LOW", "MEDIUM", "HIGH"];
        const riskLevel = validRisks.includes(gem.riskLevel) ? gem.riskLevel : "MEDIUM";

        const gemData: InsertHiddenGem = {
          playerKey,
          playerName: normalizedName,
          sport: normalizedSport,
          position: gem.position || null,
          team: gem.team || null,
          verdict,
          modifier: gem.isAvoid ? "Caution" : "Value",
          temperature,
          tier,
          riskLevel,
          thesis: gem.thesis?.slice(0, 200) || `${normalizedName} represents an interesting card market opportunity.`,
          whyDiscounted: (gem.whyDiscounted || []).slice(0, 3),
          repricingCatalysts: (gem.repricingCatalysts || []).slice(0, 3),
          trapRisks: (gem.trapRisks || []).slice(0, 2),
          upsideScore: gem.isAvoid ? null : Math.min(95, Math.max(30, gem.upsideScore || 65)),
          confidenceScore: Math.min(95, Math.max(30, gem.confidenceScore || 65)),
          discountScore: Math.min(95, Math.max(30, gem.discountScore || 60)),
          batchId,
          sortOrder: i,
          isActive: true,
          expiresAt,
        };

        await db.insert(hiddenGems).values(gemData);
        gemsCreated++;
        console.log(`[HiddenGems] Created gem ${gemsCreated}: ${normalizedName} (${verdict})`);
      } catch (err) {
        console.error(`[HiddenGems] Failed to create gem for ${gem.playerName}:`, err);
      }
    }

    console.log(`[HiddenGems] Refresh complete. Created ${gemsCreated} gems.`);
    return { success: true, gemsCreated, batchId };
  } catch (error) {
    console.error("[HiddenGems] Refresh failed:", error);
    return {
      success: false,
      gemsCreated: 0,
      batchId,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function getHiddenGemsStats(): Promise<{
  totalActive: number;
  bySport: Record<string, number>;
  byVerdict: Record<string, number>;
  byTemperature: Record<string, number>;
  lastRefresh: string | null;
  batchId: string | null;
}> {
  const gems = await getActiveHiddenGems();
  
  const bySport: Record<string, number> = {};
  const byVerdict: Record<string, number> = {};
  const byTemperature: Record<string, number> = {};
  let lastRefresh: string | null = null;
  let batchId: string | null = null;
  
  for (const gem of gems) {
    bySport[gem.sport] = (bySport[gem.sport] || 0) + 1;
    byVerdict[gem.verdict] = (byVerdict[gem.verdict] || 0) + 1;
    byTemperature[gem.temperature] = (byTemperature[gem.temperature] || 0) + 1;
    
    if (!lastRefresh && gem.createdAt) {
      lastRefresh = gem.createdAt.toISOString();
      batchId = gem.batchId;
    }
  }
  
  return {
    totalActive: gems.length,
    bySport,
    byVerdict,
    byTemperature,
    lastRefresh,
    batchId,
  };
}

// Fallback featured players when no AI gems exist
// These are curated players from each sport who typically represent good value
// Last updated: December 2025
const FALLBACK_FEATURED_PLAYERS: Array<{
  playerName: string;
  sport: string;
  position: string;
  team: string;
  verdict: "BUY" | "MONITOR";
  temperature: "NEUTRAL" | "WARM" | "COOLING";
  tier: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  thesis: string;
  whyDiscounted: string[];
  repricingCatalysts: string[];
  trapRisks: string[];
}> = [
  // NFL
  {
    playerName: "Puka Nacua",
    sport: "NFL",
    position: "WR",
    team: "LAR",
    verdict: "BUY",
    temperature: "WARM",
    tier: "GROWTH",
    riskLevel: "MEDIUM",
    thesis: "Elite WR1 with proven chemistry with Matthew Stafford.",
    whyDiscounted: ["Injury concerns after missing time", "Rams offensive questions"],
    repricingCatalysts: ["Healthy full season production", "Pro Bowl/All-Pro selection"],
    trapRisks: ["Durability remains a question mark"],
  },
  {
    playerName: "CJ Stroud",
    sport: "NFL",
    position: "QB",
    team: "HOU",
    verdict: "BUY",
    temperature: "WARM",
    tier: "PREMIUM",
    riskLevel: "LOW",
    thesis: "Elite young QB entering prime with proven playoff success.",
    whyDiscounted: ["Market already priced some upside", "AFC competition concerns"],
    repricingCatalysts: ["MVP votes", "Deep playoff run or Super Bowl appearance"],
    trapRisks: ["Offensive line health could limit ceiling"],
  },
  {
    playerName: "Brock Bowers",
    sport: "NFL",
    position: "TE",
    team: "LVR",
    verdict: "MONITOR",
    temperature: "COOLING",
    tier: "GROWTH",
    riskLevel: "MEDIUM",
    thesis: "Elite second-year TE with historic production, now on IR.",
    whyDiscounted: ["Season-ending IR placement", "Raiders franchise instability"],
    repricingCatalysts: ["Healthy return in 2025", "Trade to contender"],
    trapRisks: ["Injury concerns and team dysfunction could persist"],
  },
  // NBA
  {
    playerName: "Victor Wembanyama",
    sport: "NBA",
    position: "C",
    team: "SAS",
    verdict: "BUY",
    temperature: "WARM",
    tier: "PREMIUM",
    riskLevel: "LOW",
    thesis: "Generational prospect with unprecedented physical profile.",
    whyDiscounted: ["San Antonio market not flashy", "Team still rebuilding"],
    repricingCatalysts: ["All-Star selection", "MVP votes"],
    trapRisks: ["Injury concerns with unique frame"],
  },
  {
    playerName: "Tyrese Maxey",
    sport: "NBA",
    position: "PG",
    team: "PHI",
    verdict: "BUY",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    riskLevel: "MEDIUM",
    thesis: "Elite young guard emerging as second star alongside Embiid.",
    whyDiscounted: ["Overshadowed by Embiid headlines", "Team chemistry concerns"],
    repricingCatalysts: ["All-Star starter", "Deep playoff run"],
    trapRisks: ["Ball-handling duties could shift with roster moves"],
  },
  {
    playerName: "Chet Holmgren",
    sport: "NBA",
    position: "C",
    team: "OKC",
    verdict: "MONITOR",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    riskLevel: "MEDIUM",
    thesis: "Unicorn skillset on championship-contending young team.",
    whyDiscounted: ["Durability concerns", "Thin frame questions"],
    repricingCatalysts: ["All-Defensive Team selection", "OKC title run"],
    trapRisks: ["Injury history could resurface"],
  },
  // MLB
  {
    playerName: "Gunnar Henderson",
    sport: "MLB",
    position: "SS",
    team: "BAL",
    verdict: "BUY",
    temperature: "WARM",
    tier: "GROWTH",
    riskLevel: "LOW",
    thesis: "Elite young shortstop with power-speed combo on rising team.",
    whyDiscounted: ["Baltimore market smaller than NY/LA", "Young player volatility"],
    repricingCatalysts: ["MVP votes", "Orioles playoff success"],
    trapRisks: ["League adjustments to approach"],
  },
  {
    playerName: "Corbin Carroll",
    sport: "MLB",
    position: "OF",
    team: "ARI",
    verdict: "MONITOR",
    temperature: "COOLING",
    tier: "GROWTH",
    riskLevel: "MEDIUM",
    thesis: "ROY talent at discount after regression year.",
    whyDiscounted: ["Sophomore struggles created selling pressure", "Small sample concerns"],
    repricingCatalysts: ["Return to ROY form", "All-Star selection"],
    trapRisks: ["2023 may have been the outlier, not 2024"],
  },
  {
    playerName: "Elly De La Cruz",
    sport: "MLB",
    position: "SS",
    team: "CIN",
    verdict: "BUY",
    temperature: "WARM",
    tier: "SPECULATIVE",
    riskLevel: "MEDIUM",
    thesis: "Generational tools with highlight-reel potential.",
    whyDiscounted: ["Strikeout rate concerns", "Cincinnati market"],
    repricingCatalysts: ["40/40 season", "Improved plate discipline"],
    trapRisks: ["Contact issues may limit ceiling"],
  },
  // NHL
  {
    playerName: "Connor Bedard",
    sport: "NHL",
    position: "C",
    team: "CHI",
    verdict: "BUY",
    temperature: "NEUTRAL",
    tier: "PREMIUM",
    riskLevel: "LOW",
    thesis: "Generational talent, next face of the league.",
    whyDiscounted: ["Chicago rebuilding timeline", "Team defense concerns"],
    repricingCatalysts: ["Hart Trophy votes", "Team playoff push"],
    trapRisks: ["Slow team rebuild could limit statistical output"],
  },
  {
    playerName: "Matvei Michkov",
    sport: "NHL",
    position: "RW",
    team: "PHI",
    verdict: "MONITOR",
    temperature: "WARM",
    tier: "GROWTH",
    riskLevel: "MEDIUM",
    thesis: "Electric young talent with game-breaking ability.",
    whyDiscounted: ["NHL adjustment period", "Philadelphia market volatility"],
    repricingCatalysts: ["Calder Trophy contention", "Point-per-game pace"],
    trapRisks: ["North American ice adjustment"],
  },
  {
    playerName: "Macklin Celebrini",
    sport: "NHL",
    position: "C",
    team: "SJS",
    verdict: "MONITOR",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    riskLevel: "MEDIUM",
    thesis: "Elite prospect on rebuilding franchise.",
    whyDiscounted: ["San Jose market small", "Team years from contention"],
    repricingCatalysts: ["Calder Trophy win", "Franchise cornerstone narrative"],
    trapRisks: ["Team context limits value appreciation timeline"],
  },
];

export function getFallbackFeaturedGems(): HiddenGem[] {
  return FALLBACK_FEATURED_PLAYERS.map((player, index) => ({
    id: 10000 + index,
    playerKey: normalizePlayerKey(player.playerName, player.sport),
    playerName: normalizePlayerName(player.playerName),
    sport: normalizeSport(player.sport),
    position: player.position,
    team: player.team,
    verdict: player.verdict,
    modifier: "Featured",
    temperature: player.temperature,
    tier: player.tier,
    riskLevel: player.riskLevel,
    thesis: player.thesis,
    whyDiscounted: player.whyDiscounted,
    repricingCatalysts: player.repricingCatalysts,
    trapRisks: player.trapRisks,
    upsideScore: 70,
    confidenceScore: 65,
    discountScore: 60,
    batchId: "curated-fallback",
    sortOrder: index,
    isActive: true,
    expiresAt: null,
    createdAt: new Date(),
  }));
}

// Popular players to seed the database with outlooks
// Diverse mix of verdicts expected: ACCUMULATE, HOLD_CORE, AVOID, SPECULATIVE
const SEED_PLAYERS: Array<{ name: string; sport: string }> = [
  // NFL - Stars & Established
  { name: "Patrick Mahomes", sport: "NFL" },
  { name: "Josh Allen", sport: "NFL" },
  { name: "Lamar Jackson", sport: "NFL" },
  { name: "Joe Burrow", sport: "NFL" },
  { name: "Justin Jefferson", sport: "NFL" },
  { name: "Ja'Marr Chase", sport: "NFL" },
  { name: "Tyreek Hill", sport: "NFL" },
  { name: "CeeDee Lamb", sport: "NFL" },
  { name: "Travis Kelce", sport: "NFL" },
  { name: "Derrick Henry", sport: "NFL" },
  // NFL - Rising/Younger
  { name: "CJ Stroud", sport: "NFL" },
  { name: "Caleb Williams", sport: "NFL" },
  { name: "Jayden Daniels", sport: "NFL" },
  { name: "Puka Nacua", sport: "NFL" },
  { name: "Brock Bowers", sport: "NFL" },
  { name: "Marvin Harrison Jr", sport: "NFL" },
  { name: "Malik Nabers", sport: "NFL" },
  // NFL - Potential Avoids/Busts
  { name: "Trey Lance", sport: "NFL" },
  { name: "Zach Wilson", sport: "NFL" },
  { name: "Bryce Young", sport: "NFL" },
  
  // NBA - Stars
  { name: "Victor Wembanyama", sport: "NBA" },
  { name: "Luka Doncic", sport: "NBA" },
  { name: "Jayson Tatum", sport: "NBA" },
  { name: "Anthony Edwards", sport: "NBA" },
  { name: "Shai Gilgeous-Alexander", sport: "NBA" },
  { name: "Giannis Antetokounmpo", sport: "NBA" },
  { name: "Stephen Curry", sport: "NBA" },
  { name: "LeBron James", sport: "NBA" },
  // NBA - Rising
  { name: "Tyrese Maxey", sport: "NBA" },
  { name: "Chet Holmgren", sport: "NBA" },
  { name: "Paolo Banchero", sport: "NBA" },
  { name: "Tyrese Haliburton", sport: "NBA" },
  // NBA - Potential Avoids
  { name: "Ben Simmons", sport: "NBA" },
  { name: "James Wiseman", sport: "NBA" },
  
  // MLB - Stars
  { name: "Shohei Ohtani", sport: "MLB" },
  { name: "Ronald Acuna Jr", sport: "MLB" },
  { name: "Mookie Betts", sport: "MLB" },
  { name: "Mike Trout", sport: "MLB" },
  { name: "Juan Soto", sport: "MLB" },
  // MLB - Rising
  { name: "Gunnar Henderson", sport: "MLB" },
  { name: "Elly De La Cruz", sport: "MLB" },
  { name: "Corbin Carroll", sport: "MLB" },
  { name: "Jackson Holliday", sport: "MLB" },
  { name: "Paul Skenes", sport: "MLB" },
  
  // NHL - Stars
  { name: "Connor McDavid", sport: "NHL" },
  { name: "Connor Bedard", sport: "NHL" },
  { name: "Auston Matthews", sport: "NHL" },
  { name: "Nathan MacKinnon", sport: "NHL" },
  // NHL - Rising
  { name: "Matvei Michkov", sport: "NHL" },
  { name: "Macklin Celebrini", sport: "NHL" },
  
  // Additional NFL players for variety
  { name: "Amon-Ra St. Brown", sport: "NFL" },
  { name: "Garrett Wilson", sport: "NFL" },
  { name: "Chris Olave", sport: "NFL" },
  { name: "Drake London", sport: "NFL" },
  { name: "Jalen Hurts", sport: "NFL" },
  { name: "Dak Prescott", sport: "NFL" },
  { name: "Jaxon Smith-Njigba", sport: "NFL" },
  { name: "Rome Odunze", sport: "NFL" },
  { name: "Breece Hall", sport: "NFL" },
  { name: "Bijan Robinson", sport: "NFL" },
  { name: "Jahmyr Gibbs", sport: "NFL" },
  { name: "De'Von Achane", sport: "NFL" },
  { name: "Sam LaPorta", sport: "NFL" },
  { name: "Trey McBride", sport: "NFL" },
  
  // Additional NBA players
  { name: "Jalen Brunson", sport: "NBA" },
  { name: "Donovan Mitchell", sport: "NBA" },
  { name: "De'Aaron Fox", sport: "NBA" },
  { name: "Ja Morant", sport: "NBA" },
  { name: "Darius Garland", sport: "NBA" },
  { name: "Scottie Barnes", sport: "NBA" },
  { name: "Franz Wagner", sport: "NBA" },
  { name: "Evan Mobley", sport: "NBA" },
  { name: "Jalen Green", sport: "NBA" },
  { name: "Alperen Sengun", sport: "NBA" },
  { name: "Keyonte George", sport: "NBA" },
  { name: "Jaime Jaquez Jr", sport: "NBA" },
  { name: "Amen Thompson", sport: "NBA" },
  { name: "Scoot Henderson", sport: "NBA" },
  { name: "Brandon Miller", sport: "NBA" },
  
  // Additional MLB players
  { name: "Bobby Witt Jr", sport: "MLB" },
  { name: "Julio Rodriguez", sport: "MLB" },
  { name: "Corey Seager", sport: "MLB" },
  { name: "Marcus Semien", sport: "MLB" },
  { name: "Francisco Lindor", sport: "MLB" },
  { name: "Trea Turner", sport: "MLB" },
  { name: "Adley Rutschman", sport: "MLB" },
  { name: "Spencer Strider", sport: "MLB" },
  { name: "Kodai Senga", sport: "MLB" },
  { name: "Evan Carter", sport: "MLB" },
  { name: "Jordan Walker", sport: "MLB" },
  { name: "James Wood", sport: "MLB" },
  
  // Additional NHL players
  { name: "Cale Makar", sport: "NHL" },
  { name: "Jack Hughes", sport: "NHL" },
  { name: "Trevor Zegras", sport: "NHL" },
  { name: "Tim Stutzle", sport: "NHL" },
  { name: "Cole Caufield", sport: "NHL" },
  { name: "Lucas Raymond", sport: "NHL" },
  { name: "Moritz Seider", sport: "NHL" },
  { name: "Adam Fantilli", sport: "NHL" },
  { name: "Leo Carlsson", sport: "NHL" },
];

export async function seedPlayerOutlooks(
  getPlayerOutlookFn: (request: { playerName: string; sport: string }) => Promise<any>,
  maxPlayers: number = 50
): Promise<{
  success: boolean;
  analyzed: number;
  failed: number;
  results: Array<{ player: string; sport: string; verdict: string | null; error?: string }>;
}> {
  console.log(`[Seed] Starting player outlook seeding, max: ${maxPlayers}`);
  
  const results: Array<{ player: string; sport: string; verdict: string | null; error?: string }> = [];
  let analyzed = 0;
  let failed = 0;
  
  const playersToSeed = SEED_PLAYERS.slice(0, maxPlayers);
  
  for (const player of playersToSeed) {
    try {
      console.log(`[Seed] Analyzing ${player.name} (${player.sport})...`);
      
      const outlook = await getPlayerOutlookFn({
        playerName: player.name,
        sport: player.sport.toLowerCase(),
      });
      
      const verdict = outlook?.investmentCall?.verdict || null;
      results.push({ player: player.name, sport: player.sport, verdict });
      analyzed++;
      
      console.log(`[Seed] ${player.name}: ${verdict || "NO_VERDICT"}`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[Seed] Failed to analyze ${player.name}:`, error);
      results.push({ 
        player: player.name, 
        sport: player.sport, 
        verdict: null, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
      failed++;
    }
  }
  
  console.log(`[Seed] Complete. Analyzed: ${analyzed}, Failed: ${failed}`);
  
  return { success: failed < analyzed, analyzed, failed, results };
}
