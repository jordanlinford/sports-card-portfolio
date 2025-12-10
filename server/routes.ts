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
import { prestigeService } from "./prestigeService";

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

async function initStripe(app: Express) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not found, skipping Stripe initialization');
    return;
  }

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
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // Auth middleware
  await setupAuth(app);

  // Initialize Stripe webhooks and sync
  await initStripe(app);

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
      
      // Use production domain for consistent URLs
      const baseUrl = process.env.REPLIT_DEPLOYMENT_DOMAIN 
        ? `https://${process.env.REPLIT_DEPLOYMENT_DOMAIN}`
        : `https://${req.headers.host}`;
      
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
      const fullTitle = `${title} | ${cardCount} Cards | MyDisplayCase`;
      
      // Alt text for image
      const imageAlt = `${displayCase.name} - Card collection on MyDisplayCase`;

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
  <meta property="og:site_name" content="MyDisplayCase">
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

      const format = (req.query.format as string) === "story" ? "story" : "social";
      
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

      const parsed = insertCardSchema.safeParse(req.body);
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

      const updatedCard = await storage.updateCard(cardId, req.body);
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
        success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/upgrade`,
        metadata: {
          userId: userId,
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.get("/api/billing/success", isAuthenticated, async (req: any, res) => {
    try {
      const sessionId = req.query.session_id as string;
      const userId = req.user.claims.sub;

      if (!sessionId) {
        return res.status(400).json({ success: false, message: "Session ID required" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (!session || session.payment_status !== "paid") {
        return res.status(400).json({ success: false, message: "Payment not completed" });
      }

      // Verify the session belongs to the current user
      const user = await storage.getUser(userId);
      if (!user || (session.customer_details?.email && user.email !== session.customer_details.email)) {
        return res.status(403).json({ success: false, message: "Session does not belong to user" });
      }

      // Update user subscription (webhooks will also handle this but we do it immediately for UX)
      await storage.updateUserSubscription(
        userId,
        "PRO",
        session.customer as string
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error verifying billing:", error);
      res.status(500).json({ success: false, message: "Failed to verify payment" });
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

}
