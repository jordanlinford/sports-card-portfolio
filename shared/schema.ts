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
  imagePath: varchar("image_path"),
  set: varchar("set", { length: 255 }),
  year: integer("year"),
  cardNumber: varchar("card_number", { length: 50 }),
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
  PRIME: "PRIME",           // Peak performance years
  VETERAN: "VETERAN",       // Later career, established
  AGING: "AGING",           // Declining performance
  BUST: "BUST",             // Career stalled/failed (young player who didn't pan out)
  RETIRED: "RETIRED",       // No longer playing
  RETIRED_HOF: "RETIRED_HOF", // Hall of Fame bound
  UNKNOWN: "UNKNOWN",       // Cannot determine stage - treat as speculative
} as const;
export type PlayerStage = keyof typeof PLAYER_STAGE;

// Investment Verdict - The main action recommendation (5-state forced-decision system)
export const INVESTMENT_VERDICT = {
  ACCUMULATE: "ACCUMULATE",           // Buy on dips, build position
  HOLD_CORE: "HOLD_CORE",             // Hold what you have, don't chase
  TRADE_THE_HYPE: "TRADE_THE_HYPE",   // Sell into spikes, take profits
  AVOID_NEW_MONEY: "AVOID_NEW_MONEY", // Stay away, don't add new money
  SPECULATIVE_FLYER: "SPECULATIVE_FLYER", // Small lottery ticket position
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
    source?: "live" | "modeled"; // Whether data is live market or modeled estimate
    recentSales?: Array<{ price: number; date: string; source: string }>;
  };
  referenceComps?: ReferenceComp[]; // Synthetic reference cards with estimated values
  notes: string[]; // e.g., ["thin comps", "match quality medium"]
  newsSnippets?: string[]; // Recent news/hype if available
  lastUpdated?: string;
  dataQuality?: DataConfidence; // Overall data quality: HIGH, MEDIUM, LOW
};

// Discount Analysis - explains why a player might be cheap and what could change
export type DiscountAnalysis = {
  whyDiscounted: string[]; // Top 2-4 hypotheses for why cards are underpriced
  repricingCatalysts: string[]; // What events could cause market to reprice
  trapRisks: string[]; // What could confirm the discount is justified (stay cheap or drop)
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

// Player Outlook Cache table
export const playerOutlookCache = pgTable("player_outlook_cache", {
  id: serial("id").primaryKey(),
  playerKey: varchar("player_key", { length: 128 }).notNull().unique(), // normalized: sport:playername
  sport: varchar("sport", { length: 50 }).notNull(),
  playerName: varchar("player_name", { length: 255 }).notNull(),
  
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
