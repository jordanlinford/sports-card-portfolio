import { createHash } from "crypto";
import { db } from "./db";
import { marketCompsCache, type EbayComp, type CompsSummary, type CompsQueryFilters, type MarketCompsCache } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

// ============================================================================
// QUERY NORMALIZATION
// ============================================================================

// Noise terms to remove from queries
const NOISE_TERMS = [
  "invest", "hot", "fire", "gem", "mint", "look",
  "read description", "see pics", "beautiful", "nice", "rare",
  "must have", "buy now", "fast ship"
];

// Emoji removal - simple approach that works across all ES targets
function removeEmojis(str: string): string {
  // Remove common emoji ranges using escape sequences
  return str
    .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, "")
    .replace(/[\u2600-\u27BF]/g, "")
    .replace(/[\uFE00-\uFE0F]/g, "");
}

// Common grading companies
const GRADERS = ["psa", "bgs", "sgc", "cgc", "hga", "csg"];

// Common set names
const COMMON_SETS = [
  "prizm", "optic", "select", "mosaic", "donruss", "panini",
  "topps", "bowman", "chrome", "fleer", "upper deck", "hoops",
  "contenders", "national treasures", "immaculate", "spectra"
];

// Common parallels
const COMMON_PARALLELS = [
  "silver", "gold", "red", "blue", "green", "purple", "orange", "pink", "black",
  "holo", "refractor", "prizm", "mojo", "hyper", "cosmic", "wave",
  "/99", "/75", "/50", "/25", "/10", "/5", "/1"
];

export interface NormalizedQuery {
  canonicalQuery: string;
  queryHash: string;
  filters: CompsQueryFilters;
}

/**
 * Normalizes a card search query into a canonical form for consistent caching.
 * Extracts structured filters (player, year, set, etc.) from the input.
 */
