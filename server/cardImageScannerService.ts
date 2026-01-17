import { GoogleGenAI } from "@google/genai";
import * as ebayComps from "./ebayCompsService";
import type { EbayComp } from "./ebayCompsService";

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

export interface CardScanWithPricingResult {
  scan: CardScanResult;
  searchQuery: string;
  pricing: {
    available: boolean;
    isFetching: boolean;
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
    return {
      scan,
      searchQuery,
      pricing: {
        available: false,
        isFetching: false,
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
    const medianPrice = swrResult.data.medianPrice;
    const minPrice = swrResult.data.minPrice;
    const maxPrice = swrResult.data.maxPrice;
    
    const recentSales = (compsJson || [])
      .slice(0, 5)
      .map(comp => ({
        title: comp.title,
        price: comp.totalPrice,
        soldDate: comp.soldDate || null,
        url: comp.url,
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
    } else {
      marketAssessment = "No recent sales found";
    }
    
    return {
      scan,
      searchQuery: normalized.canonicalQuery,
      pricing: {
        available: true,
        isFetching: swrResult.data.fetchStatus === "fetching",
        soldCount,
        medianPrice,
        minPrice,
        maxPrice,
        trendSlope: swrResult.data.trendSlope,
        volatility: swrResult.data.volatility,
        liquidity: swrResult.data.liquidity,
        recentSales,
        priceRange,
        marketAssessment,
      },
      queryHash: normalized.queryHash,
    };
  }
  
  await ebayComps.enqueueFetchJob(
    normalized.canonicalQuery,
    normalized.queryHash,
    normalized.filters
  );
  
  return {
    scan,
    searchQuery: normalized.canonicalQuery,
    pricing: {
      available: false,
      isFetching: true,
      soldCount: 0,
      medianPrice: null,
      minPrice: null,
      maxPrice: null,
      trendSlope: null,
      volatility: null,
      liquidity: null,
      recentSales: [],
      priceRange: "Fetching...",
      marketAssessment: "Searching eBay for recent sales. Check back in a moment.",
    },
    queryHash: normalized.queryHash,
  };
}
