import { GoogleGenAI } from "@google/genai";
import * as ebayComps from "./ebayCompsService";
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

const CARD_SCAN_PROMPT = `You are an expert sports card identifier and appraiser. Analyze this card image and provide detailed identification.

Return a JSON object with EXACTLY this structure (no markdown, just pure JSON):
{
  "confidence": "high" | "medium" | "low",
  "playerName": "Full player name",
  "year": 2023,
  "setName": "Full set name (e.g., 'Panini Prizm', 'Topps Chrome')",
  "cardNumber": "Card number if visible (e.g., '123', '12-SP')",
  "variation": "Variation name if any (e.g., 'Base', 'Silver', 'Photo Variation', 'SP')",
  "parallel": "Parallel name if any (e.g., 'Prizm Silver', 'Refractor', 'Gold /50')",
  "isRookie": true or false,
  "sport": "football" | "basketball" | "baseball" | "hockey" | "soccer",
  "appearsToBe": "graded" | "raw",
  "gradingCompany": "PSA" | "BGS" | "SGC" | "CGC" | null,
  "grade": "10" | "9.5" | "9" | etc or null,
  "conditionNotes": "Notes about visible condition if raw",
  "rarity": "common" | "uncommon" | "rare" | "super-rare",
  "desirability": "high" | "medium" | "low",
  "collectibilityNotes": "Brief notes about why collectors want this card",
  "analysis": "2-3 sentence summary of what you identified and key details"
}

Be specific about:
- Exact set name (Prizm vs Prizm Draft Picks vs Select, etc.)
- Parallel colors and numbering if visible
- SP/SSP/Photo variations
- Rookie designation
- Any serial numbering visible

If you cannot identify something with confidence, use null or "unknown".`;

export async function scanCardImage(imageData: string, mimeType: string = "image/jpeg"): Promise<CardScanResult> {
  try {
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
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString("base64");
      actualMimeType = response.headers.get("content-type") || mimeType;
    }

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: actualMimeType,
                data: base64Data,
              },
            },
            {
              text: CARD_SCAN_PROMPT,
            },
          ],
        },
      ],
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
    
    return {
      success: true,
      confidence: parsed.confidence || "medium",
      cardIdentification: {
        playerName: parsed.playerName || "Unknown",
        year: parsed.year || null,
        setName: parsed.setName || "Unknown",
        cardNumber: parsed.cardNumber || null,
        variation: parsed.variation || null,
        parallel: parsed.parallel || null,
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

const PRICE_ESTIMATE_PROMPT = `You are an expert sports card appraiser with deep knowledge of current market values. Based on the card details provided, estimate the current market value in USD.

Card Details:
{CARD_DETAILS}

Return a JSON object with EXACTLY this structure (no markdown, just pure JSON):
{
  "estimates": [
    {"condition": "Raw (Ungraded)", "minPrice": 10, "maxPrice": 25},
    {"condition": "PSA 8 (Near Mint-Mint)", "minPrice": 35, "maxPrice": 50},
    {"condition": "PSA 9 (Mint)", "minPrice": 70, "maxPrice": 100},
    {"condition": "PSA 10 (Gem Mint)", "minPrice": 400, "maxPrice": 600}
  ],
  "marketNotes": "Brief 1-2 sentence note about this card's market demand and collectibility",
  "confidence": "high" | "medium" | "low"
}

Consider:
- Player's career status and popularity
- Card year, set, and variation/parallel
- Rookie card premium if applicable
- Current market trends for this sport/era
- Rarity and print run if known

Provide realistic price ranges based on actual market conditions.`;

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
    
    // If eBay has data, use it
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
    
    // eBay cache exists but has 0 results - fall back to Gemini
    console.log("[CardScanner] eBay returned 0 results, falling back to AI estimate");
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
        queryHash: normalized.queryHash,
      };
    }
  }
  
  // No cached data - enqueue eBay fetch AND get immediate AI estimate
  console.log("[CardScanner] No cached eBay data, getting AI estimate while fetching");
  
  await ebayComps.enqueueFetchJob(
    normalized.canonicalQuery,
    normalized.queryHash,
    normalized.filters
  );
  
  // Get AI estimate to show immediately while eBay fetches in background
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
        isFetching: true, // Still fetching eBay in background
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