export function normalizeEbayQuery(input: string): NormalizedQuery {
  let normalized = input.toLowerCase().trim();
  
  // Remove emojis
  normalized = removeEmojis(normalized);
  
  // Remove noise terms
  for (const noise of NOISE_TERMS) {
    normalized = normalized.replace(new RegExp(noise, "gi"), "");
  }
  
  // Clean up multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  const filters: CompsQueryFilters = {};
  
  // Extract year (4-digit number, typically 1900-2099)
  const yearMatch = normalized.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
  if (yearMatch) {
    filters.year = parseInt(yearMatch[1]);
  }
  
  // Extract grade (e.g., "PSA 10", "BGS 9.5")
  const gradeMatch = normalized.match(/\b(psa|bgs|sgc|cgc|hga|csg)\s*([\d.]+)\b/i);
  if (gradeMatch) {
    filters.grader = gradeMatch[1].toUpperCase();
    filters.grade = gradeMatch[2];
  }
  
  // Extract set name
  for (const set of COMMON_SETS) {
    if (normalized.includes(set)) {
      filters.set = set.charAt(0).toUpperCase() + set.slice(1);
      break;
    }
  }
  
  // Extract parallel
  for (const parallel of COMMON_PARALLELS) {
    if (normalized.includes(parallel)) {
      filters.parallel = parallel;
      break;
    }
  }
  
  // Extract card number (e.g., "#123", "card 45")
  const cardNumMatch = normalized.match(/#?\s*(\d{1,4})\b/);
  if (cardNumMatch && !yearMatch?.[1]?.includes(cardNumMatch[1])) {
    // Make sure we're not capturing the year as a card number
    const num = cardNumMatch[1];
    if (num.length <= 3 || parseInt(num) < 1900) {
      filters.cardNumber = num;
    }
  }
  
  // Extract player name (everything that's not a known keyword)
  const keywords = [
    ...(filters.year ? [String(filters.year)] : []),
    ...(filters.set ? [filters.set.toLowerCase()] : []),
    ...(filters.parallel ? [filters.parallel] : []),
    ...(filters.grade ? [`${filters.grader?.toLowerCase() || ""} ${filters.grade}`] : []),
    ...(filters.cardNumber ? [`#${filters.cardNumber}`, filters.cardNumber] : []),
    ...GRADERS,
    "rc", "rookie", "auto", "autograph", "patch", "jersey", "relic"
  ];
  
  let playerParts = normalized;
  for (const kw of keywords) {
    if (kw) {
      playerParts = playerParts.replace(new RegExp(`\\b${kw}\\b`, "gi"), "");
    }
  }
  playerParts = playerParts.replace(/\s+/g, " ").trim();
  
  if (playerParts.length > 2) {
    filters.player = playerParts
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  
  // Build canonical query: player + year + set + parallel + grade
  const parts: string[] = [];
  if (filters.year) parts.push(String(filters.year));
  if (filters.set) parts.push(filters.set);
  if (filters.player) parts.push(filters.player);
  if (filters.parallel) parts.push(filters.parallel);
  if (filters.grader && filters.grade) parts.push(`${filters.grader} ${filters.grade}`);
  
  const canonicalQuery = parts.join(" ").trim() || normalized;
  const queryHash = createHash("sha256").update(canonicalQuery.toLowerCase()).digest("hex");
  
  return {
    canonicalQuery,
    queryHash,
    filters
  };
}

// ============================================================================
// QUERY BROADENING LADDER
// ============================================================================

const MIN_COMPS_THRESHOLD = 12; // Stop broadening when we have this many good comps

/**
 * Generate a ladder of progressively broader queries.
 * Each step removes specificity to increase comp matches.
 */
export function generateQueryLadder(filters: CompsQueryFilters): string[] {
  const ladder: string[] = [];
  
  // Level 0: Full query with all filters (most specific)
  const fullParts: string[] = [];
  if (filters.year) fullParts.push(String(filters.year));
  if (filters.set) fullParts.push(filters.set);
  if (filters.player) fullParts.push(filters.player);
  if (filters.parallel) fullParts.push(filters.parallel);
  if (filters.grader && filters.grade) fullParts.push(`${filters.grader} ${filters.grade}`);
  if (fullParts.length > 0) ladder.push(fullParts.join(" "));
  
  // Level 1: Remove parallel (keep player + year + set + grade)
  if (filters.parallel) {
    const parts: string[] = [];
    if (filters.year) parts.push(String(filters.year));
    if (filters.set) parts.push(filters.set);
    if (filters.player) parts.push(filters.player);
    if (filters.grader && filters.grade) parts.push(`${filters.grader} ${filters.grade}`);
    if (parts.length > 0 && parts.join(" ") !== ladder[ladder.length - 1]) {
      ladder.push(parts.join(" "));
    }
  }
  
  // Level 2: Remove card number (keep player + year + set + grader only, no exact grade)
  if (filters.grader && filters.grade) {
    const parts: string[] = [];
    if (filters.year) parts.push(String(filters.year));
    if (filters.set) parts.push(filters.set);
    if (filters.player) parts.push(filters.player);
    if (filters.grader) parts.push(filters.grader); // Just grader, no specific grade
    if (parts.length > 0 && parts.join(" ") !== ladder[ladder.length - 1]) {
      ladder.push(parts.join(" "));
    }
  }
  
  // Level 3: Remove set (keep player + year + grader)
  if (filters.set) {
    const parts: string[] = [];
    if (filters.year) parts.push(String(filters.year));
    if (filters.player) parts.push(filters.player);
    if (filters.grader) parts.push(filters.grader);
    if (parts.length > 0 && parts.join(" ") !== ladder[ladder.length - 1]) {
      ladder.push(parts.join(" "));
    }
  }
  
  // Level 4: Just player + year (broadest useful query)
  if (filters.player && filters.year) {
    const parts = [String(filters.year), filters.player];
    if (parts.join(" ") !== ladder[ladder.length - 1]) {
      ladder.push(parts.join(" "));
    }
  }
  
  // Level 5: Just player (very broad, last resort)
  if (filters.player) {
    if (filters.player !== ladder[ladder.length - 1]) {
      ladder.push(filters.player);
    }
  }
  
  return ladder;
}

// ============================================================================
// BACKGROUND JOB QUEUE
// ============================================================================

interface FetchJob {
  queryHash: string;
  canonicalQuery: string;
  filters: CompsQueryFilters;
  startedAt: Date;
}

// In-memory job tracking
const activeJobs = new Map<string, FetchJob>();
const MAX_CONCURRENT_JOBS = 1; // Single worker to avoid rate limiting

/**
 * Check if a job is already running for this query hash
 */
export function isJobRunning(queryHash: string): boolean {
  return activeJobs.has(queryHash);
}

/**
 * Get the count of currently active jobs
 */
export function getActiveJobCount(): number {
  return activeJobs.size;
}

/**
 * Enqueue a fetch job for eBay comps
 * Returns immediately - actual fetching happens in background
 */
export async function enqueueFetchJob(
  canonicalQuery: string,
  queryHash: string,
  filters: CompsQueryFilters
): Promise<{ queued: boolean; reason?: string }> {
  // Check if already running
  if (isJobRunning(queryHash)) {
    return { queued: false, reason: "Job already running for this query" };
  }
  
  // Check concurrency limit
  if (getActiveJobCount() >= MAX_CONCURRENT_JOBS) {
    return { queued: false, reason: "Too many concurrent jobs, try again later" };
  }
  
  // Create or update cache entry with fetching status
  const existing = await db.select()
    .from(marketCompsCache)
    .where(eq(marketCompsCache.queryHash, queryHash))
    .limit(1);
  
  if (existing.length === 0) {
    await db.insert(marketCompsCache).values({
      queryHash,
      canonicalQuery,
      filters,
      fetchStatus: "fetching",
      createdAt: new Date()
    });
  } else {
    await db.update(marketCompsCache)
      .set({ fetchStatus: "fetching" })
      .where(eq(marketCompsCache.queryHash, queryHash));
  }
  
  // Track the job
  const job: FetchJob = {
    queryHash,
    canonicalQuery,
    filters,
    startedAt: new Date()
  };
  activeJobs.set(queryHash, job);
  
  // Start background fetch (don't await)
  runFetchJob(job).catch(err => {
    console.error(`[eBay Comps] Fetch job failed for ${queryHash}:`, err);
  });
  
  return { queued: true };
}

// ============================================================================
// MATCHING & FILTERING
// ============================================================================

// Terms that indicate non-card listings
const REJECT_TERMS = [
  "case", "lot", "pack", "break", "digital", "replica", "reprint",
  "box", "hobby", "blaster", "cello", "hanger", "fat pack",
  "collection", "bulk", "random", "mystery"
];

// Terms that suggest low quality listings
const LOW_QUALITY_TERMS = [
  "read description", "see pics", "as is", "sold as is",
  "no returns", "final sale"
];

/**
 * Calculate a match score for a comp title against query filters.
 * Returns 0-1 score, with 0 being no match and 1 being perfect match.
 */
export function calculateMatchScore(
  compTitle: string,
  filters: CompsQueryFilters
): number {
  const title = compTitle.toLowerCase();
  let score = 0.5; // Base score
  let maxScore = 0.5;
  
  // Hard reject if contains reject terms
  for (const term of REJECT_TERMS) {
    if (title.includes(term)) {
      return 0;
    }
  }
  
  // Player name check (required if specified)
  if (filters.player) {
    maxScore += 0.3;
    const playerParts = filters.player.toLowerCase().split(" ");
    const matchedParts = playerParts.filter(p => title.includes(p));
    if (matchedParts.length === 0) {
      return 0; // Hard reject - player must be present
    }
    score += 0.3 * (matchedParts.length / playerParts.length);
  }
  
  // Year check (required if specified)
  if (filters.year) {
    maxScore += 0.15;
    if (title.includes(String(filters.year))) {
      score += 0.15;
    } else {
      return 0; // Hard reject - year must match
    }
  }
  
  // Grade check (important if graded)
  if (filters.grader && filters.grade) {
    maxScore += 0.2;
    const gradePattern = new RegExp(`${filters.grader}\\s*${filters.grade}`, "i");
    if (gradePattern.test(title)) {
      score += 0.2;
    } else if (title.includes(filters.grader.toLowerCase())) {
      // Has grader but different grade
      score += 0.05;
    } else if (filters.grader && !title.includes("raw") && !GRADERS.some(g => title.includes(g))) {
      // Looking for graded but this is raw
      return 0;
    }
  }
  
  // Set name check (soft match)
  if (filters.set) {
    maxScore += 0.1;
    if (title.includes(filters.set.toLowerCase())) {
      score += 0.1;
    }
  }
  
  // Parallel check (soft match)
  if (filters.parallel) {
    maxScore += 0.1;
    if (title.includes(filters.parallel.toLowerCase())) {
      score += 0.1;
    } else {
      // Check for conflicting parallel
      const otherParallels = COMMON_PARALLELS.filter(p => p !== filters.parallel);
      for (const p of otherParallels) {
        if (title.includes(p.toLowerCase())) {
          score -= 0.05; // Slight penalty for wrong parallel
          break;
        }
      }
    }
  }
  
  // Penalty for low quality indicators
  for (const term of LOW_QUALITY_TERMS) {
    if (title.includes(term)) {
      score -= 0.1;
    }
  }
  
  // Normalize to 0-1
  return Math.max(0, Math.min(1, score / maxScore));
}

/**
 * Filter and score a list of raw comps, returning only quality matches
 */
export function filterAndScoreComps(
  rawComps: EbayComp[],
  filters: CompsQueryFilters,
  minScore: number = 0.4
): EbayComp[] {
  return rawComps
    .map(comp => ({
      ...comp,
      matchScore: calculateMatchScore(comp.title, filters)
    }))
    .filter(comp => comp.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore);
}

// ============================================================================
// AGGREGATIONS
// ============================================================================

/**
 * Calculate statistical aggregations from a list of comps
 */
export function calculateAggregations(comps: EbayComp[]): CompsSummary {
  if (comps.length === 0) {
    return {
      soldCount: 0,
      medianPrice: 0,
      meanPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      volatility: 0,
      liquidity: 0,
      trendSeries: [],
      trendSlope: 0
    };
  }
  
  const prices = comps.map(c => c.totalPrice).sort((a, b) => a - b);
  const soldCount = prices.length;
  
  // Basic stats
  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];
  const meanPrice = prices.reduce((a, b) => a + b, 0) / soldCount;
  const medianPrice = soldCount % 2 === 0
    ? (prices[soldCount / 2 - 1] + prices[soldCount / 2]) / 2
    : prices[Math.floor(soldCount / 2)];
  
  // Volatility (coefficient of variation)
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - meanPrice, 2), 0) / soldCount;
  const stdDev = Math.sqrt(variance);
  const volatility = meanPrice > 0 ? stdDev / meanPrice : 0;
  
  // Group by week for trend analysis
  const weeklyData = new Map<string, number[]>();
  const now = new Date();
  
  for (const comp of comps) {
    let weekKey: string;
    if (comp.soldDate) {
      const date = new Date(comp.soldDate);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      weekKey = weekStart.toISOString().split("T")[0];
    } else {
      // If no date, assume recent (this week or last week)
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() - 7);
      weekKey = weekStart.toISOString().split("T")[0];
    }
    
    if (!weeklyData.has(weekKey)) {
      weeklyData.set(weekKey, []);
    }
    weeklyData.get(weekKey)!.push(comp.totalPrice);
  }
  
  // Build trend series
  const trendSeries: Array<{ week: string; medianPrice: number; count: number }> = [];
  const sortedWeeks = Array.from(weeklyData.keys()).sort();
  
  for (const week of sortedWeeks) {
    const weekPrices = weeklyData.get(week)!.sort((a, b) => a - b);
    const weekMedian = weekPrices.length % 2 === 0
      ? (weekPrices[weekPrices.length / 2 - 1] + weekPrices[weekPrices.length / 2]) / 2
      : weekPrices[Math.floor(weekPrices.length / 2)];
    
    trendSeries.push({
      week,
      medianPrice: Math.round(weekMedian * 100) / 100,
      count: weekPrices.length
    });
  }
  
  // Calculate trend slope (simple linear regression on weekly medians)
  let trendSlope = 0;
  if (trendSeries.length >= 2) {
    const n = trendSeries.length;
    const xMean = (n - 1) / 2;
    const yMean = trendSeries.reduce((s, t) => s + t.medianPrice, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (trendSeries[i].medianPrice - yMean);
      denominator += Math.pow(i - xMean, 2);
    }
    
    if (denominator > 0) {
      trendSlope = numerator / denominator;
      // Normalize as percentage of mean
      trendSlope = yMean > 0 ? (trendSlope / yMean) * 100 : 0;
    }
  }
  
  // Liquidity: sales per week over time window
  const weeksInData = Math.max(1, sortedWeeks.length);
  const liquidity = soldCount / weeksInData;
  
  return {
    soldCount,
    medianPrice: Math.round(medianPrice * 100) / 100,
    meanPrice: Math.round(meanPrice * 100) / 100,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    volatility: Math.round(volatility * 1000) / 1000,
    liquidity: Math.round(liquidity * 10) / 10,
    trendSeries,
    trendSlope: Math.round(trendSlope * 100) / 100
  };
}

