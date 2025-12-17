/**
 * Nightly Prewarm Job for eBay Comps Cache
 * 
 * This job runs in the background to refresh cached comps for frequently searched cards.
 * It uses a single worker with long delays to avoid rate limiting.
 * 
 * Usage:
 * - Call startPrewarmJob() once on server startup
 * - The job runs every 24 hours at 3 AM UTC by default
 * - Can be triggered manually via triggerPrewarm()
 */

import { db } from "./db";
import { marketCompsCache, cards, bookmarks, users, displayCases } from "@shared/schema";
import { desc, isNotNull, sql, and, lt, gt, eq } from "drizzle-orm";
import { enqueueFetchJob, normalizeEbayQuery, getActiveJobCount } from "./ebayCompsService";

// Configuration
const PREWARM_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PREWARM_HOUR_UTC = 3; // 3 AM UTC
const MAX_CARDS_PER_RUN = 75; // Increased to accommodate priority tiers
const DELAY_BETWEEN_JOBS_MS = 60 * 1000; // 1 minute between each card
const MIN_HOURS_BEFORE_EXPIRY = 12; // Only prewarm if expiring within 12 hours

// Priority allocation (how many slots per category)
// Keys match the priority values used in PrewarmCard
const PRIORITY_SLOTS: Record<PrewarmCard['priority'], number> = {
  'high-volatility': 15, // Cards with high price IQR (uncertainty)
  'bookmarked': 15,      // Cards users are watching
  'pro-user': 15,        // Cards owned by Pro subscribers
  'expiring': 15,        // Cache entries expiring soon
  'popular': 15,         // Frequently added cards
};

let prewarmTimer: NodeJS.Timeout | null = null;
let isRunning = false;

interface PrewarmCard {
  // For cards from cache, use these directly
  canonicalQuery?: string;
  queryHash?: string;
  filters?: Record<string, unknown>;
  // For cards from collection, build query from these
  title?: string;
  playerName?: string | null;
  year?: string | number | null;
  set?: string | null;
  grade?: string | null;
  priority: 'high-volatility' | 'bookmarked' | 'pro-user' | 'expiring' | 'popular';
}

/**
 * Get top searched cards based on priority tiers:
 * 1. High-volatility cards (high price IQR - uncertain values)
 * 2. Bookmarked/watched cards (user interest)
 * 3. Pro user cards (paying customers)
 * 4. Expiring cache entries
 * 5. Popular cards in collections
 * 
 * Uses queryHash for deduplication. Cache-based tiers pass queryHash directly
 * to avoid re-normalization issues.
 */
