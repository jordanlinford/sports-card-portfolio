import { db } from "./db";
import { hiddenGems, playerOutlookCache, type HiddenGem, type InsertHiddenGem, type PlayerOutlookResponse } from "@shared/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { fetchPlayerNews as fetchPlayerNewsFromEngine } from "./outlookEngine";

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

function generateBatchId(): string {
  const now = new Date();
  return `gems-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
  
  const newsResult = await fetchPlayerNewsFromEngine(playerName, sport);
  const newsContext = newsResult.snippets.length > 0 
    ? `\n\nCURRENT NEWS (use this for up-to-date context):\n${newsResult.snippets.join("\n")}`
    : "";
  
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
  } catch (error) {
    console.error(`[HiddenGems] Failed to generate content for ${playerName}:`, error);
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
}

export async function getActiveHiddenGems(): Promise<HiddenGem[]> {
  const gems = await db
    .select()
    .from(hiddenGems)
    .where(eq(hiddenGems.isActive, true))
    .orderBy(desc(hiddenGems.discountScore));
  
  return gems;
}

export async function refreshHiddenGems(targetCount: number = 25): Promise<{
  success: boolean;
  gemsCreated: number;
  batchId: string;
  error?: string;
}> {
  const batchId = generateBatchId();
  console.log(`[HiddenGems] Starting refresh, batchId: ${batchId}, target: ${targetCount}`);
  
  try {
    const cachedOutlooks = await db
      .select()
      .from(playerOutlookCache)
      .where(isNotNull(playerOutlookCache.outlookJson));
    
    console.log(`[HiddenGems] Found ${cachedOutlooks.length} cached player outlooks`);
    
    if (cachedOutlooks.length === 0) {
      return { success: false, gemsCreated: 0, batchId, error: "No cached player outlooks found" };
    }
    
    const buyCandidates: Array<{
      playerKey: string;
      playerName: string;
      sport: string;
      outlook: PlayerOutlookResponse;
      discountScore: number;
      isAvoid: false;
    }> = [];
    
    const avoidCandidates: Array<{
      playerKey: string;
      playerName: string;
      sport: string;
      outlook: PlayerOutlookResponse;
      discountScore: number;
      isAvoid: true;
    }> = [];
    
    for (const cached of cachedOutlooks) {
      const outlook = cached.outlookJson as PlayerOutlookResponse;
      if (!outlook?.investmentCall) continue;
      
      const verdict = outlook.investmentCall.verdict;
      
      if (["ACCUMULATE", "HOLD_CORE", "SPECULATIVE_FLYER"].includes(verdict)) {
        const discountScore = calculateDiscountScore(outlook);
        if (discountScore >= 40) {
          buyCandidates.push({
            playerKey: cached.playerKey,
            playerName: cached.playerName,
            sport: cached.sport,
            outlook,
            discountScore,
            isAvoid: false,
          });
        }
      } else if (verdict === "TRADE_THE_HYPE" || verdict === "AVOID_NEW_MONEY") {
        const cautionScore = calculateCautionScore(outlook);
        if (cautionScore >= 40) {
          avoidCandidates.push({
            playerKey: cached.playerKey,
            playerName: cached.playerName,
            sport: cached.sport,
            outlook,
            discountScore: cautionScore,
            isAvoid: true,
          });
        }
      }
    }
    
    console.log(`[HiddenGems] ${buyCandidates.length} BUY candidates, ${avoidCandidates.length} AVOID candidates`);
    
    // Shuffle candidates to get different gems each refresh, then sort by score
    // This ensures variety while still prioritizing high-scoring candidates
    const shuffleArray = <T>(arr: T[]): T[] => {
      const shuffled = [...arr];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };
    
    // Group by score tiers (within 10 points) and shuffle within tiers
    const shuffleWithinTiers = <T extends { discountScore: number }>(arr: T[]): T[] => {
      const sorted = [...arr].sort((a, b) => b.discountScore - a.discountScore);
      const result: T[] = [];
      let tierStart = 0;
      
      for (let i = 0; i < sorted.length; i++) {
        const isLastItem = i === sorted.length - 1;
        const scoreDiff = isLastItem ? 0 : sorted[tierStart].discountScore - sorted[i + 1].discountScore;
        
        if (isLastItem || scoreDiff > 10) {
          // End of tier, shuffle this tier and add to result
          const tier = sorted.slice(tierStart, i + 1);
          result.push(...shuffleArray(tier));
          tierStart = i + 1;
        }
      }
      return result;
    };
    
    const shuffledBuyCandidates = shuffleWithinTiers(buyCandidates);
    const shuffledAvoidCandidates = shuffleWithinTiers(avoidCandidates);
    
    // Replace original sorted arrays with shuffled versions
    buyCandidates.length = 0;
    buyCandidates.push(...shuffledBuyCandidates);
    avoidCandidates.length = 0;
    avoidCandidates.push(...shuffledAvoidCandidates);
    
    let buyTargetCount = Math.ceil(targetCount * 0.7);
    let avoidTargetCount = Math.floor(targetCount * 0.3);
    
    if (avoidCandidates.length < avoidTargetCount) {
      avoidTargetCount = avoidCandidates.length;
      buyTargetCount = targetCount - avoidTargetCount;
    }
    if (buyCandidates.length < buyTargetCount) {
      buyTargetCount = buyCandidates.length;
      avoidTargetCount = Math.min(avoidCandidates.length, targetCount - buyTargetCount);
    }
    
    const sportCounts: Record<string, number> = {};
    const maxPerSport = Math.ceil(buyTargetCount / 4);
    const selectedBuyCandidates = buyCandidates.filter(c => {
      const count = sportCounts[c.sport] || 0;
      if (count >= maxPerSport) return false;
      sportCounts[c.sport] = count + 1;
      return true;
    }).slice(0, buyTargetCount);
    
    const avoidSportCounts: Record<string, number> = {};
    const maxAvoidPerSport = Math.ceil(avoidTargetCount / 4);
    const selectedAvoidCandidates = avoidCandidates.filter(c => {
      const count = avoidSportCounts[c.sport] || 0;
      if (count >= maxAvoidPerSport) return false;
      avoidSportCounts[c.sport] = count + 1;
      return true;
    }).slice(0, avoidTargetCount);
    
    type Candidate = typeof buyCandidates[0] | typeof avoidCandidates[0];
    const selectedCandidates: Candidate[] = [...selectedBuyCandidates, ...selectedAvoidCandidates];
    
    console.log(`[HiddenGems] Selected ${selectedCandidates.length} gems for generation`);
    
    await db.update(hiddenGems).set({ isActive: false }).where(eq(hiddenGems.isActive, true));
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    let gemsCreated = 0;
    for (let i = 0; i < selectedCandidates.length; i++) {
      const candidate = selectedCandidates[i];
      const isAvoid = candidate.isAvoid;
      
      try {
        const content = await generateGemContent(
          candidate.playerName,
          candidate.sport,
          candidate.outlook,
          isAvoid
        );
        
        const gemVerdict = getDisplayVerdict(candidate.outlook.investmentCall?.verdict);
        const modifier = isAvoid ? "Caution" : "Value";
        const tier = isAvoid ? "CAUTION" : determineTier(candidate.outlook);
        
        const gemData: InsertHiddenGem = {
          playerKey: candidate.playerKey,
          playerName: candidate.playerName,
          sport: candidate.sport,
          position: candidate.outlook.player?.position || null,
          team: candidate.outlook.player?.team || null,
          verdict: gemVerdict,
          modifier,
          temperature: candidate.outlook.snapshot?.temperature || "NEUTRAL",
          tier,
          riskLevel: determineRiskLevel(candidate.outlook),
          thesis: content.thesis,
          whyDiscounted: content.whyDiscounted,
          repricingCatalysts: content.repricingCatalysts,
          trapRisks: content.trapRisks,
          upsideScore: isAvoid ? null : (candidate.outlook.investmentCall?.scores?.valuationScore || null),
          confidenceScore: candidate.outlook.snapshot?.confidence === "HIGH" ? 85 : candidate.outlook.snapshot?.confidence === "MEDIUM" ? 60 : 40,
          discountScore: Math.round(candidate.discountScore),
          batchId,
          sortOrder: i,
          isActive: true,
          expiresAt,
        };
        
        await db.insert(hiddenGems).values(gemData);
        gemsCreated++;
        
        console.log(`[HiddenGems] Created gem ${gemsCreated}: ${candidate.playerName} (${gemVerdict})`);
      } catch (err) {
        console.error(`[HiddenGems] Failed to create gem for ${candidate.playerName}:`, err);
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
    playerKey: `${player.sport.toLowerCase()}-${player.playerName.toLowerCase().replace(/\s+/g, '-')}`,
    playerName: player.playerName,
    sport: player.sport,
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
