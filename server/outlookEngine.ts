// Card Outlook AI 2.0 - Deterministic Signal Computation Engine
// "AI should explain, not decide" - all action logic is transparent and rule-based

import { GoogleGenAI } from "@google/genai";
import type { Card, CardOutlook, PricePoint } from "@shared/schema";
import { lookupPlayer, mapRegistryStage } from "./playerRegistry";
import { isRawCard } from "./priceService";

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// Fetch real-time news about a player using Gemini with Google Search grounding
// This ensures AI explanations use current information, not outdated training data
export async function fetchPlayerNews(playerName: string | null | undefined, sport: string | null | undefined): Promise<{
  snippets: string[];
  momentum: "up" | "flat" | "down";
  newsCount: number;
  roleStatus?: string;
  injuryStatus?: string;
}> {
  if (!playerName) {
    return { snippets: [], momentum: "flat", newsCount: 0 };
  }

  const maxRetries = 3;
  let lastError: Error | null = null;
  
  const currentYear = new Date().getFullYear();
  const sportQuery = sport ? ` ${sport}` : "";
  
  const searchPrompt = `Search for the latest news about ${playerName}${sportQuery} in ${currentYear}.

Focus on finding:
1. Current team and roster status (starter, backup, injured reserve, etc.)
2. Recent performance news (games played, stats, injuries)
3. Depth chart position and role changes
4. Any injuries, surgeries, or health concerns
5. Trade rumors or roster transactions

Return ONLY a JSON object with these exact fields:
{
  "snippets": ["<news snippet 1>", "<news snippet 2>", ...],
  "newsCount": <number of news articles found>,
  "momentum": "up" | "flat" | "down",
  "roleStatus": "<STARTER | BACKUP | INJURED_RESERVE | UNCERTAIN | UNKNOWN>",
  "injuryStatus": "<HEALTHY | INJURED | RECOVERING | UNKNOWN>",
  "details": "<brief summary of current situation>"
}

Be specific about role and injury status. If the player:
- Lost their starting job, set roleStatus to "BACKUP"
- Is on injured reserve or had surgery, set roleStatus to "INJURED_RESERVE" and injuryStatus to "INJURED"
- Was traded or released, note this in details`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[OutlookEngine] News fetch attempt ${attempt} for: ${playerName}`);
      
      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      let responseText = response.text || "";
      console.log(`[OutlookEngine] Gemini news response length: ${responseText.length}`);
      
      // Strip markdown code fences if present (common in Gemini responses)
      responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const snippets = Array.isArray(parsed.snippets) ? parsed.snippets : [];
          
          // Analyze momentum from snippets if not provided
          let momentum: "up" | "flat" | "down" = parsed.momentum || "flat";
          
          // Override momentum based on role/injury status for accuracy
          if (parsed.roleStatus === "INJURED_RESERVE" || parsed.injuryStatus === "INJURED") {
            momentum = "down";
          } else if (parsed.roleStatus === "BACKUP") {
            momentum = momentum === "up" ? "flat" : "down";
          }
          
          console.log(`[OutlookEngine] News for ${playerName}: ${parsed.newsCount || snippets.length} articles, momentum: ${momentum}, role: ${parsed.roleStatus}, injury: ${parsed.injuryStatus}`);
          
          return {
            snippets,
            momentum,
            newsCount: parsed.newsCount || snippets.length,
            roleStatus: parsed.roleStatus,
            injuryStatus: parsed.injuryStatus,
          };
        } catch (parseError) {
          console.error(`[OutlookEngine] Failed to parse news JSON (attempt ${attempt}):`, responseText.substring(0, 200));
          // Continue to next retry attempt on parse failure
        }
      } else {
        console.log(`[OutlookEngine] No JSON found in response (attempt ${attempt})`);
        // Continue to next retry attempt
      }
      
    } catch (error: any) {
      lastError = error;
      console.error(`[OutlookEngine] Gemini news error (attempt ${attempt}):`, error.message);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[OutlookEngine] Retrying news fetch in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error("[OutlookEngine] News fetch failed after retries:", lastError?.message);
  return { snippets: [], momentum: "flat", newsCount: 0 };
}

// Structured market data from Gemini with Google Search grounding
export type GeminiMarketData = {
  soldCount: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  activeListing: number;
  liquidity: "HIGH" | "MEDIUM" | "LOW";
  priceStability: "STABLE" | "VOLATILE" | "UNKNOWN";
  dataSource: "gemini_grounded";
  searchQuery: string;
};

// 24-hour cache for Gemini market data to ensure consistent pricing
interface GeminiMarketCache {
  data: GeminiMarketData;
  cachedAt: number;
}
const geminiMarketCache = new Map<string, GeminiMarketCache>();
const GEMINI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Generate cache key from card attributes
function getGeminiCacheKey(card: {
  title: string;
  playerName?: string | null;
  year?: number | null;
  set?: string | null;
  variation?: string | null;
  grade?: string | null;
  grader?: string | null;
}): string {
  const parts = [
    card.title.toLowerCase().trim(),
    card.year?.toString() || "",
    (card.set || "").toLowerCase().trim(),
    (card.variation || "").toLowerCase().trim(),
    (card.grade || "").toLowerCase().trim(),
    (card.grader || "").toLowerCase().trim(),
  ];
  return parts.join("|");
}

// Fetch real eBay market data using Gemini with Google Search grounding
// This leverages Gemini's ability to search eBay and extract structured data
// Results are cached for 24 hours to ensure consistent pricing
export async function fetchGeminiMarketData(card: {
  title: string;
  playerName?: string | null;
  year?: number | null;
  set?: string | null;
  variation?: string | null;
  grade?: string | null;
  grader?: string | null;
}): Promise<GeminiMarketData | null> {
  // Check cache first
  const cacheKey = getGeminiCacheKey(card);
  const cached = geminiMarketCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < GEMINI_CACHE_TTL_MS) {
    console.log(`[Gemini Market] Cache hit for: ${cacheKey.split("|")[0]} (${Math.round((Date.now() - cached.cachedAt) / 1000 / 60)}min old)`);
    return cached.data;
  }

  const maxRetries = 2;
  let lastError: Error | null = null;
  
  // Build search description
  const parts: string[] = [];
  if (card.year) parts.push(String(card.year));
  if (card.set) parts.push(card.set);
  if (card.playerName) parts.push(card.playerName);
  if (card.variation) parts.push(card.variation);
  const isRaw = isRawCard(card.grade, card.grader);
  if (!isRaw && card.grade && card.grader) {
    parts.push(`${card.grader} ${card.grade}`);
  } else if (!isRaw && card.grade) {
    parts.push(card.grade);
  }
  const searchDescription = parts.join(" ") || card.title;
  
  const isNumbered = card.variation ? /\/\d+/.test(card.variation) : false;
  const variationContext = isNumbered 
    ? `\nCRITICAL: This is a NUMBERED parallel (${card.variation}). It is significantly rarer and more valuable than base cards. Search specifically for "${searchDescription}" — do NOT return base card prices for a numbered parallel.`
    : (card.variation && card.variation.toLowerCase() !== "base"
      ? `\nNote: This is a ${card.variation} parallel — search for this specific variation, not the base version.`
      : "");

  const hasMissingDetails = !card.set || !card.variation;
  const specificityWarning = hasMissingDetails
    ? `\nIMPORTANT SPECIFICITY WARNING: This search is missing ${!card.set ? "the card SET" : ""}${!card.set && !card.variation ? " and " : ""}${!card.variation ? "the card VARIATION/PARALLEL" : ""}. 
DO NOT guess or assume it is the player's most popular/valuable card. The card could be a cheap base card, a common insert, or a low-value parallel.
- If the search query is vague (just a player name), search for the MOST COMMON version of this card, NOT premium rookies or autos.
- When set/variation is unknown, lean toward LOWER price estimates rather than higher ones.
- Set confidence to "LOW" since the card identity is incomplete.
- If you cannot determine the specific card, return soldCount: 0 rather than guessing.`
    : "";

  const rawGradeWarning = isRaw
    ? `\nGRADE FILTER — RAW/UNGRADED ONLY:
This card is RAW (ungraded). You MUST:
- ONLY report prices for RAW/UNGRADED copies
- EXCLUDE all PSA, BGS, SGC, CGC, HGA, and any other graded card sales from your data
- Graded cards (especially PSA 9/10) sell for 2x-10x more than raw copies — mixing them in will INFLATE the value
- When searching eBay, mentally filter OUT any listings that mention PSA, BGS, SGC, or show slabbed cards
- If you can only find graded sales, report soldCount: 0 rather than using graded prices for a raw card`
    : "";

  const searchPrompt = `Search eBay for recently SOLD listings of this sports card: "${searchDescription}"
${variationContext}
${specificityWarning}
${rawGradeWarning}

Look at eBay's "Sold Items" filter to find actual completed sales from the last 30-60 days.
Try multiple search queries if needed:
- "${searchDescription}"${isRaw ? " -PSA -BGS -SGC -graded" : ""}
- "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} ${card.variation || ""} sold"${isRaw ? " -PSA -BGS -SGC" : ""}
${isNumbered ? `- "${card.playerName || card.title} ${card.variation} sold eBay"\n- Include the numbering (e.g., /10, /25) in your search to find the correct parallel` : ""}

PRICING ACCURACY:
- Report ACTUAL sold prices from eBay, not conservative estimates
- For numbered parallels of top rookies/stars, prices can be $500-$5000+ — do not default to low values
- If you find sales at $400-$800, report that range accurately — do not deflate to $100-$200
- Accuracy matters more than caution. Users make investment decisions based on these values.
- CRITICAL: Only price the EXACT card described. If the search is for "2025 Phoenix Joe Burrow Thunderbirds Silver", do NOT return prices for "2020 Prizm Joe Burrow Rookie PSA 10". Different sets, years, and variations have VASTLY different values.${isRaw ? "\n- Remember: This is a RAW card. Do NOT include ANY graded card prices." : ""}

Return ONLY a JSON object with these exact fields:
{
  "soldCount": <number of sold listings found in last 30-60 days, be specific>,
  "avgPrice": <average sale price in USD as a number>,
  "minPrice": <lowest sale price in USD>,
  "maxPrice": <highest sale price in USD>,
  "activeListing": <number of current active listings>,
  "liquidity": "HIGH" | "MEDIUM" | "LOW",
  "priceStability": "STABLE" | "VOLATILE" | "UNKNOWN",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "notes": "<brief note citing specific sold listings with prices when possible>"
}

Liquidity guidelines:
- HIGH: 15+ sales per month, sells almost daily
- MEDIUM: 5-15 sales per month, sells weekly
- LOW: Under 5 sales per month, may take time to sell

Price stability:
- STABLE: Prices within 20% of average
- VOLATILE: Prices vary more than 40%
- UNKNOWN: Not enough data

Be specific with numbers. If you find 19 sold listings, say 19, not "approximately 20".`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[OutlookEngine] Market data fetch attempt ${attempt} for: ${searchDescription}`);
      
      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      let responseText = response.text || "";
      console.log(`[OutlookEngine] Gemini market data response length: ${responseText.length}`);
      
      // Strip markdown code fences
      responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
      
      // Extract JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Validate required fields
          if (typeof parsed.soldCount === "number" && typeof parsed.avgPrice === "number") {
            console.log(`[OutlookEngine] Found market data: ${parsed.soldCount} sold, avg $${parsed.avgPrice}`);
            
            let correctedAvg = parsed.avgPrice || 0;
            let correctedMin = parsed.minPrice || parsed.avgPrice * 0.8;
            let correctedMax = parsed.maxPrice || parsed.avgPrice * 1.2;
            
            // RAW CARD CORRECTION: If avg is much higher than min, graded prices are leaking in
            if (isRaw && correctedMin > 0 && correctedAvg > 0) {
              const ratio = correctedAvg / correctedMin;
              if (ratio > 2) {
                const newAvg = Math.round(correctedMin * 1.3 * 100) / 100;
                console.warn(`[OutlookEngine] RAW CORRECTION: avg $${correctedAvg} is ${ratio.toFixed(1)}x min $${correctedMin}. Correcting avg to $${newAvg}`);
                correctedAvg = newAvg;
                correctedMax = Math.round(correctedMin * 2 * 100) / 100;
              }
            }
            
            const marketData: GeminiMarketData = {
              soldCount: parsed.soldCount || 0,
              avgPrice: correctedAvg,
              minPrice: correctedMin,
              maxPrice: correctedMax,
              activeListing: parsed.activeListing || 0,
              liquidity: parsed.liquidity || "MEDIUM",
              priceStability: parsed.priceStability || "UNKNOWN",
              dataSource: "gemini_grounded",
              searchQuery: searchDescription,
            };
            
            // Cache result for 24 hours
            geminiMarketCache.set(cacheKey, { data: marketData, cachedAt: Date.now() });
            console.log(`[Gemini Market] Cached result for: ${cacheKey.split("|")[0]}`);
            
            return marketData;
          } else {
            console.log(`[OutlookEngine] Invalid market data structure:`, parsed);
          }
        } catch (parseError) {
          console.error(`[OutlookEngine] Failed to parse market data JSON:`, responseText.substring(0, 300));
        }
      }
      
    } catch (error: any) {
      lastError = error;
      console.error(`[OutlookEngine] Gemini market data error (attempt ${attempt}):`, error.message);
      
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error("[OutlookEngine] Market data fetch failed:", lastError?.message);
  return null;
}

