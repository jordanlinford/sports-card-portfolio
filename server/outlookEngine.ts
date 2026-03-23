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

// 4-hour cache for player news to avoid redundant lookups
const playerNewsCache = new Map<string, { data: { snippets: string[]; momentum: "up" | "flat" | "down"; newsCount: number; roleStatus?: string; injuryStatus?: string }; cachedAt: number }>();
const NEWS_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Robustly parses a price value from Gemini output.
 * Handles: number, string number, string range ("80-150" → lower bound), null, undefined.
 * Returns null only when no usable number can be extracted.
 */
function parsePrice(val: unknown): number | null {
  if (typeof val === "number" && val > 0) return val;
  if (typeof val === "string") {
    // Strip currency symbols and whitespace
    const clean = val.replace(/[$,\s]/g, "");
    // Range like "80-150" or "125-250" → take the lower bound (conservative)
    const rangeMatch = clean.match(/^(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const lo = parseFloat(rangeMatch[1]);
      const hi = parseFloat(rangeMatch[2]);
      if (!isNaN(lo) && !isNaN(hi) && lo > 0) return Math.round((lo + hi) / 2); // midpoint
    }
    // Single number as string
    const num = parseFloat(clean);
    if (!isNaN(num) && num > 0) return num;
  }
  return null;
}

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

  const newsCacheKey = `${playerName.toLowerCase().trim()}|${(sport || "").toLowerCase()}`;
  const cachedNews = playerNewsCache.get(newsCacheKey);
  if (cachedNews && Date.now() - cachedNews.cachedAt < NEWS_CACHE_TTL_MS) {
    console.log(`[OutlookEngine] News cache hit for: ${playerName} (${Math.round((Date.now() - cachedNews.cachedAt) / 1000 / 60)}min old)`);
    return cachedNews.data;
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
          
          const newsResult = {
            snippets,
            momentum,
            newsCount: parsed.newsCount || snippets.length,
            roleStatus: parsed.roleStatus,
            injuryStatus: parsed.injuryStatus,
          };
          playerNewsCache.set(newsCacheKey, { data: newsResult, cachedAt: Date.now() });
          return newsResult;
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
  psa9Price: number | null;
  psa10Price: number | null;
  activeListing: number;
  liquidity: "HIGH" | "MEDIUM" | "LOW";
  priceStability: "STABLE" | "VOLATILE" | "UNKNOWN";
  dataSource: "gemini_grounded";
  searchQuery: string;
  supply?: {
    supplyGrowth: "stable" | "growing" | "surging";
    supplyNote: string;
    estimatedPopulation?: number;
  };
};

// 24-hour cache for Gemini market data to ensure consistent pricing
interface GeminiMarketCache {
  data: GeminiMarketData;
  cachedAt: number;
}
const geminiMarketCache = new Map<string, GeminiMarketCache>();
const GEMINI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Generate cache key from card attributes
export function getGeminiCacheKey(card: {
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

export function getGeminiMarketCacheEntry(card: {
  title: string;
  playerName?: string | null;
  year?: number | null;
  set?: string | null;
  variation?: string | null;
  grade?: string | null;
  grader?: string | null;
}): GeminiMarketData | null {
  const cacheKey = getGeminiCacheKey(card);
  const cached = geminiMarketCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < GEMINI_CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
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
  const variationLowerStandalone = (card.variation || "").toLowerCase().trim();
  const setLowerStandalone = (card.set || "").toLowerCase();
  const sspPatternStandalone = /\b(zebra|tiger\s*stripe|color\s*blast|shock|shimmer|mojo|downtown|uptown|kaboom|disco\s*ball|case\s*hit|ssp|gold\s*vinyl|black\s*gold|neon\s*green|scope|velocity|hyper|astral|galactic|lava|magma|snakeskin|marble|leopard|cheetah|camo|wave|ice|crystal|cracked\s*ice|lazer|laser|fast\s*break|choice|fotl|first\s*off\s*the\s*line|the\s*man|warp\s*speed|interstellar|eye\s*of\s*the\s*tiger|supernova|magician|phenomenon|street\s*art|art\s*deco|aurora|ascension|wood|silk|sapphire|platinum|vintage\s*stock|clear|superfractor)\b/i;
  const isPremiumUnnumberedStandalone = !isNumbered && (sspPatternStandalone.test(variationLowerStandalone) || sspPatternStandalone.test(setLowerStandalone));
  const isPremiumNumberedStandalone = isNumbered && (sspPatternStandalone.test(variationLowerStandalone) || sspPatternStandalone.test(setLowerStandalone));
  const isOpticSetStandalone = /\boptic\b/i.test(card.set || "");
  const isPrizmFamilySetStandalone = /\bprizm\b|\bprisma\b/i.test(card.set || "");
  const isStrictBaseVariationStandalone = !card.variation || variationLowerStandalone === "base" || variationLowerStandalone === "base prizm";
  const isAutoStandalone = /auto(graph)?/i.test(card.variation || "") || /auto(graph)?/i.test(card.set || "") || /auto(graph)?/i.test(card.title || "");
  const isHatSwatch = /player\s*cap|hat\s*swatch|cap\s*relic|laundry\s*tag/i.test(card.variation || "") || /player\s*cap|hat\s*swatch|cap\s*relic|laundry\s*tag/i.test(card.title || "");
  const isMemOnly = !isAutoStandalone && /mem|memorabilia|relic|jersey|patch|cap|hat|swatch/i.test(card.variation || "");
  const memTypeNote = isHatSwatch
    ? `\nMEMORABILIA NOTE: "Player Caps" means a HAT/CAP swatch (piece of game-worn cap/hat), NOT a jersey or patch. Hat swatches are among the LEAST valuable memorabilia types — they sell for 30-60% LESS than game-used jersey/patch cards of the same player and numbering. Do NOT compare with patch or jersey memorabilia comps. Search specifically for "Player Caps" versions.`
    : isMemOnly
    ? `\nMEMORABILIA NOTE: This is a memorabilia-only card (no autograph). Non-auto memorabilia cards sell for significantly less than autograph versions. Search specifically for NON-AUTO memorabilia comps — do NOT use autograph card prices as comps.`
    : "";
  const numberedPrintRunStandalone = isNumbered && card.variation ? card.variation.match(/\/\s*(\d+)/)?.[1] : null;
  const variationContext = isNumbered 
    ? `\nNUMBERED CARD: This is a numbered parallel (${card.variation}). Search specifically for "${searchDescription}". ${isMemOnly ? "This is a non-auto memorabilia card — compare only with non-auto comps of the same type." : "It is rarer than base cards — do NOT return base card prices."}
CRITICAL PARALLEL MATCHING: Only use comps from the SAME parallel type with the SAME print run (/${numberedPrintRunStandalone || "?"}). Different numbered parallels of the same card (e.g., /50 Gold vs /399 Yellow Holo) are COMPLETELY DIFFERENT cards at DIFFERENT price tiers. A /50 card is much rarer and more valuable than a /399 card. Do NOT mix comps from different parallel types or print runs. If a listing says "/${numberedPrintRunStandalone}" it must match — reject any comp that shows a different print run number.${isPremiumNumberedStandalone ? `\nPREMIUM PARALLEL MATERIAL: This is a "${card.variation}" — a premium/SSP-class parallel material (like Wood, Silk, Sapphire, Platinum, etc.). These parallels command SIGNIFICANT premiums over standard numbered parallels of the same print run. A Wood /25 is worth considerably more than a standard Gold /25 because the material is rarer and more collectible. Factor this premium into your valuation. Include SSP-tagged listings as valid comps.` : ""}`
    : isPremiumUnnumberedStandalone
      ? `\nCRITICAL: This is a PREMIUM SSP/Case Hit insert — "${card.variation || card.set}". It is SIGNIFICANTLY more valuable than base/silver cards. Search specifically for "${searchDescription}" — do NOT return base card prices. Include the exact insert/parallel name in every search.${isOpticSetStandalone ? `\nOPTIC PRODUCT DISTINCTION: The SET is "${card.set}" which is a Donruss OPTIC (holographic/prismatic) product. Donruss Optic inserts are COMPLETELY DIFFERENT from base Donruss inserts of the same name — they are holographic and typically sell for 3-10x more. NEVER use base Donruss (non-Optic) prices as comps. Always include "Optic" in your eBay search queries.` : ""}`
    : (isPrizmFamilySetStandalone && isStrictBaseVariationStandalone
      ? `\n⚠️ PRIZM BASE (NON-REFRACTOR) — CRITICAL PARALLEL SEPARATION:
This card is the PAPER BASE version of a Prizm card — it is NON-REFRACTOR, NON-CHROME.
In Panini Prizm sets, there are TWO completely different "base" products:
  1. Paper Base (this card): standard paper stock, no chrome/refractor finish — sells for $1–$5 for most players
  2. Silver Prizm: chrome refractor finish, the most iconic Prizm parallel — sells for $5–$30+ for the same player
These are DIFFERENT cards at DIFFERENT price tiers. You MUST exclude Silver Prizm comps.
REFRACTOR EXCLUSION RULE: ANY listing with "Silver", "Prizm Prizm", "Refractor", "Chrome", "Holo", "Hyper", "Gold", "Red", "Blue Wave", "Green", "Purple", "Orange", "Pink" in the title is a PARALLEL, not the paper base — EXCLUDE it completely.
Search specifically: "${card.playerName || card.title} ${card.year || ""} Prizm base" — the paper base sells at a MUCH LOWER price than any chrome/refractor version.
For common players and bench players, the Prizm paper base sells for under $5.`
      : card.variation && card.variation.toLowerCase() !== "base"
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

  const setWordsStandalone = (card.set || "").trim().split(/\s+/);
  const hasSubsetInSetNameStandalone = setWordsStandalone.length >= 2 && !/^\d+$/.test(setWordsStandalone[setWordsStandalone.length - 1]);
  const productNameWarningStandalone = hasSubsetInSetNameStandalone
    ? `\nPRODUCT NAME PRECISION — CRITICAL:
The FULL set name is "${card.set}". Every word matters — each word identifies a DIFFERENT product:
- "${card.set}" and "${setWordsStandalone[0]}" are COMPLETELY DIFFERENT products at COMPLETELY DIFFERENT price tiers.
- Example: "Fleer Zone" ≠ "Fleer", "Metal Universe" ≠ "Metal", "Topps Finest" ≠ "Topps Chrome", "Topps Stadium Club" ≠ "Topps"
- You MUST include the FULL set name "${card.set}" in EVERY search query. NEVER drop words from the set name.
- If you find comps that don't include "${card.set}" in the listing title, they are for a DIFFERENT product — EXCLUDE them.
- ALL price fields (raw, PSA 9, PSA 10) must come from "${card.set}" comps ONLY — never mix comps from the base brand.`
    : "";

  const rawGradeWarning = isRaw
    ? `\nRAW CARD — CRITICAL PRICING RULES:
This card is RAW (ungraded). Follow these rules EXACTLY — do not mix raw and graded prices:
1. SEARCH A: Find raw/ungraded completed eBay sales ONLY. Search: "${searchDescription} raw sold eBay" and "${searchDescription} ungraded sold eBay"
2. avgPrice, minPrice, maxPrice and rawPrice MUST reflect ONLY raw/ungraded completed sales. NEVER include PSA 9 or PSA 10 sale prices in these fields.
3. PSA 9 and PSA 10 prices go in psa9Price and psa10Price ONLY — they must NEVER be mixed into avgPrice or rawPrice.
4. SSP/CASE HIT COMP MATCHING — USE YOUR HOBBY KNOWLEDGE:
Determine whether this card's variation "${card.variation || "base"}" is a premium insert, case hit, or SSP (examples: Downtown, Uptown, Kaboom, Color Blast, Disco, Stained Glass, Zebra, Tiger Stripe, Mojo, The Man, Warp Speed, Aurora, Street Art, and similar premium inserts).
- If this card IS a premium insert/case hit/SSP: Listings tagged "SSP", "Short Print", or "Case Hit" ARE this card — INCLUDE them as valid comps. These tags confirm the listing matches.
- If this card is a STANDARD variation (base, silver, numbered color parallels, etc.): Listings tagged "SSP", "Short Print", "SP", or "Case Hit" are a DIFFERENT, more valuable variation — EXCLUDE them completely.
Use your knowledge of the sports card hobby to make this determination. Do NOT rely solely on keyword matching — understand what the variation actually is.${isPrizmFamilySetStandalone && isStrictBaseVariationStandalone ? `
4b. PRIZM BASE REFRACTOR EXCLUSION: This is a PAPER BASE Prizm card (NON-REFRACTOR). ANY listing with "Silver", "Prizm Prizm", "Refractor", "Chrome", "Holo", "Gold", "Red", "Blue", "Green", "Purple", "Orange", "Pink" in the title is a DIFFERENT, MORE EXPENSIVE parallel — EXCLUDE it completely. Only use listings that are clearly the paper base version.` : ""}
5. Example: raw sales $25, $32, $40 → avgPrice = $32 (median), rawPrice = $32, psa9Price (separate) = $60.
6. Use the MEDIAN of the raw sales you find — do NOT skew low or high. Report it accurately.
7. If you cannot find raw sales, set rawPrice to null and soldCount to 0.
VIOLATION: An avgPrice or rawPrice that includes graded sale prices is WRONG and misleads collectors.`
    : "";

  const isAutoCardStandalone = /auto(graph)?/i.test(card.variation || "") || /auto(graph)?/i.test(card.set || "") || /auto(graph)?/i.test(card.title || "");
  const hasPatch = /patch|mem|memorabilia|relic|jersey/i.test(card.variation || "") || /patch|mem|memorabilia|relic|jersey/i.test(card.title || "");
  const autoCardWarningStandalone = isAutoCardStandalone && card.set
    ? `\nAUTOGRAPH CARD — PRODUCT-SPECIFIC PRICING REQUIRED:
This is an autograph card from "${card.set}"${hasPatch ? " with a MEMORABILIA PATCH embedded" : ""}. Autograph values vary ENORMOUSLY by product line:
- National Treasures / Flawless / Immaculate autos → premium ($500-$10,000+)
- Prizm / Select / Optic autos → mid-high ($100-$2,000)
- Mosaic / Donruss / Score autos → mid-tier ($20-$500)
- Chronicles / Prestige / Classics autos → budget ($10-$200)
- Leaf / Pro Set / Wild Card autos → low ($5-$100)
YOU MUST search for this EXACT card — do NOT pull prices from a different product line or variation.
${hasPatch ? `This is an AUTO PATCH — it includes a game-used memorabilia swatch. An auto PATCH is MORE valuable than a base auto from the same set but less liquid. Search specifically for the auto patch version.` : ""}
Use the FULL card description in every search query: "${searchDescription} sold eBay"
Also try: "${card.playerName || card.title} ${card.year || ""} ${card.set}${card.variation ? ` ${card.variation}` : " auto"} sold eBay"
CRITICAL: If you find a real sold listing for this specific card, use that price. Do NOT substitute a higher-priced card from a different product line just because this card seems "underpriced" for a star player.`
    : "";

  const is1of1 = card.variation ? /\b1\s*\/\s*1\b|one[\s-]+of[\s-]+one|superfractor/i.test(card.variation) : false;
  const lowPopMatchStandalone = card.variation ? card.variation.match(/\/\s*(\d+)\b/) : null;
  const popNumberStandalone = lowPopMatchStandalone ? parseInt(lowPopMatchStandalone[1]) : null;
  const isLowPopStandalone = popNumberStandalone !== null && popNumberStandalone <= 25 && !is1of1;
  const isMidNumberedStandalone = popNumberStandalone !== null && popNumberStandalone > 25 && popNumberStandalone <= 199;
  const isHighNumberedStandalone = popNumberStandalone !== null && popNumberStandalone > 199;
  const needsTriangulation = is1of1 || isLowPopStandalone || isMidNumberedStandalone || isHighNumberedStandalone;

  const playerSearchStandalone = card.playerName || card.title;
  const yearStrStandalone = card.year || "";
  const setStrStandalone = card.set || "";
  const pn = popNumberStandalone;

  function buildStandaloneTriangulation(): string {
    if (!needsTriangulation) return "";

    const vs: string[] = [];
    if (is1of1 || (pn && pn <= 5)) {
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /10 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /25 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /50 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /99 sold eBay"`);
    } else if (pn && pn <= 10) {
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /25 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /49 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /99 sold eBay"`);
    } else if (pn && pn <= 25) {
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /49 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /99 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} base sold eBay"`);
    } else if (pn && pn <= 75) {
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /99 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /149 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /199 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} base sold eBay"`);
    } else if (pn && pn <= 199) {
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /249 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /299 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /399 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} base sold eBay"`);
    } else if (pn && pn > 199) {
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /99 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /199 sold eBay"`);
      vs.push(`   - "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} base sold eBay"`);
    }

    if (is1of1 || isLowPopStandalone) {
      return `\nLOW-POP CARD (${is1of1 ? "1/1 — only 1 exists" : `/${pn} — only ${pn} copies exist`}):
Direct sales of this exact card are rare. Search in this order and use your market knowledge to value it:

1. Search for this exact card: "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} ${is1of1 ? "1/1" : `/${pn}`} sold eBay"
2. Search for this player's market floor: "${playerSearchStandalone} sold eBay" — understand what this player's cards typically command
3. Search for higher-numbered parallels of THIS SAME PLAYER from the same set:
${vs.join("\n")}
4. If still no data, search: "${playerSearchStandalone} ${yearStrStandalone} sold eBay" for any recent sales

Based on your search results and your expert knowledge of the sports card market, provide a realistic market value.
Do NOT use fixed multiplier formulas. Use your judgment: what would this card actually sell for on eBay today?
Cite which comps or knowledge you used in the notes field.`;
    }

    return `\nNUMBERED CARD FALLBACK (/${pn} — ${pn} copies exist):
If you find ZERO completed sold listings for the exact /${pn} parallel, use this triangulation approach:

1. FIRST: Search hard for this exact card: "${playerSearchStandalone} ${yearStrStandalone} ${setStrStandalone} /${pn} sold eBay"
2. If 0 exact comps found, search for ADJACENT numbered parallels from the SAME set to estimate value:
${vs.join("\n")}
3. Use scarcity logic to adjust: fewer copies = higher value. A /${pn} card is scarcer than higher-numbered parallels.
   - General guideline: a /99 is roughly 1.5-2x a /199; a /49 is roughly 2-3x a /99; a /25 is roughly 2-3x a /49
   - These are guidelines — use your market knowledge of THIS player to refine
4. ALWAYS provide a best estimate even with limited data. Set confidence to "LOW" and explain your reasoning in notes.
5. Do NOT return avgPrice: 0 just because no exact comps exist — triangulate from adjacent parallels.
Cite which comps you used and how you arrived at your estimate in the notes field.`;
  }

  const triangulationInstructions = buildStandaloneTriangulation();

  const searchPrompt = `Search eBay for recently SOLD listings of this sports card: "${searchDescription}"
${variationContext}
${productNameWarningStandalone}
${specificityWarning}
${rawGradeWarning}
${autoCardWarningStandalone}
${memTypeNote}
${triangulationInstructions}

Search eBay completed/sold listings for this EXACT card. You must complete BOTH searches below:

SEARCH A — RAW/UNGRADED prices:
- "${searchDescription}" sold
- "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} ${card.variation || ""} sold"
${isNumbered ? `- "${card.playerName || card.title} ${card.variation} sold eBay"\n- Include the numbering (e.g., /10, /25) in your search to find the correct parallel` : ""}

SEARCH B — GRADED prices (do this SEPARATELY, do not skip):
- "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} ${card.variation || ""} PSA 10 sold eBay"
- "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} ${card.variation || ""} PSA 9 sold eBay"
- "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} PSA 10 sold"
Record any actual PSA 10 and PSA 9 completed sold prices you find. These are your psa10Price and psa9Price — use the REAL sold prices, not calculations.

PRICING RULES — RECENCY IS KING:
- Prioritize the MOST RECENT completed sales (last 14 days > last 30 days > last 60 days)
- avgPrice should reflect what a buyer would REALISTICALLY PAY TODAY based on recent completed sales
- Report COMPLETED SOLD prices only — NOT "Buy It Now" asking prices, NOT active unsold listings
- Do NOT include "Best Offer accepted" sales where the actual price is hidden
- Exclude sales that are obviously a different card, lot, bundle, or error
- For numbered parallels of top rookies/stars, prices can be $500-$5000+ — do not default to low values
- CRITICAL: Only price the EXACT card described. Different sets, years, and variations have VASTLY different values.
- CRITICAL: For numbered cards, ONLY use comps with the SAME print run. A /50 Gold and a /399 Yellow Holo are DIFFERENT parallels at DIFFERENT price points — never mix them.
- When in doubt: "What would this card sell for if I listed it on eBay today?" — that is your avgPrice

Also estimate the PSA grading supply trend for this card — is the graded population stable, growing, or surging?

Return ONLY a JSON object with these exact fields:
{
  "soldCount": <number of recent completed sold listings found>,
  "avgPrice": <realistic current market price based on most recent completed sales>,
  "minPrice": <lowest recent completed sale price>,
  "maxPrice": <highest recent non-outlier sale price>,
  "rawPrice": <average price for RAW/UNGRADED copies specifically, or null if unknown>,
  "rawMinPrice": <lowest raw/ungraded sale price, or null if unknown>,
  "rawMaxPrice": <highest raw/ungraded sale price, or null if unknown>,
  "psa9Price": <REAL PSA 9 sold price from SEARCH B above — use actual completed sale price; only estimate from raw if zero PSA 9 sales exist>,
  "psa10Price": <REAL PSA 10 sold price from SEARCH B above — use actual completed sale price; only estimate from raw if zero PSA 10 sales exist>,
  "activeListing": <number of current active listings>,
  "liquidity": "HIGH" | "MEDIUM" | "LOW",
  "priceStability": "STABLE" | "VOLATILE" | "UNKNOWN",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "notes": "<brief note citing specific sold listings with prices when possible>",
  "supply": {
    "supplyGrowth": "stable" | "growing" | "surging",
    "supplyNote": "<short explanation of grading supply trend>",
    "estimatedPopulation": <estimated PSA population for top grade, or null>
  }
}

GRADED PRICE PRIORITY RULES:
1. ALWAYS use REAL sold prices from SEARCH B first. If you found PSA 10 sold listings, that IS psa10Price — do not recalculate it.
2. Only estimate graded prices if you found ZERO PSA 10 or PSA 9 sold listings after genuinely searching. When estimating, use your market knowledge of THIS SPECIFIC CARD — not generic multipliers.
3. If you must estimate graded value with no real data: Search for what this EXACT card (same player, same variation, same set) sells for graded on eBay. Use that market knowledge, not a formula.
4. psa9Price and psa10Price must ALWAYS be higher than rawPrice. If graded comps you found seem lower than raw, they may be for a different card variation — find better comps.
5. rawPrice should reflect ONLY ungraded/raw copies. For RAW cards, avgPrice must also be raw-only — never blend graded sales into avgPrice when the card being valued is raw.

Liquidity guidelines:
- HIGH: 15+ sales per month, sells almost daily
- MEDIUM: 5-15 sales per month, sells weekly
- LOW: Under 5 sales per month, may take time to sell

Price stability:
- STABLE: Prices within 20% of average
- VOLATILE: Prices vary more than 40%
- UNKNOWN: Not enough data

Be specific with numbers. If you find 19 sold listings, say 19, not "approximately 20".

SEARCH BROADENING: If your first search finds 0 completed sales, try broader queries:
- Drop ONLY generic words like "holo", "insert" from the search
- NEVER drop SSP/Case Hit parallel names or premium material names (Zebra, Tiger Stripe, Shock, Color Blast, Downtown, Uptown, Kaboom, Mojo, Shimmer, Wood, Silk, Sapphire, Platinum, Vintage Stock, Clear, Superfractor, etc.) — these define the card's rarity and price tier
- Try: "[year] [set] [player name] [variation] sold"
- For SSP/premium parallels, ALWAYS keep the parallel name — a Zebra is NOT a Silver

ZERO COMPS: If you STILL find NO completed sales after broadening, set soldCount to 0 and confidence to "LOW". However, STILL provide your best market estimate — NEVER return null for avgPrice. Use this hierarchy:

STEP 1 — ACTIVE LISTINGS FIRST: Search eBay for CURRENT active listings of this exact card. Active BIN prices from real sellers are the most accurate signal when no completed sales exist. If sellers are listing at $X, that IS the market price — use it as your primary estimate.

STEP 2 — If no active listings: Use the player's current market tier + this card's scarcity (numbering, variation) to estimate from comparable sold cards of this player or similar players.

The "completed sales only" rule applies when completed sales EXIST. When soldCount=0, active listing prices ARE valid and should be used. A price from real active listings beats a cross-player estimate. Note your methodology in "notes".`


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
            
            // RAW CARD CORRECTION: Use raw-specific prices when available for raw cards
            if (isRaw) {
              const psa9 = parsePrice(parsed.psa9Price);
              const psa10 = parsePrice(parsed.psa10Price);

              // Helper: is this price contaminated by graded sales?
              const isPSA9Contaminated = (price: number) => psa9 && psa9 > 0 && price >= psa9 * 0.8;

              if (parsed.rawPrice && parsed.rawPrice > 0 && !isPSA9Contaminated(parsed.rawPrice)) {
                // Gemini provided explicit raw pricing and it passes the sanity check — use it
                console.log(`[OutlookEngine] RAW CARD: Using Gemini rawPrice $${parsed.rawPrice} (overall avg was $${correctedAvg})`);
                correctedAvg = parsed.rawPrice;
                correctedMin = parsed.rawMinPrice || parsed.rawPrice * 0.7;
                correctedMax = parsed.rawMaxPrice || parsed.rawPrice * 1.5;
              } else {
                // rawPrice absent or itself contaminated — check avgPrice
                if (isPSA9Contaminated(correctedAvg)) {
                  const newAvg = Math.round(correctedMin * 1.25 * 100) / 100;
                  console.warn(`[OutlookEngine] RAW CONTAMINATION DETECTED: avg $${correctedAvg} is ≥80% of psa9 $${psa9} → using min-based raw estimate $${newAvg}`);
                  correctedAvg = newAvg;
                  correctedMax = Math.round(correctedMin * 1.8 * 100) / 100;
                } else if (parsed.rawPrice && parsed.rawPrice > 0) {
                  console.warn(`[OutlookEngine] RAW CARD: rawPrice $${parsed.rawPrice} looks contaminated (psa9 $${psa9}), using avgPrice $${correctedAvg} instead`);
                }
              }
            }
            
            let finalPsa9 = parsePrice(parsed.psa9Price);
            let finalPsa10 = parsePrice(parsed.psa10Price);

            if (finalPsa9 && finalPsa10 && finalPsa9 > finalPsa10) {
              console.warn(`[OutlookEngine] GRADED PRICE INVERSION: PSA 9 ($${finalPsa9}) > PSA 10 ($${finalPsa10}) — swapping`);
              [finalPsa9, finalPsa10] = [finalPsa10, finalPsa9];
            }

            if (finalPsa9 && correctedAvg > 0 && finalPsa9 < correctedAvg * 0.8) {
              console.warn(`[OutlookEngine] PSA 9 ($${finalPsa9}) suspiciously below raw ($${correctedAvg}) — adjusting to 1.5x raw`);
              finalPsa9 = Math.round(correctedAvg * 1.5);
            }
            if (finalPsa10 && correctedAvg > 0 && finalPsa10 < correctedAvg) {
              console.warn(`[OutlookEngine] PSA 10 ($${finalPsa10}) below raw ($${correctedAvg}) — adjusting to 2x raw`);
              finalPsa10 = Math.round(correctedAvg * 2);
            }

            if (finalPsa9 && correctedAvg > 0 && finalPsa9 > correctedAvg * 5) {
              console.warn(`[OutlookEngine] PSA 9 ($${finalPsa9}) unrealistically high vs raw ($${correctedAvg}) — capping at 3.5x`);
              finalPsa9 = Math.round(correctedAvg * 3.5);
            }
            if (finalPsa10 && correctedAvg > 0 && finalPsa10 > correctedAvg * 8) {
              console.warn(`[OutlookEngine] PSA 10 ($${finalPsa10}) unrealistically high vs raw ($${correctedAvg}) — capping at 6x`);
              finalPsa10 = Math.round(correctedAvg * 6);
            }

            const marketData: GeminiMarketData = {
              soldCount: parsed.soldCount || 0,
              avgPrice: correctedAvg,
              minPrice: correctedMin,
              maxPrice: correctedMax,
              psa9Price: finalPsa9,
              psa10Price: finalPsa10,
              activeListing: parsed.activeListing || 0,
              liquidity: parsed.liquidity || "MEDIUM",
              priceStability: parsed.priceStability || "UNKNOWN",
              dataSource: "gemini_grounded",
              searchQuery: searchDescription,
            };

            if (parsed.supply && parsed.supply.supplyGrowth) {
              marketData.supply = {
                supplyGrowth: ["stable", "growing", "surging"].includes(parsed.supply.supplyGrowth) ? parsed.supply.supplyGrowth : "stable",
                supplyNote: parsed.supply.supplyNote || "",
                estimatedPopulation: typeof parsed.supply.estimatedPopulation === "number" ? parsed.supply.estimatedPopulation : undefined,
              };
            }
            
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
// UNIFIED CARD ANALYSIS - Single Gemini call for pricing + news + verdict
// Replaces 4 separate calls (market data, news, price history, explanation)
// ============================================================

export interface UnifiedCardAnalysis {
  market: {
    soldCount: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    rawPrice: number | null;
    psa9Price: number | null;
    psa10Price: number | null;
    activeListing: number;
    liquidity: "HIGH" | "MEDIUM" | "LOW";
    priceStability: "STABLE" | "VOLATILE" | "UNKNOWN";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    notes: string;
  };
  player: {
    status: string;
    recentNews: string;
    momentum: "up" | "flat" | "down";
    teamContext: string;
    roleStatus: string;
    injuryStatus: string;
  };
  analysis: {
    verdict: string;
    verdictReasons: string[];
    shortSummary: string;
    detailedAnalysis: string;
    keyBullets: string[];
  };
  supply?: {
    supplyGrowth: "stable" | "growing" | "surging";
    supplyNote: string;
    estimatedPopulation?: number;
  };
  dataSource: "gemini_unified";
}

interface UnifiedAnalysisCache {
  data: UnifiedCardAnalysis;
  cachedAt: number;
}
const unifiedAnalysisCache = new Map<string, UnifiedAnalysisCache>();
const UNIFIED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function getDbCachedAnalysis(cacheKey: string): Promise<UnifiedCardAnalysis | null> {
  try {
    const { db } = await import("./db");
    const { unifiedAnalysisDbCache } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(unifiedAnalysisDbCache).where(eq(unifiedAnalysisDbCache.cacheKey, cacheKey));
    if (rows.length > 0) {
      const row = rows[0];
      const age = Date.now() - new Date(row.createdAt).getTime();
      if (age < DB_CACHE_TTL_MS) {
        console.log(`[Unified Analysis] DB cache hit for key (${Math.round(age / 1000 / 60)}min old)`);
        return row.resultJson as unknown as UnifiedCardAnalysis;
      }
    }
  } catch (e) {
    console.warn(`[Unified Analysis] DB cache read error:`, (e as Error).message);
  }
  return null;
}

let lastDbCacheCleanup = 0;
async function setDbCachedAnalysis(cacheKey: string, data: UnifiedCardAnalysis): Promise<void> {
  try {
    const { db } = await import("./db");
    const { unifiedAnalysisDbCache } = await import("@shared/schema");
    await db.insert(unifiedAnalysisDbCache).values({
      cacheKey,
      resultJson: data as any,
      createdAt: new Date(),
    }).onConflictDoUpdate({
      target: unifiedAnalysisDbCache.cacheKey,
      set: {
        resultJson: data as any,
        createdAt: new Date(),
      },
    });
    if (Date.now() - lastDbCacheCleanup > 60 * 60 * 1000) {
      lastDbCacheCleanup = Date.now();
      const { lt } = await import("drizzle-orm");
      const cutoff = new Date(Date.now() - DB_CACHE_TTL_MS);
      await db.delete(unifiedAnalysisDbCache).where(lt(unifiedAnalysisDbCache.createdAt, cutoff));
    }
  } catch (e) {
    console.warn(`[Unified Analysis] DB cache write error:`, (e as Error).message);
  }
}

export async function fetchUnifiedCardAnalysis(card: {
  title: string;
  playerName?: string | null;
  year?: number | null;
  set?: string | null;
  variation?: string | null;
  grade?: string | null;
  grader?: string | null;
}): Promise<UnifiedCardAnalysis | null> {
  const cacheKey = "unified|" + getGeminiCacheKey(card);
  const cached = unifiedAnalysisCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < UNIFIED_CACHE_TTL_MS) {
    console.log(`[Unified Analysis] Cache hit for: ${card.title} (${Math.round((Date.now() - cached.cachedAt) / 1000 / 60)}min old)`);
    return cached.data;
  }

  const dbCached = await getDbCachedAnalysis(cacheKey);
  if (dbCached) {
    unifiedAnalysisCache.set(cacheKey, { data: dbCached, cachedAt: Date.now() });
    return dbCached;
  }

  const maxRetries = 2;
  let lastError: Error | null = null;

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
  const variationLower = (card.variation || "").toLowerCase().trim();
  const setLower = (card.set || "").toLowerCase();
  const sspPattern = /\b(zebra|tiger\s*stripe|color\s*blast|shock|shimmer|mojo|downtown|uptown|kaboom|disco\s*ball|case\s*hit|ssp|gold\s*vinyl|black\s*gold|neon\s*green|scope|velocity|hyper|astral|galactic|lava|magma|snakeskin|marble|leopard|cheetah|camo|wave|ice|crystal|cracked\s*ice|lazer|laser|fast\s*break|choice|fotl|first\s*off\s*the\s*line|the\s*man|warp\s*speed|interstellar|eye\s*of\s*the\s*tiger|supernova|magician|phenomenon|street\s*art|art\s*deco|aurora|ascension|wood|silk|sapphire|platinum|vintage\s*stock|clear|superfractor)\b/i;
  const isPremiumUnnumberedParallel = !isNumbered && (sspPattern.test(variationLower) || sspPattern.test(setLower));
  const isPremiumNumberedParallel = isNumbered && (sspPattern.test(variationLower) || sspPattern.test(setLower));
  // Prizm-family sets: base paper card is non-refractor; Silver Prizm/Silver/Refractor are DIFFERENT parallels
  const isPrizmFamilySet = /\bprizm\b|\bprisma\b/i.test(card.set || "");
  const isStrictBaseVariation = !card.variation || variationLower === "base" || variationLower === "base prizm";
  const isOpticSet = /\boptic\b/i.test(card.set || "");
  const isBaseOrCommonParallel = !isNumbered && !isPremiumUnnumberedParallel && (
    !card.variation ||
    variationLower === "base" ||
    /^(certified\s+)?rookie\s*(card|rc)?\s*(silver|base|prizm|holo|disco)?$/i.test(variationLower) ||
    /^(silver|base|disco)\s*(prizm|holo)?$/i.test(variationLower) ||
    /^(prizm|holo|disco\s*prizm)$/i.test(variationLower)
  );
  const isAutoCardU = /auto(graph)?/i.test(card.variation || "") || /auto(graph)?/i.test(card.set || "") || /auto(graph)?/i.test(card.title || "");
  const isHatSwatchU = /player\s*cap|hat\s*swatch|cap\s*relic|laundry\s*tag/i.test(card.variation || "") || /player\s*cap|hat\s*swatch|cap\s*relic|laundry\s*tag/i.test(card.title || "");
  const isMemOnlyU = !isAutoCardU && /mem|memorabilia|relic|jersey|patch|cap|hat|swatch/i.test(card.variation || "");
  const memTypeNoteU = isHatSwatchU
    ? `\nMEMORABILIA NOTE: "Player Caps" means a HAT/CAP swatch (piece of game-worn cap/hat), NOT a jersey or patch. Hat swatches are among the LEAST valuable memorabilia types — they sell for 30-60% LESS than game-used jersey/patch cards of the same player and numbering. Do NOT compare with patch or jersey memorabilia comps. Search specifically for "Player Caps" versions.`
    : isMemOnlyU
    ? `\nMEMORABILIA NOTE: This is a memorabilia-only card (no autograph). Non-auto memorabilia cards sell for significantly less than autograph versions. Search specifically for NON-AUTO memorabilia comps — do NOT use autograph card prices as comps.`
    : "";
  const numberedPrintRun = isNumbered && card.variation ? card.variation.match(/\/\s*(\d+)/)?.[1] : null;
  const variationContext = isNumbered
    ? `\nNUMBERED CARD: This is a numbered parallel (${card.variation}). Search specifically for "${searchDescription}". ${isMemOnlyU ? "This is a non-auto memorabilia card — compare only with non-auto comps of the same type." : "It is rarer than base cards — do NOT return base card prices."}
CRITICAL PARALLEL MATCHING: Only use comps from the SAME parallel type with the SAME print run (/${numberedPrintRun || "?"}). Different numbered parallels of the same card (e.g., /50 Gold vs /399 Yellow Holo) are COMPLETELY DIFFERENT cards at DIFFERENT price tiers. A /50 card is much rarer and more valuable than a /399 card. Do NOT mix comps from different parallel types or print runs. If a listing says "/${numberedPrintRun}" it must match — reject any comp that shows a different print run number.${isPremiumNumberedParallel ? `\nPREMIUM PARALLEL MATERIAL: This is a "${card.variation}" — a premium/SSP-class parallel material (like Wood, Silk, Sapphire, Platinum, etc.). These parallels command SIGNIFICANT premiums over standard numbered parallels of the same print run. A Wood /25 is worth considerably more than a standard Gold /25 because the material is rarer and more collectible. Factor this premium into your valuation. Include SSP-tagged listings as valid comps.` : ""}`
    : isPremiumUnnumberedParallel
      ? `\nCRITICAL: This is a PREMIUM UNNUMBERED SSP/Case Hit insert — "${card.variation || card.set}". It is SIGNIFICANTLY more valuable than base/silver cards, even though it is unnumbered.
- SSP/Case Hit inserts like Zebra, Tiger Stripe, Shock, Color Blast, Downtown, Kaboom, Mojo, Shimmer etc. are RARE and command PREMIUM prices
- Do NOT confuse with base, silver, or common parallels — these are in a completely different price tier
- For Panini Select: Zebra/Tiger Stripe Concourse parallels are SSP Case Hits worth 10-50x more than base Concourse Silver
- For Panini Prizm: Color Blast, Shimmer, Mojo are premium SSPs worth far more than base Silver Prizm
- Search specifically for "${card.variation || ""} ${card.set || ""}" in your eBay queries — this insert/parallel name is CRITICAL to the price
- Include the EXACT insert name in every search: "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} ${card.variation || ""} sold eBay"
- These cards typically sell for $20-$200+ for non-stars, and $100-$1000+ for stars${isOpticSet ? `
⚠️ CRITICAL OPTIC WARNING — READ THIS FIRST ⚠️
The SET is "${card.set}" — this is Donruss OPTIC, a PREMIUM holographic/prismatic product.
"${card.set} ${card.variation || ""}" is a COMPLETELY DIFFERENT card from "Donruss ${card.variation || ""}" (base/non-Optic).
- Donruss Optic SSP inserts sell for 3-10x MORE than base Donruss SSP inserts of the same name
- A base Donruss Downtown might sell for $200-$500 but the OPTIC Downtown sells for $800-$2,000+ for star players
- You MUST verify that every comp you find contains "Optic" in the listing title
- If your comps do NOT include "Optic" in the listing, you are pricing the WRONG card
- Search queries MUST include "Optic": "${card.playerName || card.title} ${card.year || ""} Optic ${card.variation || ""} sold eBay"
- Also try: "Donruss Optic ${card.variation || ""} ${card.playerName || card.title} ${card.year || ""} sold"
- NEVER report base Donruss prices for an Optic card — they are different products at different price tiers` : ""}`
    : isBaseOrCommonParallel
      ? `\nCRITICAL: This appears to be a BASE or COMMON unnumbered parallel (${card.variation || "base"}). These are typically the CHEAPEST version of the card.
- "Certified Rookie" / "RC" is just a rookie designation — it does NOT make the card premium
- An unnumbered "silver" or "holo" or "prizm" is the base parallel, NOT a rare insert
- For most non-superstar players, base/silver/holo raw cards sell for $1-10
- Do NOT confuse with numbered parallels (/25, /49, /99), SSPs, or premium insert sets
- For Panini Select: Concourse Silver is the cheapest tier — do NOT price as Premier or Field Level
- For Panini Prizm: base Silver Prizm is the cheapest parallel
- Search specifically for the UNNUMBERED version and report those prices${isPrizmFamilySet && isStrictBaseVariation ? `
⚠️ PRIZM BASE (NON-REFRACTOR) — CRITICAL PARALLEL SEPARATION:
This card is the PAPER BASE version of a Prizm card — it is NON-REFRACTOR, NON-CHROME.
In Panini Prizm sets, there are TWO completely different "base" products:
  1. Paper Base (this card): standard paper stock, no chrome/refractor finish — sells for $1–$5 for most players
  2. Silver Prizm: chrome refractor finish, the most iconic Prizm parallel — sells for $5–$30+ for the same player
These are DIFFERENT cards at DIFFERENT price tiers. You MUST exclude Silver Prizm comps.
REFRACTOR EXCLUSION RULE: ANY listing with "Silver", "Prizm Prizm", "Refractor", "Chrome", "Holo", "Hyper", "Gold", "Red", "Blue Wave", "Green", "Purple", "Orange", "Pink" in the title is a PARALLEL, not the paper base — EXCLUDE it completely.
Search specifically: "${card.playerName || card.title} ${card.year || ""} Prizm base" or "${card.playerName || card.title} ${card.year || ""} Prizm rookie card" — the paper base sells at a MUCH LOWER price than any chrome/refractor version.
For common players and bench players, the Prizm paper base sells for under $5. Do not exceed the true paper base comp range.` : ""}`
      : (card.variation
        ? `\nPARALLEL MATCHING: This is a "${card.variation}" parallel — search for this SPECIFIC variation, not the base version.
- Search: "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} ${card.variation} sold eBay"
- Only use comps that match "${card.variation}" — do NOT mix in prices from other parallels (Silver, Gold, Base, etc.)
- If you cannot find sold comps for this exact parallel, set market.soldCount to 0 and market.confidence to "LOW"
- With soldCount=0, estimate CONSERVATIVELY — lean toward the LOWER end of what comparable parallels sell for`
        : "");

  const hasMissingDetails = !card.set || !card.variation;
  const specificityWarning = hasMissingDetails
    ? `\nIMPORTANT SPECIFICITY WARNING: This search is missing ${!card.set ? "the card SET" : ""}${!card.set && !card.variation ? " and " : ""}${!card.variation ? "the card VARIATION/PARALLEL" : ""}. 
DO NOT guess or assume it is the player's most popular/valuable card. The card could be a cheap base card, a common insert, or a low-value parallel.
- If the search query is vague (just a player name), search for the MOST COMMON version of this card, NOT premium rookies or autos.
- When set/variation is unknown, lean toward LOWER price estimates rather than higher ones.
- Set market.confidence to "LOW" since the card identity is incomplete.`
    : "";

  // Detect multi-word set names that include subset/insert identifiers
  const setWords = (card.set || "").trim().split(/\s+/);
  const hasSubsetInSetName = setWords.length >= 2 && !/^\d+$/.test(setWords[setWords.length - 1]);
  const productNameWarning = hasSubsetInSetName
    ? `\nPRODUCT NAME PRECISION — CRITICAL:
The FULL set name is "${card.set}". Every word matters — each word identifies a DIFFERENT product:
- "${card.set}" and "${setWords[0]}" are COMPLETELY DIFFERENT products at COMPLETELY DIFFERENT price tiers.
- Example: "Fleer Zone" ≠ "Fleer", "Metal Universe" ≠ "Metal", "Topps Finest" ≠ "Topps Chrome", "Topps Stadium Club" ≠ "Topps"
- You MUST include the FULL set name "${card.set}" in EVERY search query. NEVER drop words from the set name.
- If you find comps that don't include "${card.set}" in the listing title, they are for a DIFFERENT product — EXCLUDE them.
- ALL price fields (raw, PSA 9, PSA 10) must come from "${card.set}" comps ONLY — never mix comps from the base brand.`
    : "";

  const isAutoCard = /auto(graph)?/i.test(card.variation || "") || /auto(graph)?/i.test(card.set || "") || /auto(graph)?/i.test(card.title || "");
  const hasPatchUnified = /patch|mem|memorabilia|relic|jersey/i.test(card.variation || "") || /patch|mem|memorabilia|relic|jersey/i.test(card.title || "");
  const unifiedSearchDescription = [card.year, card.set, card.playerName || card.title, card.variation].filter(Boolean).join(" ");

  const rawGradeWarning = isRaw
    ? `\nRAW CARD — CRITICAL PRICING RULES:
This card is RAW (ungraded). Follow these rules EXACTLY — do not mix raw and graded prices:
1. SEARCH A: Find raw/ungraded completed eBay sales ONLY. Search: "${unifiedSearchDescription} raw sold eBay" and "${unifiedSearchDescription} ungraded sold eBay"
2. market.avgPrice, market.minPrice, market.maxPrice and market.rawPrice MUST reflect ONLY raw/ungraded completed sales. NEVER include PSA 9 or PSA 10 sale prices in these fields.
3. PSA 9 and PSA 10 prices go in psa9Price and psa10Price ONLY — they must NEVER be mixed into market.avgPrice or market.rawPrice.
4. SSP/CASE HIT COMP MATCHING — USE YOUR HOBBY KNOWLEDGE:
Determine whether this card's variation "${card.variation || "base"}" is a premium insert, case hit, or SSP (examples: Downtown, Uptown, Kaboom, Color Blast, Disco, Stained Glass, Zebra, Tiger Stripe, Mojo, The Man, Warp Speed, Aurora, Street Art, and similar premium inserts).
- If this card IS a premium insert/case hit/SSP: Listings tagged "SSP", "Short Print", or "Case Hit" ARE this card — INCLUDE them as valid comps. These tags confirm the listing matches.
- If this card is a STANDARD variation (base, silver, numbered color parallels, etc.): Listings tagged "SSP", "Short Print", "SP", or "Case Hit" are a DIFFERENT, more valuable variation — EXCLUDE them completely.
Use your knowledge of the sports card hobby to make this determination. Do NOT rely solely on keyword matching — understand what the variation actually is.${isPrizmFamilySet && isStrictBaseVariation ? `
4b. PRIZM BASE REFRACTOR EXCLUSION: This is a PAPER BASE Prizm card (NON-REFRACTOR). ANY listing with "Silver", "Prizm Prizm", "Refractor", "Chrome", "Holo", "Gold", "Red", "Blue", "Green", "Purple", "Orange", "Pink" in the title is a DIFFERENT, MORE EXPENSIVE parallel — EXCLUDE it completely. Only use listings that are clearly the paper base version.` : ""}
5. Example: raw sales $25, $32, $40 → market.avgPrice = $32 (median), market.rawPrice = $32, psa9Price (separate) = $60.
6. Use the MEDIAN of the raw sales you find — do NOT skew low or high. Report it accurately.
7. If you cannot find raw sales, set market.rawPrice to null and market.soldCount to 0.
VIOLATION: A market.avgPrice or market.rawPrice that includes graded sale prices is WRONG and misleads collectors.`
    : "";
  const autoCardWarning = isAutoCard && card.set
    ? `\nAUTOGRAPH CARD — PRODUCT-SPECIFIC PRICING REQUIRED:
This is an autograph card from "${card.set}"${hasPatchUnified ? " with a MEMORABILIA PATCH embedded" : ""}. Autograph values vary ENORMOUSLY by product line:
- National Treasures / Flawless / Immaculate autos → premium ($500-$10,000+)
- Prizm / Select / Optic autos → mid-high ($100-$2,000)
- Mosaic / Donruss / Score autos → mid-tier ($20-$500)
- Chronicles / Prestige / Classics autos → budget ($10-$200)
- Leaf / Pro Set / Wild Card autos → low ($5-$100)
YOU MUST search for this EXACT card — do NOT pull prices from a different product line or variation.
${hasPatchUnified ? `This is an AUTO PATCH — it includes a game-used memorabilia swatch. An auto PATCH is MORE valuable than a base auto from the same set but less liquid. Search specifically for the auto patch version.` : ""}
Use the FULL card description in every search query: "${unifiedSearchDescription} sold eBay"
Also try: "${card.playerName || card.title} ${card.year || ""} ${card.set}${card.variation ? ` ${card.variation}` : " auto"} sold eBay"
CRITICAL: If you find a real sold listing for this specific card, use that price. Do NOT substitute a higher-priced card from a different product line just because this card seems "underpriced" for a star player.`
    : "";

  const is1of1 = card.variation ? /\b1\s*\/\s*1\b|one[\s-]+of[\s-]+one|superfractor/i.test(card.variation) : false;
  const lowPopMatch = card.variation ? card.variation.match(/\/\s*(\d+)\b/) : null;
  const popNumber = lowPopMatch ? parseInt(lowPopMatch[1]) : null;
  const isLowPop = popNumber !== null && popNumber <= 25 && !is1of1;
  const isMidNumbered = popNumber !== null && popNumber > 25 && popNumber <= 199;
  const isHighNumbered = popNumber !== null && popNumber > 199;
  const needsTriangulation = is1of1 || isLowPop || isMidNumbered || isHighNumbered;

  const playerSearch = card.playerName || card.title;
  const yearStr = card.year || "";
  const setStr = card.set || "";

  function buildTriangulationInstructions(): string {
    if (!needsTriangulation) return "";

    const verticalSearches: string[] = [];
    if (is1of1 || (popNumber && popNumber <= 5)) {
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /10 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /25 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /50 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /49 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /75 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /99 sold eBay"`);
    } else if (popNumber && popNumber <= 10) {
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /25 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /49 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /99 sold eBay"`);
    } else if (popNumber && popNumber <= 25) {
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /49 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /99 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} base sold eBay"`);
    } else if (popNumber && popNumber <= 75) {
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /99 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /149 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /199 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} base sold eBay"`);
    } else if (popNumber && popNumber <= 199) {
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /249 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /299 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /399 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} base sold eBay"`);
    } else if (popNumber && popNumber > 199) {
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /99 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} /199 sold eBay"`);
      verticalSearches.push(`- Search: "${playerSearch} ${yearStr} ${setStr} base sold eBay"`);
    }

    if (is1of1 || isLowPop) {
      return `\nLOW-POP CARD (${is1of1 ? "1/1 — only 1 exists" : `/${popNumber} — only ${popNumber} copies exist`}):
Direct sales of this exact card are rare. Search in this order and use your market knowledge to value it:

1. Search for this exact card: "${playerSearch} ${yearStr} ${setStr} ${is1of1 ? "1/1" : `/${popNumber}`} sold eBay"
2. Search for this player's market: "${playerSearch} sold eBay" — understand what this player's cards typically command
3. Search for higher-numbered parallels of THIS SAME PLAYER from the same set:
${verticalSearches.join("\n")}
4. If still no data: "${playerSearch} ${yearStr} sold eBay" for any recent sales of this player

Based on your search results and your expert knowledge of the sports card market, provide a realistic market value.
Do NOT apply fixed multiplier formulas. Use your judgment: what would this card actually sell for on eBay today?
Consider the player's position and tier, the memorabilia type (caps/hats are worth less than patches/jerseys), and the brand tier.
Cite which comps or market knowledge you used in the notes field.`;
    }

    return `\nNUMBERED CARD FALLBACK (/${popNumber} — ${popNumber} copies exist):
If you find ZERO completed sold listings for the exact /${popNumber} parallel, use this triangulation approach:

1. FIRST: Search hard for this exact card: "${playerSearch} ${yearStr} ${setStr} /${popNumber} sold eBay"
2. If 0 exact comps found, search for ADJACENT numbered parallels from the SAME set to estimate value:
${verticalSearches.join("\n")}
3. Use scarcity logic to adjust: fewer copies = higher value. A /${popNumber} card is scarcer than higher-numbered parallels.
   - General guideline: a /99 is roughly 1.5-2x a /199; a /49 is roughly 2-3x a /99; a /25 is roughly 2-3x a /49
   - These are guidelines — use your market knowledge of THIS player to refine
4. ALWAYS provide a best estimate even with limited data. Set confidence to "LOW" and explain your reasoning in notes.
5. Do NOT return avgPrice: 0 just because no exact comps exist — triangulate from adjacent parallels.
Cite which comps you used and how you arrived at your estimate in the notes field.`;
  }

  const triangulationInstructions = buildTriangulationInstructions();

  const currentYear = new Date().getFullYear();

  const prompt = `You are a sports card market analyst. Search for this card and provide a COMPLETE analysis in ONE response.

CARD: "${searchDescription}"
Player: ${card.playerName || card.title}
Year: ${card.year || "Unknown"} | Set: ${card.set || "Unknown"} | Variation: ${card.variation || "Base"}
Grade: ${isRaw ? "RAW (ungraded)" : (card.grade || "Unknown")}${card.grader ? ` by ${card.grader}` : ""}
${variationContext}
${productNameWarning}
${specificityWarning}
${rawGradeWarning}
${autoCardWarning}
${memTypeNoteU}
${triangulationInstructions}

Do ALL of the following in this single search:

1. MARKET PRICING (MOST IMPORTANT — get this right):
   Search eBay completed/sold listings for this EXACT card. Run BOTH sub-searches:

   1a. RAW/UNGRADED prices — ALWAYS include the specific variation in your search:
   - "${unifiedSearchDescription} sold eBay"
   - "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} ${card.variation || ""} sold eBay"${isOpticSet ? `
   - OPTIC-SPECIFIC SEARCH (mandatory): "${card.playerName || card.title} ${card.year || ""} Optic ${card.variation || ""} sold eBay"
   - Also try: "Donruss Optic ${card.variation || ""} ${card.playerName || card.title} sold"
   - VERIFY every comp has "Optic" in the listing — base Donruss is a different, cheaper product` : ""}
   - Prioritize the MOST RECENT sales (last 14 days > last 30 days > last 60 days)
   - avgPrice = what it realistically sells for TODAY based on recent completed sales
   - CRITICAL: rawPrice must be for THIS EXACT variation, not a base/silver version

   1b. GRADED prices — search these SEPARATELY, do not skip:
   - "${unifiedSearchDescription} PSA 10 sold eBay"
   - "${unifiedSearchDescription} PSA 9 sold eBay"
   - "${card.playerName || card.title} ${card.year || ""} ${card.set || ""} PSA 10 sold"
   Use real completed PSA 10 and PSA 9 sale prices directly — do NOT recalculate from raw if you found actual graded sold data.

2. PLAYER NEWS: Search for ${card.playerName || card.title} latest news in ${currentYear} — current team, injuries, performance, trades, roster status.

3. INVESTMENT ANALYSIS: Based on the pricing data AND player news, provide your investment verdict.

4. SUPPLY ANALYSIS: Estimate the PSA population and grading volume trend for this card:
   - Search for PSA population report data or grading trends for this card/player
   - Estimate whether the graded supply is stable, growing, or surging (mass submissions flooding the market)
   - "stable" = normal grading volume, pop counts not rising fast
   - "growing" = moderate increase in submissions, supply expanding
   - "surging" = heavy submission volume, PSA pop growing rapidly, diluting scarcity
   - Provide a short note explaining the supply situation (e.g. "PSA 10 pop jumped from 200 to 800 in 6 months" or "Low submission volume keeps supply tight")
   - If you can find or estimate the PSA population count for this card's top grade, include it

PRICING RULES:
- Report COMPLETED SOLD prices only — NOT "Buy It Now" asking prices, NOT active unsold listings
- avgPrice = what this card realistically sells for based on recent completed sales (use MEDIAN of recent sales, not mean)
- Exclude sales that are obviously a different card, lot, bundle, or error
- Do NOT include "Best Offer accepted" sales where the actual price is hidden
- For numbered parallels (/25, /10, etc.) of stars, prices CAN be much higher — search specifically
- CRITICAL: Only price the EXACT card described. Different sets, years, and variations have VASTLY different values
- CRITICAL: For numbered cards, ONLY use comps with the SAME print run. A /50 Gold and a /399 Yellow Holo are DIFFERENT parallels at DIFFERENT price points — never mix them
- When in doubt, ask yourself: "If I searched eBay sold listings for this exact card right now, what would the typical recent sale price be?" — that is your avgPrice

SEARCH BROADENING: If your first search finds 0 completed sales, try broader queries:
- Drop ONLY generic descriptive words like "holo", "insert" from the search
- NEVER drop SSP/Case Hit parallel names or premium material names (Zebra, Tiger Stripe, Shock, Color Blast, Downtown, Uptown, Kaboom, Mojo, Shimmer, Scope, Velocity, Hyper, Wave, Ice, Crystal, Cracked Ice, Laser, FOTL, Wood, Silk, Sapphire, Platinum, Vintage Stock, Clear, Superfractor) — these define the card's rarity tier and price
- NEVER drop "prizm" if the set name is "Prizm" — it's the brand name, not a descriptor
- Try just: "[year] [brand] [player name] [variation] sold"  
- Try: "[year] [set] [player name] [variation] sold"
- For SSP/premium parallels, ALWAYS keep the parallel name in broadened searches — a Zebra is NOT interchangeable with a Silver
- Only fall back to base/silver pricing if the card IS actually a base/silver parallel
Report whatever comps you find from these broader searches.

ZERO COMPS: If you STILL find NO completed sales after broadening searches, set soldCount to 0 and confidence to "LOW". However, you MUST STILL provide your best market estimate for avgPrice, rawPrice, minPrice, and maxPrice — NEVER return 0 or null for avgPrice. This is mandatory. Use this hierarchy:

STEP 1 — ACTIVE LISTINGS (do this first): Search eBay for CURRENT active listings of this exact card. Active BIN prices from real sellers are the best available market signal when no sales exist. If you find active listings at $X, that IS the market price floor — use it as your primary estimate. Record the count in activeListing.

STEP 2 — If no active listings either: Search for the SAME player's recently sold cards in any product to understand their market tier (e.g. "${card.playerName || card.title} 2025 baseball card sold eBay"). Apply a scarcity premium for the specific variation/numbering based on your market knowledge.

STEP 3 — Last resort: Search for COMPARABLE players at the same tier in similar products, or the same product with different players, to understand the product price floor. Apply scarcity premium.

NOTE: The "completed sales only" rule above applies when completed sales EXIST. When soldCount=0, active listing prices ARE valid — use them aggressively. A price based on real active listings at $X beats a cross-player estimate every time. Note your methodology in "notes".

Return ONLY a JSON object with this EXACT structure:
{
  "market": {
    "soldCount": <number of recent completed sold listings found>,
    "avgPrice": <realistic current market price based on MOST RECENT completed sales — this is what it sells for TODAY>,
    "minPrice": <lowest recent completed sale price>,
    "maxPrice": <highest recent non-outlier sale price>,
    "rawPrice": <average raw/ungraded price, or null>,
    "psa9Price": <REAL PSA 9 sold price from sub-search 1b — use actual sale price; only fall back to estimate if zero PSA 9 sales found>,
    "psa10Price": <REAL PSA 10 sold price from sub-search 1b — use actual sale price; only fall back to estimate if zero PSA 10 sales found>,
    "activeListing": <current active listings count>,
    "liquidity": "HIGH" | "MEDIUM" | "LOW",
    "priceStability": "STABLE" | "VOLATILE" | "UNKNOWN",
    "confidence": "HIGH" | "MEDIUM" | "LOW",
    "notes": "<cite specific recent sold prices with approximate dates, e.g. 'Sold $38 (Feb 2026), $42 (Feb 2026), $45 (Jan 2026)'>"
  },
  "player": {
    "status": "<active/injured/retired/prospect>",
    "recentNews": "<1-2 sentence summary of latest news>",
    "momentum": "up" | "flat" | "down",
    "teamContext": "<current team and role>",
    "roleStatus": "STARTER" | "BACKUP" | "INJURED_RESERVE" | "UNCERTAIN" | "UNKNOWN",
    "injuryStatus": "HEALTHY" | "INJURED" | "RECOVERING" | "UNKNOWN"
  },
  "analysis": {
    "verdict": "BUY" | "MONITOR" | "SELL" | "LONG_HOLD" | "LEGACY_HOLD" | "WATCH" | "LITTLE_VALUE",
    "verdictReasons": ["reason 1", "reason 2", "reason 3"],
    "shortSummary": "<one sentence investment summary>",
    "detailedAnalysis": "<2-3 paragraph detailed analysis for pro users>",
    "keyBullets": ["<key point 1>", "<key point 2>", "<key point 3>", "<key point 4>"]
  },
  "supply": {
    "supplyGrowth": "stable" | "growing" | "surging",
    "supplyNote": "<short explanation of supply trend, e.g. 'PSA 10 pop at 1,200 and climbing fast' or 'Low submission volume keeps supply tight'>",
    "estimatedPopulation": <estimated PSA population count for top grade, or null if unknown>
  }
}

VERDICT GUIDELINES:
- BUY: Strong upside, good price entry point, healthy demand
- MONITOR: Uncertain — wait for clearer signals or price stabilization
- SELL: Declining value, negative momentum, or peak pricing
- LONG_HOLD: Solid long-term value, hold for appreciation
- LEGACY_HOLD: Vintage/retired player cards with historical significance
- WATCH: Interesting but not ready to buy yet
- LITTLE_VALUE: Card worth under $2-3 with minimal upside potential

Liquidity: HIGH = 15+ sales/month, MEDIUM = 5-15, LOW = under 5.
Price stability: STABLE = within 20%, VOLATILE = varies 40%+.

GRADED PRICE PRIORITY RULES:
1. Use REAL sold prices from sub-search 1b first. If you found PSA 10 sold listings, that number IS psa10Price — do not recalculate it from raw.
2. Only fall back to multipliers if you found ZERO PSA 10 or PSA 9 sold listings after genuinely searching. Multipliers are a last resort, not a default.
3. Fallback multipliers (use ONLY when no real data exists): PSA 9 ≈ 2-5x raw, PSA 10 ≈ 5-15x raw. Popular base cards of hot players can have 20-50x graded premiums — do not artificially cap it.
4. psa9Price and psa10Price must ALWAYS be higher than rawPrice. If graded comps are lower than raw, those are a different cheaper card — use multiplier fallback.
5. Never return null for both psa9Price and psa10Price.
If player is injured or lost starting role, reflect this in momentum and verdict.
Be specific with numbers — if you find 19 sold listings, say 19.
${needsTriangulation ? `\nIMPORTANT FOR 1/1 AND LOW-POP CARDS:
- avgPrice MUST be your best triangulated estimate, even with 0 direct comps
- Do NOT default to null/0 — use parallel comp multipliers to estimate
- In notes, explain your triangulation: which parallel comps you found, what multiplier you applied
- Confidence should be "LOW" if based entirely on multipliers, "MEDIUM" if you found nearby parallel sales
- The analysis and verdict should still be given based on the estimated value — treat the triangulated price as real for investment analysis` : ""}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Unified Analysis] Attempt ${attempt} for: ${searchDescription}`);
      const startTime = Date.now();

      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const elapsed = Date.now() - startTime;
      let responseText = response.text || "";
      console.log(`[Unified Analysis] Response in ${elapsed}ms (${responseText.length} chars)`);

      responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);

          if (parsed.market && typeof parsed.market.avgPrice === "number") {
            let correctedAvg = parsed.market.avgPrice || 0;
            let correctedMin = parsed.market.minPrice || correctedAvg * 0.8;
            let correctedMax = parsed.market.maxPrice || correctedAvg * 1.2;

            if (isRaw) {
              const psa9 = parsePrice(parsed.market.psa9Price);
              // Helper: is this price contaminated by graded sales?
              const isPSA9Contaminated = (price: number) => psa9 && psa9 > 0 && price >= psa9 * 0.8;

              if (parsed.market.rawPrice && parsed.market.rawPrice > 0 && !isPSA9Contaminated(parsed.market.rawPrice)) {
                // Gemini provided explicit raw pricing and it passes the sanity check — use it
                console.log(`[Unified Analysis] RAW CARD: Using rawPrice $${parsed.market.rawPrice} (overall avg was $${correctedAvg})`);
                correctedAvg = parsed.market.rawPrice;
                correctedMin = parsed.market.rawMinPrice || parsed.market.rawPrice * 0.7;
                correctedMax = parsed.market.rawMaxPrice || parsed.market.rawPrice * 1.5;
              } else {
                // rawPrice absent or itself contaminated — check avgPrice
                if (isPSA9Contaminated(correctedAvg)) {
                  const newAvg = Math.round(correctedMin * 1.25 * 100) / 100;
                  console.warn(`[Unified Analysis] RAW CONTAMINATION DETECTED: avg $${correctedAvg} is ≥80% of psa9 $${psa9} → using min-based raw estimate $${newAvg}`);
                  correctedAvg = newAvg;
                  correctedMax = Math.round(correctedMin * 1.8 * 100) / 100;
                } else if (parsed.market.rawPrice && parsed.market.rawPrice > 0) {
                  console.warn(`[Unified Analysis] rawPrice $${parsed.market.rawPrice} looks contaminated (psa9 $${psa9}), using avgPrice $${correctedAvg} instead`);
                }
              }
            }

            const player = parsed.player || {};
            let momentum: "up" | "flat" | "down" = player.momentum || "flat";
            if (player.roleStatus === "INJURED_RESERVE" || player.injuryStatus === "INJURED") {
              momentum = "down";
            } else if (player.roleStatus === "BACKUP") {
              momentum = momentum === "up" ? "flat" : "down";
            }

            const analysis = parsed.analysis || {};

            let finalPsa9 = parsePrice(parsed.market.psa9Price);
            let finalPsa10 = parsePrice(parsed.market.psa10Price);

            if (finalPsa9 && finalPsa10 && finalPsa9 > finalPsa10) {
              console.warn(`[Unified Analysis] GRADED PRICE INVERSION: PSA 9 ($${finalPsa9}) > PSA 10 ($${finalPsa10}) — swapping`);
              [finalPsa9, finalPsa10] = [finalPsa10, finalPsa9];
            }

            if (finalPsa9 && correctedAvg > 0 && finalPsa9 < correctedAvg * 0.8) {
              console.warn(`[Unified Analysis] PSA 9 ($${finalPsa9}) suspiciously below raw ($${correctedAvg}) — adjusting to 1.5x raw`);
              finalPsa9 = Math.round(correctedAvg * 1.5);
            }
            if (finalPsa10 && correctedAvg > 0 && finalPsa10 < correctedAvg) {
              console.warn(`[Unified Analysis] PSA 10 ($${finalPsa10}) below raw ($${correctedAvg}) — adjusting to 2x raw`);
              finalPsa10 = Math.round(correctedAvg * 2);
            }

            if (finalPsa9 && correctedAvg > 0 && finalPsa9 > correctedAvg * 5) {
              console.warn(`[Unified Analysis] PSA 9 ($${finalPsa9}) unrealistically high vs raw ($${correctedAvg}) — capping at 3.5x`);
              finalPsa9 = Math.round(correctedAvg * 3.5);
            }
            if (finalPsa10 && correctedAvg > 0 && finalPsa10 > correctedAvg * 8) {
              console.warn(`[Unified Analysis] PSA 10 ($${finalPsa10}) unrealistically high vs raw ($${correctedAvg}) — capping at 6x`);
              finalPsa10 = Math.round(correctedAvg * 6);
            }

            const result: UnifiedCardAnalysis = {
              market: {
                soldCount: parsed.market.soldCount || 0,
                avgPrice: correctedAvg,
                minPrice: correctedMin,
                maxPrice: correctedMax,
                rawPrice: parsed.market.rawPrice || null,
                psa9Price: finalPsa9,
                psa10Price: finalPsa10,
                activeListing: parsed.market.activeListing || 0,
                liquidity: parsed.market.liquidity || "MEDIUM",
                priceStability: parsed.market.priceStability || "UNKNOWN",
                confidence: parsed.market.confidence || "MEDIUM",
                notes: parsed.market.notes || "",
              },
              player: {
                status: player.status || "unknown",
                recentNews: player.recentNews || "",
                momentum,
                teamContext: player.teamContext || "",
                roleStatus: player.roleStatus || "UNKNOWN",
                injuryStatus: player.injuryStatus || "UNKNOWN",
              },
              analysis: {
                verdict: analysis.verdict || "MONITOR",
                verdictReasons: Array.isArray(analysis.verdictReasons) ? analysis.verdictReasons : ["Insufficient data for strong recommendation"],
                shortSummary: analysis.shortSummary || `${analysis.verdict || "MONITOR"} recommendation based on current market data.`,
                detailedAnalysis: analysis.detailedAnalysis || "",
                keyBullets: Array.isArray(analysis.keyBullets) ? analysis.keyBullets : (Array.isArray(analysis.verdictReasons) ? analysis.verdictReasons : []),
              },
              dataSource: "gemini_unified",
            };

            if (parsed.supply && parsed.supply.supplyGrowth) {
              result.supply = {
                supplyGrowth: ["stable", "growing", "surging"].includes(parsed.supply.supplyGrowth) ? parsed.supply.supplyGrowth : "stable",
                supplyNote: parsed.supply.supplyNote || "",
                estimatedPopulation: typeof parsed.supply.estimatedPopulation === "number" ? parsed.supply.estimatedPopulation : undefined,
              };
            }

            unifiedAnalysisCache.set(cacheKey, { data: result, cachedAt: Date.now() });
            setDbCachedAnalysis(cacheKey, result);
            console.log(`[Unified Analysis] Cached (memory+DB): ${card.title} | verdict=${result.analysis.verdict} | avg=$${correctedAvg} | ${result.market.soldCount} sold | ${elapsed}ms`);

            return result;
          } else {
            console.log(`[Unified Analysis] Invalid structure:`, JSON.stringify(parsed).substring(0, 200));
          }
        } catch (parseError) {
          console.error(`[Unified Analysis] JSON parse failed:`, responseText.substring(0, 300));
        }
      }
    } catch (error: any) {
      lastError = error;
      console.error(`[Unified Analysis] Error (attempt ${attempt}):`, error.message);
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error("[Unified Analysis] Failed after retries:", lastError?.message);
  return null;
}

