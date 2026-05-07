/**
 * Phase 1 verdict migration: backfill cards.legacy_tier from the player registry.
 *
 * Goal: make `cards.legacy_tier` consistent across all cards for the same player
 * by sourcing the value from the authoritative player registry. This eliminates
 * cases where two cards of the same player (e.g. the two Josh Allen cards in dev
 * with legacy_tier = "STAR" and "SUPERSTAR") produce divergent verdicts purely
 * because of a per-card data hygiene issue.
 *
 * Strategy:
 *   For every card with a non-null playerName:
 *     1. Look up the player in the registry.
 *     2. If found, map the registry careerStage to the legacy cards.legacy_tier
 *        vocabulary (PROSPECT|RISING_STAR|STAR|SUPERSTAR|AGING_VET|BUST|RETIRED|HOF|LEGEND_DECEASED).
 *     3. UPDATE cards.legacy_tier if it differs.
 *     4. If not found in registry, leave the existing value alone.
 *
 * This is the LAST write to cards.legacy_tier. Phase 2 makes Engine B read the
 * canonical CareerStage from the registry directly and stop consulting
 * cards.legacy_tier. Phase 3 drops the column.
 *
 * Run with:
 *   DEV  dry-run:  tsx scripts/backfill-legacy-tier-from-registry.ts --dry-run
 *   DEV  live:     tsx scripts/backfill-legacy-tier-from-registry.ts
 *   PROD dry-run:  PROD_DATABASE_URL=... tsx scripts/backfill-legacy-tier-from-registry.ts --prod --dry-run
 *   PROD live:     PROD_DATABASE_URL=... tsx scripts/backfill-legacy-tier-from-registry.ts --prod
 *
 * PROD safety: --prod and PROD_DATABASE_URL are BOTH required. Either one alone
 * aborts immediately. The script rewrites process.env.DATABASE_URL to the prod
 * URL BEFORE importing ../server/db so the pool only ever sees the prod string.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const PROD_MODE = process.argv.includes("--prod");

// ---------------------------------------------------------------------------
// PROD safety gate -- runs BEFORE any import of ../server/db so the pool can
// never accidentally bind to the dev DATABASE_URL when we intend to hit prod.
// ---------------------------------------------------------------------------
if (PROD_MODE) {
  const prodUrl = process.env.PROD_DATABASE_URL;
  if (!prodUrl) {
    console.error("");
    console.error("===============================================================");
    console.error("ERROR: --prod flag requires PROD_DATABASE_URL env var to be set.");
    console.error("Set it with:  export PROD_DATABASE_URL='postgres://...'");
    console.error("Then re-run.  Aborting.");
    console.error("===============================================================");
    process.exit(1);
  }
  // Sanity check: refuse to run --prod against an obviously dev-looking URL.
  if (prodUrl === process.env.DATABASE_URL) {
    console.error("");
    console.error("===============================================================");
    console.error("ERROR: PROD_DATABASE_URL is identical to DATABASE_URL.");
    console.error("This looks like a misconfiguration -- both env vars point at the");
    console.error("same database. Refusing to run in --prod mode. Aborting.");
    console.error("===============================================================");
    process.exit(1);
  }
  console.log("");
  console.log("===============================================================");
  console.log("⚠️  PROD MODE -- Will operate on PRODUCTION database");
  console.log(`⚠️  Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE WRITES"}`);
  console.log("===============================================================");
  console.log("");
  // Override DATABASE_URL so the lazily-loaded db module connects to prod.
  process.env.DATABASE_URL = prodUrl;
} else if (process.env.PROD_DATABASE_URL && !DRY_RUN) {
  // Belt-and-suspenders: if PROD_DATABASE_URL is set in the env but --prod was
  // NOT passed, refuse to run a LIVE backfill. The user almost certainly forgot
  // the flag and is about to write to dev with a stale prod URL hanging around.
  console.error("");
  console.error("===============================================================");
  console.error("ERROR: PROD_DATABASE_URL is set but --prod flag was NOT passed.");
  console.error("Refusing to run live writes -- pass --prod to confirm prod intent,");
  console.error("or unset PROD_DATABASE_URL to run against dev. Aborting.");
  console.error("===============================================================");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Dynamic imports -- MUST come after the DATABASE_URL override above so that
// the db module's pool factory reads the (possibly rewritten) URL.
// ---------------------------------------------------------------------------

// Fix A2: strip trailing card-number suffixes from dirty player_name values
// (e.g. "Josh Allen #304" -> "Josh Allen", "Lamar Jackson 8" -> "Lamar Jackson").
// Only applies to lookup; the underlying cards.player_name is not mutated by
// this script. Card-data hygiene fixes (Fix A1) should still happen separately.
function stripCardNumberSuffix(name: string): string {
  return name.replace(/\s*#?\d+\s*$/, "").trim();
}

// Map registry careerStage -> legacy cards.legacy_tier vocabulary.
// Engine A (cardOutlookService) and Engine B's LEGACY_HOLD detection both still
// read this column in Phase 1. Mapping preserves their existing behavior.
function registryStageToLegacyTier(registryStage: string): string | null {
  const map: Record<string, string> = {
    PROSPECT: "PROSPECT",
    ROOKIE: "PROSPECT",
    YEAR_2: "RISING_STAR",
    YEAR_3: "RISING_STAR",
    YEAR_4: "STAR",
    PRIME: "STAR",
    VETERAN: "AGING_VET",
    AGING: "AGING_VET",
    RETIRED: "RETIRED",
    RETIRED_HOF: "HOF",
    BUST: "BUST",
  };
  return map[registryStage] ?? null;
}

interface UpdatePlan {
  cardId: number;
  playerName: string;
  oldTier: string | null;
  newTier: string;
  registryStage: string;
}

interface SkippedDowngrade {
  cardId: number;
  playerName: string;
  currentTier: string;
  wouldHaveBeen: string;
  registryStage: string;
  reason: string;
}

// Terminal tiers we never silently downgrade. If a card already carries one of
// these values, the registry-driven backfill skips it (the registry may be more
// granular than the legacy bucket -- e.g. Eli Manning is VETERAN in registry
// but already HOF in legacy_tier on a card; preserve the more terminal value).
// Within the terminal set, we still allow strict upgrades along the ladder
// RETIRED -> HOF -> LEGEND_DECEASED.
const TERMINAL_TIERS_NO_DOWNGRADE = new Set(["HOF", "LEGEND_DECEASED", "RETIRED"]);

function isDowngradeFromTerminal(currentTier: string | null, newTier: string): boolean {
  if (!currentTier) return false; // NULL fills always allowed
  if (currentTier === newTier) return false;
  if (!TERMINAL_TIERS_NO_DOWNGRADE.has(currentTier)) return false;

  // Allow strict upgrades within the terminal ladder.
  const isUpgradeWithinTerminal =
    (currentTier === "RETIRED" && (newTier === "HOF" || newTier === "LEGEND_DECEASED")) ||
    (currentTier === "HOF" && newTier === "LEGEND_DECEASED");

  return !isUpgradeWithinTerminal;
}

async function main() {
  // Dynamic imports — see header note. Order matters: db must load AFTER any
  // env mutation above.
  const { db } = await import("../server/db");
  const { cards } = await import("../shared/schema");
  const { isNotNull, eq } = await import("drizzle-orm");
  const { lookupPlayer, ensureRegistryLoaded, getRegistrySource } = await import("../server/playerRegistry");

  console.log(`[Backfill] Phase 1 verdict migration -- legacy_tier backfill from player registry`);
  console.log(`[Backfill] Target: ${PROD_MODE ? "PRODUCTION" : "development"}`);
  console.log(`[Backfill] Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE"}`);
  console.log(``);

  // Force the registry to load from the (prod) database BEFORE any lookupPlayer
  // call. lookupPlayer's internal loadRegistry() falls back to CSV synchronously
  // if we don't await this first.
  await ensureRegistryLoaded();
  const regSource = getRegistrySource();
  console.log(`[Backfill] Registry source: ${regSource}`);
  if (PROD_MODE && regSource !== "database") {
    console.error(`[Backfill] FATAL: prod backfill requires database-backed registry, got "${regSource}". Aborting.`);
    process.exit(1);
  }
  console.log(``);

  // Pull every card with a playerName -- we only backfill rows we can attribute
  // to a player. TCG/non-sport cards are excluded automatically because they
  // typically have no playerName.
  const allCards = await db
    .select({
      id: cards.id,
      playerName: cards.playerName,
      legacyTier: cards.legacyTier,
    })
    .from(cards)
    .where(isNotNull(cards.playerName));

  console.log(`[Backfill] Scanned ${allCards.length} cards with playerName`);

  const plans: UpdatePlan[] = [];
  const skippedDowngrades: SkippedDowngrade[] = [];
  let registryHits = 0;
  let registryMisses = 0;
  let alreadyCorrect = 0;
  let unmappable = 0;

  for (const card of allCards) {
    if (!card.playerName) continue;
    // Try direct lookup first; fall back to stripped version for dirty data
    let lookup = lookupPlayer(card.playerName);
    if (!lookup.found) {
      const stripped = stripCardNumberSuffix(card.playerName);
      if (stripped && stripped !== card.playerName) {
        lookup = lookupPlayer(stripped);
        if (lookup.found) {
          console.log(`[Backfill]   matched via suffix-strip: "${card.playerName}" -> "${stripped}" (card #${card.id})`);
        }
      }
    }
    if (!lookup.found || !lookup.entry) {
      registryMisses++;
      continue;
    }
    registryHits++;
    const newTier = registryStageToLegacyTier(lookup.entry.careerStage);
    if (newTier === null) {
      unmappable++;
      console.log(`[Backfill]   unmapped registry stage "${lookup.entry.careerStage}" for "${card.playerName}" (card #${card.id})`);
      continue;
    }
    if (card.legacyTier === newTier) {
      alreadyCorrect++;
      continue;
    }
    if (isDowngradeFromTerminal(card.legacyTier ?? null, newTier)) {
      skippedDowngrades.push({
        cardId: card.id,
        playerName: card.playerName,
        currentTier: card.legacyTier as string,
        wouldHaveBeen: newTier,
        registryStage: lookup.entry.careerStage,
        reason: `preserves terminal tier "${card.legacyTier}"`,
      });
      continue;
    }
    plans.push({
      cardId: card.id,
      playerName: card.playerName,
      oldTier: card.legacyTier ?? null,
      newTier,
      registryStage: lookup.entry.careerStage,
    });
  }

  console.log(``);
  console.log(`[Backfill] Registry hits:        ${registryHits}`);
  console.log(`[Backfill] Registry misses:      ${registryMisses}`);
  console.log(`[Backfill] Unmapped reg stages:  ${unmappable}`);
  console.log(`[Backfill] Already correct:      ${alreadyCorrect}`);
  console.log(`[Backfill] Skipped downgrades:   ${skippedDowngrades.length}`);
  console.log(`[Backfill] Updates planned:      ${plans.length}`);
  console.log(``);

  if (plans.length === 0) {
    console.log(`[Backfill] Nothing to do. Exiting.`);
    return;
  }

  // -------------------------------------------------------------------------
  // Group planned updates for review: NULL fills vs divergent normalizations,
  // plus a per-player breakdown so multi-card players are easy to scan.
  // -------------------------------------------------------------------------
  const nullFills = plans.filter((p) => p.oldTier === null);
  const divergent = plans.filter((p) => p.oldTier !== null);

  console.log(`[Backfill] === Group 1: NULL fills (${nullFills.length}) ===`);
  for (const p of nullFills) {
    console.log(`[Backfill]   card #${p.cardId} (${p.playerName}): NULL -> ${p.newTier} (registry: ${p.registryStage})`);
  }
  console.log(``);

  console.log(`[Backfill] === Group 2: divergent normalizations (${divergent.length}) ===`);
  // Sort by playerName so multi-card players are grouped visually
  const divergentSorted = [...divergent].sort((a, b) =>
    a.playerName.localeCompare(b.playerName) || a.cardId - b.cardId
  );
  for (const p of divergentSorted) {
    console.log(`[Backfill]   card #${p.cardId} (${p.playerName}): ${p.oldTier} -> ${p.newTier} (registry: ${p.registryStage})`);
  }
  console.log(``);

  // Highlight notable transitions (HOF/SUPERSTAR/LEGEND collisions etc.)
  const notableOldValues = new Set(["HOF", "SUPERSTAR", "LEGEND", "RETIRED", "ROOKIE"]);
  const notable = divergent.filter((p) => p.oldTier && notableOldValues.has(p.oldTier));
  if (notable.length > 0) {
    console.log(`[Backfill] === Group 3: notable transitions to eyeball (${notable.length}) ===`);
    console.log(`[Backfill] (HOF/SUPERSTAR/LEGEND/RETIRED/ROOKIE -> something else)`);
    for (const p of notable) {
      console.log(`[Backfill]   card #${p.cardId} (${p.playerName}): ${p.oldTier} -> ${p.newTier} (registry: ${p.registryStage})`);
    }
    console.log(``);
  }

  // Group 4: skipped downgrades (terminal-tier preservation). Always surface so
  // we can confirm the no-downgrade rule is firing on the right cards.
  if (skippedDowngrades.length > 0) {
    console.log(`[Backfill] === Group 4: skipped downgrades (${skippedDowngrades.length}) ===`);
    console.log(`[Backfill] (terminal tiers HOF/LEGEND_DECEASED/RETIRED preserved)`);
    const sorted = [...skippedDowngrades].sort((a, b) =>
      a.playerName.localeCompare(b.playerName) || a.cardId - b.cardId
    );
    for (const s of sorted) {
      console.log(
        `[Backfill]   card #${s.cardId} (${s.playerName}): keeping ${s.currentTier} (would have been ${s.wouldHaveBeen}, registry: ${s.registryStage}) -- ${s.reason}`
      );
    }
    console.log(``);
  }

  if (DRY_RUN) {
    console.log(`[Backfill] DRY-RUN: no writes performed. Re-run without --dry-run to apply.`);
    return;
  }

  console.log(`[Backfill] Beginning live writes against ${PROD_MODE ? "PRODUCTION" : "development"}...`);
  let updatedCount = 0;
  for (const p of plans) {
    await db.update(cards)
      .set({ legacyTier: p.newTier })
      .where(eq(cards.id, p.cardId));
    updatedCount++;
  }
  console.log(`[Backfill] DONE. Updated ${updatedCount} card rows on ${PROD_MODE ? "PRODUCTION" : "development"}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[Backfill] FATAL:`, err);
    process.exit(1);
  });
