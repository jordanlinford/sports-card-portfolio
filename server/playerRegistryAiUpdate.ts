import { db } from "./db";
import { playerRegistry } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const VALID_CAREER_STAGES = ["ROOKIE", "YEAR_2", "YEAR_3", "YEAR_4", "PRIME", "VETERAN", "RETIRED_HOF", "BUST"];
const VALID_ROLE_TIERS = ["FRANCHISE_CORE", "SOLID_STARTER", "UNCERTAIN_ROLE", "BACKUP_OR_FRINGE", "OUT_OF_LEAGUE", "RETIRED_ICON"];

export interface ProposedChange {
  playerId: number;
  playerName: string;
  sport: string;
  currentCareerStage: string;
  currentRoleTier: string;
  proposedCareerStage: string | null;
  proposedRoleTier: string | null;
  rationale: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface AiRefreshJob {
  id: string;
  status: "running" | "completed" | "failed";
  sport: string | null;
  totalPlayers: number;
  processedPlayers: number;
  batchesTotal: number;
  batchesCompleted: number;
  proposals: ProposedChange[];
  errors: string[];
  startedAt: number;
  completedAt: number | null;
}

const activeJobs = new Map<string, AiRefreshJob>();

export function getJob(jobId: string): AiRefreshJob | null {
  return activeJobs.get(jobId) || null;
}

export function getAllJobs(): AiRefreshJob[] {
  return Array.from(activeJobs.values()).sort((a, b) => b.startedAt - a.startedAt);
}

function buildPrompt(players: { id: number; playerName: string; sport: string; careerStage: string; roleTier: string; positionGroup: string }[]): string {
  const playerList = players.map(p => 
    `- ${p.playerName} (${p.sport}, ${p.positionGroup}) | Current: careerStage=${p.careerStage}, roleTier=${p.roleTier}`
  ).join("\n");

  return `You are a sports analyst. Use Google Search to check the CURRENT status of each player below and determine if their career stage or role tier needs updating.

PLAYERS TO EVALUATE:
${playerList}

CAREER STAGE OPTIONS (pick one):
- ROOKIE: First year in the league
- YEAR_2, YEAR_3, YEAR_4: Second through fourth year
- PRIME: Established player in their prime years (typically age 25-32)
- VETERAN: Older player past their prime (typically 33+ in NFL/NBA, 35+ in MLB/NHL)
- RETIRED_HOF: Retired or Hall of Fame caliber
- BUST: Player who significantly underperformed expectations and is essentially out of the league

ROLE TIER OPTIONS (pick one):
- FRANCHISE_CORE: Star player, top 10-15 at their position, drives team success
- SOLID_STARTER: Reliable starter, not elite but consistently contributes
- UNCERTAIN_ROLE: Role unclear — could be a young player battling for a spot, or a veteran on the bubble
- BACKUP_OR_FRINGE: Backup, rotational piece, or fringe roster player
- OUT_OF_LEAGUE: Not currently on an active roster, unsigned free agent
- RETIRED_ICON: Retired player with lasting legacy

INSTRUCTIONS:
1. Search for each player's CURRENT team, contract, and playing status
2. ONLY return players whose careerStage OR roleTier SHOULD CHANGE from their current values
3. Do NOT include players who are correctly classified
4. Consider: recent trades, injuries (season-ending), retirements, demotions, breakout seasons, age

Return a JSON array of ONLY the players needing changes (empty array [] if none need changes):
[
  {
    "playerName": "exact name as provided",
    "sport": "exact sport as provided",
    "newCareerStage": "NEW_STAGE or null if unchanged",
    "newRoleTier": "NEW_TIER or null if unchanged",
    "rationale": "Brief explanation of why this change is needed (cite specific events)",
    "confidence": "HIGH" | "MEDIUM" | "LOW"
  }
]

Return ONLY the JSON array, no markdown or explanation. If no changes needed, return [].`;
}

async function evaluateBatch(
  players: { id: number; playerName: string; sport: string; careerStage: string; roleTier: string; positionGroup: string }[]
): Promise<ProposedChange[]> {
  const prompt = buildPrompt(players);
  
  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = (response.text || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  
  if (!jsonMatch) {
    if (text === "[]" || text.includes("no changes")) return [];
    console.error("[AI Registry] No JSON array in response:", text.substring(0, 300));
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];

  const proposals: ProposedChange[] = [];
  
  for (const item of parsed) {
    const matchedPlayer = players.find(
      p => p.playerName.toLowerCase() === (item.playerName || "").toLowerCase() && 
           p.sport === (item.sport || "")
    );
    if (!matchedPlayer) continue;

    const newStage = item.newCareerStage && VALID_CAREER_STAGES.includes(item.newCareerStage) ? item.newCareerStage : null;
    const newTier = item.newRoleTier && VALID_ROLE_TIERS.includes(item.newRoleTier) ? item.newRoleTier : null;

    if (!newStage && !newTier) continue;
    if (newStage === matchedPlayer.careerStage && newTier === matchedPlayer.roleTier) continue;

    proposals.push({
      playerId: matchedPlayer.id,
      playerName: matchedPlayer.playerName,
      sport: matchedPlayer.sport,
      currentCareerStage: matchedPlayer.careerStage,
      currentRoleTier: matchedPlayer.roleTier,
      proposedCareerStage: newStage !== matchedPlayer.careerStage ? newStage : null,
      proposedRoleTier: newTier !== matchedPlayer.roleTier ? newTier : null,
      rationale: item.rationale || "AI-suggested update",
      confidence: ["HIGH", "MEDIUM", "LOW"].includes(item.confidence) ? item.confidence : "MEDIUM",
    });
  }

  return proposals;
}

export async function startAiRefresh(sportFilter: string | null, batchSize: number = 20): Promise<string> {
  const existingRunning = Array.from(activeJobs.values()).find(j => j.status === "running");
  if (existingRunning) {
    throw new Error("An AI refresh job is already running. Please wait for it to complete.");
  }

  const jobId = `ai-refresh-${Date.now()}`;
  
  let query = db.select().from(playerRegistry);
  let players: any[];
  
  if (sportFilter) {
    players = await db.select().from(playerRegistry).where(eq(playerRegistry.sport, sportFilter));
  } else {
    players = await db.select().from(playerRegistry);
  }

  const totalBatches = Math.ceil(players.length / batchSize);

  const job: AiRefreshJob = {
    id: jobId,
    status: "running",
    sport: sportFilter,
    totalPlayers: players.length,
    processedPlayers: 0,
    batchesTotal: totalBatches,
    batchesCompleted: 0,
    proposals: [],
    errors: [],
    startedAt: Date.now(),
    completedAt: null,
  };

  activeJobs.set(jobId, job);

  (async () => {
    try {
      for (let i = 0; i < players.length; i += batchSize) {
        const batch = players.slice(i, i + batchSize);
        
        try {
          console.log(`[AI Registry] Processing batch ${job.batchesCompleted + 1}/${totalBatches} (${batch.length} players)`);
          const proposals = await evaluateBatch(batch);
          job.proposals.push(...proposals);
          console.log(`[AI Registry] Batch ${job.batchesCompleted + 1} complete: ${proposals.length} changes proposed`);
        } catch (err: any) {
          const errorMsg = `Batch ${job.batchesCompleted + 1} failed: ${err.message}`;
          console.error(`[AI Registry] ${errorMsg}`);
          job.errors.push(errorMsg);
        }

        job.processedPlayers += batch.length;
        job.batchesCompleted++;

        if (i + batchSize < players.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      job.status = "completed";
      job.completedAt = Date.now();
      console.log(`[AI Registry] Job ${jobId} completed: ${job.proposals.length} changes proposed, ${job.errors.length} errors`);
    } catch (err: any) {
      job.status = "failed";
      job.completedAt = Date.now();
      job.errors.push(`Job failed: ${err.message}`);
      console.error(`[AI Registry] Job ${jobId} failed:`, err);
    }
  })();

  return jobId;
}

export async function applyProposals(
  jobId: string, 
  acceptedPlayerIds: number[], 
  adminUserId: string
): Promise<{ applied: number; skipped: number }> {
  const job = activeJobs.get(jobId);
  if (!job) throw new Error("Job not found");
  if (job.status !== "completed") throw new Error("Job is not completed yet");

  const acceptedSet = new Set(acceptedPlayerIds);
  let applied = 0;
  let skipped = 0;

  for (const proposal of job.proposals) {
    if (!acceptedSet.has(proposal.playerId)) {
      skipped++;
      continue;
    }

    const updates: Record<string, any> = {
      lastUpdated: new Date(),
      updatedBy: `AI (approved by ${adminUserId})`,
    };

    if (proposal.proposedCareerStage) {
      updates.careerStage = proposal.proposedCareerStage;
    }
    if (proposal.proposedRoleTier) {
      updates.roleTier = proposal.proposedRoleTier;
    }

    await db.update(playerRegistry)
      .set(updates)
      .where(eq(playerRegistry.id, proposal.playerId));
    
    applied++;
  }

  const { reloadRegistry } = await import("./playerRegistry");
  await reloadRegistry();

  return { applied, skipped };
}
