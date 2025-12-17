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
import { marketCompsCache, cards } from "@shared/schema";
import { desc, isNotNull, sql, and, lt, gt } from "drizzle-orm";
import { enqueueFetchJob, normalizeEbayQuery, getActiveJobCount } from "./ebayCompsService";

// Configuration
const PREWARM_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PREWARM_HOUR_UTC = 3; // 3 AM UTC
const MAX_CARDS_PER_RUN = 50; // Limit to avoid long-running jobs
const DELAY_BETWEEN_JOBS_MS = 60 * 1000; // 1 minute between each card
const MIN_HOURS_BEFORE_EXPIRY = 12; // Only prewarm if expiring within 12 hours

let prewarmTimer: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Get top searched cards based on cache access patterns and card collection frequency.
 * Prioritizes cards that are:
 * 1. In many collections (popular cards)
 * 2. Have existing cache entries that are expiring soon
 * 3. Have high-value estimated values
 */
async function getTopCardsToPrewarm(): Promise<Array<{ title: string; playerName: string | null; year: string | null; set: string | null; grade: string | null }>> {
  try {
    // Strategy 1: Get cards from cache that are expiring soon but have good data
    const expiringCacheEntries = await db.select({
      canonicalQuery: marketCompsCache.canonicalQuery,
      soldCount: marketCompsCache.soldCount,
      expiresAt: marketCompsCache.expiresAt
    })
    .from(marketCompsCache)
    .where(
      and(
        gt(marketCompsCache.soldCount, 5), // Only cards with decent data
        lt(marketCompsCache.expiresAt, new Date(Date.now() + MIN_HOURS_BEFORE_EXPIRY * 60 * 60 * 1000))
      )
    )
    .orderBy(desc(marketCompsCache.soldCount))
    .limit(Math.floor(MAX_CARDS_PER_RUN / 2));
    
    // Strategy 2: Get frequently added cards from the collection
    const popularCards = await db.select({
      title: cards.title,
      playerName: cards.playerName,
      year: cards.year,
      set: cards.set,
      grade: cards.grade
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
    .limit(Math.floor(MAX_CARDS_PER_RUN / 2));
    
    // Combine the results
    const results: Array<{ title: string; playerName: string | null; year: string | null; set: string | null; grade: string | null }> = [];
    
    // Add expiring cache entries (they already have canonical queries)
    for (const entry of expiringCacheEntries) {
      if (entry.canonicalQuery) {
        results.push({
          title: entry.canonicalQuery,
          playerName: null,
          year: null,
          set: null,
          grade: null
        });
      }
    }
    
    // Add popular cards from collections
    for (const card of popularCards) {
      results.push({
        title: card.title,
        playerName: card.playerName,
        year: card.year ? String(card.year) : null,
        set: card.set,
        grade: card.grade
      });
    }
    
    return results;
  } catch (error) {
    console.error("[Prewarm] Error fetching cards to prewarm:", error);
    return [];
  }
}

/**
 * Build a search query from card data
 */
function buildSearchQuery(card: { title: string; playerName: string | null; year: string | null; set: string | null; grade: string | null }): string {
  const parts: string[] = [];
  
  if (card.year) parts.push(card.year);
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
  
  console.log("[Prewarm] Starting nightly prewarm job");
  
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
      
      const query = buildSearchQuery(card);
      const { canonicalQuery, queryHash, filters } = normalizeEbayQuery(query);
      
      console.log(`[Prewarm] Processing ${processed}/${cardsToWarm.length}: ${canonicalQuery}`);
      
      const result = await enqueueFetchJob(canonicalQuery, queryHash, filters);
      
      if (result.queued) {
        queued++;
        console.log(`[Prewarm] Queued: ${canonicalQuery}`);
      } else {
        skipped++;
        console.log(`[Prewarm] Skipped (${result.reason}): ${canonicalQuery}`);
      }
      
      // Long delay between jobs to avoid rate limiting
      if (processed < cardsToWarm.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOBS_MS));
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Prewarm] Complete: ${queued} queued, ${skipped} skipped, ${duration}s`);
    
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
