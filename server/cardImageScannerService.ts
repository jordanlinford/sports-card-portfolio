import { GoogleGenAI } from "@google/genai";
import * as ebayComps from "./ebayCompsService";
import { fetchGeminiMarketData } from "./outlookEngine";
import { getPlayerDemandContext, buildDemandAdjustedMultiplierPrompt, applyCeilingCheck } from "./demandTierEngine";
import type { EbayComp } from "@shared/schema";

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export interface CardScanResult {
  success: boolean;
  confidence: "high" | "medium" | "low";
  cardIdentification: {
    playerName: string;
    year: number | null;
    setName: string;
    cardNumber: string | null;
    variation: string | null;
    parallel: string | null;
    isRookie: boolean;
    sport: "football" | "basketball" | "baseball" | "hockey" | "soccer" | "unknown";
  };
  gradeEstimate: {
    appearsToBe: "graded" | "raw";
    gradingCompany: string | null;
    grade: string | null;
    conditionNotes: string | null;
  };
  marketContext: {
    rarity: "common" | "uncommon" | "rare" | "super-rare" | "unknown";
    desirability: "high" | "medium" | "low";
    collectibilityNotes: string;
  };
  rawAnalysis: string;
  error?: string;
}

const CARD_SCAN_PROMPT = `You are an expert sports card identifier. Use your knowledge and web search to identify this card with maximum accuracy.

CRITICAL: Look at the PHYSICAL CARD carefully:
- Read ALL text on the card (player name, team, set logos, card number, serial numbering)
- Examine the BORDER COLOR and PATTERN to determine the exact parallel (Gold borders = Gold Prizm, Silver shimmer = Silver Prizm, Rainbow = Hyper Prizm, etc.)
- Check for "RC" or "Rookie" logos
- Look at the BACK of the card if visible for set name, card number, and serial numbering
- Use web search to cross-reference what you see with actual card checklists and eBay listings

PARALLEL IDENTIFICATION GUIDE (look at border color/pattern):
- Prizm parallels: Base (no color), Silver (silver shimmer), Red (/299), Blue (/199), Green, Pink, Orange (/49), Gold (/10), Black (/1), Gold Vinyl (/5), Mojo, Hyper, Camo, Snakeskin, Disco, Tiger, Marble, Nebula, Cosmic
- Topps Chrome parallels: Base, Refractor, Pink Refractor, Gold Refractor, Superfractor (Chrome Superfractors are /1, but other sets like Stadium Club label their top parallels "Superfractor" with different print runs — always read the actual stamp)
- Donruss parallels: Base, Rated Rookie, Press Proof, Holo, Elite Series
- Select parallels: Base, Silver, Concourse, Premier Level, Tie-Dye, Zebra, Disco, Gold (/10)

CHROME/REFLECTIVE INSERT IDENTIFICATION — CRITICAL:
Many insert subsets are INHERENTLY chrome/reflective/shiny by design. Their BASE version already looks like a refractor or Silver Prizm. Do NOT assume "Silver Prizm" just because the card is shiny/reflective. Examples of inherently chrome/reflective inserts:
- Prizm inserts: Deep Space, Warp Speed, Interstellar, Instant Impact, Fireworks, Emergent, Sensational — these are ALL chrome/shiny in their BASE form
- Topps Finest: ALL cards are chrome by default. The base version is already shiny.
- Topps Chrome: ALL cards are chrome by default.
- Select: Concourse/Premier Level/Club Level base cards are already chrome
For these cards, the variation should be the INSERT NAME ONLY (e.g., "Deep Space", "Warp Speed") — NOT "Deep Space Silver Prizm" unless you can confirm a SEPARATE Silver Prizm parallel exists for that insert AND you see clear visual differences from the base insert (different border treatment, additional refractor pattern on top of the existing chrome design).
When in doubt, label it as the base insert (e.g., "Deep Space") rather than adding "Silver Prizm" — the base version is FAR more common and adding "Silver Prizm" creates a massive pricing error.

SERIAL NUMBER RULE — CRITICAL:
The physical stamp printed ON THE CARD (e.g., "377/350", "23/50", "1/1") is ALWAYS authoritative. NEVER infer or assume a print run from the variation label alone. "Superfractor" does not always mean 1/1 — it means the top parallel of that product, which may be /25, /50, /99, etc. depending on the set. Read the stamped number from the physical card (usually on the back) and use it EXACTLY. If you can see it stamped, that number wins over any assumption.

SSP / SHORT PRINT CLASSIFICATION — CRITICAL:
NEVER label a card as "SSP", "SP", "Short Print", or "Super Short Print" in the variation field unless you have SPECIFIC PHYSICAL EVIDENCE on the card itself (e.g., a different card number sequence, a stamped notation, or a confirmed short-print code visible on the card).
- Insert subsets (All Aces, Deep Space, Warp Speed, Downtown, Kaboom, etc.) are NOT SSPs just because they are inserts. They are inserts with their own print runs — label them by their insert name only (e.g., "Base" for the base version of an insert).
- Being an insert card does NOT make it a Short Print. Most inserts are seeded at known ratios and are NOT short-printed.
- Only use "SSP" or "SP" when you can CONFIRM it from a checklist, physical card marking, or verified database — NOT from assumption.
- If the card is the standard base version of an insert subset, the variation is "Base" — period.

VINTAGE & SUBSET IDENTIFICATION — CRITICAL:
For vintage cards (pre-2000), the same brand (Fleer, Topps, Donruss, etc.) released MULTIPLE different sets and subsets each year. You MUST read ALL text and logos on the card to identify the EXACT product:
- "ALL STAR TEAM", "ALL STAR", "STICKER" = a subset/insert, NOT the base set. Example: "Fleer All Star Team" is a SEPARATE product from "Fleer" base.
- Different years of the same brand have COMPLETELY different card numbers. DO NOT assume a card number — read it from the card or verify via web search.
- NEVER default to the most famous/valuable version of a player's card. Example: NOT every Michael Jordan Fleer card is the 1986 Fleer #57 rookie — Fleer made Jordan cards from 1986 through the 1990s across base sets, All Star Team inserts, and other subsets.
- If you see a subset name or logo (e.g., "ALL STAR TEAM", "LEAGUE LEADER", "RECORD BREAKER", "HIGHLIGHTS"), include it in the setName (e.g., "Fleer All Star Team").
- Cross-reference the card design, border style, and any visible year/copyright text to determine the EXACT year. The 1986 Fleer set looks DIFFERENT from 1987, 1988, 1989, etc.

Return a JSON object with EXACTLY this structure (no markdown, just pure JSON):
{
  "confidence": "high" | "medium" | "low",
  "playerName": "Full player name exactly as printed on card",
  "year": 2025,
  "setName": "Exact product name (e.g., 'Prizm', 'Prizm Draft Picks', 'Select', 'Donruss', 'Topps Chrome')",
  "cardNumber": "Card number if visible (e.g., '123')",
  "variation": "The EXACT parallel/variation name matching how it's listed on eBay (e.g., 'Gold Prizm /10', 'Silver Prizm', 'Hyper Prizm', 'Red White Blue', 'Downtown'). Include serial numbering if visible (e.g., '/10', '/25', '/50'). Use 'Base' for no parallel.",
  "isRookie": true or false,
  "sport": "football" | "basketball" | "baseball" | "hockey" | "soccer",
  "appearsToBe": "graded" | "raw",
  "gradingCompany": "PSA" | "BGS" | "SGC" | "CGC" | null,
  "grade": "10" | "9.5" | "9" | etc or null,
  "conditionNotes": "Notes about visible condition if raw",
  "rarity": "common" | "uncommon" | "rare" | "super-rare",
  "desirability": "high" | "medium" | "low",
  "collectibilityNotes": "Brief notes about collectibility",
  "analysis": "2-3 sentence summary of what you identified"
}

IMPORTANT:
- The "variation" field should contain the COMPLETE parallel name as a collector would search it on eBay. Do NOT split parallel info between variation and a separate field.
- For Prizm cards: ALWAYS identify the exact parallel by border color. A gold-bordered Prizm is "Gold Prizm /10", not just "Gold".
- If you see serial numbering (like "5/10" or "23/99"), include it in the variation field.
- Search the web to verify the exact set name and year — newer products (2024, 2025) may not be in training data.
- YEAR VERIFICATION: Use the card number and web search to confirm the year. The same player can appear in the SAME insert set across multiple years with DIFFERENT card numbers and DIFFERENT values. Example: Wembanyama Deep Space is #1 in 2023-24 Prizm but #2 in 2024-25 Prizm. Getting the year wrong leads to wildly incorrect pricing. Cross-reference the card number you read with online checklists to confirm the correct year.`;

