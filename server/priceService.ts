import OpenAI from "openai";

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
