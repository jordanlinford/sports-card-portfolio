import { sql, relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  real,
  serial,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// VARIATION TYPE ENUM - Required for accurate price lookups
// ============================================================================
export const VARIATION_TYPES = [
  "base",           // Base rookie/veteran card (no parallel, no insert)
  "base_insert",    // Insert set card (Rookie Wave, Rated Rookie, etc.)
  "parallel",       // Unnumbered parallel (Silver Prizm, Blue Refractor, etc.)
  "numbered",       // Numbered parallel (/199, /99, /50, etc.)
  "auto",           // Autograph card
  "memorabilia",    // Patch/relic/jersey card
  "auto_memorabilia", // Auto + patch combo
  "case_hit",       // Super short print, 1/1, case hit
] as const;

export type VariationType = typeof VARIATION_TYPES[number];

export const VARIATION_TYPE_LABELS: Record<VariationType, string> = {
  base: "Base Card",
  base_insert: "Base Insert (Rookie Wave, Rated Rookie, etc.)",
  parallel: "Parallel (Silver, Blue, Holo - unnumbered)",
  numbered: "Numbered Parallel (/199, /99, /50, etc.)",
  auto: "Autograph",
  memorabilia: "Memorabilia (Patch/Relic/Jersey)",
  auto_memorabilia: "Auto + Memorabilia",
  case_hit: "Case Hit / SSP / 1-of-1",
};

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  handle: varchar("handle", { length: 30 }).unique(),
  profileImageUrl: varchar("profile_image_url"),
  subscriptionStatus: varchar("subscription_status").default("FREE").notNull(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  googleId: varchar("google_id").unique(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  collectorScore: integer("collector_score").default(0).notNull(),
  collectorTier: varchar("collector_tier", { length: 50 }).default("bronze").notNull(),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  trialSource: varchar("trial_source", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  displayCases: many(displayCases),
}));

// Display Case table
export const displayCases = pgTable("display_cases", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isPublic: boolean("is_public").default(true).notNull(),
  theme: varchar("theme", { length: 50 }).default("classic").notNull(),
  layout: varchar("layout", { length: 50 }).default("grid").notNull(),
  showCardCount: boolean("show_card_count").default(false).notNull(),
  showTotalValue: boolean("show_total_value").default(false).notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const displayCasesRelations = relations(displayCases, ({ one, many }) => ({
  user: one(users, {
    fields: [displayCases.userId],
    references: [users.id],
  }),
  cards: many(cards),
}));

// Card table
export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  displayCaseId: integer("display_case_id").notNull().references(() => displayCases.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  imagePath: varchar("image_path"),
  set: varchar("set", { length: 255 }),
  year: integer("year"),
  cardNumber: varchar("card_number", { length: 50 }),
  variation: varchar("variation", { length: 255 }),
  variationType: varchar("variation_type", { length: 50 }), // Required for accurate pricing: base, base_insert, parallel, numbered, auto, etc.
  grade: varchar("grade", { length: 50 }),
  purchasePrice: real("purchase_price"),
  estimatedValue: real("estimated_value"),
  manualValue: real("manual_value"), // User-set value that always takes precedence over eBay estimates
  previousValue: real("previous_value"),
  valueUpdatedAt: timestamp("value_updated_at"),
  notes: text("notes"),
  tags: text("tags").array(),
  sortOrder: integer("sort_order").default(0).notNull(),
  openToOffers: boolean("open_to_offers").default(false).notNull(),
  minOfferAmount: real("min_offer_amount"),
  createdAt: timestamp("created_at").defaultNow(),
  // Card category (sports/tcg/non_sport)
  cardCategory: varchar("card_category", { length: 20 }).default("sports"),
  
  // Card Outlook AI fields - Sports
  sport: varchar("sport", { length: 50 }),
  position: varchar("position", { length: 50 }),
  playerName: varchar("player_name", { length: 255 }),
  isRookie: boolean("is_rookie").default(false),
  isNumbered: boolean("is_numbered").default(false),
  serialNumber: integer("serial_number"),
  hasAuto: boolean("has_auto").default(false),
  insertTier: varchar("insert_tier", { length: 50 }),
  grader: varchar("grader", { length: 50 }),
  legacyTier: varchar("legacy_tier", { length: 50 }),
  playerAge: integer("player_age"),
  injuryRisk: varchar("injury_risk", { length: 20 }),
  teamMarketSize: varchar("team_market_size", { length: 20 }),
  salesLast30Days: integer("sales_last_30_days"),
  avgSalePrice30: real("avg_sale_price_30"),
  avgSalePrice90: real("avg_sale_price_90"),
  priceStdDevPct: real("price_std_dev_pct"),
  
  // Card Outlook AI fields - TCG/Non-Sport
  characterTier: varchar("character_tier", { length: 50 }),
  rarityTier: varchar("rarity_tier", { length: 50 }),
  eraPrestige: varchar("era_prestige", { length: 50 }),
  franchiseHeat: varchar("franchise_heat", { length: 20 }),
  // Cached outlook data
  outlookAction: varchar("outlook_action", { length: 10 }),
  outlookUpsideScore: integer("outlook_upside_score"),
  outlookRiskScore: integer("outlook_risk_score"),
  outlookConfidenceScore: integer("outlook_confidence_score"),
  outlookExplanationShort: text("outlook_explanation_short"),
  outlookExplanationLong: text("outlook_explanation_long"),
  outlookGeneratedAt: timestamp("outlook_generated_at"),
  outlookBigMover: boolean("outlook_big_mover").default(false),
  outlookBigMoverReason: text("outlook_big_mover_reason"),
});

export const cardsRelations = relations(cards, ({ one }) => ({
  displayCase: one(displayCases, {
    fields: [cards.displayCaseId],
    references: [displayCases.id],
  }),
}));

// Comments table
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  displayCaseId: integer("display_case_id").notNull().references(() => displayCases.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id),
  guestName: varchar("guest_name", { length: 100 }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const commentsRelations = relations(comments, ({ one }) => ({
  displayCase: one(displayCases, {
    fields: [comments.displayCaseId],
    references: [displayCases.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
}));

// Likes table
export const likes = pgTable("likes", {
  id: serial("id").primaryKey(),
  displayCaseId: integer("display_case_id").notNull().references(() => displayCases.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const likesRelations = relations(likes, ({ one }) => ({
  displayCase: one(displayCases, {
    fields: [likes.displayCaseId],
    references: [displayCases.id],
  }),
  user: one(users, {
    fields: [likes.userId],
    references: [users.id],
  }),
}));

// Bookmarks table - for users to save cards they're interested in
export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  cardId: integer("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  card: one(cards, {
    fields: [bookmarks.cardId],
    references: [cards.id],
  }),
}));

// Offers table - for users to make offers on cards
export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  toUserId: varchar("to_user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  message: text("message"),
  isAnonymous: boolean("is_anonymous").default(false).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const offersRelations = relations(offers, ({ one }) => ({
  card: one(cards, {
    fields: [offers.cardId],
    references: [cards.id],
  }),
  fromUser: one(users, {
    fields: [offers.fromUserId],
    references: [users.id],
  }),
  toUser: one(users, {
    fields: [offers.toUserId],
    references: [users.id],
  }),
}));

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  data: jsonb("data"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// SUPPORT TICKETS - User questions and problems
// ============================================================================
export const SUPPORT_TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS", 
  "WAITING_ON_USER",
  "RESOLVED",
  "CLOSED",
] as const;

export type SupportTicketStatus = typeof SUPPORT_TICKET_STATUSES[number];

export const SUPPORT_TICKET_PRIORITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
] as const;

export type SupportTicketPriority = typeof SUPPORT_TICKET_PRIORITIES[number];

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  assignedAdminId: varchar("assigned_admin_id").references(() => users.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 30 }).default("OPEN").notNull(),
  priority: varchar("priority", { length: 20 }).default("NORMAL").notNull(),
  adminReplyCount: integer("admin_reply_count").default(0).notNull(),
  lastReplyAt: timestamp("last_reply_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supportTicketMessages = pgTable("support_ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  isAdminReply: boolean("is_admin_reply").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  requester: one(users, {
    fields: [supportTickets.requesterId],
    references: [users.id],
    relationName: "ticketRequester",
  }),
  assignedAdmin: one(users, {
    fields: [supportTickets.assignedAdminId],
    references: [users.id],
    relationName: "ticketAdmin",
  }),
  messages: many(supportTicketMessages),
}));

export const supportTicketMessagesRelations = relations(supportTicketMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [supportTicketMessages.ticketId],
    references: [supportTickets.id],
  }),
  sender: one(users, {
    fields: [supportTicketMessages.senderId],
    references: [users.id],
  }),
}));

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  status: true,
  priority: true,
  adminReplyCount: true,
  lastReplyAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

export const insertSupportTicketMessageSchema = createInsertSchema(supportTicketMessages).omit({
  id: true,
  isAdminReply: true,
  createdAt: true,
});
export type InsertSupportTicketMessage = z.infer<typeof insertSupportTicketMessageSchema>;
export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;

export type SupportTicketWithRequester = SupportTicket & {
  requester: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'email' | 'profileImageUrl'>;
};

export type SupportTicketWithMessages = SupportTicket & {
  requester: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'email' | 'profileImageUrl'>;
  messages: (SupportTicketMessage & { 
    sender: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'>;
  })[];
};

// Badges table - definitions of available badges
export const badges = pgTable("badges", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  requirement: text("requirement").notNull(),
  pointValue: integer("point_value").default(10).notNull(),
  rarity: varchar("rarity", { length: 20 }).default("common").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Badges table - tracks which badges users have earned
export const userBadges = pgTable("user_badges", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  badgeId: varchar("badge_id", { length: 50 }).notNull().references(() => badges.id),
  earnedAt: timestamp("earned_at").defaultNow(),
  progress: integer("progress").default(0),
  isNotified: boolean("is_notified").default(false).notNull(),
}, (table) => [
  unique("unique_user_badge").on(table.userId, table.badgeId),
]);