async function processImageData(imageData: string, mimeType: string): Promise<{ base64Data: string; actualMimeType: string }> {
  const isBase64 = imageData.startsWith("data:") || !imageData.startsWith("http");
  let base64Data: string;
  let actualMimeType: string = mimeType;

  if (imageData.startsWith("data:")) {
    const matches = imageData.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
      actualMimeType = matches[1];
      base64Data = matches[2];
    } else {
      throw new Error("Invalid data URL format");
    }
  } else if (isBase64) {
    base64Data = imageData;
  } else {
    const response = await fetch(imageData);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    base64Data = Buffer.from(arrayBuffer).toString("base64");
    actualMimeType = response.headers.get("content-type") || mimeType;
  }
  return { base64Data, actualMimeType };
}

export async function scanCardImage(
  imageData: string,
  mimeType: string = "image/jpeg",
  imageDataBack?: string,
  mimeTypeBack: string = "image/jpeg"
): Promise<CardScanResult> {
  try {
    const { base64Data, actualMimeType } = await processImageData(imageData, mimeType);

    // Build parts array — front image always first, back image optional second
    const imageParts: any[] = [
      { inlineData: { mimeType: actualMimeType, data: base64Data } },
    ];

    if (imageDataBack) {
      try {
        const { base64Data: base64Back, actualMimeType: mimeBack } = await processImageData(imageDataBack, mimeTypeBack);
        imageParts.push({ inlineData: { mimeType: mimeBack, data: base64Back } });
        console.log("[CardScanner] Back-of-card image included in scan");
      } catch (backErr) {
        console.warn("[CardScanner] Failed to process back image, scanning front only:", backErr);
      }
    }

    // Update prompt when both sides are provided — tells Gemini to use the back for exact numbers
    const hasBackImage = imageParts.length > 1;
    const promptText = hasBackImage
      ? `IMAGE 1 is the FRONT of the card. IMAGE 2 is the BACK of the card.\n\nThe back of the card contains the most reliable identification data: exact card number, PHYSICAL SERIAL NUMBER STAMP (e.g. "23/50", "377/350", "1/1"), set name, copyright year, and player stats.\n\nCRITICAL SERIAL NUMBER RULE: Read the ACTUAL stamped number visible on IMAGE 2. This stamped number is ALWAYS correct — do not override it with assumptions about the variation name. For example, if IMAGE 2 shows a stamp of "23/50", the variation is "/50" regardless of whether the variation label says "Superfractor", "Gold", or anything else. The physical stamp wins every time.\n\nPrioritize information from IMAGE 2 for card number, serial number, year, and set name. Use IMAGE 1 for player name, parallel/border color identification, and condition.\n\n${CARD_SCAN_PROMPT}`
      : CARD_SCAN_PROMPT;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            ...imageParts,
            { text: promptText },
          ],
        },
      ],
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[CardScanner] No JSON found in response:", text);
      return {
        success: false,
        confidence: "low",
        cardIdentification: {
          playerName: "Unknown",
          year: null,
          setName: "Unknown",
          cardNumber: null,
          variation: null,
          parallel: null,
          isRookie: false,
          sport: "unknown",
        },
        gradeEstimate: {
          appearsToBe: "raw",
          gradingCompany: null,
          grade: null,
          conditionNotes: null,
        },
        marketContext: {
          rarity: "unknown",
          desirability: "low",
          collectibilityNotes: "Unable to identify card",
        },
        rawAnalysis: text,
        error: "Could not parse card identification from image",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    let variation = parsed.variation || null;
    let parallel = parsed.parallel || null;
    if (parallel && (!variation || variation.toLowerCase() === "base")) {
      variation = parallel;
    } else if (parallel && variation && !variation.toLowerCase().includes(parallel.toLowerCase())) {
      variation = `${variation} ${parallel}`.trim();
    }
    
    const hasSerialNumber = /\/\d+/.test(variation || "") || (parsed.cardNumber && /\/\d+/.test(parsed.cardNumber));
    const falseSpLabels = /\b(super\s*short\s*print|short\s*print|ssp|sp)\b/i;
    
    function sanitizeSpLabel(value: string | null, fieldName: string): string | null {
      if (!value) return value;
      if (falseSpLabels.test(value.toLowerCase()) && !hasSerialNumber) {
        const cleaned = value.replace(falseSpLabels, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/^[\s\-,]+|[\s\-,]+$/g, "").trim();
        const result = (!cleaned || cleaned.toLowerCase() === "base") ? "Base" : cleaned;
        console.log(`[CardScanner] Stripped false SP/SSP label from ${fieldName}. Original: "${value}", Cleaned: "${result}"`);
        return result;
      }
      return value;
    }
    
    variation = sanitizeSpLabel(variation, "variation");
    parallel = sanitizeSpLabel(parallel, "parallel");
    if (parallel === "Base") parallel = null;
    
    return {
      success: true,
      confidence: parsed.confidence || "medium",
      cardIdentification: {
        playerName: parsed.playerName || "Unknown",
        year: parsed.year || null,
        setName: parsed.setName || "Unknown",
        cardNumber: parsed.cardNumber || null,
        variation,
        parallel,
        isRookie: parsed.isRookie || false,
        sport: parsed.sport || "unknown",
      },
      gradeEstimate: {
        appearsToBe: parsed.appearsToBe || "raw",
        gradingCompany: parsed.gradingCompany || null,
        grade: parsed.grade || null,
        conditionNotes: parsed.conditionNotes || null,
      },
      marketContext: {
        rarity: parsed.rarity || "unknown",
        desirability: parsed.desirability || "medium",
        collectibilityNotes: parsed.collectibilityNotes || "",
      },
      rawAnalysis: parsed.analysis || "",
    };
  } catch (error) {
    console.error("[CardScanner] Error scanning card image:", error);
    return {
      success: false,
      confidence: "low",
      cardIdentification: {
        playerName: "Unknown",
        year: null,
        setName: "Unknown",
        cardNumber: null,
        variation: null,
        parallel: null,
        isRookie: false,
        sport: "unknown",
      },
      gradeEstimate: {
        appearsToBe: "raw",
        gradingCompany: null,
        grade: null,
        conditionNotes: null,
      },
      marketContext: {
        rarity: "unknown",
        desirability: "low",
        collectibilityNotes: "",
      },
      rawAnalysis: "",
      error: error instanceof Error ? error.message : "Unknown error scanning card",
    };
  }
}

