import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import { desc } from "drizzle-orm";

export interface CardOfDay {
  playerName: string;
  sport: string;
  verdict: string;
  confidence: number;
  summary: string;
  playerKey: string;
}

let cachedCardOfDay: { data: CardOfDay; date: string } | null = null;

export async function getCardOfDay(): Promise<CardOfDay | null> {
  const today = new Date().toISOString().split("T")[0];

  // Return cached if same day
  if (cachedCardOfDay?.date === today) return cachedCardOfDay.data;

  try {
    // Pick a player with high confidence and interesting verdict
    // Use day-of-year as seed for deterministic daily picks
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

    const candidates = await db
      .select()
      .from(playerOutlookCache)
      .orderBy(desc(playerOutlookCache.updatedAt))
      .limit(50);

    if (candidates.length === 0) return null;

    // Deterministic pick based on day
    const pick = candidates[dayOfYear % candidates.length];
    const outlook = (pick as any).outlookJson as any;

    const card: CardOfDay = {
      playerName: pick.playerName || "Unknown",
      sport: pick.sport || "unknown",
      verdict: outlook?.verdict || "N/A",
      confidence: outlook?.confidence || 0,
      summary: outlook?.summary || outlook?.narrative || `${pick.playerName} is showing interesting market activity.`,
      playerKey: pick.playerKey,
    };

    cachedCardOfDay = { data: card, date: today };
    return card;
  } catch (error) {
    console.error("[CardOfDay] Failed:", error);
    return null;
  }
}