export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, {
    fields: [userBadges.userId],
    references: [users.id],
  }),
  badge: one(badges, {
    fields: [userBadges.badgeId],
    references: [badges.id],
  }),
}));

// Trade Offers table - for card-to-card trades
export const tradeOffers = pgTable("trade_offers", {
  id: serial("id").primaryKey(),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  toUserId: varchar("to_user_id").notNull().references(() => users.id),
  offeredCardIds: integer("offered_card_ids").array().notNull(),
  requestedCardIds: integer("requested_card_ids").array().notNull(),
  cashAdjustment: real("cash_adjustment").default(0).notNull(),
  message: text("message"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tradeOffersRelations = relations(tradeOffers, ({ one }) => ({
  fromUser: one(users, {
    fields: [tradeOffers.fromUserId],
    references: [users.id],
  }),
  toUser: one(users, {
    fields: [tradeOffers.toUserId],
    references: [users.id],
  }),
}));

// Follows table - for users to follow other users
export const follows = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: varchar("follower_id").notNull().references(() => users.id),
  followedId: varchar("followed_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_follow").on(table.followerId, table.followedId),
]);

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
  }),
  followed: one(users, {
    fields: [follows.followedId],
    references: [users.id],
  }),
}));

// Conversations table - for direct messaging between users
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  participantAId: varchar("participant_a_id").notNull().references(() => users.id),
  participantBId: varchar("participant_b_id").notNull().references(() => users.id),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  lastMessagePreview: text("last_message_preview"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_conversation_participants").on(table.participantAId, table.participantBId),
]);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  participantA: one(users, {
    fields: [conversations.participantAId],
    references: [users.id],
  }),
  participantB: one(users, {
    fields: [conversations.participantBId],
    references: [users.id],
  }),
  messages: many(messages),
}));

// Messages table - individual messages within a conversation
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

// Outlook usage tracking - unified tracking for all Market Outlook analyses
export const outlookUsage = pgTable("outlook_usage", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  cardId: integer("card_id").references(() => cards.id, { onDelete: "set null" }),
  source: varchar("source", { length: 20 }).notNull(), // 'collection' or 'quick'
  cardTitle: text("card_title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const outlookUsageRelations = relations(outlookUsage, ({ one }) => ({
  user: one(users, {
    fields: [outlookUsage.userId],
    references: [users.id],
  }),
  card: one(cards, {
    fields: [outlookUsage.cardId],
    references: [cards.id],
  }),
}));

// Schemas and Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export function hasProAccess(user: User | undefined | null): boolean {
  if (!user) return false;
  if (user.subscriptionStatus === "PRO") return true;
  if (user.trialEnd && new Date(user.trialEnd) > new Date()) return true;
  return false;
}

export const insertDisplayCaseSchema = createInsertSchema(displayCases).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDisplayCase = z.infer<typeof insertDisplayCaseSchema>;
export type DisplayCase = typeof displayCases.$inferSelect;

export const insertCardSchema = createInsertSchema(cards).omit({
  id: true,
  displayCaseId: true,
  createdAt: true,
  sortOrder: true,
  outlookAction: true,
  outlookUpsideScore: true,
  outlookRiskScore: true,
  outlookConfidenceScore: true,
  outlookExplanationShort: true,
  outlookExplanationLong: true,
  outlookGeneratedAt: true,
});
export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cards.$inferSelect;

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  userId: true,
  createdAt: true,
});
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

export type Like = typeof likes.$inferSelect;

export type Bookmark = typeof bookmarks.$inferSelect;

export const insertOfferSchema = createInsertSchema(offers).omit({
  id: true,
  fromUserId: true,
  toUserId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offers.$inferSelect;

export type Notification = typeof notifications.$inferSelect;

export const insertTradeOfferSchema = createInsertSchema(tradeOffers).omit({
  id: true,
  fromUserId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTradeOffer = z.infer<typeof insertTradeOfferSchema>;
export type TradeOffer = typeof tradeOffers.$inferSelect;

export type Follow = typeof follows.$inferSelect;

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  senderId: true,
  isRead: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Badge = typeof badges.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type UserBadgeWithBadge = UserBadge & { badge: Badge };

// Extended types with relations
export type DisplayCaseWithCards = DisplayCase & { cards: Card[] };
export type DisplayCaseWithUser = DisplayCase & { user: User };
export type CommentWithUser = Comment & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> | null };
export type BookmarkWithCard = Bookmark & { card: Card };
export type OfferWithUsers = Offer & { fromUser: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'>; card: Card };
export type TradeOfferWithDetails = TradeOffer & { 
  fromUser: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'>; 
  toUser: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'>; 
  offeredCards: Card[];
  requestedCards: Card[];
};

export type ConversationWithDetails = Conversation & {
  otherUser: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'>;
  unreadCount: number;
};

export type MessageWithSender = Message & {
  sender: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'>;
};

// Promo codes table
export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  maxUses: integer("max_uses").notNull(),
  usedCount: integer("used_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Track who has used promo codes
export const promoCodeRedemptions = pgTable("promo_code_redemptions", {
  id: serial("id").primaryKey(),
  promoCodeId: integer("promo_code_id").notNull().references(() => promoCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
}, (table) => [
  unique("promo_code_user_unique").on(table.promoCodeId, table.userId),
]);

export type PromoCode = typeof promoCodes.$inferSelect;
export type PromoCodeRedemption = typeof promoCodeRedemptions.$inferSelect;

// Prestige tiers for collectors
export const COLLECTOR_TIERS = {
  bronze: { name: "Bronze", minScore: 0, color: "#CD7F32" },
  silver: { name: "Silver", minScore: 100, color: "#C0C0C0" },
  gold: { name: "Gold", minScore: 500, color: "#FFD700" },
  platinum: { name: "Platinum", minScore: 1500, color: "#E5E4E2" },
  diamond: { name: "Diamond", minScore: 5000, color: "#B9F2FF" },
} as const;

export type CollectorTier = keyof typeof COLLECTOR_TIERS;

// Price Alerts table - per-card alert thresholds
export const priceAlerts = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  alertType: varchar("alert_type", { length: 20 }).notNull(), // 'above' or 'below'
  threshold: real("threshold").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_card_user_alert").on(table.cardId, table.userId, table.alertType),
]);

export const priceAlertsRelations = relations(priceAlerts, ({ one }) => ({
  card: one(cards, {
    fields: [priceAlerts.cardId],
    references: [cards.id],
  }),
  user: one(users, {
    fields: [priceAlerts.userId],
    references: [users.id],
  }),
}));

// Price History table - daily price snapshots for trend tracking
export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  price: real("price").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_price_history_card_date").on(table.cardId, table.recordedAt),
]);

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  card: one(cards, {
    fields: [priceHistory.cardId],
    references: [cards.id],
  }),
}));

// Card Outlooks table - comprehensive market intelligence for each card
// This is the "source of truth" for all card outlook data
export const cardOutlooks = pgTable("card_outlooks", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }).unique(),
  
  // Market Value (stored in cents for precision)
  marketValue: integer("market_value"),
  priceMin: integer("price_min"),
  priceMax: integer("price_max"),
  compCount: integer("comp_count"),
  pricePoints: jsonb("price_points").$type<Array<{
    date: string;
    price: number;
    source: string;
    url?: string;
  }>>().default([]),
  
  // Computed Signal Scores (1-10 scale)
  trendScore: integer("trend_score"),
  liquidityScore: integer("liquidity_score"),
  volatilityScore: integer("volatility_score"),
  sportScore: integer("sport_score"),
  positionScore: integer("position_score"),
  cardTypeScore: integer("card_type_score"),
  
  // Composite Scores (0-100 scale)
  demandScore: integer("demand_score"),
  momentumScore: integer("momentum_score"),
  qualityScore: integer("quality_score"),
  upsideScore: integer("upside_score"),
  downsideRisk: integer("downside_risk"),
  marketFriction: integer("market_friction"),
  
  // Action & Confidence (deterministic, not AI-decided)
  action: varchar("action", { length: 20 }), // BUY | MONITOR | SELL | LONG_HOLD | LITTLE_VALUE
  actionReasons: jsonb("action_reasons").$type<string[]>().default([]),
  dataConfidence: varchar("data_confidence", { length: 10 }), // HIGH | MEDIUM | LOW
  confidenceReason: text("confidence_reason"),
  
  // AI-generated explanations (explains the computed action)
  explanationShort: text("explanation_short"),
  explanationLong: text("explanation_long"),
  explanationBullets: jsonb("explanation_bullets").$type<string[]>().default([]),
  
  // Big Mover flag - asymmetric upside potential
  bigMoverFlag: boolean("big_mover_flag").default(false),
  bigMoverReason: text("big_mover_reason"),
  
  // Career stage detection
  careerStageAuto: varchar("career_stage_auto", { length: 20 }), // ROOKIE | RISING | ELITE | VETERAN | RETIRED | LEGEND | UNKNOWN
  careerStageOverride: varchar("career_stage_override", { length: 20 }),
  
  // Time horizon for outlook (months)
  timeHorizon: integer("time_horizon").default(12),
  
  // Cache management
  updatedAt: timestamp("updated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_card_outlooks_card_id").on(table.cardId),
  index("idx_card_outlooks_action").on(table.action),
]);

export const cardOutlooksRelations = relations(cardOutlooks, ({ one }) => ({
  card: one(cards, {
    fields: [cardOutlooks.cardId],
    references: [cards.id],
  }),
}));