export function buildSearchQueryFromScan(scan: CardScanResult): string {
  const parts: string[] = [];
  
  if (scan.cardIdentification.year) {
    parts.push(String(scan.cardIdentification.year));
  }
  
  if (scan.cardIdentification.setName && scan.cardIdentification.setName !== "Unknown") {
    parts.push(scan.cardIdentification.setName);
  }
  
  if (scan.cardIdentification.playerName && scan.cardIdentification.playerName !== "Unknown") {
    parts.push(scan.cardIdentification.playerName);
  }
  
  if (scan.cardIdentification.parallel) {
    parts.push(scan.cardIdentification.parallel);
  } else if (scan.cardIdentification.variation && scan.cardIdentification.variation !== "Base") {
    parts.push(scan.cardIdentification.variation);
  }
  
  if (scan.cardIdentification.cardNumber) {
    parts.push(`#${scan.cardIdentification.cardNumber}`);
  }
  
  if (scan.gradeEstimate.appearsToBe === "graded" && scan.gradeEstimate.gradingCompany && scan.gradeEstimate.grade) {
    parts.push(`${scan.gradeEstimate.gradingCompany} ${scan.gradeEstimate.grade}`);
  }
  
  return parts.join(" ");
}

// AI-based price estimate by condition
export interface ConditionPriceEstimate {
  condition: string;
  minPrice: number;
  maxPrice: number;
}

