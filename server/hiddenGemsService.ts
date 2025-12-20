import { db } from "./db";
import { hiddenGems, playerOutlookCache, type HiddenGem, type InsertHiddenGem, type PlayerOutlookResponse } from "@shared/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import OpenAI from "openai";

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
  
  const prompt = `Generate hidden gem analysis for ${playerName} (${sport}):

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
2. "whyDiscounted": 2 specific reasons the market has discounted this player
3. "repricingCatalysts": 2 specific events that would reprice cards higher
4. "trapRisks": 1-2 risks that could confirm the discount is justified

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