// User Alert Settings table - global user preferences for alerts
export const userAlertSettings = pgTable("user_alert_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  emailAlertsEnabled: boolean("email_alerts_enabled").default(true).notNull(),
  inAppAlertsEnabled: boolean("in_app_alerts_enabled").default(true).notNull(),
  weeklyDigestEnabled: boolean("weekly_digest_enabled").default(true).notNull(),
  lastDigestSentAt: timestamp("last_digest_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userAlertSettingsRelations = relations(userAlertSettings, ({ one }) => ({
  user: one(users, {
    fields: [userAlertSettings.userId],
    references: [users.id],
  }),
}));

// Types and schemas for price alerts
export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
  id: true,
  userId: true,
  lastTriggeredAt: true,
  createdAt: true,
});
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceAlert = typeof priceAlerts.$inferSelect;
export type PriceAlertWithCard = PriceAlert & { card: Card };

export type PriceHistory = typeof priceHistory.$inferSelect;

export const insertUserAlertSettingsSchema = createInsertSchema(userAlertSettings).omit({
  id: true,
  userId: true,
  lastDigestSentAt: true,
  createdAt: true,
});
export type InsertUserAlertSettings = z.infer<typeof insertUserAlertSettingsSchema>;
export type UserAlertSettings = typeof userAlertSettings.$inferSelect;

// Types and schemas for card outlooks
export const insertCardOutlookSchema = createInsertSchema(cardOutlooks).omit({
  id: true,
  updatedAt: true,
});
export type InsertCardOutlook = z.infer<typeof insertCardOutlookSchema>;
export type CardOutlook = typeof cardOutlooks.$inferSelect;
export type CardOutlookWithCard = CardOutlook & { card: Card };

// Price point type for outlook data
export type PricePoint = {
  date: string;
  price: number;
  source: string;
  url?: string;
};

// Career stage enum for type safety
export const CAREER_STAGES = {
  ROOKIE: "ROOKIE",
  RISING: "RISING",
  ELITE: "ELITE",
  VETERAN: "VETERAN",
  RETIRED: "RETIRED",
  LEGEND: "LEGEND",
  UNKNOWN: "UNKNOWN",
} as const;

export type CareerStage = keyof typeof CAREER_STAGES;

// Outlook action enum for type safety
export const OUTLOOK_ACTIONS = {
  BUY: "BUY",
  MONITOR: "MONITOR",
  SELL: "SELL",
  LONG_HOLD: "LONG_HOLD",
  LEGACY_HOLD: "LEGACY_HOLD",
  LITTLE_VALUE: "LITTLE_VALUE",
} as const;

export type OutlookAction = keyof typeof OUTLOOK_ACTIONS;

// Data confidence enum
export const DATA_CONFIDENCE = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type DataConfidence = keyof typeof DATA_CONFIDENCE;

// Card Match Confidence - validates pricing data matches the correct card
export const MATCH_CONFIDENCE_TIERS = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type MatchConfidenceTier = keyof typeof MATCH_CONFIDENCE_TIERS;

// Individual matched attributes for a pricing sample
export type MatchedAttributes = {
  player: boolean;
  year: boolean;
  set: boolean;
  variation: boolean;
  grade: boolean;
  rookie: boolean;
};

// A sampled listing with match score and matched attributes
export type MatchSample = {
  title: string;
  snippet?: string;
  source: string;
  url?: string;
  price?: number;
  matchScore: number; // 0-1
  matched: MatchedAttributes;
};

// Card Match Confidence result
export type CardMatchConfidence = {
  tier: MatchConfidenceTier;
  score: number; // 0-1 aggregate score
  reason: string;
  matchedComps: number; // Number of comps with High match
  totalComps: number;
  samples: MatchSample[]; // Up to 5 sampled listings for review
};

// eBay Market Comps Cache - stores scraped sold listings with aggregations
export const marketCompsCache = pgTable("market_comps_cache", {
  id: serial("id").primaryKey(),
  queryHash: varchar("query_hash", { length: 64 }).notNull().unique(),
  canonicalQuery: text("canonical_query").notNull(),
  
  // Parsed filters from the query
  filters: jsonb("filters").$type<{
    player?: string;
    year?: number;
    set?: string;
    parallel?: string;
    grade?: string;
    grader?: string;
    cardNumber?: string;
  }>().default({}),
  
  // Raw comps data
  soldCount: integer("sold_count").default(0).notNull(),
  compsJson: jsonb("comps_json").$type<Array<{
    title: string;
    soldPrice: number;
    shippingPrice?: number;
    totalPrice: number;
    soldDate?: string;
    itemUrl?: string;
    imageUrl?: string;
    condition?: string;
    isBestOffer?: boolean;
    matchScore: number;
  }>>().default([]),
  
  // Aggregated summary
  summaryJson: jsonb("summary_json").$type<{
    soldCount: number;
    medianPrice: number;
    meanPrice: number;
    minPrice: number;
    maxPrice: number;
    volatility: number;
    liquidity: number;
    trendSeries: Array<{ week: string; medianPrice: number; count: number }>;
    trendSlope: number;
    cappedAtMax?: boolean;
    dateCoverageDays?: number;
    oldestSaleDate?: string;
    newestSaleDate?: string;
  }>(),
  
  // Confidence based on sold count + match quality
  confidence: varchar("confidence", { length: 10 }).default("LOW").notNull(), // HIGH | MED | LOW
  avgMatchScore: real("avg_match_score").default(0),
  
  // Fetch status
  fetchStatus: varchar("fetch_status", { length: 20 }).default("pending").notNull(), // pending | fetching | complete | failed | blocked
  fetchError: text("fetch_error"),
  failureCount: integer("failure_count").default(0).notNull(), // Track consecutive failures
  pagesScraped: integer("pages_scraped").default(0),
  itemsFound: integer("items_found").default(0),
  itemsKept: integer("items_kept").default(0),
  
  // Quality metrics
  priceIqr: real("price_iqr"), // Interquartile range for price dispersion
  queryBroadened: boolean("query_broadened").default(false), // Whether query was broadened to get results
  ladderStepsUsed: integer("ladder_steps_used").default(1), // How many broadening steps were used
  
  // Cache management
  lastFetchedAt: timestamp("last_fetched_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_market_comps_query_hash").on(table.queryHash),
  index("idx_market_comps_expires_at").on(table.expiresAt),
  index("idx_market_comps_fetch_status").on(table.fetchStatus),
]);

// Comps confidence enum
export const COMPS_CONFIDENCE = {
  HIGH: "HIGH",
  MED: "MED",
  LOW: "LOW",
} as const;

export type CompsConfidence = keyof typeof COMPS_CONFIDENCE;

// Fetch status enum
export const FETCH_STATUS = {
  PENDING: "pending",
  FETCHING: "fetching",
  COMPLETE: "complete",
  FAILED: "failed",
  BLOCKED: "blocked",
} as const;

export type FetchStatus = typeof FETCH_STATUS[keyof typeof FETCH_STATUS];

// Types for market comps
export type MarketCompsCache = typeof marketCompsCache.$inferSelect;
export type InsertMarketCompsCache = typeof marketCompsCache.$inferInsert;

// Individual comp type
export type EbayComp = {
  title: string;
  soldPrice: number;
  shippingPrice?: number;
  totalPrice: number;
  soldDate?: string;
  itemUrl?: string;
  imageUrl?: string;
  condition?: string;
  isBestOffer?: boolean;
  matchScore: number;
};

// Liquidity tier - inferred market liquidity
export const LIQUIDITY_TIER = {
  VERY_HIGH: "VERY_HIGH", // Hit data cap on a tight query - extremely liquid
  HIGH: "HIGH",           // Hit data cap or 30+ comps
  MEDIUM: "MEDIUM",       // 10-29 comps with good coverage
  LOW: "LOW",             // Few sales found with good coverage
  UNCERTAIN: "UNCERTAIN", // Can't determine due to scrape issues or weak coverage
} as const;
export type LiquidityTier = keyof typeof LIQUIDITY_TIER;

// Liquidity assessment - complete picture of market liquidity
export type LiquidityAssessment = {
  tier: LiquidityTier;
  confidence: "HIGH" | "MED" | "LOW";
  explanation: string;
  matchQuality: "EXACT" | "CLOSE" | "BROAD"; // How specific was the query
  dateCoverageDays: number; // How many days of sales data we have
};

// Summary aggregations type
export type CompsSummary = {
  soldCount: number;
  medianPrice: number;
  meanPrice: number;
  minPrice: number;
  maxPrice: number;
  volatility: number;
  liquidity: number;
  trendSeries: Array<{ week: string; medianPrice: number; count: number }>;
  trendSlope: number;
  cappedAtMax?: boolean; // True if we hit scraping limits - actual market volume may be higher
  dateCoverageDays?: number; // How many days of actual sales data
  oldestSaleDate?: string; // Date of oldest sale in sample
  newestSaleDate?: string; // Date of newest sale in sample
};

// Query filters type
export type CompsQueryFilters = {
  player?: string;
  year?: number;
  set?: string;
  parallel?: string;
  grade?: string;
  grader?: string;
  cardNumber?: string;
  condition?: "RAW" | "GRADED"; // Whether user wants raw/ungraded or graded comps
};

// ==================== PLAYER OUTLOOK V2 TYPES ====================
// Player = Stock, Cards = Exposure Vehicles

// Market Temperature - How hot is this player in the market right now?
export const MARKET_TEMPERATURE = {
  HOT: "HOT",         // High demand, rising prices, lots of activity
  WARM: "WARM",       // Moderate demand, stable or slight gains
  NEUTRAL: "NEUTRAL", // Baseline activity, no strong signals
  COOLING: "COOLING", // Declining interest, falling prices
} as const;
export type MarketTemperature = keyof typeof MARKET_TEMPERATURE;

// Volatility - How much do prices swing?
export const VOLATILITY_LEVEL = {
  LOW: "LOW",       // Stable, predictable pricing
  MEDIUM: "MEDIUM", // Normal fluctuation
  HIGH: "HIGH",     // Wild swings, speculative
} as const;
export type VolatilityLevel = keyof typeof VOLATILITY_LEVEL;

