/**
 * Scheduled Career Stage Advancement Job
 * 
 * Automatically advances player career stages at sport-specific times:
 * - March 1st: MLB players (before spring training)
 * - July 1st: NBA, NFL, NHL players (after playoffs/before new seasons)
 * 
 * Career stage progression:
 * ROOKIE -> YEAR_2 -> YEAR_3 -> YEAR_4 -> PRIME (stops advancing)
 */

import { db } from "./db";
import { playerRegistry } from "@shared/schema";
import { eq, and, inArray, not } from "drizzle-orm";
import { log } from "./index";

// Career stage progression order
const STAGE_PROGRESSION: Record<string, string> = {
  "ROOKIE": "YEAR_2",
  "YEAR_2": "YEAR_3", 
  "YEAR_3": "YEAR_4",
  "YEAR_4": "PRIME",
};

// Stages that should advance each year
const ADVANCEABLE_STAGES = ["ROOKIE", "YEAR_2", "YEAR_3", "YEAR_4"];

// Sport groupings by update month (0-indexed: 2 = March, 6 = July)
const SCHEDULE: Record<number, string[]> = {
  2: ["MLB"],        // March 1st
  6: ["NBA", "NFL", "NHL"],  // July 1st
};

let lastRunMonth: number | null = null;
let checkTimer: NodeJS.Timeout | null = null;

interface AdvanceResult {
  playerName: string;
  sport: string;
  oldStage: string;
  newStage: string;
}

/**
 * Advance career stages for players in the specified sports
 */
export async function advanceCareerStages(sports: string[]): Promise<AdvanceResult[]> {
  log(`Starting career stage advancement for: ${sports.join(", ")}`, "career-stage");

  // Get all players in these sports with advanceable stages
  const players = await db.select()
    .from(playerRegistry)
    .where(and(
      inArray(playerRegistry.sport, sports),
      inArray(playerRegistry.careerStage, ADVANCEABLE_STAGES)
    ));

  log(`Found ${players.length} players eligible for advancement`, "career-stage");

  const results: AdvanceResult[] = [];

  for (const player of players) {
    const newStage = STAGE_PROGRESSION[player.careerStage];
    
    if (!newStage) continue;

    results.push({
      playerName: player.playerName,
      sport: player.sport,
      oldStage: player.careerStage,
      newStage: newStage,
    });

    await db.update(playerRegistry)
      .set({ 
        careerStage: newStage, 
        lastUpdated: new Date() 
      })
      .where(eq(playerRegistry.id, player.id));
  }

  log(`Advanced ${results.length} players`, "career-stage");
  return results;
}

/**
 * Check if we should run the advancement job
 * Runs on the 1st of March or July
 */
function checkAndRun() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  // Only run on the 1st of scheduled months
  if (currentDay !== 1) return;
  
  // Check if this month is scheduled
  const sportsToAdvance = SCHEDULE[currentMonth];
  if (!sportsToAdvance) return;

  // Don't run twice in the same month
  if (lastRunMonth === currentMonth) return;

  log(`Scheduled career stage advancement triggered for ${sportsToAdvance.join(", ")}`, "career-stage");
  
  advanceCareerStages(sportsToAdvance)
    .then((results) => {
      lastRunMonth = currentMonth;
      log(`Career stage advancement completed: ${results.length} players advanced`, "career-stage");
    })
    .catch((err) => {
      log(`Career stage advancement failed: ${err.message}`, "career-stage");
    });
}

/**
 * Start the career stage job scheduler
 * Checks daily if we need to run the advancement
 */
export function startCareerStageJob() {
  // Check immediately on startup
  checkAndRun();
  
  // Then check every 24 hours
  checkTimer = setInterval(checkAndRun, 24 * 60 * 60 * 1000);
  
  log("Career stage job scheduler started (runs March 1 for MLB, July 1 for NBA/NFL/NHL)", "career-stage");
}

/**
 * Manually trigger career stage advancement (for admin use)
 */
export async function triggerCareerStageAdvancement(sports: string[]): Promise<AdvanceResult[]> {
  return advanceCareerStages(sports);
}

/**
 * Stop the scheduler
 */
export function stopCareerStageJob() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
