/**
 * Script to update player career stages based on actual debut years
 * Uses Serper for web search and OpenAI to extract debut year
 * 
 * Usage: npx tsx scripts/update-career-stages.ts
 */

import { db } from "../server/db";
import { playerRegistry } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import OpenAI from "openai";

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const openai = new OpenAI();

// Career stage calculation based on years since debut
function calculateCareerStage(debutYear: number, currentYear: number = 2025): string {
  const yearsPro = currentYear - debutYear;
  
  if (yearsPro <= 0) return "ROOKIE";
  if (yearsPro === 1) return "YEAR_2";
  if (yearsPro === 2) return "YEAR_3";
  if (yearsPro === 3) return "YEAR_4";
  return "PRIME"; // 4+ years = PRIME
}

// Search for player debut year using Serper
async function searchDebutYear(playerName: string, sport: string): Promise<string[]> {
  if (!SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY not set");
  }

  const sportName = {
    NFL: "NFL football",
    NBA: "NBA basketball", 
    MLB: "MLB baseball",
    NHL: "NHL hockey"
  }[sport] || sport;

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: `${playerName} ${sportName} debut year rookie season first year`,
      num: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status}`);
  }

  const data = await response.json();
  const snippets: string[] = [];
  
  if (data.organic) {
    for (const result of data.organic) {
      if (result.snippet) snippets.push(result.snippet);
      if (result.title) snippets.push(result.title);
    }
  }
  
  if (data.knowledgeGraph?.description) {
    snippets.push(data.knowledgeGraph.description);
  }

  return snippets;
}

// Use OpenAI to extract debut year from search results
async function extractDebutYear(playerName: string, sport: string, snippets: string[]): Promise<number | null> {
  const prompt = `Based on the following search results about ${playerName} (${sport} player), extract their professional debut year (the year they first played in the ${sport}).

Search results:
${snippets.join("\n\n")}

Instructions:
- Return ONLY the 4-digit year (e.g., 2022)
- If the player hasn't debuted yet or you can't determine the year, return "UNKNOWN"
- For NFL/NBA/MLB/NHL, use the year they first appeared in a regular season game
- Do not include draft year unless it's the same as debut year

Answer (just the year or UNKNOWN):`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 20,
    temperature: 0,
  });

  const answer = response.choices[0]?.message?.content?.trim() || "";
  const yearMatch = answer.match(/\b(19|20)\d{2}\b/);
  
  if (yearMatch) {
    return parseInt(yearMatch[0], 10);
  }
  
  return null;
}

// Process a single player
async function processPlayer(player: { id: number; playerName: string; sport: string; careerStage: string }): Promise<{
  playerName: string;
  sport: string;
  oldStage: string;
  newStage: string | null;
  debutYear: number | null;
  updated: boolean;
}> {
  try {
    console.log(`Processing: ${player.playerName} (${player.sport})...`);
    
    const snippets = await searchDebutYear(player.playerName, player.sport);
    
    if (snippets.length === 0) {
      console.log(`  No search results found`);
      return { playerName: player.playerName, sport: player.sport, oldStage: player.careerStage, newStage: null, debutYear: null, updated: false };
    }

    const debutYear = await extractDebutYear(player.playerName, player.sport, snippets);
    
    if (!debutYear) {
      console.log(`  Could not determine debut year`);
      return { playerName: player.playerName, sport: player.sport, oldStage: player.careerStage, newStage: null, debutYear: null, updated: false };
    }

    const newStage = calculateCareerStage(debutYear);
    
    if (newStage !== player.careerStage) {
      // Update the database
      await db.update(playerRegistry)
        .set({ careerStage: newStage, lastUpdated: new Date() })
        .where(eq(playerRegistry.id, player.id));
      
      console.log(`  Updated: ${player.careerStage} -> ${newStage} (debut: ${debutYear})`);
      return { playerName: player.playerName, sport: player.sport, oldStage: player.careerStage, newStage, debutYear, updated: true };
    } else {
      console.log(`  No change needed (debut: ${debutYear})`);
      return { playerName: player.playerName, sport: player.sport, oldStage: player.careerStage, newStage, debutYear, updated: false };
    }
  } catch (error) {
    console.error(`  Error processing ${player.playerName}:`, error);
    return { playerName: player.playerName, sport: player.sport, oldStage: player.careerStage, newStage: null, debutYear: null, updated: false };
  }
}

// Rate limiting helper
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Career Stage Update Script ===\n");
  
  // Get all players with early career stages that might need updating
  const stagesToCheck = ["ROOKIE", "YEAR_2", "YEAR_3", "YEAR_4"];
  
  const players = await db.select()
    .from(playerRegistry)
    .where(inArray(playerRegistry.careerStage, stagesToCheck));

  console.log(`Found ${players.length} players with early career stages to check\n`);

  const results: Awaited<ReturnType<typeof processPlayer>>[] = [];
  
  // Process players with rate limiting (avoid hitting API limits)
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const result = await processPlayer(player);
    results.push(result);
    
    // Rate limit: wait 500ms between requests
    if (i < players.length - 1) {
      await sleep(500);
    }
    
    // Progress update every 10 players
    if ((i + 1) % 10 === 0) {
      console.log(`\nProgress: ${i + 1}/${players.length} players processed\n`);
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  const updated = results.filter(r => r.updated);
  const failed = results.filter(r => r.newStage === null);
  
  console.log(`Total processed: ${results.length}`);
  console.log(`Updated: ${updated.length}`);
  console.log(`Failed to determine: ${failed.length}`);
  console.log(`No change needed: ${results.length - updated.length - failed.length}`);
  
  if (updated.length > 0) {
    console.log("\nUpdated players:");
    for (const r of updated) {
      console.log(`  ${r.playerName} (${r.sport}): ${r.oldStage} -> ${r.newStage} (debut: ${r.debutYear})`);
    }
  }
  
  if (failed.length > 0) {
    console.log("\nFailed to determine debut year:");
    for (const r of failed) {
      console.log(`  ${r.playerName} (${r.sport})`);
    }
  }
}

main()
  .then(() => {
    console.log("\nScript completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
