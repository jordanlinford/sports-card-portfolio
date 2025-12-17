import OpenAI from "openai";
import type { MatchedAttributes, MatchSample, CardMatchConfidence, MatchConfidenceTier } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://ai.replit.dev/v1beta",
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

interface CardInfo {
  title: string;
  set?: string | null;
  year?: number | null;
  variation?: string | null;
  grade?: string | null;
}

interface PriceLookupResult {
  estimatedValue: number | null;
  source: string;
  searchQuery: string;
  salesFound: number;
  confidence: "high" | "medium" | "low";
  details?: string;
}

// Enhanced price data for Card Outlook AI 2.0
interface PricePoint {
  date: string;
  price: number;
  source: string;
  url?: string;
}

interface EnhancedPriceLookupResult {
  estimatedValue: number | null;
  pricePoints: PricePoint[];
  salesFound: number;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  details?: string;
  rawSearchResults?: Array<{ title: string; snippet: string; link: string }>;
  matchConfidence?: CardMatchConfidence;
}

// Match confidence attribute weights (sum = 1.0)
const MATCH_WEIGHTS = {
  player: 0.30,
  year: 0.15,
  set: 0.20,
  variation: 0.15,
  grade: 0.15,
  rookie: 0.05,
};

// Extract player name from card title (first 2-3 words typically)
function extractPlayerName(title: string): string {
  const cleanTitle = title.replace(/#\d+/g, "").trim();
  const words = cleanTitle.split(/\s+/);
  // Most player names are 2-3 words
  return words.slice(0, 3).join(" ").toLowerCase();
}

// Normalize text for comparison
function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Check if text contains any variation of a search term
function containsTerm(haystack: string, needle: string): boolean {
  if (!needle || !haystack) return false;
  const normalized = normalizeText(needle);
  const haystackNorm = normalizeText(haystack);
  const terms = normalized.split(/\s+/).filter(t => t.length > 2);
  return terms.some(term => haystackNorm.includes(term));
}

// Compute match score for a single listing against the card
function computeListingMatchScore(
  listingTitle: string,
  listingSnippet: string,
  card: CardInfo
): { score: number; matched: MatchedAttributes } {
  const combined = `${listingTitle} ${listingSnippet}`.toLowerCase();
  
  const matched: MatchedAttributes = {
    player: false,
    year: false,
    set: false,
    variation: false,
    grade: false,
    rookie: false,
  };

  // Player match - check if player name appears in listing
  const playerName = extractPlayerName(card.title);
  const playerNameParts = playerName.split(/\s+/).filter(p => p.length > 2);
  const playerMatches = playerNameParts.filter(part => combined.includes(part)).length;
  matched.player = playerMatches >= Math.min(2, playerNameParts.length);

  // Year match - exact year, multi-year format (2018-19), or ±1 tolerance
  let yearScore = 0;
  if (card.year) {
    const yearStr = String(card.year);
    const yearNum = card.year;
    const prevYear = String(yearNum - 1);
    const nextYear = String(yearNum + 1);
    
    // Multi-year format check (e.g., "2018-19" contains both 2018 and 2019)
    const multiYearPattern = new RegExp(`(${prevYear}|${yearStr})[\\-/](${yearStr.slice(-2)}|${nextYear.slice(-2)})`);
    
    if (combined.includes(yearStr)) {
      yearScore = 1.0; // Exact match
    } else if (multiYearPattern.test(combined)) {
      yearScore = 1.0; // Multi-year format containing the year
    } else if (combined.includes(prevYear) || combined.includes(nextYear)) {
      yearScore = 0.7; // ±1 year tolerance gets partial credit
    }
    matched.year = yearScore > 0;
  } else {
    yearScore = 1.0;
    matched.year = true; // No year to match
  }

  // Set match - check if set name appears
  if (card.set) {
    const setTerms = normalizeText(card.set).split(/\s+/).filter(t => t.length > 2);
    const setMatches = setTerms.filter(term => combined.includes(term)).length;
    matched.set = setMatches >= Math.ceil(setTerms.length * 0.6);
  } else {
    matched.set = true; // No set to match
  }

  // Variation match - critical for parallels like Refractor, Prizm, /25, Auto
  if (card.variation) {
    const variationLower = card.variation.toLowerCase();
    // Check for exact variation terms
    const variationTerms = variationLower.split(/[\s\/]+/).filter(t => t.length > 1);
    const variationMatches = variationTerms.filter(term => combined.includes(term)).length;
    matched.variation = variationMatches >= Math.ceil(variationTerms.length * 0.5);
    
    // Strict check for numbered parallels (/25, /99, etc.)
    const numberedMatch = variationLower.match(/\/(\d+)/);
    if (numberedMatch) {
      matched.variation = combined.includes(numberedMatch[0]) || combined.includes(`/${numberedMatch[1]}`);
    }
  } else {
    // No variation specified - penalize if listing has a parallel keyword
    const parallelKeywords = ["refractor", "prizm", "auto", "autograph", "numbered", "/25", "/50", "/99"];
    const hasParallel = parallelKeywords.some(kw => combined.includes(kw));
    matched.variation = !hasParallel; // True if base card, false if listing has parallel
  }

  // Grade match - PSA 10, BGS 9.5, etc. with near-grade equivalence
  let gradeScore = 0;
  if (card.grade) {
    const gradeLower = card.grade.toLowerCase();
    
    // Extract grader and numeric grade from card
    const cardGradeMatch = gradeLower.match(/(psa|bgs|sgc|cgc)?\s*(\d+\.?\d*)/);
    const cardGrader = cardGradeMatch?.[1] || "";
    const cardGradeNum = cardGradeMatch?.[2] ? parseFloat(cardGradeMatch[2]) : null;
    
    // Check for exact match first
    if (combined.includes(gradeLower)) {
      gradeScore = 1.0;
    } else if (cardGradeNum !== null) {
      // Near-grade equivalence table for top grades
      // PSA 10 ~ BGS 9.5 ~ SGC 10 (gem mint equivalents)
      const gemMintGrades = [
        { grader: "psa", score: 10 },
        { grader: "bgs", score: 9.5 },
        { grader: "sgc", score: 10 },
        { grader: "cgc", score: 10 },
      ];
      
      const nearMintGrades = [
        { grader: "psa", score: 9 },
        { grader: "bgs", score: 9 },
        { grader: "sgc", score: 9.5 },
        { grader: "cgc", score: 9 },
      ];
      
      // Check if card grade is in gem mint tier
      const isCardGemMint = gemMintGrades.some(g => 
        (cardGrader === g.grader || !cardGrader) && cardGradeNum === g.score
      );
      
      // Check if card grade is in near mint tier
      const isCardNearMint = nearMintGrades.some(g => 
        (cardGrader === g.grader || !cardGrader) && cardGradeNum === g.score
      );
      
      // Check what grades are in the listing
      const listingHasGemMint = gemMintGrades.some(g => 
        combined.includes(`${g.grader} ${g.score}`) || combined.includes(`${g.grader}${g.score}`)
      );
      const listingHasNearMint = nearMintGrades.some(g => 
        combined.includes(`${g.grader} ${g.score}`) || combined.includes(`${g.grader}${g.score}`)
      );
      
      // Exact grader + score match
      if (cardGrader && combined.includes(cardGrader) && combined.includes(String(cardGradeNum))) {
        gradeScore = 1.0;
      }
      // Cross-grader equivalence (gem mint tier)
      else if (isCardGemMint && listingHasGemMint) {
        gradeScore = 0.75; // Partial credit for equivalent gem mint grades across graders
      }
      // Cross-grader equivalence (near mint tier)
      else if (isCardNearMint && listingHasNearMint) {
        gradeScore = 0.75;
      }
      // Same grader, slightly different grade (e.g., 9 vs 9.5)
      else if (cardGrader) {
        const gradePattern = new RegExp(`${cardGrader}\\s*(\\d+\\.?\\d*)`, "i");
        const listingGradeMatch = combined.match(gradePattern);
        if (listingGradeMatch) {
          const listingGradeNum = parseFloat(listingGradeMatch[1]);
          const diff = Math.abs(cardGradeNum - listingGradeNum);
          if (diff <= 0.5) gradeScore = 0.6; // Close grade, same grader
          else if (diff <= 1) gradeScore = 0.4; // Within 1 grade point
        }
      }
    }
    matched.grade = gradeScore > 0;
  } else {
    // Raw/ungraded - check if listing is also raw
    const gradeKeywords = ["psa", "bgs", "sgc", "cgc", "graded"];
    const isGraded = gradeKeywords.some(kw => combined.includes(kw));
    gradeScore = isGraded ? 0 : 1.0;
    matched.grade = !isGraded; // True if both are raw
  }

  // Rookie match - check for rookie keywords
  const titleLower = card.title.toLowerCase();
  const cardIsRookie = titleLower.includes("rookie") || titleLower.includes("rc");
  const listingIsRookie = combined.includes("rookie") || combined.includes(" rc ");
  matched.rookie = cardIsRookie === listingIsRookie;

  // Calculate weighted score - use proportional scores for year/grade
  let score = 0;
  score += matched.player ? MATCH_WEIGHTS.player : 0;
  score += yearScore * MATCH_WEIGHTS.year; // Proportional year score
  score += matched.set ? MATCH_WEIGHTS.set : 0;
  score += matched.variation ? MATCH_WEIGHTS.variation : 0;
  score += gradeScore * MATCH_WEIGHTS.grade; // Proportional grade score
  score += matched.rookie ? MATCH_WEIGHTS.rookie : 0;

  return { score, matched };
}

// Compute overall card match confidence from multiple listings
function computeCardMatchConfidence(
  listings: Array<{ title: string; snippet: string; link: string; price?: number }>,
  card: CardInfo
): CardMatchConfidence {
  if (listings.length === 0) {
    return {
      tier: "LOW",
      score: 0,
      reason: "No comparable listings found",
      matchedComps: 0,
      totalComps: 0,
      samples: [],
    };
  }

  const samples: MatchSample[] = [];
  let totalScore = 0;
  let highMatchCount = 0;

  for (const listing of listings) {
    const { score, matched } = computeListingMatchScore(listing.title, listing.snippet, card);
    totalScore += score;
    
    if (score >= 0.8) highMatchCount++;

    // Keep top 5 samples for review
    if (samples.length < 5) {
      samples.push({
        title: listing.title,
        snippet: listing.snippet,
        source: extractSourceFromUrl(listing.link),
        url: listing.link,
        price: listing.price,
        matchScore: Math.round(score * 100) / 100,
        matched,
      });
    }
  }

  const avgScore = totalScore / listings.length;
  const highMatchRatio = highMatchCount / listings.length;

  // Determine tier
  let tier: MatchConfidenceTier;
  let reason: string;

  if (avgScore >= 0.8 && highMatchCount >= 3) {
    tier = "HIGH";
    reason = `${highMatchCount} of ${listings.length} listings closely match card attributes`;
  } else if (avgScore >= 0.55 || (highMatchCount >= 2 && listings.length >= 3)) {
    tier = "MEDIUM";
    reason = `Partial match: ${Math.round(avgScore * 100)}% average match score`;
  } else {
    tier = "LOW";
    if (samples.length > 0 && !samples[0].matched.player) {
      reason = "Player name mismatch detected";
    } else if (samples.length > 0 && !samples[0].matched.variation) {
      reason = "Card variation/parallel mismatch detected";
    } else if (samples.length > 0 && !samples[0].matched.grade) {
      reason = "Grade mismatch detected";
    } else {
      reason = `Low match confidence: ${Math.round(avgScore * 100)}% average score`;
    }
  }

  return {
    tier,
    score: Math.round(avgScore * 100) / 100,
    reason,
    matchedComps: highMatchCount,
    totalComps: listings.length,
    samples: samples.sort((a, b) => b.matchScore - a.matchScore),
  };
}

// Extract source name from URL
function extractSourceFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("ebay")) return "eBay";
    if (hostname.includes("psa")) return "PSA";
    if (hostname.includes("130point")) return "130point";
    if (hostname.includes("sportscardspro")) return "SportsCardsPro";
    if (hostname.includes("pricecharting")) return "PriceCharting";
    return hostname.replace("www.", "");
  } catch {
    return "Unknown";
  }
}

