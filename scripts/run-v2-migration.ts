/**
 * One-shot runner for the V2 verdict migration. Bypasses the HTTP API (which
 * requires CSRF + secure-cookie session that's awkward to satisfy from a shell)
 * by invoking the migration job directly. Intended to be detached (nohup) so
 * the ~90-minute run survives shell timeouts.
 *
 * Usage:  nohup tsx scripts/run-v2-migration.ts force > /tmp/v2-migration.log 2>&1 &
 *         echo $! > /tmp/v2-migration.pid
 */

async function main() {
  const force = process.argv.includes("force");
  console.log(`[run-v2-migration] starting force=${force} pid=${process.pid} at ${new Date().toISOString()}`);

  const { triggerV2Migration, getV2MigrationStatus } = await import("../server/verdictMigrationJob");
  const result = await triggerV2Migration(force);
  console.log(`[run-v2-migration] trigger result:`, result);
  if (!result.queued) {
    console.error(`[run-v2-migration] not queued -- exiting`);
    process.exit(1);
  }

  // Poll until done
  let lastProcessed = -1;
  while (true) {
    await new Promise((r) => setTimeout(r, 30_000));
    const state = getV2MigrationStatus();
    const p = state.progress;
    if (p && p.processedCount !== lastProcessed) {
      console.log(`[run-v2-migration] progress: ${p.processedCount}/${p.totalCount} -- last=${p.currentPlayerName} -- ETA ${Math.round((p.estimatedRemainingMs ?? 0) / 60000)}m -- tally=${JSON.stringify(p.runningTally)}`);
      lastProcessed = p.processedCount;
    }
    if (state.status === "complete") {
      console.log(`[run-v2-migration] DONE at ${state.completedAt}`);
      console.log(`[run-v2-migration] summary:`, JSON.stringify(state.summary, null, 2));
      console.log(`[run-v2-migration] afterDistribution:`, JSON.stringify(state.afterDistribution, null, 2));
      console.log(`[run-v2-migration] bandValidation:`, JSON.stringify(state.bandValidation, null, 2));
      process.exit(0);
    }
    if (state.status === "error") {
      console.error(`[run-v2-migration] ERROR:`, state.error);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(`[run-v2-migration] FATAL:`, err);
  process.exit(1);
});
