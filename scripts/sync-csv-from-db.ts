/**
 * Sync CSV file from database
 */
import { db } from "../server/db";
import { playerRegistry } from "../shared/schema";
import * as fs from "fs";

async function main() {
  const players = await db.select().from(playerRegistry);
  
  const header = "sport,playerName,team,careerStage,roleStability,currentHype,lastUpdated";
  const rows = players.map(p => 
    `${p.sport},${p.playerName},${p.team || ""},${p.careerStage},${p.roleStability},${p.currentHype || "UNKNOWN"},${p.lastUpdated?.toISOString().split('T')[0] || ""}`
  );
  
  const csv = [header, ...rows].join("\n");
  fs.writeFileSync("data/player_status_registry.csv", csv);
  console.log(`Wrote ${players.length} players to CSV`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
