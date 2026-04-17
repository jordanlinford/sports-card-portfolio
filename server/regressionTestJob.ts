import { db } from "./db";
import { playerOutlookCache, verdictRegressionRuns } from "@shared/schema";
import { desc, eq } from "drizzle-orm";

export interface RegressionRunRow {
  playerKey: string;
  playerName: string;
  sport: string;
  previousVerdict: string | null;
  currentVerdict: string | null;
  previousPrice: number | null;
  currentPrice: number | null;
  priceChangePct: number | null;
  isFlip: boolean;
}

export interface RegressionRunSummary {
  startedAt: string;
  finishedAt: string;
  inspected: number;
  inserted: number;
  flips: number;
  flipDetails: Array<{
    playerKey: string;
    playerName: string;
    previousVerdict: string | null;
    currentVerdict: string | null;
    priceChangePct: number | null;
  }>;
  errors: number;
}

function extractCurrentVerdict(outlookJson: any): string | null {
  if (!outlookJson || typeof outlookJson !== "object") return null;
  const v =
    outlookJson?.verdict?.action ??
    outlookJson?.investmentCall?.verdict ??
    null;
  return typeof v === "string" && v.length > 0 ? v : null;
}

function extractCurrentPrice(outlookJson: any): number | null {
  if (!outlookJson || typeof outlookJson !== "object") return null;
  const avg = outlookJson?.marketMetrics?.avgSoldPrice;
  if (typeof avg === "number" && Number.isFinite(avg)) return avg;
  const median = outlookJson?.evidence?.compsSummary?.median;
  if (typeof median === "number" && Number.isFinite(median)) return median;
  return null;
}

export async function runVerdictRegression(): Promise<RegressionRunSummary> {
  const startedAt = new Date().toISOString();
  const summary: RegressionRunSummary = {
    startedAt,
    finishedAt: startedAt,
    inspected: 0,
    inserted: 0,
    flips: 0,
    flipDetails: [],
    errors: 0,
  };

  console.log("[Regression] Starting verdict regression run");

  let players: Array<typeof playerOutlookCache.$inferSelect> = [];
  try {
    players = await db
      .select()
      .from(playerOutlookCache)
      .orderBy(desc(playerOutlookCache.updatedAt))
      .limit(50);
  } catch (err) {
    console.error("[Regression] Failed to load player_outlook_cache:", err);
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  for (const p of players) {
    summary.inspected++;
    try {
      const currentVerdict = extractCurrentVerdict(p.outlookJson);
      const currentPrice = extractCurrentPrice(p.outlookJson);

      const [previousRun] = await db
        .select()
        .from(verdictRegressionRuns)
        .where(eq(verdictRegressionRuns.playerKey, p.playerKey))
        .orderBy(desc(verdictRegressionRuns.runDate))
        .limit(1);

      const previousVerdict = previousRun?.currentVerdict ?? null;
      const previousPrice = previousRun?.currentPrice ?? null;

      let priceChangePct: number | null = null;
      if (
        typeof previousPrice === "number" &&
        previousPrice > 0 &&
        typeof currentPrice === "number"
      ) {
        priceChangePct = ((currentPrice - previousPrice) / previousPrice) * 100;
      }

      const isFlip =
        !!previousRun &&
        previousVerdict !== currentVerdict &&
        priceChangePct !== null &&
        Math.abs(priceChangePct) < 15;

      await db.insert(verdictRegressionRuns).values({
        playerKey: p.playerKey,
        playerName: p.playerName,
        sport: p.sport,
        previousVerdict,
        currentVerdict,
        previousPrice,
        currentPrice,
        priceChangePct,
        isFlip,
      });

      summary.inserted++;
      if (isFlip) {
        summary.flips++;
        summary.flipDetails.push({
          playerKey: p.playerKey,
          playerName: p.playerName,
          previousVerdict,
          currentVerdict,
          priceChangePct,
        });
        console.warn(
          `[Regression] FLIP detected: ${p.playerName} (${p.playerKey}) ${previousVerdict} -> ${currentVerdict} (priceChange=${priceChangePct?.toFixed(2)}%)`
        );
      }
    } catch (err) {
      summary.errors++;
      console.error(`[Regression] Error processing ${p.playerKey}:`, err);
    }
  }

  summary.finishedAt = new Date().toISOString();
  console.log(
    `[Regression] Run complete: inspected=${summary.inspected} inserted=${summary.inserted} flips=${summary.flips} errors=${summary.errors}`
  );
  return summary;
}

let regressionTimer: NodeJS.Timeout | null = null;

function msUntilNextSunday2amUtc(now = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(2, 0, 0, 0);
  const dayOfWeek = next.getUTCDay(); // 0 = Sunday
  let daysUntilSunday = (7 - dayOfWeek) % 7;
  if (daysUntilSunday === 0 && next.getTime() <= now.getTime()) {
    daysUntilSunday = 7;
  }
  next.setUTCDate(next.getUTCDate() + daysUntilSunday);
  return next.getTime() - now.getTime();
}

export function startRegressionTestScheduler(): void {
  if (regressionTimer) {
    console.log("[Regression] Scheduler already running");
    return;
  }
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const initialDelay = msUntilNextSunday2amUtc();
  const nextRun = new Date(Date.now() + initialDelay);
  console.log(
    `[Regression] Scheduler started. Next run: ${nextRun.toISOString()} (weekly Sunday 02:00 UTC)`
  );

  regressionTimer = setTimeout(function tick() {
    runVerdictRegression().catch((err) =>
      console.error("[Regression] Scheduled run failed:", err)
    );
    regressionTimer = setInterval(() => {
      runVerdictRegression().catch((err) =>
        console.error("[Regression] Scheduled run failed:", err)
      );
    }, SEVEN_DAYS_MS);
  }, initialDelay);
}

export function stopRegressionTestScheduler(): void {
  if (regressionTimer) {
    clearTimeout(regressionTimer);
    clearInterval(regressionTimer);
    regressionTimer = null;
    console.log("[Regression] Scheduler stopped");
  }
}
