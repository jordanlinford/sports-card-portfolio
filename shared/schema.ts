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

export type Badge = typeof badges.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type UserBadgeWithBadge = UserBadge & { badge: Badge };

// Extended types with relations
export type DisplayCaseWithCards = DisplayCase & { cards: Card[] };
export type DisplayCaseWithUser = DisplayCase & { user: User };
export type CommentWithUser = Comment & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'> };
export type BookmarkWithCard = Bookmark & { card: Card };
export type OfferWithUsers = Offer & { fromUser: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'>; card: Card };

// Prestige tiers for collectors
export const COLLECTOR_TIERS = {
  bronze: { name: "Bronze", minScore: 0, color: "#CD7F32" },
  silver: { name: "Silver", minScore: 100, color: "#C0C0C0" },
  gold: { name: "Gold", minScore: 500, color: "#FFD700" },
  platinum: { name: "Platinum", minScore: 1500, color: "#E5E4E2" },
  diamond: { name: "Diamond", minScore: 5000, color: "#B9F2FF" },
} as const;

export type CollectorTier = keyof typeof COLLECTOR_TIERS;
