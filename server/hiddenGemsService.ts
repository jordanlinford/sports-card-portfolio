import { db } from "./db";
import { hiddenGems, playerOutlookCache, type HiddenGem, type InsertHiddenGem, type PlayerOutlookResponse } from "@shared/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import OpenAI from "openai";
import { fetchPlayerNews as fetchPlayerNewsFromEngine } from "./outlookEngine";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://ai.replit.dev/v1beta",
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
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

function mapVerdictToGemVerdict(verdict?: string): "BUY" | "MONITOR" {
  if (verdict === "ACCUMULATE") return "BUY";
  if (verdict === "HOLD_CORE") return "BUY";
  if (verdict === "SPECULATIVE_FLYER") return "MONITOR";
  return "MONITOR";
}

async function generateGemContent(
  playerName: string,
  sport: string,
  outlook: PlayerOutlookResponse
): Promise<{
  thesis: string;
  whyDiscounted: string[];
  repricingCatalysts: string[];
  trapRisks: string[];
}> {
  const call = outlook.investmentCall;
  const thesis = outlook.thesis || [];
  const realityCheck = outlook.marketRealityCheck || [];
  
  // Fetch current news to ensure AI has up-to-date information
  const newsResult = await fetchPlayerNewsFromEngine(playerName, sport);
  const newsContext = newsResult.snippets.length > 0 
    ? `\n\nCURRENT NEWS (use this for up-to-date context):\n${newsResult.snippets.join("\n")}`
    : "";
  
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const prompt = `Generate hidden gem analysis for ${playerName} (${sport}):

IMPORTANT: Today is ${currentDate}. Use ONLY current, verified information. Do NOT reference outdated facts.
${newsContext}

Current Investment Call: ${call?.verdict || "UNKNOWN"}
Market Temperature: ${outlook.snapshot?.temperature || "UNKNOWN"}
Valuation Score: ${call?.scores?.valuationScore || "N/A"}/100
Risk Score: ${call?.scores?.downsideRiskScore || "N/A"}/100

Existing Thesis Points:
${thesis.join("\n")}

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
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a sports card market analyst. Generate concise, specific analysis. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      thesis: parsed.thesis || `${playerName} may be undervalued relative to talent level.`,
      whyDiscounted: Array.isArray(parsed.whyDiscounted) ? parsed.whyDiscounted.slice(0, 2) : ["Market hasn't recognized full potential yet."],
      repricingCatalysts: Array.isArray(parsed.repricingCatalysts) ? parsed.repricingCatalysts.slice(0, 2) : ["Strong performance could shift market sentiment."],
      trapRisks: Array.isArray(parsed.trapRisks) ? parsed.trapRisks.slice(0, 2) : ["Situation could deteriorate further."],
    };
  } catch (error) {
    console.error(`[HiddenGems] Failed to generate content for ${playerName}:`, error);
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
    
    const candidates: Array<{
      playerKey: string;
      playerName: string;
      sport: string;
      outlook: PlayerOutlookResponse;
      discountScore: number;
    }> = [];
    
    for (const cached of cachedOutlooks) {
      const outlook = cached.outlookJson as PlayerOutlookResponse;
      if (!outlook?.investmentCall) continue;
      
      const verdict = outlook.investmentCall.verdict;
      if (!["ACCUMULATE", "HOLD_CORE", "SPECULATIVE_FLYER"].includes(verdict)) continue;
      
      if (verdict === "TRADE_THE_HYPE" || verdict === "AVOID_NEW_MONEY") continue;
      
      const discountScore = calculateDiscountScore(outlook);
      
      if (discountScore >= 40) {
        candidates.push({
          playerKey: cached.playerKey,
          playerName: cached.playerName,
          sport: cached.sport,
          outlook,
          discountScore,
        });
      }
    }
    
    console.log(`[HiddenGems] ${candidates.length} candidates meet threshold`);
    
    candidates.sort((a, b) => b.discountScore - a.discountScore);
    
    const sportCounts: Record<string, number> = {};
    const maxPerSport = Math.ceil(targetCount / 4);
    const selectedCandidates = candidates.filter(c => {
      const count = sportCounts[c.sport] || 0;
      if (count >= maxPerSport) return false;
      sportCounts[c.sport] = count + 1;
      return true;
    }).slice(0, targetCount);
    
    console.log(`[HiddenGems] Selected ${selectedCandidates.length} gems for generation`);
    
    await db.update(hiddenGems).set({ isActive: false }).where(eq(hiddenGems.isActive, true));
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    let gemsCreated = 0;
    for (let i = 0; i < selectedCandidates.length; i++) {
      const candidate = selectedCandidates[i];
      
      try {
        const content = await generateGemContent(
          candidate.playerName,
          candidate.sport,
          candidate.outlook
        );
        
        const gemData: InsertHiddenGem = {
          playerKey: candidate.playerKey,
          playerName: candidate.playerName,
          sport: candidate.sport,
          position: candidate.outlook.player?.position || null,
          team: candidate.outlook.player?.team || null,
          verdict: mapVerdictToGemVerdict(candidate.outlook.investmentCall?.verdict),
          modifier: "Value",
          temperature: candidate.outlook.snapshot?.temperature || "NEUTRAL",
          tier: determineTier(candidate.outlook),
          riskLevel: determineRiskLevel(candidate.outlook),
          thesis: content.thesis,
          whyDiscounted: content.whyDiscounted,
          repricingCatalysts: content.repricingCatalysts,
          trapRisks: content.trapRisks,
          upsideScore: candidate.outlook.investmentCall?.scores?.valuationScore || null,
          confidenceScore: candidate.outlook.snapshot?.confidence === "HIGH" ? 85 : candidate.outlook.snapshot?.confidence === "MEDIUM" ? 60 : 40,
          discountScore: Math.round(candidate.discountScore),
          batchId,
          sortOrder: i,
          isActive: true,
          expiresAt,
        };
        
        await db.insert(hiddenGems).values(gemData);
        gemsCreated++;
        
        console.log(`[HiddenGems] Created gem ${gemsCreated}: ${candidate.playerName}`);
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
    temperature: "WARM",
    tier: "GROWTH",
    riskLevel: "MEDIUM",
    thesis: "Record-breaking rookie TE with generational receiving talent.",
    whyDiscounted: ["Raiders franchise instability", "QB carousel limits ceiling"],
    repricingCatalysts: ["Trade to contender", "Pro Bowl selection"],
    trapRisks: ["Team situation could suppress stats long-term"],
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
