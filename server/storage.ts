import {
  users,
  displayCases,
  cards,
  comments,
  likes,
  type User,
  type UpsertUser,
  type DisplayCase,
  type InsertDisplayCase,
  type Card,
  type InsertCard,
  type DisplayCaseWithCards,
  type Comment,
  type InsertComment,
  type CommentWithUser,
  type Like,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, ilike, inArray, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserSubscription(userId: string, status: string, stripeCustomerId?: string): Promise<User | undefined>;
  updateUserByStripeCustomerId(stripeCustomerId: string, data: { subscriptionStatus?: string; stripeSubscriptionId?: string | null }): Promise<User | undefined>;

  // Display Case operations
  getDisplayCases(userId: string): Promise<DisplayCaseWithCards[]>;
  getDisplayCase(id: number): Promise<DisplayCaseWithCards | undefined>;
  getDisplayCaseByIdAndUser(id: number, userId: string): Promise<DisplayCase | undefined>;
  createDisplayCase(userId: string, data: InsertDisplayCase): Promise<DisplayCase>;
  updateDisplayCase(id: number, data: Partial<InsertDisplayCase>): Promise<DisplayCase | undefined>;
  deleteDisplayCase(id: number): Promise<void>;
  countDisplayCases(userId: string): Promise<number>;

  // Card operations
  getCards(displayCaseId: number): Promise<Card[]>;
  getCard(id: number): Promise<Card | undefined>;
  createCard(displayCaseId: number, data: InsertCard): Promise<Card>;
  updateCard(id: number, data: Partial<InsertCard>): Promise<Card | undefined>;
  deleteCard(id: number): Promise<void>;
  getMaxSortOrder(displayCaseId: number): Promise<number>;

  // Comment operations
  getComments(displayCaseId: number): Promise<CommentWithUser[]>;
  createComment(displayCaseId: number, userId: string, content: string): Promise<Comment>;
  deleteComment(id: number, userId: string): Promise<void>;

  // Like operations
  getLikeCount(displayCaseId: number): Promise<number>;
  hasUserLiked(displayCaseId: number, userId: string): Promise<boolean>;
  toggleLike(displayCaseId: number, userId: string): Promise<boolean>;

  // Public discovery operations
  getRecentPublicDisplayCases(limit?: number): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number })[]>;
  searchPublicDisplayCases(query: string, limit?: number): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number })[]>;
  getPopularPublicDisplayCases(limit?: number): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number })[]>;

  // Admin operations
  getAllUsers(): Promise<User[]>;
  getAllDisplayCases(): Promise<(DisplayCaseWithCards & { ownerName: string })[]>;
  getPlatformStats(): Promise<{ totalUsers: number; totalDisplayCases: number; totalCards: number; proUsers: number }>;
  isUserAdmin(userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserSubscription(userId: string, status: string, stripeCustomerId?: string): Promise<User | undefined> {
    const updateData: Partial<User> = {
      subscriptionStatus: status,
      updatedAt: new Date(),
    };
    if (stripeCustomerId) {
      updateData.stripeCustomerId = stripeCustomerId;
    }
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserByStripeCustomerId(stripeCustomerId: string, data: { subscriptionStatus?: string; stripeSubscriptionId?: string | null }): Promise<User | undefined> {
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (data.subscriptionStatus !== undefined) {
      updateData.subscriptionStatus = data.subscriptionStatus;
    }
    if (data.stripeSubscriptionId !== undefined) {
      updateData.stripeSubscriptionId = data.stripeSubscriptionId;
    }
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.stripeCustomerId, stripeCustomerId))
      .returning();
    return user;
  }

  // Display Case operations
  async getDisplayCases(userId: string): Promise<DisplayCaseWithCards[]> {
    const cases = await db
      .select()
      .from(displayCases)
      .where(eq(displayCases.userId, userId))
      .orderBy(desc(displayCases.createdAt));

    const casesWithCards: DisplayCaseWithCards[] = [];
    for (const c of cases) {
      const caseCards = await db
        .select()
        .from(cards)
        .where(eq(cards.displayCaseId, c.id))
        .orderBy(asc(cards.sortOrder));
      casesWithCards.push({ ...c, cards: caseCards });
    }
    return casesWithCards;
  }

  async getDisplayCase(id: number): Promise<DisplayCaseWithCards | undefined> {
    const [displayCase] = await db
      .select()
      .from(displayCases)
      .where(eq(displayCases.id, id));

    if (!displayCase) {
      return undefined;
    }

    const caseCards = await db
      .select()
      .from(cards)
      .where(eq(cards.displayCaseId, id))
      .orderBy(asc(cards.sortOrder));

    return { ...displayCase, cards: caseCards };
  }

  async getDisplayCaseByIdAndUser(id: number, userId: string): Promise<DisplayCase | undefined> {
    const [displayCase] = await db
      .select()
      .from(displayCases)
      .where(eq(displayCases.id, id));

    if (!displayCase || displayCase.userId !== userId) {
      return undefined;
    }
    return displayCase;
  }

  async createDisplayCase(userId: string, data: InsertDisplayCase): Promise<DisplayCase> {
    const [displayCase] = await db
      .insert(displayCases)
      .values({
        ...data,
        userId,
      })
      .returning();
    return displayCase;
  }

  async updateDisplayCase(id: number, data: Partial<InsertDisplayCase>): Promise<DisplayCase | undefined> {
    const [displayCase] = await db
      .update(displayCases)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(displayCases.id, id))
      .returning();
    return displayCase;
  }

  async deleteDisplayCase(id: number): Promise<void> {
    await db.delete(displayCases).where(eq(displayCases.id, id));
  }

  async countDisplayCases(userId: string): Promise<number> {
    const cases = await db
      .select()
      .from(displayCases)
      .where(eq(displayCases.userId, userId));
    return cases.length;
  }

  // Card operations
  async getCards(displayCaseId: number): Promise<Card[]> {
    return db
      .select()
      .from(cards)
      .where(eq(cards.displayCaseId, displayCaseId))
      .orderBy(asc(cards.sortOrder));
  }

  async getCard(id: number): Promise<Card | undefined> {
    const [card] = await db.select().from(cards).where(eq(cards.id, id));
    return card;
  }

  async createCard(displayCaseId: number, data: InsertCard): Promise<Card> {
    const maxSortOrder = await this.getMaxSortOrder(displayCaseId);
    const [card] = await db
      .insert(cards)
      .values({
        ...data,
        displayCaseId,
        sortOrder: maxSortOrder + 1,
      })
      .returning();
    return card;
  }

  async updateCard(id: number, data: Partial<InsertCard>): Promise<Card | undefined> {
    const [card] = await db
      .update(cards)
      .set(data)
      .where(eq(cards.id, id))
      .returning();
    return card;
  }

  async deleteCard(id: number): Promise<void> {
    await db.delete(cards).where(eq(cards.id, id));
  }

  async getMaxSortOrder(displayCaseId: number): Promise<number> {
    const caseCards = await db
      .select()
      .from(cards)
      .where(eq(cards.displayCaseId, displayCaseId));

    if (caseCards.length === 0) {
      return 0;
    }

    return Math.max(...caseCards.map((c) => c.sortOrder));
  }

  async reorderCards(displayCaseId: number, cardIds: number[]): Promise<void> {
    for (let i = 0; i < cardIds.length; i++) {
      await db
        .update(cards)
        .set({ sortOrder: i })
        .where(eq(cards.id, cardIds[i]));
    }
  }

  async searchCards(
    userId: string,
    filters: { query?: string; set?: string; year?: number; grade?: string }
  ): Promise<(Card & { displayCaseName: string; displayCaseId: number })[]> {
    const userCases = await db
      .select({ id: displayCases.id, name: displayCases.name })
      .from(displayCases)
      .where(eq(displayCases.userId, userId));

    if (userCases.length === 0) {
      return [];
    }

    const caseIds = userCases.map((c) => c.id);
    const caseNameMap = new Map(userCases.map((c) => [c.id, c.name]));

    let allCards = await db
      .select()
      .from(cards)
      .where(inArray(cards.displayCaseId, caseIds));

    if (filters.query) {
      const q = filters.query.toLowerCase();
      allCards = allCards.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.set && c.set.toLowerCase().includes(q))
      );
    }

    if (filters.set) {
      allCards = allCards.filter(
        (c) => c.set && c.set.toLowerCase().includes(filters.set!.toLowerCase())
      );
    }

    if (filters.year) {
      allCards = allCards.filter((c) => c.year === filters.year);
    }

    if (filters.grade) {
      allCards = allCards.filter(
        (c) => c.grade && c.grade.toLowerCase().includes(filters.grade!.toLowerCase())
      );
    }

    return allCards.map((c) => ({
      ...c,
      displayCaseName: caseNameMap.get(c.displayCaseId) || "",
      displayCaseId: c.displayCaseId,
    }));
  }

  // Comment operations
  async getComments(displayCaseId: number): Promise<CommentWithUser[]> {
    const commentsData = await db
      .select()
      .from(comments)
      .where(eq(comments.displayCaseId, displayCaseId))
      .orderBy(desc(comments.createdAt));

    const commentsWithUsers: CommentWithUser[] = [];
    for (const comment of commentsData) {
      const [user] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(eq(users.id, comment.userId));

      commentsWithUsers.push({
        ...comment,
        user: user || { id: comment.userId, firstName: null, lastName: null, profileImageUrl: null },
      });
    }

    return commentsWithUsers;
  }

  async createComment(displayCaseId: number, userId: string, content: string): Promise<Comment> {
    const [comment] = await db
      .insert(comments)
      .values({
        displayCaseId,
        userId,
        content,
      })
      .returning();
    return comment;
  }

  async deleteComment(id: number, userId: string): Promise<void> {
    await db
      .delete(comments)
      .where(and(eq(comments.id, id), eq(comments.userId, userId)));
  }

  // Like operations
  async getLikeCount(displayCaseId: number): Promise<number> {
    const likesList = await db
      .select()
      .from(likes)
      .where(eq(likes.displayCaseId, displayCaseId));
    return likesList.length;
  }

  async hasUserLiked(displayCaseId: number, userId: string): Promise<boolean> {
    const [like] = await db
      .select()
      .from(likes)
      .where(and(eq(likes.displayCaseId, displayCaseId), eq(likes.userId, userId)));
    return !!like;
  }

  async toggleLike(displayCaseId: number, userId: string): Promise<boolean> {
    const hasLiked = await this.hasUserLiked(displayCaseId, userId);

    if (hasLiked) {
      await db
        .delete(likes)
        .where(and(eq(likes.displayCaseId, displayCaseId), eq(likes.userId, userId)));
      return false;
    } else {
      await db
        .insert(likes)
        .values({ displayCaseId, userId });
      return true;
    }
  }

  // Public discovery operations
  private async enrichPublicCases(cases: any[]): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number })[]> {
    const enrichedCases: (DisplayCaseWithCards & { ownerName: string; likeCount: number })[] = [];

    for (const c of cases) {
      const caseCards = await db
        .select()
        .from(cards)
        .where(eq(cards.displayCaseId, c.id))
        .orderBy(asc(cards.sortOrder));

      const [owner] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, c.userId));

      const likeCount = await this.getLikeCount(c.id);

      const ownerName = owner
        ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous"
        : "Anonymous";

      enrichedCases.push({
        ...c,
        cards: caseCards,
        ownerName,
        likeCount,
      });
    }

    return enrichedCases;
  }

  async getRecentPublicDisplayCases(limit: number = 20): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number })[]> {
    const cases = await db
      .select()
      .from(displayCases)
      .where(eq(displayCases.isPublic, true))
      .orderBy(desc(displayCases.createdAt))
      .limit(limit);

    return this.enrichPublicCases(cases);
  }

  async searchPublicDisplayCases(query: string, limit: number = 20): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number })[]> {
    const searchPattern = `%${query}%`;
    const cases = await db
      .select()
      .from(displayCases)
      .where(
        and(
          eq(displayCases.isPublic, true),
          or(
            ilike(displayCases.name, searchPattern),
            ilike(displayCases.description, searchPattern)
          )
        )
      )
      .orderBy(desc(displayCases.createdAt))
      .limit(limit);

    return this.enrichPublicCases(cases);
  }

  async getPopularPublicDisplayCases(limit: number = 20): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number })[]> {
    const publicCases = await db
      .select()
      .from(displayCases)
      .where(eq(displayCases.isPublic, true));

    const casesWithLikes = await Promise.all(
      publicCases.map(async (c) => ({
        ...c,
        likeCount: await this.getLikeCount(c.id),
      }))
    );

    casesWithLikes.sort((a, b) => b.likeCount - a.likeCount);

    const topCases = casesWithLikes.slice(0, limit);

    const enrichedCases: (DisplayCaseWithCards & { ownerName: string; likeCount: number })[] = [];

    for (const c of topCases) {
      const caseCards = await db
        .select()
        .from(cards)
        .where(eq(cards.displayCaseId, c.id))
        .orderBy(asc(cards.sortOrder));

      const [owner] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, c.userId));

      const ownerName = owner
        ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous"
        : "Anonymous";

      enrichedCases.push({
        ...c,
        cards: caseCards,
        ownerName,
        likeCount: c.likeCount,
      });
    }

    return enrichedCases;
  }

  // Admin operations
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllDisplayCases(): Promise<(DisplayCaseWithCards & { ownerName: string })[]> {
    const allCases = await db
      .select()
      .from(displayCases)
      .orderBy(desc(displayCases.createdAt));

    const enrichedCases: (DisplayCaseWithCards & { ownerName: string })[] = [];

    for (const c of allCases) {
      const caseCards = await db
        .select()
        .from(cards)
        .where(eq(cards.displayCaseId, c.id))
        .orderBy(asc(cards.sortOrder));

      const [owner] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, c.userId));

      const ownerName = owner
        ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous"
        : "Anonymous";

      enrichedCases.push({
        ...c,
        cards: caseCards,
        ownerName,
      });
    }

    return enrichedCases;
  }

  async getPlatformStats(): Promise<{ totalUsers: number; totalDisplayCases: number; totalCards: number; proUsers: number }> {
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [caseCount] = await db.select({ count: sql<number>`count(*)::int` }).from(displayCases);
    const [cardCount] = await db.select({ count: sql<number>`count(*)::int` }).from(cards);
    const [proCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.subscriptionStatus, "PRO"));

    return {
      totalUsers: userCount?.count || 0,
      totalDisplayCases: caseCount?.count || 0,
      totalCards: cardCount?.count || 0,
      proUsers: proCount?.count || 0,
    };
  }

  async isUserAdmin(userId: string): Promise<boolean> {
    const [user] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
    return user?.isAdmin || false;
  }
}

export const storage = new DatabaseStorage();