async function searchCardPrices(query: string): Promise<any> {
  const serperApiKey = process.env.SERPER_API_KEY;
  if (!serperApiKey) {
    throw new Error("SERPER_API_KEY not configured");
  }

  // Search for prices from multiple sources - eBay, PSA, price guides, etc.
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: 15, // Get more results for better price coverage
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status}`);
  }

  return response.json();
}

function cleanCardTitle(title: string): string {
  // Remove card numbers like #190, #304, etc. - these are often not in eBay listings
  let cleaned = title.replace(/#\d+/g, "").trim();
  // Remove extra spaces
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned;
}

function buildSearchQueries(card: CardInfo): string[] {
  const queries: string[] = [];
  const cleanTitle = cleanCardTitle(card.title);
  
  // Primary query: player name + set + year + variation + grade + "value" or "price" for pricing info
  // Variation is important for parallel cards like Refractor, Prizm, Auto, /25, etc.
  const primaryParts: string[] = [];
  if (cleanTitle) primaryParts.push(cleanTitle);
  if (card.set) primaryParts.push(card.set);
  if (card.year) primaryParts.push(String(card.year));
  if (card.variation) primaryParts.push(card.variation);
  if (card.grade) primaryParts.push(card.grade);
  queries.push(primaryParts.join(" ") + " value price");
  
  // Secondary query: search PSA auction prices specifically (include variation)
  queries.push(`${cleanTitle} ${card.year || ""} ${card.set || ""} ${card.variation || ""} ${card.grade || ""} auction price sold`);
  
  // Tertiary query: player name + year + variation + grade + "rookie card value"
  queries.push(`${cleanTitle} ${card.year || ""} ${card.variation || ""} ${card.grade || ""} rookie card value`);
  
  // Fourth query: simpler version targeting price guides (include variation)
  queries.push(`${cleanTitle} ${card.set || ""} ${card.variation || ""} ${card.grade || ""} price guide`);
  
  return queries;
}

function buildSearchQuery(card: CardInfo): string {
  const queries = buildSearchQueries(card);
  return queries[0]; // Return primary query for backward compatibility
}

async function trySearchQuery(query: string, card: CardInfo): Promise<PriceLookupResult | null> {
  const searchResults = await searchCardPrices(query);
  
  const organicResults = searchResults.organic || [];
  // Filter for pricing-relevant results from eBay, PSA, price guides, etc.
  const relevantResults = organicResults.filter((result: any) => {
    const title = (result.title || "").toLowerCase();
    const snippet = (result.snippet || "").toLowerCase();
    const link = (result.link || "").toLowerCase();
    // Include results that mention prices, sales, auctions, or are from relevant sites
    return title.includes("price") || title.includes("sold") || title.includes("value") ||
           title.includes("auction") || 
           snippet.includes("$") || snippet.includes("price") || snippet.includes("sold") ||
           link.includes("ebay.com") || link.includes("psacard.com") || 
           link.includes("sportscardspro.com") || link.includes("130point.com") ||
           link.includes("pricecharting.com");
  });

  if (relevantResults.length === 0) {
    return null;
  }

  const searchContext = relevantResults
    .slice(0, 8) // Use more results for better coverage
    .map((r: any) => `Title: ${r.title}\nSnippet: ${r.snippet || "N/A"}\nSource: ${r.link}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a sports card pricing expert. Analyze search results from various sources (eBay, PSA, price guides) and extract the market value for a specific card.

