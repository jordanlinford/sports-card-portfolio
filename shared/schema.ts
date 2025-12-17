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
  isAdmin: boolean("is_admin").default(false).notNull(),
  collectorScore: integer("collector_score").default(0).notNull(),
  collectorTier: varchar("collector_tier", { length: 50 }).default("bronze").notNull(),
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
  imagePath: varchar("image_path").notNull(),
  set: varchar("set", { length: 255 }),
  year: integer("year"),
  variation: varchar("variation", { length: 255 }),
  grade: varchar("grade", { length: 50 }),
  purchasePrice: real("purchase_price"),
  estimatedValue: real("estimated_value"),
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
  userId: varchar("user_id").notNull().references(() => users.id),
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
export type CommentWithUser = Comment & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> };
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
  riskScore: integer("risk_score"),
  
  // Action & Confidence (deterministic, not AI-decided)
  action: varchar("action", { length: 20 }), // BUY | WATCH | SELL | LONG_HOLD | LITTLE_VALUE
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
  WATCH: "WATCH",
  SELL: "SELL",
  LONG_HOLD: "LONG_HOLD",
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