// ============================================================
// LOW-POP FALLBACK PRICING — triggered when unified analysis fails for /1-/5 cards
// Uses a simplified Gemini + Google Search call focused on triangulation
// ============================================================
export async function fetchLowPopFallbackPrice(card: {
  title: string;
  playerName?: string;
  year?: string | number;
  set?: string;
  variation?: string;
  grade?: string;
  grader?: string;
}): Promise<{ avgPrice: number; minPrice: number; maxPrice: number; notes: string } | null> {
  const playerName = card.playerName || card.title;
  const year = card.year || "";
  const set = card.set || "";
  const variation = card.variation || "";
  const gradeStr = card.grade ? ` ${card.grade}` : "";
  const graderStr = card.grader && card.grader.toLowerCase() !== "raw" ? ` ${card.grader}` : "";
  const isRaw = !card.grade || card.grade.toLowerCase() === "raw" || (card.grader && card.grader.toLowerCase() === "raw");

  const popMatch = variation.match(/\/\s*(\d+)\b/);
  const popNumber = popMatch ? parseInt(popMatch[1]) : 5;
  const is1of1 = /\b1\s*\/\s*1\b|one[\s-]+of[\s-]+one|superfractor/i.test(variation);
  const cardLabel = is1of1 ? "1/1" : `/${popNumber}`;

  const searchDesc = `${year} ${set} ${playerName} ${variation}${gradeStr}${graderStr}`.trim();

  const prompt = `You are a sports card pricing expert. I need a realistic fair market value for this rare card:

CARD: "${searchDesc}"
Print Run: ${cardLabel} (only ${is1of1 ? 1 : popNumber} copies exist)
Condition: ${isRaw ? "RAW (ungraded)" : (card.grade || "Unknown")}

Search eBay for pricing data in this order:
1. This exact card: "${playerName} ${year} ${set} ${is1of1 ? "1/1" : `/${popNumber}`} sold eBay"
2. This player's recent sales: "${playerName} sold eBay" — establishes the market floor
3. This player's higher-numbered parallels from the same set:
   - "${playerName} ${year} ${set} /25 sold eBay"
   - "${playerName} ${year} ${set} /99 sold eBay"
4. If no set-specific data: "${playerName} ${year} auto sold eBay"

Using your search results and expert knowledge of the sports card market, estimate what this card would realistically sell for on eBay today.
Do NOT apply fixed multiplier formulas. Use your judgment based on what you find and what you know about:
- This player's position, tier, and current demand
- The memorabilia type (caps/hat swatches are worth less than game-used patches/jerseys)
- The brand and set tier
- What collectors actually pay for rare cards at this player's level

Be realistic and conservative. Cite the comps or knowledge used in your notes.

Return ONLY this JSON:
{
  "avgPrice": <your best triangulated estimate for ${isRaw ? "raw/ungraded" : "this grade"}>,
  "minPrice": <conservative low estimate>,
  "maxPrice": <aggressive high estimate>,
  "notes": "<explain your triangulation: which parallel sold for how much, what multiplier you applied>"
}`;

  try {
    console.log(`[LowPop Fallback] Starting triangulation for: ${searchDesc}`);
    const startTime = Date.now();

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const elapsed = Date.now() - startTime;
    let responseText = response.text || "";
    console.log(`[LowPop Fallback] Response in ${elapsed}ms (${responseText.length} chars)`);

    responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.avgPrice && typeof parsed.avgPrice === "number" && parsed.avgPrice > 0) {
        console.log(`[LowPop Fallback] Triangulated: $${parsed.avgPrice} (range $${parsed.minPrice}-$${parsed.maxPrice}) | ${parsed.notes?.substring(0, 100)}`);
        return {
          avgPrice: parsed.avgPrice,
          minPrice: parsed.minPrice || parsed.avgPrice * 0.7,
          maxPrice: parsed.maxPrice || parsed.avgPrice * 1.5,
          notes: parsed.notes || "Triangulated from parallel comps",
        };
      }
    }
    console.warn(`[LowPop Fallback] Could not parse valid price from response`);
    return null;
  } catch (error: any) {
    console.error(`[LowPop Fallback] Error:`, error.message);
    return null;
  }
}

