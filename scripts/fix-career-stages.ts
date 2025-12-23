/**
 * Fix career stage misclassifications
 * For 2023-24 season players who are actually in YEAR_2 (not YEAR_3)
 */
import { db } from "../server/db";
import { playerRegistry } from "../shared/schema";
import { eq, and } from "drizzle-orm";

// Players who debuted in 2023-24 season are actually YEAR_2, not YEAR_3
// The script incorrectly calculated based on calendar year
const fixes = [
  // NHL - 2023-24 rookies (now in 2nd season)
  { sport: "NHL", name: "Connor Bedard", correctStage: "YEAR_2" },
  { sport: "NHL", name: "Leo Carlsson", correctStage: "YEAR_2" },
  { sport: "NHL", name: "Adam Fantilli", correctStage: "YEAR_2" },
  { sport: "NHL", name: "Logan Cooley", correctStage: "YEAR_2" },
  { sport: "NHL", name: "Luke Hughes", correctStage: "YEAR_2" },
  { sport: "NHL", name: "Simon Nemec", correctStage: "YEAR_2" },
  
  // NHL - 2024-25 rookies (1st season)
  { sport: "NHL", name: "Macklin Celebrini", correctStage: "ROOKIE" },
  { sport: "NHL", name: "Matvei Michkov", correctStage: "ROOKIE" },
  
  // NFL - 2023 draft class (now in YEAR_2)
  { sport: "NFL", name: "Bryce Young", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Anthony Richardson", correctStage: "YEAR_2" },
  { sport: "NFL", name: "De'Von Achane", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Rashee Rice", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Zach Charbonnet", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Tyjae Spears", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Roschon Johnson", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Kendre Miller", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Jaxon Smith-Njigba", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Quentin Johnston", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Chase Brown", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Jaleel McLaughlin", correctStage: "YEAR_2" },
  
  // NFL - 2024 rookies (just finished 1st season)
  { sport: "NFL", name: "Caleb Williams", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Bo Nix", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Jayden Daniels", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Drake Maye", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Marvin Harrison Jr.", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Malik Nabers", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Rome Odunze", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Brock Bowers", correctStage: "YEAR_2" },
  
  // NFL - 2022 class corrections
  { sport: "NFL", name: "Tyler Allgeier", correctStage: "YEAR_3" },
  { sport: "NFL", name: "Jared Verse", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Cooper DeJean", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Terrion Arnold", correctStage: "YEAR_2" },
  { sport: "NFL", name: "Quinyon Mitchell", correctStage: "YEAR_2" },
  
  // NBA - 2024 rookies (1st season ongoing)
  { sport: "NBA", name: "Zaccharie Risacher", correctStage: "ROOKIE" },
  { sport: "NBA", name: "Alexandre Sarr", correctStage: "ROOKIE" },
  { sport: "NBA", name: "Stephon Castle", correctStage: "ROOKIE" },
  { sport: "NBA", name: "Reed Sheppard", correctStage: "ROOKIE" },
  { sport: "NBA", name: "Jared McCain", correctStage: "ROOKIE" },
  { sport: "NBA", name: "Dalton Knecht", correctStage: "ROOKIE" },
  { sport: "NBA", name: "Donovan Clingan", correctStage: "ROOKIE" },
  { sport: "NBA", name: "Zach Edey", correctStage: "ROOKIE" },
  
  // MLB - 2023 debuts (completed 2 seasons, entering 3rd)
  { sport: "MLB", name: "Elly De La Cruz", correctStage: "YEAR_3" }, // actually correct as-is
  { sport: "MLB", name: "Evan Carter", correctStage: "YEAR_2" }, // debuted Sep 2023
  { sport: "MLB", name: "Jasson Dominguez", correctStage: "YEAR_2" }, // brief 2023 debut
  
  // MLB - 2025 debuts (hasn't played yet)
  { sport: "MLB", name: "Marcelo Mayer", correctStage: "PROSPECT" },
];

async function main() {
  console.log("Fixing career stage misclassifications...\n");
  
  let updated = 0;
  for (const fix of fixes) {
    const result = await db.update(playerRegistry)
      .set({ careerStage: fix.correctStage, lastUpdated: new Date() })
      .where(and(
        eq(playerRegistry.sport, fix.sport),
        eq(playerRegistry.playerName, fix.name)
      ))
      .returning();
    
    if (result.length > 0) {
      console.log(`Fixed: ${fix.name} (${fix.sport}) -> ${fix.correctStage}`);
      updated++;
    } else {
      console.log(`Not found: ${fix.name} (${fix.sport})`);
    }
  }
  
  console.log(`\nUpdated ${updated} players`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