export interface AIPriceEstimate {
  available: boolean;
  estimates: ConditionPriceEstimate[];
  marketNotes: string;
  confidence: "high" | "medium" | "low";
}

const PRICE_ESTIMATE_PROMPT = `You are an expert sports card appraiser. Search for CURRENT market prices and recent eBay sold listings for this EXACT card.

Card Details:
{CARD_DETAILS}

CRITICAL INSTRUCTIONS:
1. You MUST use Google Search to find actual recent sold prices on eBay for this EXACT card
2. Search for the SPECIFIC variation/parallel — do NOT confuse a numbered parallel with a base card
3. Try multiple search queries to find the best data:
   - "[player name] [year] [set name] [variation] sold eBay"
   - "[player name] [variation] [set name] /[numbering]"  
   - "[player name] [set name] gold /10" (for numbered cards)
4. For NUMBERED parallels (/10, /25, /50, /99): These are significantly more valuable than base cards. A Gold Prizm /10 of a top rookie can sell for $500-$5000+. Do NOT price them like base cards.
5. For ROOKIE CARDS of current NFL/NBA draft picks: These are typically at PEAK demand. Recent sold prices will reflect high market interest.
6. Report what the market is ACTUALLY paying based on recent sold data — do not discount or deflate. If recent solds show $500-$800, report that range, not a conservative $200.

Return a JSON object with this structure (no markdown, just pure JSON):
{
  "estimates": [
    {"condition": "Raw (Ungraded)", "minPrice": <actual_number>, "maxPrice": <actual_number>},
    {"condition": "PSA 8 (Near Mint-Mint)", "minPrice": <actual_number>, "maxPrice": <actual_number>},
    {"condition": "PSA 9 (Mint)", "minPrice": <actual_number>, "maxPrice": <actual_number>},
    {"condition": "PSA 10 (Gem Mint)", "minPrice": <actual_number>, "maxPrice": <actual_number>}
  ],
  "marketNotes": "Cite specific sold listings you found with dates and prices",
  "confidence": "high" | "medium" | "low"
}

ACCURACY IS MORE IMPORTANT THAN CAUTION. Report actual market prices. If you find sold listings at $500-$800, do NOT report $200 to "be safe". Users need accurate data to make investment decisions.`;

