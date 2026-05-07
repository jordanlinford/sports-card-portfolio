import fs from "fs";
import path from "path";
import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import { isNull, eq, lt, or } from "drizzle-orm";
import { BackfillReporter, DELAY_BETWEEN_CALLS_MS, GEMINI_TIMEOUT_MS } from "./jobs/handlers/cachedOutlookBackfill/core";
import { withTimeout } from "./lib/withTimeout";

// ---------------------------------------------------------------------------
// Marker file for interrupt-resilience (persists across workspace resets)
// ---------------------------------------------------------------------------
const MARKER_PATH = "/tmp/verdict_migration_state.json";

interface MarkerState {
  startedAt: string;
  status: "running" | "complete";
  forceMode?: boolean;
}

function readMarker(): MarkerState | null {
  try {
    if (!fs.existsSync(MARKER_PATH)) return null;
    return JSON.parse(fs.readFileSync(MARKER_PATH, "utf8")) as MarkerState;
  } catch {
    return null;
  }
}

function writeMarker(state: MarkerState): void {
  try {
    const dir = path.dirname(MARKER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MARKER_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("[VerdictMigration] Failed to write marker file:", err);
  }
}

function clearMarker(): void {
  try {
    if (fs.existsSync(MARKER_PATH)) fs.unlinkSync(MARKER_PATH);
  } catch (err) {
    console.error("[VerdictMigration] Failed to clear marker file:", err);
  }
}

// ---------------------------------------------------------------------------
// Validation bands -- ±5pp tolerance
// ---------------------------------------------------------------------------
const BANDS: Array<{ key: string; verdicts: string[]; minPct: number; maxPct: number }> = [
  { key: "WATCH",        verdicts: ["WATCH"],          minPct: 0,  maxPct: 10 },
  { key: "AVOID+SELL",   verdicts: ["AVOID", "SELL"],  minPct: 15, maxPct: 25 },
  { key: "LONGSHOT_BET", verdicts: ["LONGSHOT_BET"],   minPct: 5,  maxPct: 15 },
  { key: "BUY",          verdicts: ["BUY"],            minPct: 15, maxPct: 25 },
  { key: "MONITOR",      verdicts: ["MONITOR"],        minPct: 25, maxPct: 40 },
];
const TOLERANCE = 5;

// ---------------------------------------------------------------------------
// Module-level state (prewarm pattern)
// ---------------------------------------------------------------------------
let isRunning = false;

export interface VerdictDistribution {
  BUY: number; MONITOR: number; WATCH: number;
  AVOID: number; SELL: number; LONGSHOT_BET: number;
  total: number;
}

export interface BandValidation {
  key: string;
  actualPct: number;
  minPct: number;
  maxPct: number;
  inTolerance: boolean;
  delta: number; // how far outside tolerance (0 if in tolerance)
}

export interface MigrationProgress {
  processedCount: number;
  totalCount: number;
  currentPlayerName: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
  lastUpdatedAt: string;
  runningTally: {
    BUY: number; MONITOR: number; WATCH: number;
    AVOID: number; SELL: number; LONGSHOT_BET: number; errored: number;
  };
}

export type MigrationStatus = "idle" | "running" | "complete" | "error";

export interface MigrationState {
  status: MigrationStatus;
  startedAt: string | null;
  completedAt: string | null;
  forceMode: boolean;
  progress: MigrationProgress | null;
  summary: Record<string, unknown> | null;
  beforeDistribution: VerdictDistribution | null;
  afterDistribution: VerdictDistribution | null;
  bandValidation: BandValidation[] | null;
  error: string | null;
  interruptedWarning: string | null;
}

let state: MigrationState = {
  status: "idle",
  startedAt: null,
  completedAt: null,
  forceMode: false,
  progress: null,
  summary: null,
  beforeDistribution: null,
  afterDistribution: null,
  bandValidation: null,
  error: null,
  interruptedWarning: null,
};

// On module load: check if a prior run was interrupted; auto-resume after a short delay
(function checkInterruptedOnStartup() {
  const marker = readMarker();
  if (marker && marker.status === "running") {
    state.interruptedWarning = `Previous migration was interrupted at ${marker.startedAt}. Auto-resuming in 30s...`;
    const resumeForce = marker.forceMode === true;
    console.log(`[VerdictMigration] Detected interrupted run from ${marker.startedAt} (force=${resumeForce}). Auto-resuming in 30s.`);
    const resumeStartedAt = marker.startedAt;
    setTimeout(() => {
      if (isRunning) return;
      console.log(`[VerdictMigration] Auto-resume firing now (force=${resumeForce}, preserving startedAt=${resumeStartedAt}).`);
      void triggerV2Migration(resumeForce, resumeStartedAt).then((r) => {
        if (!r.queued) console.warn(`[VerdictMigration] Auto-resume not queued: ${r.reason}`);
      });
    }, 30_000);
  }
})();

// ---------------------------------------------------------------------------
// Distribution snapshot
// ---------------------------------------------------------------------------
async function snapshotDistribution(): Promise<VerdictDistribution> {
  const rows = await db
    .select({
      outlookJson: playerOutlookCache.outlookJson,
    })
    .from(playerOutlookCache);

  const dist: VerdictDistribution = { BUY: 0, MONITOR: 0, WATCH: 0, AVOID: 0, SELL: 0, LONGSHOT_BET: 0, total: rows.length };
  for (const r of rows) {
    const json = r.outlookJson as Record<string, unknown> | null;
    const verdict = (json?.investmentCall as { verdict?: string })?.verdict ?? "";
    const vKey = verdict as keyof VerdictDistribution;
    if (vKey in dist && vKey !== "total") (dist[vKey] as number)++;
  }
  return dist;
}

function validateBands(dist: VerdictDistribution): BandValidation[] {
  if (dist.total === 0) return [];
  return BANDS.map((band) => {
    const count = band.verdicts.reduce((s, v) => s + ((dist as unknown as Record<string, number>)[v] ?? 0), 0);
    const actualPct = Math.round((count / dist.total) * 100);
    const inTolerance = actualPct >= band.minPct - TOLERANCE && actualPct <= band.maxPct + TOLERANCE;
    const delta = inTolerance ? 0 :
      actualPct < band.minPct - TOLERANCE ? actualPct - (band.minPct - TOLERANCE) :
      actualPct - (band.maxPct + TOLERANCE);
    return { key: band.key, actualPct, minPct: band.minPct, maxPct: band.maxPct, inTolerance, delta };
  });
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------
export async function triggerV2Migration(force = false, resumeFromStartedAt?: string): Promise<{ queued: boolean; reason?: string }> {
  if (isRunning) return { queued: false, reason: "Migration already in progress" };

  isRunning = true;
  const startedAt = resumeFromStartedAt ?? new Date().toISOString();
  state = {
    status: "running",
    startedAt,
    completedAt: null,
    forceMode: force,
    progress: null,
    summary: null,
    beforeDistribution: null,
    afterDistribution: null,
    bandValidation: null,
    error: null,
    interruptedWarning: null,
  };
  writeMarker({ startedAt, status: "running", forceMode: force });

  // Fire-and-forget
  runMigration(force).catch((err: unknown) => {
    state.status = "error";
    state.error = err instanceof Error ? err.message : String(err);
    isRunning = false;
    clearMarker();
  });

  return { queued: true };
}

async function runMigration(force: boolean): Promise<void> {
  const runStart = Date.now();

  // Pre-run distribution snapshot
  const beforeDist = await snapshotDistribution();
  state.beforeDistribution = beforeDist;
  state.progress = {
    processedCount: 0,
    totalCount: beforeDist.total,
    currentPlayerName: "",
    elapsedMs: 0,
    estimatedRemainingMs: 0,
    lastUpdatedAt: new Date().toISOString(),
    runningTally: { BUY: 0, MONITOR: 0, WATCH: 0, AVOID: 0, SELL: 0, LONGSHOT_BET: 0, errored: 0 },
  };

  // Determine candidates: full row data for direct loop (true skip support)
  const candidateBaseQuery = db
    .select({
      playerKey: playerOutlookCache.playerKey,
      playerName: playerOutlookCache.playerName,
      sport: playerOutlookCache.sport,
      outlookJson: playerOutlookCache.outlookJson,
    })
    .from(playerOutlookCache);
  // Resilience: in force mode, exclude rows already touched in this run cycle
  // (lastFetchedAt >= startedAt) so workflow restarts don't redo completed entries.
  const startedAtDate = new Date(state.startedAt!);
  const candidates = force
    ? await candidateBaseQuery.where(
        or(
          isNull(playerOutlookCache.lastFetchedAt),
          lt(playerOutlookCache.lastFetchedAt, startedAtDate),
        ),
      )
    : await candidateBaseQuery.where(isNull(playerOutlookCache.confidenceScore));

  state.progress.totalCount = candidates.length;
  if (!force) {
    console.log(
      `[VerdictMigration] Skip-mode: ${candidates.length} unmigrated (of ${beforeDist.total} total)`,
    );
    if (candidates.length === 0) {
      console.log("[VerdictMigration] All entries already migrated -- nothing to do.");
      state.status = "complete";
      state.completedAt = new Date().toISOString();
      state.afterDistribution = beforeDist;
      state.bandValidation = validateBands(beforeDist);
      isRunning = false;
      clearMarker();
      return;
    }
  } else {
    console.log(`[VerdictMigration] Force mode: regenerating all ${candidates.length} entries.`);
  }
  // Build reporter to capture progress events
  const tallyKeys = ["BUY", "MONITOR", "WATCH", "AVOID", "SELL", "LONGSHOT_BET"] as const;
  const msHistory: number[] = [];

  const reporter: BackfillReporter = {
    info: (message, extra) => {
      console.log(`[VerdictMigration] ${message}`, extra ?? "");
    },
    rowProgress: (event) => {
      if (!state.progress) return;
      state.progress.processedCount = event.index + 1;
      state.progress.totalCount = Math.max(state.progress.totalCount, event.total);
      state.progress.currentPlayerName = event.playerName;
      state.progress.elapsedMs = Date.now() - runStart;
      state.progress.lastUpdatedAt = new Date().toISOString();

      if (event.outcome === "errored") {
        state.progress.runningTally.errored++;
      } else if (event.newVerdict && tallyKeys.includes(event.newVerdict as typeof tallyKeys[number])) {
        state.progress.runningTally[event.newVerdict as typeof tallyKeys[number]]++;
      }

      // Running ETA
      msHistory.push(event.durationMs);
      const avgMs = msHistory.reduce((s, v) => s + v, 0) / msHistory.length;
      const remaining = state.progress.totalCount - state.progress.processedCount;
      state.progress.estimatedRemainingMs = Math.round(avgMs * remaining);
    },
  };

  // Run migration loop directly over filtered candidates (true skip support)
  const { getPlayerOutlook } = await import("./playerOutlookEngine");
  const extractVerdict = (oj: unknown): string =>
    (oj as any)?.investmentCall?.verdict ?? "";

  let errored = 0;
  let regenerated = 0;
  let unchanged = 0;

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const oldVerdict = extractVerdict(row.outlookJson);
    const callStart = Date.now();
    try {
      await withTimeout(
        getPlayerOutlook(
          { playerName: row.playerName, sport: row.sport },
          { forceRefresh: true },
        ),
        GEMINI_TIMEOUT_MS,
        `getPlayerOutlook(${row.playerName})`,
      );
      const [refreshed] = await db
        .select({ outlookJson: playerOutlookCache.outlookJson })
        .from(playerOutlookCache)
        .where(eq(playerOutlookCache.playerKey, row.playerKey));
      const newVerdict = extractVerdict(refreshed?.outlookJson);
      const changed = newVerdict !== oldVerdict;
      if (changed) regenerated++; else unchanged++;
      reporter.rowProgress({
        index: i + 1,
        total: candidates.length,
        playerName: row.playerName,
        sport: row.sport,
        outcome: changed ? "regenerated" : "unchanged",
        durationMs: Date.now() - callStart,
        oldVerdict,
        newVerdict,
      });
    } catch (err: any) {
      errored++;
      const durationMs = Date.now() - callStart;
      console.error(
        `[VerdictMigration] Error processing ${row.playerName}: ${err.message}`,
      );
      reporter.rowProgress({
        index: i + 1,
        total: candidates.length,
        playerName: row.playerName,
        sport: row.sport,
        outcome: "errored",
        durationMs,
        errorMessage: (err as any).message,
      });
    }
    if (i < candidates.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_CALLS_MS),
      );
    }
  }

  // Build summary for state storage
  const summary = {
    label: "v2-migration",
    runStart: state.startedAt ?? new Date().toISOString(),
    runEnd: new Date().toISOString(),
    completedFully: true,
    totalConsidered: candidates.length,
    processed: regenerated + unchanged + errored,
    regenerated,
    unchanged,
    errored,
  };

  // Post-run distribution snapshot
  const afterDist = await snapshotDistribution();
  const bandValidation = validateBands(afterDist);

  // Log audit summary
  const outOfTolerance = bandValidation.filter((b) => !b.inTolerance);
  if (outOfTolerance.length > 0) {
    console.warn(`[VerdictMigration] ${outOfTolerance.length} band(s) out of tolerance:`, outOfTolerance);
  } else {
    console.log("[VerdictMigration] All bands in tolerance.");
  }

  state.status = "complete";
  state.completedAt = new Date().toISOString();
  state.summary = summary;
  state.afterDistribution = afterDist;
  state.bandValidation = bandValidation;
  isRunning = false;
  clearMarker();

  console.log(`[VerdictMigration] Complete. Processed ${summary.processed}/${summary.totalConsidered}. Errors: ${summary.errored}.`);
}

