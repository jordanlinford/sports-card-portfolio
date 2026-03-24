import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupGoogleAuth } from "./googleAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { logActivity, getRecentActivity, getActivityStats } from "./activityLogger";
import { 
  insertDisplayCaseSchema, 
  insertCardSchema, 
  insertPlayerRegistrySchema, 
  playerRegistry,
  insertPopHistorySchema,
  type InsertPopHistory,
  userFeedback,
  hasProAccess,
  playerOutlookCache,
} from "@shared/schema";
import { db } from "./db";
import { desc, eq, sql } from "drizzle-orm";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { lookupCardPrice, lookupMultipleCardPrices } from "./priceService";
import { generateShareImage, generateOutlookShareImage, OutlookShareData } from "./shareImageService";
import { generatePlayerOGImage, getPlayerShareData } from "./playerShareImageService";
import { generatePageOGImage, getPageShareData } from "./pageShareImageService";
import { prestigeService } from "./prestigeService";
import { generateCardOutlook, generateQuickOutlook, inferCardMetadata } from "./cardOutlookService";
import { 
  sendPaymentConfirmationEmail,
} from "./email";
import { 
  buildPortfolioProfile, 
  generateRiskSignals, 
  generatePortfolioOutlook, 
  getLatestPortfolioSnapshot, 
  isSnapshotFresh,
  generateNextBuys,
  getLatestNextBuys,
  generatePortfolioNextBuys
} from "./portfolioIntelligenceService";

// ============================================================================
// Alpha Engine - Fire-and-forget observation & interest tracking
// ============================================================================

function recordPriceObservation(data: {
  cardId?: number;
  playerName?: string;
  cardTitle?: string;
  setName?: string;
  year?: number;
  variation?: string;
  priceEstimate: number;
  lowEstimate?: number;
  highEstimate?: number;
  confidence?: string;
  soldCount?: number;
  rawResponse?: any;
  source?: string;
}) {
  if (!data.priceEstimate || data.priceEstimate <= 0) return;
  storage.insertPriceObservation({
    cardId: data.cardId ?? null,
    playerName: data.playerName ?? null,
    cardTitle: data.cardTitle ?? null,
    setName: data.setName ?? null,
    year: data.year ?? null,
    variation: data.variation ?? null,
    priceEstimate: data.priceEstimate,
    lowEstimate: data.lowEstimate ?? null,
    highEstimate: data.highEstimate ?? null,
    confidence: data.confidence ?? null,
    source: data.source ?? "gemini",
    soldCount: data.soldCount ?? null,
    rawResponse: data.rawResponse ?? null,
  }).then((obs) => {
    storage.updateMarketSnapshot(
      data.cardId ?? undefined,
      data.playerName ?? undefined,
      data.cardTitle ?? undefined
    ).catch(e => console.error("[Alpha] Snapshot update error:", e.message));
  }).catch(e => console.error("[Alpha] Observation insert error:", e.message));
}

function recordInterestEvent(data: {
  cardId?: number;
  playerName?: string;
  cardTitle?: string;
  eventType: string;
  userId?: string;
}) {
  storage.insertInterestEvent({
    cardId: data.cardId ?? null,
    playerName: data.playerName ?? null,
    cardTitle: data.cardTitle ?? null,
    eventType: data.eventType,
    userId: data.userId ?? null,
  }).catch(e => console.error("[Alpha] Interest event error:", e.message));
}

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
const portfolioNextBuysLastCall = new Map<string, number>(); // Per display case rate limiting

// Portfolio Next Buys Result Cache (1 hour TTL to reduce AI costs)
const portfolioNextBuysCache = new Map<string, {
  data: any;
  generatedAt: string;
  expiresAt: number;
}>();

function checkPortfolioAIRateLimit(userId: string, endpoint: 'outlook' | 'nextbuys' | string): { allowed: boolean; retryAfter?: number } {
  // For portfolio-specific next buys (includes display case ID in key)
  if (endpoint.startsWith('nextbuys-')) {
    const key = `${userId}:${endpoint}`;
    const lastCall = portfolioNextBuysLastCall.get(key);
    const now = Date.now();
    
    if (lastCall && (now - lastCall) < PORTFOLIO_AI_RATE_LIMIT_MS) {
      const retryAfter = Math.ceil((PORTFOLIO_AI_RATE_LIMIT_MS - (now - lastCall)) / 1000);
      return { allowed: false, retryAfter };
    }
    return { allowed: true };
  }
  
  const lastCallMap = endpoint === 'outlook' ? portfolioOutlookLastCall : nextBuysLastCall;
  const lastCall = lastCallMap.get(userId);
  const now = Date.now();
  
  if (lastCall && (now - lastCall) < PORTFOLIO_AI_RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((PORTFOLIO_AI_RATE_LIMIT_MS - (now - lastCall)) / 1000);
    return { allowed: false, retryAfter };
  }
  
  return { allowed: true };
}

