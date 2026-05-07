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
 * Run with:  tsx scripts/backfill-legacy-tier-from-registry.ts
 *            tsx scripts/backfill-legacy-tier-from-registry.ts --dry-run
 */

import { db } from "../server/db";
import { cards } from "../shared/schema";
import { isNotNull, eq, and, ne } from "drizzle-orm";
import { lookupPlayer } from "../server/playerRegistry";

const DRY_RUN = process.argv.includes("--dry-run");

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

async function main() {
  console.log(`[Backfill] Phase 1 verdict migration -- legacy_tier backfill from player registry`);
  console.log(`[Backfill] Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE"}`);
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
  let registryHits = 0;
  let registryMisses = 0;
  let alreadyCorrect = 0;
  let unmappable = 0;

  for (const card of allCards) {
    if (!card.playerName) continue;
    const lookup = lookupPlayer(card.playerName);
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
  console.log(`[Backfill] Updates planned:      ${plans.length}`);
  console.log(``);

  if (plans.length === 0) {
    console.log(`[Backfill] Nothing to do. Exiting.`);
    return;
  }

  // Show first 20 planned changes for visibility
  console.log(`[Backfill] First ${Math.min(plans.length, 20)} planned updates:`);
  for (const p of plans.slice(0, 20)) {
    console.log(`[Backfill]   card #${p.cardId} (${p.playerName}): ${p.oldTier ?? "NULL"} -> ${p.newTier} (registry: ${p.registryStage})`);
  }
  if (plans.length > 20) {
    console.log(`[Backfill]   ... and ${plans.length - 20} more`);
  }
  console.log(``);

  if (DRY_RUN) {
    console.log(`[Backfill] DRY-RUN: no writes performed. Re-run without --dry-run to apply.`);
    return;
  }

  let updatedCount = 0;
  for (const p of plans) {
    await db.update(cards)
      .set({ legacyTier: p.newTier })
      .where(eq(cards.id, p.cardId));
    updatedCount++;
  }
  console.log(`[Backfill] DONE. Updated ${updatedCount} card rows.`);
}

main().catch((err) => {
  console.error(`[Backfill] FATAL:`, err);
  process.exit(1);
});
