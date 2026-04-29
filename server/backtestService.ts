import { db } from "./db";
import { verdictRegressionRuns, cardPriceObservations } from "@shared/schema";
import { and, gte, lte, desc, sql } from "drizzle-orm";

export interface VerdictAccuracyResult {
  playerKey: string;
  playerName: string;
  sport: string;
  verdict: string;
  verdictDate: Date;
  priceAtVerdict: number;
  priceAfter30d: number | null;
  priceAfter60d: number | null;
  priceAfter90d: number | null;
  changeAfter30d: number | null;
  changeAfter60d: number | null;
  changeAfter90d: number | null;
  outcome: "CORRECT" | "INCORRECT" | "INCONCLUSIVE";
  outcomeReason: string;
}

export interface AccuracySummary {
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
  topCorrectCalls: VerdictAccuracyResult[];
  topIncorrectCalls: VerdictAccuracyResult[];
  generatedAt: string;
}

export async function computeVerdictAccuracy(): Promise<AccuracySummary> {
  // Get all regression runs that are at least 30 days old
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const runs = await db
    .select()
    .from(verdictRegressionRuns)
    .where(lte(verdictRegressionRuns.runDate, thirtyDaysAgo))
    .orderBy(desc(verdictRegressionRuns.runDate));

  const results: VerdictAccuracyResult[] = [];

  for (const run of runs) {
    if (!run.currentVerdict || !run.currentPrice) continue;

    const verdictDate = run.runDate!;
    const playerName = run.playerName.toLowerCase();

    // Find price observations 30, 60, 90 days after the verdict
    const price30d = await findPriceNear(playerName, verdictDate, 30);
    const price60d = await findPriceNear(playerName, verdictDate, 60);
    const price90d = await findPriceNear(playerName, verdictDate, 90);

    const change30d = price30d !== null ? ((price30d - run.currentPrice) / run.currentPrice) * 100 : null;
    const change60d = price60d !== null ? ((price60d - run.currentPrice) / run.currentPrice) * 100 : null;
    const change90d = price90d !== null ? ((price90d - run.currentPrice) / run.currentPrice) * 100 : null;

    // Use the longest available timeframe for outcome evaluation
    const bestChange = change90d ?? change60d ?? change30d;
    const { outcome, reason } = evaluateOutcome(run.currentVerdict, bestChange);

    results.push({
      playerKey: run.playerKey,
      playerName: run.playerName,
      sport: run.sport,
      verdict: run.currentVerdict,
      verdictDate,
      priceAtVerdict: run.currentPrice,
      priceAfter30d: price30d,
      priceAfter60d: price60d,
      priceAfter90d: price90d,
      changeAfter30d: change30d !== null ? Math.round(change30d * 10) / 10 : null,
      changeAfter60d: change60d !== null ? Math.round(change60d * 10) / 10 : null,
      changeAfter90d: change90d !== null ? Math.round(change90d * 10) / 10 : null,
      outcome,
      outcomeReason: reason,
    });
  }

  // Compute summary
  const correct = results.filter(r => r.outcome === "CORRECT");
  const incorrect = results.filter(r => r.outcome === "INCORRECT");
  const inconclusive = results.filter(r => r.outcome === "INCONCLUSIVE");

  const byVerdict: AccuracySummary["byVerdict"] = {};
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

  return {
    totalVerdicts: results.length,
    correctCount: correct.length,
    incorrectCount: incorrect.length,
    inconclusiveCount: inconclusive.length,
    accuracyRate: decidableTotal > 0 ? Math.round((correct.length / decidableTotal) * 100) : 0,
    byVerdict,
    topCorrectCalls: correct
      .sort((a, b) => Math.abs(b.changeAfter90d ?? b.changeAfter30d ?? 0) - Math.abs(a.changeAfter90d ?? a.changeAfter30d ?? 0))
      .slice(0, 10),
    topIncorrectCalls: incorrect
      .sort((a, b) => Math.abs(b.changeAfter90d ?? b.changeAfter30d ?? 0) - Math.abs(a.changeAfter90d ?? a.changeAfter30d ?? 0))
      .slice(0, 10),
    generatedAt: new Date().toISOString(),
  };
}

async function findPriceNear(playerName: string, fromDate: Date, daysAfter: number): Promise<number | null> {
  const targetDate = new Date(fromDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
  const windowStart = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(targetDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [obs] = await db
    .select()
    .from(cardPriceObservations)
    .where(and(
      sql`LOWER(${cardPriceObservations.playerName}) = ${playerName}`,
      gte(cardPriceObservations.createdAt, windowStart),
      lte(cardPriceObservations.createdAt, windowEnd),
    ))
    .orderBy(sql`ABS(EXTRACT(EPOCH FROM ${cardPriceObservations.createdAt} - ${targetDate.toISOString()}::timestamp))`)
    .limit(1);

  return obs?.priceEstimate ?? null;
}

function evaluateOutcome(verdict: string, priceChange: number | null): { outcome: "CORRECT" | "INCORRECT" | "INCONCLUSIVE"; reason: string } {
  if (priceChange === null) {
    return { outcome: "INCONCLUSIVE", reason: "No price data available for comparison" };
  }

  switch (verdict) {
    case "ACCUMULATE":
      if (priceChange > 5) return { outcome: "CORRECT", reason: `Price up ${priceChange.toFixed(1)}%` };
      if (priceChange < -10) return { outcome: "INCORRECT", reason: `Price down ${priceChange.toFixed(1)}%` };
      return { outcome: "INCONCLUSIVE", reason: `Price change ${priceChange.toFixed(1)}% (within noise range)` };

    case "HOLD_CORE":
      if (Math.abs(priceChange) <= 15) return { outcome: "CORRECT", reason: `Price stable at ${priceChange.toFixed(1)}%` };
      return { outcome: "INCORRECT", reason: `Price moved ${priceChange.toFixed(1)}% (outside hold range)` };

    case "TRADE_THE_HYPE":
      if (priceChange < -10) return { outcome: "CORRECT", reason: `Price dropped ${priceChange.toFixed(1)}% (selling was right)` };
      if (priceChange > 15) return { outcome: "INCORRECT", reason: `Price up ${priceChange.toFixed(1)}% (should have held)` };
      return { outcome: "INCONCLUSIVE", reason: `Price change ${priceChange.toFixed(1)}%` };

    case "AVOID_NEW_MONEY":
    case "AVOID_STRUCTURAL":
      if (priceChange < -5) return { outcome: "CORRECT", reason: `Price dropped ${priceChange.toFixed(1)}%` };
      if (priceChange > 10) return { outcome: "INCORRECT", reason: `Price up ${priceChange.toFixed(1)}% despite avoid` };
      return { outcome: "INCONCLUSIVE", reason: `Price change ${priceChange.toFixed(1)}%` };

    case "SPECULATIVE_FLYER":
    case "SPECULATIVE_SUPPRESSED":
      return { outcome: "INCONCLUSIVE", reason: "Speculative verdicts are not scored" };

    default:
      return { outcome: "INCONCLUSIVE", reason: `Unknown verdict type: ${verdict}` };
  }
}
