import { createHash } from "crypto";
import { db } from "./db";
import { marketCompsCache, type EbayComp, type CompsSummary, type CompsQueryFilters, type MarketCompsCache, type LiquidityAssessment, type LiquidityTier } from "@shared/schema";
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

// Colors that indicate parallels when paired with card types
const PARALLEL_COLORS = [
  "silver", "gold", "red", "blue", "green", "purple", "orange", "pink", "black",
  "white", "yellow", "teal", "ruby", "sapphire", "emerald", "bronze", "platinum",
  "ice", "neon", "camo", "hyper", "cosmic", "disco", "mojo", "holo"
];

// Card type/finish terms that make colors meaningful as parallels
const PARALLEL_TYPES = [
  "prizm", "refractor", "optic", "select", "wave", "shimmer", "parallel"
];

// Standalone parallel markers that are unambiguous (won't match team names)
const UNAMBIGUOUS_PARALLELS = [
  // Pattern/finish parallels (distinct terms - these alone indicate a parallel)
  "refractor", "xfractor", "superfractor", "atomic",
  "holographic", "pulsar", "velocity", "scope",
  "speckle", "laser", "reactive", "fluorescent", "marble",
  "cracked ice", "tie-dye", "tie dye", "neon green", "neon orange",
  // Special edition markers
  "ssp", "short print", "case hit", "hobby exclusive", "retail exclusive",
  "1st edition", "first edition", "1/1", "one of one",
  // Specific parallel names
  "camo", "snakeskin", "tiger stripe", "zebra"
];

// Combined list for query extraction (used in normalizeEbayQuery)
const COMMON_PARALLELS = [
  ...UNAMBIGUOUS_PARALLELS,
  // Add color+type combos for query matching
  "silver prizm", "gold prizm", "red prizm", "blue prizm", "green prizm",
  "purple prizm", "orange prizm", "pink prizm", "black prizm",
  "silver refractor", "gold refractor", "blue refractor", "green refractor",
  "hyper prizm", "cosmic prizm", "disco prizm", "mojo prizm",
  "holo optic", "silver optic", "gold optic"
];

/**
 * Check if a title contains any parallel indicators
 * Uses ADJACENCY-AWARE matching: colors only count when ADJACENT to parallel types
 * This prevents false positives from player names like "Jalen Green"
 */
