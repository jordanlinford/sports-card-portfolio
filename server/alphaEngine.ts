import type { Card, CardSignal, InsertCardSignal, CardMarketSnapshot } from "@shared/schema";
import { storage } from "./storage";

const BATCH_HARD_CAP = 50;
const BATCH_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const SIGNAL_EXPIRY_DAYS = 4;
const ESTIMATED_COST_PER_ANALYSIS = 0.04;

interface BatchRunStats {
  runId: string;
  startedAt: Date;
  completedAt: Date | null;
  cardsAnalyzed: number;
  cardsFailed: number;
  signalsGenerated: number;
  estimatedCost: number;
  durationMs: number;
}

let lastBatchRunStats: BatchRunStats | null = null;
let batchRunning = false;

export function getLastBatchRunStats(): BatchRunStats | null {
  return lastBatchRunStats;
}

export function isBatchRunning(): boolean {
  return batchRunning;
}

async function selectCardsForBatch(): Promise<{ cardId: number; title: string; playerName: string | null }[]> {
  const topCards = await storage.getTopCardsByOwnership(BATCH_HARD_CAP);
  return topCards.map(c => ({ cardId: c.cardId, title: c.title, playerName: c.playerName }));
}

async function analyzeCardForBatch(card: Card): Promise<{ marketValue: number | null; soldCount: number; action: string; confidence: string }> {
  const { fetchGeminiMarketData } = await import("./outlookEngine");

  const geminiResult = await fetchGeminiMarketData({
    title: card.title,
    playerName: card.playerName,
    year: card.year,
    set: card.set,
    variation: card.variation,
    grade: card.grade,
    grader: card.grader,
  });

  if (!geminiResult || geminiResult.avgPrice <= 0) {
    return { marketValue: null, soldCount: 0, action: "MONITOR", confidence: "low" };
  }

  let confidence: string = "low";
  if (geminiResult.soldCount >= 10) confidence = "high";
  else if (geminiResult.soldCount >= 5) confidence = "medium";

  return {
    marketValue: geminiResult.avgPrice,
    soldCount: geminiResult.soldCount,
    action: "MONITOR",
    confidence,
  };
}

interface AlphaScoreResult {
  alphaScore: number;
  signalType: string;
  confidence: string;
  reasoning: string;
  drivers: string[];
  whyNow: string;
}

