import fs from "fs";
import path from "path";
import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import { isNull, eq } from "drizzle-orm";
import { BackfillReporter, DELAY_BETWEEN_CALLS_MS, GEMINI_TIMEOUT_MS } from "./jobs/handlers/cachedOutlookBackfill/core";
import { withTimeout } from "./lib/withTimeout";

// ---------------------------------------------------------------------------
// Marker file for interrupt-resilience (persists across workspace resets)
// ---------------------------------------------------------------------------
const MARKER_PATH = path.join(process.cwd(), "data", "verdict_migration_state.json");

interface MarkerState {
  startedAt: string;
  status: "running" | "complete";
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

// On module load: check if a prior run was interrupted
(function checkInterruptedOnStartup() {
  const marker = readMarker();
  if (marker && marker.status === "running") {
    state.interruptedWarning = `Previous migration was interrupted at ${marker.startedAt}. In-memory progress is unavailable. Re-run recommended to complete remaining entries.`;
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
export async function triggerV2Migration(force = false): Promise<{ queued: boolean; reason?: string }> {
  if (isRunning) return { queued: false, reason: "Migration already in progress" };

  isRunning = true;
  const startedAt = new Date().toISOString();
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
  writeMarker({ startedAt, status: "running" });

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
  const candidates = force
    ? await candidateBaseQuery
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