function titleHasParallel(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  
  // Check unambiguous parallels first (simple substring match is safe)
  for (const p of UNAMBIGUOUS_PARALLELS) {
    if (lowerTitle.includes(p.toLowerCase())) {
      return true;
    }
  }
  
  // Check for numbered parallels like /99, #5/25, "numbered to 99", etc.
  if (/\/\d{1,3}\b/.test(lowerTitle) || /\b\d+\s*\/\s*\d+\b/.test(lowerTitle)) {
    return true;
  }
  if (/numbered\s+(to\s+)?\d+/i.test(lowerTitle)) {
    return true;
  }
  
  // ADJACENCY check: color must be NEXT TO a parallel type word
  // Uses flexible spacing to handle "Prizm Silver", "Prizm-Silver", "Prizm / Silver"
  // This prevents "Jalen Green 2023 Prizm" from being flagged as a green parallel
  for (const color of PARALLEL_COLORS) {
    for (const ptype of PARALLEL_TYPES) {
      // Check both orders with flexible separators (space, dash, slash)
      const pattern1 = new RegExp(`\\b${color}[\\s\\-/]+${ptype}\\b`, "i");
      const pattern2 = new RegExp(`\\b${ptype}[\\s\\-/]+${color}\\b`, "i");
      if (pattern1.test(lowerTitle) || pattern2.test(lowerTitle)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if a title matches a specific parallel filter
 * Handles both word orders: "silver prizm" matches "prizm silver"
 * Uses adjacency-aware matching for color-only queries
 */
function titleMatchesParallel(title: string, parallel: string): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerParallel = parallel.toLowerCase();
  
  // Direct substring match
  if (lowerTitle.includes(lowerParallel)) {
    return true;
  }
  
  // Try reversed word order for two-word parallels
  const words = lowerParallel.split(/\s+/);
  if (words.length === 2) {
    const reversed = `${words[1]} ${words[0]}`;
    if (lowerTitle.includes(reversed)) {
      return true;
    }
  }
  
  // For single-color queries, check if color is ADJACENT to any parallel type
  // Uses flexible separators (space, dash, slash)
  if (PARALLEL_COLORS.includes(lowerParallel)) {
    for (const ptype of PARALLEL_TYPES) {
      const pattern1 = new RegExp(`\\b${lowerParallel}[\\s\\-/]+${ptype}\\b`, "i");
      const pattern2 = new RegExp(`\\b${ptype}[\\s\\-/]+${lowerParallel}\\b`, "i");
      if (pattern1.test(lowerTitle) || pattern2.test(lowerTitle)) {
        return true;
      }
    }
  }
  
  return false;
}

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
  
  // Extract parallel - check for color+type pairs in ANY order
  // First try exact multi-word parallels from COMMON_PARALLELS
  for (const parallel of COMMON_PARALLELS) {
    if (normalized.includes(parallel)) {
      filters.parallel = parallel;
      break;
    }
  }
  
  // If no exact match, check for color+type pairs in any order with flexible spacing
  if (!filters.parallel) {
    for (const color of PARALLEL_COLORS) {
      for (const ptype of PARALLEL_TYPES) {
        // Match "silver prizm", "prizm silver", "silver-prizm", etc.
        const pattern1 = new RegExp(`\\b${color}[\\s\\-/]*${ptype}\\b`, "i");
        const pattern2 = new RegExp(`\\b${ptype}[\\s\\-/]*${color}\\b`, "i");
        if (pattern1.test(normalized) || pattern2.test(normalized)) {
          filters.parallel = `${color} ${ptype}`;
          break;
        }
      }
      if (filters.parallel) break;
    }
  }
  
  // NOTE: We do NOT do a Stage 3 fallback for non-adjacent colors
  // because this would incorrectly flag player names like "Jalen Green"
  // Users must specify parallels explicitly (e.g., "silver prizm" or "prizm silver")
  
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
  
  // Parallel/variation check (STRICT - variation is a critical filter)
  // Uses context-aware detection to avoid false positives with team names
  const resultHasParallel = titleHasParallel(title);
  
  if (filters.parallel) {
    // User specified a parallel - MUST match (handles word order variations)
    maxScore += 0.2;
    if (titleMatchesParallel(title, filters.parallel)) {
      score += 0.2;
    } else {
      // Wrong parallel or no parallel when one was specified - hard reject
      return 0;
    }
  } else {
    // No parallel specified = user wants BASE CARD only
    // Reject any results with parallel markers (context-aware check)
    maxScore += 0.15;
    if (resultHasParallel) {
      // Result has a parallel but user wants base - hard reject
      return 0;
    } else {
      // Base card as expected
      score += 0.15;
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

// Max items we can scrape before hitting limits (4 pages x 60 items = 240, targeting 150+ for popular cards)
const MAX_SCRAPE_ITEMS = 150;

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
      trendSlope: 0,
      cappedAtMax: false
    };
  }
  
  // Flag if we hit scraping limits - actual market volume likely higher
  const cappedAtMax = comps.length >= MAX_SCRAPE_ITEMS;
  
  const prices = comps.map(c => c.totalPrice).sort((a, b) => a - b);
  const soldCount = prices.length;
  
  // Calculate date coverage from sold dates
  const now = new Date();
  const soldDates = comps
    .filter(c => c.soldDate)
    .map(c => new Date(c.soldDate!))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  
  let dateCoverageDays = 30; // Default assumption
  let oldestSaleDate: string | undefined;
  let newestSaleDate: string | undefined;
  
  if (soldDates.length >= 2) {
    oldestSaleDate = soldDates[0].toISOString().split("T")[0];
    newestSaleDate = soldDates[soldDates.length - 1].toISOString().split("T")[0];
    dateCoverageDays = Math.max(1, Math.ceil(
      (soldDates[soldDates.length - 1].getTime() - soldDates[0].getTime()) / (1000 * 60 * 60 * 24)
    ));
  } else if (soldDates.length === 1) {
    oldestSaleDate = soldDates[0].toISOString().split("T")[0];
    newestSaleDate = oldestSaleDate;
    dateCoverageDays = 1;
  }
  
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
    trendSlope: Math.round(trendSlope * 100) / 100,
    cappedAtMax,
    dateCoverageDays,
    oldestSaleDate,
    newestSaleDate
  };
}

/**
 * Determine confidence level based on sold count and match quality
 * LOW if < 5 comps, MED if 5-14, HIGH if 15+ with good match score
 * 
 * IMPORTANT: If cappedAtMax is true, we hit our scraping limit (50+ items),
 * which means the actual market likely has even MORE volume. This should
 * be treated as HIGH liquidity/confidence for data reliability.
 */
export function calculateConfidence(
  soldCount: number,
  avgMatchScore: number,
  isFallback: boolean = false,
  cappedAtMax: boolean = false
): "HIGH" | "MED" | "LOW" {
  // If fallback/blocked, always LOW confidence
  if (isFallback) {
    return "LOW";
  }
  
  // If we capped out on scraping, this is a high-volume card - trust the data
  if (cappedAtMax && avgMatchScore >= 0.5) {
    return "HIGH";
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

/**
 * Calculate query specificity score based on how many filter components are present.
 * Higher score = more specific query = more reliable match quality.
 * 
 * Returns: 0.0-1.0 score and a match quality tier
 */
export function calculateQuerySpecificity(filters: CompsQueryFilters): {
  score: number;
  matchQuality: "EXACT" | "CLOSE" | "BROAD";
} {
  let score = 0;
  const maxScore = 7;
  
  // Core identifiers (high value)
  if (filters.player) score += 2;
  if (filters.year) score += 1;
  if (filters.set) score += 1.5;
  
  // Card specifics (medium value)
  if (filters.cardNumber) score += 1;
  if (filters.parallel) score += 0.5;
  
  // Grade (indicates exact condition match)
  if (filters.grade && filters.grader) score += 1;
  
  const normalized = score / maxScore;
  
  // Map to match quality tier
  let matchQuality: "EXACT" | "CLOSE" | "BROAD";
  if (normalized >= 0.7) {
    matchQuality = "EXACT"; // Player + year + set + grade
  } else if (normalized >= 0.4) {
    matchQuality = "CLOSE"; // Player + some specifics
  } else {
    matchQuality = "BROAD"; // Just player name or very generic
  }
  
  return { score: normalized, matchQuality };
}

/**
 * Calculate comprehensive liquidity assessment.
 * Separates tier from confidence and provides user-facing explanation.
 */
export function calculateLiquidityAssessment(
  soldCount: number,
  cappedAtMax: boolean,
  dateCoverageDays: number,
  avgMatchScore: number,
  querySpecificity: { score: number; matchQuality: "EXACT" | "CLOSE" | "BROAD" },
  scrapeHealth: "GOOD" | "DEGRADED" | "FAILED"
): LiquidityAssessment {
  const { matchQuality } = querySpecificity;
  
  // If scrape failed or was blocked, we can't make reliable claims
  if (scrapeHealth === "FAILED") {
    return {
      tier: "UNCERTAIN",
      confidence: "LOW",
      explanation: "Unable to retrieve market data. Liquidity unknown.",
      matchQuality,
      dateCoverageDays
    };
  }
  
  // If scrape was degraded (partial data, rate limited)
  if (scrapeHealth === "DEGRADED" && soldCount < 5) {
    return {
      tier: "UNCERTAIN",
      confidence: "LOW",
      explanation: "Limited data retrieved. Liquidity estimate is uncertain.",
      matchQuality,
      dateCoverageDays
    };
  }
  
  // Cap hit = at least HIGH liquidity (likely much higher)
  if (cappedAtMax) {
    const tier = querySpecificity.score >= 0.6 ? "VERY_HIGH" : "HIGH";
    return {
      tier,
      confidence: avgMatchScore >= 0.6 ? "HIGH" : "MED",
      explanation: tier === "VERY_HIGH" 
        ? "Very high liquidity (data limit reached; market is extremely active)."
        : "High liquidity (data limit reached; likely higher volume).",
      matchQuality,
      dateCoverageDays
    };
  }
  
  // Check if we have good date coverage (at least 14 days for reliable liquidity)
  const hasGoodCoverage = dateCoverageDays >= 14;
  const hasMinimalCoverage = dateCoverageDays >= 7;
  
  // Calculate effective liquidity based on sales per period
  const salesPerWeek = soldCount / Math.max(1, dateCoverageDays / 7);
  
  // Determine tier based on count and coverage
  let tier: LiquidityTier;
  let confidence: "HIGH" | "MED" | "LOW";
  let explanation: string;
  
  if (soldCount >= 30 && hasGoodCoverage) {
    tier = "HIGH";
    confidence = avgMatchScore >= 0.6 ? "HIGH" : "MED";
    explanation = `High liquidity (${soldCount} sales in ${dateCoverageDays} days).`;
  } else if (soldCount >= 10 && hasMinimalCoverage) {
    tier = "MEDIUM";
    confidence = hasGoodCoverage && avgMatchScore >= 0.5 ? "MED" : "LOW";
    explanation = `Moderate liquidity (${soldCount} sales in ${dateCoverageDays} days).`;
  } else if (soldCount >= 3 && hasMinimalCoverage) {
    tier = "LOW";
    confidence = hasGoodCoverage ? "MED" : "LOW";
    explanation = `Low liquidity (${soldCount} sales found). May be harder to buy/sell quickly.`;
  } else if (soldCount > 0) {
    // Few sales but data may be incomplete
    if (dateCoverageDays < 7) {
      tier = "UNCERTAIN";
      confidence = "LOW";
      explanation = `Limited sample (${soldCount} sales in ${dateCoverageDays} days). Liquidity uncertain.`;
    } else {
      tier = "LOW";
      confidence = "MED";
      explanation = `Low liquidity (only ${soldCount} sales found with good coverage).`;
    }
  } else {
    tier = "UNCERTAIN";
    confidence = "LOW";
    explanation = "No recent sales found. Liquidity cannot be determined.";
  }
  
  // Adjust explanation for broad queries
  if (matchQuality === "BROAD" && tier !== "UNCERTAIN") {
    explanation += " Note: Based on similar cards, not exact match.";
  }
  
  return {
    tier,
    confidence,
    explanation,
    matchQuality,
    dateCoverageDays
  };
}

/**
 * Convert fetchStatus to scrapeHealth for liquidity assessment
 */
export function fetchStatusToScrapeHealth(
  fetchStatus: string | null | undefined, 
  failureCount?: number
): "GOOD" | "DEGRADED" | "FAILED" {
  if (!fetchStatus || fetchStatus === "failed") {
    return "FAILED";
  }
  if (fetchStatus === "blocked") {
    return "FAILED";
  }
  if (fetchStatus === "pending") {
    return "DEGRADED";
  }
  // "complete" status but with some failures indicates degraded data
  if (failureCount && failureCount > 0) {
    return "DEGRADED";
  }
  return "GOOD";
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
// Adaptive scraping: start conservative, only expand if early pages are full
const ITEMS_PER_PAGE = 60; // eBay returns ~60 items per page
const FULL_PAGE_THRESHOLD = 50; // Consider page "full" if 50+ items

async function scrapeEbaySoldListings(
  canonicalQuery: string,
  maxPages: number = 3, // Conservative default, will expand adaptively
  maxItems: number = 150
): Promise<{ comps: EbayComp[]; pagesScraped: number; error?: string; isBlocked?: boolean }> {
  const comps: EbayComp[] = [];
  let pagesScraped = 0;
  let consecutiveEmptyPages = 0;
  let shouldExpandPages = true; // Adaptive: only continue if pages are returning full results
  
  console.log(`[eBay Scraper] Starting scrape for: "${canonicalQuery}" (max ${maxPages} pages)`);
  
  for (let page = 1; page <= maxPages; page++) {
    if (comps.length >= maxItems) {
      console.log(`[eBay Scraper] Reached ${maxItems} items limit, stopping`);
      break;
    }
    
    // Stop if we've had 2 consecutive empty pages (likely no more results)
    if (consecutiveEmptyPages >= 2) {
      console.log(`[eBay Scraper] 2 consecutive empty pages, stopping`);
      break;
    }
    
    // Adaptive: if page 1 wasn't full, don't bother with more pages
    if (page > 1 && !shouldExpandPages) {
      console.log(`[eBay Scraper] Previous page not full, stopping early`);
      break;
    }
    
    try {
      const url = buildEbaySearchUrl(canonicalQuery, page);
      console.log(`[eBay Scraper] Fetching page ${page}/${maxPages}: ${url}`);
      
      // Exponential delays: significantly longer for later pages
      if (page > 1) {
        // 10s base, then 15s, 22s (exponential with jitter)
        const baseDelay = 10000 * Math.pow(1.5, page - 2);
        await randomDelay(baseDelay, baseDelay + 5000);
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
        consecutiveEmptyPages++;
        shouldExpandPages = false;
        console.log(`[eBay Scraper] Empty page ${page}, consecutive empty: ${consecutiveEmptyPages}`);
      } else {
        consecutiveEmptyPages = 0; // Reset counter on successful page
        comps.push(...pageComps);
        
        // Adaptive: only continue to next page if this one was reasonably full
        if (pageComps.length < FULL_PAGE_THRESHOLD) {
          shouldExpandPages = false;
          console.log(`[eBay Scraper] Page ${page} not full (${pageComps.length}/${FULL_PAGE_THRESHOLD}), won't expand further`);
        }
      }
      
    } catch (err) {
      console.error(`[eBay Scraper] Error on page ${page}:`, err);
      consecutiveEmptyPages++; // Count errors as empty pages for safety
      shouldExpandPages = false; // Don't expand on errors
    }
  }
  
  console.log(`[eBay Scraper] Completed: ${comps.length} items from ${pagesScraped} pages`);
  return { comps, pagesScraped };
}

/**
 * Parse eBay listing HTML to extract comp data
 * Updated Dec 2024: eBay now uses s-card class structure instead of s-item
 */
function parseEbayListings(html: string): EbayComp[] {
  const comps: EbayComp[] = [];
  
  // Try new eBay structure first (s-card), fall back to old (s-item)
  // New structure: <li ... class="s-card s-card--horizontal ...">
  const newItemPattern = /<li[^>]*class="s-card[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  const oldItemPattern = /<li class="s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  
  // Check which pattern exists in the HTML
  const useNewStructure = html.includes('class="s-card');
  const itemPattern = useNewStructure ? newItemPattern : oldItemPattern;
  
  let match;
  let itemCount = 0;
  
  while ((match = itemPattern.exec(html)) !== null) {
    const itemHtml = match[0]; // Full match including the li tag
    itemCount++;
    
    // Skip ads/promoted listings
    if (itemHtml.includes("SPONSORED") || itemHtml.includes("s-item__ad")) {
      continue;
    }
    
    let title = "";
    let soldPrice: number | null = null;
    let itemUrl: string | undefined;
    let imageUrl: string | undefined;
    
    if (useNewStructure) {
      // NEW EBAY STRUCTURE (Dec 2024+)
      // Title is in the alt attribute of the card image
      const altMatch = itemHtml.match(/alt="([^"]+)"/);
      title = altMatch ? altMatch[1].trim() : "";
      
      // Skip "Shop on eBay" promo cards
      if (!title || title === "Shop on eBay") continue;
      
      // Price is in s-card__price class
      const priceMatch = itemHtml.match(/s-card__price[^>]*>([^<]+)/);
      if (priceMatch) {
        soldPrice = parsePrice(priceMatch[1]);
      }
      
      // URL pattern: href=https://www.ebay.com/itm/[id]... or href="https://..."
      const urlMatch = itemHtml.match(/href=['"]?(https:\/\/(?:www\.)?ebay\.com\/itm\/\d+)/);
      if (urlMatch) {
        itemUrl = urlMatch[1];
      }
      
      // Image from src or data-defer-load attribute
      const imgMatch = itemHtml.match(/(?:src|data-defer-load)=['"]?(https:\/\/i\.ebayimg\.com[^'">\s]+)/);
      if (imgMatch) {
        imageUrl = imgMatch[1];
      }
    } else {
      // OLD EBAY STRUCTURE (legacy fallback)
      const titleMatch = itemHtml.match(/class="s-item__title[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)/);
      title = titleMatch ? titleMatch[1].trim() : "";
      
      if (!title || title === "Shop on eBay") continue;
      
      const priceMatch = itemHtml.match(/class="s-item__price[^"]*"[^>]*>([^<]+)/);
      soldPrice = priceMatch ? parsePrice(priceMatch[1]) : null;
      
      const urlMatch = itemHtml.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/);
      itemUrl = urlMatch ? urlMatch[1].split("?")[0] : undefined;
      
      const imgMatch = itemHtml.match(/src="(https:\/\/i\.ebayimg\.com[^"]+)"/);
      imageUrl = imgMatch ? imgMatch[1] : undefined;
    }
    
    if (!soldPrice) continue;
    
    // Extract shipping (common to both structures)
    let shippingPrice = 0;
    const shippingMatch = itemHtml.match(/(?:s-item__shipping|shipping)[^"]*"[^>]*>([^<]+)/i);
    if (shippingMatch) {
      const shippingText = shippingMatch[1].toLowerCase();
      if (!shippingText.includes("free")) {
        const parsed = parsePrice(shippingMatch[1]);
        if (parsed) shippingPrice = parsed;
      }
    }
    
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
  
  console.log(`[eBay Parser] Parsed ${comps.length} valid comps from ${itemCount} items (structure: ${useNewStructure ? 'new s-card' : 'old s-item'})`);
  
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
      
      // Scrape eBay with adaptive limits - starts conservative, expands only if pages are full
      const { comps: rawComps, pagesScraped, error: scrapeError, isBlocked } = await scrapeEbaySoldListings(
        currentQuery,
        3, // max pages - adaptive expansion based on page fullness
        150 // max items target
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
    
    // Calculate price IQR (interquartile range) for dispersion measurement
    let priceIqr: number | null = null;
    if (filteredComps.length >= 4) {
      const sortedPrices = filteredComps.map(c => c.totalPrice).sort((a, b) => a - b);
      const q1Idx = Math.floor(sortedPrices.length * 0.25);
      const q3Idx = Math.floor(sortedPrices.length * 0.75);
      priceIqr = sortedPrices[q3Idx] - sortedPrices[q1Idx];
    }
    
    // Track if query was broadened
    const queryBroadened = queriesUsed.length > 1;
    if (queryBroadened) {
      recordQueryBroadened();
    }
    
    // Determine confidence (not fallback since we have real eBay data)
    // Pass cappedAtMax to boost confidence for high-volume cards
    const confidence = calculateConfidence(summary.soldCount, avgMatchScore, false, summary.cappedAtMax);
    
    // Calculate expiry with longer TTLs for reliability:
    // - 7 days (168h) for strong data (>=15 comps)
    // - 3 days (72h) for medium data (6-14 comps)
    // - 1 day (24h) for sparse data (<=5 comps)
    const now = new Date();
    const expiryHours = summary.soldCount >= 15 ? 168 : summary.soldCount <= 5 ? 24 : 72;
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
    
    // Update cache with ladder results (reset failure count on success)
    await db.update(marketCompsCache)
      .set({
        soldCount: summary.soldCount,
        compsJson: filteredComps,
        summaryJson: summary,
        confidence,
        avgMatchScore,
        priceIqr,
        queryBroadened,
        ladderStepsUsed: queriesUsed.length,
        fetchStatus: wasBlocked ? "blocked" : "complete",
        fetchError: lastError || null,
        failureCount: 0, // Reset on success
        pagesScraped: totalPagesScraped,
        itemsFound: allComps.length, // Total items collected
        itemsKept: filteredComps.length,
        lastFetchedAt: now,
        expiresAt
      })
      .where(eq(marketCompsCache.queryHash, queryHash));
    
    // Record success for observability
    recordRefreshSuccess();
    
    const duration = Date.now() - startTime;
    console.log(`[eBay Comps] Fetch complete for ${queryHash}: ${filteredComps.length} comps, ${confidence} confidence, ${queriesUsed.length} ladder steps, IQR=$${priceIqr?.toFixed(2) || 'N/A'}, ${duration}ms`);
    
  } catch (err) {
    console.error(`[eBay Comps] Fetch job error:`, err);
    
    // Record failure for observability
    recordRefreshFailed();
    
    // Mark as failed with LOW confidence, increment failure count
    const now = new Date();
    const failedExpiryHours = 1; // Retry in 1 hour
    const expiresAt = new Date(now.getTime() + failedExpiryHours * 60 * 60 * 1000);
    
    // Get current failure count to increment
    const existing = await db.select({ failureCount: marketCompsCache.failureCount })
      .from(marketCompsCache)
      .where(eq(marketCompsCache.queryHash, queryHash))
      .limit(1);
    const currentFailures = existing[0]?.failureCount || 0;
    
    await db.update(marketCompsCache)
      .set({
        fetchStatus: "failed",
        fetchError: err instanceof Error ? err.message : String(err),
        failureCount: currentFailures + 1, // Increment failure count
        confidence: "LOW", // Always LOW for failed
        soldCount: 0, // Reset - no reliable data
        lastFetchedAt: now,
        expiresAt
      })
      .where(eq(marketCompsCache.queryHash, queryHash));
    
    console.log(`[eBay Comps] Failure #${currentFailures + 1} for ${queryHash}`);
    
  } finally {
    // Remove from active jobs
    activeJobs.delete(queryHash);
  }
}

// ============================================================================
// CACHE ACCESS (Stale-While-Revalidate Pattern)
// ============================================================================

// Maximum age to serve stale data (30 days) - refuse to serve ancient comps
const MAX_STALE_DAYS = 30;
const MAX_STALE_MS = MAX_STALE_DAYS * 24 * 60 * 60 * 1000;

interface CacheResult {
  data: MarketCompsCache | null;
  isStale: boolean;
  needsRefresh: boolean;
  isTooOld?: boolean; // True if data is older than MAX_STALE_DAYS
}

// Observability counters
const cacheStats = {
  freshHits: 0,
  staleHits: 0,
  misses: 0,
  tooOldRejections: 0,
  refreshTriggered: 0,
  refreshSuccess: 0,
  refreshFailed: 0,
  queryBroadened: 0,
};

/**
 * Get cache stats for observability
 */
export function getCacheStats() {
  const total = cacheStats.freshHits + cacheStats.staleHits + cacheStats.misses;
  return {
    ...cacheStats,
    total,
    hitRate: total > 0 ? ((cacheStats.freshHits + cacheStats.staleHits) / total * 100).toFixed(1) + '%' : '0%',
    freshHitRate: total > 0 ? (cacheStats.freshHits / total * 100).toFixed(1) + '%' : '0%',
    staleHitRate: total > 0 ? (cacheStats.staleHits / total * 100).toFixed(1) + '%' : '0%',
    refreshSuccessRate: cacheStats.refreshTriggered > 0 
      ? (cacheStats.refreshSuccess / cacheStats.refreshTriggered * 100).toFixed(1) + '%' 
      : '0%',
  };
}

/**
 * Reset cache stats (useful for testing or daily reset)
 */
export function resetCacheStats() {
  cacheStats.freshHits = 0;
  cacheStats.staleHits = 0;
  cacheStats.misses = 0;
  cacheStats.tooOldRejections = 0;
  cacheStats.refreshTriggered = 0;
  cacheStats.refreshSuccess = 0;
  cacheStats.refreshFailed = 0;
  cacheStats.queryBroadened = 0;
}

/**
 * Increment refresh success counter (called after successful job)
 */
export function recordRefreshSuccess() {
  cacheStats.refreshSuccess++;
}

/**
 * Increment refresh failed counter (called after failed job)
 */
export function recordRefreshFailed() {
  cacheStats.refreshFailed++;
}

/**
 * Increment query broadened counter
 */
export function recordQueryBroadened() {
  cacheStats.queryBroadened++;
}

/**
 * Get cached comps with stale-while-revalidate pattern.
 * Returns stale data immediately while triggering background refresh.
 * 
 * Key behaviors:
 * - Fresh data: Return immediately
 * - Stale data (< 30 days): Return immediately, trigger background refresh
 * - Ancient data (> 30 days): Return null, trigger refresh (refuse to serve)
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
    cacheStats.misses++;
    return { data: null, isStale: false, needsRefresh: true };
  }
  
  const cached = results[0];
  const expiresAt = cached.expiresAt ? new Date(cached.expiresAt) : null;
  const lastFetchedAt = cached.lastFetchedAt ? new Date(cached.lastFetchedAt) : null;
  const isStale = !expiresAt || expiresAt <= now;
  const isFetching = cached.fetchStatus === "fetching";
  
  // Check if data is too old to serve (max stale cutoff)
  const dataAge = lastFetchedAt ? now.getTime() - lastFetchedAt.getTime() : MAX_STALE_MS + 1;
  const isTooOld = dataAge > MAX_STALE_MS;
  
  if (isTooOld && (cached.fetchStatus === "complete" || cached.compsJson)) {
    cacheStats.tooOldRejections++;
    console.log(`[eBay Comps] SWR: Data too old (${Math.floor(dataAge / 86400000)} days) for ${queryHash}, refusing to serve`);
    
    // Trigger refresh if not already fetching
    if (!isFetching && canonicalQuery && filters) {
      cacheStats.refreshTriggered++;
      enqueueFetchJob(canonicalQuery, queryHash, filters).catch(err => {
        console.error(`[eBay Comps] SWR refresh for ancient data failed:`, err);
      });
    }
    
    return { data: null, isStale: true, needsRefresh: true, isTooOld: true };
  }
  
  // If stale and not already fetching, trigger background refresh
  const needsRefresh = isStale && !isFetching;
  if (needsRefresh && canonicalQuery && filters) {
    cacheStats.refreshTriggered++;
    console.log(`[eBay Comps] SWR: Serving stale data for ${queryHash}, triggering background refresh`);
    // Don't await - let it run in background
    enqueueFetchJob(canonicalQuery, queryHash, filters).catch(err => {
      console.error(`[eBay Comps] SWR background refresh failed:`, err);
    });
  }
  
  // Return cached data even if stale (SWR pattern)
  if (cached.fetchStatus === "complete" || cached.compsJson) {
    if (isStale) {
      cacheStats.staleHits++;
    } else {
      cacheStats.freshHits++;
    }
    console.log(`[eBay Comps] Cache ${isStale ? "stale" : "fresh"} hit for ${queryHash}`);
    return { data: cached, isStale, needsRefresh };
  }
  
  cacheStats.misses++;
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
