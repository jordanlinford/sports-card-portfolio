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
      const firstCard = displayCase.cards?.[0];
      const baseUrl = `https://${req.headers.host}`;
      const imageUrl = firstCard?.imagePath 
        ? `${baseUrl}${firstCard.imagePath}`
        : `${baseUrl}/favicon.png`;
      
      const description = displayCase.description || `A collection of ${cardCount} cards`;
      const title = `${displayCase.name} - MyDisplayCase`;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/case/${id}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:site_name" content="MyDisplayCase">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
</head>
<body>
  <h1>${displayCase.name}</h1>
  <p>${description}</p>
  <p>${cardCount} cards in this collection</p>
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

      res.json(displayCase);
    } catch (error) {
      console.error("Error fetching public display case:", error);
      res.status(500).json({ message: "Failed to fetch display case" });
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

  // Object Storage routes
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
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
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return res.status(404).json({ error: "Display case not found" });
      }

      const count = await storage.getLikeCount(id);
      const userId = req.user?.claims?.sub;
      const hasLiked = userId ? await storage.hasUserLiked(id, userId) : false;

      res.json({ count, hasLiked });
    } catch (error) {
      console.error("Error getting likes:", error);
      res.status(500).json({ error: "Failed to get likes" });
    }
  });

  app.post("/api/display-cases/:id/likes", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid display case ID" });
      }

      const displayCase = await storage.getDisplayCase(id);
      if (!displayCase || !displayCase.isPublic) {
        return res.status(404).json({ error: "Display case not found" });
      }

      const hasLiked = await storage.toggleLike(id, userId);
      const count = await storage.getLikeCount(id);

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

}