Your task:
1. Look at all the search results carefully - they may include eBay listings, PSA auction prices, price guides, etc.
2. Extract ANY visible prices from the titles or snippets (look for $ amounts like "$299.00", "$400-600", etc.)
3. Look for price ranges mentioned (e.g., "sells for $350-600")
4. Calculate an average market value based on what you find
5. Return ONLY a JSON object with these fields:
   - estimatedValue: number (the average/typical price in dollars, or null if truly unable to determine)
   - salesFound: number (how many price references you found)
   - confidence: "high" | "medium" | "low"
   - details: string (brief explanation of where the prices came from)

IMPORTANT:
- Look carefully for ANY dollar amounts in the snippets
- Price ranges like "$400-$600" should be averaged to get $500
- The grade (PSA 10, PSA 9, etc.) significantly affects value - only match same grade
- PSA auction prices and price guide values are valid sources
- eBay "Buy It Now" prices are less reliable than sold prices, but still useful as reference
- Be AGGRESSIVE about finding prices - even a single price reference is valuable
- If you see multiple prices, use the average`,
      },
      {
        role: "user",
        content: `Find the current market value for this card:
Card: ${card.title}
Set: ${card.set || "Unknown"}
Year: ${card.year || "Unknown"}
Variation: ${card.variation || "None"}
Grade: ${card.grade || "Raw/Ungraded"}

