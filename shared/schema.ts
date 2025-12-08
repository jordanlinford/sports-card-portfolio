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
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0).notNull(),
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

// Extended types with relations
export type DisplayCaseWithCards = DisplayCase & { cards: Card[] };
export type DisplayCaseWithUser = DisplayCase & { user: User };
export type CommentWithUser = Comment & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'> };