// ============================================================
// MONTHLY PRICE HISTORY - 18-month lookback via Gemini + Google Search
// ============================================================
export interface MonthlyPricePoint {
  month: string; // "YYYY-MM" format
  avgPrice: number;
  salesCount?: number;
}

export interface MonthlyPriceHistory {
  playerName: string;
  sport: string;
  cardDescription: string;
  dataPoints: MonthlyPricePoint[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  notes: string;
}

const monthlyPriceCache = new Map<string, { data: MonthlyPriceHistory; cachedAt: number }>();
const MONTHLY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function fetchMonthlyPriceHistory(params: {
  playerName: string;
  sport: string;
  year?: string;
  setName?: string;
  variation?: string;
  grade?: string;
  grader?: string;
  anchorCurrentPrice?: number;
}): Promise<MonthlyPriceHistory | null> {
  const cacheKey = `monthly|${params.playerName}|${params.sport}|${params.year || ""}|${params.setName || ""}|${params.variation || ""}|${params.grade || ""}`.toLowerCase();
  const cached = monthlyPriceCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < MONTHLY_CACHE_TTL_MS) {
    console.log(`[MonthlyPrice] Cache hit for: ${params.playerName}`);
    return cached.data;
  }

  const parts: string[] = [];
  if (params.year) parts.push(params.year);
  if (params.setName) parts.push(params.setName);
  parts.push(params.playerName);
  if (params.variation && params.variation.toLowerCase() !== "base") parts.push(params.variation);
  const isRawTrend = isRawCard(params.grade, params.grader);
  if (!isRawTrend && params.grade && params.grader) {
    parts.push(`${params.grader} ${params.grade}`);
  } else if (!isRawTrend && params.grade) {
    parts.push(`PSA ${params.grade}`);
  }

  const searchDescription = parts.join(" ");