// ============================================================
// CROSS-PRODUCT FALLBACK PRICE — for cards with no direct eBay comps
// Searches comparable players / products to find a realistic floor price
// ============================================================
export async function fetchCrossProductFallbackPrice(card: {
  playerName: string;
  year?: string | number;
  set?: string;
  variation?: string;
  grade?: string;
  grader?: string;
  sport?: string;
}): Promise<{ avgPrice: number; minPrice: number; maxPrice: number; notes: string } | null> {
  const player = card.playerName;
  const year = card.year ? String(card.year) : "";
  const set = card.set || "";
  const variation = card.variation || "";
  const sport = card.sport || "football";
  const isRaw = !card.grade || card.grade.toLowerCase() === "raw" || (card.grader && card.grader.toLowerCase() === "raw");
  const isAuto = /auto(graph)?/i.test(variation) || /auto(graph)?/i.test(set);
  const serialMatch = variation.match(/\/\s*(\d+)\b/);
  const serialNumber = serialMatch ? parseInt(serialMatch[1]) : null;

  const gradeLabel = isRaw ? "raw/ungraded" : `${card.grader || ""} ${card.grade || ""}`.trim();
  const cardTypeLabel = isAuto ? "autograph" : "card";
  const serialLabel = serialNumber ? `numbered /${serialNumber}` : "unnumbered";
  const cardDesc = `${year} ${set} ${player} ${variation} ${gradeLabel}`.trim();

  // Build serial number context for premium
  let serialPremium = "";
  if (serialNumber) {
    if (serialNumber <= 10) serialPremium = "This is a VERY rare low-numbered parallel. Apply a significant premium (5-15x) over the base auto price.";
    else if (serialNumber <= 25) serialPremium = "This is a rare low-numbered parallel. Apply a premium (3-6x) over the base auto price.";
    else if (serialNumber <= 50) serialPremium = "This is a numbered parallel /50. Apply a premium (2-4x) over the base auto price.";
    else if (serialNumber <= 99) serialPremium = "This is a numbered parallel /99. Apply a premium (1.5-2.5x) over the base auto price.";
    else if (serialNumber <= 299) serialPremium = "This is a numbered parallel /299. Apply a modest premium (1.2-1.8x) over the base auto price.";
    else serialPremium = "This is a numbered parallel but highly numbered. Price similarly to a base auto.";
  }

  const prompt = `You are a sports card pricing expert. I need a realistic market value estimate for a ${sport} card:

CARD: "${cardDesc}"
Card Type: ${serialLabel} ${cardTypeLabel}

This card has NO direct eBay sold comps available yet. You need to estimate its value using cross-product comparables. Here is exactly how to do it:

STEP 1 — Find this PLAYER'S comparable cards in any product:
- Search: "${player} ${year} ${sport} card sold eBay"
- Search: "${player} ${year} rookie auto sold eBay"
- Search: "${player} ${year} autograph sold eBay"
- Search: "${player} ${year} Donruss auto sold eBay"
- Search: "${player} ${year} Illusions auto sold eBay"  
- Search: "${player} ${year} Select auto sold eBay"
- Search: "${player} ${year} Prizm auto sold eBay"
- Search: "${player} ${year} Chronicles auto sold eBay"

STEP 2 — If the player has no sales yet, find COMPARABLE PLAYERS at the same tier:
- Search for rookies drafted in the same round, same position, same year
- Search for rookies with similar hype/draft stock from ${year} ${sport}
- Look at what their comparable autos sell for (Donruss, Illusions, Score, Chronicles)
${serialPremium ? `\nSTEP 3 — APPLY SERIAL NUMBER PREMIUM:\n${serialPremium}\n` : ""}
IMPORTANT RULES:
- NEVER return 0 or null for avgPrice. A thoughtful estimate is always required.
- If the player is a rookie, search specifically for ${year} rookie autos in budget-to-mid products
- Return the REALISTIC current market value, not the ceiling potential
- For ${sport} rookies in products like Donruss, Score, Chronicles, Illusions: base autos typically range $5-$30 depending on player tier; premium numbered parallels go higher

Return ONLY this JSON:
{
  "avgPrice": <best realistic estimate in dollars>,
  "minPrice": <conservative low end>,
  "maxPrice": <aggressive high end>,
  "notes": "<explain: which comps or comparable players you found, what they sell for, how you arrived at this estimate>"
}`;

  try {
    console.log(`[CrossProduct Fallback] Estimating price for: ${cardDesc}`);
    const startTime = Date.now();

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const elapsed = Date.now() - startTime;
    let responseText = response.text || "";
    console.log(`[CrossProduct Fallback] Response in ${elapsed}ms (${responseText.length} chars)`);

    responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.avgPrice && typeof parsed.avgPrice === "number" && parsed.avgPrice > 0) {
        console.log(`[CrossProduct Fallback] Estimate: $${parsed.avgPrice} (range $${parsed.minPrice}-$${parsed.maxPrice}) | ${(parsed.notes || "").substring(0, 120)}`);
        return {
          avgPrice: parsed.avgPrice,
          minPrice: parsed.minPrice || Math.round(parsed.avgPrice * 0.6),
          maxPrice: parsed.maxPrice || Math.round(parsed.avgPrice * 1.8),
          notes: parsed.notes || "Estimated from comparable player/product comps",
        };
      }
    }
    console.warn(`[CrossProduct Fallback] Could not parse valid price from response`);
    return null;
  } catch (error: any) {
    console.error(`[CrossProduct Fallback] Error:`, error.message);
    return null;
  }
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
  hasAnySales?: boolean;
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
    const isAutoTrend = /auto(graph)?/i.test(params.variation || "") || /auto(graph)?/i.test(params.setName || "") || /auto(graph)?/i.test(params.playerName || "");
    const autoTrendNote = isAutoTrend && params.setName
      ? `\nAUTOGRAPH CARD — PRODUCT-SPECIFIC PRICING: This is an autograph from "${params.setName}". Autograph values vary enormously by product line. A Mosaic auto ($20-$500) is NOT a National Treasures auto ($500-$10,000+). ONLY report prices for autos from "${params.setName}" — include the set name in your searches.`
      : "";
    const researchPrompt = `Search eBay for recent sold listings of this sports card and tell me what prices it has been selling for:

${searchDescription}${isRawTrend ? " raw" : ""}
${rawTrendNote}
${autoTrendNote}

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

    const totalSalesCount = rawPoints.reduce((sum: number, p: MonthlyPricePoint) => sum + (p.salesCount || 0), 0);
    const hasAnySales = totalSalesCount > 0;
    if (!hasAnySales) {
      console.log(`[MonthlyPrice] WARNING: All ${rawPoints.length} data points have 0 sales — prices are estimated/hallucinated`);
      computedConfidence = "LOW";
    }

    const result: MonthlyPriceHistory = {
      playerName: params.playerName,
      sport: params.sport,
      cardDescription: searchDescription,
      dataPoints: filledPoints,
      confidence: computedConfidence as "HIGH" | "MEDIUM" | "LOW",
      notes: parsed.notes || (!hasAnySales ? "No actual sales data found — prices are estimates only." : (realDataMonths < 6 ? `Based on ${realDataMonths} months of data with interpolation.` : "")),
      hasAnySales,
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
