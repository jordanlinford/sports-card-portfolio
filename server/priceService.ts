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

async function searchEbaySoldListings(query: string): Promise<any> {
  const serperApiKey = process.env.SERPER_API_KEY;
  if (!serperApiKey) {
    throw new Error("SERPER_API_KEY not configured");
  }

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: `${query} site:ebay.com sold`,
      num: 10,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status}`);
  }

  return response.json();
}

function buildSearchQuery(card: CardInfo): string {
  const parts: string[] = [];
  
  if (card.title) parts.push(card.title);
  if (card.set) parts.push(card.set);
  if (card.year) parts.push(String(card.year));
  if (card.variation) parts.push(card.variation);
  if (card.grade) parts.push(card.grade);
  
  return parts.join(" ");
}

export async function lookupCardPrice(card: CardInfo): Promise<PriceLookupResult> {
  const searchQuery = buildSearchQuery(card);
  
  try {
    const searchResults = await searchEbaySoldListings(searchQuery);
    
    const organicResults = searchResults.organic || [];
    const relevantResults = organicResults.filter((result: any) => {
      const title = (result.title || "").toLowerCase();
      const snippet = (result.snippet || "").toLowerCase();
      return title.includes("sold") || snippet.includes("sold") || 
             result.link?.includes("/itm/") || result.link?.includes("ebay.com");
    });

    if (relevantResults.length === 0) {
      return {
        estimatedValue: null,
        source: "eBay (no sales found)",
        searchQuery,
        salesFound: 0,
        confidence: "low",
        details: "No recent sold listings found for this card.",
      };
    }

    const searchContext = relevantResults
      .slice(0, 5)
      .map((r: any) => `Title: ${r.title}\nSnippet: ${r.snippet || "N/A"}\nLink: ${r.link}`)
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a sports card pricing expert. Analyze eBay sold listing search results and extract the average sale price for a specific card.

Your task:
1. Look at the search results snippets for sold listings
2. Extract any visible prices from the titles or snippets
3. Calculate an average of the last 3-5 sales if possible
4. Return ONLY a JSON object with these fields:
   - estimatedValue: number (the average price in dollars, or null if unable to determine)
   - salesFound: number (how many sales you found prices for)
   - confidence: "high" | "medium" | "low"
   - details: string (brief explanation)

Be conservative - if prices are unclear or the listings don't match the card well, return null.
Only include prices that clearly match the specific card being searched.`,
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
        return {
          estimatedValue: parsed.estimatedValue || null,
          source: "eBay Sold Listings (AI analyzed)",
          searchQuery,
          salesFound: parsed.salesFound || 0,
          confidence: parsed.confidence || "low",
          details: parsed.details || "",
        };
      } catch {
        console.error("Failed to parse GPT response as JSON:", responseText);
      }
    }

    return {
      estimatedValue: null,
      source: "eBay (analysis failed)",
      searchQuery,
      salesFound: relevantResults.length,
      confidence: "low",
      details: "Unable to extract pricing from search results.",
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