// ---------------------------------------------------------------------------
// Status getter
// ---------------------------------------------------------------------------
export function getV2MigrationStatus(): MigrationState {
  return state;
}

// ---------------------------------------------------------------------------
// Chunked migration (B-i): admin-driven pull, autoscale-resilient
// ---------------------------------------------------------------------------
export interface ChunkResult {
  done: boolean;
  reason?: string;
  processedThisBatch: number;
  regeneratedThisBatch: number;
  unchangedThisBatch: number;
  erroredThisBatch: number;
  remainingCount: number;
  totalCount: number;
  cumulativeProcessed: number;
  runningTally: MigrationProgress["runningTally"];
  startedAt: string | null;
  completedAt?: string | null;
  afterDistribution?: VerdictDistribution | null;
  bandValidation?: BandValidation[] | null;
}

export async function runMigrationChunk(batchSize: number): Promise<ChunkResult> {
  if (isRunning) {
    return {
      done: false,
      reason: "Chunk already running",
      processedThisBatch: 0,
      regeneratedThisBatch: 0,
      unchangedThisBatch: 0,
      erroredThisBatch: 0,
      remainingCount: state.progress?.totalCount ?? 0,
      totalCount: state.progress?.totalCount ?? 0,
      cumulativeProcessed: state.progress?.processedCount ?? 0,
      runningTally: state.progress?.runningTally ?? { BUY: 0, MONITOR: 0, WATCH: 0, AVOID: 0, SELL: 0, LONGSHOT_BET: 0, errored: 0 },
      startedAt: state.startedAt,
    };
  }

  isRunning = true;
  try {
    const size = Math.max(1, Math.min(10, Math.floor(batchSize)));

    // Initialize state on first chunk of a fresh run
    const isFreshRun = state.status !== "running" || !state.startedAt;
    if (isFreshRun) {
      const beforeDist = await snapshotDistribution();
      const remaining = await db
        .select({ playerKey: playerOutlookCache.playerKey })
        .from(playerOutlookCache)
        .where(isNull(playerOutlookCache.confidenceScore));
      const startedAt = new Date().toISOString();
      state = {
        status: "running",
        startedAt,
        completedAt: null,
        forceMode: false,
        progress: {
          processedCount: 0,
          totalCount: remaining.length,
          currentPlayerName: "",
          elapsedMs: 0,
          estimatedRemainingMs: 0,
          lastUpdatedAt: startedAt,
          runningTally: { BUY: 0, MONITOR: 0, WATCH: 0, AVOID: 0, SELL: 0, LONGSHOT_BET: 0, errored: 0 },
        },
        summary: null,
        beforeDistribution: beforeDist,
        afterDistribution: null,
        bandValidation: null,
        error: null,
        interruptedWarning: null,
      };
      writeMarker({ startedAt, status: "running", forceMode: false });
      console.log(`[VerdictMigration] Chunked run started. ${remaining.length} unmigrated of ${beforeDist.total} total.`);
    }

    // Query this chunk's candidates
    const candidates = await db
      .select({
        playerKey: playerOutlookCache.playerKey,
        playerName: playerOutlookCache.playerName,
        sport: playerOutlookCache.sport,
        outlookJson: playerOutlookCache.outlookJson,
      })
      .from(playerOutlookCache)
      .where(isNull(playerOutlookCache.confidenceScore))
      .limit(size);

    // Zero candidates = migration complete; finalize
    if (candidates.length === 0) {
      const afterDist = await snapshotDistribution();
      const bandValidation = validateBands(afterDist);
      state.status = "complete";
      state.completedAt = new Date().toISOString();
      state.afterDistribution = afterDist;
      state.bandValidation = bandValidation;
      state.summary = {
        label: "v2-migration-chunked",
        runStart: state.startedAt ?? new Date().toISOString(),
        runEnd: state.completedAt,
        completedFully: true,
        totalConsidered: state.progress?.totalCount ?? 0,
        processed: state.progress?.processedCount ?? 0,
      };
      const tally = state.progress?.runningTally ?? { BUY: 0, MONITOR: 0, WATCH: 0, AVOID: 0, SELL: 0, LONGSHOT_BET: 0, errored: 0 };
      const cumulativeProcessed = state.progress?.processedCount ?? 0;
      const totalCount = state.progress?.totalCount ?? 0;
      clearMarker();
      console.log(`[VerdictMigration] Chunked migration complete. Cumulative ${cumulativeProcessed}/${totalCount}.`);
      return {
        done: true,
        processedThisBatch: 0,
        regeneratedThisBatch: 0,
        unchangedThisBatch: 0,
        erroredThisBatch: 0,
        remainingCount: 0,
        totalCount,
        cumulativeProcessed,
        runningTally: tally,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        afterDistribution: afterDist,
        bandValidation,
      };
    }

    // Process this chunk
    const { getPlayerOutlook } = await import("./playerOutlookEngine");
    const extractVerdict = (oj: unknown): string =>
      (oj as any)?.investmentCall?.verdict ?? "";
    const tallyKeys = ["BUY", "MONITOR", "WATCH", "AVOID", "SELL", "LONGSHOT_BET"] as const;

    let regeneratedThisBatch = 0;
    let unchangedThisBatch = 0;
    let erroredThisBatch = 0;
    const chunkStart = Date.now();

    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      const oldVerdict = extractVerdict(row.outlookJson);
      const callStart = Date.now();
      try {
        await withTimeout(
          getPlayerOutlook(
            { playerName: row.playerName, sport: row.sport },
            { forceRefresh: true },
          ),
          GEMINI_TIMEOUT_MS,
          `getPlayerOutlook(${row.playerName})`,
        );
        const [refreshed] = await db
          .select({ outlookJson: playerOutlookCache.outlookJson })
          .from(playerOutlookCache)
          .where(eq(playerOutlookCache.playerKey, row.playerKey));
        const newVerdict = extractVerdict(refreshed?.outlookJson);
        if (newVerdict !== oldVerdict) regeneratedThisBatch++;
        else unchangedThisBatch++;
        if (state.progress && newVerdict && tallyKeys.includes(newVerdict as typeof tallyKeys[number])) {
          state.progress.runningTally[newVerdict as typeof tallyKeys[number]]++;
        }
      } catch (err: any) {
        erroredThisBatch++;
        console.error(`[VerdictMigration][chunk] Error processing ${row.playerName}: ${err.message}`);
        if (state.progress) state.progress.runningTally.errored++;
      }
      // Update progress incrementally so a mid-chunk kill is recoverable on next click
      if (state.progress) {
        state.progress.processedCount++;
        state.progress.currentPlayerName = row.playerName;
        state.progress.lastUpdatedAt = new Date().toISOString();
        state.progress.elapsedMs += Date.now() - callStart;
      }
      if (i < candidates.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
      }
    }

    // Compute remaining after this chunk
    const remainingRows = await db
      .select({ playerKey: playerOutlookCache.playerKey })
      .from(playerOutlookCache)
      .where(isNull(playerOutlookCache.confidenceScore));
    const remainingCount = remainingRows.length;

    if (state.progress) {
      const avgMs = state.progress.processedCount > 0
        ? state.progress.elapsedMs / state.progress.processedCount
        : 0;
      state.progress.estimatedRemainingMs = Math.round(avgMs * remainingCount);
    }

    const chunkDurationMs = Date.now() - chunkStart;
    console.log(`[VerdictMigration][chunk] Processed ${candidates.length} in ${Math.round(chunkDurationMs / 1000)}s. Remaining: ${remainingCount}.`);

    // If remaining is now zero, finalize on this same call (no need to wait for next chunk)
    if (remainingCount === 0) {
      const afterDist = await snapshotDistribution();
      const bandValidation = validateBands(afterDist);
      state.status = "complete";
      state.completedAt = new Date().toISOString();
      state.afterDistribution = afterDist;
      state.bandValidation = bandValidation;
      state.summary = {
        label: "v2-migration-chunked",
        runStart: state.startedAt ?? new Date().toISOString(),
        runEnd: state.completedAt,
        completedFully: true,
        totalConsidered: state.progress?.totalCount ?? 0,
        processed: state.progress?.processedCount ?? 0,
      };
      clearMarker();
      console.log(`[VerdictMigration] Chunked migration complete. Cumulative ${state.progress?.processedCount}/${state.progress?.totalCount}.`);
      return {
        done: true,
        processedThisBatch: candidates.length,
        regeneratedThisBatch,
        unchangedThisBatch,
        erroredThisBatch,
        remainingCount: 0,
        totalCount: state.progress?.totalCount ?? 0,
        cumulativeProcessed: state.progress?.processedCount ?? 0,
        runningTally: state.progress?.runningTally ?? { BUY: 0, MONITOR: 0, WATCH: 0, AVOID: 0, SELL: 0, LONGSHOT_BET: 0, errored: 0 },
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        afterDistribution: afterDist,
        bandValidation,
      };
    }

    return {
      done: false,
      processedThisBatch: candidates.length,
      regeneratedThisBatch,
      unchangedThisBatch,
      erroredThisBatch,
      remainingCount,
      totalCount: state.progress?.totalCount ?? 0,
      cumulativeProcessed: state.progress?.processedCount ?? 0,
      runningTally: state.progress?.runningTally ?? { BUY: 0, MONITOR: 0, WATCH: 0, AVOID: 0, SELL: 0, LONGSHOT_BET: 0, errored: 0 },
      startedAt: state.startedAt,
    };
  } finally {
    isRunning = false;
  }
}