Search results from eBay sold listings:
${searchContext}

Return a JSON object with estimatedValue, salesFound, confidence, and details.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  const responseText = completion.choices[0]?.message?.content || "";
  
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.estimatedValue && parsed.estimatedValue > 0) {
        return {
          estimatedValue: parsed.estimatedValue,
          source: "Market Data (AI analyzed)",
          searchQuery: query,
          salesFound: parsed.salesFound || 0,
          confidence: parsed.confidence || "medium",
          details: parsed.details || "",
        };
      }
    } catch {
      console.error("Failed to parse GPT response as JSON:", responseText);
    }
  }

  return null;
}

export async function lookupCardPrice(card: CardInfo): Promise<PriceLookupResult> {
  const queries = buildSearchQueries(card);
  
  try {
    // Try each query until we get a result with a valid price
    for (const query of queries) {
      console.log(`Trying search query: ${query}`);
      const result = await trySearchQuery(query, card);
      if (result && result.estimatedValue) {
        return result;
      }
      // Small delay between queries to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // If no queries returned a price, return a failure result
    return {
      estimatedValue: null,
      source: "eBay (no sales found)",
      searchQuery: queries[0],
      salesFound: 0,
      confidence: "low",
      details: `No recent sold listings found after trying ${queries.length} search variations.`,
    };
  } catch (error) {
    console.error("Price lookup error:", error);
    throw error;
  }
}

export async function lookupMultipleCardPrices(
  cards: CardInfo[]
): Promise<Map<string, PriceLookupResult>> {
  const results = new Map<string, PriceLookupResult>();
  
  for (const card of cards) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await lookupCardPrice(card);
      results.set(card.title, result);
    } catch (error) {
      console.error(`Failed to lookup price for ${card.title}:`, error);
      results.set(card.title, {
        estimatedValue: null,
        source: "Error",
        searchQuery: buildSearchQuery(card),
        salesFound: 0,
        confidence: "low",
        details: `Lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }
  
  return results;
}

// Enhanced price lookup for Card Outlook AI 2.0
// Extracts 8-20 individual price points with dates, sources, and URLs
async function tryEnhancedSearchQuery(query: string, card: CardInfo): Promise<EnhancedPriceLookupResult | null> {
  const searchResults = await searchCardPrices(query);
  
  const organicResults = searchResults.organic || [];
  const relevantResults = organicResults.filter((result: any) => {
    const title = (result.title || "").toLowerCase();
    const snippet = (result.snippet || "").toLowerCase();
    const link = (result.link || "").toLowerCase();
    return title.includes("price") || title.includes("sold") || title.includes("value") ||
           title.includes("auction") || 
           snippet.includes("$") || snippet.includes("price") || snippet.includes("sold") ||
           link.includes("ebay.com") || link.includes("psacard.com") || 
           link.includes("sportscardspro.com") || link.includes("130point.com") ||
           link.includes("pricecharting.com");
  });

  if (relevantResults.length === 0) {
    return null;
  }

  const rawResults = relevantResults.slice(0, 12).map((r: any) => ({
    title: r.title || "",
    snippet: r.snippet || "",
    link: r.link || "",
  }));

  // DEBUG: Log raw search results for match analysis
  console.log("\n========== RAW COMP DATA FOR MATCH ANALYSIS ==========");
  console.log(`Card: ${card.title} | Set: ${card.set} | Year: ${card.year} | Grade: ${card.grade}`);
  console.log("--------------------------------------------------------");
  rawResults.forEach((r: any, i: number) => {
    console.log(`[${i + 1}] Title: ${r.title}`);
    console.log(`    Snippet: ${r.snippet?.substring(0, 150)}...`);
    console.log(`    URL: ${r.link}`);
    console.log("");
  });
  console.log("========================================================\n");

  const searchContext = rawResults
    .map((r: any) => `Title: ${r.title}\nSnippet: ${r.snippet}\nURL: ${r.link}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a sports card pricing expert. Extract INDIVIDUAL price points from search results.

Your task:
1. Find ALL individual prices mentioned in the search results
2. For each price, extract: price amount, approximate date (if visible), source name, and source URL
3. Look for: eBay sold prices, auction results, price guide values, recent sales

Return ONLY a JSON object with:
{
  "pricePoints": [
    { "date": "2024-12-01", "price": 299, "source": "eBay Sold", "url": "https://..." },
    { "date": "2024-11-15", "price": 350, "source": "130point", "url": "https://..." }
  ],
  "estimatedValue": number (average of all prices found),
  "salesFound": number (total price points extracted),
  "confidence": "high" | "medium" | "low",
  "confidenceReason": string (explain why this confidence level, e.g., "12 recent sold comps in last 90 days")
}

RULES:
- Extract up to 20 individual price points
- If no date is visible, use today's date
- Match the card's grade (PSA 10, PSA 9, etc.) - don't mix grades
- Price ranges like "$400-$600" count as ONE price point at the midpoint ($500)
- eBay sold listings are most reliable
- Be aggressive - extract every price you can find`,
      },
      {
        role: "user",
        content: `Extract all price points for this card:
Card: ${card.title}
Set: ${card.set || "Unknown"}
Year: ${card.year || "Unknown"}
Variation: ${card.variation || "None"}
Grade: ${card.grade || "Raw/Ungraded"}

Search results:
${searchContext}

Return JSON with pricePoints array, estimatedValue, salesFound, confidence, and confidenceReason.`,
      },
    ],
    temperature: 0.2,
    max_tokens: 1500,
  });

  const responseText = completion.choices[0]?.message?.content || "";
  
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const pricePoints: PricePoint[] = (parsed.pricePoints || []).map((pp: any) => ({
        date: pp.date || new Date().toISOString().split('T')[0],
        price: typeof pp.price === 'number' ? pp.price : parseFloat(pp.price) || 0,
        source: pp.source || "Unknown",
        url: pp.url,
      })).filter((pp: PricePoint) => pp.price > 0);
      
      if (pricePoints.length > 0 || parsed.estimatedValue > 0) {
        return {
          estimatedValue: parsed.estimatedValue || (pricePoints.length > 0 
            ? pricePoints.reduce((sum, pp) => sum + pp.price, 0) / pricePoints.length 
            : null),
          pricePoints,
          salesFound: pricePoints.length || parsed.salesFound || 0,
          confidence: parsed.confidence || "medium",
          confidenceReason: parsed.confidenceReason || `${pricePoints.length} price points found`,
          rawSearchResults: rawResults,
        };
      }
    } catch {
      console.error("Failed to parse enhanced price response:", responseText);
    }
  }

  return null;
}

export async function lookupEnhancedCardPrice(card: CardInfo): Promise<EnhancedPriceLookupResult> {
  const queries = buildSearchQueries(card);
  const allPricePoints: PricePoint[] = [];
  const allRawResults: Array<{ title: string; snippet: string; link: string }> = [];
  
  try {
    // Try multiple queries to gather more price data
    for (const query of queries.slice(0, 2)) { // Use first 2 queries
      console.log(`[Enhanced] Trying search query: ${query}`);
      const result = await tryEnhancedSearchQuery(query, card);
      
      if (result) {
        // Merge price points, avoiding duplicates by URL
        for (const pp of result.pricePoints) {
          const isDuplicate = allPricePoints.some(
            existing => existing.url && pp.url && existing.url === pp.url
          );
          if (!isDuplicate) {
            allPricePoints.push(pp);
          }
        }
        
        // Merge raw results
        if (result.rawSearchResults) {
          for (const raw of result.rawSearchResults) {
            const isDuplicate = allRawResults.some(existing => existing.link === raw.link);
            if (!isDuplicate) {
              allRawResults.push(raw);
            }
          }
        }
      }
      
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Calculate final values
    const salesFound = allPricePoints.length;
    const estimatedValue = salesFound > 0 
      ? allPricePoints.reduce((sum, pp) => sum + pp.price, 0) / salesFound 
      : null;
    
    // Compute card match confidence from raw search results
    const matchConfidence = computeCardMatchConfidence(allRawResults, card);
    
    // Determine confidence based on data quality
    let confidence: "high" | "medium" | "low";
    let confidenceReason: string;
    
    if (salesFound >= 10) {
      confidence = "high";
      confidenceReason = `${salesFound} price points from multiple sources`;
    } else if (salesFound >= 4) {
      confidence = "medium";
      confidenceReason = `${salesFound} price points found - moderate data coverage`;
    } else if (salesFound >= 1) {
      confidence = "low";
      confidenceReason = `Only ${salesFound} price point(s) found - sparse data`;
    } else {
      confidence = "low";
      confidenceReason = "No sold listings found";
    }
    
    // Downgrade market confidence if match confidence is LOW
    if (matchConfidence.tier === "LOW" && confidence !== "low") {
      confidence = matchConfidence.tier === "LOW" && confidence === "high" ? "medium" : "low";
      confidenceReason = `${confidenceReason}. Match confidence: ${matchConfidence.reason}`;
    }

    return {
      estimatedValue,
      pricePoints: allPricePoints.slice(0, 20), // Cap at 20
      salesFound,
      confidence,
      confidenceReason,
      rawSearchResults: allRawResults.slice(0, 15),
      matchConfidence,
    };
  } catch (error) {
    console.error("Enhanced price lookup error:", error);
    return {
      estimatedValue: null,
      pricePoints: [],
      salesFound: 0,
      confidence: "low",
      confidenceReason: `Lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      matchConfidence: {
        tier: "LOW" as const,
        score: 0,
        reason: "Lookup failed",
        matchedComps: 0,
        totalComps: 0,
        samples: [],
      },
    };
  }
}

export { type EnhancedPriceLookupResult, type PricePoint, computeCardMatchConfidence };
