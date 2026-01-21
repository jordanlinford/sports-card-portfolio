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
let loadingPromise: Promise<void> | null = null;
let registrySource: "database" | "csv" | "none" = "none";

function normalizeForLookup(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

async function loadFromDatabase(): Promise<boolean> {
  try {
    const { db } = await import("./db");
    const { playerRegistry } = await import("@shared/schema");
    
    const players = await db.select().from(playerRegistry);
    
    if (players.length === 0) {
      return false;
    }
    
    for (const player of players) {
      const entry: PlayerRegistryEntry = {
        sport: player.sport,
        playerName: player.playerName,
        aliases: player.aliases ? player.aliases.split("|").map(a => a.trim()).filter(a => a) : [],
        careerStage: player.careerStage,
        roleTier: player.roleTier,
        positionGroup: player.positionGroup,
        lastUpdated: player.lastUpdated?.toISOString() || "",
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
    
    console.log(`[PlayerRegistry] Loaded ${registryMap.size} entries from database (including aliases)`);
    registrySource = "database";
    return true;
  } catch (error) {
    console.log("[PlayerRegistry] Database not available, will fall back to CSV");
    return false;
  }
}

function loadFromCSV(): boolean {
  const csvPath = path.join(process.cwd(), "data", "player_status_registry.csv");
  
  if (!fs.existsSync(csvPath)) {
    console.log("[PlayerRegistry] Registry file not found at:", csvPath);
    return false;
  }
  
  try {
    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n").filter(line => line.trim());
    
    if (lines.length < 2) {
      console.log("[PlayerRegistry] Registry file is empty or has no data rows");
      return false;
    }
    
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
    
    console.log(`[PlayerRegistry] Loaded ${registryMap.size} entries from CSV (including aliases)`);
    registrySource = "csv";
    return true;
  } catch (error) {
    console.error("[PlayerRegistry] Error loading CSV registry:", error);
    return false;
  }
}

async function loadRegistryAsync(): Promise<void> {
  // Always try database - it's authoritative and may have newer data than CSV
  const dbLoaded = await loadFromDatabase();
  
  // Fall back to CSV if database is empty or unavailable
  if (!dbLoaded && registryMap.size === 0) {
    loadFromCSV();
  }
  
  registryLoaded = true;
}

function loadRegistry(): void {
  // Start async loading if not already in progress
  if (!loadingPromise) {
    loadingPromise = loadRegistryAsync();
  }
  
  // For synchronous access on first call, load from CSV as immediate fallback
  // Database loading will override this when it completes
  if (registryMap.size === 0) {
    loadFromCSV();
  }
}

export async function ensureRegistryLoaded(): Promise<void> {
  console.log(`[PlayerRegistry] ensureRegistryLoaded called. loadingPromise=${!!loadingPromise}, registryLoaded=${registryLoaded}, registrySource=${registrySource}, mapSize=${registryMap.size}`);
  
  // Always wait for any pending database load - it's authoritative
  if (loadingPromise) {
    console.log("[PlayerRegistry] Waiting for existing loadingPromise...");
    await loadingPromise;
    console.log(`[PlayerRegistry] loadingPromise resolved. registrySource=${registrySource}, mapSize=${registryMap.size}`);
    return;
  }
  
  // If no loading in progress, start fresh database load
  if (!registryLoaded || registrySource !== "database") {
    console.log("[PlayerRegistry] Starting fresh database load...");
    loadingPromise = loadRegistryAsync();
    await loadingPromise;
    console.log(`[PlayerRegistry] Fresh load complete. registrySource=${registrySource}, mapSize=${registryMap.size}`);
  }
}

export function getRegistrySource(): "database" | "csv" | "none" {
  return registrySource;
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
  
  console.log(`[PlayerRegistry] lookupPlayer("${playerName}") -> normalized="${normalized}", found=${!!entry}, registrySource=${registrySource}, mapSize=${registryMap.size}`);
  
  if (entry) {
    console.log(`[PlayerRegistry] Found entry: position=${entry.positionGroup}, stage=${entry.careerStage}, sport=${entry.sport}`);
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
    "STARTER": "STARTER",
    "SOLID_STARTER": "STARTER",
    "UNCERTAIN_STARTER": "UNCERTAIN_STARTER",
    "UNCERTAIN_ROLE": "UNCERTAIN_STARTER",
    "BACKUP": "BACKUP",
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
    "PROSPECT": "ROOKIE", // Legacy support for old data
  };
  
  return mapping[registryStage] || "UNKNOWN";
}

export function getRegistryStats(): { totalEntries: number; loaded: boolean; source: "database" | "csv" | "none" } {
  loadRegistry();
  return {
    totalEntries: registryMap.size,
    loaded: registryLoaded,
    source: registrySource,
  };
}

export function searchPlayers(query: string, limit: number = 10): PlayerRegistryEntry[] {
  loadRegistry();
  
  if (!query || query.length < 2) {
    return [];
  }
  
  const normalizedQuery = normalizeForLookup(query);
  const results: PlayerRegistryEntry[] = [];
  const seenNames = new Set<string>();
  const entries = Array.from(registryMap.entries());
  
  // First pass: exact prefix matches on player name
  for (const [key, entry] of entries) {
    if (seenNames.has(entry.playerName)) continue;
    
    const normalizedName = normalizeForLookup(entry.playerName);
    if (normalizedName.startsWith(normalizedQuery)) {
      results.push(entry);
      seenNames.add(entry.playerName);
      if (results.length >= limit) break;
    }
  }
  
  // Second pass: contains matches if we need more results
  if (results.length < limit) {
    for (const [key, entry] of entries) {
      if (seenNames.has(entry.playerName)) continue;
      
      const normalizedName = normalizeForLookup(entry.playerName);
      if (normalizedName.includes(normalizedQuery)) {
        results.push(entry);
        seenNames.add(entry.playerName);
        if (results.length >= limit) break;
      }
    }
  }
  
  return results;
}