// Risk Level - Overall investment risk
export const RISK_LEVEL = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;
export type RiskLevel = keyof typeof RISK_LEVEL;

// Investment Horizon - Time frame for the thesis
export const INVESTMENT_HORIZON = {
  SHORT: "SHORT",   // 1-3 months
  MID: "MID",       // 3-12 months
  LONG: "LONG",     // 1+ years
} as const;
export type InvestmentHorizon = keyof typeof INVESTMENT_HORIZON;

// Player Career Stage (extended from existing)
export const PLAYER_STAGE = {
  PROSPECT: "PROSPECT",     // Pre-rookie, draft eligible
  ROOKIE: "ROOKIE",         // First year
  YEAR_2: "YEAR_2",         // Sophomore, often breakout year
  YEAR_3: "YEAR_3",         // Third year, still developing
  YEAR_4: "YEAR_4",         // Fourth year, still developing
  PRIME: "PRIME",           // Peak performance years
  VETERAN: "VETERAN",       // Later career, established
  AGING: "AGING",           // Declining performance
  BUST: "BUST",             // Career stalled/failed (young player who didn't pan out)
  RETIRED: "RETIRED",       // No longer playing
  RETIRED_HOF: "RETIRED_HOF", // Hall of Fame bound
  UNKNOWN: "UNKNOWN",       // Cannot determine stage - treat as speculative
} as const;
export type PlayerStage = keyof typeof PLAYER_STAGE;

// Investment Verdict - The main action recommendation (expanded with role-risk nuance)
export const INVESTMENT_VERDICT = {
  ACCUMULATE: "ACCUMULATE",           // Buy on dips, build position
  HOLD_CORE: "HOLD_CORE",             // Hold what you have, don't chase
  TRADE_THE_HYPE: "TRADE_THE_HYPE",   // Sell into spikes, take profits
  AVOID_NEW_MONEY: "AVOID_NEW_MONEY", // Stay away, don't add new money
  SPECULATIVE_FLYER: "SPECULATIVE_FLYER", // Small lottery ticket position
  // Nuanced role-risk verdicts (backup/fringe players)
  HOLD_ROLE_RISK: "HOLD_ROLE_RISK",   // Backup with role uncertainty, hold but monitor
  HOLD_INJURY_CONTINGENT: "HOLD_INJURY_CONTINGENT", // Value depends on injury opportunity
  SPECULATIVE_SUPPRESSED: "SPECULATIVE_SUPPRESSED", // Talent there, situation bad - buy low
  AVOID_STRUCTURAL: "AVOID_STRUCTURAL", // True structural decline, no path back
} as const;
export type InvestmentVerdict = keyof typeof INVESTMENT_VERDICT;

// Legacy verdict type for backward compatibility (deprecated - use InvestmentVerdict)
export const PLAYER_VERDICT = {
  BUY: "BUY",
  MONITOR: "MONITOR",
  AVOID: "AVOID",
} as const;
export type PlayerVerdict = keyof typeof PLAYER_VERDICT;

// Posture labels for each verdict (collector-friendly)
export const VERDICT_POSTURE: Record<InvestmentVerdict, string> = {
  ACCUMULATE: "Buy on dips",
  HOLD_CORE: "Hold, don't chase",
  TRADE_THE_HYPE: "Sell into spikes",
  AVOID_NEW_MONEY: "Stay away",
  SPECULATIVE_FLYER: "Small lottery bet",
  HOLD_ROLE_RISK: "Hold, monitor role",
  HOLD_INJURY_CONTINGENT: "Hold for injury upside",
  SPECULATIVE_SUPPRESSED: "Buy suppressed value",
  AVOID_STRUCTURAL: "Avoid, structural decline",
} as const;

// Verdict Modifier - Adds nuance to the verdict (legacy, kept for compatibility)
export const VERDICT_MODIFIER = {
  SPECULATIVE: "Speculative",
  MOMENTUM: "Momentum",
  VALUE: "Value",
  LONG_TERM: "Long-Term",
  LATE_CYCLE: "Late Cycle",
} as const;
export type VerdictModifier = typeof VERDICT_MODIFIER[keyof typeof VERDICT_MODIFIER];

// Investment Call Scoring Inputs (0-100 scale)
export type InvestmentScores = {
  trendScore: number;           // Direction + momentum (higher = uptrend)
  liquidityScore: number;       // How easy to exit (higher = more liquid)
  volatilityScore: number;      // Price instability (higher = more volatile)
  narrativeHeatScore: number;   // Hype/news attention (higher = more buzz)
  injuryRoleRiskScore: number;  // Role stability + injury risk (higher = more risky)
  valuationScore: number;       // Cheap vs expensive vs comps (higher = cheaper)
  // Derived signals
  mispricingScore: number;      // valuationScore - narrativeHeatScore (+ = undervalued vs hype)
  downsideRiskScore: number;    // (injuryRoleRiskScore * 0.6) + (volatilityScore * 0.4)
};

// Investment Call Action Plan
export type InvestmentActionPlan = {
  whatToDoNow: string;    // One sentence action
  entryPlan: string;      // Timing/price behavior guidance
  positionSizing: string; // Position size guidance
};

// Action Guidance - Contextual next-step guidance based on verdict
export type ActionGuidance = {
  header: string;           // e.g., "What would make this a buy?"
  bullets: string[];        // 2-3 actionable conditions or guidance points
};

// Full Investment Call - The decisive recommendation
export type InvestmentCall = {
  verdict: InvestmentVerdict;
  postureLabel: string;           // e.g., "Buy on dips"
  confidence: DataConfidence;     // LOW, MEDIUM, HIGH
  timeHorizon: InvestmentHorizon; // SHORT, MID, LONG
  oneLineRationale: string;       // 18-24 words, collector language
  whyBullets: string[];           // Max 3, each under 14 words
  actionPlan: InvestmentActionPlan;
  actionGuidance?: ActionGuidance; // Contextual next-step guidance
  confidenceNote?: string;        // Transparency note when confidence is limited
  whatToBuy?: string[];           // Card types to accumulate (max 4)
  whatToSell?: string[];          // Card types to sell (max 4)
  whatToAvoid?: string[];         // Card types to avoid (max 4)
  thesisBreakers: string[];       // Max 3 - what invalidates this call
  triggersToUpgrade?: string[];   // What would flip to stronger buy (max 3)
  triggersToDowngrade?: string[]; // What would flip to avoid/sell (max 3)
  scores?: InvestmentScores;      // Optional: expose scoring for transparency
  // === NEW ADVISOR VOICE FIELDS ===
  advisorTake?: string;           // 3-4 sentences: the call, pattern-level why, what changes it. No hedging.
  packHitReaction?: string;       // One line: how to feel/act if you pull this player in a pack
  // === COLLECTOR TIP ===
  collectorTip?: string;          // Timing tip for fans/collectors based on price momentum (independent of investment verdict)
};

// Stock Tier - Card exposure type
export const STOCK_TIER = {
  PREMIUM: "PREMIUM",         // Blue chip: autos, low serial, case hits
  GROWTH: "GROWTH",           // Flagship silvers, quality parallels
  CORE: "CORE",               // Standard rookies in good brands
  COMMON: "COMMON",           // Base cards, volume plays
  SPECULATIVE: "SPECULATIVE", // Niche sets, weird parallels, lottery tickets
} as const;
export type StockTier = keyof typeof STOCK_TIER;

// Liquidity Level - How easy to buy/sell
export const LIQUIDITY_LEVEL = {
  HIGH: "HIGH",     // Lots of buyers and sellers
  MEDIUM: "MEDIUM", // Moderate activity
  LOW: "LOW",       // Hard to find buyers
} as const;
export type LiquidityLevel = keyof typeof LIQUIDITY_LEVEL;

// Buyer Profile - Who is this card type for?
export const BUYER_PROFILE = {
  FLIPPER: "FLIPPER",       // Quick turnaround, price arbitrage
  COLLECTOR: "COLLECTOR",   // Long-term hold, personal collection
  INVESTOR: "INVESTOR",     // Growth-focused, portfolio mindset
  BUDGET: "BUDGET",         // Value-conscious, entry-level
} as const;
export type BuyerProfile = keyof typeof BUYER_PROFILE;

// Player Snapshot - Quick market read
export type PlayerSnapshot = {
  temperature: MarketTemperature;
  volatility: VolatilityLevel;
  risk: RiskLevel;
  horizon: InvestmentHorizon;
  confidence: DataConfidence; // Confidence in the thesis, not comps
};

// Player basic info
export type PlayerInfo = {
  name: string;
  sport: string;
  position?: string;
  team?: string;
  stage: PlayerStage;
  rookieYear?: number;
  inferred?: boolean; // True if position/team were AI-inferred
  inferredFields?: string[]; // Which fields were inferred: "position", "team", "rookieYear"
};

// Investment Verdict with explanation
export type PlayerVerdictResult = {
  action: PlayerVerdict;
  modifier: VerdictModifier; // Speculative, Momentum, Value, Long-Term, Late Cycle
  summary: string; // 2-4 sentence explanation
  whatMustBeTrue?: string[]; // Simple checklist for the thesis to work
};

// Card Exposure Recommendation
export type ExposureRecommendation = {
  tier: StockTier;
  cardTargets: string[]; // e.g., ["Optic Rated Rookie Holo", "Prizm Silver RC"]
  why: string;
  liquidity: LiquidityLevel;
  riskNote: string;
  buyerProfile: BuyerProfile;
  timingGuidance?: string; // When to buy guidance
};

// Reference comp from valuation service
export type ReferenceComp = {
  cardType: string;
  estimatedValue: number;
  liquidity: "high" | "medium" | "low";
};

