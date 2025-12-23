/**
 * Advance career stages for players based on sport-specific season boundaries
 * 
 * Schedule:
 * - March: MLB players (before new season starts)
 * - July: NBA, NFL, NHL players (after playoffs, before new seasons)
 * 
 * Usage: npx tsx scripts/advance-career-stages.ts [--sport=MLB|NBA|NFL|NHL|all] [--dry-run]
 */

import { db } from "../server/db";
import { playerRegistry } from "../shared/schema";
import { eq, and, inArray, not } from "drizzle-orm";

// Career stage progression order
const STAGE_PROGRESSION: Record<string, string> = {
  "ROOKIE": "YEAR_2",
  "YEAR_2": "YEAR_3", 
  "YEAR_3": "YEAR_4",
  "YEAR_4": "PRIME",
  // PRIME, VETERAN, RETIRED_HOF, BUST don't auto-advance
};

// Stages that should advance each year
const ADVANCEABLE_STAGES = ["ROOKIE", "YEAR_2", "YEAR_3", "YEAR_4"];

// Sport groupings by update month
const MARCH_SPORTS = ["MLB"];
const JULY_SPORTS = ["NBA", "NFL", "NHL"];

interface AdvanceResult {
  playerName: string;
  sport: string;
  oldStage: string;
  newStage: string;
}

async function advanceCareerStages(
  sports: string[],
  dryRun: boolean = false
): Promise<AdvanceResult[]> {
  console.log(`\n=== Career Stage Advancement ===`);
  console.log(`Sports: ${sports.join(", ")}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}\n`);

  // Get all players in these sports with advanceable stages
  const players = await db.select()
    .from(playerRegistry)
    .where(and(
      inArray(playerRegistry.sport, sports),
      inArray(playerRegistry.careerStage, ADVANCEABLE_STAGES),
      // Don't advance players marked as BUST (they stay where they are)
      not(eq(playerRegistry.careerStage, "BUST"))
    ));

  console.log(`Found ${players.length} players eligible for advancement\n`);

  const results: AdvanceResult[] = [];

  for (const player of players) {
    const newStage = STAGE_PROGRESSION[player.careerStage];
    
    if (!newStage) {
      console.log(`Skipping ${player.playerName}: no progression from ${player.careerStage}`);
      continue;
    }

    results.push({
      playerName: player.playerName,
      sport: player.sport,
      oldStage: player.careerStage,
      newStage: newStage,
    });

    if (!dryRun) {
      await db.update(playerRegistry)
        .set({ 
          careerStage: newStage, 
          lastUpdated: new Date() 
        })
        .where(eq(playerRegistry.id, player.id));
    }

    console.log(`${dryRun ? "[DRY] " : ""}${player.playerName} (${player.sport}): ${player.careerStage} -> ${newStage}`);
  }

  return results;
}

function getSportsForMonth(month: number): string[] {
  // month is 0-indexed (0 = January, 2 = March, 6 = July)
  if (month === 2) { // March
    return MARCH_SPORTS;
  } else if (month === 6) { // July
    return JULY_SPORTS;
  }
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  
  // Parse --sport argument
  const sportArg = args.find(a => a.startsWith("--sport="));
  let sports: string[];
  
  if (sportArg) {
    const sportValue = sportArg.split("=")[1].toUpperCase();
    if (sportValue === "ALL") {
      sports = [...MARCH_SPORTS, ...JULY_SPORTS];
    } else if (["MLB", "NBA", "NFL", "NHL"].includes(sportValue)) {
      sports = [sportValue];
    } else {
      console.error(`Invalid sport: ${sportValue}. Use MLB, NBA, NFL, NHL, or ALL`);
      process.exit(1);
    }
  } else {
    // Auto-detect based on current month
    const currentMonth = new Date().getMonth();
    sports = getSportsForMonth(currentMonth);
    
    if (sports.length === 0) {
      console.log("No sports scheduled for advancement this month.");
      console.log("Use --sport=MLB|NBA|NFL|NHL|all to force advancement.");
      process.exit(0);
    }
  }

  const results = await advanceCareerStages(sports, dryRun);

  console.log(`\n=== Summary ===`);
  console.log(`Total advanced: ${results.length}`);
  
  // Group by sport
  const bySport = results.reduce((acc, r) => {
    acc[r.sport] = (acc[r.sport] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  for (const [sport, count] of Object.entries(bySport)) {
    console.log(`  ${sport}: ${count} players`);
  }

  if (dryRun) {
    console.log("\n(This was a dry run - no changes were made)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
