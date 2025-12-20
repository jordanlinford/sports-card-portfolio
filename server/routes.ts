import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertDisplayCaseSchema, insertCardSchema } from "@shared/schema";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { lookupCardPrice, lookupMultipleCardPrices } from "./priceService";
import { generateShareImage } from "./shareImageService";
import { generatePlayerOGImage, getPlayerShareData } from "./playerShareImageService";
import { generatePageOGImage, getPageShareData } from "./pageShareImageService";
import { prestigeService } from "./prestigeService";
import { generateCardOutlook, generateQuickOutlook, inferCardMetadata } from "./cardOutlookService";
import { sendPaymentConfirmationEmail } from "./email";
import { 
  buildPortfolioProfile, 
  generateRiskSignals, 
  generatePortfolioOutlook, 
  getLatestPortfolioSnapshot, 
  isSnapshotFresh,
  generateNextBuys,
  getLatestNextBuys
} from "./portfolioIntelligenceService";

// ============================================================================
// Free User Cost Safeguards
// ============================================================================

// Global daily cap for all free user outlook lookups combined
const FREE_USER_DAILY_GLOBAL_CAP = 500; // Max 500 lookups/day for ALL free users

// Per-user rate limiter (prevents abuse - max 1 lookup per 30 seconds)
const FREE_USER_RATE_LIMIT_MS = 30000; // 30 seconds between lookups
const freeUserLastLookup = new Map<string, number>();

function checkFreeUserRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const lastLookup = freeUserLastLookup.get(userId);
  const now = Date.now();
  
  if (lastLookup && (now - lastLookup) < FREE_USER_RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((FREE_USER_RATE_LIMIT_MS - (now - lastLookup)) / 1000);
    return { allowed: false, retryAfter };
  }
  
  return { allowed: true };
}

function recordFreeUserLookup(userId: string) {
  freeUserLastLookup.set(userId, Date.now());
  
  // Cleanup old entries periodically to prevent memory bloat
  if (freeUserLastLookup.size > 1000) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    freeUserLastLookup.forEach((time, id) => {
      if (now - time > FREE_USER_RATE_LIMIT_MS * 2) {
        keysToDelete.push(id);
      }
    });
    keysToDelete.forEach(id => freeUserLastLookup.delete(id));
  }
}

// Portfolio Intelligence Rate Limiting (even Pro users to prevent abuse)
// Separate maps for each endpoint so they don't block each other
const PORTFOLIO_AI_RATE_LIMIT_MS = 60000; // 1 minute between calls per endpoint
const portfolioOutlookLastCall = new Map<string, number>();
const nextBuysLastCall = new Map<string, number>();

function checkPortfolioAIRateLimit(userId: string, endpoint: 'outlook' | 'nextbuys'): { allowed: boolean; retryAfter?: number } {
  const lastCallMap = endpoint === 'outlook' ? portfolioOutlookLastCall : nextBuysLastCall;
  const lastCall = lastCallMap.get(userId);
  const now = Date.now();
  
  if (lastCall && (now - lastCall) < PORTFOLIO_AI_RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((PORTFOLIO_AI_RATE_LIMIT_MS - (now - lastCall)) / 1000);
    return { allowed: false, retryAfter };
  }
  
  return { allowed: true };
}

function recordPortfolioAICall(userId: string, endpoint: 'outlook' | 'nextbuys') {
  const lastCallMap = endpoint === 'outlook' ? portfolioOutlookLastCall : nextBuysLastCall;
  lastCallMap.set(userId, Date.now());
  
  // Cleanup old entries
  if (lastCallMap.size > 500) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    lastCallMap.forEach((time, id) => {
      if (now - time > PORTFOLIO_AI_RATE_LIMIT_MS * 5) {
        keysToDelete.push(id);
      }
    });
    keysToDelete.forEach(id => lastCallMap.delete(id));
  }
}

const SOCIAL_CRAWLERS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'Pinterest',
  'Slackbot',
  'TelegramBot',
  'WhatsApp',
  'Discordbot',
];

function isSocialCrawler(userAgent: string): boolean {
  return SOCIAL_CRAWLERS.some(crawler => userAgent.includes(crawler));
}

async function ensureDefaultPromoCodes() {
  try {
    const betaUserCode = await storage.getPromoCode('BETAUSER');
    if (!betaUserCode) {
      await storage.createPromoCode('BETAUSER', 25, 'Free Pro access for early beta testers');
      console.log('Created default BETAUSER promo code');
    }
  } catch (error) {
    console.error('Error ensuring default promo codes:', error);
  }
}