async function getTopCardsToPrewarm(): Promise<PrewarmCard[]> {
  const results: PrewarmCard[] = [];
  const seenHashes = new Set<string>(); // Dedupe by queryHash
  
  // Per-tier counters to enforce slot allocation
  const tierCounts: Record<string, number> = {
    'high-volatility': 0,
    'bookmarked': 0,
    'pro-user': 0,
    'expiring': 0,
    'popular': 0,
  };
  
  // Helper to add card if not duplicate, under global limit, and tier not exhausted
  const addIfUnique = (card: PrewarmCard, hash: string): boolean => {
    if (results.length >= MAX_CARDS_PER_RUN) return false;
    if (seenHashes.has(hash)) return false;
    
    // Check per-tier limit
    const tierKey = card.priority as keyof typeof PRIORITY_SLOTS;
    if (tierCounts[tierKey] >= PRIORITY_SLOTS[tierKey]) return false;
    
    seenHashes.add(hash);
    results.push(card);
    tierCounts[tierKey]++;
    return true;
  };
  
  try {
    // Tier 1: High-volatility cards (high price IQR indicates price uncertainty)
    // Read queryHash and filtersJson directly to avoid re-normalization
    const highVolatilityEntries = await db.select({
      canonicalQuery: marketCompsCache.canonicalQuery,
      queryHash: marketCompsCache.queryHash,
      filters: marketCompsCache.filters,
      priceIqr: marketCompsCache.priceIqr
    })
    .from(marketCompsCache)
    .where(
      and(
        gt(marketCompsCache.priceIqr, 50), // High price dispersion (>$50 IQR)
        gt(marketCompsCache.soldCount, 5), // Enough data to be meaningful
        eq(marketCompsCache.fetchStatus, "complete")
      )
    )
    .orderBy(desc(marketCompsCache.priceIqr)) // Most volatile first
    .limit(PRIORITY_SLOTS['high-volatility'] * 2); // Fetch extra for dedupe buffer
    
    let added = 0;
    for (const entry of highVolatilityEntries) {
      if (entry.queryHash && entry.canonicalQuery) {
        if (addIfUnique({
          canonicalQuery: entry.canonicalQuery,
          queryHash: entry.queryHash,
          filters: entry.filters as Record<string, unknown> || {},
          priority: 'high-volatility'
        }, entry.queryHash)) {
          added++;
        }
      }
    }
    console.log(`[Prewarm] Added ${added} high-volatility cards`);
    
    // Tier 2: Bookmarked cards (cards users are actively watching)
    const bookmarkedCards = await db.select({
      title: cards.title,
      playerName: cards.playerName,
      year: cards.year,
      set: cards.set,
      grade: cards.grade,
      bookmarkCount: sql<number>`count(*)`.as('bookmark_count')
    })
    .from(bookmarks)
    .innerJoin(cards, eq(bookmarks.cardId, cards.id))
    .where(isNotNull(cards.playerName))
    .groupBy(cards.id, cards.title, cards.playerName, cards.year, cards.set, cards.grade)
    .orderBy(desc(sql`count(*)`)) // Most bookmarked first
    .limit(PRIORITY_SLOTS['bookmarked'] * 2); // Fetch extra for dedupe buffer
    
    added = 0;
    for (const card of bookmarkedCards) {
      const { queryHash } = normalizeEbayQuery(buildSearchQuery(card));
      if (addIfUnique({
        title: card.title,
        playerName: card.playerName,
        year: card.year,
        set: card.set,
        grade: card.grade,
        priority: 'bookmarked'
      }, queryHash)) {
        added++;
      }
    }
    console.log(`[Prewarm] Added ${added} bookmarked cards`);
    
    // Tier 3: Pro user cards (prioritize paying customers)
    const proUserCards = await db.select({
      title: cards.title,
      playerName: cards.playerName,
      year: cards.year,
      set: cards.set,
      grade: cards.grade
    })
    .from(cards)
    .innerJoin(displayCases, eq(cards.displayCaseId, displayCases.id))
    .innerJoin(users, eq(displayCases.userId, users.id))
    .where(
      and(
        eq(users.subscriptionStatus, "PRO"),
        isNotNull(cards.playerName),
        isNotNull(cards.year)
      )
    )
    .orderBy(desc(cards.estimatedValue)) // Highest value cards first
    .limit(PRIORITY_SLOTS['pro-user'] * 2); // Fetch extra for dedupe buffer
    
    added = 0;
    for (const card of proUserCards) {
      const { queryHash } = normalizeEbayQuery(buildSearchQuery(card));
      if (addIfUnique({
        title: card.title,
        playerName: card.playerName,
        year: card.year,
        set: card.set,
        grade: card.grade,
        priority: 'pro-user'
      }, queryHash)) {
        added++;
      }
    }
    console.log(`[Prewarm] Added ${added} Pro user cards`);
    
    // Tier 4: Expiring cache entries (maintain cache freshness)
    // Read queryHash and filtersJson directly
    const expiringCacheEntries = await db.select({
      canonicalQuery: marketCompsCache.canonicalQuery,
      queryHash: marketCompsCache.queryHash,
      filters: marketCompsCache.filters,
      soldCount: marketCompsCache.soldCount
    })
    .from(marketCompsCache)
    .where(
      and(
        gt(marketCompsCache.soldCount, 5),
        lt(marketCompsCache.expiresAt, new Date(Date.now() + MIN_HOURS_BEFORE_EXPIRY * 60 * 60 * 1000)),
        eq(marketCompsCache.fetchStatus, "complete")
      )
    )
    .orderBy(desc(marketCompsCache.soldCount))
    .limit(PRIORITY_SLOTS['expiring'] * 2); // Fetch extra for dedupe buffer
    
    added = 0;
    for (const entry of expiringCacheEntries) {
      if (entry.queryHash && entry.canonicalQuery) {
        if (addIfUnique({
          canonicalQuery: entry.canonicalQuery,
          queryHash: entry.queryHash,
          filters: entry.filters as Record<string, unknown> || {},
          priority: 'expiring'
        }, entry.queryHash)) {
          added++;
        }
      }
    }
    console.log(`[Prewarm] Added ${added} expiring cache entries`);
    
    // Tier 5: Popular cards (frequently added to collections)
    const popularCards = await db.select({
      title: cards.title,
      playerName: cards.playerName,
      year: cards.year,
      set: cards.set,
      grade: cards.grade,
      cardCount: sql<number>`count(*)`.as('card_count')
    })
    .from(cards)
    .where(
      and(
        isNotNull(cards.playerName),
        isNotNull(cards.year)
      )
    )
    .groupBy(cards.title, cards.playerName, cards.year, cards.set, cards.grade)
    .orderBy(desc(sql`count(*)`))
    .limit(PRIORITY_SLOTS['popular'] * 2); // Fetch extra for dedupe buffer
    
    added = 0;
    for (const card of popularCards) {
      const { queryHash } = normalizeEbayQuery(buildSearchQuery(card));
      if (addIfUnique({
        title: card.title,
        playerName: card.playerName,
        year: card.year,
        set: card.set,
        grade: card.grade,
        priority: 'popular'
      }, queryHash)) {
        added++;
      }
    }
    console.log(`[Prewarm] Added ${added} popular cards`);
    
    console.log(`[Prewarm] Total unique cards to prewarm: ${results.length}`);
    return results;
  } catch (error) {
    console.error("[Prewarm] Error fetching cards to prewarm:", error);
    return [];
  }
}