function computeAlphaScore(
  card: Card,
  snapshot: CardMarketSnapshot | undefined,
  interestVelocity: number,
  batchResult: { marketValue: number | null; soldCount: number; confidence: string }
): AlphaScoreResult {
  let score = 50;
  const factors: string[] = [];
  const drivers: string[] = [];
  const timingSignals: string[] = [];

  const action = card.outlookAction?.toUpperCase() || "";
  if (action === "BUY") {
    score += 15;
    factors.push("BUY verdict");
    drivers.push("Market analysis indicates strong buy opportunity");
  } else if (action === "LONG_HOLD") {
    score += 8;
    factors.push("LONG_HOLD verdict");
    drivers.push("Solid long-term hold with steady demand");
  } else if (action === "MONITOR") { score += 0; }
  else if (action === "SELL") {
    score -= 15;
    factors.push("SELL verdict");
    drivers.push("Market conditions suggest selling pressure");
  } else if (action === "LEGACY_HOLD") {
    score -= 5;
    factors.push("LEGACY_HOLD verdict");
    drivers.push("Limited upside with declining market interest");
  } else if (action === "LITTLE_VALUE") {
    score -= 20;
    factors.push("LITTLE_VALUE verdict");
    drivers.push("Low market value with minimal demand");
  }

  const upside = card.outlookUpsideScore ?? 50;
  const risk = card.outlookRiskScore ?? 50;
  const momentumDelta = upside - risk;
  if (momentumDelta > 30) {
    score += 12;
    factors.push("Strong momentum");
    drivers.push("Recent sales trending well above average pricing");
    timingSignals.push("Strong upward momentum detected in recent market activity");
  } else if (momentumDelta > 10) {
    score += 6;
    factors.push("Positive momentum");
    drivers.push("Sales showing positive price movement");
    timingSignals.push("Prices starting to trend upward");
  } else if (momentumDelta < -20) {
    score -= 10;
    factors.push("Negative momentum");
    drivers.push("Declining demand with recent price drops");
    timingSignals.push("Downward price pressure accelerating");
  }

  const salesCount = card.salesLast30Days ?? batchResult.soldCount;
  if (salesCount >= 20) {
    score += 10;
    factors.push("High liquidity");
    drivers.push(`${salesCount}+ recent sales showing active market`);
  } else if (salesCount >= 10) {
    score += 6;
    factors.push("Good liquidity");
    drivers.push(`${salesCount} recent sales with healthy trading volume`);
  } else if (salesCount >= 5) {
    score += 3;
    factors.push("Moderate liquidity");
  } else if (salesCount <= 1) {
    score -= 5;
    factors.push("Low liquidity");
    drivers.push("Very few recent sales — thin market");
  }

  if (snapshot && snapshot.observationCount >= 3) {
    score += Math.min(snapshot.observationCount, 5);
    factors.push(`${snapshot.observationCount} price observations`);
  }

  if (interestVelocity > 2) {
    score += 8;
    factors.push("High interest velocity");
    drivers.push("User interest spiked this week vs. historical average");
    timingSignals.push("Surge in user scans and views in the last few days");
  } else if (interestVelocity > 1) {
    score += 4;
    factors.push("Rising interest");
    timingSignals.push("User interest picking up compared to prior weeks");
  }

  if (card.estimatedValue && batchResult.marketValue) {
    const priceDelta = (batchResult.marketValue - card.estimatedValue) / card.estimatedValue;
    if (priceDelta > 0.15) {
      score += 8;
      factors.push(`Price rising +${Math.round(priceDelta * 100)}%`);
      drivers.push(`Recent comps showing +${Math.round(priceDelta * 100)}% price increase`);
      timingSignals.push("Market value shifted upward in latest analysis");
    } else if (priceDelta < -0.15) {
      score -= 8;
      factors.push(`Price falling ${Math.round(priceDelta * 100)}%`);
      drivers.push(`Price declined ${Math.abs(Math.round(priceDelta * 100))}% from previous estimate`);
      timingSignals.push("Recent sales indicate downward price correction");
    }
  }

  score = Math.max(0, Math.min(100, score));

  let signalType: string;
  if (score >= 80) signalType = "strong_buy";
  else if (score >= 65) signalType = "buy";
  else if (score >= 40) signalType = "hold";
  else if (score >= 25) signalType = "sell";
  else signalType = "strong_sell";

  let confidence = batchResult.confidence;
  if (salesCount <= 2 && (!snapshot || snapshot.observationCount < 2)) {
    confidence = "low";
  }

  const reasoning = factors.slice(0, 4).join(". ") + ".";
  const topDrivers = drivers.slice(0, 3);
  const whyNow = timingSignals.length > 0
    ? timingSignals[0]
    : "Based on latest market data analysis";

  return { alphaScore: score, signalType, confidence, reasoning, drivers: topDrivers, whyNow };
}

