import { getPlayerOutlook } from "../server/playerOutlookEngine";

async function main() {
  const playerName = process.argv[2] || "J.J. McCarthy";
  const sport = process.argv[3] || "football";
  console.log(`=== Forcing refresh for ${playerName} (${sport}) ===`);
  const out = await getPlayerOutlook({ playerName, sport }, { forceRefresh: true });
  console.log(`=== RESULT for ${playerName} ===`);
  console.log(`verdict.action: ${(out as any)?.verdict?.action}`);
  console.log(`investmentCall.verdict: ${(out as any)?.investmentCall?.verdict}`);
  console.log(`confidenceScore: ${(out as any)?.verdict?.confidenceScore}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
