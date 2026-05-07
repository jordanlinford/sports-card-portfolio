import { db } from "./db";
import {
  playerOutlookHistory,
  playerOutlookOutcomes,
  cardPriceObservations,
  type PlayerOutlookOutcome,
} from "@shared/schema";
import { and, desc, gte, lte, sql } from "drizzle-orm";

// Re-use the same outcome heuristics as backtestService so card-signal track
// record and player-outlook track record stay directionally consistent.
function evaluateOutcome(
  verdict: string,
  priceChange: number | null,
): { outcome: "CORRECT" | "INCORRECT" | "INCONCLUSIVE"; reason: string } {
  if (priceChange === null) {
    return { outcome: "INCONCLUSIVE", reason: "No price data available for comparison" };
  }
  switch (verdict) {
    case "ACCUMULATE":
    case "BUY":
      if (priceChange > 5) return { outcome: "CORRECT", reason: `Price up ${priceChange.toFixed(1)}%` };
      if (priceChange < -10) return { outcome: "INCORRECT", reason: `Price down ${priceChange.toFixed(1)}%` };
      return { outcome: "INCONCLUSIVE", reason: `Price change ${priceChange.toFixed(1)}% (within noise range)` };
    case "HOLD":
    case "HOLD_CORE":
    case "MONITOR":
      if (Math.abs(priceChange) <= 15) return { outcome: "CORRECT", reason: `Price stable at ${priceChange.toFixed(1)}%` };
      return { outcome: "INCORRECT", reason: `Price moved ${priceChange.toFixed(1)}% (outside hold range)` };
    case "SELL":
    case "TRADE_THE_HYPE":
      if (priceChange < -10) return { outcome: "CORRECT", reason: `Price dropped ${priceChange.toFixed(1)}% (selling was right)` };
      if (priceChange > 15) return { outcome: "INCORRECT", reason: `Price up ${priceChange.toFixed(1)}% (should have held)` };
      return { outcome: "INCONCLUSIVE", reason: `Price change ${priceChange.toFixed(1)}%` };
    case "AVOID":
    case "AVOID_NEW_MONEY":
    case "AVOID_STRUCTURAL":
      if (priceChange < -5) return { outcome: "CORRECT", reason: `Price dropped ${priceChange.toFixed(1)}%` };
      if (priceChange > 10) return { outcome: "INCORRECT", reason: `Price up ${priceChange.toFixed(1)}% despite avoid` };
      return { outcome: "INCONCLUSIVE", reason: `Price change ${priceChange.toFixed(1)}%` };
    case "SPECULATIVE_FLYER":
    case "SPECULATIVE_SUPPRESSED":
    case "LONGSHOT_BET":
      return { outcome: "INCONCLUSIVE", reason: "Speculative verdicts are not scored" };
    default:
      return { outcome: "INCONCLUSIVE", reason: `Unscored verdict type: ${verdict}` };
  }
}