// Evidence Panel - Supporting data (collapsed by default)
export type EvidenceData = {
  compsSummary?: {
    available: boolean;
    median?: number;
    low?: number;
    high?: number;
    soldCount?: number;
    trendSlope?: number;  // eBay price trend: positive = rising, negative = falling
    source?: "live" | "modeled" | "gemini_search"; // Data source: live scrape, modeled estimate, or Gemini search
    recentSales?: Array<{ price: number; date: string; source: string }>;
    // Player-level market data from Gemini search
    estimatedVolume?: "high" | "medium" | "low"; // Overall sales volume for this player
    volumeTrend?: "up" | "stable" | "down"; // Volume trend vs previous period
    breakdown?: Array<{
      category: string;
      avgPrice: number;
      priceRange: string;
    }>; // Price breakdown by card category
  };
  referenceComps?: ReferenceComp[]; // Synthetic reference cards with estimated values
  notes: string[]; // e.g., ["thin comps", "match quality medium"]
  newsSnippets?: string[]; // Recent news/hype if available
  lastUpdated?: string;
  dataQuality?: DataConfidence; // Overall data quality: HIGH, MEDIUM, LOW
  marketDataConfidence?: DataConfidence; // Gemini's assessment of card market activity
  newsCoverageConfidence?: DataConfidence; // Gemini's assessment of news coverage
};

// Discount Analysis - explains why a player might be cheap and what could change
export type DiscountAnalysis = {
  whyDiscounted: string[]; // Top 2-4 hypotheses for why cards are underpriced
  repricingCatalysts: string[]; // What events could cause market to reprice
  trapRisks: string[]; // What could confirm the discount is justified (stay cheap or drop)
};

// Peak Timing Assessment - has the player's card market likely peaked?
export type PeakTimingAssessment = {
  peakStatus: "PRE_PEAK" | "AT_PEAK" | "POST_PEAK" | "UNKNOWN";
  peakReason: string;
  shortTermOutlook: string;
  longTermOutlook: string;
};

// Tiered Card Recommendations - different advice for different card types
export type TieredRecommendations = {
  baseCards: {
    verdict: "SELL" | "HOLD" | "BUY";
    reasoning: string;
  };
  midTierParallels: {
    verdict: "SELL" | "HOLD" | "BUY";
    reasoning: string;
  };
  premiumGraded: {
    verdict: "SELL" | "HOLD" | "BUY";
    reasoning: string;
  };
};

// Team Context Assessment - how is the team performing?
export type PlayoffOutlook = "CONTENDER" | "BUBBLE" | "REBUILDING" | "UNKNOWN";
export type TeamMomentum = "ASCENDING" | "STABLE" | "DECLINING" | "UNKNOWN";
export type NarrativeStrength = "STRONG" | "MODERATE" | "WEAK" | "UNKNOWN";

export type TeamContext = {
  playoffOutlook: PlayoffOutlook;
  teamMomentum: TeamMomentum;
  narrativeStrength: NarrativeStrength;
};

// Full Player Outlook Response
export type PlayerOutlookResponse = {
  player: PlayerInfo;
  snapshot: PlayerSnapshot;
  thesis: string[]; // 3-6 bullet points
  marketRealityCheck: string[]; // 2-3 uncomfortable truths that build credibility
  verdict: PlayerVerdictResult; // Legacy verdict (deprecated)
  investmentCall?: InvestmentCall; // New 5-state forced-decision call
  discountAnalysis?: DiscountAnalysis; // Only populated for BUY/MONITOR verdicts
  peakTiming?: PeakTimingAssessment; // Peak timing assessment
  tieredRecommendations?: TieredRecommendations; // Different advice by card tier
  teamContext?: TeamContext; // Team performance context
  exposures: ExposureRecommendation[];
  evidence: EvidenceData;
  generatedAt: string;
  cacheStatus?: "fresh" | "stale" | "miss";
};

// Player Outlook Request
export type PlayerOutlookRequest = {
  playerName: string;
  sport?: string; // Optional, can be inferred
  contextCard?: {
    set?: string;
    year?: number;
    parallel?: string;
  };
};

// ============ ADVISOR OUTLOOK - Trusted Advisor Format ============
// Compact, opinionated summary for the above-the-fold view

export type AdvisorVerdict = "BUY" | "HOLD_CORE" | "HOLD" | "SELL" | "AVOID" | "TRADE_THE_HYPE";
export type AdvisorConfidence = "LOW" | "MED" | "HIGH";
export type AdvisorHorizon = "1-3m" | "3-12m" | "12m+";

export type AdvisorActionPlan = {
  now: string; // 1 sentence: what to do right now
  entryRule: string; // 1 sentence: when/how to enter
  sizingRule: string; // 1 sentence: position sizing guidance
};

export type AdvisorOutlook = {
  verdict: AdvisorVerdict;
  verdictLabel: string; // Human-readable label like "Hold, don't chase"
  confidence: AdvisorConfidence;
  horizon: AdvisorHorizon;
  advisorTake: string; // 3-4 sentences max: the advisor's voice
  packHitReaction?: string; // One line: how to feel/act if you pull this player in a pack
  collectorTip?: string; // Timing tip for fans/collectors based on price momentum
  topReasons: [string, string, string]; // Exactly 3 short reasons
  actionPlan: AdvisorActionPlan;
  whatChangesMyMind: string[]; // 2-4 bullets: conditions that break the thesis
  buyTriggers: string[]; // 2-4 bullets: what would make this a buy
  cards: {
    buy: string[]; // 0-6 specific cards to buy
    avoid: string[]; // 0-6 specific cards to avoid
  };
  evidenceNote: string; // 1 sentence: data sources and limitations
  liquidityTier?: LiquidityTier; // Overall player market liquidity (derived from exposures)
};

// Player Outlook Cache table
export const playerOutlookCache = pgTable("player_outlook_cache", {
  id: serial("id").primaryKey(),
  playerKey: varchar("player_key", { length: 128 }).notNull().unique(), // normalized: sport:playername
  sport: varchar("sport", { length: 50 }).notNull(),
  playerName: varchar("player_name", { length: 255 }).notNull(),
  
  // SEO-friendly URL slug (e.g., "cj-stroud", "victor-wembanyama")
  slug: varchar("slug", { length: 255 }),
  
  // Public visibility for SEO pages
  isPublic: boolean("is_public").default(false),
  
  // SEO metadata
  seoTitle: varchar("seo_title", { length: 255 }),
  seoDescription: text("seo_description"),
  
  // Classification outputs (deterministic)
  classificationJson: jsonb("classification_json").$type<{
    stage: PlayerStage;
    position?: string;
    team?: string;
    rookieYear?: number;
    baseTemperature: MarketTemperature;
    baseVolatility: VolatilityLevel;
    baseRisk: RiskLevel;
    baseHorizon: InvestmentHorizon;
  }>(),
  
  // Full outlook response
  outlookJson: jsonb("outlook_json").$type<PlayerOutlookResponse>(),
  
  // Cache management
  temperature: varchar("temperature", { length: 20 }), // For TTL decisions
  lastFetchedAt: timestamp("last_fetched_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_player_outlook_key").on(table.playerKey),
  index("idx_player_outlook_expires").on(table.expiresAt),
  index("idx_player_outlook_sport").on(table.sport),
  index("idx_player_outlook_slug").on(table.slug),
  index("idx_player_outlook_public").on(table.isPublic),
]);

export type PlayerOutlookCache = typeof playerOutlookCache.$inferSelect;
export type InsertPlayerOutlookCache = typeof playerOutlookCache.$inferInsert;

// Player Watchlist table - tracks which players a user is watching
export const playerWatchlist = pgTable("player_watchlist", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  playerKey: varchar("player_key", { length: 128 }).notNull(), // normalized: sport:playername
  playerName: varchar("player_name", { length: 255 }).notNull(),
  sport: varchar("sport", { length: 50 }).notNull().default("football"),
  
  // Snapshot at time of adding (for change tracking)
  verdictAtAdd: varchar("verdict_at_add", { length: 20 }), // BUY, MONITOR, AVOID
  modifierAtAdd: varchar("modifier_at_add", { length: 50 }), // Momentum, Speculative, etc.
  temperatureAtAdd: varchar("temperature_at_add", { length: 20 }), // HOT, WARM, COLD
  
  // User notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_watchlist_user").on(table.userId),
  index("idx_watchlist_player_key").on(table.playerKey),
]);

export type PlayerWatchlist = typeof playerWatchlist.$inferSelect;
export type InsertPlayerWatchlist = typeof playerWatchlist.$inferInsert;

// Player Outlook History - snapshots of outlook over time for change tracking
export const playerOutlookHistory = pgTable("player_outlook_history", {
  id: serial("id").primaryKey(),
  playerKey: varchar("player_key", { length: 128 }).notNull(),
  playerName: varchar("player_name", { length: 255 }).notNull(),
  sport: varchar("sport", { length: 50 }).notNull(),
  
  // Core verdict fields for quick comparison
  verdict: varchar("verdict", { length: 20 }).notNull(), // BUY, MONITOR, AVOID
  modifier: varchar("modifier", { length: 50 }).notNull(),
  temperature: varchar("temperature", { length: 20 }).notNull(),
  confidence: varchar("confidence", { length: 20 }).notNull(),
  
  // Full outlook snapshot
  outlookJson: jsonb("outlook_json").$type<PlayerOutlookResponse>().notNull(),
  
  // Hash of the verdict+modifier+temperature for change detection
  snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(),
  
  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_history_player_key").on(table.playerKey),
  index("idx_history_snapshot_at").on(table.snapshotAt),
  index("idx_history_hash").on(table.snapshotHash),
]);

export type PlayerOutlookHistory = typeof playerOutlookHistory.$inferSelect;
export type InsertPlayerOutlookHistory = typeof playerOutlookHistory.$inferInsert;

// Watchlist with current outlook (for API response)
export type WatchlistPlayerWithOutlook = PlayerWatchlist & {
  currentOutlook?: PlayerOutlookResponse;
  changes?: {
    verdictChanged: boolean;
    modifierChanged: boolean;
    temperatureChanged: boolean;
    previousVerdict?: string;
    previousModifier?: string;
    previousTemperature?: string;
    changeCount: number;
  };
};

