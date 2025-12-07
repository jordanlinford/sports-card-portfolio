import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertDisplayCaseSchema, insertCardSchema } from "@shared/schema";
import Stripe from "stripe";

let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-04-30.basil",
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // Auth middleware
  await setupAuth(app);

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

  // Stripe routes
  app.post("/api/create-checkout-session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!stripe || !process.env.STRIPE_PRICE_ID) {
        return res.status(500).json({ message: "Stripe not configured. Please add STRIPE_SECRET_KEY and STRIPE_PRICE_ID." });
      }

      const baseUrl = process.env.BASE_URL || `https://${req.hostname}`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: user.email || undefined,
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

      if (!stripe) {
        return res.status(500).json({ success: false, message: "Stripe not configured" });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (!session || session.payment_status !== "paid") {
        return res.status(400).json({ success: false, message: "Payment not completed" });
      }

      // Verify the session belongs to the current user
      const user = await storage.getUser(userId);
      if (!user || (session.customer_details?.email && user.email !== session.customer_details.email)) {
        return res.status(403).json({ success: false, message: "Session does not belong to user" });
      }

      // Update user subscription
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