async function runSignalEngine(batchRunId: string): Promise<number> {
  let signalsGenerated = 0;

  const allCardIds = await storage.getAllCardIdsWithSnapshots();
  console.log(`[Alpha Signal] Scoring ${allCardIds.length} cards with market snapshots`);

  for (const cardId of allCardIds) {
    try {
      const card = await storage.getCard(cardId);
      if (!card) continue;

      const snapshot = await storage.getMarketSnapshot(cardId);
      const velocity = await storage.getInterestVelocity(cardId);

      const batchResult = {
        marketValue: card.estimatedValue,
        soldCount: card.salesLast30Days ?? 0,
        confidence: (card.salesLast30Days ?? 0) >= 10 ? "high" : (card.salesLast30Days ?? 0) >= 5 ? "medium" : "low",
      };

      const { alphaScore, signalType, confidence, reasoning, drivers, whyNow } = computeAlphaScore(
        card, snapshot, velocity.velocity, batchResult
      );

      const expiresAt = new Date(Date.now() + SIGNAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await storage.upsertCardSignal({
        cardId,
        playerName: card.playerName ?? null,
        cardTitle: card.title,
        alphaScore,
        signalType,
        confidence,
        reasoning,
        drivers,
        whyNow,
        expiresAt,
        batchRunId,
      });

      signalsGenerated++;
    } catch (err: any) {
      console.error(`[Alpha Signal] Failed to score card ${cardId}: ${err.message}`);
    }
  }

  return signalsGenerated;
}

export async function runAlphaBatchJob(): Promise<BatchRunStats> {
  if (batchRunning) {
    throw new Error("Batch job already running");
  }

  batchRunning = true;
  const runId = `alpha-${Date.now()}`;
  const startedAt = new Date();
  let cardsAnalyzed = 0;
  let cardsFailed = 0;
  const analyzedCardIds: number[] = [];

  console.log(`[Alpha Batch] Starting batch run ${runId}`);

  try {
    const selectedCards = await selectCardsForBatch();
    console.log(`[Alpha Batch] Selected ${selectedCards.length} cards for analysis`);

    if (selectedCards.length === 0) {
      console.log(`[Alpha Batch] No cards to analyze — skipping`);
      const stats: BatchRunStats = {
        runId,
        startedAt,
        completedAt: new Date(),
        cardsAnalyzed: 0,
        cardsFailed: 0,
        signalsGenerated: 0,
        estimatedCost: 0,
        durationMs: Date.now() - startedAt.getTime(),
      };
      lastBatchRunStats = stats;
      batchRunning = false;
      return stats;
    }

    for (const selected of selectedCards) {
      if (cardsAnalyzed >= BATCH_HARD_CAP) {
        console.log(`[Alpha Batch] Hard cap of ${BATCH_HARD_CAP} reached — stopping`);
        break;
      }

      try {
        const card = await storage.getCard(selected.cardId);
        if (!card) {
          console.warn(`[Alpha Batch] Card ${selected.cardId} not found — skipping`);
          continue;
        }

        console.log(`[Alpha Batch] Analyzing card ${selected.cardId}: ${card.title} (${cardsAnalyzed + 1}/${Math.min(selectedCards.length, BATCH_HARD_CAP)})`);

        const result = await analyzeCardForBatch(card);

        if (result.marketValue && result.marketValue > 0) {
          const { recordPriceObservation, recordInterestEvent } = await import("./alphaHooks");
          recordPriceObservation(storage, {
            cardId: card.id,
            playerName: card.playerName ?? undefined,
            cardTitle: card.title,
            setName: card.set ?? undefined,
            year: card.year ?? undefined,
            variation: card.variation ?? undefined,
            priceEstimate: result.marketValue,
            soldCount: result.soldCount,
            source: "alpha_batch",
          });

          if (result.marketValue !== card.estimatedValue) {
            await storage.updateCard(card.id, {
              previousValue: card.estimatedValue || null,
              estimatedValue: result.marketValue,
              valueUpdatedAt: new Date(),
            });
          }
        }

        analyzedCardIds.push(selected.cardId);
        cardsAnalyzed++;

        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err: any) {
        console.error(`[Alpha Batch] Failed to analyze card ${selected.cardId}: ${err.message}`);
        cardsFailed++;
      }
    }

    console.log(`[Alpha Batch] Analysis complete. Running signal engine on ${analyzedCardIds.length} cards...`);
    const signalsGenerated = await runSignalEngine(runId);

    const stats: BatchRunStats = {
      runId,
      startedAt,
      completedAt: new Date(),
      cardsAnalyzed,
      cardsFailed,
      signalsGenerated,
      estimatedCost: cardsAnalyzed * ESTIMATED_COST_PER_ANALYSIS,
      durationMs: Date.now() - startedAt.getTime(),
    };

    lastBatchRunStats = stats;
    console.log(`[Alpha Batch] Run ${runId} complete: ${cardsAnalyzed} analyzed, ${cardsFailed} failed, ${signalsGenerated} signals generated, ~$${stats.estimatedCost.toFixed(2)} estimated cost, ${(stats.durationMs / 1000).toFixed(0)}s`);

    return stats;
  } finally {
    batchRunning = false;
  }
}

let batchSchedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startBatchScheduler(): void {
  if (batchSchedulerTimer) {
    console.log("[Alpha Batch] Scheduler already running");
    return;
  }

  const nextRun = new Date(Date.now() + BATCH_INTERVAL_MS);
  console.log(`[Alpha Batch] Scheduler started. Next run: ${nextRun.toISOString()} (every 3 days)`);

  batchSchedulerTimer = setInterval(async () => {
    try {
      console.log("[Alpha Batch] Scheduled run starting...");
      await runAlphaBatchJob();
    } catch (err: any) {
      console.error("[Alpha Batch] Scheduled run failed:", err.message);
    }
  }, BATCH_INTERVAL_MS);
}

export function stopBatchScheduler(): void {
  if (batchSchedulerTimer) {
    clearInterval(batchSchedulerTimer);
    batchSchedulerTimer = null;
    console.log("[Alpha Batch] Scheduler stopped");
  }
}