  const now = new Date();
  const months: string[] = [];
  for (let i = 17; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  try {
    console.log(`[MonthlyPrice] Fetching 18-month history for: ${searchDescription}`);

    const geminiCallWithRetry = async (callFn: () => Promise<any>, label: string, maxRetries = 2): Promise<any> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await callFn();
        } catch (err: any) {
          console.warn(`[MonthlyPrice] ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
          if (attempt === maxRetries) throw err;
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    };

    // STEP 1: Ask Gemini to research prices naturally with search grounding
    const rawTrendNote = isRawTrend 
      ? `\nIMPORTANT: This card is RAW/UNGRADED. Only report prices for raw, ungraded copies. EXCLUDE all PSA, BGS, SGC, and other graded card prices — graded copies sell for significantly more and will distort the trend data.`
      : "";
    const researchPrompt = `Search eBay for recent sold listings of this sports card and tell me what prices it has been selling for:

${searchDescription}${isRawTrend ? " -PSA -BGS -SGC -graded" : ""}
${rawTrendNote}

Look up eBay sold/completed listings prices${isRawTrend ? " for RAW/UNGRADED copies only" : ""}, 130point.com, and any other price references you can find.

Tell me:
1. What is this card currently selling for on eBay?${isRawTrend ? " (raw/ungraded only)" : ""} Give specific recent sold prices with dates.
2. What was it selling for 6 months ago? 12 months ago? 18 months ago?
3. Has the price been trending up, down, or stable?
4. What is the typical price range (low to high)?

Give me as many specific sold prices with dates as you can find. Even a few data points are helpful.`;

    const researchResponse = await geminiCallWithRetry(
      () => gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: researchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
      "Research"
    );

    const researchText = researchResponse.text || "";
    console.log(`[MonthlyPrice] Research response length: ${researchText.length} chars`);
    console.log(`[MonthlyPrice] Research response:\n${researchText.substring(0, 1500)}`);

    if (researchText.length < 50) {
      console.log(`[MonthlyPrice] Research response too short, no data found`);
      return null;
    }

    // STEP 2: Ask Gemini to extract structured data from the research (no search needed)
    const extractPrompt = `You are a sports card price analyst. Based on the research below about "${searchDescription}", create a monthly price chart.

RESEARCH DATA:
${researchText}

TASK: Create a JSON object with estimated average prices for each month. Use the sold prices and trends mentioned in the research to estimate realistic monthly averages. If the research mentions a price at a specific date, use that as the anchor for that month. For months without direct data, estimate based on the overall trend direction.

IMPORTANT: Every month MUST have a non-zero price estimate. Even if exact data is sparse, use the known prices to extrapolate reasonable estimates for all months. Cards always have some value.

Return ONLY this JSON (no other text):
{
  "dataPoints": [
${months.map(m => `    {"month": "${m}", "avgPrice": 0, "salesCount": 0}`).join(",\n")}
  ],
  "confidence": "MEDIUM",
  "notes": "brief summary of price trend"
}

Rules:
- avgPrice must be a positive number (no $ signs, no strings), e.g. 115.00 not "$115"
- Every month must have avgPrice > 0 — extrapolate from known data points
- salesCount = number of actual sales you found data for that month (0 if estimated)
- confidence: HIGH if 8+ months anchored to real data, MEDIUM for 4-7, LOW for fewer
- Prices should vary naturally month to month based on the trend described`;

    const extractResponse = await geminiCallWithRetry(
      () => gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: extractPrompt,
      }),
      "Extract"
    );

    let extractText = extractResponse.text || "";
    console.log(`[MonthlyPrice] Extract response length: ${extractText.length} chars`);
    console.log(`[MonthlyPrice] Extract response preview: ${extractText.substring(0, 500)}`);
    extractText = extractText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

    const jsonMatch = extractText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`[MonthlyPrice] No JSON found in extract response`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.dataPoints) || parsed.dataPoints.length === 0) {
      console.log(`[MonthlyPrice] No dataPoints in parsed response`);
      return null;
    }

    console.log(`[MonthlyPrice] Gemini returned ${parsed.dataPoints.length} data points`);

    const parsePrice = (val: any): number => {
      if (typeof val === "number") return Math.max(0, val);
      if (typeof val === "string") {
        const cleaned = val.replace(/[$,\s]/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : Math.max(0, num);
      }
      return 0;
    };

    const normalizeMonth = (m: string): string => {
      if (!m) return "";
      const parts = m.split("-");
      if (parts.length === 2) {
        return `${parts[0]}-${parts[1].padStart(2, "0")}`;
      }
      return m;
    };

    const rawPoints = parsed.dataPoints.map((dp: any) => ({
      month: normalizeMonth(dp.month || ""),
      avgPrice: parsePrice(dp.avgPrice),
      salesCount: typeof dp.salesCount === "number" ? dp.salesCount : parseInt(dp.salesCount) || 0,
    }));

    const validPriceCount = rawPoints.filter((p: MonthlyPricePoint) => p.avgPrice > 0).length;
    console.log(`[MonthlyPrice] Parsed ${rawPoints.length} points, ${validPriceCount} with valid prices`);

    const pointMap = new Map<string, MonthlyPricePoint>(rawPoints.map((dp: MonthlyPricePoint) => [dp.month, dp]));
    const filledPoints: MonthlyPricePoint[] = months.map((m) => {
      const existing = pointMap.get(m);
      if (existing && existing.avgPrice > 0) return existing;
      return { month: m, avgPrice: 0, salesCount: 0 };
    });

    const nonZeroPrices = filledPoints.filter((p) => p.avgPrice > 0);
    const realDataMonths = nonZeroPrices.length;

    if (realDataMonths < 2) {
      console.log(`[MonthlyPrice] Only ${realDataMonths} data point(s) — insufficient for chart`);
      return null;
    }

    // Linear interpolation for gaps
    for (let i = 0; i < filledPoints.length; i++) {
      if (filledPoints[i].avgPrice === 0) {
        let prevIdx = -1;
        let nextIdx = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (filledPoints[j].avgPrice > 0) { prevIdx = j; break; }
        }
        for (let j = i + 1; j < filledPoints.length; j++) {
          if (filledPoints[j].avgPrice > 0) { nextIdx = j; break; }
        }
        if (prevIdx >= 0 && nextIdx >= 0) {
          const prevPrice = filledPoints[prevIdx].avgPrice;
          const nextPrice = filledPoints[nextIdx].avgPrice;
          const steps = nextIdx - prevIdx;
          const stepSize = (nextPrice - prevPrice) / steps;
          filledPoints[i].avgPrice = Math.round((prevPrice + stepSize * (i - prevIdx)) * 100) / 100;
        } else if (prevIdx >= 0) {
          filledPoints[i].avgPrice = filledPoints[prevIdx].avgPrice;
        } else if (nextIdx >= 0) {
          filledPoints[i].avgPrice = filledPoints[nextIdx].avgPrice;
        }
        filledPoints[i].salesCount = 0;
      }
    }

    if (params.anchorCurrentPrice && params.anchorCurrentPrice > 0) {
      const lastPoint = filledPoints[filledPoints.length - 1];
      const chartCurrentPrice = lastPoint.avgPrice;
      if (chartCurrentPrice > 0 && Math.abs(chartCurrentPrice - params.anchorCurrentPrice) / params.anchorCurrentPrice > 0.05) {
        const scaleFactor = params.anchorCurrentPrice / chartCurrentPrice;
        console.log(`[MonthlyPrice] Calibrating chart to anchor price $${params.anchorCurrentPrice} (chart was $${chartCurrentPrice}, scale ${scaleFactor.toFixed(3)})`);
        for (const point of filledPoints) {
          if (point.avgPrice > 0) {
            point.avgPrice = Math.round(point.avgPrice * scaleFactor * 100) / 100;
          }
        }
      }
    }

    let computedConfidence = parsed.confidence || "MEDIUM";
    if (realDataMonths < 4) computedConfidence = "LOW";
    else if (realDataMonths < 8 && computedConfidence === "HIGH") computedConfidence = "MEDIUM";

    const result: MonthlyPriceHistory = {
      playerName: params.playerName,
      sport: params.sport,
      cardDescription: searchDescription,
      dataPoints: filledPoints,
      confidence: computedConfidence as "HIGH" | "MEDIUM" | "LOW",
      notes: parsed.notes || (realDataMonths < 6 ? `Based on ${realDataMonths} months of data with interpolation.` : ""),
    };

    monthlyPriceCache.set(cacheKey, { data: result, cachedAt: Date.now() });
    console.log(`[MonthlyPrice] Got ${result.dataPoints.length} months, ${realDataMonths} with real data for ${params.playerName}`);
    return result;
  } catch (error: any) {
    console.error(`[MonthlyPrice] Error fetching history for ${params.playerName}:`, error.message);
    return null;
  }
}

// Static score mappings
const SPORT_SCORES: Record<string, number> = {
  basketball: 10,
  football: 9,
  baseball: 8,
  hockey: 6,
  soccer: 7,
  golf: 5,
  tennis: 4,
  boxing: 5,
  mma: 5,
  wrestling: 4,
  racing: 3,
  other: 3,
};

const POSITION_SCORES: Record<string, Record<string, number>> = {
  basketball: { pg: 9, sg: 8, sf: 8, pf: 7, c: 7 },
  football: { qb: 10, rb: 8, wr: 9, te: 6, ol: 3, dl: 4, lb: 5, db: 6, k: 2, p: 1 },
  baseball: { p: 8, c: 6, "1b": 5, "2b": 6, "3b": 6, ss: 7, of: 7, dh: 4 },
  hockey: { c: 8, lw: 7, rw: 7, d: 6, g: 7 },
  soccer: { gk: 6, cb: 5, fb: 5, cm: 7, am: 8, fw: 9 },
};

const CAREER_STAGE_BOOST: Record<string, number> = {
  ROOKIE: 1.3,      // High upside potential
  RISING: 1.2,      // Growing value
  ELITE: 1.0,       // Peak value, stable
  PRIME: 0.95,      // Established but not growing
  VETERAN: 0.8,     // Declining potential
  DECLINING: 0.6,   // Active decline / lost role
  AGING: 0.7,       // End of career
  RETIRED: 0.5,     // Fixed legacy value
  LEGEND: 1.1,      // Premium for legends
  HOF: 1.0,         // Hall of Fame - stable legacy
  UNKNOWN: 1.0,     // Neutral
};

// Role stability affects upside - unstable roles cap growth potential
const ROLE_UPSIDE_DAMPENER: Record<string, number> = {
  FRANCHISE_CORE: 1.0,      // Full upside
  STARTER: 0.95,            // Slight dampening
  SOLID_STARTER: 0.95,      // Same as starter
  UNCERTAIN_STARTER: 0.7,   // Significant dampening - role at risk
  ROTATIONAL: 0.6,          // Limited upside
  BACKUP: 0.5,              // Very limited
  OUT_OF_LEAGUE: 0.3,       // Minimal upside
  UNKNOWN: 0.85,            // Conservative default
};

// Compute Comp Volume Score (1-10) based on sold comp count
// Note: This is displayed as "Comp Volume" in the UI, not "Market Liquidity"
// Recalibrated: 10+ comps is solid data for most cards
export function computeLiquidityScore(pricePoints: PricePoint[], daysWindow: number = 180): number {
  const now = new Date();
  const windowStart = new Date(now.getTime() - daysWindow * 24 * 60 * 60 * 1000);
  
  const recentComps = pricePoints.filter(pp => {
    const ppDate = new Date(pp.date);
    return ppDate >= windowStart;
  });
  
  const count = recentComps.length;
  
  // Recalibrated thresholds - 10 comps is solid, not sparse
  if (count === 0) return 1;
  if (count <= 2) return 3;
  if (count <= 4) return 5;
  if (count <= 6) return 6;
  if (count <= 10) return 7;
  if (count <= 15) return 8;
  if (count <= 25) return 9;
  return 10;
}

// Compute Trend Score (1-10) based on price movement
// 1 = strong downtrend, 5 = flat, 10 = strong uptrend
export function computeTrendScore(pricePoints: PricePoint[]): number {
  if (pricePoints.length < 2) return 5; // Not enough data, assume flat
  
  // Sort by date ascending
  const sorted = [...pricePoints].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Use simple linear regression slope
  const n = sorted.length;
  const prices = sorted.map(pp => pp.price);
  const meanPrice = prices.reduce((a, b) => a + b, 0) / n;
  
  // Calculate percentage change from first half to second half
  const halfN = Math.floor(n / 2);
  const firstHalfAvg = prices.slice(0, halfN).reduce((a, b) => a + b, 0) / halfN;
  const secondHalfAvg = prices.slice(halfN).reduce((a, b) => a + b, 0) / (n - halfN);
  
  if (firstHalfAvg === 0) return 5;
  
  const pctChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
  
  // Map percentage change to 1-10 scale
  // -30% or worse = 1, +30% or better = 10
  if (pctChange <= -30) return 1;
  if (pctChange <= -20) return 2;
  if (pctChange <= -10) return 3;
  if (pctChange <= -5) return 4;
  if (pctChange <= 5) return 5;
  if (pctChange <= 10) return 6;
  if (pctChange <= 20) return 7;
  if (pctChange <= 30) return 8;
  if (pctChange <= 50) return 9;
  return 10;
}

// Compute Volatility Score (1-10) based on price variance
// 1 = very stable, 10 = highly volatile
export function computeVolatilityScore(pricePoints: PricePoint[]): number {
  if (pricePoints.length < 2) return 5; // Not enough data
  
  const prices = pricePoints.map(pp => pp.price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  if (mean === 0) return 5;
  
  // Coefficient of variation (CV) = stddev / mean
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stddev = Math.sqrt(variance);
  const cv = (stddev / mean) * 100; // As percentage
  
  // Map CV to 1-10 scale
  if (cv < 5) return 1;
  if (cv < 10) return 3;
  if (cv < 20) return 5;
  if (cv < 35) return 7;
  return 10;
}

// Compute Sport Score (1-10)
export function computeSportScore(sport: string | null | undefined): number {
  if (!sport) return 5;
  const normalized = sport.toLowerCase().trim();
  return SPORT_SCORES[normalized] || 5;
}

// Compute Position Score (1-10)
export function computePositionScore(sport: string | null | undefined, position: string | null | undefined): number {
  if (!sport || !position) return 5;
  
  const normalizedSport = sport.toLowerCase().trim();
  const normalizedPosition = position.toLowerCase().trim();
  
  const sportPositions = POSITION_SCORES[normalizedSport];
  if (!sportPositions) return 5;
  
  return sportPositions[normalizedPosition] || 5;
}

// Premium brand keywords - cards from these sets command higher prices
const PREMIUM_BRANDS = [
  "prizm", "national treasures", "flawless", "immaculate", "spectra", "select",
  "optic", "mosaic", "revolution", "obsidian", "noir", "one and one",
  "chrome", "bowman chrome", "topps chrome", "stadium club chrome",
  "contenders", "playoff contenders", "panini contenders",
  "sp authentic", "exquisite", "upper deck exquisite",
  "origins", "certified", "elite", "limited", "cornerstones"
];

const MID_TIER_BRANDS = [
  "donruss", "score", "absolute", "prestige", "playoff", "crown royale",
  "chronicles", "illusions", "playbook", "legacy", "classics",
  "topps", "bowman", "stadium club", "heritage", "archives", "gypsy queen",
  "clearly authentic", "tier one", "definitive", "tribute", "dynasty"
];

// Compute Card Type Score (1-10) based on rarity/brand/grade
export function computeCardTypeScore(card: Card): number {
  let score = 5; // Base score
  
  // Grade bonus
  if (card.grade) {
    const gradeUpper = card.grade.toUpperCase();
    if (gradeUpper.includes("10") || gradeUpper.includes("GEM")) score += 2;
    else if (gradeUpper.includes("9.5")) score += 1.5;
    else if (gradeUpper.includes("9")) score += 1;
    else if (gradeUpper.includes("8")) score += 0.5;
  }
  
  // Rookie bonus
  if (card.isRookie) score += 1.5;
  
  // Auto bonus
  if (card.hasAuto) score += 1;
  
  // Numbered bonus
  if (card.isNumbered) {
    const serialNum = card.serialNumber;
    if (serialNum && serialNum <= 10) score += 2;
    else if (serialNum && serialNum <= 25) score += 1.5;
    else if (serialNum && serialNum <= 99) score += 1;
    else score += 0.5;
  }
  
  // Brand bonus - check card set/brand name
  const brandCheck = [card.set, card.variation, card.title].filter(Boolean).join(" ").toLowerCase();
  let brandBonus = 0;
  if (PREMIUM_BRANDS.some(brand => brandCheck.includes(brand))) {
    brandBonus = 1.5;
  } else if (MID_TIER_BRANDS.some(brand => brandCheck.includes(brand))) {
    brandBonus = 0.5;
  }
  score += brandBonus;
  
  // Variation/parallel bonus (stacks with brand)
  if (card.variation) {
    const varLower = card.variation.toLowerCase();
    if (varLower.includes("1/1") || varLower.includes("one of one")) score += 3;
    else if (varLower.includes("gold") || varLower.includes("superfractor") || varLower.includes("black")) score += 2;
    else if (varLower.includes("silver") || varLower.includes("refractor") || varLower.includes("holo") || varLower.includes("shimmer")) score += 1;
    else if (varLower.includes("blue") || varLower.includes("red") || varLower.includes("green") || varLower.includes("orange")) score += 0.5;
  }
  
  return Math.min(10, Math.max(1, Math.round(score)));
}

// Composite Scores (0-100)
export function computeDemandScore(liquidityScore: number, sportScore: number, positionScore: number): number {
  const weighted = (liquidityScore * 0.5 + sportScore * 0.3 + positionScore * 0.2) * 10;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function computeMomentumScore(trendScore: number, volatilityScore: number): number {
  // High trend + low volatility = high momentum
  const weighted = (trendScore * 0.7 + (11 - volatilityScore) * 0.3) * 10;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function computeQualityScore(cardTypeScore: number, careerStage: string | null | undefined): number {
  const stageBoost = CAREER_STAGE_BOOST[careerStage || "UNKNOWN"] || 1.0;
  const weighted = cardTypeScore * stageBoost * 10;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function computeUpsideScore(
  qualityScore: number, 
  momentumScore: number, 
  careerStage: string | null | undefined,
  roleTier?: string | null
): number {
  const stageBoost = CAREER_STAGE_BOOST[careerStage || "UNKNOWN"] || 1.0;
  const roleDampener = ROLE_UPSIDE_DAMPENER[roleTier || "UNKNOWN"] || 0.85;
  const weighted = (qualityScore * 0.4 + momentumScore * 0.6) * stageBoost * roleDampener;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

// Downside Risk: likelihood of meaningful value decline
// High volatility + negative trend + low confidence = high downside risk
// Stable vintage cards should have LOW downside risk
export function computeDownsideRisk(
  volatilityScore: number, 
  trendScore: number,
  confidence: string | null | undefined,
  careerStage: string | null | undefined
): number {
  // Volatility contributes to downside risk (wild swings = risk of decline)
  const volatilityPenalty = volatilityScore * 4;
  
  // Negative trend (trend < 5) increases downside risk
  const trendPenalty = trendScore < 5 ? (5 - trendScore) * 8 : 0;
  
  // Low confidence data means we can't trust stability
  const confidencePenalty = confidence === "LOW" ? 15 : confidence === "MEDIUM" ? 5 : 0;
  
  // Career stage adjustments - retired/HOF have established value, lower risk
  let stageAdjustment = 0;
  if (careerStage === "HOF" || careerStage === "LEGEND") {
    stageAdjustment = -15; // Very stable
  } else if (careerStage === "RETIRED") {
    stageAdjustment = -10; // Stable
  } else if (careerStage === "AGING_VET") {
    stageAdjustment = 5; // Some uncertainty
  } else if (careerStage === "RISING_STAR" || careerStage === "PROSPECT") {
    stageAdjustment = 10; // Higher uncertainty
  }
  
  const risk = volatilityPenalty + trendPenalty + confidencePenalty + stageAdjustment;
  return Math.min(100, Math.max(0, Math.round(risk)));
}

// Market Friction: difficulty of buying/selling quickly at fair value
// Low liquidity + thin sales volume = high friction
export function computeMarketFriction(
  liquidityScore: number,
  volatilityScore: number,
  pricePointCount: number
): number {
  // Low liquidity = high friction (inverted scale)
  const liquidityPenalty = (10 - liquidityScore) * 6;
  
  // Few data points = harder to determine fair value
  const dataPenalty = pricePointCount < 3 ? 20 : pricePointCount < 6 ? 10 : 0;
  
  // High volatility makes fair value harder to establish
  const volatilityPenalty = volatilityScore > 6 ? (volatilityScore - 6) * 5 : 0;
  
  const friction = liquidityPenalty + dataPenalty + volatilityPenalty;
  return Math.min(100, Math.max(0, Math.round(friction)));
}

// Convert numeric scores to human-readable labels
export function getDownsideRiskLabel(score: number): string {
  if (score <= 25) return "Low";
  if (score <= 50) return "Medium";
  if (score <= 75) return "High";
  return "Very High";
}

export function getMarketFrictionLabel(score: number): string {
  if (score <= 25) return "Low";
  if (score <= 50) return "Medium";
  if (score <= 75) return "High";
  return "Very High";
}

// Detect both career stage and role tier from registry
// Returns both values for use in upside calculation
export function detectPlayerStatus(card: Card): { careerStage: string; roleTier: string } {
  // TCG cards don't have career stages
  if (card.cardCategory === "tcg" || card.cardCategory === "non_sport") {
    return { careerStage: "UNKNOWN", roleTier: "UNKNOWN" };
  }
  
  // Check player registry first (authoritative source)
  if (card.playerName) {
    const registryResult = lookupPlayer(card.playerName);
    if (registryResult.found && registryResult.entry) {
      const mappedStage = mapRegistryStage(registryResult.entry.careerStage);
      const roleTier = registryResult.entry.roleTier || "UNKNOWN";
      console.log(`[PlayerStatus] Registry hit for "${card.playerName}" -> stage=${mappedStage}, role=${roleTier}`);
      return { careerStage: mappedStage, roleTier };
    }
  }
  
  // Fallback: use detectCareerStage logic, unknown role
  const careerStage = detectCareerStage(card);
  return { careerStage, roleTier: "UNKNOWN" };
}

// Career Stage Auto-Detection
// Priority: 1) Player Registry (authoritative), 2) Legacy tier, 3) Card year heuristics
export function detectCareerStage(card: Card): string {
  // TCG cards don't have career stages
  if (card.cardCategory === "tcg" || card.cardCategory === "non_sport") {
    return "UNKNOWN";
  }
  
  // PRIORITY 1: Check player registry first (authoritative source)
  if (card.playerName) {
    const registryResult = lookupPlayer(card.playerName);
    if (registryResult.found && registryResult.entry) {
      const mappedStage = mapRegistryStage(registryResult.entry.careerStage);
      console.log(`[CareerStage] Registry hit for "${card.playerName}" -> ${mappedStage} (from ${registryResult.entry.careerStage})`);
      return mappedStage;
    }
  }
  
  // Check for rookie indicators (used for fallback heuristics)
  const titleLower = (card.title || "").toLowerCase();
  const setLower = (card.set || "").toLowerCase();
  
  const isRookieCard = card.isRookie || 
    titleLower.includes("rookie") || 
    titleLower.includes("rc") ||
    setLower.includes("rookie") ||
    setLower.includes("draft") ||
    setLower.includes("bowman 1st");
  
  // PRIORITY 2: Check legacy tier if set
  if (card.legacyTier) {
    const tierMap: Record<string, string> = {
      PROSPECT: "ROOKIE",
      RISING_STAR: "RISING",
      STAR: "ELITE",
      SUPERSTAR: "ELITE",
      AGING_VET: "VETERAN",
      RETIRED: "RETIRED",
      HOF: "LEGEND",
      LEGEND_DECEASED: "LEGEND",
    };
    return tierMap[card.legacyTier] || "UNKNOWN";
  }
  
  // PRIORITY 3: Use card year to estimate career stage (fallback)
  const currentYear = new Date().getFullYear();
  const cardYear = card.year;
  
  if (!cardYear) {
    return isRookieCard ? "ROOKIE" : "UNKNOWN";
  }
  
  const yearsAgo = currentYear - cardYear;
  
  if (yearsAgo <= 2) {
    return isRookieCard ? "ROOKIE" : "RISING";
  } else if (yearsAgo <= 5) {
    return "RISING";
  } else if (yearsAgo <= 12) {
    return "ELITE";
  } else if (yearsAgo <= 20) {
    return "VETERAN";
  } else {
    // Could be retired or legend - check for indicators
    if (titleLower.includes("hof") || titleLower.includes("hall of fame") || 
        titleLower.includes("legend") || titleLower.includes("goat")) {
      return "LEGEND";
    }
    return "RETIRED";
  }
}

// Deterministic Action Logic
export type OutlookAction = "BUY" | "MONITOR" | "SELL" | "LONG_HOLD" | "LEGACY_HOLD" | "LITTLE_VALUE";

// MONITOR reason codes - differentiate WHY a card is MONITOR
export type MonitorReason = 
  | "UNSTABLE_PRICING"   // Plenty of data but high variance/spread
  | "WAITING_CATALYST"   // Decent card but needs event trigger
  | "DATA_UNCERTAIN"     // Few comps or weak matches
  | "COOLING_AFTER_RUN"  // Price retreating after spike
  | "NEUTRAL"            // Generic - no strong signals either way

interface ActionDecision {
  action: OutlookAction;
  reasons: string[];
  monitorReason?: MonitorReason;
}

export function computeAction(
  qualityScore: number,
  demandScore: number,
  momentumScore: number,
  trendScore: number,
  volatilityScore: number,
  liquidityScore: number,
  marketValue: number | null,
  careerStage: string | null | undefined,
  cardYear?: number | null
): ActionDecision {
  const reasons: string[] = [];
  
  // Calculate card age for vintage detection
  const currentYear = new Date().getFullYear();
  const cardAge = cardYear ? currentYear - cardYear : 0;
  const isVintage = cardAge >= 25;
  
  // LITTLE_VALUE: Low quality + low demand + low value
  if (qualityScore < 30 && demandScore < 30 && (marketValue === null || marketValue < 10)) {
    reasons.push("Low card quality and minimal demand");
    reasons.push("Market value below collectible threshold");
    return { action: "LITTLE_VALUE", reasons };
  }
  
  // LEGACY_HOLD: Vintage cards (25+ years) with HOF/cultural relevance
  // LEGEND status indicates HOF or cultural icon (detected from title keywords)
  // Vintage RETIRED with significant value (>$50) also qualifies as collectible legacy piece
  // NOTE: We do NOT gate on volatility - vintage cards have high price variance due to
  // eye appeal, condition subjectivity, and infrequent sales. That's normal, not risky.
  // Only gate on trendScore to detect true parabolic movements (speculative spikes).
  const hasLegacyRelevance = careerStage === "LEGEND" || 
    (isVintage && careerStage === "RETIRED" && marketValue !== null && marketValue >= 50);
  
  // Parabolic detection: only very high trend scores (8+) indicate speculative spike
  const isNotParabolic = trendScore <= 7;
  
  if (isVintage && hasLegacyRelevance && isNotParabolic) {
    reasons.push("Vintage card with proven long-term collector demand");
    reasons.push("Established market - no speculative price spike");
    if (careerStage === "LEGEND") reasons.push("Hall of Fame / cultural icon status");
    reasons.push("Best suited as personal collection hold");
    return { action: "LEGACY_HOLD", reasons };
  }
  
  // LONG_HOLD: Retired/legend + low volatility + decent demand (may be modern or pre-vintage)
  if ((careerStage === "RETIRED" || careerStage === "LEGEND") && 
      volatilityScore <= 4 && demandScore >= 40) {
    reasons.push(`${careerStage} player with established legacy`);
    reasons.push("Stable price history with low volatility");
    if (careerStage === "LEGEND") reasons.push("Hall of Fame premium applies");
    return { action: "LONG_HOLD", reasons };
  }
  
  // SELL: Recent price run-up + high liquidity + rising volatility
  if (trendScore >= 8 && liquidityScore >= 6 && volatilityScore >= 6) {
    reasons.push("Recent significant price increase");
    reasons.push("High market liquidity - easy to exit");
    reasons.push("Volatility suggests potential peak");
    return { action: "SELL", reasons };
  }
  
  // Also SELL if momentum is decelerating after a spike
  if (trendScore >= 7 && momentumScore < 40 && liquidityScore >= 5) {
    reasons.push("Price momentum slowing after run-up");
    reasons.push("Good liquidity for profitable exit");
    return { action: "SELL", reasons };
  }
  
  // BUY: High quality + recent dip (low trend) + decent liquidity
  if (qualityScore >= 60 && trendScore <= 4 && liquidityScore >= 4) {
    reasons.push("High-quality card at discounted price");
    reasons.push("Recent price dip creates buying opportunity");
    if (careerStage === "ROOKIE" || careerStage === "RISING") {
      reasons.push("Young player with upside potential");
    }
    return { action: "BUY", reasons };
  }
  
  // Also BUY for undervalued quality
  if (qualityScore >= 70 && demandScore >= 50 && momentumScore >= 50) {
    reasons.push("Premium card with strong fundamentals");
    reasons.push("Solid demand and positive momentum");
    return { action: "BUY", reasons };
  }
  
  // MONITOR: Default - not clearly a buy or sell
  // Determine the specific MONITOR reason based on available signals
  let monitorReason: MonitorReason = "NEUTRAL";
  
  // UNSTABLE_PRICING: High volatility + decent liquidity (lots of data, just all over the place)
  if (volatilityScore >= 6 && liquidityScore >= 4) {
    monitorReason = "UNSTABLE_PRICING";
    reasons.push("Price spread is wide—market hasn't settled on value");
    reasons.push("Timing matters more than conviction right now");
    if (momentumScore >= 40 && momentumScore <= 60) reasons.push("No clear momentum direction");
    return { action: "MONITOR", reasons, monitorReason };
  }
  
  // COOLING_AFTER_RUN: Recent spike now retreating
  if (trendScore >= 5 && trendScore <= 7 && volatilityScore >= 5) {
    monitorReason = "COOLING_AFTER_RUN";
    reasons.push("Price ran up recently and is now settling");
    reasons.push("Wait for clearer direction before acting");
    return { action: "MONITOR", reasons, monitorReason };
  }
  
  // DATA_UNCERTAIN: Low liquidity means not enough comps
  if (liquidityScore < 4) {
    monitorReason = "DATA_UNCERTAIN";
    reasons.push("Limited recent sales make pricing uncertain");
    reasons.push("Need more market activity to gauge fair value");
    return { action: "MONITOR", reasons, monitorReason };
  }
  
  // WAITING_CATALYST: Decent quality but neutral signals
  if (qualityScore >= 50 && momentumScore >= 40 && momentumScore <= 60) {
    monitorReason = "WAITING_CATALYST";
    reasons.push("Solid card but waiting for a catalyst");
    reasons.push("Could move on news, performance, or market shifts");
    return { action: "MONITOR", reasons, monitorReason };
  }
  
  // NEUTRAL: Generic fallback
  reasons.push("Mixed signals—no clear buy or sell case");
  if (volatilityScore >= 5) reasons.push("Some price variance present");
  if (momentumScore >= 40 && momentumScore <= 60) reasons.push("Momentum is flat");
  
  return { action: "MONITOR", reasons, monitorReason };
}

// Big Mover Detection
// Flags cards with asymmetric upside potential (high upside + moderate risk + liquidity + non-parabolic)
interface BigMoverResult {
  flag: boolean;
  reason: string | null;
}

export function computeBigMover(
  upsideScore: number,
  riskScore: number,
  liquidityScore: number,
  trendScore: number,
  volatilityScore: number,
  careerStage: string | null | undefined,
  dataConfidence: "HIGH" | "MEDIUM" | "LOW"
): BigMoverResult {
  // Big Mover requires:
  // 1. High upside (≥65)
  // 2. Moderate risk (25-60) - not too risky, not too safe
  // 3. Decent liquidity (≥4) - can actually trade the card
  // 4. Price not already parabolic (trend ≤ 7) - room to grow
  // 5. Not LOW confidence - need reliable data
  // 6. Not already at peak volatility (≤7) - not a bubble
  
  if (dataConfidence === "LOW") {
    return { flag: false, reason: null };
  }
  
  const highUpside = upsideScore >= 65;
  const moderateRisk = riskScore >= 25 && riskScore <= 60;
  const hasLiquidity = liquidityScore >= 4;
  const notParabolic = trendScore <= 7;
  const notBubble = volatilityScore <= 7;
  
  if (!highUpside || !moderateRisk || !hasLiquidity || !notParabolic || !notBubble) {
    return { flag: false, reason: null };
  }
  
  // Build the reason based on what makes this a Big Mover
  const reasons: string[] = [];
  
  // Career stage insights
  if (careerStage === "ROOKIE") {
    reasons.push("First-year player with breakout potential");
  } else if (careerStage === "RISING") {
    reasons.push("Rising talent not yet priced at peak");
  } else if (careerStage === "ELITE") {
    reasons.push("Elite performer with room for legacy appreciation");
  }
  
  // Market condition insights
  if (trendScore <= 4) {
    reasons.push("Currently undervalued relative to quality");
  } else if (trendScore <= 6) {
    reasons.push("Stable pricing leaves room for catalysts");
  }
  
  // Liquidity insight
  if (liquidityScore >= 7) {
    reasons.push("High liquidity allows easy entry/exit");
  }
  
  // Risk profile
  if (riskScore <= 40) {
    reasons.push("Favorable risk/reward profile");
  }
  
  // Default reason if none specific
  if (reasons.length === 0) {
    reasons.push("Asymmetric upside if key events occur");
  }
  
  return {
    flag: true,
    reason: reasons.join(". ") + "."
  };
}

// Data Confidence Computation
// Recalibrated: Comp volume is primary driver, volatility is secondary
// 10+ comps = HIGH confidence (volatility is a separate metric, not a data quality issue)
export function computeDataConfidence(
  pricePoints: PricePoint[],
  volatilityScore: number
): { confidence: "HIGH" | "MEDIUM" | "LOW"; reason: string } {
  const now = new Date();
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  
  const recent180 = pricePoints.filter(pp => new Date(pp.date) >= oneEightyDaysAgo).length;
  const total = pricePoints.length;
  
  // HIGH: 8+ comps in 180 days - solid data regardless of volatility
  // (volatility just means prices vary, not that data is unreliable)
  if (recent180 >= 8) {
    const volatilityNote = volatilityScore >= 6 ? " (prices vary but data is solid)" : "";
    return {
      confidence: "HIGH",
      reason: `${recent180} recent sold comps${volatilityNote}`
    };
  }
  
  // MEDIUM: 4-7 comps - decent sample size
  if (recent180 >= 4 || total >= 6) {
    return {
      confidence: "MEDIUM",
      reason: `${recent180} comps in last 180 days - decent coverage`
    };
  }
  
  // LOW: sparse data (under 4 recent comps AND under 6 total)
  if (total === 0) {
    return { confidence: "LOW", reason: "No sold comps found" };
  }
  
  return {
    confidence: "LOW",
    reason: `Only ${total} price point(s) - limited sample size`
  };
}

// Main computation function that generates all signals
export interface ComputedOutlookSignals {
  // Raw scores (1-10)
  trendScore: number;
  liquidityScore: number;
  volatilityScore: number;
  sportScore: number;
  positionScore: number;
  cardTypeScore: number;
  
  // Composite scores (0-100)
  demandScore: number;
  momentumScore: number;
  qualityScore: number;
  upsideScore: number;
  downsideRisk: number;
  marketFriction: number;
  
  // Action
  action: OutlookAction;
  actionReasons: string[];
  monitorReason?: MonitorReason;  // Only set when action is MONITOR
  
  // Confidence
  dataConfidence: "HIGH" | "MEDIUM" | "LOW";
  confidenceReason: string;
  
  // Career stage
  careerStageAuto: string;
  
  // Big Mover flag
  bigMoverFlag: boolean;
  bigMoverReason: string | null;
}

// AI Explanation Generator
// The AI ONLY explains the already-computed action - it does NOT decide the action

export interface OutlookExplanation {
  short: string;
  long: string;
  bullets: string[];
}

export async function generateOutlookExplanation(
  card: Card,
  signals: ComputedOutlookSignals,
  pricePoints: PricePoint[],
  marketValue: number | null,
  newsSnippets: string[] = []
): Promise<OutlookExplanation> {
  // Sample top 5 price points for context
  const samplePrices = pricePoints.slice(0, 5).map(pp => 
    `$${pp.price} on ${pp.date} (${pp.source})`
  ).join(", ");

  // Format news section for prompt
  const newsSection = newsSnippets.length > 0 
    ? `\nRECENT NEWS (use this for current player status - YOUR TRAINING DATA MAY BE OUTDATED):\n${newsSnippets.map(s => `- ${s}`).join("\n")}\n\nIMPORTANT: The news above is REAL-TIME from today. Use it to understand the player's CURRENT situation. Do NOT contradict this news with outdated information from your training data.`
    : "";

  const systemPrompt = "You explain card market recommendations based on computed signals. Be concise and data-driven.";

  const userPrompt = `You are a sports card market analyst. Explain WHY the following action was computed for this card.

CARD: ${card.title}
Set: ${card.set || "Unknown"} | Year: ${card.year || "Unknown"} | Grade: ${card.grade || "Ungraded"}
Category: ${card.cardCategory || "sports"} | Player: ${card.playerName || "Unknown"}

COMPUTED ACTION: ${signals.action}
Market Value: ${marketValue ? `$${marketValue.toFixed(2)}` : "Unknown"}
Career Stage: ${signals.careerStageAuto}

SIGNAL SCORES (these determined the action):
- Demand: ${signals.demandScore}/100 (Liquidity: ${signals.liquidityScore}/10)
- Momentum: ${signals.momentumScore}/100 (Trend: ${signals.trendScore}/10)
- Quality: ${signals.qualityScore}/100 (Card Type: ${signals.cardTypeScore}/10)
- Upside Potential: ${signals.upsideScore}/100
- Downside Risk: ${signals.downsideRisk}/100 (${getDownsideRiskLabel(signals.downsideRisk)})
- Market Friction: ${signals.marketFriction}/100 (${getMarketFrictionLabel(signals.marketFriction)})
- Data Confidence: ${signals.dataConfidence}

REASONS (computed): ${signals.actionReasons.join("; ")}

RECENT PRICES: ${samplePrices || "No recent data"}
${newsSection}
Generate a brief explanation of why ${signals.action} is the recommendation. Return JSON:
{
  "bullets": ["reason 1", "reason 2", "reason 3"],
  "short": "One sentence summary",
  "long": "2-3 paragraph detailed explanation for Pro users"
}

IMPORTANT RULES:
1. Keep explanations honest and data-driven. Reference the actual scores and prices.
2. NEVER say "low confidence" or "uncertain data" when Data Confidence is HIGH or MEDIUM.
3. If action is MONITOR with HIGH confidence, explain WHY in terms of:
   - Wide price spreads / market disagreement (if high variance)
   - Waiting for catalyst (if neutral momentum)
   - Cooling after a run-up (if recent trend spike)
4. Only mention "data uncertainty" or "limited comps" when Data Confidence is actually LOW.
5. The explanation must never contradict the displayed confidence indicators.
6. If RECENT NEWS is provided, USE IT to inform your explanation about the player's current status. The news is real-time and supersedes your training data.
7. NEVER refer to a player as "unknown" or "this unknown player." If you recognize the player at all (former MVP, All-Star, starter, etc.), reference their actual career context. Only use "unknown" for genuinely obscure, unrecognizable players.`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${systemPrompt}\n\n${userPrompt}`,
    });

    const responseText = response.text || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Guard: If MONITOR with HIGH/MEDIUM confidence, sanitize all outputs
      // to prevent "low confidence" being mentioned when we actually have good data
      const lowConfidencePatterns = /low confidence|uncertain data|limited data|sparse data|few comps|data uncertain/i;
      const needsSanitization = signals.action === "MONITOR" && signals.dataConfidence !== "LOW";
      
      let finalShort = parsed.short || getMonitorReasonAwareFallback(signals);
      let finalLong = parsed.long || `The ${signals.action} recommendation is based on computed market signals.`;
      let finalBullets = parsed.bullets || signals.actionReasons;
      
      if (needsSanitization) {
        // Check and override short if it contains contradictory language
        if (lowConfidencePatterns.test(finalShort)) {
          finalShort = getMonitorReasonAwareFallback(signals);
        }
        
        // Check and override long if needed
        if (lowConfidencePatterns.test(finalLong)) {
          finalLong = `The MONITOR recommendation reflects market conditions where prices vary widely. With ${signals.dataConfidence.toLowerCase()} confidence data (${signals.confidenceReason}), the spread in recent sales suggests the market hasn't settled on fair value yet. Timing matters more than conviction right now—wait for clearer price consensus before acting.`;
        }
        
        // Filter out bullets that contain contradictory language
        if (Array.isArray(finalBullets)) {
          finalBullets = finalBullets.filter((b: string) => !lowConfidencePatterns.test(b));
          if (finalBullets.length === 0) {
            finalBullets = signals.actionReasons;
          }
        }
      }
      
      return {
        bullets: finalBullets,
        short: finalShort,
        long: finalLong
      };
    }
  } catch (error) {
    console.error("Failed to generate AI explanation:", error);
  }

  // Fallback to computed reasons - use monitorReason-aware language
  const shortExplanation = getMonitorReasonAwareFallback(signals);
  
  return {
    bullets: signals.actionReasons,
    short: shortExplanation,
    long: `This ${signals.action} recommendation is computed from market signals: Demand ${signals.demandScore}/100, Momentum ${signals.momentumScore}/100, Quality ${signals.qualityScore}/100. Downside Risk: ${getDownsideRiskLabel(signals.downsideRisk)}, Market Friction: ${getMarketFrictionLabel(signals.marketFriction)}. Career stage: ${signals.careerStageAuto}. Data confidence: ${signals.dataConfidence} - ${signals.confidenceReason}.`
  };
}