// =============================================
// UNIFIED WATCHLIST - Supports both players AND cards
// =============================================

export const WATCHLIST_ITEM_TYPES = ["player", "card"] as const;
export type WatchlistItemType = (typeof WATCHLIST_ITEM_TYPES)[number];

export const watchlist = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Item type discriminator
  itemType: varchar("item_type", { length: 20 }).notNull().$type<WatchlistItemType>(),
  
  // For player items
  playerKey: varchar("player_key", { length: 128 }), // normalized: sport:playername
  playerName: varchar("player_name", { length: 255 }),
  sport: varchar("sport", { length: 50 }),
  
  // For card items
  cardId: integer("card_id").references(() => cards.id, { onDelete: "cascade" }),
  cardTitle: varchar("card_title", { length: 500 }), // Snapshot of card title at add time
  
  // Snapshot at time of adding (for change tracking)
  verdictAtAdd: varchar("verdict_at_add", { length: 20 }), // BUY, MONITOR, SELL, HOLD
  actionAtAdd: varchar("action_at_add", { length: 20 }), // For cards: BUY, MONITOR, SELL, etc.
  temperatureAtAdd: varchar("temperature_at_add", { length: 20 }), // HOT, WARM, COLD
  estimatedValueAtAdd: integer("estimated_value_at_add"), // For cards: value when added
  
  // User notes
  notes: text("notes"),
  
  // Source tracking (where did user add from)
  source: varchar("source", { length: 50 }), // MarketOutlook, PlayerOutlook, CardDetail, Manual
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_unified_watchlist_user").on(table.userId),
  index("idx_unified_watchlist_type").on(table.itemType),
  index("idx_unified_watchlist_player_key").on(table.playerKey),
  index("idx_unified_watchlist_card_id").on(table.cardId),
]);

export const insertWatchlistSchema = createInsertSchema(watchlist).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlist.$inferSelect;

// Extended type for watchlist with current data
export type WatchlistItemWithDetails = Watchlist & {
  // For player items
  currentPlayerOutlook?: PlayerOutlookResponse;
  ownedCards?: Card[]; // Cards in collection for this player
  
  // For card items  
  card?: Card;
  currentCardOutlook?: {
    action: string;
    estimatedValue: number | null;
    confidence: string;
    explanation: string;
  };
  
  // Change tracking
  changes?: {
    verdictChanged: boolean;
    actionChanged: boolean;
    temperatureChanged: boolean;
    valueChange?: number; // For cards: $ change since added
    previousVerdict?: string;
    previousAction?: string;
    previousTemperature?: string;
  };
};

// =============================================
// PORTFOLIO INTELLIGENCE LAYER
// =============================================

// Types for portfolio exposures and risk signals
export type PortfolioExposures = {
  bySport: Record<string, number>;
  byPosition: Record<string, number>;
  byCareerStage: Record<string, number>;
  byTeamMarket: Record<string, number>;
  byGradeCompany: Record<string, number>;
  topPlayersConcentration: Array<{ player: string; pct: number; value: number }>;
  topTeamsConcentration: Array<{ team: string; pct: number }>;
};

export type RiskSignal = {
  code: string;
  label: string;
  severity: "low" | "med" | "high";
  explanation: string;
  affectedCardIds: number[];
};

export type RecommendedAction = {
  label: string;
  why: string;
  cta: string;
  target: "portfolio" | "nextBuys" | "watchlist" | "marketOutlook";
};

// Portfolio Snapshots table - stores computed portfolio outlook per user
export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  asOfDate: timestamp("as_of_date").defaultNow(),
  
  // Overall assessment
  overallStance: varchar("overall_stance", { length: 100 }), // "Speculative Growth", "Balanced", "Value", "Legacy", "Aggressive Speculation"
  confidenceScore: integer("confidence_score"), // 1-100
  primaryDriver: text("primary_driver"),
  summaryShort: text("summary_short"),
  summaryLong: text("summary_long"),
  
  // Portfolio metrics
  portfolioValueEstimate: real("portfolio_value_estimate"),
  cardCount: integer("card_count"),
  
  // Exposures JSON
  exposures: jsonb("exposures").$type<PortfolioExposures>(),
  
  // Risk signals JSON
  riskSignals: jsonb("risk_signals").$type<RiskSignal[]>(),
  
  // AI-generated recommendations
  opportunities: jsonb("opportunities").$type<string[]>(),
  watchouts: jsonb("watchouts").$type<string[]>(),
  recommendedNextActions: jsonb("recommended_next_actions").$type<RecommendedAction[]>(),
}, (table) => [
  index("idx_portfolio_snapshot_user").on(table.userId),
  index("idx_portfolio_snapshot_date").on(table.userId, table.asOfDate),
]);

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type InsertPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;
export const insertPortfolioSnapshotSchema = createInsertSchema(portfolioSnapshots).omit({ id: true, createdAt: true });

// Portfolio profile (non-persisted, computed)
export type PortfolioProfile = {
  portfolioValueEstimate: number;
  cardCount: number;
  sports: Record<string, number>;
  positions: Record<string, number>;
  careerStage: Record<string, number>;
  teamMarket: Record<string, number>;
  grades: Record<string, number>;
  concentration: {
    topPlayers: Array<{ player: string; pct: number; value: number }>;
    topTeams: Array<{ team: string; pct: number }>;
  };
  liquiditySignals: {
    highLiquidityPct: number;
    lowLiquidityPct: number;
  };
  notableHoldings: Array<{
    cardId: number;
    title: string;
    estValue: number;
    player: string;
    position: string;
    stage: string;
  }>;
  weakSpots: Array<{
    label: string;
    detail: string;
  }>;
};

// Next Buys table - stores recommended buy candidates
export type NextBuyPortfolioImpact = {
  qbExposureDelta?: number;
  rookieExposureDelta?: number;
  diversificationGain?: string;
  teamConcentrationDelta?: number;
};

export const nextBuys = pgTable("next_buys", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  asOfDate: timestamp("as_of_date").defaultNow(),
  
  // Card identification
  title: text("title").notNull(),
  playerName: varchar("player_name", { length: 255 }),
  sport: varchar("sport", { length: 50 }),
  year: integer("year"),
  setName: varchar("set_name", { length: 255 }),
  cardNumber: varchar("card_number", { length: 50 }),
  variation: varchar("variation", { length: 255 }),
  gradeCompany: varchar("grade_company", { length: 50 }),
  grade: varchar("grade", { length: 50 }),
  
  // Pricing
  estPrice: real("est_price"),
  
  // Scoring (0-100)
  valueScore: integer("value_score"),
  fitScore: integer("fit_score"),
  momentumScore: integer("momentum_score"),
  overallScore: integer("overall_score"),
  
  // Verdict
  verdict: varchar("verdict", { length: 20 }), // BUY, MONITOR
  
  // Explanation
  whyBullets: jsonb("why_bullets").$type<string[]>(),
  portfolioImpact: jsonb("portfolio_impact").$type<NextBuyPortfolioImpact>(),
  
  // Source tracking
  source: varchar("source", { length: 50 }), // HiddenGems, Watchlist, MarketOutlook, Manual
  sourceUrl: text("source_url"),
  
  // Deduplication
  cardFingerprint: varchar("card_fingerprint", { length: 255 }).notNull(),
}, (table) => [
  index("idx_next_buys_user").on(table.userId),
  index("idx_next_buys_date_score").on(table.userId, table.asOfDate, table.overallScore),
  unique("unique_user_fingerprint").on(table.userId, table.cardFingerprint),
]);

export type NextBuy = typeof nextBuys.$inferSelect;
export type InsertNextBuy = typeof nextBuys.$inferInsert;
export const insertNextBuySchema = createInsertSchema(nextBuys).omit({ id: true, createdAt: true });

// Dismissed Recommendations - tracks players user doesn't want to see in recommendations
export const dismissedRecommendations = pgTable("dismissed_recommendations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  playerName: varchar("player_name", { length: 255 }).notNull(),
  reason: varchar("reason", { length: 50 }), // "already_own", "not_interested"
  dismissedAt: timestamp("dismissed_at").defaultNow(),
}, (table) => [
  index("idx_dismissed_recs_user").on(table.userId),
  unique("unique_user_dismissed_player").on(table.userId, table.playerName),
]);

export type DismissedRecommendation = typeof dismissedRecommendations.$inferSelect;
export type InsertDismissedRecommendation = typeof dismissedRecommendations.$inferInsert;

// Shared Snapshots - allows public viewing of private reports via token
export const sharedSnapshots = pgTable("shared_snapshots", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  snapshotType: varchar("snapshot_type", { length: 50 }).notNull(), // card_outlook, player_outlook, portfolio_analytics, portfolio_outlook
  
  // Reference IDs based on type
  cardId: integer("card_id").references(() => cards.id, { onDelete: "cascade" }),
  
  // Snapshot data (JSON blob of the report at time of share)
  snapshotData: jsonb("snapshot_data").notNull(),
  
  // Metadata
  title: varchar("title", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at"), // null = never expires
  viewCount: integer("view_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_shared_snapshots_token").on(table.token),
  index("idx_shared_snapshots_user").on(table.userId),
]);

export type SharedSnapshot = typeof sharedSnapshots.$inferSelect;
export type InsertSharedSnapshot = typeof sharedSnapshots.$inferInsert;
export const insertSharedSnapshotSchema = createInsertSchema(sharedSnapshots).omit({ id: true, createdAt: true, viewCount: true });

