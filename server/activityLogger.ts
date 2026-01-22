import { db } from "./db";
import { activityLogs, type ActivityType, type InsertActivityLog } from "@shared/schema";
import type { Request } from "express";

export async function logActivity(
  activityType: ActivityType,
  options: {
    userId?: string | null;
    targetId?: string | number;
    targetType?: string;
    metadata?: Record<string, any>;
    req?: Request;
  } = {}
): Promise<void> {
  try {
    const logEntry: InsertActivityLog = {
      userId: options.userId || null,
      activityType,
      targetId: options.targetId?.toString() || null,
      targetType: options.targetType || null,
      metadata: options.metadata || null,
      ipAddress: options.req ? getClientIp(options.req) : null,
      userAgent: options.req?.headers["user-agent"] || null,
    };

    await db.insert(activityLogs).values(logEntry);
  } catch (error) {
    console.error("[ActivityLogger] Failed to log activity:", error);
  }
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || null;
}

export async function getRecentActivity(limit: number = 100): Promise<any[]> {
  const results = await db
    .select()
    .from(activityLogs)
    .orderBy(activityLogs.createdAt)
    .limit(limit);
  
  return results.reverse();
}

export async function getActivityStats(days: number = 7): Promise<{
  totalActivities: number;
  byType: Record<string, number>;
  byDay: { date: string; count: number }[];
  topUsers: { userId: string; count: number }[];
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { sql } = await import("drizzle-orm");
  
  const results = await db
    .select()
    .from(activityLogs)
    .where(sql`${activityLogs.createdAt} >= ${startDate}`);

  const byType: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const byUser: Record<string, number> = {};

  for (const log of results) {
    byType[log.activityType] = (byType[log.activityType] || 0) + 1;
    
    const dateKey = log.createdAt?.toISOString().split("T")[0] || "unknown";
    byDay[dateKey] = (byDay[dateKey] || 0) + 1;
    
    if (log.userId) {
      byUser[log.userId] = (byUser[log.userId] || 0) + 1;
    }
  }

  return {
    totalActivities: results.length,
    byType,
    byDay: Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topUsers: Object.entries(byUser)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
