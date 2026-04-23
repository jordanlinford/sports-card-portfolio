import "./sentry"; // Initialize Sentry early (before other imports)
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { timingSafeEqual } from "crypto";
import { Sentry } from "./sentry";
import { registerRoutes } from "./routes";
import { startScanWorker } from "./scanWorker";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startPrewarmJob } from "./prewarmJob";
import { startCareerStageJob } from "./careerStageJob";
import { startHiddenGemsRefreshJob } from "./hiddenGemsService";
import { startRegressionTestScheduler, runVerdictRegression } from "./regressionTestJob";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '50mb', // Allow larger payloads for image uploads (base64 encoded)
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;

    const duration = Date.now() - start;
    const slow = duration > 2000;
    const entry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path,
      status: res.statusCode,
      duration,
      userId: (req as any).user?.claims?.sub ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.slice(0, 100) ?? null,
      ...(slow ? { slow: true } : {}),
    };

    if (slow) {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  });

  next();
});

(async () => {
  // Add health check endpoint FIRST - before any other initialization
  // This ensures the deployment health check passes quickly
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  
  // Start listening IMMEDIATELY so health checks pass
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);
      
      // Now do the heavier initialization after server is listening
      try {
        await registerRoutes(httpServer, app);

        // Start the background scan-job worker now that storage and routes are ready.
        try {
          startScanWorker();
        } catch (workerErr) {
          console.error("[ScanWorker] Failed to start:", workerErr);
        }
        
        // Admin endpoint for manual regression run (gated by QA_LOGIN_TOKEN)
        // Must be registered BEFORE setupVite so the SPA catch-all doesn't shadow it.
        app.get("/api/admin/run-regression", async (req, res) => {
          const expected = process.env.QA_LOGIN_TOKEN;
          const provided =
            (req.headers["x-qa-token"] as string | undefined);
          if (!expected || !provided || provided.length !== expected.length ||
              !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
            return res.status(401).json({ error: "Unauthorized" });
          }
          try {
            const summary = await runVerdictRegression();
            res.json(summary);
          } catch (err: any) {
            console.error("[Regression] Manual run failed:", err);
            res.status(500).json({ error: err?.message || "Regression run failed" });
          }
        });
        console.log("[Regression] Admin endpoint registered: GET /api/admin/run-regression");

        // Admin endpoint to clean up cards with bad AI-generated variation strings
        // (gated by QA_LOGIN_TOKEN). Must be registered BEFORE setupVite.
        app.post("/api/admin/cleanup-bad-variations", async (req, res) => {
          const expected = process.env.QA_LOGIN_TOKEN;
          const provided =
            (req.headers["x-qa-token"] as string | undefined);
          if (!expected || !provided || provided.length !== expected.length ||
              !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
            return res.status(401).json({ error: "Unauthorized" });
          }
          try {
            const { pool } = await import("./db");
            const result = await pool.query(
              `UPDATE cards SET variation = NULL WHERE variation LIKE 'Err%' OR variation LIKE '%CMP should be%'`
            );
            const rowCount = result.rowCount ?? 0;
            console.log(`[Cleanup] Nulled variation on ${rowCount} card(s)`);
            res.json({ rowsUpdated: rowCount });
          } catch (err: any) {
            console.error("[Cleanup] Bad-variation cleanup failed:", err);
            res.status(500).json({ error: err?.message || "Cleanup failed" });
          }
        });
        console.log("[Cleanup] Admin endpoint registered: POST /api/admin/cleanup-bad-variations");

        app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
          const status = err.status || err.statusCode || 500;
          const message = err.message || "Internal Server Error";

          // Report server errors to Sentry
          if (status >= 500) {
            Sentry.captureException(err);
          }

          res.status(status).json({ message });
          throw err;
        });

        // importantly only setup vite in development and after
        // setting up all the other routes so the catch-all route
        // doesn't interfere with the other routes
        if (process.env.NODE_ENV === "production") {
          serveStatic(app);
        } else {
          const { setupVite } = await import("./vite");
          await setupVite(httpServer, app);
        }
        
        // Auto-seed player outlooks if cache is nearly empty
        try {
          const { db: seedDb } = await import("./db");
          const { sql: seedSql } = await import("drizzle-orm");
          const countResult = await seedDb.execute(seedSql`SELECT count(*) as cnt FROM player_outlook_cache`);
          const cachedCount = parseInt((countResult as any).rows?.[0]?.cnt || "0");
          if (cachedCount < 20) {
            console.log(`[AutoSeed] Only ${cachedCount} players cached, starting background seed...`);
            const { seedPlayerOutlooks } = await import("./hiddenGemsService");
            const { getPlayerOutlook } = await import("./playerOutlookEngine");
            seedPlayerOutlooks(getPlayerOutlook, 100).then(result => {
              console.log(`[AutoSeed] Complete: ${result.analyzed} analyzed, ${result.failed} failed`);
            }).catch(err => {
              console.error("[AutoSeed] Error:", err);
            });
          }
        } catch (seedErr) {
          console.error("[AutoSeed] Failed:", seedErr);
        }

        // Start the nightly prewarm job for eBay comps cache
        startPrewarmJob();
        
        // Start the career stage advancement scheduler
        startCareerStageJob();
        
        // Start the weekly Hidden Gems auto-refresh (every Monday 5 AM UTC)
        startHiddenGemsRefreshJob();

        // Start the weekly verdict regression test job (every Sunday 2 AM UTC)
        startRegressionTestScheduler();

        // Admin endpoint for manual regression run (gated by QA_LOGIN_TOKEN)
        app.get("/api/admin/run-regression", async (req, res) => {
          const expected = process.env.QA_LOGIN_TOKEN;
          const provided =
            (req.headers["x-qa-token"] as string | undefined);
          if (!expected || !provided || provided.length !== expected.length ||
              !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
            return res.status(401).json({ error: "Unauthorized" });
          }
          try {
            const summary = await runVerdictRegression();
            res.json(summary);
          } catch (err: any) {
            console.error("[Regression] Manual run failed:", err);
            res.status(500).json({ error: err?.message || "Regression run failed" });
          }
        });
        console.log("[Regression] Admin endpoint registered: GET /api/admin/run-regression");

        log("All routes registered successfully");
        
        try {
          const { db: appDb } = await import("./db");
          const { invalidateLeaderboardCache } = await import("./leaderboardEngine");
          const { sql } = await import("drizzle-orm");

          const sportCorrections: Record<string, string> = {
            "jacksonchourio": "baseball",
            "laminyamal": "soccer",
            "lamineyamal": "soccer",
            "haaland": "soccer",
            "erlinghaaland": "soccer",
            "davidbeckham": "soccer",
            "ovechkin": "hockey",
            "alexanderovechkin": "hockey",
            "hughes": "hockey",
            "jackhughes": "hockey",
            "konnergriffin": "baseball",
          };
          
          let keyFixCount = 0;
          for (const [nameKey, correctSport] of Object.entries(sportCorrections)) {
            const wrongKeys = await appDb.execute(sql`
              SELECT player_key FROM player_outlook_cache 
              WHERE player_key LIKE ${'%:' + nameKey}
                AND player_key NOT LIKE ${correctSport + ':%'}
            `);
            const rows = (wrongKeys as any).rows || (wrongKeys as any);
            if (rows && rows.length > 0) {
              for (const row of rows) {
                const oldKey = row.player_key;
                const newKey = correctSport + ':' + nameKey;
                const existing = await appDb.execute(sql`SELECT 1 FROM player_outlook_cache WHERE player_key = ${newKey}`);
                const existingRows = (existing as any).rows || (existing as any);
                if (existingRows && existingRows.length > 0) {
                  await appDb.execute(sql`DELETE FROM player_outlook_cache WHERE player_key = ${oldKey}`);
                } else {
                  await appDb.execute(sql`
                    UPDATE player_outlook_cache 
                    SET player_key = ${newKey}, sport = ${correctSport}
                    WHERE player_key = ${oldKey}
                  `);
                }
                keyFixCount++;
              }
            }
          }

          const fixed = await appDb.execute(sql`
            UPDATE player_outlook_cache 
            SET sport = split_part(player_key, ':', 1)
            WHERE sport != split_part(player_key, ':', 1)
              AND player_key LIKE '%:%'
          `);
          const fixedCount = (fixed as any).rowCount || 0;
          
          const dupes = await appDb.execute(sql`
            DELETE FROM player_outlook_cache
            WHERE player_key IN (
              SELECT p1.player_key
              FROM player_outlook_cache p1
              JOIN player_outlook_cache p2 
                ON lower(replace(p1.player_name, ' ', '')) = lower(replace(p2.player_name, ' ', ''))
                AND p1.player_key != p2.player_key
              WHERE p1.updated_at < p2.updated_at
            )
          `);
          const dupeCount = (dupes as any).rowCount || 0;

          if (fixedCount > 0 || dupeCount > 0 || keyFixCount > 0) {
            invalidateLeaderboardCache();
            console.log(`[Cleanup] Fixed ${fixedCount} sport mismatches, ${keyFixCount} wrong-sport keys, removed ${dupeCount} duplicates`);
          }
        } catch (cleanupErr) {
          console.error("[Cleanup] Sport sync failed:", cleanupErr);
        }
      } catch (err) {
        console.error("Failed to initialize routes:", err);
      }
    },
  );

  // Graceful shutdown: drain database pool on termination
  const shutdown = async () => {
    console.log("[Server] Shutting down gracefully...");
    const { pool } = await import("./db");
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