async function getGeminiPriceEstimate(scan: CardScanResult): Promise<AIPriceEstimate> {
  try {
    const cardDetails = [
      `Player: ${scan.cardIdentification.playerName}`,
      `Year: ${scan.cardIdentification.year || "Unknown"}`,
      `Set: ${scan.cardIdentification.setName}`,
      `Sport: ${scan.cardIdentification.sport}`,
      scan.cardIdentification.cardNumber ? `Card #: ${scan.cardIdentification.cardNumber}` : null,
      scan.cardIdentification.variation ? `Variation: ${scan.cardIdentification.variation}` : null,
      scan.cardIdentification.parallel ? `Parallel: ${scan.cardIdentification.parallel}` : null,
      scan.cardIdentification.isRookie ? "Rookie Card: Yes" : null,
      `Rarity: ${scan.marketContext.rarity}`,
    ].filter(Boolean).join("\n");

    const prompt = PRICE_ESTIMATE_PROMPT.replace("{CARD_DETAILS}", cardDetails);

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error("[CardScanner] No JSON found in price estimate response");
      return { available: false, estimates: [], marketNotes: "Unable to estimate pricing", confidence: "low" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate estimates array
    const rawEstimates = parsed.estimates;
    if (!Array.isArray(rawEstimates) || rawEstimates.length === 0) {
      console.error("[CardScanner] No valid estimates in Gemini response");
      return { available: false, estimates: [], marketNotes: "Unable to estimate pricing", confidence: "low" };
    }
    
    // Validate and clean each estimate
    const validEstimates: ConditionPriceEstimate[] = [];
    for (const est of rawEstimates) {
      if (
        typeof est.condition === "string" &&
        est.condition.trim().length > 0 &&
        typeof est.minPrice === "number" &&
        typeof est.maxPrice === "number" &&
        est.minPrice >= 0 &&
        est.maxPrice >= est.minPrice
      ) {
        validEstimates.push({
          condition: est.condition.trim(),
          minPrice: Math.round(est.minPrice * 100) / 100,
          maxPrice: Math.round(est.maxPrice * 100) / 100,
        });
      }
    }
    
    if (validEstimates.length === 0) {
      console.error("[CardScanner] All estimates failed validation");
      return { available: false, estimates: [], marketNotes: "Unable to estimate pricing", confidence: "low" };
    }
    
    console.log(`[CardScanner] Gemini returned ${validEstimates.length} valid price estimates`);
    
    return {
      available: true,
      estimates: validEstimates,
      marketNotes: typeof parsed.marketNotes === "string" ? parsed.marketNotes : "",
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
    };
  } catch (error) {
    console.error("[CardScanner] Error getting Gemini price estimate:", error);
    return { available: false, estimates: [], marketNotes: "Unable to estimate pricing", confidence: "low" };
  }
}

export interface CardScanWithPricingResult {
  scan: CardScanResult;
  searchQuery: string;
  pricing: {
    available: boolean;
    isFetching: boolean;
    isAIEstimate: boolean;
    soldCount: number;
    medianPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    trendSlope: number | null;
    volatility: number | null;
    liquidity: number | null;
    recentSales: Array<{
      title: string;
      price: number;
      soldDate: string | null;
      url: string;
    }>;
    priceRange: string;
    marketAssessment: string;
    aiEstimate?: AIPriceEstimate;
  };
  queryHash: string;
}

export async function scanCardWithPricing(
  imageData: string,
  mimeType: string = "image/jpeg"
): Promise<CardScanWithPricingResult> {
  const scan = await scanCardImage(imageData, mimeType);
  
  if (!scan.success) {
    return {
      scan,
      searchQuery: "",
      pricing: {
        available: false,
        isFetching: false,
        isAIEstimate: false,
        soldCount: 0,
        medianPrice: null,
        minPrice: null,
        maxPrice: null,
        trendSlope: null,
        volatility: null,
        liquidity: null,
        recentSales: [],
        priceRange: "Unable to determine",
        marketAssessment: "Card could not be identified",
      },
      queryHash: "",
    };
  }
  
  const searchQuery = buildSearchQueryFromScan(scan);
  
  if (!searchQuery || searchQuery.trim().length < 5) {
    // Not enough details for eBay search, try Gemini directly
    console.log("[CardScanner] Insufficient query details, using AI estimate");
    const aiEstimate = await getGeminiPriceEstimate(scan);
    
    if (aiEstimate.available && aiEstimate.estimates.length > 0) {
      const rawEstimate = aiEstimate.estimates.find(e => e.condition.toLowerCase().includes("raw"));
      const priceRange = rawEstimate 
        ? `$${rawEstimate.minPrice} - $${rawEstimate.maxPrice}`
        : `$${aiEstimate.estimates[0].minPrice} - $${aiEstimate.estimates[0].maxPrice}`;
      
      return {
        scan,
        searchQuery,
        pricing: {
          available: true,
          isFetching: false,
          isAIEstimate: true,
          soldCount: 0,
          medianPrice: rawEstimate ? (rawEstimate.minPrice + rawEstimate.maxPrice) / 2 : null,
          minPrice: rawEstimate?.minPrice || null,
          maxPrice: rawEstimate?.maxPrice || null,
          trendSlope: null,
          volatility: null,
          liquidity: null,
          recentSales: [],
          priceRange,
          marketAssessment: aiEstimate.marketNotes || "AI-powered estimate based on market knowledge",
          aiEstimate,
        },
        queryHash: "",
      };
    }
    
    return {
      scan,
      searchQuery,
      pricing: {
        available: false,
        isFetching: false,
        isAIEstimate: false,
        soldCount: 0,
        medianPrice: null,
        minPrice: null,
        maxPrice: null,
        trendSlope: null,
        volatility: null,
        liquidity: null,
        recentSales: [],
        priceRange: "Unable to determine",
        marketAssessment: "Not enough card details identified to search market",
      },
      queryHash: "",
    };
  }
  
  console.log(`[CardScanner] Built search query: "${searchQuery}"`);
  
  const normalized = ebayComps.normalizeEbayQuery(searchQuery);
  
  // Try Gemini with Google Search grounding first (primary source)
  console.log("[CardScanner] Fetching market data via Gemini grounded search");
  
  const scanVariation = scan.cardIdentification.variation || scan.cardIdentification.parallel;
  const scanIsLowPop = scanVariation ? /\/\s*\d{1,2}\b/.test(scanVariation) : false;
  let scanDemandContext: Awaited<ReturnType<typeof getPlayerDemandContext>> | null = null;
  let scanDemandTierPrompt: string | undefined;
  if (scanIsLowPop && scan.cardIdentification.playerName) {
    try {
      scanDemandContext = await getPlayerDemandContext(
        scan.cardIdentification.playerName,
        scan.cardIdentification.sport || "football"
      );
      if (scanDemandContext) {
        scanDemandTierPrompt = buildDemandAdjustedMultiplierPrompt(scanDemandContext);
        console.log(`[CardScanner] Demand tier: ${scanDemandContext.tierLabel} (Tier ${scanDemandContext.tier})`);
      }
    } catch (tierErr) {
      console.warn("[CardScanner] Demand tier lookup failed:", tierErr);
    }
  }

  try {
    const geminiData = await fetchGeminiMarketData({
      title: searchQuery,
      playerName: scan.cardIdentification.playerName,
      year: scan.cardIdentification.year,
      set: scan.cardIdentification.setName,
      variation: scanVariation,
      grade: scan.gradeEstimate.grade,
      grader: scan.gradeEstimate.gradingCompany,
    }, scanDemandTierPrompt ? { demandTierPrompt: scanDemandTierPrompt } : undefined);
    
    if (geminiData && geminiData.avgPrice > 0) {
      console.log(`[CardScanner] Gemini found ${geminiData.soldCount} sales, avg $${geminiData.avgPrice}`);
      
      const priceRange = geminiData.minPrice && geminiData.maxPrice
        ? `$${geminiData.minPrice.toFixed(2)} - $${geminiData.maxPrice.toFixed(2)}`
        : `~$${geminiData.avgPrice.toFixed(2)}`;
      
      let marketAssessment = "";
      if (geminiData.soldCount >= 25) {
        marketAssessment = "Strong market activity - prices are well established";
      } else if (geminiData.soldCount >= 10) {
        marketAssessment = "Good market activity - solid price reference";
      } else if (geminiData.soldCount >= 5) {
        marketAssessment = "Moderate market activity - decent price reference";
      } else if (geminiData.soldCount >= 1) {
        marketAssessment = "Limited sales data - prices may vary";
      } else {
        marketAssessment = "No recent sales found";
      }
      
      // Map soldCount to liquidity score (consistent with outlookEngine)
      let liquidityScore: number;
      if (geminiData.soldCount >= 25) {
        liquidityScore = 10;
      } else if (geminiData.soldCount >= 15) {
        liquidityScore = 8;
      } else if (geminiData.soldCount >= 10) {
        liquidityScore = 7;
      } else if (geminiData.soldCount >= 5) {
        liquidityScore = 5;
      } else if (geminiData.soldCount >= 2) {
        liquidityScore = 3;
      } else {
        liquidityScore = 1;
      }
      
      let finalPrice = geminiData.avgPrice;
      let finalMin = geminiData.minPrice;
      let finalMax = geminiData.maxPrice;
      let scanCeilingApplied = false;
      let scanCeilingReason = "";
      if (scanDemandContext && scanDemandContext.tier >= 3 && geminiData.soldCount === 0 && finalPrice > 0) {
        const baseCompAnchor = geminiData.minPrice && geminiData.minPrice > 0
          ? geminiData.minPrice
          : finalPrice * 0.5;
        const ceilingResult = applyCeilingCheck(finalPrice, baseCompAnchor, scanDemandContext.tier, geminiData.soldCount);
        if (ceilingResult.wasCapped) {
          console.warn(`[CardScanner] DEMAND CEILING: ${ceilingResult.capReason}. Was $${finalPrice}, anchor $${baseCompAnchor.toFixed(2)}, now $${ceilingResult.price}`);
          finalPrice = ceilingResult.price;
          finalMin = Math.round(finalPrice * 0.6);
          finalMax = Math.round(finalPrice * 1.5);
          scanCeilingApplied = true;
          scanCeilingReason = ceilingResult.capReason || "";
        }
      }

      const finalPriceRange = finalMin && finalMax
        ? `$${finalMin.toFixed(2)} - $${finalMax.toFixed(2)}`
        : `~$${finalPrice.toFixed(2)}`;

      return {
        scan,
        searchQuery: normalized.canonicalQuery,
        pricing: {
          available: true,
          isFetching: false,
          isAIEstimate: false,
          soldCount: geminiData.soldCount,
          medianPrice: finalPrice,
          minPrice: finalMin,
          maxPrice: finalMax,
          trendSlope: null,
          volatility: null,
          liquidity: liquidityScore,
          recentSales: [],
          priceRange: finalPriceRange,
          marketAssessment,
        },
        queryHash: normalized.queryHash,
        demandTierResult: scanDemandContext ? {
          tier: scanDemandContext.tier,
          label: scanDemandContext.tierLabel,
          demandScore: scanDemandContext.demandScore,
          careerStage: scanDemandContext.careerStage,
          sport: scanDemandContext.sport,
          percentile: scanDemandContext.percentileInSport,
          triangulationUsed: scanIsLowPop && geminiData.soldCount === 0,
          ceilingApplied: scanCeilingApplied,
          ceilingReason: scanCeilingReason || undefined,
        } : null,
      };
    }
  } catch (error) {
    console.error("[CardScanner] Gemini market data failed:", error);
  }
  
  // Fallback to legacy eBay cache if Gemini fails or returns no results
  console.log("[CardScanner] Gemini returned no results, falling back to eBay cache");
  
  const swrResult = await ebayComps.getCachedCompsWithSWR(
    normalized.queryHash,
    normalized.canonicalQuery,
    normalized.filters
  );
  
  if (swrResult.data) {
    const compsJson = swrResult.data.compsJson as EbayComp[] | null;
    const soldCount = compsJson?.length || 0;
    const summary = swrResult.data.summaryJson;
    const medianPrice = summary?.medianPrice ?? null;
    const minPrice = summary?.minPrice ?? null;
    const maxPrice = summary?.maxPrice ?? null;
    
    if (soldCount > 0 && medianPrice) {
      const recentSales = (compsJson || [])
        .slice(0, 5)
        .map(comp => ({
          title: comp.title,
          price: comp.totalPrice,
          soldDate: comp.soldDate || null,
          url: comp.itemUrl || "",
        }));
      
      const priceRange = minPrice && maxPrice 
        ? `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`
        : medianPrice 
          ? `~$${medianPrice.toFixed(2)}`
          : "Limited data";
      
      let marketAssessment = "";
      if (soldCount >= 15) {
        marketAssessment = "Strong market activity - prices are well established";
      } else if (soldCount >= 6) {
        marketAssessment = "Moderate market activity - decent price reference";
      } else if (soldCount >= 1) {
        marketAssessment = "Limited sales data - prices may vary";
      }
      
      return {
        scan,
        searchQuery: normalized.canonicalQuery,
        pricing: {
          available: true,
          isFetching: swrResult.data.fetchStatus === "fetching",
          isAIEstimate: false,
          soldCount,
          medianPrice,
          minPrice,
          maxPrice,
          trendSlope: summary?.trendSlope ?? null,
          volatility: summary?.volatility ?? null,
          liquidity: summary?.liquidity ?? null,
          recentSales,
          priceRange,
          marketAssessment,
        },
        queryHash: normalized.queryHash,
      };
    }
  }
  
  // Fallback to AI estimate if both Gemini and eBay fail
  console.log("[CardScanner] No eBay cache, getting AI estimate");
  
  // Enqueue eBay fetch for future requests
  await ebayComps.enqueueFetchJob(
    normalized.canonicalQuery,
    normalized.queryHash,
    normalized.filters
  );
  
  const aiEstimate = await getGeminiPriceEstimate(scan);
  
  if (aiEstimate.available && aiEstimate.estimates.length > 0) {
    const rawEstimate = aiEstimate.estimates.find(e => e.condition.toLowerCase().includes("raw"));
    const priceRange = rawEstimate 
      ? `$${rawEstimate.minPrice} - $${rawEstimate.maxPrice}`
      : `$${aiEstimate.estimates[0].minPrice} - $${aiEstimate.estimates[0].maxPrice}`;
    
    return {
      scan,
      searchQuery: normalized.canonicalQuery,
      pricing: {
        available: true,
        isFetching: true,
        isAIEstimate: true,
        soldCount: 0,
        medianPrice: rawEstimate ? (rawEstimate.minPrice + rawEstimate.maxPrice) / 2 : null,
        minPrice: rawEstimate?.minPrice || null,
        maxPrice: rawEstimate?.maxPrice || null,
        trendSlope: null,
        volatility: null,
        liquidity: null,
        recentSales: [],
        priceRange,
        marketAssessment: aiEstimate.marketNotes || "AI-powered estimate based on market knowledge",
        aiEstimate,
      },
      queryHash: normalized.queryHash,
    };
  }
  
  return {
    scan,
    searchQuery: normalized.canonicalQuery,
    pricing: {
      available: false,
      isFetching: true,
      isAIEstimate: false,
      soldCount: 0,
      medianPrice: null,
      minPrice: null,
      maxPrice: null,
      trendSlope: null,
      volatility: null,
      liquidity: null,
      recentSales: [],
      priceRange: "Fetching...",
      marketAssessment: "Searching for market data...",
    },
    queryHash: normalized.queryHash,
  };
}
