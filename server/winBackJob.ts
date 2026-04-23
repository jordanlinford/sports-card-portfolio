import { db } from "./db";
import { users, playerWatchlist, playerOutlookCache } from "@shared/schema";
import { eq, and, lte, gte, isNotNull } from "drizzle-orm";
import { sendWinBackEmail } from "./email";

export async function runWinBackEmails(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  // Find users who cancelled exactly 7 days ago (within a 1-day window)
  const cancelledUsers = await db
    .select()
    .from(users)
    .where(and(
      isNotNull(users.cancelledAt),
      gte(users.cancelledAt, eightDaysAgo),
      lte(users.cancelledAt, sevenDaysAgo),
      isNotNull(users.email),
    ));

  for (const user of cancelledUsers) {
    try {
      // Get their watchlist players
      const watchlist = await db
        .select()
        .from(playerWatchlist)
        .where(eq(playerWatchlist.userId, user.id));

      const moves: string[] = [];
      for (const item of watchlist.slice(0, 5)) {
        const [cached] = await db
          .select()
          .from(playerOutlookCache)
          .where(eq(playerOutlookCache.playerKey, item.playerKey));
        if (cached) {
          const outlook = cached.outlookJson as any;
          if (outlook?.verdict) {
            moves.push(`${item.playerName}: ${outlook.verdict} (${outlook.modifier || ""})`);
          }
        }
      }

      const userName = [user.firstName, user.lastName].filter(Boolean).join(" ");
      await sendWinBackEmail(user.email!, userName, moves);
      console.log(`[WinBack] Sent win-back email to ${user.email}`);
    } catch (err) {
      console.error(`[WinBack] Failed for user ${user.id}:`, err);
    }
  }
}

// Run daily at 10 AM UTC
export function startWinBackScheduler(): void {
  const checkInterval = 60 * 60 * 1000; // Check every hour
  setInterval(async () => {
    const hour = new Date().getUTCHours();
    if (hour === 10) {
      await runWinBackEmails();
    }
  }, checkInterval);
  console.log("[WinBack] Win-back email scheduler started (daily at 10:00 UTC)");
}