async function initStripe(app: Express) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not found, skipping Stripe initialization');
    return;
  }

  // Run Stripe initialization in background to avoid blocking server startup
  (async () => {
    try {
      console.log('Initializing Stripe schema...');
      await runMigrations({ databaseUrl });
      console.log('Stripe schema ready');

      const stripeSync = await getStripeSync();

      console.log('Setting up managed webhook...');
      const replitDomains = process.env.REPLIT_DOMAINS?.split(',')[0];
      if (replitDomains) {
        const webhookBaseUrl = `https://${replitDomains}`;
        const { webhook, uuid } = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`,
          {
            enabled_events: ['*'],
            description: 'Managed webhook for MyDisplayCase subscription sync',
          }
        );
        console.log(`Webhook configured: ${webhook.url} (UUID: ${uuid})`);
      }

      console.log('Syncing Stripe data in background...');
      stripeSync.syncBackfill()
        .then(() => console.log('Stripe data synced'))
        .catch((err: Error) => console.error('Error syncing Stripe data:', err));
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
      console.log('Note: Checkout will still work, only webhook sync is affected');
    }
  })();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // Auth middleware
  await setupAuth(app);

  // Initialize Stripe webhooks and sync
  await initStripe(app);

  // Ensure default promo codes exist
  await ensureDefaultPromoCodes();

  // Robots.txt - allow social media crawlers
  app.get("/robots.txt", (req, res) => {
    const robotsTxt = `User-agent: facebookexternalhit
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: LinkedInBot
Allow: /

User-agent: Slackbot
Allow: /

User-agent: Discordbot
Allow: /

User-agent: Googlebot
Allow: /

User-agent: *
Allow: /
`;
    res.type('text/plain').send(robotsTxt);
  });

  // Stripe webhook endpoint - uses rawBody captured in index.ts
  app.post("/api/stripe/webhook/:uuid", async (req: any, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      const { uuid } = req.params;
      
      // Use rawBody captured by express.json verify option
      const payload = req.rawBody as Buffer;
      if (!payload) {
        console.error('STRIPE WEBHOOK ERROR: rawBody not found');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(payload, sig, uuid);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  });

  // Open Graph meta tags for social sharing of public display cases
  app.get("/case/:id", async (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    
    if (!isSocialCrawler(userAgent)) {
      return next();
    }

    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return next();
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return next();
      }

      const cardCount = displayCase.cards?.length || 0;
      const cards = displayCase.cards || [];
      
      // Use the request host for consistent URLs (supports custom domains like mydisplaycase.io)
      // Prioritize the actual request host so social sharing works correctly on custom domains
      const requestHost = req.headers.host || '';
      const isCustomDomain = requestHost && !requestHost.includes('.replit.app') && !requestHost.includes('.repl.co');
      const baseUrl = isCustomDomain 
        ? `https://${requestHost}`
        : (process.env.REPLIT_DEPLOYMENT_DOMAIN 
            ? `https://${process.env.REPLIT_DEPLOYMENT_DOMAIN}`
            : `https://${requestHost}`);
      
      // Use the share image endpoint for rich preview images
      const imageUrl = `${baseUrl}/api/share-image/case/${id}`;
      
      // Get owner info for better description
      const owner = await storage.getUser(displayCase.userId);
      const ownerName = owner?.firstName 
        ? `${owner.firstName}${owner.lastName ? ' ' + owner.lastName : ''}`
        : 'A collector';
      
      // Calculate total value if cards have prices
      const totalValue = cards.reduce((sum, card) => {
        const price = card.estimatedValue || card.purchasePrice || 0;
        return sum + Number(price);
      }, 0);
      
      // Build compelling description
      let description = displayCase.description || '';
      if (!description) {
        const valueText = totalValue > 0 ? ` worth $${totalValue.toLocaleString()}` : '';
        const cardTypes = cards.slice(0, 3).map(c => c.title).filter(Boolean).join(', ');
        description = `${ownerName}'s collection of ${cardCount} card${cardCount !== 1 ? 's' : ''}${valueText}. ${cardTypes ? `Featuring: ${cardTypes}` : 'View this amazing collection!'}`;
      }
      
      // Truncate description to 160 chars for optimal preview
      if (description.length > 160) {
        description = description.substring(0, 157) + '...';
      }
      
      // Build compelling title
      const title = displayCase.name;
      const fullTitle = `${title} | ${cardCount} Cards | Sports Card Portfolio`;
      
      // Alt text for image
      const imageAlt = `${displayCase.name} - Card collection on Sports Card Portfolio`;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/case/${id}">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${imageAlt}">
  <meta property="og:site_name" content="Sports Card Portfolio">
  <meta property="og:locale" content="en_US">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${baseUrl}/case/${id}">
  <meta name="twitter:title" content="${fullTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta name="twitter:image:alt" content="${imageAlt}">
  
  <!-- Additional SEO -->
  <link rel="canonical" href="${baseUrl}/case/${id}">
</head>
<body>
  <h1>${displayCase.name}</h1>
  <p>${description}</p>
  <p>${cardCount} cards in this collection</p>
  <p>View this collection at <a href="${baseUrl}/case/${id}">${baseUrl}/case/${id}</a></p>
</body>
</html>`;

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      console.error("Error generating OG tags:", error);
      next();
    }
  });

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Onboarding status - check if user needs onboarding (has 0 display cases or 0 cards)
  app.get("/api/user/outlook-usage", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const isPro = user?.subscriptionStatus === "PRO";
      const FREE_TIER_LIMIT = 3;
      
      const monthlyCount = await storage.countUserMonthlyOutlookGenerations(userId);
      
      res.json({
        used: monthlyCount,
        limit: isPro ? null : FREE_TIER_LIMIT,
        remaining: isPro ? null : Math.max(0, FREE_TIER_LIMIT - monthlyCount),
        isPro,
      });
    } catch (error) {
      console.error("Error getting outlook usage:", error);
      res.status(500).json({ message: "Failed to get outlook usage" });
    }
  });

  app.get("/api/user/onboarding-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const displayCases = (await storage.getDisplayCases(userId)) ?? [];
      
      const totalCards = displayCases.reduce((sum, c) => sum + (c.cards?.length || 0), 0);
      const needsOnboarding = displayCases.length === 0 || totalCards === 0;
      
      res.json({ 
        needsOnboarding,
        displayCaseCount: displayCases.length,
        cardCount: totalCards 
      });
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      res.status(500).json({ message: "Failed to check onboarding status" });
    }
  });

  // Display Cases routes
  app.get("/api/display-cases", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const displayCases = await storage.getDisplayCases(userId);
      res.json(displayCases);
    } catch (error) {
      console.error("Error fetching display cases:", error);
      res.status(500).json({ message: "Failed to fetch display cases" });
    }
  });

  // Featured cards for landing page hero (public, no auth required)
  app.get("/api/featured-cards", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 8;
      const cases = await storage.getRecentPublicDisplayCases(5);
      
      // Flatten cards from all cases and take the first N with images
      const featuredCards = cases
        .flatMap(c => c.cards || [])
        .filter(card => card.imagePath)
        .slice(0, limit)
        .map(card => ({
          id: card.id,
          title: card.title,
          imagePath: card.imagePath,
          estimatedValue: card.estimatedValue,
        }));
      
      res.json(featuredCards);
    } catch (error) {
      console.error("Error fetching featured cards:", error);
      res.status(500).json({ message: "Failed to fetch featured cards" });
    }
  });

  // Public discovery routes
  app.get("/api/explore/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const cases = await storage.getRecentPublicDisplayCases(limit);
      res.json(cases);
    } catch (error) {
      console.error("Error fetching recent public cases:", error);
      res.status(500).json({ message: "Failed to fetch recent cases" });
    }
  });

  app.get("/api/explore/popular", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const cases = await storage.getPopularPublicDisplayCases(limit);
      res.json(cases);
    } catch (error) {
      console.error("Error fetching popular cases:", error);
      res.status(500).json({ message: "Failed to fetch popular cases" });
    }
  });

  app.get("/api/explore/trending", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const cases = await storage.getTrendingDisplayCases(limit);
      res.json(cases);
    } catch (error) {
      console.error("Error fetching trending cases:", error);
      res.status(500).json({ message: "Failed to fetch trending cases" });
    }
  });

  app.get("/api/explore/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const limit = parseInt(req.query.limit as string) || 20;
      
      if (!query.trim()) {
        return res.json([]);
      }
      
      const cases = await storage.searchPublicDisplayCases(query, limit);
      res.json(cases);
    } catch (error) {
      console.error("Error searching public cases:", error);
      res.status(500).json({ message: "Failed to search cases" });
    }
  });

  app.get("/api/cards/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { q, set, year, grade } = req.query;
      
      const results = await storage.searchCards(userId, {
        query: q as string || "",
        set: set as string || undefined,
        year: year ? parseInt(year as string) : undefined,
        grade: grade as string || undefined,
      });
      
      res.json(results);
    } catch (error) {
      console.error("Error searching cards:", error);
      res.status(500).json({ message: "Failed to search cards" });
    }
  });

  app.get("/api/display-cases/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase) {
        return res.status(404).json({ message: "Display case not found" });
      }

      // Check if public or if user owns it
      const userId = req.user?.claims?.sub;
      if (!displayCase.isPublic && displayCase.userId !== userId) {
        return res.status(404).json({ message: "Display case not found" });
      }

      res.json(displayCase);
    } catch (error) {
      console.error("Error fetching display case:", error);
      res.status(500).json({ message: "Failed to fetch display case" });
    }
  });

  app.get("/api/display-cases/:id/public", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return res.status(404).json({ message: "Display case not found" });
      }

      // Increment view count (fire and forget - don't block the response)
      storage.incrementViewCount(id).catch(err => {
        console.error("Failed to increment view count:", err);
      });

      res.json(displayCase);
    } catch (error) {
      console.error("Error fetching public display case:", error);
      res.status(500).json({ message: "Failed to fetch display case" });
    }
  });

  // Share image generation endpoint
  app.get("/api/share-image/case/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return res.status(404).json({ message: "Display case not found" });
      }

      const owner = await storage.getUser(displayCase.userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const formatParam = req.query.format as string;
      const validFormats = ["social", "story", "teaser", "brag-card", "brag-portfolio"] as const;
      type ShareFormat = typeof validFormats[number];
      const format: ShareFormat = validFormats.includes(formatParam as ShareFormat) 
        ? (formatParam as ShareFormat) 
        : "social";
      
      const baseUrl = process.env.REPLIT_DEPLOYMENT_DOMAIN 
        ? `https://${process.env.REPLIT_DEPLOYMENT_DOMAIN}`
        : `https://${req.headers.host}`;

      const imageBuffer = await generateShareImage(displayCase, owner, baseUrl, { format });

      res.set({
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length,
        "Cache-Control": "public, max-age=3600",
      });
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error generating share image:", error);
      res.status(500).json({ message: "Failed to generate share image" });
    }
  });

  // Player OG image generation endpoint
  app.get("/api/og/player/:playerSlug.png", async (req, res) => {
    try {
      const { playerSlug } = req.params;
      
      const imageBuffer = await generatePlayerOGImage(playerSlug);
      
      res.set({
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length,
        "Cache-Control": "public, max-age=3600",
      });
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error generating player OG image:", error);
      res.status(500).json({ message: "Failed to generate player OG image" });
    }
  });

  // HTML escape helper to prevent injection in meta tags
  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Player share page with OG meta tags for social crawlers
  app.get("/share/player/:playerSlug", async (req, res) => {
    try {
      const { playerSlug } = req.params;
      const userAgent = req.headers["user-agent"] || "";
      
      // Sanitize playerSlug to prevent injection (only allow alphanumeric and hyphens)
      const sanitizedSlug = playerSlug.replace(/[^a-z0-9-]/gi, "").toLowerCase();
      
      const baseUrl = process.env.REPLIT_DEPLOYMENT_DOMAIN 
        ? `https://${process.env.REPLIT_DEPLOYMENT_DOMAIN}`
        : `https://${req.headers.host}`;
      
      const data = await getPlayerShareData(sanitizedSlug);
      const playerName = data?.playerName || sanitizedSlug.replace(/-/g, " ");
      const verdict = data?.verdict || "HOLD_CORE";
      const oneLineRationale = data?.oneLineRationale || "AI-powered investment analysis for sports card collectors";
      
      const verdictLabels: Record<string, string> = {
        ACCUMULATE: "Accumulate",
        HOLD_CORE: "Hold",
        TRADE_THE_HYPE: "Trade the Hype",
        AVOID_NEW_MONEY: "Avoid",
        SPECULATIVE_FLYER: "Speculative",
      };
      const verdictLabel = verdictLabels[verdict] || "Hold";
      
      // Escape all dynamic content for HTML safety
      const title = escapeHtml(`${playerName}: ${verdictLabel}`);
      const description = escapeHtml(oneLineRationale);
      const imageUrl = `${baseUrl}/api/og/player/${sanitizedSlug}.png`;
      const pageUrl = `${baseUrl}/share/player/${sanitizedSlug}`;
      
      // For social crawlers, return static HTML with OG tags
      if (isSocialCrawler(userAgent)) {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Sports Card Portfolio</title>
  <meta name="description" content="${description}">
  
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Sports Card Portfolio">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
</head>
<body>
  <p>Redirecting to Sports Card Portfolio...</p>
</body>
</html>`;
        res.set("Content-Type", "text/html");
        return res.send(html);
      }
      
      // For humans, redirect to the SPA player outlook page
      res.redirect(`/player/${encodeURIComponent(playerName)}`);
    } catch (error) {
      console.error("Error serving player share page:", error);
      res.status(500).json({ message: "Failed to serve player share page" });
    }
  });

  // Page OG image generation endpoint (for Next Buys, Hidden Gems, etc.)
  app.get("/api/og/page/:pageSlug.png", async (req, res) => {
    try {
      const { pageSlug } = req.params;
      const sanitizedSlug = pageSlug.replace(/[^a-z0-9-]/gi, "").toLowerCase();
      
      const imageBuffer = await generatePageOGImage(sanitizedSlug);
      
      res.set({
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length,
        "Cache-Control": "public, max-age=86400", // 24 hours for static pages
      });
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error generating page OG image:", error);
      res.status(500).json({ message: "Failed to generate page OG image" });
    }
  });

  // Page share routes with OG meta tags for social crawlers
  app.get("/share/:pageSlug", async (req, res) => {
    try {
      const { pageSlug } = req.params;
      const userAgent = req.headers["user-agent"] || "";
      
      // Sanitize pageSlug (only allow alphanumeric and hyphens)
      const sanitizedSlug = pageSlug.replace(/[^a-z0-9-]/gi, "").toLowerCase();
      
      // Skip if it's a player share route (handled separately)
      if (sanitizedSlug === "player") {
        return res.status(404).json({ message: "Not found" });
      }
      
      const baseUrl = process.env.REPLIT_DEPLOYMENT_DOMAIN 
        ? `https://${process.env.REPLIT_DEPLOYMENT_DOMAIN}`
        : `https://${req.headers.host}`;
      
      const pageData = getPageShareData(sanitizedSlug);
      
      const title = escapeHtml(`${pageData.title} | Sports Card Portfolio`);
      const description = escapeHtml(pageData.description);
      const imageUrl = `${baseUrl}/api/og/page/${sanitizedSlug}.png`;
      const pageUrl = `${baseUrl}/share/${sanitizedSlug}`;
      
      // Route mapping for SPA redirects
      const routeMap: Record<string, string> = {
        "next-buys": "/next-buys",
        "hidden-gems": "/hidden-gems",
        "portfolio-analytics": "/analytics",
        "player-outlook": "/player",
        "watchlist": "/watchlist",
      };
      const spaRoute = routeMap[sanitizedSlug] || `/${sanitizedSlug}`;
      
      // For social crawlers, return static HTML with OG tags
      if (isSocialCrawler(userAgent)) {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Sports Card Portfolio">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
</head>
<body>
  <p>Redirecting to Sports Card Portfolio...</p>
</body>
</html>`;
        res.set("Content-Type", "text/html");
        return res.send(html);
      }
      
      // For humans, redirect to the SPA page
      res.redirect(spaRoute);
    } catch (error) {
      console.error("Error serving page share:", error);
      res.status(500).json({ message: "Failed to serve page share" });
    }
  });

  app.post("/api/display-cases", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check free tier limit
      const user = await storage.getUser(userId);
      if (user?.subscriptionStatus !== "PRO") {
        const caseCount = await storage.countDisplayCases(userId);
        if (caseCount >= 3) {
          return res.status(403).json({ 
            message: "Free tier limit reached. Upgrade to Pro for unlimited cases." 
          });
        }
      }

      const parsed = insertDisplayCaseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const displayCase = await storage.createDisplayCase(userId, parsed.data);
      res.status(201).json(displayCase);
    } catch (error) {
      console.error("Error creating display case:", error);
      res.status(500).json({ message: "Failed to create display case" });
    }
  });

  // Create a display case from the user's top valued cards
  app.post("/api/display-cases/top-cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { limit = 12, name = "My Top Cards" } = req.body;
      
      // Check free tier limit
      const user = await storage.getUser(userId);
      if (user?.subscriptionStatus !== "PRO") {
        const caseCount = await storage.countDisplayCases(userId);
        if (caseCount >= 3) {
          return res.status(403).json({ 
            message: "Free tier limit reached. Upgrade to Pro for unlimited cases." 
          });
        }
      }

      // Get user's top valued cards (this method already filters by user ownership)
      const topCards = await storage.getTopValuedCards(userId, limit);
      
      if (topCards.length === 0) {
        return res.status(400).json({ 
          message: "No cards with values found. Add estimated values to your cards first." 
        });
      }

      // Create a new display case
      const displayCase = await storage.createDisplayCase(userId, {
        name,
        description: `Automatically generated showcase of my ${topCards.length} most valuable cards.`,
        isPublic: true,
        theme: "classic",
        showCardCount: true,
        showTotalValue: true,
      });

      // Copy the top cards to the new display case (cards are verified to belong to user via getTopValuedCards)
      const cardIds = topCards.map(c => c.id);
      await storage.copyCardsToDisplayCase(cardIds, displayCase.id);

      // Fetch the complete display case with the newly copied cards
      const completeCase = await storage.getDisplayCase(displayCase.id);
      
      res.status(201).json(completeCase);
    } catch (error) {
      console.error("Error creating top cards case:", error);
      res.status(500).json({ message: "Failed to create top cards case" });
    }
  });

  // Get user's unique tags from all their cards
  app.get("/api/tags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tags = await storage.getUserTags(userId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching user tags:", error);
      res.status(500).json({ message: "Failed to fetch tags" });
    }
  });

  // Check for duplicate cards by title (for duplicate detection)
  app.get("/api/cards/duplicates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title, excludeId } = req.query;
      
      if (!title || typeof title !== 'string' || title.length < 3) {
        return res.json([]);
      }
      
      const duplicates = await storage.findDuplicateCards(userId, title, excludeId ? Number(excludeId) : undefined);
      res.json(duplicates);
    } catch (error) {
      console.error("Error checking for duplicates:", error);
      res.status(500).json({ message: "Failed to check for duplicates" });
    }
  });

  // Create a display case from cards with a specific tag
  app.post("/api/display-cases/from-tag", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tag, name } = req.body;
      
      if (!tag || typeof tag !== 'string') {
        return res.status(400).json({ message: "Tag is required" });
      }
      
      // Check free tier limit
      const user = await storage.getUser(userId);
      if (user?.subscriptionStatus !== "PRO") {
        const caseCount = await storage.countDisplayCases(userId);
        if (caseCount >= 3) {
          return res.status(403).json({ 
            message: "Free tier limit reached. Upgrade to Pro for unlimited cases." 
          });
        }
      }

      // Get user's cards with this tag
      const taggedCards = await storage.getCardsByTag(userId, tag);
      
      if (taggedCards.length === 0) {
        return res.status(400).json({ 
          message: `No cards found with tag "${tag}".` 
        });
      }

      // Create a new display case
      const displayCase = await storage.createDisplayCase(userId, {
        name: name || `${tag} Collection`,
        description: `Collection of ${taggedCards.length} cards tagged with "${tag}".`,
        isPublic: true,
        theme: "classic",
        showCardCount: true,
        showTotalValue: true,
      });

      // Copy the tagged cards to the new display case
      const cardIds = taggedCards.map(c => c.id);
      await storage.copyCardsToDisplayCase(cardIds, displayCase.id);

      // Fetch the complete display case with the newly copied cards
      const completeCase = await storage.getDisplayCase(displayCase.id);
      
      res.status(201).json(completeCase);
    } catch (error) {
      console.error("Error creating case from tag:", error);
      res.status(500).json({ message: "Failed to create case from tag" });
    }
  });

  app.patch("/api/display-cases/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(id, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      const parsed = insertDisplayCaseSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const displayCase = await storage.updateDisplayCase(id, parsed.data);
      res.json(displayCase);
    } catch (error) {
      console.error("Error updating display case:", error);
      res.status(500).json({ message: "Failed to update display case" });
    }
  });

  app.delete("/api/display-cases/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(id, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      await storage.deleteDisplayCase(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting display case:", error);
      res.status(500).json({ message: "Failed to delete display case" });
    }
  });

  // Get all user cards across all display cases
  app.get("/api/cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cards = await storage.getAllUserCards(userId);
      res.json(cards);
    } catch (error) {
      console.error("Error fetching user cards:", error);
      res.status(500).json({ message: "Failed to fetch cards" });
    }
  });

  // Copy cards to a display case
  app.post("/api/display-cases/:id/copy-cards", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { cardIds } = req.body;

      if (isNaN(displayCaseId)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      if (!Array.isArray(cardIds) || cardIds.length === 0) {
        return res.status(400).json({ message: "No cards selected" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(displayCaseId, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      // Verify user owns all the cards they're trying to copy
      const userCards = await storage.getAllUserCards(userId);
      const userCardIds = new Set(userCards.map(c => c.id));
      const invalidCardIds = cardIds.filter((id: number) => !userCardIds.has(id));
      if (invalidCardIds.length > 0) {
        return res.status(403).json({ message: "You can only copy cards from your own collection" });
      }

      const copiedCards = await storage.copyCardsToDisplayCase(cardIds, displayCaseId);
      res.status(201).json(copiedCards);
    } catch (error) {
      console.error("Error copying cards:", error);
      res.status(500).json({ message: "Failed to copy cards" });
    }
  });

  // Cards routes
  app.post("/api/display-cases/:id/cards", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(displayCaseId)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(displayCaseId, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      // Map frontend careerStage field to legacyTier for storage
      // The inferCareerStage function reads from legacyTier
      const { careerStage, ...restBody } = req.body;
      const cardData = {
        ...restBody,
        // Always include legacyTier (set to careerStage value or preserve existing/null)
        legacyTier: careerStage || restBody.legacyTier || null,
      };

      const parsed = insertCardSchema.safeParse(cardData);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const card = await storage.createCard(displayCaseId, parsed.data);
      res.status(201).json(card);
    } catch (error) {
      console.error("Error creating card:", error);
      res.status(500).json({ message: "Failed to create card" });
    }
  });

  app.delete("/api/display-cases/:id/cards/:cardId", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.id);
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;

      if (isNaN(displayCaseId) || isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(displayCaseId, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      const card = await storage.getCard(cardId);
      if (!card || card.displayCaseId !== displayCaseId) {
        return res.status(404).json({ message: "Card not found" });
      }

      await storage.deleteCard(cardId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting card:", error);
      res.status(500).json({ message: "Failed to delete card" });
    }
  });

  app.patch("/api/display-cases/:displayCaseId/cards/:cardId", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.displayCaseId);
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;

      if (isNaN(displayCaseId) || isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid IDs" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(displayCaseId, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      const card = await storage.getCard(cardId);
      if (!card || card.displayCaseId !== displayCaseId) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Map frontend careerStage field to legacyTier for storage
      const { careerStage, ...restBody } = req.body;
      const updateData = {
        ...restBody,
        // If careerStage is explicitly provided, update legacyTier
        ...(careerStage !== undefined ? { legacyTier: careerStage || null } : {}),
      };

      const updatedCard = await storage.updateCard(cardId, updateData);
      res.json(updatedCard);
    } catch (error) {
      console.error("Error updating card:", error);
      res.status(500).json({ message: "Failed to update card" });
    }
  });

  app.post("/api/display-cases/:displayCaseId/cards/reorder", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.displayCaseId);
      const userId = req.user.claims.sub;
      const { cardIds } = req.body;

      if (isNaN(displayCaseId)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      if (!Array.isArray(cardIds)) {
        return res.status(400).json({ message: "cardIds must be an array" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(displayCaseId, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      await storage.reorderCards(displayCaseId, cardIds);
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering cards:", error);
      res.status(500).json({ message: "Failed to reorder cards" });
    }
  });

  // Price lookup for a single card (Pro feature)
  app.post("/api/cards/:cardId/lookup-price", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;

      // Check if user has Pro subscription
      const user = await storage.getUser(userId);
      if (user?.subscriptionStatus !== "PRO") {
        return res.status(403).json({ 
          message: "AI price lookup is a Pro feature. Upgrade to Pro to automatically refresh card values from eBay." 
        });
      }

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Verify user owns this card via the display case
      const displayCase = await storage.getDisplayCaseByIdAndUser(card.displayCaseId, userId);
      if (!displayCase) {
        return res.status(403).json({ message: "You don't have permission to update this card" });
      }

      const result = await lookupCardPrice({
        title: card.title,
        set: card.set,
        year: card.year,
        variation: card.variation,
        grade: card.grade,
      });

      // If we got a value, update the card
      if (result.estimatedValue !== null) {
        await storage.updateCard(cardId, { estimatedValue: result.estimatedValue });
      }

      res.json({
        ...result,
        cardId,
        updated: result.estimatedValue !== null,
      });
    } catch (error) {
      console.error("Error looking up card price:", error);
      res.status(500).json({ message: "Failed to lookup card price" });
    }
  });

  // Bulk price lookup for all cards in a display case (Pro feature)
  app.post("/api/display-cases/:id/refresh-prices", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      // Check if user has Pro subscription
      const user = await storage.getUser(userId);
      if (user?.subscriptionStatus !== "PRO") {
        return res.status(403).json({ 
          message: "AI price lookup is a Pro feature. Upgrade to Pro to automatically refresh card values from eBay." 
        });
      }

      if (isNaN(displayCaseId)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCaseByIdAndUser(displayCaseId, userId);
      if (!displayCase) {
        return res.status(404).json({ message: "Display case not found" });
      }

      const fullCase = await storage.getDisplayCase(displayCaseId);
      if (!fullCase?.cards || fullCase.cards.length === 0) {
        return res.status(400).json({ message: "No cards in this display case" });
      }

      const results: Array<{ cardId: number; title: string; oldValue: number | null; newValue: number | null; confidence: string; details?: string }> = [];

      for (const card of fullCase.cards) {
        try {
          // Add delay between requests to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1500));

          const result = await lookupCardPrice({
            title: card.title,
            set: card.set,
            year: card.year,
            variation: card.variation,
            grade: card.grade,
          });

          const oldValue = card.estimatedValue;
          let newValue = oldValue;

          if (result.estimatedValue !== null) {
            await storage.updateCard(card.id, { estimatedValue: result.estimatedValue });
            newValue = result.estimatedValue;
          }

          results.push({
            cardId: card.id,
            title: card.title,
            oldValue,
            newValue,
            confidence: result.confidence,
            details: result.details,
          });
        } catch (cardError) {
          console.error(`Failed to lookup price for card ${card.id}:`, cardError);
          results.push({
            cardId: card.id,
            title: card.title,
            oldValue: card.estimatedValue,
            newValue: card.estimatedValue,
            confidence: "low",
            details: "Lookup failed",
          });
        }
      }

      res.json({
        displayCaseId,
        cardsProcessed: results.length,
        results,
      });
    } catch (error) {
      console.error("Error refreshing prices:", error);
      res.status(500).json({ message: "Failed to refresh prices" });
    }
  });

  // Card Outlook AI - Generate investment-style outlook for a card (Pro feature)
  app.post("/api/cards/:cardId/outlook", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;
      const { timeHorizonMonths = 12 } = req.body;

      // Check if user has Pro subscription
      const user = await storage.getUser(userId);
      if (user?.subscriptionStatus !== "PRO") {
        return res.status(403).json({ 
          message: "Card Outlook AI is a Pro feature. Upgrade to Pro to get investment-grade insights on your cards." 
        });
      }

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Verify user owns this card via the display case
      const displayCase = await storage.getDisplayCaseByIdAndUser(card.displayCaseId, userId);
      if (!displayCase) {
        return res.status(403).json({ message: "You don't have permission to analyze this card" });
      }

      // First, infer any missing metadata using AI
      const inferredMetadata = await inferCardMetadata(card);
      
      // Save inferred metadata to the card if any fields were updated
      const metadataUpdates: Record<string, any> = {};
      if (inferredMetadata.playerName && !card.playerName) metadataUpdates.playerName = inferredMetadata.playerName;
      if (inferredMetadata.sport && !card.sport) metadataUpdates.sport = inferredMetadata.sport;
      if (inferredMetadata.position && !card.position) metadataUpdates.position = inferredMetadata.position;
      if (inferredMetadata.legacyTier && !card.legacyTier) metadataUpdates.legacyTier = inferredMetadata.legacyTier;
      if (inferredMetadata.isRookie !== null && card.isRookie === null) metadataUpdates.isRookie = inferredMetadata.isRookie;
      if (inferredMetadata.hasAuto !== null && card.hasAuto === null) metadataUpdates.hasAuto = inferredMetadata.hasAuto;
      if (inferredMetadata.isNumbered !== null && card.isNumbered === null) metadataUpdates.isNumbered = inferredMetadata.isNumbered;
      if (inferredMetadata.serialNumber && !card.serialNumber) metadataUpdates.serialNumber = inferredMetadata.serialNumber;
      if (inferredMetadata.grader && !card.grader) metadataUpdates.grader = inferredMetadata.grader;
      
      // Update card with inferred metadata if we have any
      if (Object.keys(metadataUpdates).length > 0) {
        await storage.updateCard(cardId, metadataUpdates);
      }
      
      // Create enriched card object for outlook generation
      const enrichedCard = {
        ...card,
        playerName: inferredMetadata.playerName || card.playerName,
        sport: inferredMetadata.sport || card.sport,
        position: inferredMetadata.position || card.position,
        legacyTier: inferredMetadata.legacyTier || card.legacyTier,
        isRookie: inferredMetadata.isRookie ?? card.isRookie,
        hasAuto: inferredMetadata.hasAuto ?? card.hasAuto,
        isNumbered: inferredMetadata.isNumbered ?? card.isNumbered,
        serialNumber: inferredMetadata.serialNumber || card.serialNumber,
        grader: inferredMetadata.grader || card.grader,
      };

      // Generate the full outlook with AI explanation using enriched data
      const outlook = await generateCardOutlook(enrichedCard, timeHorizonMonths);

      // Cache the outlook data on the card
      await storage.updateCardOutlook(cardId, {
        outlookAction: outlook.action,
        outlookUpsideScore: outlook.upsideScore,
        outlookRiskScore: outlook.riskScore,
        outlookConfidenceScore: outlook.confidenceScore,
        outlookExplanationShort: outlook.explanation.short,
        outlookExplanationLong: outlook.explanation.long,
        outlookGeneratedAt: new Date(),
      });

      res.json(outlook);
    } catch (error) {
      console.error("Error generating card outlook:", error);
      res.status(500).json({ message: "Failed to generate card outlook" });
    }
  });

  // Get quick outlook (no AI, just scores) for a card - available for all users
  app.get("/api/cards/:cardId/quick-outlook", async (req, res) => {
    try {
      const cardId = parseInt(req.params.cardId);

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Check if we have cached outlook data
      if (card.outlookAction && card.outlookGeneratedAt) {
        const hoursSinceGenerated = (Date.now() - new Date(card.outlookGeneratedAt).getTime()) / (1000 * 60 * 60);
        // Use cached data if less than 24 hours old
        if (hoursSinceGenerated < 24) {
          // Derive new metrics from legacy riskScore if not available
          const legacyRisk = card.outlookRiskScore || 50;
          return res.json({
            cardId: card.id,
            action: card.outlookAction,
            upsideScore: card.outlookUpsideScore,
            downsideRisk: Math.round(legacyRisk * 0.6),
            marketFriction: Math.round(legacyRisk * 0.4),
            confidenceScore: card.outlookConfidenceScore,
            cached: true,
            cachedAt: card.outlookGeneratedAt,
          });
        }
      }

      // Generate quick outlook without AI explanation
      const quickOutlook = generateQuickOutlook(card);

      // Convert legacy riskScore to new metrics
      res.json({
        cardId: card.id,
        action: quickOutlook.action,
        upsideScore: quickOutlook.upsideScore,
        downsideRisk: Math.round(quickOutlook.riskScore * 0.6),
        marketFriction: Math.round(quickOutlook.riskScore * 0.4),
        confidenceScore: quickOutlook.confidenceScore,
        cached: false,
      });
    } catch (error) {
      console.error("Error getting quick outlook:", error);
      res.status(500).json({ message: "Failed to get card outlook" });
    }
  });

  // Get cached outlook for a card (for display in UI without regenerating)
  // Scores are public, but explanations require Pro subscription
  app.get("/api/cards/:cardId/outlook", async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user?.claims?.sub;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Check if user has Pro access for explanations
      let isPro = false;
      if (userId) {
        const user = await storage.getUser(userId);
        isPro = user?.subscriptionStatus === "PRO";
      }

      // Return cached outlook if available
      if (card.outlookAction && card.outlookGeneratedAt) {
        // Use the stored riskScore directly for backward compatibility
        const legacyRisk = card.outlookRiskScore || 50;
        return res.json({
          cardId: card.id,
          playerName: card.playerName,
          sport: card.sport,
          position: card.position,
          action: card.outlookAction,
          upsideScore: card.outlookUpsideScore,
          riskScore: legacyRisk, // Frontend expects riskScore
          downsideRisk: Math.round(legacyRisk * 0.6),
          marketFriction: Math.round(legacyRisk * 0.4),
          confidenceScore: card.outlookConfidenceScore,
          explanation: isPro ? {
            short: card.outlookExplanationShort,
            long: card.outlookExplanationLong,
          } : null,
          generatedAt: card.outlookGeneratedAt,
          cached: true,
          proRequired: !isPro,
        });
      }

      // No cached data, return quick outlook with converted metrics
      const quickOutlook = generateQuickOutlook(card);
      res.json({
        cardId: card.id,
        playerName: card.playerName,
        sport: card.sport,
        position: card.position,
        action: quickOutlook.action,
        upsideScore: quickOutlook.upsideScore,
        riskScore: quickOutlook.riskScore, // Frontend expects riskScore
        downsideRisk: Math.round(quickOutlook.riskScore * 0.6),
        marketFriction: Math.round(quickOutlook.riskScore * 0.4),
        confidenceScore: quickOutlook.confidenceScore,
        explanation: null,
        generatedAt: null,
        cached: false,
        proRequired: true,
      });
    } catch (error) {
      console.error("Error getting card outlook:", error);
      res.status(500).json({ message: "Failed to get card outlook" });
    }
  });

  // Update card lifecycle tier (career stage) override - Pro feature
  app.patch("/api/cards/:cardId/lifecycle", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;
      const { legacyTier } = req.body;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const validTiers = ["PROSPECT", "RISING_STAR", "STAR", "SUPERSTAR", "AGING_VET", "RETIRED", "HOF", "LEGEND_DECEASED"];
      if (!legacyTier || !validTiers.includes(legacyTier)) {
        return res.status(400).json({ message: "Invalid legacy tier", validTiers });
      }

      // Check user is Pro
      const user = await storage.getUser(userId);
      if (!user || user.subscriptionStatus !== "PRO") {
        return res.status(403).json({ message: "Pro subscription required" });
      }

      // Verify the user owns the card
      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      const displayCase = await storage.getDisplayCase(card.displayCaseId);
      if (!displayCase || displayCase.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to modify this card" });
      }

      // Update the card's legacy tier
      const updatedCard = await storage.updateCard(cardId, { legacyTier });

      // Clear cached outlook so it gets regenerated with new tier
      await storage.updateCardOutlook(cardId, {
        outlookAction: null,
        outlookUpsideScore: null,
        outlookRiskScore: null,
        outlookConfidenceScore: null,
        outlookExplanationShort: null,
        outlookExplanationLong: null,
        outlookGeneratedAt: null,
      });

      res.json({ 
        success: true, 
        legacyTier: updatedCard?.legacyTier,
        message: "Career stage updated. Regenerate outlook to see updated scores."
      });
    } catch (error) {
      console.error("Error updating card lifecycle:", error);
      res.status(500).json({ message: "Failed to update card lifecycle" });
    }
  });

  // ============================================
  // Card Outlook AI 2.0 - Deterministic Signal-Based Analysis
  // "AI should explain, not decide"
  // ============================================

  // Generate full AI 2.0 outlook for a card (Pro feature)
  app.post("/api/cards/:cardId/outlook-v2", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;

      // Check subscription - free users get 3 analyses per month
      const user = await storage.getUser(userId);
      const isPro = user?.subscriptionStatus === "PRO";
      const FREE_TIER_LIMIT = 3;
      
      if (!isPro) {
        // Check per-user rate limit (prevent abuse)
        const rateCheck = checkFreeUserRateLimit(userId);
        if (!rateCheck.allowed) {
          return res.status(429).json({ 
            message: `Please wait ${rateCheck.retryAfter} seconds before your next lookup.`,
            rateLimited: true,
            retryAfter: rateCheck.retryAfter
          });
        }
        
        // Check global daily cap (cost control)
        const globalDailyCount = await storage.countDailyFreeUserOutlookGenerations();
        if (globalDailyCount >= FREE_USER_DAILY_GLOBAL_CAP) {
          return res.status(503).json({ 
            message: "Free lookups are temporarily unavailable due to high demand. Please try again tomorrow or upgrade to Pro for unlimited access.",
            dailyCapReached: true
          });
        }
        
        // Check per-user monthly limit
        const monthlyCount = await storage.countUserMonthlyOutlookGenerations(userId);
        if (monthlyCount >= FREE_TIER_LIMIT) {
          return res.status(403).json({ 
            message: `You've used all ${FREE_TIER_LIMIT} free Market Outlook analyses this month. Upgrade to Pro for unlimited analyses.`,
            usageExceeded: true,
            used: monthlyCount,
            limit: FREE_TIER_LIMIT
          });
        }
        
        // Record rate limit timestamp
        recordFreeUserLookup(userId);
      }

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Verify user owns this card
      const displayCase = await storage.getDisplayCaseByIdAndUser(card.displayCaseId, userId);
      if (!displayCase) {
        return res.status(403).json({ message: "You don't have permission to analyze this card" });
      }

      // Import the outlook engine dynamically to avoid circular dependencies
      const { computeAllSignals, generateOutlookExplanation, fetchPlayerNews } = await import("./outlookEngine");
      const { lookupEnhancedCardPrice, filterPriceOutliers } = await import("./priceService");

      // First, get enhanced price data with individual price points
      console.log(`[Outlook 2.0] Fetching enhanced price data for card ${cardId}`);
      const priceData = await lookupEnhancedCardPrice({
        title: card.title,
        set: card.set,
        year: card.year,
        variation: card.variation,
        grade: card.grade,
        grader: card.grader,
      });

      // Convert price points to the schema format
      const pricePointsForSchema = priceData.pricePoints.map(pp => ({
        date: pp.date,
        price: pp.price,
        source: pp.source,
        url: pp.url,
      }));

      // Filter outliers to get tighter price range
      const filteredPriceData = filterPriceOutliers(priceData.pricePoints);

      // Compute all signals using deterministic engine
      console.log(`[Outlook 2.0] Computing signals for card ${cardId}`);
      const signals = computeAllSignals(card, priceData.pricePoints, priceData.estimatedValue);
      
      // Get match confidence from price data
      const matchConfidence = priceData.matchConfidence;
      
      // Override action to MONITOR if match confidence is LOW
      let finalAction = signals.action;
      let finalActionReasons = [...signals.actionReasons];
      if (matchConfidence && matchConfidence.tier === "LOW") {
        finalAction = "MONITOR";
        finalActionReasons = [`Low card match confidence: ${matchConfidence.reason}`, ...finalActionReasons];
      }

      // Fetch real-time player news for current context (sports cards only)
      let newsSnippets: string[] = [];
      if (card.cardCategory === "sports" && card.playerName) {
        console.log(`[Outlook 2.0] Fetching real-time news for ${card.playerName}`);
        const newsData = await fetchPlayerNews(card.playerName, card.sport);
        newsSnippets = newsData.snippets;
      }

      // Generate AI explanation (AI explains, doesn't decide)
      console.log(`[Outlook 2.0] Generating AI explanation for ${finalAction}`);
      const signalsForExplanation = { ...signals, action: finalAction, actionReasons: finalActionReasons };
      const explanation = await generateOutlookExplanation(card, signalsForExplanation, priceData.pricePoints, priceData.estimatedValue, newsSnippets);

      // Store outlook in the new card_outlooks table (use filtered min/max for tighter range)
      const outlookData = {
        cardId,
        pricePoints: pricePointsForSchema,
        marketValue: priceData.estimatedValue ? Math.round(priceData.estimatedValue * 100) : null, // Store in cents
        priceMin: filteredPriceData.min ? Math.round(filteredPriceData.min * 100) : null,
        priceMax: filteredPriceData.max ? Math.round(filteredPriceData.max * 100) : null,
        compCount: priceData.salesFound,
        trendScore: signals.trendScore,
        liquidityScore: signals.liquidityScore,
        volatilityScore: signals.volatilityScore,
        sportScore: signals.sportScore,
        positionScore: signals.positionScore,
        cardTypeScore: signals.cardTypeScore,
        demandScore: signals.demandScore,
        momentumScore: signals.momentumScore,
        qualityScore: signals.qualityScore,
        upsideScore: signals.upsideScore,
        downsideRisk: signals.downsideRisk,
        marketFriction: signals.marketFriction,
        action: finalAction,
        actionReasons: finalActionReasons,
        careerStageAuto: signals.careerStageAuto,
        dataConfidence: signals.dataConfidence,
        confidenceReason: signals.confidenceReason,
        explanationShort: explanation.short,
        explanationLong: explanation.long,
        explanationBullets: explanation.bullets,
        bigMoverFlag: signals.bigMoverFlag,
        bigMoverReason: signals.bigMoverReason,
      };

      await storage.upsertCardOutlook(cardId, outlookData);

      // Record usage for free tier tracking
      await storage.recordOutlookUsage(userId, 'collection', cardId, card.title);

      // Also update the card's estimated value and Big Mover status
      const cardUpdate: any = {
        outlookBigMover: signals.bigMoverFlag,
        outlookBigMoverReason: signals.bigMoverReason,
      };
      if (priceData.estimatedValue) {
        cardUpdate.estimatedValue = priceData.estimatedValue;
      }
      await storage.updateCard(cardId, cardUpdate);

      // Return the full outlook
      res.json({
        cardId,
        card: {
          id: card.id,
          title: card.title,
          playerName: card.playerName,
          sport: card.sport,
          position: card.position,
          grade: card.grade,
          year: card.year,
          set: card.set,
          variation: card.variation,
        },
        market: {
          value: priceData.estimatedValue,
          min: filteredPriceData.min,
          max: filteredPriceData.max,
          compCount: priceData.salesFound,
          pricePoints: priceData.pricePoints,
        },
        signals: {
          trend: signals.trendScore,
          liquidity: signals.liquidityScore,
          volatility: signals.volatilityScore,
          sport: signals.sportScore,
          position: signals.positionScore,
          cardType: signals.cardTypeScore,
          demand: signals.demandScore,
          momentum: signals.momentumScore,
          quality: signals.qualityScore,
          upside: signals.upsideScore,
          downsideRisk: signals.downsideRisk,
          marketFriction: signals.marketFriction,
        },
        action: finalAction,
        actionReasons: finalActionReasons,
        careerStage: signals.careerStageAuto,
        confidence: {
          level: signals.dataConfidence,
          reason: signals.confidenceReason,
        },
        matchConfidence: matchConfidence || null,
        explanation: {
          short: explanation.short,
          long: explanation.long,
          bullets: explanation.bullets,
        },
        bigMover: {
          flag: signals.bigMoverFlag,
          reason: signals.bigMoverReason,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error generating outlook v2:", error);
      res.status(500).json({ message: "Failed to generate card outlook" });
    }
  });

  // Get cached AI 2.0 outlook for a card
  app.get("/api/cards/:cardId/outlook-v2", async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user?.claims?.sub;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Check if user is Pro for full explanation
      let isPro = false;
      if (userId) {
        const user = await storage.getUser(userId);
        isPro = user?.subscriptionStatus === "PRO";
      }

      // Get cached outlook from card_outlooks table
      const outlook = await storage.getCardOutlook(cardId);
      
      if (outlook) {
        const hoursSinceGenerated = outlook.updatedAt 
          ? (Date.now() - new Date(outlook.updatedAt).getTime()) / (1000 * 60 * 60)
          : 999;
        
        return res.json({
          cardId,
          card: {
            id: card.id,
            title: card.title,
            playerName: card.playerName,
            sport: card.sport,
            position: card.position,
            grade: card.grade,
            year: card.year,
            set: card.set,
            variation: card.variation,
            imagePath: card.imagePath,
          },
          market: {
            value: outlook.marketValue ? outlook.marketValue / 100 : null,
            min: outlook.priceMin ? outlook.priceMin / 100 : null,
            max: outlook.priceMax ? outlook.priceMax / 100 : null,
            compCount: outlook.compCount,
            pricePoints: isPro ? outlook.pricePoints : null,
          },
          signals: isPro ? {
            trend: outlook.trendScore,
            liquidity: outlook.liquidityScore,
            volatility: outlook.volatilityScore,
            sport: outlook.sportScore,
            position: outlook.positionScore,
            cardType: outlook.cardTypeScore,
            demand: outlook.demandScore,
            momentum: outlook.momentumScore,
            quality: outlook.qualityScore,
            upside: outlook.upsideScore,
            downsideRisk: outlook.downsideRisk,
            marketFriction: outlook.marketFriction,
          } : {
            upside: outlook.upsideScore,
            downsideRisk: outlook.downsideRisk,
            marketFriction: outlook.marketFriction,
          },
          action: outlook.action,
          actionReasons: isPro ? outlook.actionReasons : null,
          careerStage: outlook.careerStageAuto,
          confidence: {
            level: outlook.dataConfidence,
            reason: isPro ? outlook.confidenceReason : null,
          },
          explanation: isPro ? {
            short: outlook.explanationShort,
            long: outlook.explanationLong,
            bullets: outlook.explanationBullets,
          } : {
            short: outlook.explanationShort,
            long: null,
            bullets: null,
          },
          bigMover: {
            flag: outlook.bigMoverFlag ?? false,
            reason: isPro ? outlook.bigMoverReason : null,
          },
          generatedAt: outlook.updatedAt,
          cached: true,
          stale: hoursSinceGenerated > 168, // Stale after 7 days
          proRequired: !isPro,
        });
      }

      // No cached data - return minimal info
      res.json({
        cardId,
        card: {
          id: card.id,
          title: card.title,
          playerName: card.playerName,
          sport: card.sport,
          position: card.position,
          year: card.year,
          set: card.set,
          variation: card.variation,
          grade: card.grade,
          imagePath: card.imagePath,
        },
        cached: false,
        needsGeneration: true,
        proRequired: !isPro,
      });
    } catch (error) {
      console.error("Error getting outlook v2:", error);
      res.status(500).json({ message: "Failed to get card outlook" });
    }
  });

  // One-off card analysis - analyze a card without adding to collection
  // Returns analysis that can optionally be saved to a display case
  app.post("/api/outlook/quick-analyze", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title, year, set, cardNumber, variation, grade, grader, imagePath } = req.body;

      if (!title) {
        return res.status(400).json({ message: "Card title is required" });
      }

      // Check subscription - free users get 3 analyses per month
      const user = await storage.getUser(userId);
      const isPro = user?.subscriptionStatus === "PRO";
      const FREE_TIER_LIMIT = 3;
      
      if (!isPro) {
        // Check per-user rate limit (prevent abuse)
        const rateCheck = checkFreeUserRateLimit(userId);
        if (!rateCheck.allowed) {
          return res.status(429).json({ 
            message: `Please wait ${rateCheck.retryAfter} seconds before your next lookup.`,
            rateLimited: true,
            retryAfter: rateCheck.retryAfter
          });
        }
        
        // Check global daily cap (cost control)
        const globalDailyCount = await storage.countDailyFreeUserOutlookGenerations();
        if (globalDailyCount >= FREE_USER_DAILY_GLOBAL_CAP) {
          return res.status(503).json({ 
            message: "Free lookups are temporarily unavailable due to high demand. Please try again tomorrow or upgrade to Pro for unlimited access.",
            dailyCapReached: true
          });
        }
        
        // Check per-user monthly limit
        const monthlyCount = await storage.countUserMonthlyOutlookGenerations(userId);
        if (monthlyCount >= FREE_TIER_LIMIT) {
          return res.status(403).json({ 
            message: `You've used all ${FREE_TIER_LIMIT} free Market Outlook analyses this month. Upgrade to Pro for unlimited analyses.`,
            usageExceeded: true,
            used: monthlyCount,
            limit: FREE_TIER_LIMIT
          });
        }
        
        // Record rate limit timestamp
        recordFreeUserLookup(userId);
      }

      // Create a temporary card object for the analysis
      const tempCard = {
        id: 0,
        displayCaseId: 0,
        title,
        year: year ? parseInt(year) : null,
        set: set || null,
        cardNumber: cardNumber || null,
        variation: variation || null,
        grade: grade || null,
        grader: grader || null,
        imagePath: imagePath || null,
        purchasePrice: null,
        estimatedValue: null,
        previousValue: null,
        valueUpdatedAt: null,
        notes: null,
        tags: null,
        sortOrder: 0,
        openToOffers: false,
        minOfferAmount: null,
        createdAt: new Date(),
        cardCategory: "sports" as const,
        sport: null,
        position: null,
        playerName: null,
        isRookie: false,
        isNumbered: false,
        serialNumber: null,
        hasAuto: false,
        insertTier: null,
        legacyTier: null,
        playerAge: null,
        injuryRisk: null,
        teamMarketSize: null,
        salesLast30Days: null,
        avgSalePrice30: null,
        avgSalePrice90: null,
        priceStdDevPct: null,
        characterTier: null,
        rarityTier: null,
        eraPrestige: null,
        franchiseHeat: null,
        outlookAction: null,
        outlookUpsideScore: null,
        outlookRiskScore: null,
        outlookConfidenceScore: null,
        outlookExplanationShort: null,
        outlookExplanationLong: null,
        outlookGeneratedAt: null,
        outlookBigMover: false,
        outlookBigMoverReason: null,
      };

      // Import the outlook engine dynamically
      const { computeAllSignals, generateOutlookExplanation, fetchPlayerNews } = await import("./outlookEngine");
      const { lookupEnhancedCardPrice, filterPriceOutliers } = await import("./priceService");

      // Fetch enhanced price data
      console.log(`[Quick Analyze] Fetching price data for: ${title}`);
      const priceData = await lookupEnhancedCardPrice({
        title,
        set: set || undefined,
        year: year ? parseInt(year) : undefined,
        variation: variation || undefined,
        grade: grade || undefined,
        grader: grader || undefined,
      });

      // Filter outliers to get tighter price range
      const filteredPriceData = filterPriceOutliers(priceData.pricePoints);

      // Check for eBay comps data with stale-while-revalidate pattern
      const { normalizeEbayQuery, getCachedCompsWithSWR, getCacheEntry, enqueueFetchJob } = await import("./ebayCompsService");
      
      // Build query for comps lookup
      const compsQueryParts = [title];
      if (year) compsQueryParts.unshift(String(year));
      if (set) compsQueryParts.push(set);
      if (variation) compsQueryParts.push(variation);
      if (grade && grader) compsQueryParts.push(`${grader} ${grade}`);
      
      const compsQueryInput = compsQueryParts.join(" ");
      const normalized = normalizeEbayQuery(compsQueryInput);
      
      // Check for cached eBay comps using SWR pattern (serves stale, refreshes in background)
      let ebayComps: any = null;
      let ebayCompsStatus: "hit" | "stale" | "complete" | "queued" | "fetching" | "failed" | "blocked" = "queued";
      let ebayCompsSource: "EBAY_SOLD" | "SERPER" | "MIXED" = "SERPER"; // Fallback source
      
      try {
        // Use SWR pattern - returns stale data while triggering background refresh
        const swrResult = await getCachedCompsWithSWR(
          normalized.queryHash, 
          normalized.canonicalQuery, 
          normalized.filters
        );
        
        if (swrResult.data && (swrResult.data.fetchStatus === "complete" || swrResult.data.compsJson)) {
          ebayCompsStatus = swrResult.isStale ? "stale" : "hit";
          ebayCompsSource = "EBAY_SOLD";
          ebayComps = {
            queryHash: swrResult.data.queryHash,
            confidence: swrResult.data.confidence,
            soldCount: swrResult.data.soldCount,
            summary: swrResult.data.summaryJson,
            lastFetchedAt: swrResult.data.lastFetchedAt,
            pagesScraped: swrResult.data.pagesScraped,
            itemsFound: swrResult.data.itemsFound,
            itemsKept: swrResult.data.itemsKept,
            isStale: swrResult.isStale,
            refreshing: swrResult.needsRefresh,
          };
          console.log(`[Quick Analyze] eBay comps cache ${swrResult.isStale ? "stale" : "fresh"} hit: ${swrResult.data.soldCount} comps`);
        } else {
          // Check if already fetching or has other status
          const entry = await getCacheEntry(normalized.queryHash);
          
          if (entry?.fetchStatus === "fetching") {
            ebayCompsStatus = "fetching";
          } else if (entry?.fetchStatus === "blocked") {
            ebayCompsStatus = "blocked";
            ebayCompsSource = "SERPER"; // Fall back to Serper
            console.log(`[Quick Analyze] eBay comps blocked, using fallback`);
          } else if (entry?.fetchStatus === "failed") {
            ebayCompsStatus = "failed";
            ebayCompsSource = "SERPER"; // Fall back to Serper
          } else {
            // Enqueue a fetch job for background scraping
            console.log(`[Quick Analyze] Enqueuing eBay comps fetch for: ${normalized.canonicalQuery}`);
            await enqueueFetchJob(normalized.canonicalQuery, normalized.queryHash, normalized.filters);
            ebayCompsStatus = "queued";
          }
        }
      } catch (err) {
        console.error("[Quick Analyze] Error checking eBay comps:", err);
        ebayCompsStatus = "failed";
      }

      // Compute signals
      console.log(`[Quick Analyze] Computing signals`);
      const signals = computeAllSignals(tempCard as any, priceData.pricePoints, priceData.estimatedValue);
      
      // Get match confidence from price data
      const matchConfidence = priceData.matchConfidence;
      
      // Override action to MONITOR if match confidence is LOW
      let finalAction = signals.action;
      let finalActionReasons = [...signals.actionReasons];
      if (matchConfidence && matchConfidence.tier === "LOW") {
        finalAction = "MONITOR";
        finalActionReasons = [`Low card match confidence: ${matchConfidence.reason}`, ...finalActionReasons];
      }

      // Attempt to extract player name from title for news lookup
      // Common formats: "2024 Prizm Cooper Flagg RC", "Cooper Flagg 2024 Topps Chrome"
      // We'll try to use the title as-is for the news search since player name isn't explicitly provided
      let newsSnippets: string[] = [];
      const possiblePlayerName = title; // Use full title for search - Serper will find relevant news
      console.log(`[Quick Analyze] Fetching real-time news for: ${possiblePlayerName}`);
      const newsData = await fetchPlayerNews(possiblePlayerName, null);
      newsSnippets = newsData.snippets;

      // Generate AI explanation
      console.log(`[Quick Analyze] Generating AI explanation for ${finalAction}`);
      const signalsForExplanation = { ...signals, action: finalAction, actionReasons: finalActionReasons };
      const explanation = await generateOutlookExplanation(tempCard as any, signalsForExplanation, priceData.pricePoints, priceData.estimatedValue, newsSnippets);

      // Record usage for free tier tracking
      await storage.recordOutlookUsage(userId, 'quick', undefined, title);

      // Return the analysis without saving
      res.json({
        tempCard: {
          title,
          year,
          set,
          variation,
          grade,
          grader,
          imagePath,
        },
        market: {
          value: priceData.estimatedValue,
          min: filteredPriceData.min,
          max: filteredPriceData.max,
          compCount: priceData.salesFound,
          pricePoints: isPro ? priceData.pricePoints : null,
          // Modeled estimates disabled - strict matching only
          modeledEstimate: null,
        },
        signals: isPro ? {
          trend: signals.trendScore,
          liquidity: signals.liquidityScore,
          volatility: signals.volatilityScore,
          sport: signals.sportScore,
          position: signals.positionScore,
          cardType: signals.cardTypeScore,
          demand: signals.demandScore,
          momentum: signals.momentumScore,
          quality: signals.qualityScore,
          upside: signals.upsideScore,
          downsideRisk: signals.downsideRisk,
          marketFriction: signals.marketFriction,
        } : {
          upside: signals.upsideScore,
          downsideRisk: signals.downsideRisk,
          marketFriction: signals.marketFriction,
        },
        action: finalAction,
        actionReasons: isPro ? finalActionReasons : null,
        careerStage: signals.careerStageAuto,
        confidence: {
          level: signals.dataConfidence,
          reason: isPro ? signals.confidenceReason : null,
        },
        matchConfidence: matchConfidence || null,
        explanation: {
          short: explanation.short,
          long: isPro ? explanation.long : null,
          bullets: isPro ? explanation.bullets : null,
        },
        bigMover: {
          flag: signals.bigMoverFlag,
          reason: isPro ? signals.bigMoverReason : null,
        },
        // Comps data - unified contract
        comps: {
          status: ebayCompsStatus,
          source: ebayCompsSource,
          soldCount: ebayComps?.soldCount ?? priceData.salesFound ?? 0,
          confidence: ebayComps?.confidence ?? (priceData.matchConfidence?.tier || "LOW"),
          summary: isPro && ebayComps?.summary ? {
            medianPrice: ebayComps.summary.medianPrice,
            meanPrice: ebayComps.summary.meanPrice,
            minPrice: ebayComps.summary.minPrice,
            maxPrice: ebayComps.summary.maxPrice,
            trendSeries: ebayComps.summary.trendSeries || [],
            trendSlope: ebayComps.summary.trendSlope || 0,
            volatility: ebayComps.summary.volatility,
            liquidity: ebayComps.summary.liquidity,
          } : {
            medianPrice: ebayComps?.summary?.medianPrice ?? priceData.estimatedValue,
            soldCount: ebayComps?.soldCount ?? priceData.salesFound ?? 0,
            trendSeries: [],
          },
          queryHash: normalized.queryHash,
          // Debug info (only for Pro)
          debug: isPro ? {
            canonicalQuery: normalized.canonicalQuery,
            pagesScraped: ebayComps?.pagesScraped ?? 0,
            itemsFound: ebayComps?.itemsFound ?? 0,
            itemsKept: ebayComps?.itemsKept ?? 0,
            lastFetchedAt: ebayComps?.lastFetchedAt ?? null,
          } : undefined,
          // User-friendly message based on status
          message: ebayCompsStatus === "queued" || ebayCompsStatus === "fetching"
            ? "Gathering more sold comps in the background..."
            : ebayCompsStatus === "blocked"
            ? "Using fallback comps (eBay limited right now)"
            : ebayCompsStatus === "failed"
            ? "Using fallback comps"
            : ebayCompsStatus === "hit"
            ? "Up to date"
            : ebayCompsStatus === "stale"
            ? "Updating in background..."
            : undefined,
        },
        generatedAt: new Date().toISOString(),
        isPro,
      });
    } catch (error) {
      console.error("Error in quick analyze:", error);
      res.status(500).json({ message: "Failed to analyze card" });
    }
  });

  // Match feedback endpoint - allows users to report incorrect price matches
  app.post("/api/outlook/match-feedback", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { cardId, cardTitle, sampleUrl, feedback, comment } = req.body;

      if (!feedback || !["correct", "incorrect"].includes(feedback)) {
        return res.status(400).json({ message: "Feedback must be 'correct' or 'incorrect'" });
      }

      // Log feedback for analysis (in production, store in database)
      console.log(`[Match Feedback] User ${userId}:`, {
        cardId,
        cardTitle,
        sampleUrl,
        feedback,
        comment,
        timestamp: new Date().toISOString(),
      });

      // For now, just acknowledge the feedback
      // In the future, this could be stored in a match_feedback table for ML training
      res.json({ 
        success: true, 
        message: "Thank you for your feedback. This helps improve our matching accuracy." 
      });
    } catch (error) {
      console.error("Error submitting match feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // ============================================================================
  // Player Outlook V2 - Player-First Market Intelligence
  // ============================================================================

  // Get player image from Wikipedia
  app.get("/api/player-image", async (req, res) => {
    try {
      const { name, sport } = req.query;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Player name is required" });
      }

      // Build Wikipedia search query with sport context for disambiguation
      const sportContext = sport ? ` ${sport}` : "";
      const searchTerm = `${name}${sportContext}`;
      
      // Use Wikipedia API to get page and image
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json&origin=*`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      
      if (!searchData.query?.search?.length) {
        return res.json({ imageUrl: null });
      }

      const pageTitle = searchData.query.search[0].title;
      
      // Get page images
      const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&format=json&pithumbsize=200&origin=*`;
      const imageRes = await fetch(imageUrl);
      const imageData = await imageRes.json();
      
      const pages = imageData.query?.pages;
      if (!pages) {
        return res.json({ imageUrl: null });
      }

      const page = Object.values(pages)[0] as any;
      const thumbnail = page?.thumbnail?.source;

      res.json({ imageUrl: thumbnail || null, pageTitle });
    } catch (error) {
      console.error("Error fetching player image:", error);
      res.json({ imageUrl: null });
    }
  });
  
  // Get player outlook - player = stock, cards = exposure vehicles
  app.post("/api/player-outlook", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { playerName, sport, contextCard } = req.body;

      if (!playerName || typeof playerName !== "string" || playerName.trim().length < 2) {
        return res.status(400).json({ message: "Player name is required (minimum 2 characters)" });
      }

      // Check subscription - this is a Pro feature for full analysis
      // Free users can see limited info
      const user = await storage.getUser(userId);
      const isPro = user?.subscriptionStatus === "PRO";
      
      if (!isPro) {
        // Check per-user rate limit (prevent abuse)
        const rateCheck = checkFreeUserRateLimit(userId);
        if (!rateCheck.allowed) {
          return res.status(429).json({ 
            message: `Please wait ${rateCheck.retryAfter} seconds before your next lookup.`,
            rateLimited: true,
            retryAfter: rateCheck.retryAfter
          });
        }
        
        // Check per-user monthly limit
        const FREE_TIER_LIMIT = 3;
        const monthlyCount = await storage.countUserMonthlyOutlookGenerations(userId);
        if (monthlyCount >= FREE_TIER_LIMIT) {
          return res.status(403).json({ 
            message: `You've used all ${FREE_TIER_LIMIT} free Player Outlook analyses this month. Upgrade to Pro for unlimited analyses.`,
            usageExceeded: true,
            used: monthlyCount,
            limit: FREE_TIER_LIMIT
          });
        }
        
        // Record rate limit timestamp
        recordFreeUserLookup(userId);
      }

      console.log(`[Player Outlook] Request for: ${playerName} (${sport || "auto-detect"})`);

      // Import and call the player outlook engine
      const { getPlayerOutlook } = await import("./playerOutlookEngine");
      
      const outlook = await getPlayerOutlook({
        playerName: playerName.trim(),
        sport: sport || "football", // Default to football
        contextCard,
      });

      // Track usage for free users (uses same pool as card outlooks)
      if (!isPro) {
        await storage.recordOutlookUsage(userId, 'quick', undefined, `Player: ${playerName}`);
      }

      res.json({
        ...outlook,
        isPro,
      });
    } catch (error) {
      console.error("Error getting player outlook:", error);
      res.status(500).json({ message: "Failed to get player outlook" });
    }
  });

  // ====== PLAYER WATCHLIST ROUTES ======
  
  // Add player to watchlist
  app.post("/api/watchlist", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { playerName, sport = "football", currentOutlook } = req.body;

      if (!playerName || typeof playerName !== "string" || playerName.trim().length < 2) {
        return res.status(400).json({ message: "Player name is required (minimum 2 characters)" });
      }

      // Normalize player key
      const playerKey = `${sport.toLowerCase()}:${playerName.toLowerCase().trim().replace(/\s+/g, "_")}`;

      // Check if already watching
      const existing = await storage.getWatchlistItem(userId, playerKey);
      if (existing) {
        return res.status(409).json({ message: "Player already in watchlist", watching: true });
      }

      // Extract snapshot values from current outlook if provided
      const watchlistItem = await storage.addToWatchlist({
        userId,
        playerKey,
        playerName: playerName.trim(),
        sport,
        verdictAtAdd: currentOutlook?.verdict?.action || null,
        modifierAtAdd: currentOutlook?.verdict?.modifier || null,
        temperatureAtAdd: currentOutlook?.snapshot?.temperature || null,
        notes: null,
      });

      res.status(201).json(watchlistItem);
    } catch (error) {
      console.error("Error adding to watchlist:", error);
      res.status(500).json({ message: "Failed to add player to watchlist" });
    }
  });

  // Remove player from watchlist
  app.delete("/api/watchlist/:playerKey", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const playerKey = decodeURIComponent(req.params.playerKey);

      const deleted = await storage.removeFromWatchlist(userId, playerKey);
      if (!deleted) {
        return res.status(404).json({ message: "Player not in watchlist" });
      }

      res.json({ message: "Removed from watchlist", watching: false });
    } catch (error) {
      console.error("Error removing from watchlist:", error);
      res.status(500).json({ message: "Failed to remove player from watchlist" });
    }
  });

  // Get user's full watchlist with current outlooks
  app.get("/api/watchlist", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sport = req.query.sport as string | undefined;

      const watchlist = await storage.getWatchlist(userId, sport);
      
      // Fetch current outlooks and calculate changes
      const { getPlayerOutlook } = await import("./playerOutlookEngine");
      
      const enrichedWatchlist = await Promise.all(
        watchlist.map(async (item) => {
          try {
            // Get current cached outlook (don't generate new - just use cache)
            const currentOutlook = await storage.getCachedPlayerOutlook(item.playerKey);
            
            // Calculate changes
            const changes = {
              verdictChanged: currentOutlook?.outlookJson?.verdict?.action !== item.verdictAtAdd,
              modifierChanged: currentOutlook?.outlookJson?.verdict?.modifier !== item.modifierAtAdd,
              temperatureChanged: currentOutlook?.outlookJson?.snapshot?.temperature !== item.temperatureAtAdd,
              previousVerdict: item.verdictAtAdd,
              previousModifier: item.modifierAtAdd,
              previousTemperature: item.temperatureAtAdd,
              changeCount: 0,
            };
            
            if (changes.verdictChanged) changes.changeCount++;
            if (changes.modifierChanged) changes.changeCount++;
            if (changes.temperatureChanged) changes.changeCount++;
            
            return {
              ...item,
              currentOutlook: currentOutlook?.outlookJson || null,
              changes: changes.changeCount > 0 ? changes : null,
            };
          } catch (error) {
            console.error(`Error fetching outlook for ${item.playerKey}:`, error);
            return { ...item, currentOutlook: null, changes: null };
          }
        })
      );

      res.json(enrichedWatchlist);
    } catch (error) {
      console.error("Error getting watchlist:", error);
      res.status(500).json({ message: "Failed to get watchlist" });
    }
  });

  // Check if player is in watchlist
  app.get("/api/watchlist/check/:playerKey", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const playerKey = decodeURIComponent(req.params.playerKey);

      const item = await storage.getWatchlistItem(userId, playerKey);
      res.json({ watching: !!item, item });
    } catch (error) {
      console.error("Error checking watchlist:", error);
      res.status(500).json({ message: "Failed to check watchlist status" });
    }
  });

  // Update watchlist notes
  app.patch("/api/watchlist/:playerKey", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const playerKey = decodeURIComponent(req.params.playerKey);
      const { notes } = req.body;

      const updated = await storage.updateWatchlistNotes(userId, playerKey, notes);
      if (!updated) {
        return res.status(404).json({ message: "Player not in watchlist" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating watchlist:", error);
      res.status(500).json({ message: "Failed to update watchlist" });
    }
  });

  // ====== UNIFIED WATCHLIST ROUTES (supports players AND cards) ======
  
  // Get unified watchlist (all items or filtered by type)
  app.get("/api/unified-watchlist", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const itemType = req.query.type as "player" | "card" | undefined;
      
      const items = await storage.getUnifiedWatchlist(userId, itemType);
      res.json(items);
    } catch (error) {
      console.error("Error getting unified watchlist:", error);
      res.status(500).json({ message: "Failed to get watchlist" });
    }
  });

  // Add item to unified watchlist (player or card)
  app.post("/api/unified-watchlist", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { itemType, playerKey, playerName, sport, cardId, cardTitle, 
              verdictAtAdd, actionAtAdd, temperatureAtAdd, estimatedValueAtAdd, source } = req.body;

      if (!itemType || !["player", "card"].includes(itemType)) {
        return res.status(400).json({ message: "itemType must be 'player' or 'card'" });
      }

      if (itemType === "player" && (!playerKey || !playerName)) {
        return res.status(400).json({ message: "playerKey and playerName are required for player items" });
      }

      if (itemType === "card" && !cardId) {
        return res.status(400).json({ message: "cardId is required for card items" });
      }

      // Check if already in watchlist
      const existing = await storage.getUnifiedWatchlistItem(
        userId, 
        itemType, 
        itemType === "player" ? playerKey : undefined,
        itemType === "card" ? cardId : undefined
      );

      if (existing) {
        return res.status(409).json({ 
          message: `${itemType === "player" ? "Player" : "Card"} already in watchlist`, 
          watching: true,
          item: existing 
        });
      }

      const item = await storage.addToUnifiedWatchlist({
        userId,
        itemType,
        playerKey: itemType === "player" ? playerKey : null,
        playerName: itemType === "player" ? playerName : null,
        sport: itemType === "player" ? (sport || "football") : null,
        cardId: itemType === "card" ? cardId : null,
        cardTitle: itemType === "card" ? cardTitle : null,
        verdictAtAdd,
        actionAtAdd,
        temperatureAtAdd,
        estimatedValueAtAdd,
        source,
        notes: null,
      });

      res.status(201).json(item);
    } catch (error) {
      console.error("Error adding to unified watchlist:", error);
      res.status(500).json({ message: "Failed to add to watchlist" });
    }
  });

  // Remove item from unified watchlist by ID
  app.delete("/api/unified-watchlist/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid watchlist item ID" });
      }

      const deleted = await storage.removeFromUnifiedWatchlist(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Item not in watchlist" });
      }

      res.json({ message: "Removed from watchlist", watching: false });
    } catch (error) {
      console.error("Error removing from unified watchlist:", error);
      res.status(500).json({ message: "Failed to remove from watchlist" });
    }
  });

  // Check if item is in unified watchlist
  app.get("/api/unified-watchlist/check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const itemType = req.query.type as "player" | "card";
      const playerKey = req.query.playerKey as string | undefined;
      const cardId = req.query.cardId ? parseInt(req.query.cardId as string) : undefined;

      if (!itemType || !["player", "card"].includes(itemType)) {
        return res.status(400).json({ message: "type query parameter must be 'player' or 'card'" });
      }

      const watching = await storage.isInUnifiedWatchlist(userId, itemType, playerKey, cardId);
      const item = watching 
        ? await storage.getUnifiedWatchlistItem(userId, itemType, playerKey, cardId)
        : null;

      res.json({ watching, item });
    } catch (error) {
      console.error("Error checking unified watchlist:", error);
      res.status(500).json({ message: "Failed to check watchlist status" });
    }
  });

  // Update unified watchlist item notes
  app.patch("/api/unified-watchlist/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { notes } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid watchlist item ID" });
      }

      const updated = await storage.updateUnifiedWatchlistNotes(id, userId, notes);
      if (!updated) {
        return res.status(404).json({ message: "Item not in watchlist" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating unified watchlist:", error);
      res.status(500).json({ message: "Failed to update watchlist" });
    }
  });

  // Object Storage routes - allows public access for public objects
  app.get("/objects/:objectPath(*)", async (req: any, res) => {
    // Get userId if authenticated, but don't require authentication
    const userId = req.user?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.put("/api/card-images", isAuthenticated, async (req: any, res) => {
    if (!req.body.cardImageURL) {
      return res.status(400).json({ error: "cardImageURL is required" });
    }

    const userId = req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.cardImageURL,
        {
          owner: userId,
          visibility: "public",
        },
      );

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting card image:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Comments routes
  app.get("/api/display-cases/:id/comments", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return res.status(404).json({ error: "Display case not found" });
      }

      const comments = await storage.getComments(id);
      res.json(comments);
    } catch (error) {
      console.error("Error getting comments:", error);
      res.status(500).json({ error: "Failed to get comments" });
    }
  });

  app.post("/api/display-cases/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { content } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid display case ID" });
      }

      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "Comment content is required" });
      }

      if (content.length > 1000) {
        return res.status(400).json({ error: "Comment too long (max 1000 characters)" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return res.status(404).json({ error: "Display case not found" });
      }

      const comment = await storage.createComment(id, userId, content.trim());
      res.status(201).json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  app.delete("/api/comments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid comment ID" });
      }

      await storage.deleteComment(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Likes routes
  app.get("/api/display-cases/:id/likes", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const visitorId = req.query.visitorId;
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return res.status(404).json({ error: "Display case not found" });
      }

      const count = await storage.getLikeCount(id);
      const userId = req.user?.claims?.sub;
      const likeUserId = userId || (visitorId ? `visitor_${visitorId}` : null);
      const hasLiked = likeUserId ? await storage.hasUserLiked(id, likeUserId) : false;

      res.json({ count, hasLiked });
    } catch (error) {
      console.error("Error getting likes:", error);
      res.status(500).json({ error: "Failed to get likes" });
    }
  });

  app.post("/api/display-cases/:id/likes", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const visitorId = req.body.visitorId;
      const userId = req.user?.claims?.sub;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid display case ID" });
      }

      if (!userId && !visitorId) {
        return res.status(400).json({ error: "User ID or visitor ID required" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return res.status(404).json({ error: "Display case not found" });
      }

      const likeUserId = userId || `visitor_${visitorId}`;
      const hasLiked = await storage.toggleLike(id, likeUserId);
      const count = await storage.getLikeCount(id);

      // Award badge if authenticated user liked (not unliked)
      if (hasLiked && userId) {
        prestigeService.checkAndAwardLikeBadge(userId).catch(err => {
          console.error("Error awarding like badge:", err);
        });
      }

      res.json({ hasLiked, count });
    } catch (error) {
      console.error("Error toggling like:", error);
      res.status(500).json({ error: "Failed to toggle like" });
    }
  });

  // Stripe routes
  app.post("/api/create-checkout-session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!process.env.STRIPE_PRICE_ID) {
        return res.status(500).json({ message: "Stripe price not configured. Please add STRIPE_PRICE_ID." });
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = process.env.BASE_URL || `https://${req.hostname}`;

      // Create or retrieve customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUserSubscription(userId, user.subscriptionStatus, customerId);
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/upgrade`,
        metadata: {
          userId: userId,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      console.error("Stripe error details:", error?.message, error?.type, error?.code);
      res.status(500).json({ message: "Failed to create checkout session", error: error?.message });
    }
  });

  app.get("/api/billing/success", isAuthenticated, async (req: any, res) => {
    try {
      const sessionId = req.query.session_id as string;
      const userId = req.user.claims.sub;

      if (!sessionId) {
        return res.status(400).json({ success: false, message: "Session ID required" });
      }

      // Validate session ID format to prevent injection
      if (!/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
        return res.status(400).json({ success: false, message: "Invalid session ID format" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (!session || session.payment_status !== "paid") {
        return res.status(400).json({ success: false, message: "Payment not completed" });
      }

      // SECURITY: Verify the session belongs to the current user using metadata (most reliable)
      // The metadata.userId was set when we created the checkout session
      if (session.metadata?.userId !== userId) {
        console.warn(`Security: User ${userId} attempted to claim session for user ${session.metadata?.userId}`);
        return res.status(403).json({ success: false, message: "Session does not belong to user" });
      }

      // Additional check: Verify session is not too old (prevent replay of old sessions)
      const sessionCreatedAt = new Date(session.created * 1000);
      const hoursSinceCreation = (Date.now() - sessionCreatedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) {
        console.warn(`Security: User ${userId} attempted to use expired session ${sessionId}`);
        return res.status(400).json({ success: false, message: "Session has expired" });
      }

      // Update user subscription (webhooks will also handle this but we do it immediately for UX)
      await storage.updateUserSubscription(
        userId,
        "PRO",
        session.customer as string
      );

      // Send payment confirmation email
      const user = await storage.getUser(userId);
      if (user?.email) {
        const userName = [user.firstName, user.lastName].filter(Boolean).join(" ");
        sendPaymentConfirmationEmail(user.email, userName).catch((err) =>
          console.error("Failed to send payment confirmation email:", err)
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error verifying billing:", error);
      res.status(500).json({ success: false, message: "Failed to verify payment" });
    }
  });

  // Promo code redemption route
  app.post("/api/promo/redeem", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ success: false, message: "Promo code is required" });
      }

      const result = await storage.redeemPromoCode(code.trim(), userId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error redeeming promo code:", error);
      res.status(500).json({ success: false, message: "Failed to redeem promo code" });
    }
  });

  // Admin middleware
  const isAdmin = async (req: any, res: any, next: any) => {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const isUserAdmin = await storage.isUserAdmin(req.user.claims.sub);
    if (!isUserAdmin) {
      return res.status(403).json({ message: "Forbidden - Admin access required" });
    }
    next();
  };

  // Admin routes
  app.get("/api/admin/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/display-cases", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const displayCases = await storage.getAllDisplayCases();
      res.json(displayCases);
    } catch (error) {
      console.error("Error fetching display cases:", error);
      res.status(500).json({ message: "Failed to fetch display cases" });
    }
  });

  // Check if current user is admin
  app.get("/api/admin/check", isAuthenticated, async (req: any, res) => {
    try {
      const isUserAdmin = await storage.isUserAdmin(req.user.claims.sub);
      res.json({ isAdmin: isUserAdmin });
    } catch (error) {
      console.error("Error checking admin status:", error);
      res.status(500).json({ message: "Failed to check admin status" });
    }
  });

  // Admin: Update user subscription status
  app.patch("/api/admin/users/:id/subscription", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { subscriptionStatus } = req.body;

      if (!subscriptionStatus || !["FREE", "PRO"].includes(subscriptionStatus)) {
        return res.status(400).json({ message: "Invalid subscription status. Must be FREE or PRO" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.updateUserSubscription(userId, subscriptionStatus, user.stripeCustomerId || undefined);
      const updatedUser = await storage.getUser(userId);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user subscription:", error);
      res.status(500).json({ message: "Failed to update user subscription" });
    }
  });

  // Admin: Prewarm job status and trigger
  app.get("/api/admin/prewarm/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { getPrewarmStatus } = await import("./prewarmJob");
      const status = getPrewarmStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting prewarm status:", error);
      res.status(500).json({ message: "Failed to get prewarm status" });
    }
  });

  app.post("/api/admin/prewarm/trigger", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { triggerPrewarm } = await import("./prewarmJob");
      const result = await triggerPrewarm();
      res.json(result);
    } catch (error) {
      console.error("Error triggering prewarm:", error);
      res.status(500).json({ message: "Failed to trigger prewarm" });
    }
  });

  // Admin: Cache observability stats
  app.get("/api/admin/cache/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { getCacheStats } = await import("./ebayCompsService");
      const stats = getCacheStats();
      res.json({
        ...stats,
        description: {
          freshHits: "Requests served from fresh cache",
          staleHits: "Requests served from stale cache (refresh triggered)",
          misses: "Requests with no cached data",
          tooOldRejections: "Requests rejected due to data > 30 days old",
          refreshTriggered: "Background refresh jobs started",
          refreshSuccess: "Successful refresh completions",
          refreshFailed: "Failed refresh attempts",
          queryBroadened: "Queries that required search broadening",
        }
      });
    } catch (error) {
      console.error("Error getting cache stats:", error);
      res.status(500).json({ message: "Failed to get cache stats" });
    }
  });

  // Admin: Reset cache stats (for new monitoring period)
  app.post("/api/admin/cache/stats/reset", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { resetCacheStats } = await import("./ebayCompsService");
      resetCacheStats();
      res.json({ success: true, message: "Cache stats reset" });
    } catch (error) {
      console.error("Error resetting cache stats:", error);
      res.status(500).json({ message: "Failed to reset cache stats" });
    }
  });

  // Portfolio Analytics
  app.get("/api/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const analytics = await storage.getPortfolioAnalytics(userId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Bookmark routes
  app.get("/api/bookmarks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookmarks = await storage.getBookmarks(userId);
      res.json(bookmarks);
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
      res.status(500).json({ message: "Failed to fetch bookmarks" });
    }
  });

  app.post("/api/cards/:id/bookmark", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      const hasBookmarked = await storage.hasUserBookmarked(userId, cardId);
      if (hasBookmarked) {
        return res.status(400).json({ message: "Already bookmarked" });
      }

      const bookmark = await storage.addBookmark(userId, cardId);

      // Award bookmark badge
      prestigeService.checkAndAwardBookmarkBadge(userId).catch(err => {
        console.error("Error awarding bookmark badge:", err);
      });

      res.status(201).json(bookmark);
    } catch (error) {
      console.error("Error adding bookmark:", error);
      res.status(500).json({ message: "Failed to add bookmark" });
    }
  });

  app.delete("/api/cards/:id/bookmark", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      await storage.removeBookmark(userId, cardId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing bookmark:", error);
      res.status(500).json({ message: "Failed to remove bookmark" });
    }
  });

  app.get("/api/cards/:id/bookmark-status", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const hasBookmarked = await storage.hasUserBookmarked(userId, cardId);
      const bookmarkCount = await storage.getCardBookmarkCount(cardId);
      res.json({ hasBookmarked, bookmarkCount });
    } catch (error) {
      console.error("Error checking bookmark status:", error);
      res.status(500).json({ message: "Failed to check bookmark status" });
    }
  });

  // Offer routes
  // Create a new offer (frontend uses this endpoint)
  app.post("/api/offers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { cardId, amount, message, isAnonymous } = req.body;

      if (!cardId || isNaN(parseInt(cardId))) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const numericCardId = parseInt(cardId);
      const numericAmount = parseFloat(amount);

      if (!amount || numericAmount <= 0) {
        return res.status(400).json({ message: "Invalid offer amount" });
      }

      const card = await storage.getCard(numericCardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      if (!card.openToOffers) {
        return res.status(400).json({ message: "This card is not open to offers" });
      }

      if (card.minOfferAmount && numericAmount < Number(card.minOfferAmount)) {
        return res.status(400).json({ message: `Minimum offer is $${card.minOfferAmount}` });
      }

      // Get the card owner
      const displayCase = await storage.getDisplayCase(card.displayCaseId);
      if (!displayCase) {
        return res.status(404).json({ message: "Display case not found" });
      }

      if (displayCase.userId === userId) {
        return res.status(400).json({ message: "Cannot make an offer on your own card" });
      }

      const offer = await storage.createOffer(userId, displayCase.userId, {
        cardId: numericCardId,
        amount: numericAmount,
        message: message || null,
        isAnonymous: isAnonymous || false,
      });

      // Create notification for card owner
      await storage.createNotification(displayCase.userId, "offer_received", {
        offerId: offer.id,
        cardId: numericCardId,
        cardTitle: card.title,
        amount: numericAmount,
        isAnonymous: isAnonymous || false,
      });

      // Award offer badge
      prestigeService.checkAndAwardOfferBadge(userId).catch(err => {
        console.error("Error awarding offer badge:", err);
      });

      res.status(201).json(offer);
    } catch (error) {
      console.error("Error creating offer:", error);
      res.status(500).json({ message: "Failed to create offer" });
    }
  });

  app.get("/api/offers/received", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const offers = await storage.getReceivedOffers(userId);
      res.json(offers);
    } catch (error) {
      console.error("Error fetching received offers:", error);
      res.status(500).json({ message: "Failed to fetch received offers" });
    }
  });

  app.get("/api/offers/sent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const offers = await storage.getSentOffers(userId);
      res.json(offers);
    } catch (error) {
      console.error("Error fetching sent offers:", error);
      res.status(500).json({ message: "Failed to fetch sent offers" });
    }
  });

  app.post("/api/cards/:id/offers", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { amount, message, isAnonymous } = req.body;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid offer amount" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      if (!card.openToOffers) {
        return res.status(400).json({ message: "This card is not open to offers" });
      }

      if (card.minOfferAmount && amount < card.minOfferAmount) {
        return res.status(400).json({ message: `Minimum offer is $${card.minOfferAmount}` });
      }

      // Get the card owner
      const displayCase = await storage.getDisplayCase(card.displayCaseId);
      if (!displayCase) {
        return res.status(404).json({ message: "Display case not found" });
      }

      if (displayCase.userId === userId) {
        return res.status(400).json({ message: "Cannot make an offer on your own card" });
      }

      const offer = await storage.createOffer(userId, displayCase.userId, {
        cardId,
        amount,
        message: message || null,
        isAnonymous: isAnonymous || false,
      });

      // Create notification for card owner
      await storage.createNotification(displayCase.userId, "offer_received", {
        offerId: offer.id,
        cardId,
        cardTitle: card.title,
        amount,
        isAnonymous: isAnonymous || false,
      });

      // Award offer badge
      prestigeService.checkAndAwardOfferBadge(userId).catch(err => {
        console.error("Error awarding offer badge:", err);
      });

      res.status(201).json(offer);
    } catch (error) {
      console.error("Error creating offer:", error);
      res.status(500).json({ message: "Failed to create offer" });
    }
  });

  app.patch("/api/offers/:id/accept", isAuthenticated, async (req: any, res) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(offerId)) {
        return res.status(400).json({ message: "Invalid offer ID" });
      }

      const offer = await storage.getOffer(offerId);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }

      if (offer.toUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (offer.status !== "pending") {
        return res.status(400).json({ message: "Offer is not pending" });
      }

      const updatedOffer = await storage.updateOfferStatus(offerId, "accepted");

      // Notify the buyer
      const card = await storage.getCard(offer.cardId);
      await storage.createNotification(offer.fromUserId, "offer_accepted", {
        offerId,
        cardTitle: card?.title || "Card",
        amount: offer.amount,
      });

      // Award badge to the offer maker
      prestigeService.checkAndAwardOfferAcceptedBadge(offer.fromUserId).catch(err => {
        console.error("Error awarding offer accepted badge:", err);
      });

      res.json(updatedOffer);
    } catch (error) {
      console.error("Error accepting offer:", error);
      res.status(500).json({ message: "Failed to accept offer" });
    }
  });

  app.patch("/api/offers/:id/decline", isAuthenticated, async (req: any, res) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(offerId)) {
        return res.status(400).json({ message: "Invalid offer ID" });
      }

      const offer = await storage.getOffer(offerId);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }

      if (offer.toUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (offer.status !== "pending") {
        return res.status(400).json({ message: "Offer is not pending" });
      }

      const updatedOffer = await storage.updateOfferStatus(offerId, "declined");

      // Notify the buyer
      const card = await storage.getCard(offer.cardId);
      await storage.createNotification(offer.fromUserId, "offer_declined", {
        offerId,
        cardTitle: card?.title || "Card",
        amount: offer.amount,
      });

      res.json(updatedOffer);
    } catch (error) {
      console.error("Error declining offer:", error);
      res.status(500).json({ message: "Failed to decline offer" });
    }
  });

  app.patch("/api/offers/:id/withdraw", isAuthenticated, async (req: any, res) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(offerId)) {
        return res.status(400).json({ message: "Invalid offer ID" });
      }

      const offer = await storage.getOffer(offerId);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }

      if (offer.fromUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (offer.status !== "pending") {
        return res.status(400).json({ message: "Offer is not pending" });
      }

      const updatedOffer = await storage.updateOfferStatus(offerId, "withdrawn");
      res.json(updatedOffer);
    } catch (error) {
      console.error("Error withdrawing offer:", error);
      res.status(500).json({ message: "Failed to withdraw offer" });
    }
  });

  // Notification routes
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 50;
      const notifications = await storage.getNotifications(userId, limit);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      await storage.markNotificationAsRead(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // Update card offer settings
  app.patch("/api/cards/:id/offer-settings", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { openToOffers, minOfferAmount } = req.body;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Verify ownership
      const displayCase = await storage.getDisplayCase(card.displayCaseId);
      if (!displayCase || displayCase.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const updatedCard = await storage.updateCard(cardId, {
        openToOffers: openToOffers ?? card.openToOffers,
        minOfferAmount: minOfferAmount !== undefined ? minOfferAmount : card.minOfferAmount,
      });

      res.json(updatedCard);
    } catch (error) {
      console.error("Error updating offer settings:", error);
      res.status(500).json({ message: "Failed to update offer settings" });
    }
  });

  // Badge and Prestige routes
  app.get("/api/badges", async (req, res) => {
    try {
      const allBadges = await storage.getAllBadges();
      res.json(allBadges);
    } catch (error) {
      console.error("Error fetching badges:", error);
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  app.get("/api/prestige", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getUserPrestigeStats(userId);
      const userBadges = await storage.getUserBadges(userId);
      res.json({ ...stats, badges: userBadges });
    } catch (error) {
      console.error("Error fetching prestige:", error);
      res.status(500).json({ message: "Failed to fetch prestige data" });
    }
  });

  app.get("/api/prestige/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const stats = await storage.getUserPrestigeStats(userId);
      const userBadges = await storage.getUserBadges(userId);
      res.json({ ...stats, badges: userBadges });
    } catch (error) {
      console.error("Error fetching user prestige:", error);
      res.status(500).json({ message: "Failed to fetch user prestige data" });
    }
  });

  app.get("/api/users/:userId/badges", async (req, res) => {
    try {
      const userId = req.params.userId;
      const userBadges = await storage.getUserBadges(userId);
      res.json(userBadges);
    } catch (error) {
      console.error("Error fetching user badges:", error);
      res.status(500).json({ message: "Failed to fetch user badges" });
    }
  });

  app.post("/api/prestige/recalculate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const result = await prestigeService.recalculateUserPrestige(userId);
      res.json(result);
    } catch (error) {
      console.error("Error recalculating prestige:", error);
      res.status(500).json({ message: "Failed to recalculate prestige" });
    }
  });

  // Initialize badges on server start
  prestigeService.initializeBadges().catch(err => {
    console.error("Failed to initialize badges:", err);
  });

  // Trade offer routes
  app.post("/api/trades", isAuthenticated, async (req: any, res) => {
    try {
      const fromUserId = req.user.claims.sub;
      const { toUserId, offeredCardIds, requestedCardIds, cashAdjustment, message } = req.body;

      if (!toUserId || !offeredCardIds || !requestedCardIds) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (offeredCardIds.length === 0 && (!cashAdjustment || cashAdjustment <= 0)) {
        return res.status(400).json({ message: "Must offer at least one card or cash" });
      }

      if (requestedCardIds.length === 0) {
        return res.status(400).json({ message: "Must request at least one card" });
      }

      const tradeOffer = await storage.createTradeOffer(
        fromUserId,
        toUserId,
        offeredCardIds,
        requestedCardIds,
        cashAdjustment || 0,
        message
      );

      // Create notification for the recipient
      await storage.createNotification(toUserId, "trade_received", {
        tradeOfferId: tradeOffer.id,
        fromUserId,
        cardCount: requestedCardIds.length,
      });

      res.json(tradeOffer);
    } catch (error) {
      console.error("Error creating trade offer:", error);
      res.status(500).json({ message: "Failed to create trade offer" });
    }
  });

  app.get("/api/trades/received", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trades = await storage.getReceivedTradeOffers(userId);
      res.json(trades);
    } catch (error) {
      console.error("Error fetching received trades:", error);
      res.status(500).json({ message: "Failed to fetch received trades" });
    }
  });

  app.get("/api/trades/sent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trades = await storage.getSentTradeOffers(userId);
      res.json(trades);
    } catch (error) {
      console.error("Error fetching sent trades:", error);
      res.status(500).json({ message: "Failed to fetch sent trades" });
    }
  });

  app.patch("/api/trades/:id/accept", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid trade offer ID" });
      }

      const tradeOffer = await storage.getTradeOffer(id);
      if (!tradeOffer) {
        return res.status(404).json({ message: "Trade offer not found" });
      }

      if (tradeOffer.toUserId !== userId) {
        return res.status(403).json({ message: "Not authorized to accept this trade" });
      }

      if (tradeOffer.status !== "pending") {
        return res.status(400).json({ message: "Trade offer is no longer pending" });
      }

      const updatedTrade = await storage.updateTradeOfferStatus(id, "accepted");

      // Notify the sender
      await storage.createNotification(tradeOffer.fromUserId, "trade_accepted", {
        tradeOfferId: id,
      });

      res.json(updatedTrade);
    } catch (error) {
      console.error("Error accepting trade offer:", error);
      res.status(500).json({ message: "Failed to accept trade offer" });
    }
  });

  app.patch("/api/trades/:id/decline", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid trade offer ID" });
      }

      const tradeOffer = await storage.getTradeOffer(id);
      if (!tradeOffer) {
        return res.status(404).json({ message: "Trade offer not found" });
      }

      if (tradeOffer.toUserId !== userId) {
        return res.status(403).json({ message: "Not authorized to decline this trade" });
      }

      if (tradeOffer.status !== "pending") {
        return res.status(400).json({ message: "Trade offer is no longer pending" });
      }

      const updatedTrade = await storage.updateTradeOfferStatus(id, "declined");

      // Notify the sender
      await storage.createNotification(tradeOffer.fromUserId, "trade_declined", {
        tradeOfferId: id,
      });

      res.json(updatedTrade);
    } catch (error) {
      console.error("Error declining trade offer:", error);
      res.status(500).json({ message: "Failed to decline trade offer" });
    }
  });

  // Follow routes
  app.post("/api/users/:userId/follow", isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user.claims.sub;
      const followedId = req.params.userId;

      if (followerId === followedId) {
        return res.status(400).json({ message: "Cannot follow yourself" });
      }

      const follow = await storage.followUser(followerId, followedId);

      // Notify the followed user
      const follower = await storage.getUser(followerId);
      const followerDisplayName = follower?.handle 
        ? `@${follower.handle}` 
        : follower ? `${follower.firstName || ''} ${follower.lastName || ''}`.trim() || 'Someone' : 'Someone';
      await storage.createNotification(followedId, "new_follower", {
        followerId,
        followerName: followerDisplayName,
      });

      res.json(follow);
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ message: "Failed to follow user" });
    }
  });

  app.delete("/api/users/:userId/follow", isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user.claims.sub;
      const followedId = req.params.userId;

      await storage.unfollowUser(followerId, followedId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ message: "Failed to unfollow user" });
    }
  });

  app.get("/api/users/:userId/is-following", isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user.claims.sub;
      const followedId = req.params.userId;

      const isFollowing = await storage.isFollowing(followerId, followedId);
      res.json({ isFollowing });
    } catch (error) {
      console.error("Error checking follow status:", error);
      res.status(500).json({ message: "Failed to check follow status" });
    }
  });

  app.get("/api/users/:userId/followers", async (req, res) => {
    try {
      const userId = req.params.userId;
      const followers = await storage.getFollowers(userId);
      const count = await storage.getFollowerCount(userId);
      res.json({ followers, count });
    } catch (error) {
      console.error("Error fetching followers:", error);
      res.status(500).json({ message: "Failed to fetch followers" });
    }
  });

  app.get("/api/users/:userId/following", async (req, res) => {
    try {
      const userId = req.params.userId;
      const following = await storage.getFollowing(userId);
      const count = await storage.getFollowingCount(userId);
      res.json({ following, count });
    } catch (error) {
      console.error("Error fetching following:", error);
      res.status(500).json({ message: "Failed to fetch following" });
    }
  });

  // Messaging routes
  app.get("/api/messages/inbox", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversations = await storage.getUserConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching inbox:", error);
      res.status(500).json({ message: "Failed to fetch inbox" });
    }
  });

  app.get("/api/messages/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.getUnreadMessageCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.post("/api/messages/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { recipientId } = req.body;

      if (!recipientId || typeof recipientId !== "string" || recipientId.trim().length === 0) {
        return res.status(400).json({ message: "Valid recipient ID is required" });
      }

      if (recipientId === userId) {
        return res.status(400).json({ message: "Cannot message yourself" });
      }

      // Verify recipient exists
      const recipient = await storage.getUser(recipientId);
      if (!recipient) {
        return res.status(404).json({ message: "Recipient not found" });
      }

      const conversation = await storage.getOrCreateConversation(userId, recipientId);
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/messages/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);

      if (isNaN(conversationId) || conversationId <= 0) {
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      const conversation = await storage.getConversation(conversationId, userId);
      if (!conversation) {
        return res.status(403).json({ message: "Access denied or conversation not found" });
      }

      const messages = await storage.getConversationMessages(conversationId);
      
      // Mark messages as read
      await storage.markMessagesAsRead(conversationId, userId);

      // Get the other user's info
      const otherUserId = conversation.participantAId === userId 
        ? conversation.participantBId 
        : conversation.participantAId;
      const otherUser = await storage.getUser(otherUserId);

      res.json({ 
        conversation, 
        messages,
        otherUser: otherUser ? {
          id: otherUser.id,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          handle: otherUser.handle,
          profileImageUrl: otherUser.profileImageUrl,
        } : null
      });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.post("/api/messages/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      if (isNaN(conversationId) || conversationId <= 0) {
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ message: "Message content is required" });
      }

      // Verify user is part of this conversation
      const conversation = await storage.getConversation(conversationId, userId);
      if (!conversation) {
        return res.status(403).json({ message: "Access denied or conversation not found" });
      }

      const message = await storage.createMessage(conversationId, userId, content.trim());

      // Notify the recipient
      const recipientId = conversation.participantAId === userId 
        ? conversation.participantBId 
        : conversation.participantAId;
      
      const sender = await storage.getUser(userId);
      const senderDisplayName = sender?.handle 
        ? `@${sender.handle}` 
        : sender ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Someone' : 'Someone';
      await storage.createNotification(recipientId, "new_message", {
        conversationId,
        senderId: userId,
        senderName: senderDisplayName,
        preview: content.substring(0, 50),
      });

      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.post("/api/messages/conversations/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);

      if (isNaN(conversationId) || conversationId <= 0) {
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      const conversation = await storage.getConversation(conversationId, userId);
      if (!conversation) {
        return res.status(403).json({ message: "Access denied or conversation not found" });
      }

      await storage.markMessagesAsRead(conversationId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });

  // Handle management routes
  app.get("/api/handle/check/:handle", async (req, res) => {
    try {
      const handle = req.params.handle;
      
      // Validate handle format (alphanumeric, 3-30 chars)
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(handle)) {
        return res.json({ available: false, message: "Handle must be 3-30 characters, letters, numbers, and underscores only" });
      }
      
      const available = await storage.isHandleAvailable(handle);
      res.json({ available });
    } catch (error) {
      console.error("Error checking handle availability:", error);
      res.status(500).json({ message: "Failed to check handle availability" });
    }
  });

  app.patch("/api/user/handle", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { handle } = req.body;
      
      // Validate handle format
      if (!handle || typeof handle !== "string") {
        return res.status(400).json({ message: "Handle is required" });
      }
      
      const trimmedHandle = handle.trim();
      
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmedHandle)) {
        return res.status(400).json({ message: "Handle must be 3-30 characters, letters, numbers, and underscores only" });
      }
      
      // Check if handle is available (excluding current user)
      const available = await storage.isHandleAvailable(trimmedHandle, userId);
      if (!available) {
        return res.status(409).json({ message: "Handle is already taken" });
      }
      
      const user = await storage.updateUserHandle(userId, trimmedHandle);
      res.json(user);
    } catch (error) {
      console.error("Error updating handle:", error);
      res.status(500).json({ message: "Failed to update handle" });
    }
  });

  // ============ PRICE ALERTS ROUTES ============

  // Get all price alerts for the current user
  app.get("/api/price-alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alerts = await storage.getPriceAlerts(userId);
      res.json(alerts);
    } catch (error: any) {
      console.error("Error fetching price alerts:", error);
      // Return empty array if table doesn't exist
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return res.json([]);
      }
      res.status(500).json({ message: "Failed to fetch price alerts" });
    }
  });

  // Create a new price alert
  app.post("/api/price-alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { cardId, alertType, threshold, isActive } = req.body;

      // Validate input
      if (!cardId || typeof cardId !== "number") {
        return res.status(400).json({ message: "Valid card ID is required" });
      }
      if (!alertType || !["above", "below"].includes(alertType)) {
        return res.status(400).json({ message: "Alert type must be 'above' or 'below'" });
      }
      if (typeof threshold !== "number" || threshold <= 0) {
        return res.status(400).json({ message: "Threshold must be a positive number" });
      }

      // Check Pro gating: Free users get 3 alerts, Pro gets unlimited
      const user = await storage.getUser(userId);
      if (user?.subscriptionStatus !== "PRO") {
        const alertCount = await storage.countUserPriceAlerts(userId);
        if (alertCount >= 3) {
          return res.status(403).json({ 
            message: "Free tier limit reached. Upgrade to Pro for unlimited price alerts.",
            upgradeRequired: true
          });
        }
      }

      // Verify the card exists and belongs to a case the user owns
      const card = await storage.getCard(cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      // Verify user owns the display case containing this card
      const displayCase = await storage.getDisplayCaseByIdAndUser(card.displayCaseId, userId);
      if (!displayCase) {
        return res.status(403).json({ message: "You can only set alerts for your own cards" });
      }

      const alert = await storage.createPriceAlert(userId, {
        cardId,
        alertType,
        threshold,
        isActive: isActive !== false,
      });

      res.status(201).json(alert);
    } catch (error: any) {
      // Handle unique constraint violation (duplicate alert)
      if (error.code === "23505") {
        return res.status(409).json({ message: "An alert of this type already exists for this card" });
      }
      console.error("Error creating price alert:", error);
      res.status(500).json({ message: "Failed to create price alert" });
    }
  });

  // Update a price alert
  app.patch("/api/price-alerts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alertId = parseInt(req.params.id);
      const { threshold, isActive } = req.body;

      if (isNaN(alertId)) {
        return res.status(400).json({ message: "Invalid alert ID" });
      }

      // Verify ownership
      const existingAlert = await storage.getPriceAlert(alertId);
      if (!existingAlert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      if (existingAlert.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updateData: any = {};
      if (typeof threshold === "number" && threshold > 0) {
        updateData.threshold = threshold;
      }
      if (typeof isActive === "boolean") {
        updateData.isActive = isActive;
      }

      const alert = await storage.updatePriceAlert(alertId, updateData);
      res.json(alert);
    } catch (error) {
      console.error("Error updating price alert:", error);
      res.status(500).json({ message: "Failed to update price alert" });
    }
  });

  // Delete a price alert
  app.delete("/api/price-alerts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alertId = parseInt(req.params.id);

      if (isNaN(alertId)) {
        return res.status(400).json({ message: "Invalid alert ID" });
      }

      // Verify ownership
      const existingAlert = await storage.getPriceAlert(alertId);
      if (!existingAlert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      if (existingAlert.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deletePriceAlert(alertId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting price alert:", error);
      res.status(500).json({ message: "Failed to delete price alert" });
    }
  });

  // Get price alerts for a specific card
  app.get("/api/cards/:id/price-alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cardId = parseInt(req.params.id);

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const alerts = await storage.getCardPriceAlerts(cardId, userId);
      const userAlertCount = await storage.countUserPriceAlerts(userId);
      const user = await storage.getUser(userId);
      const isPro = user?.subscriptionStatus === "PRO";
      const maxAlerts = isPro ? Infinity : 3;
      const canCreateMore = isPro || userAlertCount < 3;

      res.json({
        alerts,
        userAlertCount,
        maxAlerts: isPro ? -1 : 3,
        canCreateMore,
      });
    } catch (error: any) {
      console.error("Error fetching card price alerts:", error);
      // Return empty data if table doesn't exist or other DB error
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return res.json({ alerts: [], userAlertCount: 0, maxAlerts: 3, canCreateMore: true });
      }
      res.status(500).json({ message: "Failed to fetch card price alerts" });
    }
  });

  // Get price history for a specific card
  app.get("/api/cards/:id/price-history", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.id);
      const days = parseInt(req.query.days as string) || 30;

      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }

      const history = await storage.getCardPriceHistory(cardId, days);
      res.json(history);
    } catch (error: any) {
      console.error("Error fetching price history:", error);
      // Return empty array if table doesn't exist
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return res.json([]);
      }
      res.status(500).json({ message: "Failed to fetch price history" });
    }
  });

  // Get user's alert settings
  app.get("/api/user/alert-settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let settings = await storage.getUserAlertSettings(userId);
      
      // Return default settings if none exist
      if (!settings) {
        settings = {
          id: 0,
          userId,
          emailAlertsEnabled: true,
          inAppAlertsEnabled: true,
          weeklyDigestEnabled: true,
          lastDigestSentAt: null,
          createdAt: null,
        };
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching alert settings:", error);
      res.status(500).json({ message: "Failed to fetch alert settings" });
    }
  });

  // Update user's alert settings
  app.put("/api/user/alert-settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { emailAlertsEnabled, inAppAlertsEnabled, weeklyDigestEnabled } = req.body;

      const updateData: any = {};
      if (typeof emailAlertsEnabled === "boolean") {
        updateData.emailAlertsEnabled = emailAlertsEnabled;
      }
      if (typeof inAppAlertsEnabled === "boolean") {
        updateData.inAppAlertsEnabled = inAppAlertsEnabled;
      }
      if (typeof weeklyDigestEnabled === "boolean") {
        updateData.weeklyDigestEnabled = weeklyDigestEnabled;
      }

      const settings = await storage.upsertUserAlertSettings(userId, updateData);
      res.json(settings);
    } catch (error) {
      console.error("Error updating alert settings:", error);
      res.status(500).json({ message: "Failed to update alert settings" });
    }
  });

  // Get count of user's price alerts (for UI to show limit)
  app.get("/api/price-alerts/count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.countUserPriceAlerts(userId);
      const user = await storage.getUser(userId);
      const limit = user?.subscriptionStatus === "PRO" ? null : 3;
      
      res.json({ count, limit, isPro: user?.subscriptionStatus === "PRO" });
    } catch (error) {
      console.error("Error fetching alert count:", error);
      res.status(500).json({ message: "Failed to fetch alert count" });
    }
  });

  // ============================================================================
  // eBay Market Comps API
  // ============================================================================

  // Import the eBay comps service functions
  const ebayComps = await import("./ebayCompsService");

  // GET /api/comps/ebay - Get cached comps by query hash (requires auth)
  app.get("/api/comps/ebay", isAuthenticated, async (req: any, res) => {
    try {
      const { queryHash } = req.query;
      
      if (!queryHash || typeof queryHash !== "string") {
        return res.status(400).json({ error: "queryHash is required" });
      }
      
      // Check for cached data using SWR pattern (returns stale data while refreshing in background)
      const swrResult = await ebayComps.getCachedCompsWithSWR(queryHash);
      
      if (swrResult.data && (swrResult.data.fetchStatus === "complete" || swrResult.data.compsJson)) {
        console.log(`[Comps API] Cache ${swrResult.isStale ? "stale" : "fresh"} hit for ${queryHash}`);
        return res.json({
          status: swrResult.isStale ? "stale" : "complete",
          data: {
            queryHash: swrResult.data.queryHash,
            canonicalQuery: swrResult.data.canonicalQuery,
            soldCount: swrResult.data.soldCount,
            confidence: swrResult.data.confidence,
            summary: swrResult.data.summaryJson,
            comps: swrResult.data.compsJson,
            lastFetchedAt: swrResult.data.lastFetchedAt,
            expiresAt: swrResult.data.expiresAt,
            isStale: swrResult.isStale,
            refreshing: swrResult.needsRefresh
          }
        });
      }
      
      // Check if there's an entry being fetched
      const entry = await ebayComps.getCacheEntry(queryHash);
      
      if (entry) {
        if (entry.fetchStatus === "fetching") {
          return res.json({ status: "fetching", queryHash });
        }
        if (entry.fetchStatus === "failed") {
          return res.json({ 
            status: "failed", 
            queryHash,
            error: entry.fetchError 
          });
        }
      }
      
      // No data
      console.log(`[Comps API] Cache miss for ${queryHash}`);
      return res.json({ status: "missing", queryHash });
      
    } catch (error) {
      console.error("[Comps API] Error getting cached comps:", error);
      res.status(500).json({ error: "Failed to get comps data" });
    }
  });

  // POST /api/comps/ebay/fetch - Trigger a fetch job for comps (requires auth)
  app.post("/api/comps/ebay/fetch", isAuthenticated, async (req: any, res) => {
    try {
      const { canonicalQuery, queryInput } = req.body;
      
      // Accept either a pre-normalized query or raw input
      let normalized: { canonicalQuery: string; queryHash: string; filters: any };
      
      if (canonicalQuery) {
        normalized = ebayComps.normalizeEbayQuery(canonicalQuery);
      } else if (queryInput) {
        normalized = ebayComps.normalizeEbayQuery(queryInput);
      } else {
        return res.status(400).json({ error: "canonicalQuery or queryInput is required" });
      }
      
      console.log(`[Comps API] Fetch request for: "${normalized.canonicalQuery}" (hash: ${normalized.queryHash})`);
      
      // Check if already cached and valid (using SWR pattern)
      const swrResult = await ebayComps.getCachedCompsWithSWR(normalized.queryHash);
      if (swrResult.data && !swrResult.isStale) {
        return res.json({ 
          status: "cached", 
          queryHash: normalized.queryHash,
          message: "Data already cached and fresh"
        });
      }
      
      // Enqueue the fetch job
      const result = await ebayComps.enqueueFetchJob(
        normalized.canonicalQuery,
        normalized.queryHash,
        normalized.filters
      );
      
      if (result.queued) {
        return res.json({ 
          status: "queued", 
          queryHash: normalized.queryHash,
          canonicalQuery: normalized.canonicalQuery 
        });
      } else if (result.reason?.includes("already running")) {
        // Job is already running for this query - client should poll status
        return res.json({ 
          status: "in_progress", 
          queryHash: normalized.queryHash,
          message: "Fetch already in progress for this query. Poll /api/comps/ebay/status for updates."
        });
      } else {
        // System is busy - client should retry after delay
        return res.status(503).json({ 
          status: "busy", 
          queryHash: normalized.queryHash,
          retryAfter: 5,
          message: "System at capacity. Please retry in a few seconds."
        });
      }
      
    } catch (error) {
      console.error("[Comps API] Error triggering fetch:", error);
      res.status(500).json({ error: "Failed to queue fetch job" });
    }
  });

  // GET /api/comps/ebay/status - Get status of a fetch job (requires auth)
  app.get("/api/comps/ebay/status", isAuthenticated, async (req: any, res) => {
    try {
      const { queryHash } = req.query;
      
      if (!queryHash || typeof queryHash !== "string") {
        return res.status(400).json({ error: "queryHash is required" });
      }
      
      const entry = await ebayComps.getCacheEntry(queryHash);
      
      if (!entry) {
        return res.json({ status: "not_found", queryHash });
      }
      
      res.json({
        status: entry.fetchStatus,
        queryHash: entry.queryHash,
        canonicalQuery: entry.canonicalQuery,
        soldCount: entry.soldCount,
        confidence: entry.confidence,
        pagesScraped: entry.pagesScraped,
        itemsFound: entry.itemsFound,
        itemsKept: entry.itemsKept,
        error: entry.fetchError,
        lastFetchedAt: entry.lastFetchedAt,
        expiresAt: entry.expiresAt
      });
      
    } catch (error) {
      console.error("[Comps API] Error getting status:", error);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  // POST /api/comps/ebay/normalize - Normalize a query (utility endpoint, requires auth)
  app.post("/api/comps/ebay/normalize", isAuthenticated, (req: any, res) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "query is required" });
      }
      
      const normalized = ebayComps.normalizeEbayQuery(query);
      res.json(normalized);
      
    } catch (error) {
      console.error("[Comps API] Error normalizing query:", error);
      res.status(500).json({ error: "Failed to normalize query" });
    }
  });

  // ============================================================================
  // Portfolio Intelligence API
  // ============================================================================

  // GET /api/portfolio/outlook - Get latest portfolio outlook snapshot
  app.get("/api/portfolio/outlook", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const snapshot = await getLatestPortfolioSnapshot(userId);
      
      if (!snapshot) {
        return res.json({ 
          hasSnapshot: false, 
          message: "No portfolio outlook generated yet" 
        });
      }

      res.json({ 
        hasSnapshot: true, 
        snapshot 
      });
    } catch (error) {
      console.error("[Portfolio Outlook] Error getting snapshot:", error);
      res.status(500).json({ error: "Failed to get portfolio outlook" });
    }
  });

  // POST /api/portfolio/outlook/generate - Generate new portfolio outlook
  app.post("/api/portfolio/outlook/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const refresh = req.query.refresh === "true";
      
      // Check if we have a fresh snapshot (unless refresh is requested)
      if (!refresh) {
        const isFresh = await isSnapshotFresh(userId, 12); // 12 hour cache
        if (isFresh) {
          const existing = await getLatestPortfolioSnapshot(userId);
          if (existing) {
            return res.json({ 
              snapshot: existing, 
              cached: true,
              message: "Returning cached snapshot (less than 12 hours old)" 
            });
          }
        }
      }

      // Rate limit even Pro users to prevent abuse (1 call per minute)
      const rateCheck = checkPortfolioAIRateLimit(userId, 'outlook');
      if (!rateCheck.allowed) {
        return res.status(429).json({ 
          message: `Please wait ${rateCheck.retryAfter} seconds before refreshing.`,
          rateLimited: true,
          retryAfter: rateCheck.retryAfter
        });
      }

      console.log(`[Portfolio Outlook] Generating for user ${userId}...`);
      recordPortfolioAICall(userId, 'outlook');
      const snapshot = await generatePortfolioOutlook(userId);
      
      res.json({ 
        snapshot, 
        cached: false,
        message: "New portfolio outlook generated" 
      });
    } catch (error) {
      console.error("[Portfolio Outlook] Error generating:", error);
      res.status(500).json({ error: "Failed to generate portfolio outlook" });
    }
  });

  // GET /api/portfolio/profile - Get raw portfolio profile (for debugging/display)
  app.get("/api/portfolio/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const profile = await buildPortfolioProfile(userId);
      const riskSignals = generateRiskSignals(profile);
      
      res.json({ profile, riskSignals });
    } catch (error) {
      console.error("[Portfolio Profile] Error building:", error);
      res.status(500).json({ error: "Failed to build portfolio profile" });
    }
  });

  // GET /api/portfolio/next-buys - Get latest next buys recommendations
  app.get("/api/portfolio/next-buys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const buys = await getLatestNextBuys(userId);
      const generatedAt = buys.length > 0 && buys[0].createdAt ? buys[0].createdAt : null;
      
      res.json({ 
        buys: buys.slice(0, 7),
        count: Math.min(buys.length, 7),
        generatedAt
      });
    } catch (error) {
      console.error("[Next Buys] Error getting:", error);
      res.status(500).json({ error: "Failed to get next buys" });
    }
  });

  // POST /api/portfolio/next-buys/generate - Generate new next buys recommendations
  app.post("/api/portfolio/next-buys/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const refresh = req.query.refresh === "true";
      
      // Check for existing today's recommendations (unless refresh is requested)
      if (!refresh) {
        const existing = await getLatestNextBuys(userId);
        if (existing.length > 0) {
          const generatedAt = existing[0].createdAt || new Date().toISOString();
          return res.json({ 
            buys: existing.slice(0, 7), 
            cached: true,
            generatedAt,
            message: "Returning today's recommendations" 
          });
        }
      }

      // Rate limit even Pro users to prevent abuse (1 call per minute)
      const rateCheck = checkPortfolioAIRateLimit(userId, 'nextbuys');
      if (!rateCheck.allowed) {
        return res.status(429).json({ 
          message: `Please wait ${rateCheck.retryAfter} seconds before refreshing.`,
          rateLimited: true,
          retryAfter: rateCheck.retryAfter
        });
      }

      console.log(`[Next Buys] Generating for user ${userId}...`);
      recordPortfolioAICall(userId, 'nextbuys');
      const buys = await generateNextBuys(userId);
      const limitedBuys = buys.slice(0, 7);
      
      res.json({ 
        buys: limitedBuys, 
        cached: false,
        count: limitedBuys.length,
        generatedAt: new Date().toISOString(),
        message: "New next buys recommendations generated" 
      });
    } catch (error) {
      console.error("[Next Buys] Error generating:", error);
      res.status(500).json({ error: "Failed to generate next buys" });
    }
  });

  // ============================================================================
  // Shared Snapshots - Public sharing of reports
  // ============================================================================

  // Helper to generate secure random token
  function generateShareToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  // POST /api/snapshots - Create a shared snapshot
  app.post("/api/snapshots", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { snapshotType, cardId, snapshotData, title } = req.body;
      
      if (!snapshotType || !snapshotData || !title) {
        return res.status(400).json({ error: "Missing required fields: snapshotType, snapshotData, title" });
      }

      const validTypes = ['card_outlook', 'player_outlook', 'portfolio_analytics', 'portfolio_outlook'];
      if (!validTypes.includes(snapshotType)) {
        return res.status(400).json({ error: "Invalid snapshot type" });
      }

      const token = generateShareToken();
      
      const snapshot = await storage.createSharedSnapshot(userId, {
        token,
        snapshotType,
        cardId: cardId || null,
        snapshotData,
        title,
        expiresAt: null, // Never expires by default
      });

      res.json({ 
        success: true, 
        token: snapshot.token,
        shareUrl: `/share/${snapshot.token}`
      });
    } catch (error) {
      console.error("[Snapshots] Error creating:", error);
      res.status(500).json({ error: "Failed to create snapshot" });
    }
  });

  // GET /api/snapshots/:token - Get a shared snapshot (public - no auth required)
  app.get("/api/snapshots/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      const snapshot = await storage.getSharedSnapshotByToken(token);
      if (!snapshot) {
        return res.status(404).json({ error: "Snapshot not found" });
      }

      // Check expiration
      if (snapshot.expiresAt && new Date(snapshot.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Snapshot has expired" });
      }

      // Increment view count
      await storage.incrementSnapshotViewCount(token);

      // Get owner info for display
      const owner = await storage.getUser(snapshot.userId);
      const ownerName = owner?.firstName 
        ? `${owner.firstName}${owner.lastName ? ' ' + owner.lastName : ''}`
        : owner?.handle || 'Collector';

      res.json({
        snapshotType: snapshot.snapshotType,
        title: snapshot.title,
        snapshotData: snapshot.snapshotData,
        ownerName,
        ownerHandle: owner?.handle,
        ownerProfileImage: owner?.profileImageUrl,
        createdAt: snapshot.createdAt,
        viewCount: snapshot.viewCount + 1, // Include the current view
      });
    } catch (error) {
      console.error("[Snapshots] Error fetching:", error);
      res.status(500).json({ error: "Failed to fetch snapshot" });
    }
  });

  // GET /api/my-snapshots - Get user's shared snapshots
  app.get("/api/my-snapshots", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const snapshots = await storage.getUserSharedSnapshots(userId);
      res.json(snapshots);
    } catch (error) {
      console.error("[Snapshots] Error fetching user snapshots:", error);
      res.status(500).json({ error: "Failed to fetch snapshots" });
    }
  });

  // DELETE /api/snapshots/:token - Delete a shared snapshot
  app.delete("/api/snapshots/:token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { token } = req.params;
      await storage.deleteSharedSnapshot(token, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("[Snapshots] Error deleting:", error);
      res.status(500).json({ error: "Failed to delete snapshot" });
    }
  });

}