/**
 * Build a search query from card data
 */
function buildSearchQuery(card: { title: string; playerName: string | null; year: string | number | null; set: string | null; grade: string | null }): string {
  const parts: string[] = [];
  
  if (card.year) parts.push(String(card.year));
  if (card.set) parts.push(card.set);
  if (card.playerName) parts.push(card.playerName);
  if (card.grade) parts.push(card.grade);
  
  // If we have specific parts, use them; otherwise fall back to title
  return parts.length > 0 ? parts.join(" ") : card.title;
}

/**
 * Run the prewarm job
 */
async function runPrewarmJob(): Promise<void> {
  if (isRunning) {
    console.log("[Prewarm] Job already running, skipping");
    return;
  }
  
  isRunning = true;
  const startTime = Date.now();
  let processed = 0;
  let queued = 0;
  let skipped = 0;
  
  // Track stats by priority tier
  const tierStats: Record<string, { queued: number; skipped: number }> = {
    'high-volatility': { queued: 0, skipped: 0 },
    'bookmarked': { queued: 0, skipped: 0 },
    'pro-user': { queued: 0, skipped: 0 },
    'expiring': { queued: 0, skipped: 0 },
    'popular': { queued: 0, skipped: 0 },
  };
  
  console.log("[Prewarm] Starting nightly prewarm job with priority tiers");
  
  try {
    const cardsToWarm = await getTopCardsToPrewarm();
    console.log(`[Prewarm] Found ${cardsToWarm.length} cards to prewarm`);
    
    for (const card of cardsToWarm) {
      processed++;
      
      // Check if there's already a job running
      if (getActiveJobCount() >= 1) {
        console.log(`[Prewarm] Waiting for active job to complete...`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
      }
      
      // Use pre-computed values from cache tiers, or compute for card-based tiers
      let canonicalQuery: string;
      let queryHash: string;
      let filters: Record<string, unknown>;
      
      if (card.queryHash && card.canonicalQuery) {
        // Cache-based tier: use pre-computed values directly
        canonicalQuery = card.canonicalQuery;
        queryHash = card.queryHash;
        filters = card.filters || {};
      } else {
        // Card-based tier: build and normalize query
        const query = buildSearchQuery({
          title: card.title || '',
          playerName: card.playerName || null,
          year: card.year || null,
          set: card.set || null,
          grade: card.grade || null
        });
        const normalized = normalizeEbayQuery(query);
        canonicalQuery = normalized.canonicalQuery;
        queryHash = normalized.queryHash;
        filters = normalized.filters;
      }
      
      console.log(`[Prewarm] Processing ${processed}/${cardsToWarm.length} [${card.priority}]: ${canonicalQuery}`);
      
      const result = await enqueueFetchJob(canonicalQuery, queryHash, filters as any);
      
      if (result.queued) {
        queued++;
        tierStats[card.priority].queued++;
        console.log(`[Prewarm] Queued [${card.priority}]: ${canonicalQuery}`);
      } else {
        skipped++;
        tierStats[card.priority].skipped++;
        console.log(`[Prewarm] Skipped (${result.reason}) [${card.priority}]: ${canonicalQuery}`);
      }
      
      // Long delay between jobs to avoid rate limiting
      if (processed < cardsToWarm.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOBS_MS));
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Prewarm] Complete: ${queued} queued, ${skipped} skipped, ${duration}s`);
    console.log(`[Prewarm] Tier breakdown:`, JSON.stringify(tierStats));
    
  } catch (error) {
    console.error("[Prewarm] Job failed:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * Calculate delay until next 3 AM UTC
 */
function getDelayUntilNextRun(): number {
  const now = new Date();
  const nextRun = new Date(now);
  
  nextRun.setUTCHours(PREWARM_HOUR_UTC, 0, 0, 0);
  
  // If already past 3 AM today, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  return nextRun.getTime() - now.getTime();
}

/**
 * Start the prewarm job scheduler
 */
export function startPrewarmJob(): void {
  if (prewarmTimer) {
    console.log("[Prewarm] Job already scheduled");
    return;
  }
  
  const scheduleNextRun = () => {
    const delay = getDelayUntilNextRun();
    const nextRunTime = new Date(Date.now() + delay);
    
    console.log(`[Prewarm] Next run scheduled for ${nextRunTime.toISOString()}`);
    
    prewarmTimer = setTimeout(() => {
      runPrewarmJob().finally(() => {
        // Schedule next run after this one completes
        scheduleNextRun();
      });
    }, delay);
  };
  
  scheduleNextRun();
  console.log("[Prewarm] Job scheduler started");
}

/**
 * Stop the prewarm job scheduler
 */
export function stopPrewarmJob(): void {
  if (prewarmTimer) {
    clearTimeout(prewarmTimer);
    prewarmTimer = null;
    console.log("[Prewarm] Job scheduler stopped");
  }
}

/**
 * Manually trigger a prewarm run
 */
export async function triggerPrewarm(): Promise<{ success: boolean; message: string }> {
  if (isRunning) {
    return { success: false, message: "Prewarm job is already running" };
  }
  
  // Run in background
  runPrewarmJob().catch(err => {
    console.error("[Prewarm] Manual trigger failed:", err);
  });
  
  return { success: true, message: "Prewarm job started" };
}

/**
 * Get prewarm job status
 */
export function getPrewarmStatus(): { isRunning: boolean; isScheduled: boolean; nextRunAt: Date | null } {
  return {
    isRunning,
    isScheduled: prewarmTimer !== null,
    nextRunAt: prewarmTimer ? new Date(Date.now() + getDelayUntilNextRun()) : null
  };
}
