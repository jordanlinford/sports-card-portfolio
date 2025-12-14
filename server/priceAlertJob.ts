import { storage } from "./storage";
import { sendPriceAlertEmail, sendWeeklyDigestEmail } from "./email";

export async function processPriceAlerts(): Promise<{ processed: number; triggered: number }> {
  console.log("Starting price alert processing...");
  
  try {
    const activeAlerts = await storage.getActiveAlertsForProcessing();
    let processed = 0;
    let triggered = 0;

    for (const alert of activeAlerts) {
      processed++;
      const { card, user } = alert;
      
      if (!card.estimatedValue) {
        continue;
      }

      const currentPrice = card.estimatedValue;
      const threshold = alert.threshold;
      let shouldTrigger = false;

      if (alert.alertType === "above" && currentPrice >= threshold) {
        shouldTrigger = true;
      } else if (alert.alertType === "below" && currentPrice <= threshold) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        triggered++;
        
        const alertSettings = await storage.getUserAlertSettings(user.id);
        const emailEnabled = alertSettings?.emailAlertsEnabled !== false;
        const inAppEnabled = alertSettings?.inAppAlertsEnabled !== false;

        if (inAppEnabled) {
          await storage.createNotification(user.id, "price_alert", {
            cardId: card.id,
            cardTitle: card.title,
            alertType: alert.alertType,
            threshold: threshold,
            currentPrice: currentPrice,
            message: `${card.title} is now ${alert.alertType === "above" ? "above" : "below"} your $${threshold} threshold at $${currentPrice.toFixed(2)}`,
          });
        }

        if (emailEnabled && user.email) {
          await sendPriceAlertEmail(
            user.email,
            user.firstName || "Collector",
            card.title,
            alert.alertType,
            threshold,
            currentPrice
          );
        }

        await storage.markAlertTriggered(alert.id);
        console.log(`Alert triggered for card ${card.id}: ${card.title} (${alert.alertType} ${threshold})`);
      }

      await storage.recordPriceHistory(card.id, currentPrice);
    }

    console.log(`Price alert processing complete. Processed: ${processed}, Triggered: ${triggered}`);
    return { processed, triggered };
  } catch (error) {
    console.error("Error processing price alerts:", error);
    throw error;
  }
}

export async function processWeeklyDigests(): Promise<{ sent: number }> {
  console.log("Starting weekly digest processing...");
  
  try {
    const usersForDigest = await storage.getUsersForWeeklyDigest();
    let sent = 0;

    for (const settings of usersForDigest) {
      const { user } = settings;
      
      if (!user.email) {
        continue;
      }

      const analytics = await storage.getPortfolioAnalytics(user.id);
      
      if (analytics.totalCards === 0) {
        continue;
      }

      const topMovers = analytics.recentValueChanges.slice(0, 5).map(card => ({
        title: card.title,
        currentValue: card.estimatedValue || 0,
        previousValue: card.previousValue || 0,
        change: (card.estimatedValue || 0) - (card.previousValue || 0),
        changePercent: card.previousValue 
          ? (((card.estimatedValue || 0) - card.previousValue) / card.previousValue * 100)
          : 0,
      }));

      await sendWeeklyDigestEmail(
        user.email,
        user.firstName || "Collector",
        {
          totalValue: analytics.totalValue,
          totalCards: analytics.totalCards,
          totalCases: analytics.totalCases,
          topMovers,
        }
      );

      await storage.markDigestSent(user.id);
      sent++;
    }

    console.log(`Weekly digest processing complete. Sent: ${sent}`);
    return { sent };
  } catch (error) {
    console.error("Error processing weekly digests:", error);
    throw error;
  }
}

let priceAlertInterval: NodeJS.Timeout | null = null;
let weeklyDigestInterval: NodeJS.Timeout | null = null;

export function startPriceAlertScheduler(intervalMs: number = 24 * 60 * 60 * 1000): void {
  if (priceAlertInterval) {
    clearInterval(priceAlertInterval);
  }
  
  console.log(`Starting price alert scheduler (interval: ${intervalMs / 1000 / 60} minutes)`);
  
  priceAlertInterval = setInterval(async () => {
    try {
      await processPriceAlerts();
    } catch (error) {
      console.error("Price alert scheduler error:", error);
    }
  }, intervalMs);
}

export function startWeeklyDigestScheduler(): void {
  if (weeklyDigestInterval) {
    clearInterval(weeklyDigestInterval);
  }
  
  const checkInterval = 60 * 60 * 1000;
  console.log("Starting weekly digest scheduler");
  
  weeklyDigestInterval = setInterval(async () => {
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 9) {
      try {
        await processWeeklyDigests();
      } catch (error) {
        console.error("Weekly digest scheduler error:", error);
      }
    }
  }, checkInterval);
}

export function stopSchedulers(): void {
  if (priceAlertInterval) {
    clearInterval(priceAlertInterval);
    priceAlertInterval = null;
  }
  if (weeklyDigestInterval) {
    clearInterval(weeklyDigestInterval);
    weeklyDigestInterval = null;
  }
}
