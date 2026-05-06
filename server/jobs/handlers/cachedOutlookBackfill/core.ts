/**
 * ============================================================================
 *  cached-outlook-backfill — shared core.
 * ============================================================================
 *
 *  Single source of truth for the cached-outlook backfill loop. Two consumers:
 *
 *    1. CLI script  (server/scripts/backfillCachedOutlooks.ts) — dev-DB
 *       rehearsal, prints to stdout, installs SIGINT handlers.
 *    2. Background-job handler (server/jobs/handlers/cachedOutlookBackfill.ts)
 *       — production execution, emits NDJSON events through the framework.
 *
 *  Both consumers call `runCachedOutlookBackfill(...)` with their own
 *  reporter implementation. The loop body, pacing, idempotency check,
 *  and acceptance verification all live here. Behavior must stay
 *  identical between the two callers — that's the whole point of the
 *  extract-shared-core decision.
 *
 *  See `server/scripts/backfillCachedOutlooks.ts` for the project-level
 *  rationale (Fix 7: Phase-3 layered-confidence-clamping cache rebuild).
 */

import { db } from "../../../db";
import { playerOutlookCache } from "@shared/schema";
import { asc, desc, eq } from "drizzle-orm";
import { TimeoutError, withTimeout } from "../../../lib/withTimeout";

export const DELAY_BETWEEN_CALLS_MS = 2500;
/** Per-call timeout for Gemini requests.  Tune here without touching the loop. */
export const GEMINI_TIMEOUT_MS = 60_000;

export interface BackfillOptions {
  label: string;
  sport?: string;        // optional sport filter (lowercased)
  limit?: number;        // optional row cap
  dryRun?: boolean;      // when true: enumerate plan, don't call Gemini
}

export interface BackfillFailure {
  playerName: string;
  sport: string;
  errorMessage: string;
}

export interface BackfillSummary {
  label: string;
  runStart: string;          // ISO 8601 UTC
  runEnd: string;            // ISO 8601 UTC
  completedFully: boolean;
  totalConsidered: number;
  processed: number;
  regenerated: number;        // verdict or modifier changed
  unchanged: number;          // identical post-refresh
  errored: number;
  skipped: number;            // considered minus processed (interrupted runs)
  failures: BackfillFailure[];
  acceptance: {
    allFresh: boolean;
    totalRowsInCache: number;
    stillStaleCount: number;
    stillStaleSample: { playerName: string; lastFetchedAt: string | null }[];
  };
  /** Wall-clock duration of the run, in milliseconds. */
  durationMs: number;
}

/**
 * Reporter abstraction. Lets the CLI script print to stdout and the
 * job handler emit NDJSON events through the same code path.
 *
 * Every event is a stable JSON-serializable object so consumers can pass
 * it straight through `console.log`, `JSON.stringify`, or a framework
 * `ctx.yield`.
 */
export interface BackfillReporter {
  info: (message: string, extra?: Record<string, unknown>) => void;
  rowProgress: (event: {
    index: number;
    total: number;
    playerName: string;
    sport: string;
    outcome: "regenerated" | "unchanged" | "errored";
    durationMs: number;
    oldVerdict?: string;
    newVerdict?: string;
    oldModifier?: string;
    newModifier?: string;
    errorMessage?: string;
  }) => void;
}

interface RunState {
  runStart: Date;
  totalConsidered: number;
  processed: number;
  regenerated: number;
  unchanged: number;
  errored: number;
  failures: BackfillFailure[];
}

function extractModifier(outlookJson: unknown): string {
  if (!outlookJson || typeof outlookJson !== "object") return "";
  const oj = outlookJson as { verdict?: { modifier?: string } };
  return oj?.verdict?.modifier ?? "";
}

function extractVerdict(outlookJson: unknown): string {
  if (!outlookJson || typeof outlookJson !== "object") return "";
  const oj = outlookJson as { investmentCall?: { verdict?: string } };
  return oj?.investmentCall?.verdict ?? "";
}