// Generate appropriate fallback explanation based on action and monitorReason
// This ensures we never say "low confidence" when confidence is HIGH
function getMonitorReasonAwareFallback(signals: ComputedOutlookSignals): string {
  // Non-MONITOR actions get simple explanations
  if (signals.action !== "MONITOR") {
    switch (signals.action) {
      case "BUY":
        return "Quality opportunity at a favorable price point.";
      case "SELL":
        return "Conditions suggest taking profits or reducing exposure.";
      case "LONG_HOLD":
        return "Stable hold with proven long-term collector appeal.";
      case "LEGACY_HOLD":
        return "Vintage collectible suited for long-term preservation.";
      case "LITTLE_VALUE":
        return "Limited market interest and low collector demand.";
      default:
        return `${signals.action} recommendation based on current market signals.`;
    }
  }
  
  // MONITOR explanations based on specific monitorReason
  switch (signals.monitorReason) {
    case "UNSTABLE_PRICING":
      return "Prices vary widely—market hasn't settled on fair value yet.";
    case "COOLING_AFTER_RUN":
      return "Price spike is settling—wait for a clearer direction.";
    case "DATA_UNCERTAIN":
      return "Limited recent sales—not enough data for a confident call.";
    case "WAITING_CATALYST":
      return "Solid card waiting for news or performance to move the needle.";
    case "NEUTRAL":
    default:
      return "Mixed signals—no strong case for buy or sell right now.";
  }
}