async function findPriceNear(
  playerName: string,
  fromDate: Date,
  daysAfter: number,
): Promise<number | null> {
  const targetDate = new Date(fromDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
  // Only return a price if we actually have data old enough to be that far out
  if (targetDate.getTime() > Date.now()) return null;
  const windowStart = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(targetDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [obs] = await db
    .select()
    .from(cardPriceObservations)
    .where(and(
      sql`LOWER(${cardPriceObservations.playerName}) = ${playerName.toLowerCase()}`,
      gte(cardPriceObservations.createdAt, windowStart),
      lte(cardPriceObservations.createdAt, windowEnd),
    ))
    .orderBy(sql`ABS(EXTRACT(EPOCH FROM ${cardPriceObservations.createdAt} - ${targetDate.toISOString()}::timestamp))`)
    .limit(1);

  return obs?.priceEstimate ?? null;
}

export interface PlayerOutlookGradingSummary {
  startedAt: string;
  finishedAt: string;
  inspected: number;
  graded: number;
  skippedAlreadyGraded: number;
  skippedNoPrice: number;
  errors: number;
}

export async function runPlayerOutlookOutcomesGrading(
  options: { batchLimit?: number; minAgeDays?: number } = {},
): Promise<PlayerOutlookGradingSummary> {
  const startedAt = new Date().toISOString();
  const batchLimit = options.batchLimit ?? 500;
  const minAgeDays = options.minAgeDays ?? 30;

  const summary: PlayerOutlookGradingSummary = {
    startedAt,
    finishedAt: startedAt,
    inspected: 0,
    graded: 0,
    skippedAlreadyGraded: 0,
    skippedNoPrice: 0,
    errors: 0,
  };

  console.log(`[OutlookOutcomes] Starting grading run (minAgeDays=${minAgeDays}, batchLimit=${batchLimit})`);

  const cutoff = new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000);

  // Find aged history rows that have not yet been graded.
  // Left-join to outcomes via NOT EXISTS for efficiency.
  const candidates = await db
    .select()
    .from(playerOutlookHistory)
    .where(and(
      lte(playerOutlookHistory.snapshotAt, cutoff),
      sql`NOT EXISTS (SELECT 1 FROM ${playerOutlookOutcomes} WHERE ${playerOutlookOutcomes.historyId} = ${playerOutlookHistory.id})`,
    ))
    .orderBy(desc(playerOutlookHistory.snapshotAt))
    .limit(batchLimit);

  for (const row of candidates) {
    summary.inspected++;
    try {
      const priceAt = row.priceProxyAtSnapshot;
      const snapAt = row.snapshotAt;

      if (!priceAt || !Number.isFinite(priceAt) || priceAt <= 0) {
        // Still record as INCONCLUSIVE so we don't keep re-scanning the same rows
        await db.insert(playerOutlookOutcomes).values({
          historyId: row.id,
          playerKey: row.playerKey,
          playerName: row.playerName,
          sport: row.sport,
          verdict: row.verdict,
          modifier: row.modifier,
          weightsVersion: row.weightsVersion ?? null,
          snapshotAt: snapAt,
          priceAtSnapshot: null,
          priceAfter30d: null,
          priceAfter60d: null,
          priceAfter90d: null,
          changeAfter30d: null,
          changeAfter60d: null,
          changeAfter90d: null,
          outcome: "INCONCLUSIVE",
          outcomeReason: "No price proxy captured at snapshot",
        });
        summary.skippedNoPrice++;
        continue;
      }

      const [p30, p60, p90] = await Promise.all([
        findPriceNear(row.playerName, snapAt, 30),
        findPriceNear(row.playerName, snapAt, 60),
        findPriceNear(row.playerName, snapAt, 90),
      ]);

      const c30 = p30 !== null ? ((p30 - priceAt) / priceAt) * 100 : null;
      const c60 = p60 !== null ? ((p60 - priceAt) / priceAt) * 100 : null;
      const c90 = p90 !== null ? ((p90 - priceAt) / priceAt) * 100 : null;

      const bestChange = c90 ?? c60 ?? c30;
      const { outcome, reason } = evaluateOutcome(row.verdict, bestChange);

      await db.insert(playerOutlookOutcomes).values({
        historyId: row.id,
        playerKey: row.playerKey,
        playerName: row.playerName,
        sport: row.sport,
        verdict: row.verdict,
        modifier: row.modifier,
        weightsVersion: row.weightsVersion ?? null,
        snapshotAt: snapAt,
        priceAtSnapshot: priceAt,
        priceAfter30d: p30,
        priceAfter60d: p60,
        priceAfter90d: p90,
        changeAfter30d: c30 !== null ? Math.round(c30 * 10) / 10 : null,
        changeAfter60d: c60 !== null ? Math.round(c60 * 10) / 10 : null,
        changeAfter90d: c90 !== null ? Math.round(c90 * 10) / 10 : null,
        outcome,
        outcomeReason: reason,
      });
      summary.graded++;
    } catch (err) {
      summary.errors++;
      console.error(`[OutlookOutcomes] Error grading history row ${row.id}:`, err);
    }
  }

  summary.finishedAt = new Date().toISOString();
  console.log(
    `[OutlookOutcomes] Run complete: inspected=${summary.inspected} graded=${summary.graded} noPrice=${summary.skippedNoPrice} errors=${summary.errors}`,
  );
  return summary;
}

// =============================================
// Accuracy summary (for /api/track-record/player-outlook)
// =============================================
export interface PlayerOutlookAccuracyResult {
  playerKey: string;
  playerName: string;
  sport: string;
  verdict: string;
  snapshotAt: string;
  priceAtSnapshot: number | null;
  changeAfter30d: number | null;
  changeAfter60d: number | null;
  changeAfter90d: number | null;
  outcome: "CORRECT" | "INCORRECT" | "INCONCLUSIVE";
  outcomeReason: string;
}

export interface PlayerOutlookAccuracySummary {
  totalVerdicts: number;
  correctCount: number;
  incorrectCount: number;
  inconclusiveCount: number;
  accuracyRate: number;
  byVerdict: Record<string, {
    total: number;
    correct: number;
    incorrect: number;
    inconclusive: number;
    accuracy: number;
  }>;
  topCorrectCalls: PlayerOutlookAccuracyResult[];
  topIncorrectCalls: PlayerOutlookAccuracyResult[];
  generatedAt: string;
}

export async function computePlayerOutlookAccuracy(): Promise<PlayerOutlookAccuracySummary> {
  const rows: PlayerOutlookOutcome[] = await db
    .select()
    .from(playerOutlookOutcomes)
    .orderBy(desc(playerOutlookOutcomes.snapshotAt))
    .limit(5000);

  const results: PlayerOutlookAccuracyResult[] = rows.map((r) => ({
    playerKey: r.playerKey,
    playerName: r.playerName,
    sport: r.sport,
    verdict: r.verdict,
    snapshotAt: (r.snapshotAt as Date).toISOString(),
    priceAtSnapshot: r.priceAtSnapshot,
    changeAfter30d: r.changeAfter30d,
    changeAfter60d: r.changeAfter60d,
    changeAfter90d: r.changeAfter90d,
    outcome: r.outcome as "CORRECT" | "INCORRECT" | "INCONCLUSIVE",
    outcomeReason: r.outcomeReason ?? "",
  }));

  const correct = results.filter((r) => r.outcome === "CORRECT");
  const incorrect = results.filter((r) => r.outcome === "INCORRECT");
  const inconclusive = results.filter((r) => r.outcome === "INCONCLUSIVE");

  const byVerdict: PlayerOutlookAccuracySummary["byVerdict"] = {};
  for (const r of results) {
    if (!byVerdict[r.verdict]) {
      byVerdict[r.verdict] = { total: 0, correct: 0, incorrect: 0, inconclusive: 0, accuracy: 0 };
    }
    byVerdict[r.verdict].total++;
    if (r.outcome === "CORRECT") byVerdict[r.verdict].correct++;
    else if (r.outcome === "INCORRECT") byVerdict[r.verdict].incorrect++;
    else byVerdict[r.verdict].inconclusive++;
  }
  for (const v of Object.values(byVerdict)) {
    const decidable = v.correct + v.incorrect;
    v.accuracy = decidable > 0 ? Math.round((v.correct / decidable) * 100) : 0;
  }

  const decidableTotal = correct.length + incorrect.length;
  const bestChange = (r: PlayerOutlookAccuracyResult) =>
    Math.abs(r.changeAfter90d ?? r.changeAfter60d ?? r.changeAfter30d ?? 0);

  return {
    totalVerdicts: results.length,
    correctCount: correct.length,
    incorrectCount: incorrect.length,
    inconclusiveCount: inconclusive.length,
    accuracyRate: decidableTotal > 0 ? Math.round((correct.length / decidableTotal) * 100) : 0,
    byVerdict,
    topCorrectCalls: correct.sort((a, b) => bestChange(b) - bestChange(a)).slice(0, 10),
    topIncorrectCalls: incorrect.sort((a, b) => bestChange(b) - bestChange(a)).slice(0, 10),
    generatedAt: new Date().toISOString(),
  };
}

// =============================================
// Scheduler — nightly at 03:00 UTC
// =============================================
let outcomesTimer: NodeJS.Timeout | null = null;

function msUntilNextDailyRun(hourUtc = 3, now = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

export function startPlayerOutlookOutcomesScheduler(): void {
  if (outcomesTimer) {
    console.log("[OutlookOutcomes] Scheduler already running");
    return;
  }
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const initialDelay = msUntilNextDailyRun(3);
  const nextRun = new Date(Date.now() + initialDelay);
  console.log(
    `[OutlookOutcomes] Scheduler started. Next run: ${nextRun.toISOString()} (daily 03:00 UTC)`,
  );
  outcomesTimer = setTimeout(function tick() {
    runPlayerOutlookOutcomesGrading().catch((err) =>
      console.error("[OutlookOutcomes] Scheduled run failed:", err),
    );
    outcomesTimer = setInterval(() => {
      runPlayerOutlookOutcomesGrading().catch((err) =>
        console.error("[OutlookOutcomes] Scheduled run failed:", err),
      );
    }, ONE_DAY_MS);
  }, initialDelay);
}

export function stopPlayerOutlookOutcomesScheduler(): void {
  if (outcomesTimer) {
    clearTimeout(outcomesTimer);
    clearInterval(outcomesTimer);
    outcomesTimer = null;
    console.log("[OutlookOutcomes] Scheduler stopped");
  }
}