/**
 * Determine confidence level based on sold count and match quality
 * LOW if < 5 comps, MED if 5-14, HIGH if 15+ with good match score
 */
export function calculateConfidence(
  soldCount: number,
  avgMatchScore: number,
  isFallback: boolean = false
): "HIGH" | "MED" | "LOW" {
  // If fallback/blocked, always LOW confidence
  if (isFallback) {
    return "LOW";
  }
  
  // Less than 5 comps = always LOW
  if (soldCount < 5) {
    return "LOW";
  }
  
  const HIGH_COUNT_THRESHOLD = 15;
  const MED_COUNT_THRESHOLD = 5;
  const HIGH_SCORE_THRESHOLD = 0.7;
  const MED_SCORE_THRESHOLD = 0.5;
  
  if (soldCount >= HIGH_COUNT_THRESHOLD && avgMatchScore >= HIGH_SCORE_THRESHOLD) {
    return "HIGH";
  }
  
  if (soldCount >= MED_COUNT_THRESHOLD && avgMatchScore >= MED_SCORE_THRESHOLD) {
    return "MED";
  }
  
  return "LOW";
}

// ============================================================================
// EBAY SCRAPING (Placeholder - requires implementation)
// ============================================================================

// User agents for rotation
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Build eBay sold listings search URL
 */
