import * as fs from "fs";
import * as path from "path";

export interface PlayerRegistryEntry {
  sport: string;
  playerName: string;
  aliases: string[];
  careerStage: string;
  roleTier: string;
  positionGroup: string;
  lastUpdated: string;
}

export interface RegistryLookupResult {
  found: boolean;
  entry?: PlayerRegistryEntry;
  matchedOn?: string;
}

const registryMap = new Map<string, PlayerRegistryEntry>();
let registryLoaded = false;

function normalizeForLookup(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function loadRegistry(): void {
  if (registryLoaded) return;
  
  const csvPath = path.join(process.cwd(), "data", "player_status_registry.csv");
  
  if (!fs.existsSync(csvPath)) {
    console.log("[PlayerRegistry] Registry file not found at:", csvPath);
    registryLoaded = true;
    return;
  }
  
  try {
    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n").filter(line => line.trim());
    
    if (lines.length < 2) {
      console.log("[PlayerRegistry] Registry file is empty or has no data rows");
      registryLoaded = true;
      return;
    }
    
    const headers = lines[0].split(",").map(h => h.trim());
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 6) continue;
      
      const entry: PlayerRegistryEntry = {
        sport: values[0]?.trim() || "",
        playerName: values[1]?.trim() || "",
        aliases: (values[2] || "").split("|").map(a => a.trim()).filter(a => a),
        careerStage: values[3]?.trim() || "",
        roleTier: values[4]?.trim() || "",
        positionGroup: values[5]?.trim() || "",
        lastUpdated: values[6]?.trim() || "",
      };
      
      const normalizedName = normalizeForLookup(entry.playerName);
      registryMap.set(normalizedName, entry);
      
      for (const alias of entry.aliases) {
        const normalizedAlias = normalizeForLookup(alias);
        if (normalizedAlias && !registryMap.has(normalizedAlias)) {
          registryMap.set(normalizedAlias, entry);
        }
      }
    }
    
    console.log(`[PlayerRegistry] Loaded ${registryMap.size} entries (including aliases)`);
    registryLoaded = true;
  } catch (error) {
    console.error("[PlayerRegistry] Error loading registry:", error);
    registryLoaded = true;
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

export function lookupPlayer(playerName: string): RegistryLookupResult {
  loadRegistry();
  
  const normalized = normalizeForLookup(playerName);
  const entry = registryMap.get(normalized);
  
  if (entry) {
    return {
      found: true,
      entry,
      matchedOn: normalized,
    };
  }
  
  return { found: false };
}

export function mapRegistryRoleTier(registryRoleTier: string): "FRANCHISE_CORE" | "STARTER" | "UNCERTAIN_STARTER" | "BACKUP" | "OUT_OF_LEAGUE" | "UNKNOWN" {
  const mapping: Record<string, "FRANCHISE_CORE" | "STARTER" | "UNCERTAIN_STARTER" | "BACKUP" | "OUT_OF_LEAGUE" | "UNKNOWN"> = {
    "FRANCHISE_CORE": "FRANCHISE_CORE",
    "RETIRED_ICON": "FRANCHISE_CORE",
    "SOLID_STARTER": "STARTER",
    "UNCERTAIN_ROLE": "UNCERTAIN_STARTER",
    "BACKUP_OR_FRINGE": "BACKUP",
    "OUT_OF_LEAGUE": "OUT_OF_LEAGUE",
  };
  
  return mapping[registryRoleTier] || "UNKNOWN";
}

export function mapRegistryStage(registryStage: string): "ROOKIE" | "YEAR_2" | "PRIME" | "VETERAN" | "AGING" | "UNKNOWN" {
  const mapping: Record<string, "ROOKIE" | "YEAR_2" | "PRIME" | "VETERAN" | "AGING" | "UNKNOWN"> = {
    "ROOKIE": "ROOKIE",
    "YEAR_2": "YEAR_2",
    "PRIME": "PRIME",
    "VETERAN": "VETERAN",
    "AGING": "AGING",
    "RETIRED_HOF": "VETERAN",
    "BUST": "PRIME",
    "PROSPECT": "ROOKIE",
  };
  
  return mapping[registryStage] || "UNKNOWN";
}

export function getRegistryStats(): { totalEntries: number; loaded: boolean } {
  loadRegistry();
  return {
    totalEntries: registryMap.size,
    loaded: registryLoaded,
  };
}
