import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000,
});
export const db = drizzle(pool, { schema });

// Log pool errors to prevent silent connection issues
pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected error on idle client:", err.message);
});

// Periodic pool health logging (every 5 minutes)
setInterval(() => {
  const { totalCount, idleCount, waitingCount } = pool;
  if (waitingCount > 0 || totalCount >= 9) {
    console.warn(`[DB Pool] total=${totalCount} idle=${idleCount} waiting=${waitingCount}`);
  }
}, 5 * 60 * 1000);