function buildEbaySearchUrl(query: string, page: number = 1): string {
  const baseUrl = "https://www.ebay.com/sch/i.html";
  const params = new URLSearchParams({
    _nkw: query,
    _sacat: "0",
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "13", // Sort by end date: newest first
    _ipg: "60", // Items per page
  });
  
  if (page > 1) {
    params.set("_pgn", String(page));
  }
  
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Parse price from eBay price string
 */
function parsePrice(priceStr: string): number | null {
  if (!priceStr) return null;
  
  // Remove currency symbols and commas
  const cleaned = priceStr.replace(/[^0-9.]/g, "");
  const price = parseFloat(cleaned);
  
  return isNaN(price) ? null : price;
}

/**
 * Scrape eBay sold listings for a query
 * Note: This is a simplified implementation - production would need more robust scraping
 */
async function scrapeEbaySoldListings(
  canonicalQuery: string,
  maxPages: number = 2, // Reduced to 2 pages max to avoid rate limiting
  maxItems: number = 60
): Promise<{ comps: EbayComp[]; pagesScraped: number; error?: string; isBlocked?: boolean }> {
  const comps: EbayComp[] = [];
  let pagesScraped = 0;
  
  console.log(`[eBay Scraper] Starting scrape for: "${canonicalQuery}"`);
  
  for (let page = 1; page <= maxPages; page++) {
    if (comps.length >= maxItems) break;
    
    try {
      const url = buildEbaySearchUrl(canonicalQuery, page);
      console.log(`[eBay Scraper] Fetching page ${page}: ${url}`);
      
      // Add jitter delay between requests (7-12 seconds to avoid rate limiting)
      if (page > 1) {
        await randomDelay(7000, 12000);
      }
      
      const response = await fetch(url, {
        headers: {
          "User-Agent": getRandomUserAgent(),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1"
        }
      });
      
      if (!response.ok) {
        console.error(`[eBay Scraper] HTTP ${response.status} on page ${page}`);
        if (response.status === 429 || response.status === 403) {
          return { comps, pagesScraped, error: "Rate limited or blocked", isBlocked: true };
        }
        continue;
      }
      
      const html = await response.text();
      pagesScraped++;
      
      // Check for bot detection
      if (html.includes("robot") || html.includes("captcha") || html.includes("blocked")) {
        console.warn(`[eBay Scraper] Bot detection triggered on page ${page}`);
        return { comps, pagesScraped, error: "Bot detection triggered", isBlocked: true };
      }
      
      // Parse listings from HTML
      const pageComps = parseEbayListings(html);
      console.log(`[eBay Scraper] Found ${pageComps.length} items on page ${page}`);
      
      if (pageComps.length === 0) {
        // No more results
        break;
      }
      
      comps.push(...pageComps);
      
    } catch (err) {
      console.error(`[eBay Scraper] Error on page ${page}:`, err);
      // Continue to next page on error
    }
  }
  
  console.log(`[eBay Scraper] Completed: ${comps.length} items from ${pagesScraped} pages`);
  return { comps, pagesScraped };
}

/**
 * Parse eBay listing HTML to extract comp data
 * This is a simplified regex-based parser - production would use a proper HTML parser
 */
function parseEbayListings(html: string): EbayComp[] {
  const comps: EbayComp[] = [];
  
  // Match listing items - eBay uses srp-results class
  // This is a simplified pattern - real implementation would use proper DOM parsing
  const itemPattern = /<li class="s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  
  while ((match = itemPattern.exec(html)) !== null) {
    const itemHtml = match[1];
    
    // Skip ads/promoted listings
    if (itemHtml.includes("s-item__ad") || itemHtml.includes("SPONSORED")) {
      continue;
    }
    
    // Extract title
    const titleMatch = itemHtml.match(/class="s-item__title[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)/);
    const title = titleMatch ? titleMatch[1].trim() : "";
    
    if (!title || title === "Shop on eBay") continue;
    
    // Extract sold price
    const priceMatch = itemHtml.match(/class="s-item__price[^"]*"[^>]*>([^<]+)/);
    const soldPrice = priceMatch ? parsePrice(priceMatch[1]) : null;
    
    if (!soldPrice) continue;
    
    // Extract shipping (if present)
    const shippingMatch = itemHtml.match(/s-item__shipping[^"]*"[^>]*>([^<]+)/);
    let shippingPrice = 0;
    if (shippingMatch) {
      const shippingText = shippingMatch[1].toLowerCase();
      if (!shippingText.includes("free")) {
        const parsed = parsePrice(shippingMatch[1]);
        if (parsed) shippingPrice = parsed;
      }
    }
    
    // Extract URL
    const urlMatch = itemHtml.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/);
    const itemUrl = urlMatch ? urlMatch[1].split("?")[0] : undefined;
    
    // Extract image
    const imgMatch = itemHtml.match(/src="(https:\/\/i\.ebayimg\.com[^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : undefined;
    
    // Check for best offer
    const isBestOffer = itemHtml.toLowerCase().includes("best offer");
    
    comps.push({
      title,
      soldPrice,
      shippingPrice: shippingPrice > 0 ? shippingPrice : undefined,
      totalPrice: soldPrice + shippingPrice,
      itemUrl,
      imageUrl,
      isBestOffer,
      matchScore: 0 // Will be calculated later
    });
  }
  
  return comps;
}

// ============================================================================
// MAIN FETCH JOB RUNNER
// ============================================================================

/**
 * Run a fetch job in the background with query broadening ladder.
 * If initial query returns < MIN_COMPS_THRESHOLD, tries progressively broader queries.
 */
async function runFetchJob(job: FetchJob): Promise<void> {
  const { queryHash, canonicalQuery, filters } = job;
  const startTime = Date.now();
  
  console.log(`[eBay Comps] Starting fetch job for: ${canonicalQuery}`);
  
  // Generate the query broadening ladder
  const queryLadder = generateQueryLadder(filters);
  // Ensure original query is first if not already in ladder
  if (queryLadder.length === 0 || queryLadder[0] !== canonicalQuery) {
    queryLadder.unshift(canonicalQuery);
  }
  
  let allComps: EbayComp[] = [];
  let totalPagesScraped = 0;
  let lastError: string | undefined;
  let wasBlocked = false;
  let queriesUsed: string[] = [];
  
  try {
    // Try each query in the ladder until we have enough comps
    for (let i = 0; i < queryLadder.length && allComps.length < MIN_COMPS_THRESHOLD; i++) {
      const currentQuery = queryLadder[i];
      queriesUsed.push(currentQuery);
      
      console.log(`[eBay Comps] Ladder step ${i + 1}/${queryLadder.length}: "${currentQuery}"`);
      
      // Add delay between ladder steps (longer delay for subsequent queries)
      if (i > 0) {
        await randomDelay(5000, 8000);
      } else {
        await randomDelay(2000, 4000);
      }
      
      // Scrape eBay with reduced limits to avoid blocking
      const { comps: rawComps, pagesScraped, error: scrapeError, isBlocked } = await scrapeEbaySoldListings(
        currentQuery,
        2, // max pages
        60 // max items
      );
      
      totalPagesScraped += pagesScraped;
      
      // Handle blocked status - stop the ladder
      if (isBlocked) {
        console.warn(`[eBay Comps] Scrape blocked at ladder step ${i + 1}: ${scrapeError}`);
        wasBlocked = true;
        lastError = scrapeError || "Bot detection triggered";
        break;
      }
      
      if (scrapeError) {
        lastError = scrapeError;
        console.warn(`[eBay Comps] Scrape warning at step ${i + 1}: ${scrapeError}`);
      }
      
      // Filter and score comps from this query
      const filteredComps = filterAndScoreComps(rawComps, filters);
      
      // Add new comps (avoid duplicates by URL)
      const existingUrls = new Set(allComps.map(c => c.itemUrl).filter(Boolean));
      for (const comp of filteredComps) {
        if (!comp.itemUrl || !existingUrls.has(comp.itemUrl)) {
          allComps.push(comp);
          if (comp.itemUrl) existingUrls.add(comp.itemUrl);
        }
      }
      
      console.log(`[eBay Comps] After step ${i + 1}: ${allComps.length} unique comps (need ${MIN_COMPS_THRESHOLD})`);
      
      // Stop if we have enough comps
      if (allComps.length >= MIN_COMPS_THRESHOLD) {
        console.log(`[eBay Comps] Reached ${MIN_COMPS_THRESHOLD}+ comps, stopping ladder`);
        break;
      }
    }
    
    // If blocked and we have no comps, mark as blocked
    if (wasBlocked && allComps.length === 0) {
      const now = new Date();
      const blockedExpiryHours = 2;
      const expiresAt = new Date(now.getTime() + blockedExpiryHours * 60 * 60 * 1000);
      
      await db.update(marketCompsCache)
        .set({
          fetchStatus: "blocked",
          fetchError: lastError || "Bot detection triggered",
          confidence: "LOW",
          soldCount: 0,
          pagesScraped: totalPagesScraped,
          lastFetchedAt: now,
          expiresAt
        })
        .where(eq(marketCompsCache.queryHash, queryHash));
      
      console.log(`[eBay Comps] Marked as blocked with LOW confidence, will retry after ${blockedExpiryHours}h`);
      return;
    }
    
    // Use the comps we collected from the ladder
    const filteredComps = allComps;
    
    // Calculate aggregations
    const summary = calculateAggregations(filteredComps);
    
    // Calculate average match score
    const avgMatchScore = filteredComps.length > 0
      ? filteredComps.reduce((s, c) => s + c.matchScore, 0) / filteredComps.length
      : 0;
    
    // Determine confidence (not fallback since we have real eBay data)
    const confidence = calculateConfidence(summary.soldCount, avgMatchScore, false);
    
    // Calculate expiry with longer TTLs for reliability:
    // - 7 days (168h) for strong data (>=15 comps)
    // - 3 days (72h) for medium data (6-14 comps)
    // - 1 day (24h) for sparse data (<=5 comps)
    const now = new Date();
    const expiryHours = summary.soldCount >= 15 ? 168 : summary.soldCount <= 5 ? 24 : 72;
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
    
    // Update cache with ladder results
    await db.update(marketCompsCache)
      .set({
        soldCount: summary.soldCount,
        compsJson: filteredComps,
        summaryJson: summary,
        confidence,
        avgMatchScore,
        fetchStatus: wasBlocked ? "blocked" : "complete",
        fetchError: lastError || null,
        pagesScraped: totalPagesScraped,
        itemsFound: allComps.length, // Total items collected
        itemsKept: filteredComps.length,
        lastFetchedAt: now,
        expiresAt
      })
      .where(eq(marketCompsCache.queryHash, queryHash));
    
    const duration = Date.now() - startTime;
    console.log(`[eBay Comps] Fetch complete for ${queryHash}: ${filteredComps.length} comps, ${confidence} confidence, ${queriesUsed.length} ladder steps, ${duration}ms`);
    
  } catch (err) {
    console.error(`[eBay Comps] Fetch job error:`, err);
    
    // Mark as failed with LOW confidence
    const now = new Date();
    const failedExpiryHours = 1; // Retry in 1 hour
    const expiresAt = new Date(now.getTime() + failedExpiryHours * 60 * 60 * 1000);
    
    await db.update(marketCompsCache)
      .set({
        fetchStatus: "failed",
        fetchError: err instanceof Error ? err.message : String(err),
        confidence: "LOW", // Always LOW for failed
        soldCount: 0, // Reset - no reliable data
        lastFetchedAt: now,
        expiresAt
      })
      .where(eq(marketCompsCache.queryHash, queryHash));
    
  } finally {
    // Remove from active jobs
    activeJobs.delete(queryHash);
  }
}

// ============================================================================
// CACHE ACCESS (Stale-While-Revalidate Pattern)
// ============================================================================

interface CacheResult {
  data: MarketCompsCache | null;
  isStale: boolean;
  needsRefresh: boolean;
}

/**
 * Get cached comps with stale-while-revalidate pattern.
 * Returns stale data immediately while triggering background refresh.
 */
export async function getCachedCompsWithSWR(
  queryHash: string,
  canonicalQuery?: string,
  filters?: CompsQueryFilters
): Promise<CacheResult> {
  const now = new Date();
  
  const results = await db.select()
    .from(marketCompsCache)
    .where(eq(marketCompsCache.queryHash, queryHash))
    .limit(1);
  
  if (results.length === 0) {
    return { data: null, isStale: false, needsRefresh: true };
  }
  
  const cached = results[0];
  const expiresAt = cached.expiresAt ? new Date(cached.expiresAt) : null;
  const isStale = !expiresAt || expiresAt <= now;
  const isFetching = cached.fetchStatus === "fetching";
  
  // If stale and not already fetching, trigger background refresh
  const needsRefresh = isStale && !isFetching;
  if (needsRefresh && canonicalQuery && filters) {
    console.log(`[eBay Comps] SWR: Serving stale data for ${queryHash}, triggering background refresh`);
    // Don't await - let it run in background
    enqueueFetchJob(canonicalQuery, queryHash, filters).catch(err => {
      console.error(`[eBay Comps] SWR background refresh failed:`, err);
    });
  }
  
  // Return cached data even if stale (SWR pattern)
  if (cached.fetchStatus === "complete" || cached.compsJson) {
    console.log(`[eBay Comps] Cache ${isStale ? "stale" : "fresh"} hit for ${queryHash}`);
    return { data: cached, isStale, needsRefresh };
  }
  
  return { data: null, isStale: false, needsRefresh: true };
}

/**
 * Get cached comps by query hash (legacy - prefers fresh data)
 */
export async function getCachedComps(queryHash: string): Promise<MarketCompsCache | null> {
  const now = new Date();
  
  const results = await db.select()
    .from(marketCompsCache)
    .where(
      and(
        eq(marketCompsCache.queryHash, queryHash),
        gt(marketCompsCache.expiresAt, now)
      )
    )
    .limit(1);
  
  if (results.length === 0) {
    return null;
  }
  
  console.log(`[eBay Comps] Cache hit for ${queryHash}`);
  return results[0];
}

/**
 * Get cache entry regardless of expiry (for status checking)
 */
export async function getCacheEntry(queryHash: string): Promise<MarketCompsCache | null> {
  const results = await db.select()
    .from(marketCompsCache)
    .where(eq(marketCompsCache.queryHash, queryHash))
    .limit(1);
  
  return results.length > 0 ? results[0] : null;
}