// Hidden Gems - monthly curated undervalued player picks from AI analysis
export const hiddenGems = pgTable("hidden_gems", {
  id: serial("id").primaryKey(),
  playerKey: varchar("player_key", { length: 128 }).notNull(), // normalized: sport:playername
  playerName: varchar("player_name", { length: 255 }).notNull(),
  sport: varchar("sport", { length: 50 }).notNull(),
  position: varchar("position", { length: 50 }),
  team: varchar("team", { length: 100 }),
  
  // Investment call data
  verdict: varchar("verdict", { length: 30 }).notNull(), // BUY, MONITOR
  modifier: varchar("modifier", { length: 50 }).notNull(), // Value, Momentum, Speculative, Long-Term
  temperature: varchar("temperature", { length: 20 }).notNull(), // HOT, WARM, NEUTRAL, COOLING
  tier: varchar("tier", { length: 30 }).notNull(), // PREMIUM, CORE, GROWTH, SPECULATIVE
  riskLevel: varchar("risk_level", { length: 20 }).notNull(), // LOW, MEDIUM, HIGH
  
  // Content
  thesis: text("thesis").notNull(), // One-line opportunity summary
  whyDiscounted: jsonb("why_discounted").$type<string[]>().notNull(),
  repricingCatalysts: jsonb("repricing_catalysts").$type<string[]>().notNull(),
  trapRisks: jsonb("trap_risks").$type<string[]>().notNull(),
  
  // Scores for ranking
  upsideScore: integer("upside_score"),
  confidenceScore: integer("confidence_score"),
  discountScore: integer("discount_score"), // How undervalued (higher = more undervalued)
  
  // Discovery source
  source: varchar("source", { length: 20 }).default("AI").notNull(), // "AI" | "COMMUNITY" | "BOTH"

  // Batch management
  batchId: varchar("batch_id", { length: 64 }).notNull(), // Groups gems from same refresh
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // When this batch should be replaced
}, (table) => [
  index("idx_hidden_gems_active").on(table.isActive),
  index("idx_hidden_gems_batch").on(table.batchId),
  index("idx_hidden_gems_sport").on(table.sport),
]);

export type HiddenGem = typeof hiddenGems.$inferSelect;
export type InsertHiddenGem = typeof hiddenGems.$inferInsert;
export const insertHiddenGemSchema = createInsertSchema(hiddenGems).omit({ id: true, createdAt: true });

// Player Registry - Admin-managed player status database for investment verdicts
export const playerRegistry = pgTable("player_registry", {
  id: serial("id").primaryKey(),
  sport: varchar("sport", { length: 10 }).notNull(), // NFL, NBA, MLB, NHL
  playerName: varchar("player_name", { length: 255 }).notNull(),
  aliases: text("aliases"), // Pipe-separated: "Brady|T Brady|Thomas Brady"
  careerStage: varchar("career_stage", { length: 30 }).notNull(), // ROOKIE, YEAR_2, YEAR_3, YEAR_4, PRIME, VETERAN, RETIRED_HOF, BUST
  roleTier: varchar("role_tier", { length: 30 }).notNull(), // FRANCHISE_CORE, SOLID_STARTER, UNCERTAIN_ROLE, BACKUP_OR_FRINGE, OUT_OF_LEAGUE, RETIRED_ICON
  positionGroup: varchar("position_group", { length: 30 }).notNull(), // NFL: QB, WR, RB, TE, EDGE, DL, LB, CB, S | NBA: GUARD, WING, BIG | MLB: PITCHER, CATCHER, INFIELDER, OUTFIELDER | NHL: GOALIE, CENTER, WINGER, DEFENSEMAN | UNKNOWN
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedBy: varchar("updated_by", { length: 255 }), // Admin who last updated
  notes: text("notes"), // Optional admin notes
}, (table) => [
  index("idx_player_registry_sport").on(table.sport),
  index("idx_player_registry_name").on(table.playerName),
  index("idx_player_registry_tier").on(table.roleTier),
  unique("unique_sport_player").on(table.sport, table.playerName),
]);

export type PlayerRegistry = typeof playerRegistry.$inferSelect;
export type InsertPlayerRegistry = typeof playerRegistry.$inferInsert;
export const insertPlayerRegistrySchema = createInsertSchema(playerRegistry).omit({ id: true, createdAt: true, lastUpdated: true });

// =============================================================================
// PORTFOLIO BUILDER - Box Break Splitting System
// =============================================================================

// Split Instance Status - forward-only state machine after LOCKED
export const SPLIT_STATUSES = [
  "OPEN_INTEREST",
  "PAYMENT_OPEN", 
  "LOCKED",
  "ORDERED",
  "SHIPPED",
  "IN_HAND",
  "BROKEN",
  "CANCELED",
  "REFUNDED"
] as const;
export type SplitStatus = typeof SPLIT_STATUSES[number];

// Valid forward transitions for the state machine
export const SPLIT_STATUS_TRANSITIONS: Record<SplitStatus, SplitStatus[]> = {
  OPEN_INTEREST: ["PAYMENT_OPEN", "CANCELED"],
  PAYMENT_OPEN: ["LOCKED", "CANCELED", "REFUNDED"],
  LOCKED: ["ORDERED"],
  ORDERED: ["SHIPPED"],
  SHIPPED: ["IN_HAND"],
  IN_HAND: ["BROKEN"],
  BROKEN: [],
  CANCELED: [],
  REFUNDED: [],
};

// Break types - how the break is organized
// PACK is for pack breaks where each participant gets random packs (any number of participants based on pack count)
export const BREAK_TYPES = ["TEAM", "DIVISIONAL", "PACK"] as const;
export type BreakType = typeof BREAK_TYPES[number];

// Split format types (selection units)
// TEAM is only valid for splits with <= 4 participants
// For 5+ participants, must use DIVISION, CONFERENCE, PACK, or TEAM_BUNDLE
// PACK format has no participant limit - depends on number of packs in the box
export const SPLIT_FORMAT_TYPES = ["TEAM", "DIVISIONAL", "CONFERENCE", "PACK", "TEAM_BUNDLE"] as const;
export type SplitFormatType = typeof SPLIT_FORMAT_TYPES[number];

// Bundle format types - formats that require bundle selection (not individual teams)
// Note: PACK is excluded - each participant just gets random packs, no team selection needed
export const BUNDLE_FORMAT_TYPES = ["DIVISIONAL", "CONFERENCE", "TEAM_BUNDLE"] as const;
export type BundleFormatType = typeof BUNDLE_FORMAT_TYPES[number];

// Type for bundle definitions - maps bundle name to array of teams
export type BundleDefinition = {
  name: string;
  teams: string[];
};

// Maximum participants allowed for single-team selection
export const MAX_SINGLE_TEAM_PARTICIPANTS = 4;

// Valid participant counts for team/divisional breaks
export const VALID_PARTICIPANT_COUNTS = [2, 3, 4, 6, 8] as const;
export type ParticipantCount = typeof VALID_PARTICIPANT_COUNTS[number];

// Valid participant counts for pack breaks (based on common pack counts in hobby boxes)
export const VALID_PACK_COUNTS = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24] as const;
export type ValidPackCount = typeof VALID_PACK_COUNTS[number];

// Seat status
export const SEAT_STATUSES = ["INTERESTED", "WAITLIST", "PAID", "REFUNDED", "CANCELED"] as const;
export type SeatStatus = typeof SEAT_STATUSES[number];

// Breaker fee constant - $50 per break (split among participants)
export const BREAKER_FEE_CENTS = 5000;

// Shipping fee constant - $5 per seat
export const SHIPPING_FEE_CENTS = 500;

