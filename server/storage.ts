import {
  users,
  displayCases,
  cards,
  type User,
  type UpsertUser,
  type DisplayCase,
  type InsertDisplayCase,
  type Card,
  type InsertCard,
  type DisplayCaseWithCards,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, ilike, inArray } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
