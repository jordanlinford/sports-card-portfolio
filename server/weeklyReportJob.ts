import { db } from "./db";
import { blogPosts, playerOutlookCache, cardSignals } from "@shared/schema";
import { desc, sql, gte } from "drizzle-orm";

export async function generateWeeklyReport(): Promise<void> {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get top movers from outlook cache (most recently updated, highest composite scores)
    const topPlayers = await db
      .select()
      .from(playerOutlookCache)
      .orderBy(desc(playerOutlookCache.updatedAt))
      .limit(20);

    // Get recent signals
    const recentSignals = await db
      .select()
      .from(cardSignals)
      .where(gte(cardSignals.createdAt, oneWeekAgo))
      .orderBy(desc(cardSignals.createdAt))
      .limit(50);

    // Build the report
    const buySignals = recentSignals.filter((s: any) => s.signalType === "BUY").length;
    const sellSignals = recentSignals.filter((s: any) => s.signalType === "SELL").length;
    const holdSignals = recentSignals.filter((s: any) => s.signalType === "HOLD").length;

    const topBullish = topPlayers
      .filter((p: any) => {
        const outlook = p.outlookJson as any;
        return outlook?.verdict === "ACCUMULATE" || outlook?.verdict === "BUY";
      })
      .slice(0, 5);

    const topBearish = topPlayers
      .filter((p: any) => {
        const outlook = p.outlookJson as any;
        return outlook?.verdict === "AVOID" || outlook?.verdict === "TRADE_THE_HYPE";
      })
      .slice(0, 5);

    const today = new Date();
    const weekOf = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const slug = `state-of-the-hobby-${today.toISOString().split("T")[0]}`;

    const title = `State of the Hobby — Week of ${weekOf}`;

    let content = `# ${title}\n\n`;
    content += `## Market Pulse\n\n`;
    content += `This week, our Alpha Engine generated **${buySignals} BUY signals**, **${sellSignals} SELL signals**, and **${holdSignals} HOLD signals** across tracked cards.\n\n`;

    if (topBullish.length > 0) {
      content += `## Top Bullish Players\n\n`;
      for (const p of topBullish) {
        const outlook = (p as any).outlookJson as any;
        content += `- **${p.playerName}** (${p.sport}) — ${outlook?.verdict || "N/A"} | Confidence: ${outlook?.confidence || "N/A"}%\n`;
      }
      content += `\n`;
    }

    if (topBearish.length > 0) {
      content += `## Caution Zone\n\n`;
      for (const p of topBearish) {
        const outlook = (p as any).outlookJson as any;
        content += `- **${p.playerName}** (${p.sport}) — ${outlook?.verdict || "N/A"}\n`;
      }
      content += `\n`;
    }

    content += `## What We're Watching\n\n`;
    content += `The overall market sentiment leans **${buySignals > sellSignals ? "bullish" : buySignals < sellSignals ? "bearish" : "neutral"}** this week. `;
    content += `Stay tuned to the [Alpha Feed](/alpha) for daily updates.\n\n`;
    content += `*This report is auto-generated from Sports Card Portfolio's market intelligence engine.*\n`;

    // Check if post for this week already exists
    const existing = await db.select().from(blogPosts).where(sql`${blogPosts.slug} = ${slug}`);
    if (existing.length > 0) {
      console.log(`[WeeklyReport] Post already exists for ${slug}, skipping`);
      return;
    }

    // Create the blog post
    await db.insert(blogPosts).values({
      title,
      slug,
      content,
      excerpt: `This week: ${buySignals} BUY signals, ${sellSignals} SELL signals. Market sentiment is ${buySignals > sellSignals ? "bullish" : "neutral"}.`,
      isPublished: true,
      publishedAt: new Date(),
    });

    console.log(`[WeeklyReport] Published: ${title}`);
  } catch (error) {
    console.error("[WeeklyReport] Failed to generate weekly report:", error);
  }
}

// Run every Monday at 8 AM UTC
export function startWeeklyReportScheduler(): void {
  const checkInterval = 60 * 60 * 1000; // Check every hour
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCDay() === 1 && now.getUTCHours() === 8) {
      await generateWeeklyReport();
    }
  }, checkInterval);
  console.log("[WeeklyReport] Weekly report scheduler started (Mondays 08:00 UTC)");
}