// Break Event - a product listing (e.g., "2024 Panini Prizm Football Hobby Box")
export const breakEvents = pgTable("break_events", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  sport: varchar("sport", { length: 50 }).notNull(),
  year: varchar("year", { length: 10 }).notNull(),
  brand: varchar("brand", { length: 100 }).notNull(),
  breakType: varchar("break_type", { length: 20 }).default("TEAM").notNull().$type<BreakType>(),
  description: text("description"),
  imageUrl: varchar("image_url", { length: 500 }),
  estimatedBreakWindowStart: timestamp("estimated_break_window_start"),
  estimatedBreakWindowEnd: timestamp("estimated_break_window_end"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const breakEventsRelations = relations(breakEvents, ({ many }) => ({
  splitInstances: many(splitInstances),
}));

// Split Instance - a specific split format under a BreakEvent
export const splitInstances = pgTable("split_instances", {
  id: serial("id").primaryKey(),
  breakEventId: integer("break_event_id").notNull().references(() => breakEvents.id, { onDelete: "cascade" }),
  formatType: varchar("format_type", { length: 30 }).notNull().$type<SplitFormatType>(),
  participantCount: integer("participant_count").notNull(),
  // Bundle definitions for TEAM_BUNDLE format - each bundle contains multiple teams
  bundles: jsonb("bundles").$type<BundleDefinition[]>().default([]),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  status: varchar("status", { length: 30 }).default("OPEN_INTEREST").notNull().$type<SplitStatus>(),
  paymentWindowEndsAt: timestamp("payment_window_ends_at"),
  totalBoxPriceCents: integer("total_box_price_cents").notNull().default(0),
  seatPriceCents: integer("seat_price_cents").notNull(),
  priceCapCents: integer("price_cap_cents").notNull(),
  assignmentPool: jsonb("assignment_pool").$type<string[]>().default([]),
  youtubeUrl: varchar("youtube_url", { length: 500 }),
  orderMeta: jsonb("order_meta").$type<{
    retailer?: string;
    orderId?: string;
    purchaseCost?: number;
    tracking?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_split_instances_break_event").on(table.breakEventId),
  index("idx_split_instances_status").on(table.status),
  index("idx_split_instances_payment_window").on(table.status, table.paymentWindowEndsAt),
]);

export const splitInstancesRelations = relations(splitInstances, ({ one, many }) => ({
  breakEvent: one(breakEvents, {
    fields: [splitInstances.breakEventId],
    references: [breakEvents.id],
  }),
  seats: many(seats),
}));

// Seat - user participation record
export const seats = pgTable("seats", {
  id: serial("id").primaryKey(),
  splitInstanceId: integer("split_instance_id").notNull().references(() => splitInstances.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: varchar("status", { length: 30 }).default("INTERESTED").notNull().$type<SeatStatus>(),
  preferences: jsonb("preferences").$type<string[]>().default([]),
  paidAt: timestamp("paid_at"),
  priorityNumber: integer("priority_number"),
  assignment: varchar("assignment", { length: 255 }),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_split_user_seat").on(table.splitInstanceId, table.userId),
  index("idx_seats_split_status").on(table.splitInstanceId, table.status),
  index("idx_seats_user").on(table.userId),
]);

export const seatsRelations = relations(seats, ({ one }) => ({
  splitInstance: one(splitInstances, {
    fields: [seats.splitInstanceId],
    references: [splitInstances.id],
  }),
  user: one(users, {
    fields: [seats.userId],
    references: [users.id],
  }),
}));

// Webhook Event - for idempotency (prevent double-processing)
export const splitWebhookEvents = pgTable("split_webhook_events", {
  id: serial("id").primaryKey(),
  eventId: varchar("event_id", { length: 255 }).notNull().unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  processedAt: timestamp("processed_at").defaultNow(),
  metadata: jsonb("metadata"),
});

// Helper function to validate status transitions
export function isValidStatusTransition(current: SplitStatus, next: SplitStatus): boolean {
  return SPLIT_STATUS_TRANSITIONS[current].includes(next);
}

// Helper function to check if status is pre-lock (allows preference edits)
export function isPreLockStatus(status: SplitStatus): boolean {
  return status === "OPEN_INTEREST" || status === "PAYMENT_OPEN";
}

// Helper function to check if status is post-lock (procurement stages)
export function isPostLockStatus(status: SplitStatus): boolean {
  return ["LOCKED", "ORDERED", "SHIPPED", "IN_HAND", "BROKEN"].includes(status);
}

// Helper function to check if a participant count is valid (3 only if explicitly enabled)
export function isValidParticipantCount(count: number, allow3: boolean = false): boolean {
  if (count === 3) return allow3;
  return [2, 4, 6, 8].includes(count);
}

// Helper function to check if format type requires bundles (not individual team selection)
export function requiresBundleSelection(formatType: SplitFormatType): boolean {
  return (BUNDLE_FORMAT_TYPES as readonly string[]).includes(formatType);
}

// Helper function to check if single-team selection is allowed for participant count
export function isSingleTeamAllowed(participantCount: number): boolean {
  return participantCount <= MAX_SINGLE_TEAM_PARTICIPANTS;
}

// Helper function to validate format type against participant count
// Returns error message if invalid, null if valid
export function validateFormatTypeForParticipants(
  formatType: SplitFormatType,
  participantCount: number
): string | null {
  // Single-team selection (TEAM format) is only allowed for 4 or fewer participants
  if (formatType === "TEAM" && participantCount > MAX_SINGLE_TEAM_PARTICIPANTS) {
    return `Single-team selection is not allowed for splits with more than ${MAX_SINGLE_TEAM_PARTICIPANTS} participants. Use DIVISIONAL, CONFERENCE, PACK, or TEAM_BUNDLE instead.`;
  }
  // PACK format has no participant limit - depends on pack count in the box
  // Validate that participant count is within valid pack counts
  if (formatType === "PACK" && !(VALID_PACK_COUNTS as readonly number[]).includes(participantCount)) {
    return `Pack breaks must have a valid pack count: ${VALID_PACK_COUNTS.join(", ")}.`;
  }
  return null;
}

// Blog Posts table
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 500 }).notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  contentFormat: varchar("content_format", { length: 10 }).default("text").notNull(),
  heroImageUrl: varchar("hero_image_url", { length: 1000 }),
  videoEmbeds: jsonb("video_embeds").$type<Array<{ provider: string; url: string; caption?: string }>>().default([]),
  isPublished: boolean("is_published").default(false).notNull(),
  publishedAt: timestamp("published_at"),
  authorId: varchar("author_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
  author: one(users, {
    fields: [blogPosts.authorId],
    references: [users.id],
  }),
}));

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type BlogPost = typeof blogPosts.$inferSelect;

export type BlogPostWithAuthor = BlogPost & {
  author: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> | null;
};

// Helper function to validate bundle definitions
export function validateBundles(
  bundles: BundleDefinition[],
  participantCount: number,
  formatType: SplitFormatType
): string | null {
  if (formatType !== "TEAM_BUNDLE") {
    return null; // Bundles only required for TEAM_BUNDLE format
  }
  
  if (bundles.length !== participantCount) {
    return `Number of bundles (${bundles.length}) must match participant count (${participantCount})`;
  }
  
  for (const bundle of bundles) {
    if (!bundle.name || bundle.name.trim() === "") {
      return "Each bundle must have a name";
    }
    if (!bundle.teams || bundle.teams.length === 0) {
      return `Bundle "${bundle.name}" must contain at least one team`;
    }
  }
  
  return null;
}

// Zod Schemas and Types
export const insertBreakEventSchema = createInsertSchema(breakEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBreakEvent = z.infer<typeof insertBreakEventSchema>;
export type BreakEvent = typeof breakEvents.$inferSelect;

export const insertSplitInstanceSchema = createInsertSchema(splitInstances).omit({
  id: true,
  status: true,
  paymentWindowEndsAt: true,
  youtubeUrl: true,
  orderMeta: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSplitInstance = z.infer<typeof insertSplitInstanceSchema>;
export type SplitInstance = typeof splitInstances.$inferSelect;

export const insertSeatSchema = createInsertSchema(seats).omit({
  id: true,
  paidAt: true,
  priorityNumber: true,
  assignment: true,
  stripeCheckoutSessionId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSeat = z.infer<typeof insertSeatSchema>;
export type Seat = typeof seats.$inferSelect;

export type SplitWebhookEvent = typeof splitWebhookEvents.$inferSelect;

// Extended types with relations
export type BreakEventWithSplits = BreakEvent & { splitInstances: SplitInstance[] };
export type SplitInstanceWithSeats = SplitInstance & { seats: Seat[] };
export type SplitInstanceWithBreakEvent = SplitInstance & { breakEvent: BreakEvent };
export type SeatWithUser = Seat & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> };

// Seat counts for display
export type SeatCounts = {
  interested: number;
  waitlist: number;
  paid: number;
  total: number;
};

// ============================================================================
// ACTIVITY LOGS - Track user actions for analytics
// ============================================================================
export const ACTIVITY_TYPES = [
  "card_scan",           // User scanned a card photo
  "card_add",            // User added a card to collection
  "card_edit",           // User edited a card
  "card_delete",         // User deleted a card
  "outlook_request",     // User requested card outlook analysis
  "case_view",           // Someone viewed a display case
  "case_create",         // User created a display case
  "offer_send",          // User sent an offer
  "offer_respond",       // User responded to an offer
  "message_send",        // User sent a message
  "login",               // User logged in
  "signup",              // New user signed up
  "subscription_change", // User changed subscription
  "card_analysis",       // User ran Card Analysis (quick check)
  "share_case",          // User shared a display case
] as const;

export type ActivityType = typeof ACTIVITY_TYPES[number];

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  activityType: varchar("activity_type", { length: 50 }).notNull(),
  targetId: varchar("target_id", { length: 255 }), // ID of the entity (card, case, etc.)
  targetType: varchar("target_type", { length: 50 }), // Type of entity
  metadata: jsonb("metadata"), // Additional context (player name, card title, etc.)
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_activity_logs_user_id").on(table.userId),
  index("idx_activity_logs_type").on(table.activityType),
  index("idx_activity_logs_created_at").on(table.createdAt),
]);

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

export type ActivityLogWithUser = ActivityLog & {
  user: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> | null;
};

// ============================================================================
// USER FEEDBACK
// ============================================================================
export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(), // bug, feature, general, praise
  message: text("message").notNull(),
  page: varchar("page", { length: 255 }), // Current page URL when submitted
  userAgent: text("user_agent"),
  status: varchar("status", { length: 50 }).default("new"), // new, reviewed, resolved
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userFeedbackRelations = relations(userFeedback, ({ one }) => ({
  user: one(users, {
    fields: [userFeedback.userId],
    references: [users.id],
  }),
}));

export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;
export type UserFeedback = typeof userFeedback.$inferSelect;

// ============================================================================
// SCAN HISTORY
// ============================================================================
export const scanHistory = pgTable("scan_history", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  playerName: varchar("player_name", { length: 255 }),
  year: integer("year"),
  setName: varchar("set_name", { length: 255 }),
  variation: varchar("variation", { length: 255 }),
  grade: varchar("grade", { length: 50 }),
  grader: varchar("grader", { length: 50 }),
  sport: varchar("sport", { length: 50 }),
  cardNumber: varchar("card_number", { length: 50 }),
  imagePath: text("image_path"),
  scanConfidence: varchar("scan_confidence", { length: 20 }),
  marketValue: real("market_value"),
  action: varchar("action", { length: 50 }),
  scanSource: varchar("scan_source", { length: 30 }).notNull().default("card_analysis"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scanHistoryRelations = relations(scanHistory, ({ one }) => ({
  user: one(users, {
    fields: [scanHistory.userId],
    references: [users.id],
  }),
}));

export const insertScanHistorySchema = createInsertSchema(scanHistory).omit({
  id: true,
  createdAt: true,
});
export type InsertScanHistory = z.infer<typeof insertScanHistorySchema>;
export type ScanHistory = typeof scanHistory.$inferSelect;

export const unifiedAnalysisDbCache = pgTable("unified_analysis_cache", {
  cacheKey: varchar("cache_key", { length: 512 }).primaryKey(),
  resultJson: jsonb("result_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UnifiedAnalysisDbCache = typeof unifiedAnalysisDbCache.$inferSelect;