export function computeAllSignals(
  card: Card,
  pricePoints: PricePoint[],
  marketValue: number | null
): ComputedOutlookSignals {
  // Compute raw scores
  const liquidityScore = computeLiquidityScore(pricePoints);
  const trendScore = computeTrendScore(pricePoints);
  const volatilityScore = computeVolatilityScore(pricePoints);
  const sportScore = computeSportScore(card.sport);
  const positionScore = computePositionScore(card.sport, card.position);
  const cardTypeScore = computeCardTypeScore(card);
  
  // Detect career stage and role tier
  const { careerStage: careerStageAuto, roleTier } = detectPlayerStatus(card);
  
  // Compute composite scores
  const demandScore = computeDemandScore(liquidityScore, sportScore, positionScore);
  const momentumScore = computeMomentumScore(trendScore, volatilityScore);
  const qualityScore = computeQualityScore(cardTypeScore, careerStageAuto);
  const upsideScore = computeUpsideScore(qualityScore, momentumScore, careerStageAuto, roleTier);
  
  // Compute confidence first (needed for risk calculations)
  const { confidence: dataConfidence, reason: confidenceReason } = computeDataConfidence(pricePoints, volatilityScore);
  
  // Compute new risk metrics
  const downsideRisk = computeDownsideRisk(volatilityScore, trendScore, dataConfidence, careerStageAuto);
  const marketFriction = computeMarketFriction(liquidityScore, volatilityScore, pricePoints.length);
  
  // Compute action (pass cardYear for vintage detection)
  const { action, reasons: actionReasons, monitorReason } = computeAction(
    qualityScore,
    demandScore,
    momentumScore,
    trendScore,
    volatilityScore,
    liquidityScore,
    marketValue,
    careerStageAuto,
    card.year
  );
  
  // Compute Big Mover flag (use downsideRisk instead of old riskScore)
  const { flag: bigMoverFlag, reason: bigMoverReason } = computeBigMover(
    upsideScore,
    downsideRisk,
    liquidityScore,
    trendScore,
    volatilityScore,
    careerStageAuto,
    dataConfidence
  );
  
  // Vintage+Retired: Cap downside risk regardless of action
  // Illiquidity and price variance ≠ downside risk for established vintage cards
  // This applies to ALL vintage retired/legend cards, not just LEGACY_HOLD
  const currentYear = new Date().getFullYear();
  const cardAge = card.year ? currentYear - card.year : 0;
  const isVintage = cardAge >= 25;
  const isRetiredOrLegend = careerStageAuto === "RETIRED" || careerStageAuto === "LEGEND";
  
  // For vintage retired/legend cards: cap downside risk at 35 (low-medium)
  // For LEGACY_HOLD specifically: cap at 25 (low)
  let finalDownsideRisk = downsideRisk;
  let finalUpsideScore = upsideScore;
  
  if (action === "LEGACY_HOLD") {
    // LEGACY_HOLD gets the strictest cap: downside LOW, upside LIMITED
    finalDownsideRisk = Math.min(downsideRisk, 25);
    finalUpsideScore = Math.min(upsideScore, 40);
  } else if (isVintage && isRetiredOrLegend) {
    // Other vintage retired cards still get downside cap at MEDIUM max
    finalDownsideRisk = Math.min(downsideRisk, 50);
  }
  
  return {
    trendScore,
    liquidityScore,
    volatilityScore,
    sportScore,
    positionScore,
    cardTypeScore,
    demandScore,
    momentumScore,
    qualityScore,
    upsideScore: finalUpsideScore,
    downsideRisk: finalDownsideRisk,
    marketFriction,
    action,
    actionReasons,
    monitorReason,
    dataConfidence,
    confidenceReason,
    careerStageAuto,
    bigMoverFlag,
    bigMoverReason,
  };
}