async function buildAcceptance(
  state: RunState,
): Promise<BackfillSummary["acceptance"]> {
  // Acceptance criterion #1 (per operator spec): every row in the cache has
  // lastFetchedAt > RUN_START_TIMESTAMP. Criterion #2 (verdict-distribution
  // shift) is verified separately via captureMeasurementBaseline.ts.
  const allRows = await db
    .select({
      playerName: playerOutlookCache.playerName,
      lastFetchedAt: playerOutlookCache.lastFetchedAt,
    })
    .from(playerOutlookCache);

  const stillStale = allRows.filter(
    (r) => !r.lastFetchedAt || r.lastFetchedAt < state.runStart,
  );

  return {
    allFresh: stillStale.length === 0,
    totalRowsInCache: allRows.length,
    stillStaleCount: stillStale.length,
    stillStaleSample: stillStale.slice(0, 20).map((r) => ({
      playerName: r.playerName,
      lastFetchedAt: r.lastFetchedAt ? r.lastFetchedAt.toISOString() : null,
    })),
  };
}

/**
 * Runs the backfill loop. Returns the final summary regardless of whether
 * acceptance passed — caller decides how to communicate that.
 *
 * `completedFully` is true when the loop finished its plan; false when
 * the caller's external interrupt (e.g. CLI SIGINT, framework shutdown)
 * caused early termination via the optional `shouldAbort` callback.
 */