function recordPortfolioAICall(userId: string, endpoint: 'outlook' | 'nextbuys' | string) {
  // For portfolio-specific next buys
  if (endpoint.startsWith('nextbuys-')) {
    const key = `${userId}:${endpoint}`;
    portfolioNextBuysLastCall.set(key, Date.now());
    return;
  }
  
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
  setupGoogleAuth(app);

  // Initialize Stripe webhooks and sync
  await initStripe(app);

  // Ensure default promo codes exist
  await ensureDefaultPromoCodes();

  // Helper to get origin URL (prefer HTTPS and deployment domain)
  const getOriginUrl = (req: any) => {
    const host = process.env.REPLIT_DEPLOYMENT_DOMAIN || req.headers.host;
    // Always use HTTPS in production, fallback to forwarded proto or https
    const proto = process.env.REPLIT_DEPLOYMENT_DOMAIN 
      ? 'https' 
      : (req.headers['x-forwarded-proto'] || 'https');
    return `${proto}://${host}`;
  };
  
  // Helper to safely encode content for JSON-LD (prevent script breakout)
  const safeJsonLd = (obj: any) => {
    return JSON.stringify(obj)
      .replace(/<\/script/gi, '<\\/script')
      .replace(/<!--/g, '<\\!--');
  };

  // Robots.txt - allow social media crawlers
  app.get("/robots.txt", (req, res) => {
    const origin = getOriginUrl(req);
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

Sitemap: ${origin}/sitemap.xml
`;
    res.type('text/plain').send(robotsTxt);
  });

  // Social media crawler detection for OG meta tags
  const isSocialCrawler = (userAgent: string) => {
    const crawlers = [
      'facebookexternalhit',
      'Twitterbot', 
      'LinkedInBot',
      'Slackbot',
      'Discordbot',
      'WhatsApp',
      'TelegramBot',
      'Applebot'
    ];
    return crawlers.some(crawler => userAgent.includes(crawler));
  };
  
  // Detect ALL crawlers including search engines and LLM bots for SSR
  const isSearchCrawler = (userAgent: string) => {
    const crawlers = [
      // Search engines
      'Googlebot', 'Bingbot', 'Slurp', 'DuckDuckBot', 'Baiduspider', 'YandexBot',
      // Social crawlers
      'facebookexternalhit', 'Twitterbot', 'LinkedInBot', 'Slackbot', 'Discordbot',
      'WhatsApp', 'TelegramBot', 'Applebot',
      // LLM/AI crawlers
      'GPTBot', 'ChatGPT-User', 'Claude-Web', 'Anthropic', 'CCBot', 'PerplexityBot',
      'YouBot', 'Cohere-ai', 'AI2Bot', 'Bytespider', 'ClaudeBot',
      // Other bots
      'AhrefsBot', 'SemrushBot', 'MJ12bot', 'ia_archiver', 'archive.org_bot'
    ];
    return crawlers.some(crawler => userAgent.toLowerCase().includes(crawler.toLowerCase()));
  };


  // Serve full HTML content for blog post pages (SSR for search engines and LLM crawlers)
  app.get("/blog/:slug", async (req: any, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    
    // Serve SSR for all crawlers (search engines, social bots, LLM crawlers)
    if (!isSearchCrawler(userAgent)) {
      return next();
    }

    try {
      const { slug } = req.params;
      const post = await storage.getBlogPostBySlug(slug);
      
      if (!post || !post.isPublished) return next();

      const origin = getOriginUrl(req);
      const url = `${origin}/blog/${slug}`;
      const title = escapeHtml(post.title || '');
      const rawDescription = post.excerpt || (post.content ? post.content.substring(0, 160) : '');
      const description = escapeHtml(rawDescription);
      const rawImageUrl = post.heroImageUrl || '';
      const imageUrl = rawImageUrl.startsWith('/') ? `${origin}${rawImageUrl}` : rawImageUrl;
      const publishedDate = post.publishedAt ? new Date(post.publishedAt).toISOString() : '';
      
      // Convert content to readable HTML (simple markdown-like conversion)
      // First handle markdown headings, then paragraphs
      const rawContent = post.content || '';
      const contentHtml = rawContent
        .split('\n\n')
        .map(paragraph => {
          const trimmed = paragraph.trim();
          if (!trimmed) return '';
          // Handle markdown headings
          if (trimmed.startsWith('### ')) {
            return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
          }
          if (trimmed.startsWith('## ')) {
            return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
          }
          if (trimmed.startsWith('# ')) {
            return `<h2>${escapeHtml(trimmed.slice(2))}</h2>`;
          }
          // Handle bullet lists
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const items = trimmed.split('\n')
              .filter(line => line.trim().startsWith('- ') || line.trim().startsWith('* '))
              .map(line => `<li>${escapeHtml(line.trim().slice(2))}</li>`)
              .join('');
            return `<ul>${items}</ul>`;
          }
          // Regular paragraph
          return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br/>')}</p>`;
        })
        .filter(Boolean)
        .join('\n');

      const jsonLd = safeJsonLd({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title || '',
        "description": rawDescription,
        "datePublished": post.publishedAt,
        "dateModified": post.updatedAt,
        "mainEntityOfPage": { "@type": "WebPage", "@id": url },
        ...(imageUrl && { "image": imageUrl }),
        "publisher": { "@type": "Organization", "name": "Sports Card Portfolio" }
      });

      // Serve full HTML with actual content (no redirect) for crawlers
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Sports Card Portfolio</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />` : ''}
  ${publishedDate ? `<meta property="article:published_time" content="${publishedDate}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${imageUrl ? `<meta name="twitter:image" content="${imageUrl}" />` : ''}
  <link rel="canonical" href="${url}" />
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .meta { color: #666; margin-bottom: 1.5rem; }
    .content { margin-top: 1.5rem; }
    img { max-width: 100%; height: auto; }
    a { color: #F59E0B; }
  </style>
</head>
<body>
  <article>
    <header>
      <h1>${title}</h1>
      ${publishedDate ? `<p class="meta">Published: ${new Date(post.publishedAt!).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
      ${imageUrl ? `<img src="${imageUrl}" alt="${title}" />` : ''}
    </header>
    <div class="content">
      ${contentHtml}
    </div>
    <footer>
      <p><a href="${origin}/blog">Back to Blog</a> | <a href="${origin}">Sports Card Portfolio</a></p>
    </footer>
  </article>
</body>
</html>`;

      res.type('text/html').send(html);
    } catch (error) {
      console.error('[SSR] Error generating blog post HTML:', error);
      next();
    }
  });

  // Serve full HTML content for blog listing page (SSR for search engines and LLM crawlers)
  app.get("/blog", async (req: any, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    
    if (!isSearchCrawler(userAgent)) {
      return next();
    }

    try {
      const origin = getOriginUrl(req);
      const url = `${origin}/blog`;
      const title = "Blog | Sports Card Portfolio";
      const description = "News, updates, and insights about sports card collecting and investing. Expert tips on building and growing your card portfolio.";
      
      // Get all published blog posts for the listing
      const posts = await storage.getBlogPosts(true);
      
      // Generate list of blog posts as HTML with hero images
      const postsHtml = posts.map(post => {
        const postUrl = `${origin}/blog/${post.slug}`;
        const postTitle = escapeHtml(post.title || '');
        const postExcerpt = escapeHtml(post.excerpt || '');
        const postDate = post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
        const heroImage = post.heroImageUrl ? 
          (post.heroImageUrl.startsWith('/') ? `${origin}${post.heroImageUrl}` : post.heroImageUrl) : '';
        return `
          <article>
            ${heroImage ? `<img src="${heroImage}" alt="${postTitle}" style="max-width:100%;height:auto;margin-bottom:1rem;border-radius:8px;" />` : ''}
            <h2><a href="${postUrl}">${postTitle}</a></h2>
            ${postDate ? `<p class="meta">Published: ${postDate}</p>` : ''}
            <p>${postExcerpt}</p>
            <p><a href="${postUrl}">Read more</a></p>
          </article>
        `;
      }).join('\n');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <link rel="canonical" href="${url}" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    h2 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 0.5rem; }
    article { margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid #eee; }
    a { color: #F59E0B; }
  </style>
</head>
<body>
  <header>
    <h1>Sports Card Portfolio Blog</h1>
    <p>${description}</p>
  </header>
  <main>
    ${posts.length > 0 ? postsHtml : '<p>No blog posts yet. Check back soon!</p>'}
  </main>
  <footer>
    <p><a href="${origin}">Sports Card Portfolio</a> - AI-powered portfolio management for sports card collectors.</p>
  </footer>
</body>
</html>`;

      res.type('text/html').send(html);
    } catch (error) {
      console.error('[SSR] Error generating blog listing HTML:', error);
      next();
    }
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
      res.json({ ...user, authProvider: req.user.authProvider ?? "replit" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Trial activation endpoint
  app.post("/api/trial/activate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const source = req.body?.source || "podcast";
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.subscriptionStatus === "PRO") {
        return res.status(400).json({ message: "You already have an active Pro subscription." });
      }
      if (user.trialEnd) {
        const trialExpired = new Date(user.trialEnd) < new Date();
        if (!trialExpired) {
          return res.status(400).json({ message: "You already have an active trial.", trialEnd: user.trialEnd });
        }
        return res.status(400).json({ message: "You've already used your free trial. Upgrade to Pro for continued access." });
      }
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await storage.activateUserTrial(userId, now, trialEnd, source);
      const updatedUser = await storage.getUser(userId);
      res.json({
        success: true,
        message: `Your 7-day Pro trial is active. Ends on ${trialEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
        trialEnd: trialEnd.toISOString(),
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error activating trial:", error);
      res.status(500).json({ message: "Failed to activate trial" });
    }
  });

  // Onboarding status - check if user needs onboarding (has 0 display cases or 0 cards)
  app.get("/api/user/outlook-usage", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);
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

  app.get("/api/leaderboards", async (req, res) => {
    try {
      const [topLikes, topValue, mostViewed] = await Promise.all([
        storage.getTopLikedDisplayCases(5),
        storage.getTopValueDisplayCases(5),
        storage.getMostViewedDisplayCases(5),
      ]);
      res.json({ topLikes, topValue, mostViewed });
    } catch (error) {
      console.error("Error fetching leaderboards:", error);
      res.status(500).json({ message: "Failed to fetch leaderboards" });
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
      
      // Log case view activity (fire and forget)
      logActivity("case_view", {
        userId: null,
        targetId: id,
        targetType: "display_case",
        metadata: { 
          caseName: displayCase.name,
          ownerId: displayCase.userId,
        },
        req,
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

  // Outlook share image generation endpoint (POST with data)
  app.post("/api/share-image/outlook", async (req, res) => {
    try {
      const { playerName, cardTitle, sport, position, action, fairValue, upsideScore, riskScore, confidenceLevel, shortExplanation, imagePath } = req.body;
      
      if (!playerName || !cardTitle || !action) {
        return res.status(400).json({ message: "Missing required fields: playerName, cardTitle, action" });
      }
      
      const baseUrl = process.env.REPLIT_DEPLOYMENT_DOMAIN 
        ? `https://${process.env.REPLIT_DEPLOYMENT_DOMAIN}`
        : `https://${req.headers.host}`;
      
      const outlookData: OutlookShareData = {
        playerName,
        cardTitle,
        sport,
        position,
        action,
        fairValue,
        upsideScore,
        riskScore,
        confidenceLevel,
        shortExplanation,
        imagePath,
      };
      
      const imageBuffer = await generateOutlookShareImage(outlookData, baseUrl);
      
      res.set({
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length,
        "Cache-Control": "no-cache",
      });
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error generating outlook share image:", error);
      res.status(500).json({ message: "Failed to generate outlook share image" });
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
      
      // Use custom domain for OG URLs to ensure social previews work correctly
      const customDomain = process.env.CUSTOM_DOMAIN || "sportscardportfolio.io";
      const baseUrl = `https://${customDomain}`;
      
      const data = await getPlayerShareData(sanitizedSlug);
      const playerName = data?.playerName || sanitizedSlug.replace(/-/g, " ");
      const verdict = data?.verdict || "HOLD_CORE";
      const oneLineRationale = data?.oneLineRationale || "AI-powered investment analysis for sports card collectors";
      
      const verdictLabels: Record<string, string> = {
        ACCUMULATE: "Accumulate",
        HOLD_CORE: "Hold",
        HOLD_ROLE_RISK: "Hold (Role Risk)",
        HOLD_INJURY_CONTINGENT: "Hold (Injury Upside)",
        TRADE_THE_HYPE: "Trade the Hype",
        AVOID_NEW_MONEY: "Avoid",
        AVOID_STRUCTURAL: "Avoid",
        SPECULATIVE_FLYER: "Speculative",
        SPECULATIVE_SUPPRESSED: "Speculative (Suppressed)",
        MONITOR: "Monitor",
        WATCH: "Watch",
      };
      const verdictLabel = verdictLabels[verdict] || verdict.replace(/_/g, " ");
      
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
      
      // For humans, redirect to the SPA player outlook page with pre-filled search
      // Include shared=true so the frontend knows to fetch cached data without auth
      res.redirect(`/player-outlook?player=${encodeURIComponent(playerName)}&shared=true`);
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

  // Known page slugs that should be handled by this route
  const knownPageSlugs = new Set(["next-buys", "hidden-gems", "portfolio-analytics", "player-outlook", "watchlist"]);
  
  // Page share routes with OG meta tags for social crawlers
  app.get("/share/:pageSlug", async (req, res, next) => {
    try {
      const { pageSlug } = req.params;
      const userAgent = req.headers["user-agent"] || "";
      
      // Sanitize pageSlug (only allow alphanumeric and hyphens)
      const sanitizedSlug = pageSlug.replace(/[^a-z0-9-]/gi, "").toLowerCase();
      
      // Skip if it's a player share route (handled separately)
      if (sanitizedSlug === "player") {
        return res.status(404).json({ message: "Not found" });
      }
      
      // If this is NOT a known page slug, it's likely a snapshot token
      // Pass it through to the SPA to handle
      if (!knownPageSlugs.has(sanitizedSlug)) {
        return next();
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
      if (!hasProAccess(user)) {
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
      
      logActivity("case_create", {
        userId,
        targetId: displayCase.id,
        targetType: "display_case",
        metadata: { name: displayCase.name },
        req,
      });
      
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
      if (!hasProAccess(user)) {
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
      if (!hasProAccess(user)) {
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

  // Bulk add cards from scan history to a display case
  app.post("/api/display-cases/:id/cards/bulk-from-scans", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { scanHistoryIds } = req.body;

      if (isNaN(displayCaseId)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      if (!Array.isArray(scanHistoryIds) || scanHistoryIds.length === 0) {
        return res.status(400).json({ message: "No scan history IDs provided" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(displayCaseId, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      const results: { scanHistoryId: number; success: boolean; cardId?: number; error?: string }[] = [];
      const validIds = [...new Set(scanHistoryIds.map(Number).filter((n: number) => !isNaN(n)))];
      const scans = await storage.getScanHistoryByIds(validIds, userId);
      const scanMap = new Map(scans.map(s => [s.id, s]));

      for (const scanId of validIds) {
        try {
          const scan = scanMap.get(scanId);
          if (!scan) {
            results.push({ scanHistoryId: scanId, success: false, error: "Scan not found" });
            continue;
          }

          const title = [scan.playerName, scan.year, scan.setName].filter(Boolean).join(" ");
          const cardData = {
            title: title || "Unknown Card",
            playerName: scan.playerName || null,
            year: scan.year || null,
            set: scan.setName || null,
            cardNumber: scan.cardNumber || null,
            variation: scan.variation || null,
            grade: scan.grade || null,
            grader: scan.grader === "raw" ? null : (scan.grader || null),
            sport: scan.sport || null,
            imagePath: scan.imagePath || null,
            estimatedValue: scan.marketValue || null,
            cardCategory: "sports" as const,
          };

          const parsed = insertCardSchema.safeParse(cardData);
          if (!parsed.success) {
            results.push({ scanHistoryId: scanId, success: false, error: "Invalid card data" });
            continue;
          }

          const card = await storage.createCard(displayCaseId, parsed.data);
          results.push({ scanHistoryId: scanId, success: true, cardId: card.id });

          logActivity("card_add", {
            userId,
            targetId: card.id,
            targetType: "card",
            metadata: { title: card.title, playerName: card.playerName, displayCaseId, source: "batch_scan" },
          }, req);
        } catch (err: any) {
          results.push({ scanHistoryId: scanId, success: false, error: err.message || "Failed" });
        }
      }

      const successCount = results.filter(r => r.success).length;
      res.status(201).json({ results, successCount, totalCount: scanHistoryIds.length });
    } catch (error) {
      console.error("Error bulk adding cards from scans:", error);
      res.status(500).json({ message: "Failed to bulk add cards" });
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
        console.error("Card validation failed:", parsed.error.errors);
        console.error("Card data received:", JSON.stringify(cardData, null, 2));
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const card = await storage.createCard(displayCaseId, parsed.data);
      
      logActivity("card_add", {
        userId,
        targetId: card.id,
        targetType: "card",
        metadata: { 
          title: card.title, 
          playerName: card.playerName,
          displayCaseId,
        },
        req,
      });
      recordInterestEvent({ cardId: card.id, playerName: card.playerName ?? undefined, cardTitle: card.title, eventType: "add", userId });
      
      res.status(201).json(card);
    } catch (error: any) {
      console.error("Error creating card:", error);
      console.error("Error details:", error?.message, error?.code);
      res.status(500).json({ message: "Failed to create card", error: error?.message });
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

  app.post("/api/display-cases/:displayCaseId/cards/auto-order", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.displayCaseId);
      const userId = req.user.claims.sub;
      const { orderBy } = req.body;

      if (isNaN(displayCaseId)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const validOrderOptions = ["alpha", "year_newest", "year_oldest", "value_high", "value_low"];
      if (!validOrderOptions.includes(orderBy)) {
        return res.status(400).json({ message: "Invalid orderBy option" });
      }

      const existing = await storage.getDisplayCaseByIdAndUser(displayCaseId, userId);
      if (!existing) {
        return res.status(404).json({ message: "Display case not found" });
      }

      await storage.autoOrderCards(displayCaseId, orderBy);
      
      const updated = await storage.getDisplayCase(displayCaseId);
      res.json(updated);
    } catch (error) {
      console.error("Error auto-ordering cards:", error);
      res.status(500).json({ message: "Failed to auto-order cards" });
    }
  });

  // Price lookup for a single card (Pro feature)
  app.post("/api/cards/:cardId/lookup-price", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;

      // Check if user has Pro subscription
      const user = await storage.getUser(userId);
      if (!hasProAccess(user)) {
        return res.status(403).json({ 
          message: "AI price lookup is a Pro feature. Upgrade to Pro to automatically refresh card values." 
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

      let variationForLookup = card.variation;
      if (card.serialNumber === 1 && !(card.variation || "").toLowerCase().includes("1/1")) {
        variationForLookup = ((card.variation || "") + " 1/1").trim();
      }
      
      const result = await lookupCardPrice({
        title: card.title,
        set: card.set,
        year: card.year,
        variation: variationForLookup,
        grade: card.grade,
        grader: card.grader,
      });

      // If we got a value, update the card and clear any manual override
      // (user explicitly requested a refresh, so the new value should take precedence)
      if (result.estimatedValue !== null) {
        await storage.updateCard(cardId, { 
          estimatedValue: result.estimatedValue,
          manualValue: null, // Clear manual override when refreshing
        });
      }

      res.json({
        ...result,
        cardId,
        updated: result.estimatedValue !== null,
      });
    } catch (error: any) {
      console.error("Error looking up card price:", error);
      // Provide more specific error messages based on error type
      if (error.message?.includes("SERPER_API_KEY")) {
        res.status(500).json({ message: "Price lookup service not configured" });
      } else if (error.message?.includes("Serper API error")) {
        res.status(502).json({ message: "Price lookup service temporarily unavailable. Please try again in a moment." });
      } else if (error.message?.includes("AI price analysis failed")) {
        res.status(502).json({ message: "Price analysis temporarily unavailable. Please try again in a moment." });
      } else if (error.status === 429 || error.message?.includes("rate limit")) {
        res.status(429).json({ message: "Too many requests. Please wait a moment before trying again." });
      } else {
        res.status(500).json({ message: "Failed to lookup card price. Please try again." });
      }
    }
  });

  // Bulk price lookup for all cards in a display case (Pro feature)
  interface RefreshJob {
    status: "running" | "complete";
    displayCaseId: number;
    total: number;
    completed: number;
    failed: number;
    startedAt: number;
    results: Array<{ cardId: number; title: string; oldValue: number | null; newValue: number | null; confidence: string; details?: string }>;
  }
  const refreshJobs = new Map<string, RefreshJob>();

  async function runRefreshJob(jobKey: string, cardsToProcess: any[]): Promise<void> {
    const job = refreshJobs.get(jobKey);
    if (!job) return;

    for (const card of cardsToProcess) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        let bulkVariation = card.variation;
        if (card.serialNumber === 1 && !(card.variation || "").toLowerCase().includes("1/1")) {
          bulkVariation = ((card.variation || "") + " 1/1").trim();
        }

        const result = await lookupCardPrice({
          title: card.title,
          set: card.set,
          year: card.year,
          variation: bulkVariation,
          grade: card.grade,
          grader: card.grader,
        });

        const oldValue = card.manualValue ?? card.estimatedValue;
        let newValue = oldValue;

        if (result.estimatedValue !== null) {
          await storage.updateCard(card.id, {
            estimatedValue: result.estimatedValue,
            manualValue: null,
          });
          newValue = result.estimatedValue;
        }

        job.completed++;
        job.results.push({
          cardId: card.id,
          title: card.title,
          oldValue,
          newValue,
          confidence: result.confidence,
          details: result.details,
        });
        console.log(`[Refresh Prices] ${job.completed}/${job.total} - ${card.title}: $${oldValue} → $${newValue}`);
      } catch (cardError: any) {
        console.error(`[Refresh Prices] Failed for card ${card.id}:`, cardError.message);
        job.failed++;
        job.completed++;
        job.results.push({
          cardId: card.id,
          title: card.title,
          oldValue: card.estimatedValue,
          newValue: card.estimatedValue,
          confidence: "low",
          details: "Lookup failed",
        });
      }
    }

    job.status = "complete";
    console.log(`[Refresh Prices] Job ${jobKey} complete: ${job.completed}/${job.total} (${job.failed} failed)`);
  }

  app.post("/api/display-cases/:id/refresh-prices", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      const user = await storage.getUser(userId);
      if (!hasProAccess(user)) {
        return res.status(403).json({ 
          message: "AI price lookup is a Pro feature. Upgrade to Pro to automatically refresh card values." 
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

      const jobKey = `${userId}:${displayCaseId}`;
      const existing = refreshJobs.get(jobKey);
      if (existing && existing.status === "running") {
        return res.json({ status: "running", total: existing.total, completed: existing.completed, displayCaseId });
      }

      const job: RefreshJob = {
        status: "running",
        displayCaseId,
        total: fullCase.cards.length,
        completed: 0,
        failed: 0,
        startedAt: Date.now(),
        results: [],
      };
      refreshJobs.set(jobKey, job);

      runRefreshJob(jobKey, fullCase.cards).catch(err => {
        console.error("[Refresh Prices] Unhandled job error:", err);
        const j = refreshJobs.get(jobKey);
        if (j) j.status = "complete";
      });

      res.json({ status: "running", total: fullCase.cards.length, completed: 0, displayCaseId });
    } catch (error) {
      console.error("Error refreshing prices:", error);
      res.status(500).json({ message: "Failed to refresh prices" });
    }
  });

  app.get("/api/display-cases/:id/refresh-prices/status", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const displayCaseId = parseInt(req.params.id);
    const jobKey = `${userId}:${displayCaseId}`;
    const job = refreshJobs.get(jobKey);

    if (!job) {
      return res.json({ status: "idle", total: 0, completed: 0, failed: 0, results: [] });
    }

    res.json({
      status: job.status,
      displayCaseId: job.displayCaseId,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      results: job.results,
      startedAt: job.startedAt,
    });

    if (job.status === "complete" && (Date.now() - job.startedAt > 10000)) {
      refreshJobs.delete(jobKey);
    }
  });

  // Portfolio-specific Next Buys - Generate themed recommendations for a specific display case (Pro feature)
  app.post("/api/display-cases/:id/next-buys", isAuthenticated, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      // Check if user has Pro subscription
      const user = await storage.getUser(userId);
      if (!hasProAccess(user)) {
        return res.status(403).json({ 
          message: "Portfolio Next Buys is a Pro feature. Upgrade to Pro to get themed recommendations for your collections.",
          proRequired: true
        });
      }

      if (isNaN(displayCaseId)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      // Rate limit to prevent abuse (1 call per 30 seconds per display case)
      const rateCheck = checkPortfolioAIRateLimit(userId, `nextbuys-${displayCaseId}`);
      if (!rateCheck.allowed) {
        return res.status(429).json({ 
          message: `Please wait ${rateCheck.retryAfter} seconds before refreshing.`,
          rateLimited: true,
          retryAfter: rateCheck.retryAfter
        });
      }

      // Check cache first (1 hour TTL) to save on AI costs
      const cacheKey = `nextbuys-${displayCaseId}`;
      const cached = portfolioNextBuysCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(`[Portfolio Next Buys] Returning cached result for display case ${displayCaseId}`);
        return res.json({
          ...cached.data,
          displayCaseId,
          generatedAt: cached.generatedAt,
          cached: true,
        });
      }

      console.log(`[Portfolio Next Buys] Generating for display case ${displayCaseId}...`);
      recordPortfolioAICall(userId, `nextbuys-${displayCaseId}`);
      
      const analysis = await generatePortfolioNextBuys(displayCaseId, userId);
      const generatedAt = new Date().toISOString();
      
      // Cache the result for 1 hour
      portfolioNextBuysCache.set(cacheKey, {
        data: analysis,
        generatedAt,
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
      });
      
      res.json({
        ...analysis,
        displayCaseId,
        generatedAt,
      });
    } catch (error: any) {
      console.error("[Portfolio Next Buys] Error:", error);
      if (error.message === "Display case not found or access denied") {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to generate recommendations" });
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
      if (!hasProAccess(user)) {
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

      recordPriceObservation({
        cardId,
        playerName: enrichedCard.playerName ?? undefined,
        cardTitle: card.title,
        setName: card.set ?? undefined,
        year: card.year ?? undefined,
        variation: card.variation ?? undefined,
        priceEstimate: card.estimatedValue ?? 0,
        source: "outlook",
      });
      recordInterestEvent({ cardId, playerName: enrichedCard.playerName ?? undefined, cardTitle: card.title, eventType: "analyze", userId: (req as any).user?.id });

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
        isPro = hasProAccess(user);
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
      if (!user || !hasProAccess(user)) {
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
  // ── Per-card background analysis job store ──────────────────────────────
  // Key: `${userId}:${cardId}`, Value: job status
  const cardAnalysisJobs = new Map<string, "pending" | "complete" | "failed">();

  async function runCardAnalysisJob(userId: string, cardId: number, card: any): Promise<void> {
    const jobKey = `${userId}:${cardId}`;
    try {
      const { computeAllSignals, generateOutlookExplanation, fetchPlayerNews, fetchGeminiMarketData, fetchMonthlyPriceHistory } = await import("./outlookEngine");
      const { lookupEnhancedCardPrice, filterPriceOutliers } = await import("./priceService");

      console.log(`[Outlook 2.0] Fetching market data in parallel for card ${cardId}`);
      const [geminiMarketData, priceData, monthlyPriceHistory] = await Promise.all([
        fetchGeminiMarketData({
          title: card.title, playerName: card.playerName, year: card.year,
          set: card.set, variation: card.variation, grade: card.grade, grader: card.grader,
        }),
        lookupEnhancedCardPrice({
          title: card.title, set: card.set, year: card.year,
          variation: card.variation, grade: card.grade, grader: card.grader,
        }),
        card.playerName ? fetchMonthlyPriceHistory({
          playerName: card.playerName, sport: card.sport || "football",
          year: card.year?.toString(), setName: card.set || undefined,
          variation: card.variation || undefined, grade: card.grade || undefined, grader: card.grader || undefined,
        }).catch((err: any) => {
          console.warn(`[Outlook 2.0] Monthly price history fetch failed (non-critical): ${err.message}`);
          return null;
        }) : Promise.resolve(null),
      ]);

      const pricePointsForSchema = priceData.pricePoints.map((pp: any) => ({
        date: pp.date, price: pp.price, source: pp.source, url: pp.url,
      }));
      const filteredPriceData = filterPriceOutliers(priceData.pricePoints);
      console.log(`[Outlook 2.0] Computing signals for card ${cardId}`);
      const signals = computeAllSignals(card, priceData.pricePoints, priceData.estimatedValue);

      if (geminiMarketData) {
        const activeListings = geminiMarketData.activeListing || 0;
        const soldCount = geminiMarketData.soldCount || 0;
        const monthlyVolume = geminiMarketData.monthlySalesVolume || 0;
        const geminiLiquidity = (geminiMarketData.liquidity || "MEDIUM").toUpperCase();
        console.log(`[Outlook 2.0] Enhancing signals with Gemini market data: ${soldCount} sold, ${activeListings} active listings, monthlyVolume=${monthlyVolume}, liquidity=${geminiLiquidity}, avg $${geminiMarketData.avgPrice}`);

        if (geminiLiquidity === "HIGH" || monthlyVolume >= 100 || soldCount >= 20 || activeListings >= 30) {
          signals.liquidityScore = 10;
        } else if (soldCount >= 12 || activeListings >= 20) {
          signals.liquidityScore = 9;
        } else if (soldCount >= 8 || activeListings >= 12) {
          signals.liquidityScore = 8;
        } else if (soldCount >= 5 || activeListings >= 8) {
          signals.liquidityScore = 7;
        } else if (soldCount >= 3) {
          signals.liquidityScore = 5;
        } else if (soldCount >= 1) {
          signals.liquidityScore = 3;
        } else {
          if (geminiLiquidity === "MEDIUM") signals.liquidityScore = 4;
          else if (geminiLiquidity === "LOW") signals.liquidityScore = 2;
          else signals.liquidityScore = 1;
        }
        if (geminiMarketData.soldCount >= 10) {
          signals.dataConfidence = "HIGH";
          signals.confidenceReason = `${geminiMarketData.soldCount} recent sales found on eBay`;
        } else if (geminiMarketData.soldCount >= 5) {
          signals.dataConfidence = "MEDIUM";
          signals.confidenceReason = `${geminiMarketData.soldCount} recent sales found - moderate sample size`;
        }
        if (monthlyVolume >= 500) signals.marketFriction = Math.min(signals.marketFriction, 20);
        else if (geminiLiquidity === "HIGH" || monthlyVolume >= 100) signals.marketFriction = Math.min(signals.marketFriction, 30);
        else if (geminiLiquidity === "MEDIUM" || monthlyVolume >= 50) signals.marketFriction = Math.min(signals.marketFriction, 50);
        signals.demandScore = Math.round((signals.liquidityScore * 0.4) + (signals.sportScore * 0.3) + (signals.positionScore * 0.3)) * 10;
        const { computeAction } = await import("./outlookEngine");
        const originalAction = signals.action;
        const { action: recomputedAction, reasons: recomputedReasons } = computeAction(
          signals.qualityScore, signals.demandScore, signals.momentumScore, signals.trendScore,
          signals.volatilityScore, signals.liquidityScore, geminiMarketData.avgPrice,
          signals.careerStageAuto, card.year ?? undefined
        );
        signals.action = recomputedAction;
        signals.actionReasons = recomputedReasons;
        console.log(`[Outlook 2.0] Recomputed action with Gemini liquidity: ${recomputedAction} (was ${originalAction})`);
      }

      const { isOneOfOneCard } = await import("./priceService");
      const cardVariation = card.variation || "";
      const is1of1 = isOneOfOneCard({ title: card.title, variation: cardVariation, serialNumber: (card as any).serialNumber });
      const isLowPop = /\/\s*[1-9]\b|\/\s*[1-4]\d\b/.test(cardVariation);

      let marketValue = priceData.estimatedValue;
      let priceMin = filteredPriceData.min;
      let priceMax = filteredPriceData.max;
      let compCount = priceData.salesFound;

      if (geminiMarketData && geminiMarketData.avgPrice > 0) {
        if (geminiMarketData.soldCount > 0 || is1of1 || isLowPop) {
          if (is1of1 || isLowPop) console.log(`[Outlook 2.0] 1/1 or low-pop card detected — trusting Gemini valuation: $${geminiMarketData.avgPrice}`);
          if ((is1of1 || isLowPop) && marketValue && marketValue > geminiMarketData.avgPrice * 2) {
            console.warn(`[Outlook 2.0] Price service value ($${marketValue}) is >2x Gemini ($${geminiMarketData.avgPrice}) for 1/1 card — using Gemini`);
          }
          marketValue = geminiMarketData.avgPrice;
          priceMin = geminiMarketData.minPrice;
          priceMax = geminiMarketData.maxPrice;
          compCount = geminiMarketData.soldCount;
          if (marketValue && priceMin != null && priceMin < marketValue * 0.15) {
            priceMin = Math.round(marketValue * 0.6);
          }
        }
      }

      if (pricePointsForSchema.length > 0 && !is1of1 && !isLowPop) {
        const ppPrices = pricePointsForSchema.map((pp: any) => pp.price).filter((p: number) => typeof p === 'number' && p > 0);
        if (ppPrices.length >= 2 && marketValue && marketValue > 0) {
          const sortedPrices = [...ppPrices].sort((a: number, b: number) => a - b);
          const ppMedian = sortedPrices[Math.floor(sortedPrices.length / 2)];
          const ratio = marketValue / ppMedian;
          const geminiSoldCount = geminiMarketData?.soldCount ?? 0;
          
          if (geminiSoldCount <= 3 && ratio > 2.5 && ppPrices.length >= 2) {
            const ceiling = Math.round(ppMedian * 2 * 100) / 100;
            console.warn(`[Outlook 2.0] LOW-COMP CROSS-VALIDATION: Gemini $${marketValue} (${geminiSoldCount} comps) is ${ratio.toFixed(1)}x legacy median $${ppMedian.toFixed(2)} (${ppPrices.length} legacy comps). Capping at $${ceiling} (2x legacy median).`);
            marketValue = ceiling;
            priceMin = Math.round(ppMedian * 0.8 * 100) / 100;
            priceMax = Math.round(ppMedian * 2.5 * 100) / 100;
          } else if (ratio > 3) {
            console.log(`[Outlook 2.0] CROSS-VALIDATION (info only): Gemini $${marketValue} (${geminiSoldCount} comps) is ${ratio.toFixed(1)}x higher than legacy median $${ppMedian.toFixed(2)}. Trusting Gemini — has ${geminiSoldCount} comps.`);
          }
        }
      }

      const outlookTrendHasRealSales = monthlyPriceHistory?.hasAnySales === true;
      if (monthlyPriceHistory && monthlyPriceHistory.dataPoints && monthlyPriceHistory.dataPoints.length > 0 && outlookTrendHasRealSales) {
        const recentPoints = monthlyPriceHistory.dataPoints.slice(-3);
        const recentAvg = recentPoints.reduce((sum: number, p: any) => sum + (p.avgPrice || 0), 0) / recentPoints.length;
        if (recentAvg > 0 && (!marketValue || marketValue <= 0)) {
          console.log(`[Outlook 2.0] PRICE-TREND FALLBACK: No market value, using trend avg $${recentAvg.toFixed(2)}`);
          marketValue = Math.round(recentAvg * 100) / 100;
          const allPrices = monthlyPriceHistory.dataPoints.map((p: any) => p.avgPrice || 0).filter((p: number) => p > 0);
          if (allPrices.length > 0) { priceMin = Math.min(...allPrices); priceMax = Math.max(...allPrices); }
        } else if (recentAvg > 0 && marketValue && marketValue > 0) {
          const ratio = marketValue / recentAvg;
          if (ratio < 0.33 || ratio > 3) console.log(`[Outlook 2.0] PRICE-TREND INFO: Gemini $${marketValue} differs from trend avg $${recentAvg.toFixed(2)} (ratio ${ratio.toFixed(2)}). Trusting Gemini.`);
        }
      } else if (monthlyPriceHistory && !outlookTrendHasRealSales) {
        console.log(`[Outlook 2.0] PRICE-TREND: Skipping — trend data has NO real sales (all salesCount=0)`);
      }

      let finalAction = signals.action;
      let finalActionReasons = [...signals.actionReasons];
      if (!geminiMarketData) {
        const matchConfidence = priceData.matchConfidence;
        if (matchConfidence && matchConfidence.tier === "LOW") {
          finalAction = "MONITOR";
          finalActionReasons = [`Low data confidence: ${matchConfidence.reason}`, ...finalActionReasons];
        }
      }

      let newsSnippets: string[] = [];
      if (card.cardCategory === "sports" && card.playerName) {
        console.log(`[Outlook 2.0] Fetching real-time news for ${card.playerName}`);
        const newsData = await fetchPlayerNews(card.playerName, card.sport);
        newsSnippets = newsData.snippets;
      }

      console.log(`[Outlook 2.0] Generating AI explanation for ${finalAction}`);
      const signalsForExplanation = { ...signals, action: finalAction, actionReasons: finalActionReasons };
      const explanation = await generateOutlookExplanation(card, signalsForExplanation, priceData.pricePoints, marketValue, newsSnippets);

      const outlookData = {
        cardId,
        pricePoints: pricePointsForSchema,
        marketValue: marketValue ? Math.round(marketValue * 100) : null,
        priceMin: priceMin ? Math.round(priceMin * 100) : null,
        priceMax: priceMax ? Math.round(priceMax * 100) : null,
        compCount,
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
      await storage.recordOutlookUsage(userId, 'collection', cardId, card.title);

      const supplyGrowth = geminiMarketData?.supply?.supplyGrowth || null;
      const cardUpdate: any = {
        outlookBigMover: signals.bigMoverFlag,
        outlookBigMoverReason: signals.bigMoverReason,
        outlookAction: finalAction,
        outlookUpsideScore: signals.upsideScore,
        outlookRiskScore: signals.downsideRisk,
        outlookSupplyGrowth: supplyGrowth,
      };
      if (marketValue) {
        cardUpdate.previousValue = card.estimatedValue || null;
        cardUpdate.estimatedValue = marketValue;
        cardUpdate.valueUpdatedAt = new Date();
      }
      await storage.updateCard(cardId, cardUpdate);

      cardAnalysisJobs.set(jobKey, "complete");
      console.log(`[Outlook 2.0] Background analysis complete for card ${cardId}: ${finalAction}`);
    } catch (err: any) {
      console.error(`[Outlook 2.0] Background analysis failed for card ${cardId}:`, err.message);
      cardAnalysisJobs.set(jobKey, "failed");
    }
  }

  app.post("/api/cards/:cardId/outlook-v2", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;

      // Check subscription - free users get 3 analyses per month
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);
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

      // Return immediately and run analysis in the background
      const jobKey = `${userId}:${cardId}`;
      const existingJob = cardAnalysisJobs.get(jobKey);
      if (existingJob === "pending") {
        return res.json({ status: "pending", message: "Analysis already in progress" });
      }

      cardAnalysisJobs.set(jobKey, "pending");
      runCardAnalysisJob(userId, cardId, card).catch(err => {
        console.error(`[Outlook 2.0] Unhandled job error for card ${cardId}:`, err);
        cardAnalysisJobs.set(jobKey, "failed");
      });

      return res.json({ status: "pending", cardId, message: "Analysis started in background" });
    } catch (error) {
      console.error("Error starting outlook v2:", error);
      res.status(500).json({ message: "Failed to start card analysis" });
    }
  });

  // NOTE: The old synchronous analysis body was removed — see runCardAnalysisJob above.
  // Intentionally keeping this placeholder to confirm the edit was applied.
  // PLACEHOLDER_TO_REMOVE - begin dead code that needs deletion
  // ── Background batch analysis job store ─────────────────────────────────
  interface BatchJob {
    status: "running" | "complete" | "stopped";
    total: number;
    completed: number;
    failed: number;
    shouldStop: boolean;
    startedAt: number;
    results: Array<{ id: number; title: string; action?: string; bigMover?: boolean; marketValue?: number; error?: string }>;
  }
  const batchJobs = new Map<string, BatchJob>();

  async function runBatchAnalysisJob(userId: string, cards: any[]): Promise<void> {
    const job = batchJobs.get(userId);
    if (!job) return;

    const { computeAllSignals, generateOutlookExplanation, fetchPlayerNews, fetchGeminiMarketData, fetchMonthlyPriceHistory, computeAction } = await import("./outlookEngine");
    const { lookupEnhancedCardPrice, isOneOfOneCard } = await import("./priceService");

    for (const card of cards) {
      if (job.shouldStop) break;

      try {
        const [geminiMarketData, priceData] = await Promise.all([
          fetchGeminiMarketData({
            title: card.title,
            playerName: card.playerName,
            year: card.year,
            set: card.set,
            variation: card.variation,
            grade: card.grade,
            grader: card.grader,
          }),
          lookupEnhancedCardPrice({
            title: card.title,
            set: card.set,
            year: card.year,
            variation: card.variation,
            grade: card.grade,
            grader: card.grader,
          }),
        ]);

        if (job.shouldStop) break;

        const pricePointsForSchema = priceData.pricePoints.map((pp: any) => ({
          date: pp.date, price: pp.price, source: pp.source, url: pp.url,
        }));

        const signals = computeAllSignals(card, priceData.pricePoints, priceData.estimatedValue);

        if (geminiMarketData) {
          const bActiveListings = geminiMarketData.activeListing || 0;
          const bSoldCount = geminiMarketData.soldCount || 0;
          const bMonthlyVolume = geminiMarketData.monthlySalesVolume || 0;
          const bGeminiLiquidity = (geminiMarketData.liquidity || "MEDIUM").toUpperCase();

          if (bGeminiLiquidity === "HIGH" || bMonthlyVolume >= 100 || bSoldCount >= 20 || bActiveListings >= 30) {
            signals.liquidityScore = 10;
          } else if (bSoldCount >= 12 || bActiveListings >= 20) {
            signals.liquidityScore = 9;
          } else if (bSoldCount >= 8 || bActiveListings >= 12) {
            signals.liquidityScore = 8;
          } else if (bSoldCount >= 5 || bActiveListings >= 8) {
            signals.liquidityScore = 7;
          } else if (bSoldCount >= 3) {
            signals.liquidityScore = 5;
          } else if (bSoldCount >= 1) {
            signals.liquidityScore = 3;
          } else {
            if (bGeminiLiquidity === "MEDIUM") signals.liquidityScore = 4;
            else if (bGeminiLiquidity === "LOW") signals.liquidityScore = 2;
            else signals.liquidityScore = 1;
          }
          if (geminiMarketData.soldCount >= 10) {
            signals.dataConfidence = "HIGH";
            signals.confidenceReason = `${geminiMarketData.soldCount} recent sales found on eBay`;
          } else if (geminiMarketData.soldCount >= 5) {
            signals.dataConfidence = "MEDIUM";
            signals.confidenceReason = `${geminiMarketData.soldCount} recent sales found - moderate sample size`;
          }
          if (bMonthlyVolume >= 500) signals.marketFriction = Math.min(signals.marketFriction, 20);
          else if (bGeminiLiquidity === "HIGH" || bMonthlyVolume >= 100) signals.marketFriction = Math.min(signals.marketFriction, 30);
          else if (bGeminiLiquidity === "MEDIUM" || bMonthlyVolume >= 50) signals.marketFriction = Math.min(signals.marketFriction, 50);
          signals.demandScore = Math.round((signals.liquidityScore * 0.4) + (signals.sportScore * 0.3) + (signals.positionScore * 0.3)) * 10;
          const { action: recomputedAction, reasons: recomputedReasons } = computeAction(
            signals.qualityScore, signals.demandScore, signals.momentumScore, signals.trendScore,
            signals.volatilityScore, signals.liquidityScore, geminiMarketData.avgPrice,
            signals.careerStageAuto, card.year ?? undefined
          );
          signals.action = recomputedAction;
          signals.actionReasons = recomputedReasons;
        }

        const cardVariation = card.variation || "";
        const is1of1 = isOneOfOneCard({ title: card.title, variation: cardVariation, serialNumber: (card as any).serialNumber });
        const isLowPop = /\/\s*[1-9]\b|\/\s*[1-4]\d\b/.test(cardVariation);

        let marketValue = priceData.estimatedValue;
        let priceMin = priceData.pricePoints.length > 0 ? Math.min(...priceData.pricePoints.map((p: any) => p.price)) : null;
        let priceMax = priceData.pricePoints.length > 0 ? Math.max(...priceData.pricePoints.map((p: any) => p.price)) : null;
        let compCount = priceData.pricePoints.length;

        if (geminiMarketData && geminiMarketData.avgPrice > 0) {
          if (geminiMarketData.soldCount > 0 || is1of1 || isLowPop) {
            marketValue = geminiMarketData.avgPrice;
            compCount = geminiMarketData.soldCount;
            if (geminiMarketData.lowPrice) priceMin = geminiMarketData.lowPrice;
            if (geminiMarketData.highPrice) priceMax = geminiMarketData.highPrice;
          }
        }

        if (priceData.pricePoints.length > 0 && !is1of1 && !isLowPop) {
          const ppPrices = priceData.pricePoints.map((p: any) => p.price).filter((p: number) => typeof p === 'number' && p > 0);
          if (ppPrices.length >= 2 && marketValue && marketValue > 0) {
            const sortedPrices = [...ppPrices].sort((a: number, b: number) => a - b);
            const ppMedian = sortedPrices[Math.floor(sortedPrices.length / 2)];
            const batchRatio = marketValue / ppMedian;
            const batchGeminiComps = geminiMarketData?.soldCount ?? 0;
            if (batchGeminiComps <= 3 && batchRatio > 2.5) {
              const batchCeiling = Math.round(ppMedian * 2 * 100) / 100;
              console.warn(`[Batch Outlook] LOW-COMP CROSS-VALIDATION: Gemini $${marketValue} (${batchGeminiComps} comps) is ${batchRatio.toFixed(1)}x legacy median $${ppMedian.toFixed(2)}. Capping at $${batchCeiling}.`);
              marketValue = batchCeiling;
              priceMin = Math.round(ppMedian * 0.8 * 100) / 100;
              priceMax = Math.round(ppMedian * 2.5 * 100) / 100;
            }
          }
        }

        let finalAction = signals.action;
        let finalActionReasons = [...signals.actionReasons];
        if (!geminiMarketData) {
          const matchConfidence = priceData.matchConfidence;
          if (matchConfidence && matchConfidence.tier === "LOW") {
            finalAction = "MONITOR";
            finalActionReasons = [`Low data confidence: ${matchConfidence.reason}`, ...finalActionReasons];
          }
        }

        if (job.shouldStop) break;

        let newsSnippets: string[] = [];
        if (card.cardCategory === "sports" && card.playerName) {
          const newsData = await fetchPlayerNews(card.playerName, card.sport);
          newsSnippets = newsData.snippets;
        }

        if (job.shouldStop) break;

        const signalsForExplanation = { ...signals, action: finalAction, actionReasons: finalActionReasons };
        const explanation = await generateOutlookExplanation(card, signalsForExplanation, priceData.pricePoints, marketValue, newsSnippets);

        const outlookData = {
          cardId: card.id, pricePoints: pricePointsForSchema,
          marketValue: marketValue ? Math.round(marketValue * 100) : null,
          priceMin: priceMin ? Math.round(priceMin * 100) : null,
          priceMax: priceMax ? Math.round(priceMax * 100) : null,
          compCount, trendScore: signals.trendScore, liquidityScore: signals.liquidityScore,
          volatilityScore: signals.volatilityScore, sportScore: signals.sportScore,
          positionScore: signals.positionScore, cardTypeScore: signals.cardTypeScore,
          demandScore: signals.demandScore, momentumScore: signals.momentumScore,
          qualityScore: signals.qualityScore, upsideScore: signals.upsideScore,
          downsideRisk: signals.downsideRisk, marketFriction: signals.marketFriction,
          action: finalAction, actionReasons: finalActionReasons,
          careerStageAuto: signals.careerStageAuto, dataConfidence: signals.dataConfidence,
          confidenceReason: signals.confidenceReason,
          explanationShort: explanation.short, explanationLong: explanation.long,
          explanationBullets: explanation.bullets,
          bigMoverFlag: signals.bigMoverFlag, bigMoverReason: signals.bigMoverReason,
        };

        await storage.upsertCardOutlook(card.id, outlookData);
        await storage.recordOutlookUsage(userId, 'collection', card.id, card.title);

        if (marketValue && marketValue > 0) {
          recordPriceObservation({
            cardId: card.id,
            playerName: card.playerName ?? undefined,
            cardTitle: card.title,
            setName: card.set ?? undefined,
            year: card.year ?? undefined,
            variation: card.variation ?? undefined,
            priceEstimate: marketValue,
            lowEstimate: priceMin ?? undefined,
            highEstimate: priceMax ?? undefined,
            soldCount: compCount ?? undefined,
            source: "batch",
          });
          recordInterestEvent({ cardId: card.id, playerName: card.playerName ?? undefined, cardTitle: card.title, eventType: "analyze", userId });
        }

        const batchSupplyGrowth = geminiMarketData?.supply?.supplyGrowth || null;
        const cardUpdate: any = {
          outlookBigMover: signals.bigMoverFlag, outlookBigMoverReason: signals.bigMoverReason,
          outlookAction: finalAction, outlookUpsideScore: signals.upsideScore, outlookRiskScore: signals.downsideRisk,
          outlookSupplyGrowth: batchSupplyGrowth,
        };
        if (marketValue) {
          cardUpdate.previousValue = card.estimatedValue || null;
          cardUpdate.estimatedValue = marketValue;
          cardUpdate.valueUpdatedAt = new Date();
        }
        await storage.updateCard(card.id, cardUpdate);

        job.completed++;
        job.results.push({ id: card.id, title: card.title, action: finalAction, bigMover: signals.bigMoverFlag, marketValue });
        if (job.results.length > 20) job.results = job.results.slice(-20);
        console.log(`[Batch Outlook] ${job.completed}/${job.total} - ${card.title}: ${finalAction}`);
      } catch (cardError: any) {
        job.failed++;
        job.completed++;
        job.results.push({ id: card.id, title: card.title, error: cardError.message });
        if (job.results.length > 20) job.results = job.results.slice(-20);
        console.error(`[Batch Outlook] Failed ${card.title}:`, cardError.message);
      }

      if (job.completed < job.total) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    job.status = job.shouldStop ? "stopped" : "complete";
    console.log(`[Batch Outlook] Job for ${userId} ${job.status}: ${job.completed}/${job.total}`);
  }

  app.post("/api/cards/batch-outlook", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);

      if (!isPro) {
        return res.status(403).json({ message: "Batch analysis is a Pro feature" });
      }

      const existing = batchJobs.get(userId);
      if (existing && existing.status === "running") {
        return res.status(409).json({ message: "A batch analysis is already running", total: existing.total, completed: existing.completed });
      }

      const userCases = await storage.getDisplayCases(userId);
      if (userCases.length === 0) {
        return res.status(400).json({ message: "No display cases found" });
      }

      const allCards: any[] = [];
      for (const dc of userCases) {
        const dcCards = await storage.getCards(dc.id);
        allCards.push(...dcCards);
      }

      const unanalyzedCards = allCards.filter(c => c.outlookAction === null || c.outlookAction === undefined);

      if (unanalyzedCards.length === 0) {
        return res.json({ message: "All cards already analyzed", completed: 0, total: 0, status: "complete" });
      }

      const job: BatchJob = {
        status: "running",
        total: unanalyzedCards.length,
        completed: 0,
        failed: 0,
        shouldStop: false,
        startedAt: Date.now(),
        results: [],
      };
      batchJobs.set(userId, job);

      // Fire and forget — runs entirely in the background
      runBatchAnalysisJob(userId, unanalyzedCards).catch(err => {
        console.error("[Batch Outlook] Unhandled job error:", err);
        const j = batchJobs.get(userId);
        if (j) j.status = "complete";
      });

      res.json({ message: "Batch analysis started", total: unanalyzedCards.length, status: "running" });
    } catch (error: any) {
      console.error("[Batch Outlook] Error:", error);
      res.status(500).json({ message: "Failed to start batch analysis" });
    }
  });

  app.get("/api/cards/batch-outlook/status", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const job = batchJobs.get(userId);
    if (!job) {
      return res.json({ status: "idle", total: 0, completed: 0, failed: 0, results: [] });
    }
    res.json({
      status: job.status,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      results: job.results.slice(-10),
      startedAt: job.startedAt,
    });
  });

  app.post("/api/cards/batch-outlook/stop", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const job = batchJobs.get(userId);
    if (job && job.status === "running") {
      job.shouldStop = true;
      res.json({ message: "Stop requested" });
    } else {
      res.json({ message: "No active job to stop" });
    }
  });

  // Get cached AI 2.0 outlook for a card
  app.get("/api/cards/:cardId/outlook-v2", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      const userId = req.user.claims.sub;

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
        return res.status(403).json({ message: "You don't have permission to view this card's outlook" });
      }

      // Check if user is Pro for full explanation
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);

      // Check if a background analysis job is in progress for this card
      const jobKey = `${userId}:${cardId}`;
      const jobStatus = cardAnalysisJobs.get(jobKey);
      const isPending = jobStatus === "pending";

      // Get cached outlook from card_outlooks table
      const outlook = await storage.getCardOutlook(cardId);
      
      if (outlook) {
        const hoursSinceGenerated = outlook.updatedAt 
          ? (Date.now() - new Date(outlook.updatedAt).getTime()) / (1000 * 60 * 60)
          : 999;
        
        let marketValue = outlook.marketValue ? outlook.marketValue / 100 : null;
        let priceMin = outlook.priceMin ? outlook.priceMin / 100 : null;
        let priceMax = outlook.priceMax ? outlook.priceMax / 100 : null;
        
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
            value: marketValue,
            min: priceMin,
            max: priceMax,
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
          supply: await (async () => {
            let supplyGrowth: string | null = card.outlookSupplyGrowth || null;
            let supplyNote: string | undefined;
            let estimatedPopulation: number | undefined;
            let dataSource: "pop_history" | "ai_estimate" = "ai_estimate";

            if (card.playerName && card.grader) {
              try {
                const trends = await storage.getPopTrends(
                  card.playerName,
                  card.grader,
                  card.grade || undefined,
                  { year: card.year || undefined, setName: card.set || undefined, variation: card.variation || undefined, cardNumber: card.cardNumber || undefined },
                );
                if (trends.length > 0) {
                  const trend = trends[0];
                  estimatedPopulation = trend.currentPopulation;
                  dataSource = "pop_history";
                  if (trend.momGrowthPct !== null) {
                    if (trend.momGrowthPct > 15) {
                      supplyGrowth = "surging";
                      supplyNote = `Population grew ${trend.momGrowthPct.toFixed(1)}% MoM (${trend.previousPopulation} → ${trend.currentPopulation})`;
                    } else if (trend.momGrowthPct > 5) {
                      supplyGrowth = "growing";
                      supplyNote = `Population grew ${trend.momGrowthPct.toFixed(1)}% MoM (${trend.previousPopulation} → ${trend.currentPopulation})`;
                    } else {
                      supplyGrowth = "stable";
                      supplyNote = `Population stable at ${trend.currentPopulation} (${trend.momGrowthPct.toFixed(1)}% MoM)`;
                    }
                  } else {
                    supplyGrowth = supplyGrowth || "stable";
                    supplyNote = `Current population: ${trend.currentPopulation} (single snapshot — trend data pending)`;
                  }
                }
              } catch (e) {
                console.warn(`[Outlook] Pop history lookup failed for ${card.playerName}:`, (e as Error).message);
              }
            }

            if (dataSource === "ai_estimate") {
              try {
                const { getGeminiMarketCacheEntry, getDbCachedAnalysis, getGeminiCacheKey } = await import("./outlookEngine");
                const memCached = getGeminiMarketCacheEntry({
                  title: card.title, playerName: card.playerName, year: card.year,
                  set: card.set, variation: card.variation, grade: card.grade, grader: card.grader,
                });
                if (memCached?.supply) {
                  supplyNote = memCached.supply.supplyNote;
                  estimatedPopulation = memCached.supply.estimatedPopulation;
                } else {
                  const unifiedCacheKey = "unified|" + getGeminiCacheKey({
                    title: card.title, playerName: card.playerName, year: card.year,
                    set: card.set, variation: card.variation, grade: card.grade, grader: card.grader,
                  });
                  const dbCached = await getDbCachedAnalysis(unifiedCacheKey);
                  if (dbCached?.supply) {
                    supplyNote = dbCached.supply.supplyNote;
                    estimatedPopulation = dbCached.supply.estimatedPopulation;
                  }
                }
              } catch (e) {
                console.warn(`[Outlook] Failed to enrich supply data from cache for card ${cardId}:`, (e as Error).message);
              }
            }

            if (!supplyGrowth) return null;
            return {
              supplyGrowth,
              supplyNote: isPro ? supplyNote : undefined,
              estimatedPopulation: isPro ? estimatedPopulation : undefined,
              dataSource: isPro ? dataSource : undefined,
            };
          })(),
          generatedAt: outlook.updatedAt,
          cached: true,
          stale: hoursSinceGenerated > 168, // Stale after 7 days
          proRequired: !isPro,
          isPending,
        });
      }

      // No cached data yet — if a job is running, tell the client to poll
      if (isPending) {
        return res.json({ cardId, isPending: true, card: { id: card.id, title: card.title } });
      }

      // No cached data - return minimal info
      res.json({
        cardId,
        isPending: false,
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

  // Quick Market Check - FAST signals-only analysis (no comps tables, no projections)
  // Returns: trend, liquidity, demand, verdict label
  app.post("/api/outlook/quick-market-check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title, year, set, variation, grade, grader, sport } = req.body;

      if (!title) {
        return res.status(400).json({ message: "Card title is required" });
      }

      // Import required functions
      const { fetchGeminiMarketData } = await import("./outlookEngine");

      console.log(`[Quick Market Check] Starting for: ${title}`);
      
      // Fetch Gemini grounded market data (primary source for signals)
      const geminiMarketData = await fetchGeminiMarketData({
        title,
        playerName: title,
        year: year ? parseInt(year) : undefined,
        set: set || undefined,
        variation: variation || undefined,
        grade: grade || undefined,
        grader: grader || undefined,
      });

      // Compute quick signals from market data
      let trend: "up" | "flat" | "down" = "flat";
      let liquidity: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      let demandLevel: "hot" | "moderate" | "low" = "low";
      let verdictLabel: "Healthy" | "Watch" | "Risk" | "Unknown" = "Unknown";
      let soldCount = 0;

      if (geminiMarketData) {
        soldCount = geminiMarketData.soldCount || 0;
        
        // Liquidity based on sold count
        if (soldCount >= 15) {
          liquidity = "HIGH";
        } else if (soldCount >= 5) {
          liquidity = "MEDIUM";
        }

        // Trend estimation based on price stability and volume
        if (geminiMarketData.priceStability === "VOLATILE" && soldCount < 5) {
          trend = "down"; // Volatile with low volume = concerning
        } else if (geminiMarketData.priceStability === "STABLE" && soldCount >= 15) {
          trend = "up"; // Stable with high volume = positive
        }
        // Otherwise stays "flat"

        // Demand estimation
        if (soldCount >= 20) {
          demandLevel = "hot";
        } else if (soldCount >= 8) {
          demandLevel = "moderate";
        }

        // Verdict label based on signals
        if (liquidity === "HIGH") {
          verdictLabel = trend === "down" ? "Watch" : "Healthy";
        } else if (liquidity === "MEDIUM") {
          verdictLabel = "Watch";
        } else {
          verdictLabel = "Risk";
        }
      }

      res.json({
        success: true,
        signals: {
          trend,
          liquidity,
          demandLevel,
          verdictLabel,
          soldCount,
        },
        note: "Quick check based on market signals. Run Full Market Outlook for detailed analysis.",
      });
    } catch (error) {
      console.error("Error in quick market check:", error);
      res.status(500).json({ 
        message: "Failed to perform quick market check",
        success: false,
      });
    }
  });

  // One-off card analysis - analyze a card without adding to collection (Full Market Outlook)
  // Returns analysis that can optionally be saved to a display case
  app.post("/api/outlook/quick-analyze", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title, year, set, cardNumber, variation, grade, grader, imagePath, sport, scanHistoryId } = req.body;

      if (!title) {
        return res.status(400).json({ message: "Card title is required" });
      }

      // Check subscription - free users get 3 analyses per month
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);
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

      // Import the outlook engine and price service
      const { computeAllSignals, fetchUnifiedCardAnalysis, computeAction } = await import("./outlookEngine");
      const { lookupEnhancedCardPrice, filterPriceOutliers, isOneOfOneCard, isRawCard: isRawCardCheck } = await import("./priceService");

      // UNIFIED APPROACH: All data fetches run in parallel — unified Gemini, legacy price,
      // monthly price history, AND cross-product fallback all start at the same time.
      // This saves ~30s vs running cross-product serially after the main calls complete.
      console.log(`[Quick Analyze] Starting unified analysis for: ${title}`);
      const startTime = Date.now();
      const { fetchMonthlyPriceHistory, fetchLowPopFallbackPrice, fetchCrossProductFallbackPrice } = await import("./outlookEngine");
      const playerNameForSearch = (title || "").split(/\s+/).slice(0, 3).join(" ");
      const detectedSport = sport || (
        /\b(prizm|select|mosaic|hoops|court kings|flux|illusions|recon)\b/i.test(set || "")
          ? "basketball"
          : /\b(topps|bowman|gypsy queen|heritage|stadium club|chrome|sapphire)\b/i.test(set || "")
            ? "baseball"
            : /\b(score|gridiron|absolute|certified|limited|luminance|zenith|elite|prestige|wild card)\b/i.test(set || "")
              ? "football"
              : undefined
      );
      const [unifiedResult, priceData, qaMonthlyPriceHistory, specCrossProduct] = await Promise.all([
        fetchUnifiedCardAnalysis({
          title,
          playerName: title,
          year: year ? parseInt(year) : undefined,
          set: set || undefined,
          variation: variation || undefined,
          grade: grade || undefined,
          grader: grader || undefined,
        }),
        lookupEnhancedCardPrice({
          title,
          set: set || undefined,
          year: year ? parseInt(year) : undefined,
          variation: variation || undefined,
          grade: grade || undefined,
          grader: grader || undefined,
        }),
        isPro ? fetchMonthlyPriceHistory({
          playerName: title,
          sport: sport || "football",
          year: year ? parseInt(year) : undefined,
          setName: set || undefined,
          variation: variation || undefined,
          grade: grade || undefined,
          grader: grader || undefined,
        }).catch(() => null) : Promise.resolve(null),
        fetchCrossProductFallbackPrice({
          playerName: playerNameForSearch,
          year: year || undefined,
          set: set || undefined,
          variation: variation || undefined,
          grade: grade || undefined,
          grader: grader || undefined,
          sport: detectedSport || undefined,
        }).catch(() => null),
      ]);
      console.log(`[Quick Analyze] Parallel fetch completed in ${Date.now() - startTime}ms`);

      const filteredPriceData = filterPriceOutliers(priceData.pricePoints);

      // Compute deterministic signals from legacy price data
      const signals = computeAllSignals(tempCard as any, priceData.pricePoints, priceData.estimatedValue);
      
      // Enhance signals with unified Gemini data (more accurate than legacy alone)
      if (unifiedResult) {
        const uMarket = unifiedResult.market;
        const uActiveListings = uMarket.activeListing || 0;
        const uSoldCount = uMarket.soldCount || 0;
        const uMonthlyVolume = uMarket.monthlySalesVolume || 0;
        const uGeminiLiquidity = (uMarket.liquidity || "MEDIUM").toUpperCase();
        console.log(`[Quick Analyze] Liquidity scoring: ${uSoldCount} sold, ${uActiveListings} active listings, monthlyVolume=${uMonthlyVolume}, liquidity=${uGeminiLiquidity}`);

        if (uGeminiLiquidity === "HIGH" || uMonthlyVolume >= 100 || uSoldCount >= 20 || uActiveListings >= 30) {
          signals.liquidityScore = 10;
        } else if (uSoldCount >= 12 || uActiveListings >= 20) {
          signals.liquidityScore = 9;
        } else if (uSoldCount >= 8 || uActiveListings >= 12) {
          signals.liquidityScore = 8;
        } else if (uSoldCount >= 5 || uActiveListings >= 8) {
          signals.liquidityScore = 7;
        } else if (uSoldCount >= 3) {
          signals.liquidityScore = 5;
        } else if (uSoldCount >= 1) {
          signals.liquidityScore = 3;
        } else {
          if (uGeminiLiquidity === "MEDIUM") signals.liquidityScore = 4;
          else if (uGeminiLiquidity === "LOW") signals.liquidityScore = 2;
          else signals.liquidityScore = 1;
        }
        
        if (uMarket.soldCount >= 10) {
          signals.dataConfidence = "HIGH";
          signals.confidenceReason = `${uMarket.soldCount} recent sales found on eBay`;
        } else if (uMarket.soldCount >= 5) {
          signals.dataConfidence = "MEDIUM";
          signals.confidenceReason = `${uMarket.soldCount} recent sales found - moderate sample size`;
        }
        
        if (uMonthlyVolume >= 500) signals.marketFriction = Math.min(signals.marketFriction, 20);
        else if (uGeminiLiquidity === "HIGH" || uMonthlyVolume >= 100) signals.marketFriction = Math.min(signals.marketFriction, 30);
        else if (uGeminiLiquidity === "MEDIUM" || uMonthlyVolume >= 50) signals.marketFriction = Math.min(signals.marketFriction, 50);
        
        signals.demandScore = Math.round(
          (signals.liquidityScore * 0.4) + 
          (signals.sportScore * 0.3) + 
          (signals.positionScore * 0.3)
        ) * 10;
        
        // Enhance momentum based on player news
        if (unifiedResult.player.momentum === "up") {
          signals.trendScore = Math.min(10, signals.trendScore + 2);
          signals.momentumScore = Math.min(100, signals.momentumScore + 15);
        } else if (unifiedResult.player.momentum === "down") {
          signals.trendScore = Math.max(1, signals.trendScore - 2);
          signals.momentumScore = Math.max(0, signals.momentumScore - 15);
        }
        
        // Recompute action with enhanced signals
        const { action: recomputedAction, reasons: recomputedReasons } = computeAction(
          signals.qualityScore,
          signals.demandScore,
          signals.momentumScore,
          signals.trendScore,
          signals.volatilityScore,
          signals.liquidityScore,
          uMarket.avgPrice,
          signals.careerStageAuto,
          tempCard.year ? parseInt(String(tempCard.year)) : undefined
        );
        signals.action = recomputedAction;
        signals.actionReasons = recomputedReasons;
      }
      
      // Detect 1/1 and low-pop cards
      const qaVariation = variation || "";
      const qaSerialNumber = req.body.serialNumber || null;
      const qaIs1of1 = isOneOfOneCard({ title: title, variation: qaVariation, serialNumber: qaSerialNumber });
      const qaIsLowPop = /\/\s*[1-9]\b|\/\s*[1-4]\d\b/.test(qaVariation);
      const qaIsVeryLowPop = /\/\s*[1-5]\b/.test(qaVariation) && !qaIs1of1;
      
      // Detect SSP/premium unnumbered parallels (wide price ranges are EXPECTED for these)
      const qaVariationLower = qaVariation.toLowerCase().trim();
      const qaSetLower = (set || "").toLowerCase();
      const qaSspPattern = /\b(zebra|tiger\s*stripe|color\s*blast|shock|shimmer|mojo|downtown|uptown|kaboom|disco\s*ball|case\s*hit|ssp|gold\s*vinyl|black\s*gold|neon\s*green|scope|velocity|hyper|astral|galactic|lava|magma|snakeskin|marble|leopard|cheetah|camo|wave|ice|crystal|cracked\s*ice|lazer|laser|fast\s*break|choice|fotl|first\s*off\s*the\s*line|wood|silk|sapphire|platinum|vintage\s*stock|clear|superfractor)\b/i;
      const qaIsSSP = qaSspPattern.test(qaVariationLower) || qaSspPattern.test(qaSetLower);
      
      // Determine market value: prefer unified Gemini data, fall back to legacy
      let marketValue = priceData.estimatedValue;
      let priceMin = filteredPriceData.min;
      let priceMax = filteredPriceData.max;
      let compCount = priceData.salesFound;
      const qaIsRaw = isRawCardCheck(grade, grader);
      
      if (unifiedResult && unifiedResult.market.avgPrice > 0) {
        // Trust unified Gemini result when: real comps found, rare cards (1/1, low-pop), OR SSP/premium inserts
        // SSP cards (Downtown, Kaboom, Color Blast, etc.) are specialty inserts where legacy lookups
        // often return wrong comps (e.g., base Donruss prices for an Optic Downtown)
        const hasRealComps = unifiedResult.market.soldCount > 0 || qaIs1of1 || qaIsLowPop || qaIsSSP;
        // NOTE: Do NOT use unified when soldCount=0 just because it's lower than legacy.
        // 0 sold comps means Gemini is estimating with no data — a low guess is NOT more conservative,
        // it's just wrong. Legacy data (even imperfect) is more reliable than a zero-comp Gemini estimate.
        
        if (hasRealComps) {
          let unifiedAvg = unifiedResult.market.avgPrice;
          const unifiedMin = unifiedResult.market.minPrice;
          const unifiedMax = unifiedResult.market.maxPrice;
          
          if (qaIsSSP && unifiedResult.market.soldCount === 0) {
            console.log(`[Quick Analyze] SSP card detected (${qaVariation || set}) — trusting unified Gemini price $${unifiedAvg} over legacy $${marketValue} (legacy likely found wrong comps)`);
          }
          
          // OUTLIER PROTECTION: If max is 3x+ the min with sparse comps, the average is likely inflated by outliers/BIN prices
          // SKIP for SSP/premium inserts — wide price ranges are EXPECTED for Downtown, Kaboom, Color Blast, etc.
          if (!qaIsSSP && unifiedMin > 0 && unifiedMax > 0 && unifiedMax / unifiedMin >= 3 && unifiedResult.market.soldCount <= 10) {
            const spread = unifiedMax / unifiedMin;
            const weight = spread >= 5 ? 0.15 : 0.3;
            const correctedAvg = Math.round((unifiedMin + (unifiedAvg - unifiedMin) * weight) * 100) / 100;
            console.warn(`[Quick Analyze] OUTLIER PROTECTION: Unified avg $${unifiedAvg} with range $${unifiedMin}-$${unifiedMax} (${spread.toFixed(1)}x spread). Corrected to $${correctedAvg} (weight=${weight})`);
            unifiedAvg = correctedAvg;
          } else if (qaIsSSP && unifiedMin > 0 && unifiedMax > 0 && unifiedMax / unifiedMin >= 3) {
            console.log(`[Quick Analyze] SSP detected (${qaVariation || set}) — skipping outlier protection. Trusting Gemini avg $${unifiedAvg} (range $${unifiedMin}-$${unifiedMax})`);
          }
          
          marketValue = unifiedAvg;
          priceMin = unifiedMin || marketValue * 0.7;
          priceMax = unifiedMax || marketValue * 1.5;
          compCount = unifiedResult.market.soldCount;

          // ULTRA-LOW-POP SCARCITY FLOOR: For /1-/5 cards with 0 real comps, Gemini often
          // under-values because it can't find exact sales and anchors to common parallels.
          // Apply a minimum scarcity multiplier based on what a /99 of this player would sell for.
          if (qaIsVeryLowPop && unifiedResult.market.soldCount === 0 && marketValue > 0) {
            const popMatch = qaVariation.match(/\/\s*(\d+)/);
            const popNum = popMatch ? parseInt(popMatch[1]) : 5;
            // Minimum floor: /2 should be at least 5x the avg, /5 at least 3x
            // This catches cases where Gemini returns $85 for a /2 that should be $500+
            const scarcityFloor = popNum <= 2 ? marketValue * 5 : popNum <= 3 ? marketValue * 4 : popNum <= 5 ? marketValue * 3 : marketValue * 2;
            if (marketValue < 200 && scarcityFloor > marketValue) {
              console.warn(`[Quick Analyze] SCARCITY FLOOR: /${popNum} card estimated at $${marketValue} with 0 comps — applying ${popNum <= 2 ? "5x" : popNum <= 3 ? "4x" : "3x"} scarcity floor → $${scarcityFloor}`);
              marketValue = Math.round(scarcityFloor);
              priceMin = Math.round(marketValue * 0.6);
              priceMax = Math.round(marketValue * 2);
            }
          }

          // RAW LOW-POP CONTAMINATION CHECK: For raw numbered cards (/6-/49), real raw sales are
          // extremely rare, so Gemini often returns PSA10/PSA9 prices as "raw" prices.
          // A raw card CANNOT cost more than its PSA 9 grade — if it does, the price is contaminated.
          // Not applied to 1/1 cards since those are unique and may be priced above PSA9.
          if (qaIsRaw && qaIsLowPop && !qaIs1of1) {
            const psa9Price = unifiedResult.market.psa9Price ?? null;
            const psa10Price = unifiedResult.market.psa10Price ?? null;
            // Use PSA9 as primary anchor, PSA10 as fallback (raw is ~30% of PSA10 for premium numbered cards)
            const gradeAnchor = psa9Price && psa9Price > 0 ? { price: psa9Price, ratio: 0.45, label: "PSA9" }
              : psa10Price && psa10Price > 0 ? { price: psa10Price, ratio: 0.30, label: "PSA10" }
              : null;
            if (gradeAnchor && marketValue >= gradeAnchor.price * 0.85) {
              const contaminatedRaw = marketValue;
              const correctedRaw = Math.round(gradeAnchor.price * gradeAnchor.ratio * 100) / 100;
              console.warn(`[Quick Analyze] RAW LOW-POP CONTAMINATION: rawPrice $${contaminatedRaw} >= ${gradeAnchor.label} $${gradeAnchor.price} * 0.85 — Gemini used graded prices as raw. Correcting to $${correctedRaw} (${gradeAnchor.ratio * 100}% of ${gradeAnchor.label}).`);
              marketValue = correctedRaw;
              priceMin = Math.round(correctedRaw * 0.7 * 100) / 100;
              priceMax = psa9Price
                ? Math.round(psa9Price * 0.75 * 100) / 100
                : Math.round(correctedRaw * 1.5 * 100) / 100;
            }
          }
        } else {
          // soldCount=0 — Gemini is estimating with NO actual sales data.
          // Do NOT use as a reliable price. Save it as a last-resort fallback only,
          // to be used after cross-product and all other sources have also failed.
          const unifiedEstimate = (qaIsRaw ? unifiedResult.market.rawPrice : null) ?? unifiedResult.market.avgPrice;
          if (unifiedEstimate && unifiedEstimate > 0) {
            console.log(`[Quick Analyze] ZERO-COMP GEMINI ESTIMATE: $${unifiedEstimate} (0 sold comps — saved as last-resort fallback, NOT used as market value)`);
          }
        }
      }

      // LOW-POP FALLBACK: For all low-numbered cards (/1-/49) with no real sold comps, run triangulation.
      // This catches the common case where Gemini estimates a price without actual sales data backing it —
      // especially for raw numbered cards where real raw sales are essentially non-existent.
      let lowPopFallbackAttempted = false;
      let lowPopFallbackSelected = false;
      let lowPopFallbackPrice: number | null = null;
      const unifiedHasNoPrice = !unifiedResult || !unifiedResult.market.avgPrice || unifiedResult.market.avgPrice <= 0;
      const unifiedSoldCount = unifiedResult?.market.soldCount ?? 0;
      // Triangulation only for /1-/5 and 1/1 cards — NOT for /6-/49.
      // For /6-/49 low-pop cards in premium sets (National Treasures, etc.) the triangulation
      // incorrectly finds auto/patch comps worth 10x the base parallel. The contamination check
      // (psa9Price * 0.45) handles those cases more safely.
      const shouldTriangulate = (qaIs1of1 || qaIsVeryLowPop) && unifiedHasNoPrice;
      if (shouldTriangulate) {
        const currentPrice = marketValue;
        lowPopFallbackAttempted = true;
        const reason = !unifiedResult ? "unified failed" : "unified returned no price";
        console.log(`[Quick Analyze] LOW-POP FALLBACK: ${reason} for ${qaIs1of1 ? "1/1" : "low-pop /1-/5"} card. Current price: $${currentPrice}. Attempting triangulation...`);
        try {
          const fallbackResult = await fetchLowPopFallbackPrice({
            title,
            playerName: title,
            year: year || undefined,
            set: set || undefined,
            variation: variation || undefined,
            grade: grade || undefined,
            grader: grader || undefined,
          });
          if (fallbackResult && fallbackResult.avgPrice > 0) {
            lowPopFallbackPrice = fallbackResult.avgPrice;
            // Use fallback when we have no current price, or when unified failed to return a price.
            const usesFallback = !marketValue || marketValue <= 0;
            if (usesFallback) {
              console.log(`[Quick Analyze] LOW-POP FALLBACK: Using triangulated $${fallbackResult.avgPrice} (range $${fallbackResult.minPrice}-$${fallbackResult.maxPrice}), was $${currentPrice}.`);
              marketValue = fallbackResult.avgPrice;
              priceMin = fallbackResult.minPrice;
              priceMax = fallbackResult.maxPrice;
              lowPopFallbackSelected = true;
            } else {
              console.log(`[Quick Analyze] LOW-POP FALLBACK: Triangulated $${fallbackResult.avgPrice} vs current $${currentPrice}. Keeping unified Gemini result.`);
            }
          }
        } catch (fallbackError: any) {
          console.warn(`[Quick Analyze] LOW-POP FALLBACK: Error: ${fallbackError.message}`);
        }
      }

      // CROSS-PRODUCT FALLBACK: Use the pre-fetched result (ran in parallel with main calls).
      // Applied when there are NO real comps from any source.
      const legacyPricePoints = priceData.pricePoints || [];
      const legacyHasRealData = legacyPricePoints.length >= 2;
      const hasAnyRealComps = compCount > 0 || legacyHasRealData;
      const unifiedZeroCompEstimate = (unifiedResult && unifiedResult.market.avgPrice > 0 && (unifiedResult.market.soldCount || 0) === 0)
        ? ((qaIsRaw ? unifiedResult.market.rawPrice : null) ?? unifiedResult.market.avgPrice)
        : null;
      if (!hasAnyRealComps && !qaIs1of1 && !qaIsVeryLowPop && !qaIsSSP) {
        const preExisting = marketValue || 0;
        if (specCrossProduct && specCrossProduct.avgPrice > 0) {
          if (unifiedZeroCompEstimate && unifiedZeroCompEstimate > 0) {
            const ratio = unifiedZeroCompEstimate / specCrossProduct.avgPrice;
            if (ratio > 2 || ratio < 0.5) {
              console.log(`[Quick Analyze] CROSS-PRODUCT vs UNIFIED CONFLICT: CrossProduct $${specCrossProduct.avgPrice} vs Unified $${unifiedZeroCompEstimate} (${ratio.toFixed(1)}x diff). Using unified estimate — Gemini grounded search is more targeted than generic cross-product.`);
              marketValue = unifiedZeroCompEstimate;
              priceMin = Math.round(unifiedZeroCompEstimate * 0.6);
              priceMax = Math.round(unifiedZeroCompEstimate * 1.5);
              compCount = 0;
            } else {
              const blended = Math.round((unifiedZeroCompEstimate * 0.6 + specCrossProduct.avgPrice * 0.4) * 100) / 100;
              console.log(`[Quick Analyze] CROSS-PRODUCT BLENDED: CrossProduct $${specCrossProduct.avgPrice} + Unified $${unifiedZeroCompEstimate} → blended $${blended}`);
              marketValue = blended;
              priceMin = Math.round(Math.min(specCrossProduct.minPrice, unifiedZeroCompEstimate * 0.7));
              priceMax = Math.round(Math.max(specCrossProduct.maxPrice, unifiedZeroCompEstimate * 1.3));
              compCount = 0;
            }
          } else {
            console.log(`[Quick Analyze] CROSS-PRODUCT FALLBACK: Using $${specCrossProduct.avgPrice} (range $${specCrossProduct.minPrice}-$${specCrossProduct.maxPrice}, sport: ${detectedSport || "unknown"}). | ${specCrossProduct.notes.substring(0, 100)}`);
            marketValue = specCrossProduct.avgPrice;
            priceMin = specCrossProduct.minPrice;
            priceMax = specCrossProduct.maxPrice;
            compCount = 0;
          }
        } else if (unifiedZeroCompEstimate && unifiedZeroCompEstimate > 0 && (!marketValue || marketValue <= 0)) {
          console.log(`[Quick Analyze] UNIFIED LAST-RESORT: No cross-product available. Using unified zero-comp estimate $${unifiedZeroCompEstimate}`);
          marketValue = unifiedZeroCompEstimate;
          priceMin = Math.round(unifiedZeroCompEstimate * 0.6);
          priceMax = Math.round(unifiedZeroCompEstimate * 1.5);
          compCount = 0;
        } else {
          console.log(`[Quick Analyze] CROSS-PRODUCT FALLBACK: No usable result (current est: $${preExisting}).`);
        }
      }

      // qaIsRaw defined earlier (before unified result block)

      // CROSS-VALIDATION against legacy price points
      // For HIGH comp counts (4+), this is LOG ONLY — Gemini has enough data to be trusted.
      // For LOW comp counts (0-3), Gemini is most likely to have found wrong/mixed comps,
      // so we apply a ceiling when legacy data strongly disagrees.
      const ppForValidation = priceData.pricePoints || [];
      if (ppForValidation.length > 0 && !qaIs1of1 && !qaIsLowPop && !qaIsSSP) {
        const ppPrices = ppForValidation.map((pp: any) => pp.price).filter((p: number) => typeof p === 'number' && p > 0);
        if (ppPrices.length >= 2 && marketValue && marketValue > 0) {
          const sortedPrices = [...ppPrices].sort((a: number, b: number) => a - b);
          const mid = Math.floor(sortedPrices.length / 2);
          const ppMedian = sortedPrices.length % 2 === 0
            ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
            : sortedPrices[mid];
          
          const ratio = marketValue / ppMedian;
          const geminiCompCount = unifiedResult?.market.soldCount ?? 0;
          
          if (geminiCompCount <= 3 && ratio > 2.5 && ppPrices.length >= 2) {
            const ceiling = Math.round(ppMedian * 2 * 100) / 100;
            console.warn(`[Quick Analyze] LOW-COMP CROSS-VALIDATION: Gemini $${marketValue} (${geminiCompCount} comps) is ${ratio.toFixed(1)}x legacy median $${ppMedian.toFixed(2)} (${ppPrices.length} legacy comps). Capping at $${ceiling} (2x legacy median).`);
            marketValue = ceiling;
            priceMin = Math.round(ppMedian * 0.8 * 100) / 100;
            priceMax = Math.round(ppMedian * 2.5 * 100) / 100;
          } else if (ratio > 2.5) {
            console.log(`[Quick Analyze] CROSS-VALIDATION (info only): Gemini $${marketValue} (${geminiCompCount} comps) is ${ratio.toFixed(1)}x higher than legacy median $${ppMedian.toFixed(2)}. Trusting Gemini — has ${geminiCompCount} comps.`);
          }
        }
      }
      
      // PRICE-TREND COMPARISON
      // Monthly price history is itself Gemini-generated and often inaccurate for new/rare cards.
      // Using stale trend data to override a fresh Gemini analysis was causing systematic undervaluation.
      // Used as a fallback when: (a) Gemini returns no price, or (b) raw card with 0 unified comps
      // where legacy price is likely contaminated by graded comps.
      const trendHasRealSales = qaMonthlyPriceHistory?.hasAnySales === true;
      const unifiedHasNoRealComps = !unifiedResult || unifiedResult.market.soldCount === 0;
      if (qaMonthlyPriceHistory && qaMonthlyPriceHistory.dataPoints && qaMonthlyPriceHistory.dataPoints.length > 0 && trendHasRealSales) {
        const recentPoints = qaMonthlyPriceHistory.dataPoints.slice(-3);
        const recentAvg = recentPoints.reduce((sum: number, p: any) => sum + (p.avgPrice || 0), 0) / recentPoints.length;

        if (recentAvg > 0) {
          if (!marketValue || marketValue <= 0) {
            console.log(`[Quick Analyze] PRICE-TREND FALLBACK: No market value from Gemini, using trend avg $${recentAvg.toFixed(2)}`);
            marketValue = Math.round(recentAvg * 100) / 100;
            const allPrices = qaMonthlyPriceHistory.dataPoints.map((p: any) => p.avgPrice || 0).filter((p: number) => p > 0);
            if (allPrices.length > 0) {
              priceMin = Math.min(...allPrices);
              priceMax = Math.max(...allPrices);
            }
          } else {
            const ratio = marketValue / recentAvg;
            // Special case: raw card with 0 unified comps + legacy price way above trend.
            // Legacy eBay/Serper finds graded comps for raw cards when raw-specific comps are scarce.
            // If the trend has real raw sales and the current price is >3x trend avg, trust the trend.
            const isRawNoCompsHighLegacy = qaIsRaw && unifiedHasNoRealComps && ratio > 3;
            if (isRawNoCompsHighLegacy) {
              console.log(`[Quick Analyze] RAW TREND RESCUE: legacy $${marketValue} is ${ratio.toFixed(1)}x trend avg $${recentAvg.toFixed(2)} with 0 unified comps — legacy likely has graded comps. Using trend avg.`);
              marketValue = Math.round(recentAvg * 100) / 100;
              const allPrices = qaMonthlyPriceHistory.dataPoints.map((p: any) => p.avgPrice || 0).filter((p: number) => p > 0);
              if (allPrices.length > 0) {
                priceMin = Math.min(...allPrices);
                priceMax = Math.max(...allPrices);
              }
              compCount = 0;
            } else if (ratio < 0.33 || ratio > 3) {
              console.log(`[Quick Analyze] PRICE-TREND INFO: current $${marketValue} differs from trend avg $${recentAvg.toFixed(2)} (ratio ${ratio.toFixed(2)}). Trusting current analysis.`);
            }
          }
        }
      } else if (qaMonthlyPriceHistory && !trendHasRealSales) {
        console.log(`[Quick Analyze] PRICE-TREND: Skipping — trend data has NO real sales (all salesCount=0)`);
      }

      // LAST-RESORT GEMINI FALLBACK: If after all sources we STILL have no price,
      // use Gemini's 0-comp estimate but heavily discounted (30% of its guess).
      // This is the absolute last option — Gemini is guessing without sales data.
      if ((!marketValue || marketValue <= 0) && unifiedResult && unifiedResult.market.avgPrice > 0) {
        const geminiGuess = unifiedResult.market.avgPrice;
        const discountedGuess = Math.round(geminiGuess * 0.3 * 100) / 100;
        console.log(`[Quick Analyze] LAST-RESORT GEMINI FALLBACK: No data from any source. Using discounted Gemini guess: $${discountedGuess} (30% of $${geminiGuess})`);
        marketValue = discountedGuess;
        priceMin = Math.round(discountedGuess * 0.5 * 100) / 100;
        priceMax = Math.round(discountedGuess * 2 * 100) / 100;
        compCount = 0;
        signals.dataConfidence = "LOW";
        signals.confidenceReason = "No recent sold comps found — price is a rough estimate based on comparable market data.";
      }

      // SPECIFICITY GUARD
      const hasMissingDetails = !set || !variation;
      if (hasMissingDetails && marketValue && marketValue > 5) {
        const missingFields = [!set ? "set" : null, !variation ? "variation/parallel" : null].filter(Boolean).join(" and ");
        signals.dataConfidence = "LOW";
        signals.confidenceReason = `Card identity incomplete — missing ${missingFields}. Price may not reflect this specific card.`;
      }

      const matchConfidence = priceData.matchConfidence;
      
      // Determine final action — prefer unified verdict with deterministic guardrails
      const validVerdicts = ["BUY", "MONITOR", "SELL", "LONG_HOLD", "LEGACY_HOLD", "WATCH", "LITTLE_VALUE"];
      let finalAction = signals.action;
      let finalActionReasons = [...signals.actionReasons];
      
      if (unifiedResult) {
        const unifiedVerdict = unifiedResult.analysis.verdict;
        if (validVerdicts.includes(unifiedVerdict)) {
          finalAction = unifiedVerdict;
          finalActionReasons = unifiedResult.analysis.verdictReasons;
        }
        
        // Guardrail: Low-stability players (injured/backup) should not get BUY
        if (finalAction === "BUY" && (
          unifiedResult.player.injuryStatus === "INJURED" || 
          unifiedResult.player.roleStatus === "INJURED_RESERVE" ||
          unifiedResult.player.roleStatus === "BACKUP"
        )) {
          finalAction = "WATCH";
          finalActionReasons = [`Player status (${unifiedResult.player.roleStatus}/${unifiedResult.player.injuryStatus}) adds risk — watching for now`, ...finalActionReasons];
          console.log(`[Quick Analyze] Guardrail: Downgraded BUY → WATCH due to player status`);
        }
        
        // Guardrail: Low confidence data should not get aggressive verdicts
        if (signals.dataConfidence === "LOW" && (finalAction === "BUY" || finalAction === "SELL")) {
          finalAction = "MONITOR";
          finalActionReasons = [`Limited market data — more sales needed to confirm ${unifiedResult.analysis.verdict}`, ...finalActionReasons];
          console.log(`[Quick Analyze] Guardrail: Downgraded ${unifiedResult.analysis.verdict} → MONITOR due to low confidence`);
        }
      }
      
      if (!unifiedResult && matchConfidence && matchConfidence.tier === "LOW") {
        finalAction = "MONITOR";
        finalActionReasons = [`Low data confidence: ${matchConfidence.reason}`, ...finalActionReasons];
      }
      
      if (hasMissingDetails) {
        if (finalAction !== "MONITOR" && finalAction !== "LITTLE_VALUE") {
          finalAction = "MONITOR";
        }
        finalActionReasons = [`Incomplete card details — add set and variation for accurate pricing`, ...finalActionReasons];
      }

      // LITTLE_VALUE FLOOR: When the verdict is LITTLE_VALUE but price is null,
      // the verdict definition itself tells us the card is worth under $2-3.
      // Showing N/A alongside "Low Value" is contradictory — set a low default.
      // The LOW confidence badge + LITTLE_VALUE verdict together communicate the uncertainty.
      if (finalAction === "LITTLE_VALUE" && !marketValue) {
        marketValue = 1;
        priceMin = 0.25;
        priceMax = 3;
        console.log(`[Quick Analyze] LITTLE_VALUE floor applied: no price data — defaulting to ~$1 estimate`);
      }

      // Use unified explanation directly (no separate AI call needed!)
      const explanation = unifiedResult ? {
        short: unifiedResult.analysis.shortSummary,
        long: unifiedResult.analysis.detailedAnalysis,
        bullets: unifiedResult.analysis.keyBullets,
      } : {
        short: `${finalAction} recommendation based on available market data.`,
        long: `Analysis based on ${compCount} comparable sales. ${finalActionReasons.join(". ")}.`,
        bullets: finalActionReasons,
      };

      await storage.recordOutlookUsage(userId, 'quick', undefined, title);

      if (scanHistoryId) {
        try {
          await storage.updateScanHistoryAnalysis(
            parseInt(String(scanHistoryId)),
            userId,
            marketValue ?? null,
            finalAction ?? null
          );
        } catch (shErr) {
          console.error("[Quick Analyze] Failed to update scan history:", shErr);
        }
      }

      logActivity("card_analysis", {
        userId,
        metadata: { title, year, set, action: finalAction, marketValue },
        req,
      });

      const totalTime = Date.now() - startTime;
      console.log(`[Quick Analyze] Complete in ${totalTime}ms | ${title} | ${finalAction} | $${marketValue}`);

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
          value: marketValue,
          min: priceMin,
          max: priceMax,
          compCount: compCount,
          activeListing: unifiedResult?.market?.activeListing || 0,
          pricePoints: isPro ? priceData.pricePoints : null,
          modeledEstimate: null,
          geminiData: unifiedResult ? {
            soldCount: unifiedResult.market.soldCount,
            liquidity: unifiedResult.market.liquidity,
            priceStability: unifiedResult.market.priceStability,
            dataSource: "gemini_unified",
          } : null,
          gradedEstimates: qaIsRaw && marketValue ? (() => {
            // Cross-validation: PSA graded prices MUST be >= raw value.
            // If Gemini returns graded prices lower than raw, it found comps
            // for a completely different (cheaper) version of the card.
            // This is especially common for low-pop numbered cards (/1-/5)
            // where no graded comps exist and Gemini confuses the search.
            let psa9 = unifiedResult?.market.psa9Price ?? null;
            let psa10 = unifiedResult?.market.psa10Price ?? null;

            if (psa9 !== null && psa9 < marketValue) {
              console.warn(`[GradedMatrix] PSA 9 (${psa9}) < raw (${marketValue}) — wrong card comps detected. Clearing.`);
              psa9 = null;
            }
            if (psa10 !== null && psa10 < marketValue) {
              console.warn(`[GradedMatrix] PSA 10 (${psa10}) < raw (${marketValue}) — wrong card comps detected. Clearing.`);
              psa10 = null;
            }

            if (psa9 || psa10) {
              return { psa9, psa10 };
            }

            // For very low-pop numbered cards (/1 through /5), graded comps
            // virtually never exist — nobody grades these. Hide the matrix.
            const isVeryLowPop = variation && /\/[1-5](?:\s|$|[^0-9])/.test(variation);
            if (isVeryLowPop) {
              console.log(`[GradedMatrix] Suppressing graded matrix for very low-pop card: ${variation}`);
              return null;
            }

            const estPsa9 = Math.round(marketValue * 2);
            const estPsa10 = Math.round(marketValue * 4);
            return { psa9: estPsa9, psa10: estPsa10, estimated: true };
          })() : null,
          isRaw: qaIsRaw,
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
        supply: unifiedResult?.supply ? {
          supplyGrowth: unifiedResult.supply.supplyGrowth,
          supplyNote: isPro ? unifiedResult.supply.supplyNote : undefined,
          estimatedPopulation: isPro ? unifiedResult.supply.estimatedPopulation : undefined,
        } : null,
        comps: {
          status: "complete" as const,
          source: "SERPER" as const,
          soldCount: unifiedResult?.market?.soldCount ?? 0,
          confidence: signals.dataConfidence || "LOW",
          summary: {
            medianPrice: marketValue,
            soldCount: unifiedResult?.market?.soldCount ?? 0,
            trendSeries: [],
          },
          message: "Analysis complete",
        },
        priceHistory: (qaMonthlyPriceHistory?.hasAnySales === true) ? qaMonthlyPriceHistory : null,
        pricingDebug: signals.dataConfidence === "LOW" ? {
          unifiedStatus: unifiedResult ? (unifiedResult.market.avgPrice > 0 ? "success" : "no_price") : "failed",
          unifiedPrice: unifiedResult?.market?.avgPrice || null,
          legacyPrice: priceData.estimatedValue || null,
          legacyComps: priceData.salesFound || 0,
          lowPopFallbackAttempted,
          lowPopFallbackPrice,
          lowPopFallbackSelected,
          finalSource: unifiedResult?.market?.avgPrice > 0 ? "unified" : (lowPopFallbackSelected ? "lowpop_fallback" : "legacy"),
        } : undefined,
        generatedAt: new Date().toISOString(),
        isPro,
      });

      if (marketValue && marketValue > 0) {
        recordPriceObservation({
          playerName: playerName ?? undefined,
          cardTitle: title,
          setName: set ?? undefined,
          year: year ?? undefined,
          variation: variation ?? undefined,
          priceEstimate: marketValue,
          lowEstimate: priceMin ?? undefined,
          highEstimate: priceMax ?? undefined,
          soldCount: unifiedResult?.market?.soldCount ?? undefined,
          source: "quick_analyze",
        });
        recordInterestEvent({ playerName: playerName ?? undefined, cardTitle: title, eventType: "analyze", userId: (req as any).user?.claims?.sub });
      }
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
  // Card Image Scanner - AI-powered card identification from photos
  // ============================================================================

  // Daily scan limits
  const FREE_SCAN_DAILY_LIMIT = 3;
  const PRO_SCAN_DAILY_LIMIT = 100;
  
  // In-memory daily scan counter (resets on server restart, but that's fine for rate limiting)
  const dailyScanCounts = new Map<string, { count: number; date: string }>();
  
  function getScanCountForToday(userId: string): number {
    const today = new Date().toISOString().split('T')[0];
    const record = dailyScanCounts.get(userId);
    if (record && record.date === today) {
      return record.count;
    }
    return 0;
  }
  
  function incrementScanCount(userId: string): void {
    const today = new Date().toISOString().split('T')[0];
    const record = dailyScanCounts.get(userId);
    if (record && record.date === today) {
      record.count++;
    } else {
      dailyScanCounts.set(userId, { count: 1, date: today });
    }
  }

  // Scan a card image - IDENTIFICATION ONLY (no pricing, much faster)
  // This is the new workflow: scan first, confirm details, then analyze
  app.post("/api/cards/scan-identify", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { imageData, mimeType, imageDataBack, mimeTypeBack } = req.body;

      if (!imageData) {
        return res.status(400).json({ message: "Image data is required" });
      }

      // Validate image data format
      const isValidFormat = imageData.startsWith("data:image/") || 
                           imageData.startsWith("http://") || 
                           imageData.startsWith("https://") ||
                           /^[A-Za-z0-9+/=]+$/.test(imageData.substring(0, 100));
      
      if (!isValidFormat) {
        return res.status(400).json({ message: "Invalid image format. Please provide a base64 encoded image, data URL, or image URL." });
      }

      // Check subscription status for scan limits
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);
      const dailyLimit = isPro ? PRO_SCAN_DAILY_LIMIT : FREE_SCAN_DAILY_LIMIT;
      const scansToday = getScanCountForToday(userId);
      
      if (scansToday >= dailyLimit) {
        return res.status(429).json({
          message: isPro 
            ? `You've reached your daily limit of ${dailyLimit} scans. Try again tomorrow.`
            : `You've used all ${dailyLimit} free scans today. Upgrade to Pro for more scans.`,
          limitReached: true,
          used: scansToday,
          limit: dailyLimit,
          isPro,
        });
      }

      // Check if Gemini credentials are configured
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        console.error("[Card Scan] Gemini credentials not configured");
        return res.status(503).json({ 
          message: "Card scanning is not available. AI service not configured.",
          serviceUnavailable: true,
          usage: {
            scansToday,
            dailyLimit,
            remainingScans: Math.max(0, dailyLimit - scansToday),
            isPro,
          },
        });
      }

      // Import card scanner service - use scanCardImage directly (not scanCardWithPricing)
      const { scanCardImage } = await import("./cardImageScannerService");

      console.log(`[Card Scan] User ${userId} scanning card image (identify only)...`);
      
      // Perform the scan - identification ONLY (no pricing)
      let scanResult;
      try {
        scanResult = await scanCardImage(imageData, mimeType || "image/jpeg", imageDataBack, mimeTypeBack || "image/jpeg");
      } catch (scanError) {
        console.error("[Card Scan] Scan failed:", scanError);
        return res.status(500).json({
          message: "Card scanning temporarily unavailable. Please try again or enter details manually.",
          scanError: true,
          usage: {
            scansToday,
            dailyLimit,
            remainingScans: Math.max(0, dailyLimit - scansToday),
            isPro,
          },
        });
      }
      
      // Increment scan count after successful scan
      incrementScanCount(userId);

      logActivity("card_scan", {
        userId,
        metadata: { 
          playerName: scanResult.cardIdentification?.playerName,
          year: scanResult.cardIdentification?.year,
          set: scanResult.cardIdentification?.setName,
          confidence: scanResult.confidence,
        },
        req,
      });
      recordInterestEvent({
        playerName: scanResult.cardIdentification?.playerName ?? undefined,
        cardTitle: scanResult.cardIdentification ? `${scanResult.cardIdentification.playerName} ${scanResult.cardIdentification.year || ''} ${scanResult.cardIdentification.setName || ''}`.trim() : undefined,
        eventType: "scan",
        userId,
      });

      let scanHistoryId: number | undefined;
      try {
        const cardId = scanResult.cardIdentification;

        let uploadedImagePath: string | null = null;
        try {
          let rawBase64 = imageData;
          if (rawBase64.startsWith("data:")) {
            rawBase64 = rawBase64.split(",")[1] || rawBase64;
          }
          const imageBuffer = Buffer.from(rawBase64, "base64");
          const objService = new ObjectStorageService();
          uploadedImagePath = await objService.uploadBuffer(imageBuffer, mimeType || "image/jpeg", userId);
        } catch (uploadErr) {
          console.error("[Card Scan] Image upload failed (non-fatal):", uploadErr);
        }

        const historyRecord = await storage.createScanHistory({
          userId,
          playerName: cardId?.playerName || null,
          year: cardId?.year ? parseInt(String(cardId.year)) : null,
          setName: cardId?.setName || null,
          variation: cardId?.variation || null,
          grade: (cardId as any)?.grade || null,
          grader: (cardId as any)?.grader || null,
          sport: cardId?.sport || null,
          cardNumber: cardId?.cardNumber || null,
          imagePath: uploadedImagePath,
          scanConfidence: scanResult.confidence || null,
          marketValue: null,
          action: null,
          scanSource: "card_analysis",
        });
        scanHistoryId = historyRecord.id;
      } catch (historyErr) {
        console.error("[Card Scan] Failed to save scan history:", historyErr);
      }

      const remainingScans = dailyLimit - scansToday - 1;
      
      res.json({
        success: scanResult.success,
        scan: scanResult,
        scanHistoryId,
        usage: {
          scansToday: scansToday + 1,
          dailyLimit,
          remainingScans: Math.max(0, remainingScans),
          isPro,
        },
      });
    } catch (error) {
      console.error("Error scanning card image:", error);
      
      // Try to get usage data even on error
      try {
        const userId = req.user?.claims?.sub;
        if (userId) {
          const user = await storage.getUser(userId);
          const isPro = hasProAccess(user);
          const dailyLimit = isPro ? PRO_SCAN_DAILY_LIMIT : FREE_SCAN_DAILY_LIMIT;
          const scansToday = getScanCountForToday(userId);
          
          return res.status(500).json({ 
            message: "Failed to scan card image. Please try again or enter details manually.",
            scanError: true,
            usage: {
              scansToday,
              dailyLimit,
              remainingScans: Math.max(0, dailyLimit - scansToday),
              isPro,
            },
          });
        }
      } catch (usageError) {
        // If we can't get usage data, just return the basic error
      }
      
      res.status(500).json({ 
        message: "Failed to scan card image. Please try again or enter details manually.",
        scanError: true,
      });
    }
  });

  // Scan a card image and get identification + pricing (legacy endpoint)
  app.post("/api/cards/scan-image", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { imageData, mimeType } = req.body;

      if (!imageData) {
        return res.status(400).json({ message: "Image data is required" });
      }

      // Validate image data format
      const isValidFormat = imageData.startsWith("data:image/") || 
                           imageData.startsWith("http://") || 
                           imageData.startsWith("https://") ||
                           /^[A-Za-z0-9+/=]+$/.test(imageData.substring(0, 100));
      
      if (!isValidFormat) {
        return res.status(400).json({ message: "Invalid image format. Please provide a base64 encoded image, data URL, or image URL." });
      }

      // Check subscription status for scan limits
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);
      const dailyLimit = isPro ? PRO_SCAN_DAILY_LIMIT : FREE_SCAN_DAILY_LIMIT;
      const scansToday = getScanCountForToday(userId);
      
      if (scansToday >= dailyLimit) {
        return res.status(429).json({
          message: isPro 
            ? `You've reached your daily limit of ${dailyLimit} scans. Try again tomorrow.`
            : `You've used all ${dailyLimit} free scans today. Upgrade to Pro for more scans.`,
          limitReached: true,
          used: scansToday,
          limit: dailyLimit,
          isPro,
        });
      }

      // Check if Gemini credentials are configured
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        console.error("[Card Scan] Gemini credentials not configured");
        return res.status(503).json({ 
          message: "Card scanning is not available. AI service not configured.",
          serviceUnavailable: true,
          usage: {
            scansToday,
            dailyLimit,
            remainingScans: Math.max(0, dailyLimit - scansToday),
            isPro,
          },
        });
      }

      // Import card scanner service
      const { scanCardWithPricing } = await import("./cardImageScannerService");

      console.log(`[Card Scan] User ${userId} scanning card image...`);
      
      // Perform the scan
      let result;
      try {
        result = await scanCardWithPricing(imageData, mimeType || "image/jpeg");
      } catch (scanError) {
        console.error("[Card Scan] Scan failed:", scanError);
        return res.status(500).json({
          message: "Card scanning temporarily unavailable. Please try again or enter details manually.",
          scanError: true,
          usage: {
            scansToday,
            dailyLimit,
            remainingScans: Math.max(0, dailyLimit - scansToday),
            isPro,
          },
        });
      }
      
      // Increment scan count after successful scan
      incrementScanCount(userId);
      
      // Track usage (using the outlook usage system with 'scan' source)
      try {
        await storage.recordOutlookUsage(userId, 'quick', undefined, result.scan.cardIdentification?.playerName || 'Unknown');
      } catch (trackError) {
        console.error("[Card Scan] Failed to track usage:", trackError);
        // Don't fail the request if tracking fails
      }

      const remainingScans = dailyLimit - scansToday - 1;
      
      res.json({
        success: result.scan.success,
        scan: result.scan,
        searchQuery: result.searchQuery,
        pricing: result.pricing,
        queryHash: result.queryHash,
        usage: {
          scansToday: scansToday + 1,
          dailyLimit,
          remainingScans: Math.max(0, remainingScans),
          isPro,
        },
      });
    } catch (error) {
      console.error("Error scanning card image:", error);
      
      // Try to get usage data even on error
      try {
        const userId = req.user?.claims?.sub;
        if (userId) {
          const user = await storage.getUser(userId);
          const isPro = hasProAccess(user);
          const dailyLimit = isPro ? PRO_SCAN_DAILY_LIMIT : FREE_SCAN_DAILY_LIMIT;
          const scansToday = getScanCountForToday(userId);
          
          return res.status(500).json({ 
            message: "Failed to scan card image. Please try again or enter details manually.",
            scanError: true,
            usage: {
              scansToday,
              dailyLimit,
              remainingScans: Math.max(0, dailyLimit - scansToday),
              isPro,
            },
          });
        }
      } catch (usageError) {
        // If we can't get usage data, just return the basic error
      }
      
      res.status(500).json({ 
        message: "Failed to scan card image. Please try again or enter details manually.",
        scanError: true,
      });
    }
  });

  // Get scan usage for current user
  app.get("/api/cards/scan-usage", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);
      const dailyLimit = isPro ? PRO_SCAN_DAILY_LIMIT : FREE_SCAN_DAILY_LIMIT;
      const scansToday = getScanCountForToday(userId);
      
      res.json({
        scansToday,
        dailyLimit,
        remainingScans: Math.max(0, dailyLimit - scansToday),
        isPro,
      });
    } catch (error) {
      console.error("Error getting scan usage:", error);
      res.status(500).json({ message: "Failed to get scan usage" });
    }
  });

  // ============================================================================
  // Player Outlook V2 - Player-First Market Intelligence
  // ============================================================================

  // Player name suggestions for autocomplete
  app.get("/api/player-suggestions", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== "string" || q.length < 2) {
        return res.json([]);
      }
      
      const { searchPlayers } = await import("./playerRegistry");
      const players = searchPlayers(q, 8);
      
      // Return simplified player info for autocomplete
      const suggestions = players.map(p => ({
        name: p.playerName,
        sport: p.sport,
        position: p.positionGroup,
        stage: p.careerStage,
      }));
      
      res.json(suggestions);
    } catch (error) {
      console.error("[Player Suggestions] Error:", error);
      res.json([]);
    }
  });

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
      const isPro = hasProAccess(user);
      
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

  app.post("/api/player-outlook/price-history", isAuthenticated, async (req: any, res) => {
    try {
      const { playerName, sport, year, setName, variation, grade, grader } = req.body;

      if (!playerName || typeof playerName !== "string" || playerName.trim().length < 2) {
        return res.status(400).json({ message: "Player name is required" });
      }

      const { fetchMonthlyPriceHistory } = await import("./outlookEngine");
      const history = await fetchMonthlyPriceHistory({
        playerName: playerName.trim(),
        sport: sport || "football",
        year,
        setName,
        variation,
        grade,
        grader,
      });

      if (!history) {
        return res.status(404).json({ message: "Could not retrieve price history data" });
      }

      if (history.hasAnySales === false) {
        console.log(`[PriceHistory] Suppressing chart for ${playerName} — all data points have 0 sales (fabricated)`);
        return res.status(404).json({ message: "No real sales data available for price history chart" });
      }

      res.json(history);
    } catch (error: any) {
      console.error("[PriceHistory] Error:", error.message);
      res.status(500).json({ message: "Failed to fetch price history" });
    }
  });

  // Get cached player outlook (PUBLIC - no auth required)
  // Used for shared links so visitors can see analysis results without signing up
  app.get("/api/player-outlook/shared/:playerSlug", async (req, res) => {
    try {
      const { playerSlug } = req.params;
      const sport = (req.query.sport as string) || "football";
      
      // Convert slug back to player name (lamar-jackson -> Lamar Jackson)
      const playerName = playerSlug
        .split("-")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
      
      // Build the player key for cache lookup - must match normalizePlayerKey in playerOutlookEngine
      // Format: sport:playername (all lowercase, no spaces or special chars)
      const playerKey = `${sport.toLowerCase()}:${playerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      
      // Look up cached outlook
      const cachedOutlook = await storage.getCachedPlayerOutlook(playerKey);
      
      if (!cachedOutlook || !cachedOutlook.outlookJson) {
        return res.status(404).json({ 
          message: "No cached analysis found for this player. Sign up to generate a new analysis.",
          notFound: true
        });
      }
      
      // Check if cache is too old (more than 30 days)
      const cacheAge = Date.now() - new Date(cachedOutlook.lastFetchedAt || cachedOutlook.createdAt || Date.now()).getTime();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      if (cacheAge > maxAge) {
        return res.status(404).json({ 
          message: "This analysis is outdated. Sign up to get fresh insights.",
          outdated: true
        });
      }
      
      // Return the cached data
      const outlookData = cachedOutlook.outlookJson;
      
      res.json({
        ...outlookData,
        cacheStatus: "cached",
        generatedAt: cachedOutlook.lastFetchedAt || cachedOutlook.createdAt,
        isSharedView: true, // Flag to indicate this is a public shared view
      });
    } catch (error) {
      console.error("Error getting shared player outlook:", error);
      res.status(500).json({ message: "Failed to get player outlook" });
    }
  });

  // Get player outlook history (shows how verdicts changed over time)
  app.get("/api/player-outlook/history/:playerKey", isAuthenticated, async (req: any, res) => {
    try {
      const { playerKey } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      
      // Decode player key (e.g., "nba:lebron_james")
      const decodedKey = decodeURIComponent(playerKey);
      
      const { getPlayerOutlookHistory } = await import("./playerOutlookEngine");
      const history = await getPlayerOutlookHistory(decodedKey, limit);
      
      // Transform for client consumption
      const historyData = history.map(h => ({
        id: h.id,
        verdict: h.verdict,
        verdictModifier: h.modifier,
        temperature: h.temperature,
        confidence: h.confidence,
        snapshotHash: h.snapshotHash || "",
        createdAt: h.snapshotAt, // Client expects createdAt
        // Include key outlook metrics if available
        summary: h.outlookJson?.investmentCall?.oneLineRationale || h.outlookJson?.verdict?.summary,
      }));
      
      res.json({ 
        playerKey: decodedKey,
        history: historyData,
        count: historyData.length 
      });
    } catch (error) {
      console.error("Error getting player outlook history:", error);
      res.status(500).json({ message: "Failed to get outlook history" });
    }
  });

  // Generate comparison narrative for two players (Pro feature)
  app.post("/api/compare-players/narrative", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const isPro = hasProAccess(user);
      
      if (!isPro) {
        return res.status(403).json({ message: "Pro subscription required" });
      }
      
      const { player1, player2, algorithmicWinner } = req.body;
      
      if (!player1?.name || !player2?.name || !player1?.outlook || !player2?.outlook) {
        return res.status(400).json({ message: "Both players with outlook data required" });
      }
      
      // Determine winner name for AI context
      const winnerName = algorithmicWinner === "left" ? player1.name 
        : algorithmicWinner === "right" ? player2.name 
        : null;
      
      const { GoogleGenAI } = await import("@google/genai");
      const gemini = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
      });
      
      const prompt = `You are a sports card investment analyst comparing two players for collecting/investment purposes.

Player 1: ${player1.name}
- Sport: ${player1.sport}
- Position: ${player1.outlook?.player?.position || "Unknown"}
- Team: ${player1.outlook?.player?.team || "Unknown"}
- Career Stage: ${player1.outlook?.player?.stage || "Unknown"}
- Verdict: ${player1.outlook?.investmentCall?.verdict || "Unknown"}
- Temperature: ${player1.outlook?.snapshot?.temperature || "Unknown"}
- Volatility: ${player1.outlook?.snapshot?.volatility || "Unknown"}
- Risk: ${player1.outlook?.snapshot?.risk || "Unknown"}
- Key Points: ${(player1.outlook?.thesis || []).slice(0, 3).join("; ")}

Player 2: ${player2.name}
- Sport: ${player2.sport}
- Position: ${player2.outlook?.player?.position || "Unknown"}
- Team: ${player2.outlook?.player?.team || "Unknown"}
- Career Stage: ${player2.outlook?.player?.stage || "Unknown"}
- Verdict: ${player2.outlook?.investmentCall?.verdict || "Unknown"}
- Temperature: ${player2.outlook?.snapshot?.temperature || "Unknown"}
- Volatility: ${player2.outlook?.snapshot?.volatility || "Unknown"}
- Risk: ${player2.outlook?.snapshot?.risk || "Unknown"}
- Key Points: ${(player2.outlook?.thesis || []).slice(0, 3).join("; ")}

${winnerName ? `IMPORTANT: Our algorithm has determined that ${winnerName} is the better overall investment based on investment verdict analysis. Your "myTake" section should align with this conclusion - the winner field MUST be "${winnerName}". However, you can still highlight the strengths of each player for different investor types.` : ""}

Generate an investment comparison analysis. Return ONLY a valid JSON object (no markdown, no code fences):

{
  "caseForPlayer1": {
    "title": "The Case for [Player1 Name]",
    "strategy": "Value Investor" | "Blue Chip" | "Speculative" | "Momentum",
    "summary": "One compelling sentence explaining why someone would choose this player",
    "points": ["Point 1 about performance/narrative", "Point 2 about market dynamics", "Point 3 about value proposition"]
  },
  "caseForPlayer2": {
    "title": "The Case for [Player2 Name]",
    "strategy": "Value Investor" | "Blue Chip" | "Speculative" | "Momentum",
    "summary": "One compelling sentence explaining why someone would choose this player",
    "points": ["Point 1 about performance/narrative", "Point 2 about market dynamics", "Point 3 about value proposition"]
  },
  "myTake": {
    "winner": "${winnerName || "tie"}",
    "reasoning": "2-3 sentence nuanced analysis explaining why ${winnerName || "neither"} is the better investment while acknowledging the other player's appeal",
    "valueInvestorPick": "${player1.name}" | "${player2.name}",
    "blueChipPick": "${player1.name}" | "${player2.name}",
    "bottomLine": "Short actionable summary like 'Buy X if you want Y, Hold Z if you believe W'"
  }
}

RULES:
- The "winner" in myTake MUST match the algorithmic winner: "${winnerName || "tie"}"
- valueInvestorPick and blueChipPick can differ based on collector type, but at least one should typically be the winner
- Focus on current market dynamics, career trajectory, and card market narratives
- Be specific about what type of collector each player appeals to`;

      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      let responseText = response.text || "";
      
      // Strip markdown code fences if present
      responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
      
      // Extract JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json(parsed);
      }
      
      res.status(500).json({ message: "Failed to generate comparison narrative" });
    } catch (error) {
      console.error("Error generating comparison narrative:", error);
      res.status(500).json({ message: "Failed to generate comparison narrative" });
    }
  });

  // Get user's cards for a specific player (portfolio context)
  app.get("/api/portfolio/player-cards/:playerName", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { playerName } = req.params;
      const sport = req.query.sport as string || undefined;
      
      // Decode player name (URL encoded)
      const decodedPlayerName = decodeURIComponent(playerName);
      
      // Import db and schema dynamically
      const { db } = await import("./db");
      const { cards, displayCases } = await import("@shared/schema");
      const { eq, and, sql } = await import("drizzle-orm");
      
      // Build where conditions
      const conditions = [
        eq(displayCases.userId, userId),
        sql`LOWER(${cards.playerName}) = LOWER(${decodedPlayerName})`
      ];
      if (sport) {
        conditions.push(eq(cards.sport, sport));
      }
      
      // Get user's cards matching this player
      const userCards = await db
        .select({
          id: cards.id,
          title: cards.title,
          playerName: cards.playerName,
          sport: cards.sport,
          estimatedValue: cards.estimatedValue,
          set: cards.set,
          year: cards.year,
          variation: cards.variation,
          grade: cards.grade,
          imagePath: cards.imagePath,
        })
        .from(cards)
        .innerJoin(displayCases, eq(cards.displayCaseId, displayCases.id))
        .where(and(...conditions));
      
      // Calculate total value
      const totalValue = userCards.reduce((sum: number, card: typeof userCards[0]) => sum + (card.estimatedValue || 0), 0);
      
      // Group by card type/set
      const cardsBySet = userCards.reduce((acc: Record<string, typeof userCards>, card: typeof userCards[0]) => {
        const key = card.set || "Unknown Set";
        if (!acc[key]) acc[key] = [];
        acc[key].push(card);
        return acc;
      }, {} as Record<string, typeof userCards>);
      
      res.json({
        playerName: decodedPlayerName,
        cardCount: userCards.length,
        totalValue,
        cards: userCards.slice(0, 10), // Limit to 10 for preview
        cardsBySet: Object.entries(cardsBySet).map(([set, setCards]) => ({
          set,
          count: setCards.length,
          totalValue: setCards.reduce((sum: number, c: typeof userCards[0]) => sum + (c.estimatedValue || 0), 0),
        })),
        hasMore: userCards.length > 10,
      });
    } catch (error) {
      console.error("Error getting player cards:", error);
      res.status(500).json({ message: "Failed to get player cards" });
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

  app.post("/api/display-cases/:id/comments", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { content, guestName } = req.body;

      const userId = req.isAuthenticated?.() ? req.user?.claims?.sub : null;

      if (!userId && (!guestName || typeof guestName !== "string" || guestName.trim().length === 0)) {
        return res.status(400).json({ error: "Name is required for guest comments" });
      }

      if (guestName && guestName.length > 100) {
        return res.status(400).json({ error: "Name too long (max 100 characters)" });
      }

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

      const comment = await storage.createComment(id, userId, content.trim(), userId ? undefined : guestName?.trim());
      
      if (displayCase.userId !== userId) {
        let commenterName = 'Someone';
        if (userId) {
          const commenter = await storage.getUser(userId);
          commenterName = commenter?.handle 
            ? `@${commenter.handle}` 
            : commenter ? `${commenter.firstName || ''} ${commenter.lastName || ''}`.trim() || 'Someone' : 'Someone';
        } else if (guestName) {
          commenterName = guestName.trim();
        }
        
        await storage.createNotification(displayCase.userId, "comment_received", {
          displayCaseId: id,
          caseName: displayCase.name,
          commenterId: userId || 'guest',
          commenterName,
          commentPreview: content.trim().substring(0, 100),
        });
      }
      
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

      if (userId && displayCase.userId === userId) {
        return res.status(400).json({ error: "Cannot like your own display case" });
      }

      const likeUserId = userId || `visitor_${visitorId}`;
      const hasLiked = await storage.toggleLike(id, likeUserId);
      const count = await storage.getLikeCount(id);

      // Award badge if authenticated user liked (not unliked)
      if (hasLiked && userId) {
        prestigeService.checkAndAwardLikeBadge(userId).catch(err => {
          console.error("Error awarding like badge:", err);
        });
        
        // Notify the display case owner about the like (if not self-liking)
        if (displayCase.userId !== userId) {
          const liker = await storage.getUser(userId);
          const likerName = liker?.handle 
            ? `@${liker.handle}` 
            : liker ? `${liker.firstName || ''} ${liker.lastName || ''}`.trim() || 'Someone' : 'Someone';
          
          await storage.createNotification(displayCase.userId, "like_received", {
            displayCaseId: id,
            caseName: displayCase.name,
            likerId: userId,
            likerName,
          });
        }
      }

      res.json({ hasLiked, count });
    } catch (error) {
      console.error("Error toggling like:", error);
      res.status(500).json({ error: "Failed to toggle like" });
    }
  });

  // Stripe routes
  // Cache the resolved Pro price ID so we only look it up once per server boot
  let resolvedProPriceId: string | null = null;

  async function getProPriceId(stripe: any): Promise<string> {
    // 1. Use cached value if already resolved this session
    if (resolvedProPriceId) return resolvedProPriceId;

    // 2. Try env var — but validate it actually exists in Stripe before trusting it
    const envPriceId = process.env.STRIPE_PRICE_ID;
    if (envPriceId) {
      try {
        const price = await stripe.prices.retrieve(envPriceId);
        if (price && price.active) {
          resolvedProPriceId = envPriceId;
          console.log(`[Checkout] Using env STRIPE_PRICE_ID: ${envPriceId}`);
          return resolvedProPriceId;
        }
      } catch {
        console.warn(`[Checkout] STRIPE_PRICE_ID ${envPriceId} not found in this Stripe account — falling back to dynamic lookup`);
      }
    }

    // 3. Dynamic fallback: search for the active monthly Pro subscription price
    const prices = await stripe.prices.list({
      active: true,
      type: "recurring",
      expand: ["data.product"],
      limit: 50,
    });

    // Match by product name containing "Pro" and monthly interval, lowest unit_amount wins (most conservative pick)
    const proMonthly = prices.data
      .filter((p: any) => {
        const name = (typeof p.product === "object" ? p.product?.name : "") || "";
        return (
          p.recurring?.interval === "month" &&
          /pro/i.test(name) &&
          p.unit_amount > 0
        );
      })
      .sort((a: any, b: any) => a.unit_amount - b.unit_amount);

    if (proMonthly.length === 0) {
      throw new Error("No active monthly Pro subscription price found in Stripe. Please create one or set STRIPE_PRICE_ID.");
    }

    resolvedProPriceId = proMonthly[0].id;
    const prodName = typeof proMonthly[0].product === "object" ? proMonthly[0].product?.name : proMonthly[0].product;
    console.log(`[Checkout] Dynamically resolved Pro price: ${resolvedProPriceId} (${prodName} $${proMonthly[0].unit_amount / 100}/mo)`);
    return resolvedProPriceId;
  }

  app.post("/api/create-checkout-session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = process.env.BASE_URL || `https://${req.hostname}`;

      // Resolve the correct Pro price ID — validates env var or falls back to dynamic lookup
      const priceId = await getProPriceId(stripe);

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
            price: priceId,
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

  // Blog image upload (admin only)
  app.put("/api/blog-images", isAuthenticated, isAdmin, async (req: any, res) => {
    if (!req.body.imageURL) {
      return res.status(400).json({ error: "imageURL is required" });
    }

    const userId = req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.imageURL,
        {
          owner: userId,
          visibility: "public",
        },
      );

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting blog image:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

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

  // Admin: Get recent activity logs
  app.get("/api/admin/activity", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const activity = await getRecentActivity(Math.min(limit, 500));
      res.json(activity);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // Admin: Get activity statistics
  app.get("/api/admin/activity/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const stats = await getActivityStats(Math.min(days, 30));
      res.json(stats);
    } catch (error) {
      console.error("Error fetching activity stats:", error);
      res.status(500).json({ message: "Failed to fetch activity stats" });
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

  // Admin: Delete user and all their data
  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;

      // Prevent admin from deleting themselves
      if (userId === req.user.claims.sub) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prevent deleting other admins
      if (user.isAdmin) {
        return res.status(400).json({ message: "Cannot delete admin accounts" });
      }

      await storage.adminDeleteUser(userId);
      res.json({ success: true, message: "User and all associated data deleted" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Admin: Delete display case
  app.delete("/api/admin/display-cases/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const displayCaseId = parseInt(req.params.id);
      if (isNaN(displayCaseId)) {
        return res.status(400).json({ message: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCase(displayCaseId);
      if (!displayCase) {
        return res.status(404).json({ message: "Display case not found" });
      }

      await storage.adminDeleteDisplayCase(displayCaseId);
      res.json({ success: true, message: "Display case and all associated data deleted" });
    } catch (error) {
      console.error("Error deleting display case:", error);
      res.status(500).json({ message: "Failed to delete display case" });
    }
  });

  // Agent Mode: SSE streaming endpoint for AI portfolio auditor (Pro-only)
  app.get("/api/agent/stream", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await storage.getUser(userId);
      if (!dbUser || !hasProAccess(dbUser)) {
        res.status(403).json({ message: "Agent Mode is a Pro feature" });
        return;
      }

      const query = req.query.q as string;
      if (!query || query.trim().length === 0) {
        res.status(400).json({ message: "Query parameter 'q' is required" });
        return;
      }

      const { runAgentStream } = await import("./agentService");
      await runAgentStream(query.trim(), String(userId), res);
    } catch (error) {
      console.error("Error in agent stream:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Agent stream failed" });
      }
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

  // Admin: Career stage advancement (runs automatically March 1 for MLB, July 1 for NBA/NFL/NHL)
  app.post("/api/admin/career-stages/advance", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { triggerCareerStageAdvancement } = await import("./careerStageJob");
      const { sports } = req.body;
      
      // Validate sports parameter
      const validSports = ["MLB", "NBA", "NFL", "NHL"];
      const sportsToAdvance = sports && Array.isArray(sports) 
        ? sports.filter((s: string) => validSports.includes(s.toUpperCase())).map((s: string) => s.toUpperCase())
        : validSports; // Default to all sports if not specified
      
      if (sportsToAdvance.length === 0) {
        return res.status(400).json({ message: "No valid sports specified" });
      }
      
      const results = await triggerCareerStageAdvancement(sportsToAdvance);
      
      res.json({ 
        success: true, 
        sportsAdvanced: sportsToAdvance,
        playersAdvanced: results.length,
        details: results 
      });
    } catch (error) {
      console.error("Error advancing career stages:", error);
      res.status(500).json({ message: "Failed to advance career stages" });
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

  // Admin: Player Registry CRUD endpoints
  app.get("/api/admin/registry/players", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { sport, search, roleTier, page = "1", limit = "50" } = req.query;
      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);
      const offset = (pageNum - 1) * limitNum;
      
      const { db } = await import("./db");
      const { sql, ilike, eq, and } = await import("drizzle-orm");
      
      let conditions = [];
      if (sport && sport !== "all") {
        conditions.push(eq(playerRegistry.sport, sport as string));
      }
      if (roleTier && roleTier !== "all") {
        conditions.push(eq(playerRegistry.roleTier, roleTier as string));
      }
      if (search) {
        conditions.push(ilike(playerRegistry.playerName, `%${search}%`));
      }
      
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      const [players, countResult] = await Promise.all([
        db.select().from(playerRegistry)
          .where(whereClause)
          .orderBy(playerRegistry.sport, playerRegistry.playerName)
          .limit(limitNum)
          .offset(offset),
        db.select({ count: sql<number>`count(*)` }).from(playerRegistry).where(whereClause)
      ]);
      
      const total = Number(countResult[0]?.count || 0);
      
      res.json({
        players,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      console.error("Error fetching player registry:", error);
      res.status(500).json({ message: "Failed to fetch player registry" });
    }
  });

  app.get("/api/admin/registry/players/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const id = parseInt(req.params.id);
      
      const [player] = await db.select().from(playerRegistry).where(eq(playerRegistry.id, id));
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      console.error("Error fetching player:", error);
      res.status(500).json({ message: "Failed to fetch player" });
    }
  });

  app.post("/api/admin/registry/players", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validated = insertPlayerRegistrySchema.parse(req.body);
      const { db } = await import("./db");
      
      const [player] = await db.insert(playerRegistry).values({
        ...validated,
        updatedBy: req.user?.claims?.email || "admin"
      }).returning();
      
      res.status(201).json(player);
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "Player already exists for this sport" });
      }
      console.error("Error creating player:", error);
      res.status(500).json({ message: "Failed to create player" });
    }
  });

  app.put("/api/admin/registry/players/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const validated = insertPlayerRegistrySchema.partial().parse(req.body);
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const [player] = await db.update(playerRegistry)
        .set({
          ...validated,
          lastUpdated: new Date(),
          updatedBy: req.user?.claims?.email || "admin"
        })
        .where(eq(playerRegistry.id, id))
        .returning();
      
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json(player);
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "Player already exists for this sport" });
      }
      console.error("Error updating player:", error);
      res.status(500).json({ message: "Failed to update player" });
    }
  });

  app.delete("/api/admin/registry/players/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const [player] = await db.delete(playerRegistry)
        .where(eq(playerRegistry.id, id))
        .returning();
      
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json({ success: true, message: "Player deleted" });
    } catch (error) {
      console.error("Error deleting player:", error);
      res.status(500).json({ message: "Failed to delete player" });
    }
  });

  // Admin: Bulk import from CSV
  app.post("/api/admin/registry/import-csv", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const fs = await import("fs");
      const path = await import("path");
      
      const csvPath = path.join(process.cwd(), "data", "player_status_registry.csv");
      if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ message: "CSV file not found" });
      }
      
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").slice(1).filter(line => line.trim());
      
      let imported = 0;
      let skipped = 0;
      let errors: string[] = [];
      
      for (const line of lines) {
        try {
          const [sport, playerName, aliases, careerStage, roleTier, positionGroup, lastUpdated, notes] = line.split(",").map(s => s.trim());
          
          if (!sport || !playerName || !careerStage || !roleTier || !positionGroup) {
            skipped++;
            continue;
          }
          
          await db.insert(playerRegistry).values({
            sport,
            playerName,
            aliases: aliases || null,
            careerStage,
            roleTier,
            positionGroup,
            notes: notes || null,
            updatedBy: req.user?.claims?.email || "csv-import"
          }).onConflictDoUpdate({
            target: [playerRegistry.sport, playerRegistry.playerName],
            set: {
              aliases: aliases || null,
              careerStage,
              roleTier,
              positionGroup,
              notes: notes || null,
              lastUpdated: new Date(),
              updatedBy: req.user?.claims?.email || "csv-import"
            }
          });
          imported++;
        } catch (err: any) {
          errors.push(`Row error: ${err.message}`);
          skipped++;
        }
      }
      
      res.json({
        success: true,
        imported,
        skipped,
        total: lines.length,
        errors: errors.slice(0, 10)
      });
    } catch (error) {
      console.error("Error importing CSV:", error);
      res.status(500).json({ message: "Failed to import CSV" });
    }
  });

  // Admin: Export player registry as CSV
  app.get("/api/admin/registry/export-csv", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      
      const players = await db.select().from(playerRegistry).orderBy(playerRegistry.sport, playerRegistry.playerName);
      
      const escapeCSV = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };
      
      const headers = ["Sport", "PlayerName", "Aliases", "CareerStage", "RoleTier", "PositionGroup", "Notes"];
      const rows = players.map(p => [
        escapeCSV(p.sport),
        escapeCSV(p.playerName),
        escapeCSV(p.aliases || ""),
        escapeCSV(p.careerStage),
        escapeCSV(p.roleTier),
        escapeCSV(p.positionGroup),
        escapeCSV(p.notes || "")
      ].join(","));
      
      const csv = [headers.join(","), ...rows].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=player_registry_${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ message: "Failed to export CSV" });
    }
  });

  // Admin: Upload and upsert player registry from CSV content
  app.post("/api/admin/registry/upload-csv", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { csvContent, clearAll } = req.body;
      
      if (!csvContent || typeof csvContent !== "string") {
        return res.status(400).json({ message: "CSV content is required" });
      }
      
      let cleared = false;
      if (clearAll === true) {
        await db.delete(playerRegistry);
        cleared = true;
      }
      
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"' && !inQuotes) {
            inQuotes = true;
          } else if (char === '"' && inQuotes) {
            if (nextChar === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else if (char === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };
      
      const allLines = csvContent.replace(/\r/g, "").split("\n").filter(line => line.trim());
      if (allLines.length < 2) {
        return res.status(400).json({ message: "CSV must have a header row and at least one data row" });
      }
      
      const headerRow = parseCSVLine(allLines[0]);
      const normalizeHeader = (h: string) => h.toLowerCase().replace(/[_\s-]/g, "");
      const headerMap: Record<string, number> = {};
      headerRow.forEach((h, i) => { headerMap[normalizeHeader(h)] = i; });
      
      const getCol = (row: string[], ...names: string[]): string => {
        for (const name of names) {
          const idx = headerMap[normalizeHeader(name)];
          if (idx !== undefined && row[idx]) return row[idx];
        }
        return "";
      };
      
      const lines = allLines.slice(1);
      
      let updated = 0;
      let added = 0;
      let skipped = 0;
      let errors: string[] = [];
      let sampleParsed: any[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        try {
          const parts = parseCSVLine(line);
          
          const sport = getCol(parts, "sport", "league");
          const playerName = getCol(parts, "playername", "player_name", "name");
          const aliases = getCol(parts, "aliases", "alias");
          const careerStage = getCol(parts, "careerstage", "career_stage", "stage");
          const roleTier = getCol(parts, "roletier", "role_tier", "tier", "role");
          const positionGroup = getCol(parts, "positiongroup", "position_group", "position");
          const notes = getCol(parts, "notes", "note");
          
          if (i < 3) {
            sampleParsed.push({ sport, playerName, positionGroup, careerStage, roleTier, rawParts: parts });
          }
          
          if (!sport || !playerName) {
            skipped++;
            continue;
          }
          
          const validCareerStage = careerStage && ["ROOKIE", "YEAR_2", "YEAR_3", "YEAR_4", "PRIME", "VETERAN", "RETIRED_HOF", "BUST"].includes(careerStage) ? careerStage : "PRIME";
          const validRoleTier = roleTier && ["FRANCHISE_CORE", "SOLID_STARTER", "UNCERTAIN_ROLE", "BACKUP_OR_FRINGE", "OUT_OF_LEAGUE", "RETIRED_ICON"].includes(roleTier) ? roleTier : "SOLID_STARTER";
          const validPositionGroup = positionGroup && ["QB", "WR", "RB", "TE", "EDGE", "DL", "LB", "CB", "S", "GUARD", "WING", "BIG", "PITCHER", "CATCHER", "INFIELDER", "OUTFIELDER", "GOALIE", "CENTER", "WINGER", "DEFENSEMAN", "UNKNOWN"].includes(positionGroup) ? positionGroup : "UNKNOWN";
          
          const { eq, and } = await import("drizzle-orm");
          const existing = await db.select().from(playerRegistry)
            .where(and(eq(playerRegistry.sport, sport), eq(playerRegistry.playerName, playerName)))
            .limit(1);
          
          if (existing.length > 0) {
            await db.update(playerRegistry)
              .set({
                aliases: aliases || existing[0].aliases || null,
                careerStage: validCareerStage,
                roleTier: validRoleTier,
                positionGroup: validPositionGroup,
                notes: notes || existing[0].notes || null,
                lastUpdated: new Date(),
                updatedBy: req.user?.claims?.email || "csv-upload"
              })
              .where(and(eq(playerRegistry.sport, sport), eq(playerRegistry.playerName, playerName)));
            updated++;
          } else {
            await db.insert(playerRegistry).values({
              sport,
              playerName,
              aliases: aliases || null,
              careerStage: validCareerStage,
              roleTier: validRoleTier,
              positionGroup: validPositionGroup,
              notes: notes || null,
              updatedBy: req.user?.claims?.email || "csv-upload"
            });
            added++;
          }
        } catch (err: any) {
          errors.push(`Row error: ${err.message}`);
          skipped++;
        }
      }
      
      res.json({
        success: true,
        updated,
        added,
        skipped,
        cleared,
        total: lines.length,
        errors: errors.slice(0, 10),
        debug: {
          headers: headerRow,
          sampleParsed,
          hadCarriageReturns: csvContent.includes('\r')
        }
      });
    } catch (error) {
      console.error("Error uploading CSV:", error);
      res.status(500).json({ message: "Failed to upload CSV" });
    }
  });

  // Admin: Registry stats
  app.get("/api/admin/registry/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      
      const [bySport, byTier, total] = await Promise.all([
        db.select({
          sport: playerRegistry.sport,
          count: sql<number>`count(*)`
        }).from(playerRegistry).groupBy(playerRegistry.sport),
        db.select({
          tier: playerRegistry.roleTier,
          count: sql<number>`count(*)`
        }).from(playerRegistry).groupBy(playerRegistry.roleTier),
        db.select({ count: sql<number>`count(*)` }).from(playerRegistry)
      ]);
      
      res.json({
        total: Number(total[0]?.count || 0),
        bySport: Object.fromEntries(bySport.map(r => [r.sport, Number(r.count)])),
        byTier: Object.fromEntries(byTier.map(r => [r.tier, Number(r.count)]))
      });
    } catch (error) {
      console.error("Error fetching registry stats:", error);
      res.status(500).json({ message: "Failed to fetch registry stats" });
    }
  });

  app.post("/api/admin/registry/ai-refresh", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { sport, batchSize } = req.body;
      const { startAiRefresh } = await import("./playerRegistryAiUpdate");
      const jobId = await startAiRefresh(sport || null, batchSize || 20);
      res.json({ jobId });
    } catch (error: any) {
      console.error("Error starting AI refresh:", error);
      res.status(400).json({ message: error.message || "Failed to start AI refresh" });
    }
  });

  app.get("/api/admin/registry/ai-refresh/:jobId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { getJob } = await import("./playerRegistryAiUpdate");
      const job = getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching AI refresh status:", error);
      res.status(500).json({ message: "Failed to fetch job status" });
    }
  });

  app.post("/api/admin/registry/ai-refresh/:jobId/apply", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { acceptedPlayerIds } = req.body;
      if (!Array.isArray(acceptedPlayerIds)) {
        return res.status(400).json({ message: "acceptedPlayerIds must be an array" });
      }
      const { applyProposals } = await import("./playerRegistryAiUpdate");
      const adminId = req.user.claims.sub;
      const result = await applyProposals(req.params.jobId, acceptedPlayerIds, adminId);
      res.json(result);
    } catch (error: any) {
      console.error("Error applying AI proposals:", error);
      res.status(400).json({ message: error.message || "Failed to apply proposals" });
    }
  });

  // Blog Admin routes
  app.get("/api/admin/blog", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const posts = await storage.getBlogPosts(false);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  app.get("/api/admin/blog/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }
      const post = await storage.getBlogPostById(id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ message: "Failed to fetch blog post" });
    }
  });

  app.post("/api/admin/blog", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { title, slug, excerpt, content, heroImageUrl, videoEmbeds, isPublished } = req.body;
      
      if (!title || !slug || !content) {
        return res.status(400).json({ message: "Title, slug, and content are required" });
      }

      // Check for duplicate slug
      const existing = await storage.getBlogPostBySlug(slug);
      if (existing) {
        return res.status(400).json({ message: "A post with this slug already exists" });
      }

      const post = await storage.createBlogPost({
        title,
        slug,
        excerpt: excerpt || null,
        content,
        heroImageUrl: heroImageUrl || null,
        videoEmbeds: videoEmbeds || [],
        isPublished: isPublished || false,
        publishedAt: isPublished ? new Date() : null,
        authorId: req.user.claims.sub,
      });
      
      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating blog post:", error);
      res.status(500).json({ message: "Failed to create blog post" });
    }
  });

  app.patch("/api/admin/blog/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      const { title, slug, excerpt, content, heroImageUrl, videoEmbeds, isPublished } = req.body;
      
      // If slug is changing, check for duplicates
      if (slug) {
        const existing = await storage.getBlogPostBySlug(slug);
        if (existing && existing.id !== id) {
          return res.status(400).json({ message: "A post with this slug already exists" });
        }
      }

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (slug !== undefined) updateData.slug = slug;
      if (excerpt !== undefined) updateData.excerpt = excerpt;
      if (content !== undefined) updateData.content = content;
      if (heroImageUrl !== undefined) updateData.heroImageUrl = heroImageUrl;
      if (videoEmbeds !== undefined) updateData.videoEmbeds = videoEmbeds;
      if (isPublished !== undefined) {
        updateData.isPublished = isPublished;
        if (isPublished) {
          const existingPost = await storage.getBlogPostById(id);
          if (existingPost && !existingPost.isPublished) {
            updateData.publishedAt = new Date();
          }
        }
      }

      const post = await storage.updateBlogPost(id, updateData);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      res.json(post);
    } catch (error) {
      console.error("Error updating blog post:", error);
      res.status(500).json({ message: "Failed to update blog post" });
    }
  });

  app.post("/api/admin/blog/:id/toggle-publish", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      const post = await storage.toggleBlogPostPublished(id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      res.json(post);
    } catch (error) {
      console.error("Error toggling blog post publish status:", error);
      res.status(500).json({ message: "Failed to toggle publish status" });
    }
  });

  app.delete("/api/admin/blog/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      const post = await storage.getBlogPostById(id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      await storage.deleteBlogPost(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting blog post:", error);
      res.status(500).json({ message: "Failed to delete blog post" });
    }
  });

  // =========================================================================
  // PUBLIC PLAYER OUTLOOK ADMIN ROUTES
  // =========================================================================

  function generatePlayerSlug(playerName: string): string {
    return playerName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  function generateSeoTitle(playerName: string): string {
    return `${playerName} Sports Card Investment Outlook - Should You Buy or Sell?`;
  }

  function generateSeoDescription(playerName: string, sport: string): string {
    const sportLabel = sport === 'football' ? 'NFL' : sport === 'basketball' ? 'NBA' : sport === 'baseball' ? 'MLB' : sport === 'hockey' ? 'NHL' : sport;
    return `Get AI-powered analysis on ${playerName} (${sportLabel}) cards. Find out whether to buy, sell, or hold based on real market data, player performance, and investment timing.`;
  }

  // Admin: List all player outlook cache entries (for management)
  app.get("/api/admin/outlook", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { playerOutlookCache } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      
      const outlooks = await db
        .select()
        .from(playerOutlookCache)
        .orderBy(desc(playerOutlookCache.updatedAt))
        .limit(100);
      
      res.json(outlooks.map(o => ({
        id: o.id,
        playerKey: o.playerKey,
        playerName: o.playerName,
        sport: o.sport,
        slug: o.slug,
        isPublic: o.isPublic,
        seoTitle: o.seoTitle,
        hasOutlook: !!o.outlookJson,
        lastFetchedAt: o.lastFetchedAt,
        updatedAt: o.updatedAt,
      })));
    } catch (error) {
      console.error("Error fetching outlook cache:", error);
      res.status(500).json({ message: "Failed to fetch outlook cache" });
    }
  });

  // Admin: Toggle public status for a player outlook
  app.patch("/api/admin/outlook/:playerKey/public", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { playerKey } = req.params;
      const { isPublic } = req.body;
      
      const cached = await storage.getCachedPlayerOutlook(playerKey);
      if (!cached) {
        return res.status(404).json({ message: "Player outlook not found in cache" });
      }
      
      const slug = cached.slug || generatePlayerSlug(cached.playerName);
      const seoTitle = cached.seoTitle || generateSeoTitle(cached.playerName);
      const seoDescription = cached.seoDescription || generateSeoDescription(cached.playerName, cached.sport);
      
      const updated = await storage.updatePlayerOutlookPublicFields(playerKey, {
        slug,
        isPublic: isPublic === true,
        seoTitle,
        seoDescription,
      });
      
      res.json({
        success: true,
        playerKey,
        slug,
        isPublic: updated?.isPublic,
        url: isPublic ? `/outlook/${cached.sport}/${slug}` : null,
      });
    } catch (error) {
      console.error("Error updating outlook public status:", error);
      res.status(500).json({ message: "Failed to update outlook public status" });
    }
  });

  // Admin: Seed public outlooks for a list of top players
  app.post("/api/admin/outlook/seed", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { getPlayerOutlook, normalizePlayerKey } = await import("./playerOutlookEngine");
      
      const topPlayers = [
        { name: "Patrick Mahomes", sport: "football" },
        { name: "Josh Allen", sport: "football" },
        { name: "CJ Stroud", sport: "football" },
        { name: "Caleb Williams", sport: "football" },
        { name: "Lamar Jackson", sport: "football" },
        { name: "Jayden Daniels", sport: "football" },
        { name: "Victor Wembanyama", sport: "basketball" },
        { name: "Anthony Edwards", sport: "basketball" },
        { name: "Luka Doncic", sport: "basketball" },
        { name: "Shohei Ohtani", sport: "baseball" },
        { name: "Connor McDavid", sport: "hockey" },
      ];
      
      const results: { playerName: string; sport: string; success: boolean; url?: string; error?: string }[] = [];
      
      for (const player of topPlayers) {
        try {
          const outlook = await getPlayerOutlook({ 
            playerName: player.name, 
            sport: player.sport 
          });
          
          if (outlook) {
            const playerKey = normalizePlayerKey(player.sport, player.name);
            const slug = generatePlayerSlug(player.name);
            const seoTitle = generateSeoTitle(player.name);
            const seoDescription = generateSeoDescription(player.name, player.sport);
            
            const updated = await storage.updatePlayerOutlookPublicFields(playerKey, {
              slug,
              isPublic: true,
              seoTitle,
              seoDescription,
            });
            
            if (updated) {
              results.push({
                playerName: player.name,
                sport: player.sport,
                success: true,
                url: `/outlook/${player.sport}/${slug}`,
              });
            } else {
              results.push({
                playerName: player.name,
                sport: player.sport,
                success: false,
                error: `Cache entry not found for key: ${playerKey}`,
              });
            }
          } else {
            results.push({
              playerName: player.name,
              sport: player.sport,
              success: false,
              error: "No outlook generated",
            });
          }
        } catch (err) {
          results.push({
            playerName: player.name,
            sport: player.sport,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
      
      res.json({
        message: "Seeding complete",
        total: topPlayers.length,
        successful: results.filter(r => r.success).length,
        results,
      });
    } catch (error) {
      console.error("Error seeding public outlooks:", error);
      res.status(500).json({ message: "Failed to seed public outlooks" });
    }
  });

  // Public blog routes
  app.get("/api/blog", async (req, res) => {
    try {
      const posts = await storage.getBlogPosts(true);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching published blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  app.get("/api/blog/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const post = await storage.getBlogPostBySlug(slug);
      
      if (!post || !post.isPublished) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      res.json(post);
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ message: "Failed to fetch blog post" });
    }
  });

  // =========================================================================
  // SUPPORT TICKET ROUTES
  // =========================================================================

  // Get user's own support tickets
  app.get("/api/support/tickets", isAuthenticated, async (req: any, res) => {
    try {
      const tickets = await storage.getSupportTicketsForUser(req.user.id);
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching user support tickets:", error);
      res.status(500).json({ message: "Failed to fetch support tickets" });
    }
  });

  // Get a specific ticket (must be owner or admin)
  app.get("/api/support/tickets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: "Invalid ticket ID" });
      }

      const ticket = await storage.getSupportTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // Check access: must be owner or admin
      const isAdmin = await storage.isUserAdmin(req.user.id);
      if (ticket.requesterId !== req.user.id && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to view this ticket" });
      }

      res.json(ticket);
    } catch (error) {
      console.error("Error fetching support ticket:", error);
      res.status(500).json({ message: "Failed to fetch ticket" });
    }
  });

  // Create a new support ticket
  app.post("/api/support/tickets", isAuthenticated, async (req: any, res) => {
    try {
      const { subject, body } = req.body;
      
      if (!subject || !body) {
        return res.status(400).json({ message: "Subject and body are required" });
      }

      if (subject.length > 200) {
        return res.status(400).json({ message: "Subject must be 200 characters or less" });
      }

      const ticket = await storage.createSupportTicket({
        requesterId: req.user.id,
        subject,
        body,
      });

      // Notify all admins about the new ticket
      const adminUsers = await storage.getAdminUsers();
      const user = await storage.getUser(req.user.id);
      for (const admin of adminUsers) {
        await storage.createNotification(admin.id, 'support_ticket_created', {
          ticketId: ticket.id,
          subject: ticket.subject,
          requesterName: user?.firstName && user?.lastName 
            ? `${user.firstName} ${user.lastName}` 
            : user?.handle || 'A user',
          requesterEmail: user?.email,
        });
      }

      res.status(201).json(ticket);
    } catch (error) {
      console.error("Error creating support ticket:", error);
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  // Add a message to a ticket
  app.post("/api/support/tickets/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: "Invalid ticket ID" });
      }

      const { body } = req.body;
      if (!body) {
        return res.status(400).json({ message: "Message body is required" });
      }

      const ticket = await storage.getSupportTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // Check access: must be owner or admin
      const isAdmin = await storage.isUserAdmin(req.user.id);
      if (ticket.requesterId !== req.user.id && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to reply to this ticket" });
      }

      const message = await storage.addSupportTicketMessage({
        ticketId,
        senderId: req.user.id,
        body,
        isAdminReply: isAdmin,
      });

      // Notify the other party
      if (isAdmin) {
        // Admin replied - notify the requester
        await storage.createNotification(ticket.requesterId, 'support_ticket_reply', {
          ticketId: ticket.id,
          subject: ticket.subject,
        });
      } else {
        // User replied - notify all admins
        const adminUsers = await storage.getAdminUsers();
        const user = await storage.getUser(req.user.id);
        for (const admin of adminUsers) {
          await storage.createNotification(admin.id, 'support_ticket_user_reply', {
            ticketId: ticket.id,
            subject: ticket.subject,
            requesterName: user?.firstName && user?.lastName 
              ? `${user.firstName} ${user.lastName}` 
              : user?.handle || 'A user',
          });
        }
      }

      res.status(201).json(message);
    } catch (error) {
      console.error("Error adding ticket message:", error);
      res.status(500).json({ message: "Failed to add message" });
    }
  });

  // Admin: Get all open support tickets
  app.get("/api/admin/support/tickets", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const tickets = await storage.getAllOpenSupportTickets();
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching admin support tickets:", error);
      res.status(500).json({ message: "Failed to fetch support tickets" });
    }
  });

  // Admin: Update ticket status
  app.patch("/api/admin/support/tickets/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: "Invalid ticket ID" });
      }

      const { status } = req.body;
      const validStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const ticket = await storage.updateSupportTicketStatus(ticketId, status, req.user.id);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // Notify requester of status change
      await storage.createNotification(ticket.requesterId, 'support_ticket_status_changed', {
        ticketId: ticket.id,
        subject: ticket.subject,
        newStatus: status,
      });

      res.json(ticket);
    } catch (error) {
      console.error("Error updating ticket status:", error);
      res.status(500).json({ message: "Failed to update ticket status" });
    }
  });

  // =========================================================================
  // PUBLIC PLAYER OUTLOOK ROUTES (SEO-optimized pages)
  // =========================================================================

  // Get all public player outlooks (for sitemap and index)
  app.get("/api/outlook", async (req, res) => {
    try {
      const outlooks = await storage.getAllPublicPlayerOutlooks();
      res.json(outlooks.map(o => ({
        sport: o.sport,
        slug: o.slug,
        playerName: o.playerName,
        seoTitle: o.seoTitle,
        seoDescription: o.seoDescription,
        updatedAt: o.updatedAt,
      })));
    } catch (error) {
      console.error("Error fetching public outlooks:", error);
      res.status(500).json({ message: "Failed to fetch player outlooks" });
    }
  });

  // Get single public player outlook by sport and slug
  app.get("/api/outlook/:sport/:slug", async (req, res) => {
    try {
      const { sport, slug } = req.params;
      const outlook = await storage.getPublicPlayerOutlookBySlug(sport, slug);
      
      if (!outlook) {
        return res.status(404).json({ message: "Player outlook not found" });
      }
      
      // Increment view count (fire-and-forget for performance)
      db.update(playerOutlookCache)
        .set({ viewCount: sql`${playerOutlookCache.viewCount} + 1` })
        .where(eq(playerOutlookCache.id, outlook.id))
        .execute()
        .catch(() => {});
      
      // Return the full outlook data
      res.json({
        playerName: outlook.playerName,
        sport: outlook.sport,
        slug: outlook.slug,
        seoTitle: outlook.seoTitle,
        seoDescription: outlook.seoDescription,
        classification: outlook.classificationJson,
        outlook: outlook.outlookJson,
        lastUpdated: outlook.updatedAt || outlook.lastFetchedAt,
      });
    } catch (error) {
      console.error("Error fetching player outlook:", error);
      res.status(500).json({ message: "Failed to fetch player outlook" });
    }
  });

  // API endpoint for Topps Takeover page live player signals
  app.get("/api/market/topps-takeover-signals", async (req, res) => {
    try {
      const keyPlayers = [
        "Patrick Mahomes",
        "Josh Allen",
        "Lamar Jackson",
        "Ja'Marr Chase",
        "CeeDee Lamb",
        "Caleb Williams",
      ];

      const signals: Record<string, any> = {};
      
      await Promise.all(
        keyPlayers.map(async (name) => {
          try {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            const outlook = await storage.getPublicPlayerOutlookBySlug("football", slug);
            if (outlook?.outlookJson) {
              const json = typeof outlook.outlookJson === "string" ? JSON.parse(outlook.outlookJson) : outlook.outlookJson;
              signals[name] = {
                verdict: json.verdict?.action || json.advisorVerdict || "MONITOR",
                temperature: json.snapshot?.temperature || json.temperature || "NEUTRAL",
                summary: json.verdict?.summary || json.oneLineRationale || `AI-powered investment outlook for ${name}.`,
              };
            }
          } catch (e) {
            // Skip failed lookups silently
          }
        })
      );

      res.json(signals);
    } catch (error) {
      console.error("Error fetching topps takeover signals:", error);
      res.status(500).json({});
    }
  });

  // SSR route for /market/topps-takeover (for search engine crawlers)
  app.get("/market/topps-takeover", async (req, res, next) => {
    const userAgent = req.headers["user-agent"] || "";
    if (!isSearchCrawler(userAgent)) {
      return next();
    }

    try {
      const origin = escapeHtml(getOriginUrl(req));
      const url = escapeHtml(`${getOriginUrl(req)}/market/topps-takeover`);
      const rawOrigin = getOriginUrl(req);
      const title = "Topps NFL Takeover 2026: What It Means for Card Values";
      const description = "On April 1, 2026 Topps takes over the NFL card license from Panini. Independent, data-driven analysis on how this affects your sports card portfolio.";

      const ssrPlayers = ["Patrick Mahomes", "Josh Allen", "Lamar Jackson", "Ja'Marr Chase", "CeeDee Lamb", "Caleb Williams"];
      const playerSignals: { name: string; verdict: string; summary: string }[] = [];
      await Promise.all(ssrPlayers.map(async (name) => {
        try {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          const outlook = await storage.getPublicPlayerOutlookBySlug("football", slug);
          if (outlook?.outlookJson) {
            const json = typeof outlook.outlookJson === "string" ? JSON.parse(outlook.outlookJson) : outlook.outlookJson;
            playerSignals.push({
              name,
              verdict: json.verdict?.action || json.advisorVerdict || "MONITOR",
              summary: json.verdict?.summary || json.oneLineRationale || `Investment outlook for ${name}.`,
            });
          }
        } catch (_) {}
      }));

      const faqItems = [
        { q: "Will Panini NFL cards lose value after the Topps takeover?", a: "It depends on the player and card type. Key Panini rookie cards from stars like Patrick Mahomes may retain collector value as the definitive rookie cards. Future unlicensed Panini products will likely trade at a discount." },
        { q: "When does Topps take over the NFL license from Panini?", a: "Fanatics (which owns Topps) officially holds the exclusive NFL trading card license starting April 1, 2026." },
        { q: "Should I buy Topps NFL cards now or wait?", a: "Early Topps NFL products will likely carry a premium due to novelty. Consider waiting for the initial hype to cool before buying base products." },
        { q: "What happens to Panini Prizm and Select NFL value?", a: "Existing Prizm and Select rookie cards remain the recognized rookies for those players. Long-term premiums may shift toward Topps Chrome." },
        { q: "How does the license change affect graded Panini cards?", a: "Already graded Panini cards retain their established market value. The license change primarily affects new product releases." },
        { q: "Will Topps Chrome replace Panini Prizm as the top NFL product?", a: "Topps Chrome is positioned to become the flagship NFL chromium product, similar to its dominance in baseball." },
      ];

      const faqJsonLd = safeJsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqItems.map(f => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a },
        })),
      });

      const articleJsonLd = safeJsonLd({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "description": description,
        "datePublished": "2026-03-01T00:00:00Z",
        "dateModified": new Date().toISOString(),
        "author": { "@type": "Organization", "name": "Sports Card Portfolio", "url": rawOrigin },
        "publisher": { "@type": "Organization", "name": "Sports Card Portfolio", "url": rawOrigin },
        "mainEntityOfPage": { "@type": "WebPage", "@id": `${rawOrigin}/market/topps-takeover` },
      });

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | Sports Card Portfolio</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="Sports Card Portfolio" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${url}" />
  <script type="application/ld+json">${faqJsonLd}</script>
  <script type="application/ld+json">${articleJsonLd}</script>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin-top: 2rem; }
    .faq { margin-top: 2rem; }
    .faq h3 { font-size: 1.1rem; margin-bottom: 0.3rem; }
    .faq p { color: #555; }
    a { color: #F59E0B; }
  </style>
</head>
<body>
  <article>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <h2>What's Happening</h2>
    <p>After more than a decade of Panini dominance, the NFL trading card landscape is undergoing its most significant shift since the junk wax era. Fanatics — which acquired Topps in 2022 — is activating its exclusive NFL license on April 1, 2026, making Topps the sole producer of officially licensed NFL trading cards.</p>
    <h2>How This Impacts Card Values</h2>
    <p>Existing Panini rookie cards for star players remain irreplaceable — they are the definitive rookie cards. Future unlicensed Panini products will trade at discounts. Early Topps NFL releases carry historical significance but may have novelty premiums.</p>
    <h2>What Collectors Should Do</h2>
    <ul>
      <li>Hold established Panini rookie cards for star players</li>
      <li>Avoid overpaying for the first Topps NFL products out of FOMO</li>
      <li>Diversify across both Panini and Topps eras for downside protection</li>
    </ul>
    ${playerSignals.length > 0 ? `<h2>Live Player Signals</h2>
    <ul>
      ${playerSignals.map(p => `<li><strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(p.verdict)}: ${escapeHtml(p.summary)}</li>`).join("\n      ")}
    </ul>` : ''}
    <div class="faq">
      <h2>Frequently Asked Questions</h2>
      ${faqItems.map(f => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`).join("\n      ")}
    </div>
    <footer>
      <p><a href="${origin}/player-outlook">Player Outlooks</a> | <a href="${origin}/hidden-gems">Hidden Gems</a> | <a href="${origin}">Sports Card Portfolio</a></p>
    </footer>
  </article>
</body>
</html>`;

      res.type("text/html").send(html);
    } catch (error) {
      console.error("[SSR] Error generating topps-takeover HTML:", error);
      next();
    }
  });

  // SSR route for public player outlook pages (for crawlers)
  app.get("/outlook/:sport/:slug", async (req, res, next) => {
    const userAgent = req.headers["user-agent"] || "";
    const isCrawler = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|claude-web|chatgpt|gptbot/i.test(userAgent);
    
    if (!isCrawler) {
      // For humans, let the SPA handle it
      return next();
    }
    
    try {
      const { sport, slug } = req.params;
      const outlook = await storage.getPublicPlayerOutlookBySlug(sport, slug);
      
      if (!outlook || !outlook.outlookJson) {
        return next(); // Let SPA handle 404
      }
      
      const origin = getOriginUrl(req);
      const url = `${origin}/outlook/${sport}/${slug}`;
      const title = outlook.seoTitle || `${outlook.playerName} Sports Card Investment Outlook`;
      const description = outlook.seoDescription || 
        `Should you buy or sell ${outlook.playerName} cards? Get AI-powered investment analysis, market temperature, and timing tips.`;
      
      const { transformToSSRAdvisorOutlook, applySSRVerdictGuardrails } = await import("./lib/outlookTransformServer");
      const advisorOutlook = applySSRVerdictGuardrails(transformToSSRAdvisorOutlook(outlook.outlookJson));
      
      const verdict = advisorOutlook.verdict;
      const verdictLabel = advisorOutlook.verdictLabel;
      const advisorTake = advisorOutlook.advisorTake;
      const topReasons = advisorOutlook.topReasons;
      
      // Generate JSON-LD structured data
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "description": description,
        "author": {
          "@type": "Organization",
          "name": "Sports Card Portfolio",
          "url": origin
        },
        "publisher": {
          "@type": "Organization",
          "name": "Sports Card Portfolio",
          "url": origin
        },
        "dateModified": outlook.updatedAt?.toISOString() || new Date().toISOString(),
        "mainEntityOfPage": url,
        "about": {
          "@type": "Person",
          "name": outlook.playerName
        }
      };
      
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="Sports Card Portfolio">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="canonical" href="${url}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  <main>
    <article>
      <h1>${outlook.playerName} Sports Card Investment Outlook</h1>
      <p><strong>Sport:</strong> ${outlook.sport}</p>
      <p><strong>Verdict:</strong> ${verdictLabel} (${verdict})</p>
      <section>
        <h2>Advisor Analysis</h2>
        <p>${advisorTake}</p>
      </section>
      ${topReasons.length > 0 ? `
      <section>
        <h2>Key Reasons</h2>
        <ul>
          ${topReasons.map(r => `<li>${r}</li>`).join('\n          ')}
        </ul>
      </section>` : ''}
      <section>
        <h2>Get the Full Analysis</h2>
        <p>Sign up at <a href="${origin}">Sports Card Portfolio</a> for real-time market intelligence, price tracking, and personalized investment recommendations.</p>
      </section>
    </article>
  </main>
</body>
</html>`;
      
      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error("Error serving SSR outlook page:", error);
      next();
    }
  });

  // Sitemap for SEO
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const posts = await storage.getBlogPosts(true);
      const outlooks = await storage.getAllPublicPlayerOutlooks();
      const baseUrl = getOriginUrl(req);
      
      let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/explore</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/market/topps-takeover</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      
      // Add blog posts
      for (const post of posts) {
        const lastmod = post.updatedAt ? new Date(post.updatedAt).toISOString().split('T')[0] : '';
        sitemap += `
  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
      }
      
      // Add player outlook pages (high priority for SEO)
      for (const outlook of outlooks) {
        if (outlook.slug) {
          const lastmod = outlook.updatedAt ? new Date(outlook.updatedAt).toISOString().split('T')[0] : '';
          sitemap += `
  <url>
    <loc>${baseUrl}/outlook/${outlook.sport}/${outlook.slug}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;
        }
      }
      
      sitemap += `
</urlset>`;
      
      res.set('Content-Type', 'application/xml');
      res.send(sitemap);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send('Error generating sitemap');
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

  // Portfolio Growth Projections (Pro feature)
  app.get("/api/analytics/growth-projections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check Pro subscription
      const user = await storage.getUser(userId);
      if (!hasProAccess(user)) {
        return res.status(403).json({ 
          message: "Growth Projections is a Pro feature. Upgrade to see personalized value forecasts for your collection." 
        });
      }
      
      const { getPortfolioGrowthProjections, generateAIGrowthSummary } = await import("./growthProjectionsService");
      const projections = await getPortfolioGrowthProjections(userId);
      
      // Generate AI summary if there are cards
      let aiSummary = "";
      if (projections.currentValue > 0) {
        aiSummary = await generateAIGrowthSummary(projections);
      }
      
      res.json({ ...projections, aiSummary });
    } catch (error) {
      console.error("Error fetching growth projections:", error);
      res.status(500).json({ message: "Failed to fetch growth projections" });
    }
  });

  app.get("/api/analytics/market-benchmarks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!hasProAccess(user)) {
        return res.status(403).json({ message: "Market benchmarks is a Pro feature." });
      }
      
      const { getMarketBenchmarks, getPortfolioPerformanceOverTime } = await import("./marketBenchmarkService");
      
      const [benchmarks, portfolioPerformance] = await Promise.allSettled([
        getMarketBenchmarks(),
        getPortfolioPerformanceOverTime(userId),
      ]);
      
      res.json({
        benchmarks: benchmarks.status === "fulfilled" ? benchmarks.value : { sp500: [], bitcoin: [], fetchedAt: new Date().toISOString() },
        portfolioPerformance: portfolioPerformance.status === "fulfilled" ? portfolioPerformance.value : [],
      });
    } catch (error) {
      console.error("Error fetching market benchmarks:", error);
      res.status(500).json({ message: "Failed to fetch market benchmarks" });
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

      logActivity("offer_send", {
        userId,
        targetId: offer.id,
        targetType: "offer",
        metadata: { 
          cardId: numericCardId,
          cardTitle: card.title,
          amount: numericAmount,
          recipientId: displayCase.userId,
        },
        req,
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
      if (!hasProAccess(user)) {
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
      const isPro = hasProAccess(user);
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

      const card = await storage.getCard(cardId);
      if (card) {
        const userId = req.user?.claims?.sub;
        recordInterestEvent({ cardId, playerName: card.playerName ?? undefined, cardTitle: card.title, eventType: "view", userId });
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
      const limit = hasProAccess(user) ? null : 3;
      
      res.json({ count, limit, isPro: hasProAccess(user) });
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
        
        // Calculate liquidity assessment if we have filters
        const summary = swrResult.data.summaryJson;
        const filters = swrResult.data.filters || {};
        const querySpecificity = ebayComps.calculateQuerySpecificity(filters);
        const scrapeHealth = ebayComps.fetchStatusToScrapeHealth(swrResult.data.fetchStatus, swrResult.data.failureCount);
        const liquidityAssessment = ebayComps.calculateLiquidityAssessment(
          swrResult.data.soldCount,
          summary?.cappedAtMax ?? false,
          summary?.dateCoverageDays ?? 30,
          swrResult.data.avgMatchScore ?? 0.5,
          querySpecificity,
          scrapeHealth
        );
        
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
            refreshing: swrResult.needsRefresh,
            liquidityAssessment
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
      
      // When ready, include the pricing data
      const response: Record<string, any> = {
        status: entry.fetchStatus,
        fetchStatus: entry.fetchStatus, // Also include fetchStatus for compatibility
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
      };
      
      // Include pricing data when status is complete
      if (entry.fetchStatus === "complete" && entry.summaryJson) {
        response.summaryJson = entry.summaryJson;
        // Include comps for recent sales
        response.comps = entry.compsJson as any[] || [];
      }
      
      res.json(response);
      
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

  // POST /api/portfolio/next-buys/dismiss - Dismiss a recommendation (already own / not interested)
  app.post("/api/portfolio/next-buys/dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { playerName, reason } = req.body;
      if (!playerName) {
        return res.status(400).json({ error: "playerName is required" });
      }

      const validReasons = ["already_own", "not_interested"];
      const dismissReason = validReasons.includes(reason) ? reason : "not_interested";

      // Import required modules
      const { db } = await import("./db");
      const { and, eq, sql } = await import("drizzle-orm");
      const { dismissedRecommendations, nextBuys } = await import("@shared/schema");
      
      // Insert or update the dismissal
      await db
        .insert(dismissedRecommendations)
        .values({
          userId,
          playerName: playerName.trim(),
          reason: dismissReason,
        })
        .onConflictDoUpdate({
          target: [dismissedRecommendations.userId, dismissedRecommendations.playerName],
          set: { reason: dismissReason, dismissedAt: new Date() },
        });

      // Delete from next_buys so it disappears immediately
      await db
        .delete(nextBuys)
        .where(
          and(
            eq(nextBuys.userId, userId),
            sql`LOWER(${nextBuys.playerName}) = LOWER(${playerName.trim()})`
          )
        );

      console.log(`[NextBuys] User ${userId} dismissed ${playerName} (${dismissReason})`);
      res.json({ success: true, dismissed: playerName });
    } catch (error) {
      console.error("[NextBuys] Error dismissing:", error);
      res.status(500).json({ error: "Failed to dismiss recommendation" });
    }
  });

  // ============================================================================
  // Hidden Gems - Data-driven undervalued player picks
  // ============================================================================
  
  const { getActiveHiddenGems, refreshHiddenGems, getHiddenGemsStats, getFallbackFeaturedGems, seedPlayerOutlooks, getRefreshStatus } = await import("./hiddenGemsService");
  const { getPlayerOutlook } = await import("./playerOutlookEngine");

  // GET /api/hidden-gems - Get active hidden gems (public, but detailed fields gated to Pro)
  app.get("/api/hidden-gems", async (req: any, res) => {
    try {
      let gems = await getActiveHiddenGems();
      const stats = await getHiddenGemsStats();
      
      // If no AI-generated gems exist, use curated fallback
      let isFallback = false;
      if (gems.length === 0) {
        gems = getFallbackFeaturedGems();
        isFallback = true;
      }
      
      // Check if user has Pro access - strip detailed fields for free users
      const userId = req.user?.claims?.sub;
      let userIsPro = false;
      if (userId) {
        const user = await storage.getUser(userId);
        userIsPro = hasProAccess(user);
      }
      
      const responseGems = userIsPro ? gems : gems.map((gem: any) => ({
        ...gem,
        thesis: "",
        whyDiscounted: [],
        repricingCatalysts: [],
        trapRisks: [],
      }));
      
      res.json({
        gems: responseGems,
        stats: isFallback ? {
          ...stats,
          totalActive: gems.length,
          bySport: { NFL: 3, NBA: 3, MLB: 3, NHL: 3 },
        } : stats,
        cached: true,
        isFallback,
        userIsPro,
      });
    } catch (error) {
      console.error("[Hidden Gems] Error fetching:", error);
      res.status(500).json({ error: "Failed to fetch hidden gems" });
    }
  });

  // POST /api/hidden-gems/refresh - Admin-only refresh (generates new gems from AI in background)
  app.post("/api/hidden-gems/refresh", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const targetCount = parseInt(req.query.count as string) || 25;
      
      console.log(`[Hidden Gems] Admin ${userId} triggered refresh...`);
      const result = await refreshHiddenGems(targetCount);
      
      if (result.error === "Refresh already in progress") {
        return res.status(409).json({
          success: false,
          error: "A refresh is already in progress. Check status for updates.",
          batchId: result.batchId,
        });
      }

      res.json({
        success: true,
        batchId: result.batchId,
        message: "Refresh started in background. Poll /api/hidden-gems/refresh-status for progress.",
      });
    } catch (error) {
      console.error("[Hidden Gems] Error refreshing:", error);
      res.status(500).json({ error: "Failed to start refresh" });
    }
  });

  // GET /api/hidden-gems/refresh-status - Check refresh progress
  app.get("/api/hidden-gems/refresh-status", async (_req, res) => {
    res.json(getRefreshStatus());
  });

  // GET /api/hidden-gems/stats - Get hidden gems statistics
  app.get("/api/hidden-gems/stats", async (req, res) => {
    try {
      const stats = await getHiddenGemsStats();
      res.json(stats);
    } catch (error) {
      console.error("[Hidden Gems] Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // POST /api/hidden-gems/seed - Admin-only: Seed database with popular player outlooks
  app.post("/api/hidden-gems/seed", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const maxPlayers = parseInt(req.query.count as string) || 50;
      
      console.log(`[Seed] Admin ${userId} triggered player outlook seeding (max: ${maxPlayers})...`);
      
      // Run seeding in background and return immediately
      res.json({
        success: true,
        message: `Seeding started for up to ${maxPlayers} players. Check server logs for progress.`,
        note: "This runs in the background. Refresh Hidden Gems after completion to see new data.",
      });

      // Execute seeding after response is sent
      seedPlayerOutlooks(getPlayerOutlook, maxPlayers)
        .then((result) => {
          console.log(`[Seed] Complete:`, result);
        })
        .catch((error) => {
          console.error(`[Seed] Error:`, error);
        });
    } catch (error) {
      console.error("[Seed] Error starting seed:", error);
      res.status(500).json({ error: "Failed to start seeding" });
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

  // ============================================================================
  // Collector Takes API
  // ============================================================================

  // POST /api/takes/from-market - Generate takes from existing market data
  app.post("/api/takes/from-market", async (req, res) => {
    try {
      const { marketToTakeInputs } = await import("./takes/adapter");
      const { generateTakes } = await import("./takes/generator");
      const { scope, subject, market, portfolioContext } = req.body;

      if (!scope || !subject || !market) {
        return res.status(400).json({ error: "Missing scope, subject, or market" });
      }

      const inputs = marketToTakeInputs(market);
      const takes = generateTakes({
        scope,
        subject,
        inputs,
        portfolioContext,
      });

      res.json({ takes });
    } catch (error) {
      console.error("[Takes] Error generating takes:", error);
      res.status(500).json({ error: "Failed to generate takes" });
    }
  });

  // ============================================================================
  // BREAK VALUE AUDITOR - Replaces old splits/box breaks hosting
  // ============================================================================

  app.post("/api/market/break-audit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { z } = await import("zod");
      const breakAuditSchema = z.object({
        sport: z.string().min(1),
        product: z.string().min(1),
        pricePerSlot: z.coerce.number().positive(),
        totalSlots: z.coerce.number().int().positive(),
        teams: z.array(z.string()).optional(),
      });
      const parseResult = breakAuditSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid input", details: parseResult.error.flatten().fieldErrors });
      }
      const { sport, product, pricePerSlot, totalSlots, teams } = parseResult.data;

      const dbUser = await storage.getUser(userId);
      const isPro = dbUser ? hasProAccess(dbUser) : false;

      const sportLower = sport.toLowerCase();
      const { SPORT_FRAMEWORKS } = await import("./playerClassificationEngine");

      const framework = SPORT_FRAMEWORKS[sportLower] || SPORT_FRAMEWORKS["football"];
      const checklistContext = framework ? `
INTERNAL CHECKLIST DATA for ${sport}:
- Premium targets (highest value cards): ${framework.premium.join(", ")}
- Growth targets (mid-tier value): ${framework.growth.join(", ")}
- Core targets (base-level value): ${framework.core.join(", ")}
- Speculative targets (upside plays): ${framework.speculative.join(", ")}` : "";

      const sportBaseRanges: Record<string, { low: number; mid: number; high: number }> = {
        football: { low: 12, mid: 22, high: 35 },
        basketball: { low: 15, mid: 28, high: 45 },
        baseball: { low: 8, mid: 16, high: 28 },
        hockey: { low: 6, mid: 12, high: 22 },
        soccer: { low: 10, mid: 20, high: 35 },
      };
      const baseRange = sportBaseRanges[sportLower] || sportBaseRanges.football;

      let playerDataContext = "";
      try {
        const registryPlayers = await db.select({
          playerName: playerRegistry.playerName,
          roleTier: playerRegistry.roleTier,
          careerStage: playerRegistry.careerStage,
          positionGroup: playerRegistry.positionGroup,
        }).from(playerRegistry).where(eq(playerRegistry.sport, sportLower)).limit(80);

        if (registryPlayers.length > 0) {
          const tierGroups: Record<string, string[]> = {};
          for (const p of registryPlayers) {
            const tier = p.roleTier || "UNKNOWN";
            if (!tierGroups[tier]) tierGroups[tier] = [];
            tierGroups[tier].push(`${p.playerName} (${p.positionGroup || "?"}, ${p.careerStage || "?"})`);
          }
          const tierSummary = Object.entries(tierGroups)
            .map(([tier, players]) => `  ${tier}: ${players.slice(0, 12).join(", ")}${players.length > 12 ? ` (+${players.length - 12} more)` : ""}`)
            .join("\n");
          playerDataContext = `
INTERNAL PLAYER REGISTRY DATA (${registryPlayers.length} ${sport} players tracked):
${tierSummary}
Use these player tiers to inform which teams carry the most value — FRANCHISE_CORE and STARTER players drive slot value.`;
        }
      } catch (e) {
        console.warn("[BreakAuditor] Could not load player registry:", e);
      }

      let recentAnalysisContext = "";
      try {
        const recentAnalyses = await db.execute(sql`
          SELECT c.player_name, c.year, c.card_set, c.estimated_value, c.sport
          FROM cards c
          WHERE LOWER(c.sport) = ${sportLower}
            AND c.estimated_value IS NOT NULL
            AND c.estimated_value > 0
          ORDER BY c.estimated_value DESC
          LIMIT 25
        `);
        if (recentAnalyses.rows && recentAnalyses.rows.length > 0) {
          const cardLines = recentAnalyses.rows
            .map((r: any) => `  ${r.player_name} - ${r.year || ""} ${r.card_set || ""}: $${Number(r.estimated_value).toFixed(0)}`)
            .join("\n");
          recentAnalysisContext = `
INTERNAL CARD VALUE DATA (top valued ${sport} cards in our database):
${cardLines}
Use these actual card values to calibrate your slot value estimates.`;
        }
      } catch (e) {
        console.warn("[BreakAuditor] Could not load card values:", e);
      }

      const teamsContext = teams && teams.length > 0
        ? `Available teams/slots the user is considering: ${teams.join(", ")}.`
        : "No specific teams provided — analyze the most common team break structure for this product.";

      const detailLevel = isPro
        ? "Provide detailed slot-by-slot analysis for EVERY team/slot in this break."
        : "Provide only the overall summary, verdict, and top-level stats. Do NOT include individual slot analyses.";

      const { GoogleGenAI } = await import("@google/genai");
      const gemini = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
      });

      const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const prompt = `You are a sports card break value analyst. Today is ${currentDate}.

A collector is considering joining a box break with these details:
- Product: ${product}
- Sport: ${sport}
- Price per slot: $${pricePerSlot}
- Total slots: ${totalSlots}
${teamsContext}

INTERNAL PRICING BASELINE for ${sport}:
- Low-tier player base value: $${baseRange.low}
- Mid-tier player base value: $${baseRange.mid}
- High-tier player base value: $${baseRange.high}
These are base card values — autographs, parallels, and numbered cards multiply these significantly.
${checklistContext}
${playerDataContext}
${recentAnalysisContext}

${detailLevel}

Analyze the expected value (EV) of this break. Consider:
- The internal pricing data and player registry provided above as your primary grounding
- Current market prices for key rookie cards, autos, and parallels from this product
- Which teams have the most valuable rookies and current stars (refer to FRANCHISE_CORE and STARTER tiers)
- The checklist data above to assess which card types drive value in this product
- Box odds and typical hit distribution

Return a JSON object with this EXACT structure:
{
  "product": "${product}",
  "pricePerSlot": ${pricePerSlot},
  "totalSlots": ${totalSlots},
  "sport": "${sport}",
  "overallVerdict": "BUY or PASS or SELECTIVE",
  "overallEV": <average estimated dollar value per slot across all slots>,
  "evRatio": <overallEV divided by pricePerSlot, e.g. 1.2 means 20% positive EV>,
  "summary": "2-3 sentence overall assessment of whether this break is worth joining",
  "slotAnalyses": [${isPro ? `
    {
      "team": "Team Name",
      "estimatedValue": <dollar value estimate>,
      "keyPlayers": ["Player 1", "Player 2"],
      "outlook": "Brief reason this team is good/bad value",
      "verdict": "GREAT_VALUE or FAIR or OVERPRICED or RISKY"
    }` : ""}
  ],
  "topPicks": ["Team 1", "Team 2", "Team 3"],
  "avoidSlots": ["Team A", "Team B"],
  "marketContext": "Brief note on current market conditions affecting this product"
}

RULES:
- Ground your analysis in the internal data provided above — use player tiers and card values as your baseline
- overallEV should be the average expected value per slot, not total break value
- evRatio = overallEV / pricePerSlot
- overallVerdict: BUY if evRatio > 1.15, PASS if evRatio < 0.85, SELECTIVE otherwise
- topPicks: 2-4 teams with best value relative to slot cost
- avoidSlots: 1-3 teams with worst value relative to slot cost
${isPro ? "- Include ALL teams/slots in slotAnalyses array, sorted by estimatedValue descending" : "- Leave slotAnalyses as empty array []"}
- Be honest — most breaks are negative EV. Only recommend if the math truly works.

Return ONLY valid JSON, no markdown.`;

      const result = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      });

      const text = result.text || "";
      const jsonMatch = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      let parsed;
      try {
        parsed = JSON.parse(jsonMatch);
      } catch {
        console.error("[BreakAuditor] Failed to parse Gemini response:", text.substring(0, 500));
        return res.status(500).json({ error: "Failed to parse analysis results" });
      }

      parsed.pricePerSlot = pricePerSlot;
      parsed.totalSlots = totalSlots;
      parsed.sport = sport;
      parsed.product = product;
      parsed.dataGrounded = true;

      if (!isPro) {
        parsed.slotAnalyses = [];
      }

      res.json(parsed);
    } catch (error) {
      console.error("[BreakAuditor] Error:", error);
      res.status(500).json({ error: "Failed to analyze break" });
    }
  });

  // Legacy break/split endpoints - disabled (regulatory compliance)
  app.get("/api/breaks", (_req, res) => {
    res.status(410).json({ error: "Box break hosting has been discontinued. Use the Break Value Auditor instead.", redirect: "/market/break-auditor" });
  });

  const breakDeprecated = (_req: any, res: any) => {
    res.status(410).json({ error: "Box break hosting has been discontinued. Use the Break Value Auditor instead.", redirect: "/market/break-auditor" });
  };
  app.get("/api/breaks/:id", breakDeprecated);
  app.get("/api/splits/:id", breakDeprecated);
  app.get("/api/splits/:id/seats", breakDeprecated);
  app.post("/api/splits/:id/join", breakDeprecated);
  app.post("/api/splits/:id/preferences", breakDeprecated);
  app.get("/api/my-seats", breakDeprecated);
  app.post("/api/splits/:id/checkout", breakDeprecated);
  app.get("/api/admin/breaks", breakDeprecated);
  app.post("/api/admin/breaks", breakDeprecated);
  app.patch("/api/admin/breaks/:id", breakDeprecated);
  app.delete("/api/admin/breaks/:id", breakDeprecated);
  app.post("/api/admin/breaks/:id/splits", breakDeprecated);
  app.get("/api/admin/splits", breakDeprecated);
  app.patch("/api/admin/splits/:id", breakDeprecated);
  app.post("/api/admin/splits/:id/status", breakDeprecated);
  app.post("/api/admin/splits/:id/open-payment", breakDeprecated);
  app.post("/api/admin/splits/:id/lock-and-assign", breakDeprecated);
  app.get("/api/admin/splits/:id/seats", breakDeprecated);
  app.post("/api/webhooks/stripe", breakDeprecated);

  app.get("/portfolio-builder*", (_req, res) => {
    res.redirect(301, "/market/break-auditor");
  });
  app.get("/admin/portfolio-builder*", (_req, res) => {
    res.redirect(301, "/market/break-auditor");
  });

  // NOTE: ~1000 lines of box break hosting code (routes for /api/breaks, /api/splits,
  // /api/admin/breaks, /api/admin/splits, /api/webhooks/stripe, seat management,
  // payment processing, assignment algorithms, etc.) were removed here for
  // regulatory compliance. The 410 stubs above ensure existing clients get a
  // clear deprecation message. Database tables remain intact for data preservation.

  // USER FEEDBACK
  // ============================================================================
  app.post("/api/feedback", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || null;
      const { type, message, page } = req.body;

      if (!type || !message) {
        return res.status(400).json({ error: "Type and message are required" });
      }

      const validTypes = ["bug", "feature", "general", "praise"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: "Invalid feedback type" });
      }

      if (message.length > 2000) {
        return res.status(400).json({ error: "Message too long (max 2000 characters)" });
      }

      const userAgent = req.headers["user-agent"] || null;

      await db.insert(userFeedback).values({
        userId,
        type,
        message: message.trim(),
        page: page || null,
        userAgent,
      });

      res.status(201).json({ success: true, message: "Thank you for your feedback!" });
    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Get all feedback (admin only - you can add auth check later)
  app.get("/api/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const feedback = await db
        .select()
        .from(userFeedback)
        .orderBy(desc(userFeedback.createdAt))
        .limit(100);

      res.json(feedback);
    } catch (error) {
      console.error("Error getting feedback:", error);
      res.status(500).json({ error: "Failed to get feedback" });
    }
  });

  // Update feedback status
  app.patch("/api/feedback/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid feedback ID" });
      }

      const validStatuses = ["new", "reviewed", "resolved"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await db
        .update(userFeedback)
        .set({ status })
        .where(eq(userFeedback.id, id));

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating feedback:", error);
      res.status(500).json({ error: "Failed to update feedback" });
    }
  });

  // ============================================================================
  // SCAN HISTORY
  // ============================================================================

  app.get("/api/scan-history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const isPro = user ? hasProAccess(user) : false;

      const FREE_SCAN_HISTORY_LIMIT = 10;
      const requestedLimit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
      const offset = parseInt(String(req.query.offset)) || 0;

      const limit = isPro ? requestedLimit : Math.min(requestedLimit, FREE_SCAN_HISTORY_LIMIT);
      const effectiveOffset = isPro ? offset : 0;

      const [items, total] = await Promise.all([
        storage.getScanHistory(userId, limit, effectiveOffset),
        storage.getScanHistoryCount(userId),
      ]);

      const visibleTotal = isPro ? total : Math.min(total, FREE_SCAN_HISTORY_LIMIT);

      res.json({ items, total: visibleTotal, limit, offset: effectiveOffset, isPro, totalAll: total });
    } catch (error) {
      console.error("Error fetching scan history:", error);
      res.status(500).json({ message: "Failed to fetch scan history" });
    }
  });

  app.delete("/api/scan-history/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scan history ID" });
      }

      await storage.deleteScanHistory(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting scan history:", error);
      res.status(500).json({ message: "Failed to delete scan history entry" });
    }
  });

  // ============================================================================
  // POP REPORT HISTORY - Ingestion & Query APIs
  // ============================================================================

  const POP_INGESTION_API_KEY = process.env.POP_INGESTION_API_KEY;

  app.post("/api/pop-history/ingest", async (req: any, res) => {
    try {
      if (!POP_INGESTION_API_KEY) {
        return res.status(503).json({ message: "Pop ingestion API key not configured" });
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${POP_INGESTION_API_KEY}`) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      const { snapshots } = req.body;
      if (!Array.isArray(snapshots) || snapshots.length === 0) {
        return res.status(400).json({ message: "Request body must include a non-empty 'snapshots' array" });
      }

      if (snapshots.length > 1000) {
        return res.status(400).json({ message: "Maximum 1000 snapshots per request" });
      }

      const validated: InsertPopHistory[] = [];
      const errors: string[] = [];

      for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        const result = insertPopHistorySchema.safeParse({
          ...snap,
          snapshotDate: snap.snapshotDate ? new Date(snap.snapshotDate) : undefined,
        });
        if (result.success) {
          validated.push(result.data);
        } else {
          errors.push(`[${i}]: ${result.error.issues.map(e => e.message).join(", ")}`);
        }
      }

      if (validated.length === 0) {
        return res.status(400).json({ message: "No valid snapshots", errors });
      }

      const inserted = await storage.insertPopSnapshots(validated);

      res.json({
        inserted: inserted.length,
        rejected: errors.length,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      });
    } catch (error) {
      console.error("[Pop History] Ingestion error:", error);
      res.status(500).json({ message: "Failed to ingest pop history data" });
    }
  });

  app.get("/api/pop-history/trends/:playerName", async (req: any, res) => {
    try {
      const { playerName } = req.params;
      const { grader, grade, year, setName, variation, cardNumber } = req.query;

      if (!playerName || playerName.trim().length === 0) {
        return res.status(400).json({ message: "playerName is required" });
      }

      const trends = await storage.getPopTrends(
        decodeURIComponent(playerName),
        grader as string | undefined,
        grade as string | undefined,
        {
          year: year ? parseInt(year as string) : undefined,
          setName: setName as string | undefined,
          variation: variation as string | undefined,
          cardNumber: cardNumber as string | undefined,
        },
      );

      res.json({ playerName: decodeURIComponent(playerName), trends });
    } catch (error) {
      console.error("[Pop History] Trends query error:", error);
      res.status(500).json({ message: "Failed to fetch pop trends" });
    }
  });

  app.get("/api/pop-history/:playerName", async (req: any, res) => {
    try {
      const { playerName } = req.params;
      const { year, setName, grader, grade, limit } = req.query;

      if (!playerName || playerName.trim().length === 0) {
        return res.status(400).json({ message: "playerName is required" });
      }

      const history = await storage.getPopHistory(
        decodeURIComponent(playerName),
        {
          year: year ? parseInt(year as string) : undefined,
          setName: setName as string | undefined,
          grader: grader as string | undefined,
          grade: grade as string | undefined,
          limit: limit ? Math.min(parseInt(limit as string) || 100, 500) : undefined,
        },
      );

      res.json({ playerName: decodeURIComponent(playerName), history });
    } catch (error) {
      console.error("[Pop History] History query error:", error);
      res.status(500).json({ message: "Failed to fetch pop history" });
    }
  });

  // =========================================================================
  // Alpha Engine API
  // =========================================================================

  app.get("/api/alpha/interest-velocity/:identifier", async (req: any, res) => {
    try {
      const { identifier } = req.params;
      if (!identifier || identifier.trim().length === 0) {
        return res.status(400).json({ message: "Card identifier is required" });
      }

      const decoded = decodeURIComponent(identifier);
      const numericId = parseInt(decoded);
      const isCardId = !isNaN(numericId) && numericId > 0;
      const cardTitle = req.query.cardTitle ? decodeURIComponent(req.query.cardTitle as string) : undefined;

      const velocity = await storage.getInterestVelocity(
        isCardId ? numericId : undefined,
        isCardId ? undefined : decoded,
        cardTitle,
      );

      res.json(velocity);
    } catch (error) {
      console.error("[Alpha] Interest velocity error:", error);
      res.status(500).json({ message: "Failed to fetch interest velocity" });
    }
  });

  app.get("/api/alpha/top-interest", async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const topCards = await storage.getTopCardsByInterest(limit);
      res.json({ cards: topCards });
    } catch (error) {
      console.error("[Alpha] Top interest error:", error);
      res.status(500).json({ message: "Failed to fetch top interest cards" });
    }
  });

  app.get("/api/alpha/observations/:identifier", async (req: any, res) => {
    try {
      const { identifier } = req.params;
      if (!identifier || identifier.trim().length === 0) {
        return res.status(400).json({ message: "Card identifier is required" });
      }

      const decoded = decodeURIComponent(identifier);
      const numericId = parseInt(decoded);
      const isCardId = !isNaN(numericId) && numericId > 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const cardTitle = req.query.cardTitle ? decodeURIComponent(req.query.cardTitle as string) : undefined;

      const observations = await storage.getPriceObservations(
        isCardId ? numericId : undefined,
        isCardId ? undefined : decoded,
        limit,
        cardTitle,
      );

      res.json({ observations });
    } catch (error) {
      console.error("[Alpha] Observations error:", error);
      res.status(500).json({ message: "Failed to fetch price observations" });
    }
  });

  app.get("/api/alpha/snapshot/:identifier", async (req: any, res) => {
    try {
      const { identifier } = req.params;
      if (!identifier || identifier.trim().length === 0) {
        return res.status(400).json({ message: "Card identifier is required" });
      }

      const decoded = decodeURIComponent(identifier);
      const numericId = parseInt(decoded);
      const isCardId = !isNaN(numericId) && numericId > 0;
      const cardTitle = req.query.cardTitle ? decodeURIComponent(req.query.cardTitle as string) : undefined;

      const snapshot = await storage.getMarketSnapshot(
        isCardId ? numericId : undefined,
        isCardId ? undefined : decoded,
        cardTitle,
      );

      res.json({ snapshot: snapshot ?? null });
    } catch (error) {
      console.error("[Alpha] Snapshot error:", error);
      res.status(500).json({ message: "Failed to fetch market snapshot" });
    }
  });

  app.get("/api/alpha/signals", async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const signalType = req.query.type as string | undefined;
      const signals = await storage.getActiveSignals(limit, signalType);
      res.json({ signals });
    } catch (error) {
      console.error("[Alpha] Signals error:", error);
      res.status(500).json({ message: "Failed to fetch signals" });
    }
  });

  app.get("/api/alpha/signals/:cardId", async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      if (isNaN(cardId)) {
        return res.status(400).json({ message: "Invalid card ID" });
      }
      const signal = await storage.getCardSignal(cardId);
      res.json({ signal: signal ?? null });
    } catch (error) {
      console.error("[Alpha] Card signal error:", error);
      res.status(500).json({ message: "Failed to fetch card signal" });
    }
  });

  app.post("/api/admin/alpha-batch-run", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { isBatchRunning, runAlphaBatchJob } = await import("./alphaEngine");
      if (isBatchRunning()) {
        return res.status(409).json({ message: "Batch job already in progress" });
      }

      res.json({ message: "Batch job started", status: "running" });

      runAlphaBatchJob().catch(err => {
        console.error("[Alpha Batch] Admin-triggered run failed:", err.message);
      });
    } catch (error) {
      console.error("[Alpha] Admin batch trigger error:", error);
      res.status(500).json({ message: "Failed to start batch job" });
    }
  });

  app.get("/api/admin/alpha-batch-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { getLastBatchRunStats, isBatchRunning } = await import("./alphaEngine");
      res.json({
        running: isBatchRunning(),
        lastRun: getLastBatchRunStats(),
      });
    } catch (error) {
      console.error("[Alpha] Batch status error:", error);
      res.status(500).json({ message: "Failed to fetch batch status" });
    }
  });

  app.get("/api/alpha/feed", async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      const allSignals = await storage.getActiveSignals(200);

      const buySignals = allSignals
        .filter(s => s.signalType === "strong_buy" || s.signalType === "buy")
        .sort((a, b) => b.alphaScore - a.alphaScore)
        .slice(0, limit);

      const sellSignals = allSignals
        .filter(s => s.signalType === "strong_sell" || s.signalType === "sell")
        .sort((a, b) => a.alphaScore - b.alphaScore)
        .slice(0, limit);

      const buyCardIds = buySignals.map(s => s.cardId).filter(Boolean) as number[];
      const sellCardIds = sellSignals.map(s => s.cardId).filter(Boolean) as number[];
      const trending = await storage.getTopCardsByInterest(limit);
      const trendingCardIds = trending.map(t => t.cardId).filter(Boolean) as number[];
      const allCardIds = [...new Set([...buyCardIds, ...sellCardIds, ...trendingCardIds])];

      const cardMap = new Map<number, any>();
      const toCardSummary = (card: any) => ({
        id: card.id,
        title: card.title,
        playerName: card.playerName,
        imagePath: card.imagePath,
        set: card.set,
        year: card.year,
        estimatedValue: card.estimatedValue,
        manualValue: card.manualValue,
        sport: card.sport,
        variation: card.variation,
      });

      const cardResults = await Promise.all(allCardIds.map(id => storage.getCard(id)));
      for (const card of cardResults) {
        if (card) cardMap.set(card.id, toCardSummary(card));
      }

      const trendingWithCards = trending
        .filter(t => t.cardId && cardMap.has(t.cardId))
        .map(t => ({ ...t, card: cardMap.get(t.cardId!) }));

      res.json({
        opportunities: buySignals.map(s => ({
          ...s,
          card: s.cardId ? cardMap.get(s.cardId) ?? null : null,
        })),
        risks: sellSignals.map(s => ({
          ...s,
          card: s.cardId ? cardMap.get(s.cardId) ?? null : null,
        })),
        trending: trendingWithCards,
      });
    } catch (error) {
      console.error("[Alpha] Feed error:", error);
      res.status(500).json({ message: "Failed to fetch alpha feed" });
    }
  });

  app.get("/api/alpha/portfolio-alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userCards = await storage.getAllUserCards(userId);

      if (userCards.length === 0) {
        return res.json({ alerts: [] });
      }

      const allSignals = await storage.getActiveSignals(200);
      const signalMap = new Map<number, any>();
      for (const s of allSignals) {
        if (s.cardId) signalMap.set(s.cardId, s);
      }

      const alerts = [];
      for (const card of userCards) {
        const signal = signalMap.get(card.id);
        if (signal) {
          alerts.push({
            signal,
            card: {
              id: card.id,
              title: card.title,
              playerName: card.playerName,
              imagePath: card.imagePath,
              set: card.set,
              year: card.year,
              estimatedValue: card.estimatedValue,
              manualValue: card.manualValue,
              sport: card.sport,
              variation: card.variation,
              displayCaseName: card.displayCaseName,
            },
            action: signal.signalType === "strong_sell" || signal.signalType === "sell"
              ? "Consider selling"
              : signal.signalType === "strong_buy" || signal.signalType === "buy"
              ? "Consider adding more"
              : "Monitor closely",
          });
        }
      }

      alerts.sort((a, b) => {
        const priority: Record<string, number> = { strong_sell: 0, sell: 1, strong_buy: 2, buy: 3, hold: 4 };
        return (priority[a.signal.signalType] ?? 5) - (priority[b.signal.signalType] ?? 5);
      });

      res.json({ alerts: alerts.slice(0, 20) });
    } catch (error) {
      console.error("[Alpha] Portfolio alerts error:", error);
      res.status(500).json({ message: "Failed to fetch portfolio alerts" });
    }
  });

  // Start the Alpha batch scheduler
  import("./alphaEngine").then(({ startBatchScheduler }) => {
    startBatchScheduler();
  }).catch(err => {
    console.error("[Alpha Batch] Failed to start scheduler:", err.message);
  });

}