export async function runCachedOutlookBackfill(
  options: BackfillOptions,
  reporter: BackfillReporter,
  shouldAbort?: () => boolean,
): Promise<BackfillSummary> {
  const state: RunState = {
    runStart: new Date(),
    totalConsidered: 0,
    processed: 0,
    regenerated: 0,
    unchanged: 0,
    errored: 0,
    failures: [],
  };

  reporter.info(
    `Starting backfill "${options.label}" — runStart=${state.runStart.toISOString()}, delay=${DELAY_BETWEEN_CALLS_MS}ms (sequential).`,
    { runStart: state.runStart.toISOString(), delayMs: DELAY_BETWEEN_CALLS_MS },
  );

  // Snapshot all rows up-front. Order: viewCount DESC NULLS LAST,
  // lastFetchedAt ASC — highest-traffic players refresh first so /alpha
  // improves earliest if the run is interrupted.
  const allRows = await db
    .select({
      playerKey: playerOutlookCache.playerKey,
      playerName: playerOutlookCache.playerName,
      sport: playerOutlookCache.sport,
      viewCount: playerOutlookCache.viewCount,
      lastFetchedAt: playerOutlookCache.lastFetchedAt,
      outlookJson: playerOutlookCache.outlookJson,
    })
    .from(playerOutlookCache)
    .orderBy(
      desc(playerOutlookCache.viewCount),
      asc(playerOutlookCache.lastFetchedAt),
    );

  // Resume semantics (idempotency): skip rows already refreshed inside this
  // run window (lastFetchedAt > RUN_START_TIMESTAMP). On a fresh run, no
  // rows are skipped.
  let candidates = allRows.filter(
    (r) => !r.lastFetchedAt || r.lastFetchedAt < state.runStart,
  );

  if (options.sport) {
    const target = options.sport.toLowerCase();
    candidates = candidates.filter((r) => r.sport.toLowerCase() === target);
  }
  if (options.limit !== undefined && options.limit > 0) {
    candidates = candidates.slice(0, options.limit);
  }

  state.totalConsidered = candidates.length;

  const estMinutes = (
    (candidates.length * (DELAY_BETWEEN_CALLS_MS + 10_000)) /
    60_000
  ).toFixed(1);

  reporter.info(
    `Plan: ${candidates.length} rows to refresh (of ${allRows.length} total). Est. runtime: ~${estMinutes} min.`,
    {
      candidates: candidates.length,
      totalInCache: allRows.length,
      estimatedMinutes: parseFloat(estMinutes),
    },
  );

  if (options.dryRun) {
    reporter.info("--dry-run: no Gemini calls will be made; returning plan summary.", {
      dryRun: true,
    });
    const acceptance = await buildAcceptance(state);
    const runEnd = new Date();
    return {
      label: options.label,
      runStart: state.runStart.toISOString(),
      runEnd: runEnd.toISOString(),
      completedFully: true,
      totalConsidered: state.totalConsidered,
      processed: 0,
      regenerated: 0,
      unchanged: 0,
      errored: 0,
      skipped: state.totalConsidered,
      failures: [],
      acceptance,
      durationMs: runEnd.getTime() - state.runStart.getTime(),
    };
  }

  if (candidates.length === 0) {
    reporter.info("Nothing to do — no candidates after filters.", { candidates: 0 });
    const acceptance = await buildAcceptance(state);
    const runEnd = new Date();
    return {
      label: options.label,
      runStart: state.runStart.toISOString(),
      runEnd: runEnd.toISOString(),
      completedFully: true,
      totalConsidered: 0,
      processed: 0,
      regenerated: 0,
      unchanged: 0,
      errored: 0,
      skipped: 0,
      failures: [],
      acceptance,
      durationMs: runEnd.getTime() - state.runStart.getTime(),
    };
  }

  const { getPlayerOutlook } = await import("../../../playerOutlookEngine");

  let completedFully = true;
  for (let i = 0; i < candidates.length; i++) {
    if (shouldAbort?.()) {
      reporter.info(`Aborted by caller after ${state.processed}/${candidates.length} rows.`, {
        aborted: true,
      });
      completedFully = false;
      break;
    }

    const row = candidates[i];
    const oldVerdict = extractVerdict(row.outlookJson);
    const oldModifier = extractModifier(row.outlookJson);
    const callStart = Date.now();

    try {
      await withTimeout(
          getPlayerOutlook(
            { playerName: row.playerName, sport: row.sport },
            { forceRefresh: true },
          ),
          GEMINI_TIMEOUT_MS,
          `getPlayerOutlook(${row.playerName})`,
        )

      const [refreshed] = await db
        .select({ outlookJson: playerOutlookCache.outlookJson })
        .from(playerOutlookCache)
        .where(eq(playerOutlookCache.playerKey, row.playerKey));
      const newVerdict = extractVerdict(refreshed?.outlookJson);
      const newModifier = extractModifier(refreshed?.outlookJson);
      const changed =
        newVerdict !== oldVerdict || newModifier !== oldModifier;

      if (changed) state.regenerated++;
      else state.unchanged++;
      state.processed++;

      const durationMs = Date.now() - callStart;
      reporter.rowProgress({
        index: i + 1,
        total: candidates.length,
        playerName: row.playerName,
        sport: row.sport,
        outcome: changed ? "regenerated" : "unchanged",
        durationMs,
        oldVerdict,
        newVerdict,
        oldModifier,
        newModifier,
      });
    } catch (err) {
      state.errored++;
    state.processed++;
      const isTimeout = err instanceof TimeoutError;
      const errorMessage = isTimeout
        ? `gemini_timeout after ${GEMINI_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      if (isTimeout) {
        console.warn(
          `[CachedOutlookBackfill] Gemini timeout for ${row.playerName} (${row.sport}) after ${GEMINI_TIMEOUT_MS}ms — logging as failure and continuing`,
        );
      }
      state.failures.push({
    playerName: row.playerName,
      sport: row.sport,
      errorMessage,
    });
      const durationMs = Date.now() - callStart;
      reporter.rowProgress({
        index: i + 1,
        total: candidates.length,
        playerName: row.playerName,
        sport: row.sport,
        outcome: "errored",
        durationMs,
        errorMessage,
      });
    }

    if (i < candidates.length - 1 && !shouldAbort?.()) {
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_CALLS_MS),
      );
    }
  }

  const acceptance = await buildAcceptance(state);
  const runEnd = new Date();
  return {
    label: options.label,
    runStart: state.runStart.toISOString(),
    runEnd: runEnd.toISOString(),
    completedFully,
    totalConsidered: state.totalConsidered,
    processed: state.processed,
    regenerated: state.regenerated,
    unchanged: state.unchanged,
    errored: state.errored,
    skipped: state.totalConsidered - state.processed,
    failures: state.failures,
    acceptance,
    durationMs: runEnd.getTime() - state.runStart.getTime(),
  };
}
