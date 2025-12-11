import {
  users,
  displayCases,
  cards,
  comments,
  likes,
  bookmarks,
  offers,
  notifications,
  badges,
  userBadges,
  tradeOffers,
  follows,
  conversations,
  messages,
  promoCodes,
  promoCodeRedemptions,
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
  type Bookmark,
  type BookmarkWithCard,
  type Offer,
  type InsertOffer,
  type OfferWithUsers,
  type Notification,
  type Badge,
  type UserBadge,
  type UserBadgeWithBadge,
  type TradeOffer,
  type TradeOfferWithDetails,
  type Follow,
  type Conversation,
  type ConversationWithDetails,
  type Message,
  type MessageWithSender,
  type PromoCode,
  type PromoCodeRedemption,
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
  getAllUserCards(userId: string): Promise<(Card & { displayCaseName: string })[]>;
  getTopValuedCards(userId: string, limit?: number): Promise<Card[]>;
  getCardsByTag(userId: string, tag: string): Promise<Card[]>;
  getUserTags(userId: string): Promise<string[]>;
  findDuplicateCards(userId: string, title: string, excludeId?: number): Promise<Card[]>;
  createCard(displayCaseId: number, data: InsertCard): Promise<Card>;
  copyCardsToDisplayCase(cardIds: number[], targetDisplayCaseId: number): Promise<Card[]>;
  updateCard(id: number, data: Partial<InsertCard>): Promise<Card | undefined>;
  updateCardOutlook(id: number, data: {
    outlookAction: string;
    outlookUpsideScore: number;
    outlookRiskScore: number;
    outlookConfidenceScore: number;
    outlookExplanationShort: string;
    outlookExplanationLong: string;
    outlookGeneratedAt: Date;
  }): Promise<Card | undefined>;
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
  getTrendingDisplayCases(limit?: number): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number; trendingScore: number })[]>;

  // Admin operations
  getAllUsers(): Promise<User[]>;
  getAllDisplayCases(): Promise<(DisplayCaseWithCards & { ownerName: string })[]>;
  getPlatformStats(): Promise<{ totalUsers: number; totalDisplayCases: number; totalCards: number; proUsers: number }>;
  isUserAdmin(userId: string): Promise<boolean>;

  // View tracking
  incrementViewCount(displayCaseId: number): Promise<void>;

  // Analytics operations
  getPortfolioAnalytics(userId: string): Promise<{
    totalValue: number;
    totalCards: number;
    totalCases: number;
    topCards: Card[];
    valueByCase: { caseName: string; totalValue: number; cardCount: number }[];
    recentValueChanges: (Card & { displayCaseName: string })[];
  }>;

  // Duplicate detection
  findSimilarCards(userId: string, title: string, excludeCardId?: number): Promise<Card[]>;

  // Bookmark operations
  getBookmarks(userId: string): Promise<BookmarkWithCard[]>;
  addBookmark(userId: string, cardId: number): Promise<Bookmark>;
  removeBookmark(userId: string, cardId: number): Promise<void>;
  hasUserBookmarked(userId: string, cardId: number): Promise<boolean>;
  getCardBookmarkCount(cardId: number): Promise<number>;

  // Offer operations
  getReceivedOffers(userId: string): Promise<OfferWithUsers[]>;
  getSentOffers(userId: string): Promise<OfferWithUsers[]>;
  createOffer(fromUserId: string, toUserId: string, data: InsertOffer): Promise<Offer>;
  updateOfferStatus(offerId: number, status: string): Promise<Offer | undefined>;
  getOffer(id: number): Promise<Offer | undefined>;

  // Notification operations
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(userId: string, type: string, data: any): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // Badge and Prestige operations
  getAllBadges(): Promise<Badge[]>;
  getBadge(id: string): Promise<Badge | undefined>;
  getUserBadges(userId: string): Promise<UserBadgeWithBadge[]>;
  hasUserBadge(userId: string, badgeId: string): Promise<boolean>;
  awardBadge(userId: string, badgeId: string): Promise<UserBadge>;
  updateUserScore(userId: string, score: number, tier: string): Promise<User | undefined>;
  getUserPrestigeStats(userId: string): Promise<{ score: number; tier: string; badgeCount: number }>;

  // Trade offer operations
  createTradeOffer(fromUserId: string, toUserId: string, offeredCardIds: number[], requestedCardIds: number[], cashAdjustment: number, message?: string): Promise<TradeOffer>;
  getTradeOffer(id: number): Promise<TradeOffer | undefined>;
  getReceivedTradeOffers(userId: string): Promise<TradeOfferWithDetails[]>;
  getSentTradeOffers(userId: string): Promise<TradeOfferWithDetails[]>;
  updateTradeOfferStatus(id: number, status: string): Promise<TradeOffer | undefined>;

  // Follow operations
  followUser(followerId: string, followedId: string): Promise<Follow>;
  unfollowUser(followerId: string, followedId: string): Promise<void>;
  isFollowing(followerId: string, followedId: string): Promise<boolean>;
  getFollowers(userId: string): Promise<(Follow & { follower: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'> })[]>;
  getFollowing(userId: string): Promise<(Follow & { followed: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'> })[]>;
  getFollowerCount(userId: string): Promise<number>;
  getFollowingCount(userId: string): Promise<number>;

  // Messaging operations
  getOrCreateConversation(participantAId: string, participantBId: string): Promise<Conversation>;
  getConversation(id: number, userId: string): Promise<Conversation | undefined>;
  getUserConversations(userId: string): Promise<ConversationWithDetails[]>;
  getConversationMessages(conversationId: number, limit?: number): Promise<MessageWithSender[]>;
  createMessage(conversationId: number, senderId: string, content: string): Promise<Message>;
  markMessagesAsRead(conversationId: number, userId: string): Promise<void>;
  getUnreadMessageCount(userId: string): Promise<number>;

  // Promo code operations
  getPromoCode(code: string): Promise<PromoCode | undefined>;
  createPromoCode(code: string, maxUses: number, description?: string, expiresAt?: Date): Promise<PromoCode>;
  redeemPromoCode(code: string, userId: string): Promise<{ success: boolean; message: string }>;
  hasUserRedeemedPromoCode(userId: string, promoCodeId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Admin emails that should automatically get admin access
    const ADMIN_EMAILS = ['jordanlinford@gmail.com'];
    
    const isAdminEmail = userData.email && ADMIN_EMAILS.includes(userData.email.toLowerCase());
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        isAdmin: isAdminEmail ? true : false,
        subscriptionStatus: isAdminEmail ? 'PRO' : 'FREE',
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
          // Always ensure admin emails have admin access
          ...(isAdminEmail ? { isAdmin: true, subscriptionStatus: 'PRO' } : {}),
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

  async getAllUserCards(userId: string): Promise<(Card & { displayCaseName: string })[]> {
    const userCases = await db.select({ id: displayCases.id, name: displayCases.name })
      .from(displayCases)
      .where(eq(displayCases.userId, userId));
    
    if (userCases.length === 0) return [];
    
    const caseIds = userCases.map(c => c.id);
    const caseNameMap = new Map(userCases.map(c => [c.id, c.name]));
    
    const allCards = await db.select()
      .from(cards)
      .where(inArray(cards.displayCaseId, caseIds))
      .orderBy(asc(cards.displayCaseId), asc(cards.sortOrder));
    
    return allCards.map(card => ({
      ...card,
      displayCaseName: caseNameMap.get(card.displayCaseId) || 'Unknown'
    }));
  }

  async getTopValuedCards(userId: string, limit: number = 12): Promise<Card[]> {
    const userCases = await db.select({ id: displayCases.id })
      .from(displayCases)
      .where(eq(displayCases.userId, userId));
    
    if (userCases.length === 0) return [];
    
    const caseIds = userCases.map(c => c.id);
    
    const topCards = await db.select()
      .from(cards)
      .where(
        and(
          inArray(cards.displayCaseId, caseIds),
          sql`${cards.estimatedValue} IS NOT NULL AND ${cards.estimatedValue} > 0`
        )
      )
      .orderBy(desc(cards.estimatedValue))
      .limit(limit);
    
    return topCards;
  }

  async getCardsByTag(userId: string, tag: string): Promise<Card[]> {
    const userCases = await db.select({ id: displayCases.id })
      .from(displayCases)
      .where(eq(displayCases.userId, userId));
    
    if (userCases.length === 0) return [];
    
    const caseIds = userCases.map(c => c.id);
    
    // Find cards where the tags array contains the specified tag
    const taggedCards = await db.select()
      .from(cards)
      .where(
        and(
          inArray(cards.displayCaseId, caseIds),
          sql`${tag} = ANY(${cards.tags})`
        )
      )
      .orderBy(asc(cards.sortOrder));
    
    return taggedCards;
  }

  async getUserTags(userId: string): Promise<string[]> {
    const userCases = await db.select({ id: displayCases.id })
      .from(displayCases)
      .where(eq(displayCases.userId, userId));
    
    if (userCases.length === 0) return [];
    
    const caseIds = userCases.map(c => c.id);
    
    // Get all cards with tags and extract unique tags
    const cardsWithTags = await db.select({ tags: cards.tags })
      .from(cards)
      .where(
        and(
          inArray(cards.displayCaseId, caseIds),
          sql`${cards.tags} IS NOT NULL AND array_length(${cards.tags}, 1) > 0`
        )
      );
    
    const tagSet = new Set<string>();
    for (const card of cardsWithTags) {
      if (card.tags) {
        for (const tag of card.tags) {
          tagSet.add(tag);
        }
      }
    }
    
    return Array.from(tagSet).sort();
  }

  async findDuplicateCards(userId: string, title: string, excludeId?: number): Promise<Card[]> {
    const userCases = await db.select({ id: displayCases.id })
      .from(displayCases)
      .where(eq(displayCases.userId, userId));
    
    if (userCases.length === 0) return [];
    
    const caseIds = userCases.map(c => c.id);
    
    // Find cards with similar titles (case-insensitive partial match)
    const conditions = [
      inArray(cards.displayCaseId, caseIds),
      ilike(cards.title, `%${title}%`)
    ];
    
    if (excludeId) {
      conditions.push(sql`${cards.id} != ${excludeId}`);
    }
    
    const duplicates = await db.select()
      .from(cards)
      .where(and(...conditions))
      .limit(5);
    
    return duplicates;
  }

  async copyCardsToDisplayCase(cardIds: number[], targetDisplayCaseId: number): Promise<Card[]> {
    if (cardIds.length === 0) return [];
    
    const sourcCards = await db.select()
      .from(cards)
      .where(inArray(cards.id, cardIds));
    
    const maxSortOrder = await this.getMaxSortOrder(targetDisplayCaseId);
    
    const newCards: Card[] = [];
    for (let i = 0; i < sourcCards.length; i++) {
      const sourceCard = sourcCards[i];
      const [newCard] = await db
        .insert(cards)
        .values({
          displayCaseId: targetDisplayCaseId,
          title: sourceCard.title,
          imagePath: sourceCard.imagePath,
          set: sourceCard.set,
          year: sourceCard.year,
          variation: sourceCard.variation,
          grade: sourceCard.grade,
          purchasePrice: sourceCard.purchasePrice,
          estimatedValue: sourceCard.estimatedValue,
          previousValue: sourceCard.previousValue,
          valueUpdatedAt: sourceCard.valueUpdatedAt,
          notes: sourceCard.notes,
          tags: sourceCard.tags,
          sortOrder: maxSortOrder + i + 1,
        })
        .returning();
      newCards.push(newCard);
    }
    
    return newCards;
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
    // If estimatedValue is being updated, track the previous value
    let updateData: any = { ...data };
    
    if ('estimatedValue' in data) {
      const [existingCard] = await db.select().from(cards).where(eq(cards.id, id));
      if (existingCard) {
        const newValue = data.estimatedValue;
        const oldValue = existingCard.estimatedValue;
        
        // Only track change if both values exist and are different
        if (oldValue !== null && newValue !== null && oldValue !== newValue && oldValue > 0) {
          updateData.previousValue = oldValue;
          updateData.valueUpdatedAt = new Date();
        } else if (newValue === null || newValue === oldValue) {
          // Clear previous value tracking if value is removed or unchanged
          updateData.previousValue = null;
          updateData.valueUpdatedAt = null;
        }
      }
    }
    
    const [card] = await db
      .update(cards)
      .set(updateData)
      .where(eq(cards.id, id))
      .returning();
    return card;
  }

  async updateCardOutlook(id: number, data: {
    outlookAction: string;
    outlookUpsideScore: number;
    outlookRiskScore: number;
    outlookConfidenceScore: number;
    outlookExplanationShort: string;
    outlookExplanationLong: string;
    outlookGeneratedAt: Date;
  }): Promise<Card | undefined> {
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

  async getTrendingDisplayCases(limit: number = 20): Promise<(DisplayCaseWithCards & { ownerName: string; likeCount: number; trendingScore: number })[]> {
    const publicCases = await db
      .select()
      .from(displayCases)
      .where(eq(displayCases.isPublic, true));

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const casesWithScores = await Promise.all(
      publicCases.map(async (c) => {
        const likeCount = await this.getLikeCount(c.id);
        const commentCount = await this.getCommentCount(c.id);
        
        const ageInDays = c.createdAt ? (now - new Date(c.createdAt).getTime()) / ONE_DAY : 30;
        const recencyBoost = Math.max(0, 30 - ageInDays) * 2;
        
        const trendingScore = 
          (likeCount * 10) + 
          (c.viewCount * 1) + 
          (commentCount * 5) + 
          recencyBoost;

        return {
          ...c,
          likeCount,
          trendingScore,
        };
      })
    );

    casesWithScores.sort((a, b) => b.trendingScore - a.trendingScore);

    const topCases = casesWithScores.slice(0, limit);

    const enrichedCases: (DisplayCaseWithCards & { ownerName: string; likeCount: number; trendingScore: number })[] = [];

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
        trendingScore: c.trendingScore,
      });
    }

    return enrichedCases;
  }

  private async getCommentCount(displayCaseId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(eq(comments.displayCaseId, displayCaseId));
    return result[0]?.count ?? 0;
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

  async incrementViewCount(displayCaseId: number): Promise<void> {
    await db
      .update(displayCases)
      .set({ viewCount: sql`${displayCases.viewCount} + 1` })
      .where(eq(displayCases.id, displayCaseId));
  }

  async getPortfolioAnalytics(userId: string): Promise<{
    totalValue: number;
    totalCards: number;
    totalCases: number;
    topCards: Card[];
    valueByCase: { caseName: string; totalValue: number; cardCount: number }[];
    recentValueChanges: (Card & { displayCaseName: string })[];
  }> {
    // Get user's display cases
    const userCases = await db
      .select()
      .from(displayCases)
      .where(eq(displayCases.userId, userId));

    const caseIds = userCases.map(c => c.id);
    
    if (caseIds.length === 0) {
      return {
        totalValue: 0,
        totalCards: 0,
        totalCases: 0,
        topCards: [],
        valueByCase: [],
        recentValueChanges: [],
      };
    }

    // Get all user cards
    const allCards = await db
      .select()
      .from(cards)
      .where(inArray(cards.displayCaseId, caseIds));

    // Calculate totals
    const totalValue = allCards.reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
    const totalCards = allCards.length;
    const totalCases = userCases.length;

    // Get top 10 cards by value
    const topCards = [...allCards]
      .filter(c => c.estimatedValue && c.estimatedValue > 0)
      .sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0))
      .slice(0, 10);

    // Calculate value by case
    const valueByCase = userCases.map(c => {
      const caseCards = allCards.filter(card => card.displayCaseId === c.id);
      return {
        caseName: c.name,
        totalValue: caseCards.reduce((sum, card) => sum + (card.estimatedValue || 0), 0),
        cardCount: caseCards.length,
      };
    }).filter(c => c.cardCount > 0);

    // Get cards with recent value changes (has previousValue and valueUpdatedAt)
    const recentValueChanges = allCards
      .filter(c => c.previousValue !== null && c.valueUpdatedAt !== null)
      .sort((a, b) => {
        const aDate = a.valueUpdatedAt ? new Date(a.valueUpdatedAt).getTime() : 0;
        const bDate = b.valueUpdatedAt ? new Date(b.valueUpdatedAt).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 10)
      .map(c => {
        const caseName = userCases.find(uc => uc.id === c.displayCaseId)?.name || "Unknown";
        return { ...c, displayCaseName: caseName };
      });

    return {
      totalValue,
      totalCards,
      totalCases,
      topCards,
      valueByCase,
      recentValueChanges,
    };
  }

  async findSimilarCards(userId: string, title: string, excludeCardId?: number): Promise<Card[]> {
    // Get user's display case IDs first
    const userCases = await db
      .select({ id: displayCases.id })
      .from(displayCases)
      .where(eq(displayCases.userId, userId));

    const caseIds = userCases.map(c => c.id);
    if (caseIds.length === 0) return [];

    // Search for cards with similar titles (case-insensitive partial match)
    const searchPattern = `%${title.toLowerCase()}%`;
    
    let query = db
      .select()
      .from(cards)
      .where(
        and(
          inArray(cards.displayCaseId, caseIds),
          ilike(cards.title, searchPattern)
        )
      );

    const results = await query;
    
    // Exclude the current card if provided
    return excludeCardId 
      ? results.filter(c => c.id !== excludeCardId) 
      : results;
  }

  // Bookmark operations
  async getBookmarks(userId: string): Promise<BookmarkWithCard[]> {
    const userBookmarks = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt));

    const result: BookmarkWithCard[] = [];
    for (const bookmark of userBookmarks) {
      const [card] = await db.select().from(cards).where(eq(cards.id, bookmark.cardId));
      if (card) {
        result.push({ ...bookmark, card });
      }
    }
    return result;
  }

  async addBookmark(userId: string, cardId: number): Promise<Bookmark> {
    const [bookmark] = await db
      .insert(bookmarks)
      .values({ userId, cardId })
      .returning();
    return bookmark;
  }

  async removeBookmark(userId: string, cardId: number): Promise<void> {
    await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.cardId, cardId)));
  }

  async hasUserBookmarked(userId: string, cardId: number): Promise<boolean> {
    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.cardId, cardId)));
    return !!bookmark;
  }

  async getCardBookmarkCount(cardId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(eq(bookmarks.cardId, cardId));
    return Number(result[0]?.count || 0);
  }

  // Offer operations
  async getReceivedOffers(userId: string): Promise<OfferWithUsers[]> {
    const receivedOffers = await db
      .select()
      .from(offers)
      .where(eq(offers.toUserId, userId))
      .orderBy(desc(offers.createdAt));

    const result: OfferWithUsers[] = [];
    for (const offer of receivedOffers) {
      const [fromUser] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, offer.fromUserId));
      const [card] = await db.select().from(cards).where(eq(cards.id, offer.cardId));
      if (fromUser && card) {
        result.push({ ...offer, fromUser, card });
      }
    }
    return result;
  }

  async getSentOffers(userId: string): Promise<OfferWithUsers[]> {
    const sentOffers = await db
      .select()
      .from(offers)
      .where(eq(offers.fromUserId, userId))
      .orderBy(desc(offers.createdAt));

    const result: OfferWithUsers[] = [];
    for (const offer of sentOffers) {
      const [fromUser] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, offer.fromUserId));
      const [card] = await db.select().from(cards).where(eq(cards.id, offer.cardId));
      if (fromUser && card) {
        result.push({ ...offer, fromUser, card });
      }
    }
    return result;
  }

  async createOffer(fromUserId: string, toUserId: string, data: InsertOffer): Promise<Offer> {
    const [offer] = await db
      .insert(offers)
      .values({
        ...data,
        fromUserId,
        toUserId,
        status: "pending",
      })
      .returning();
    return offer;
  }

  async updateOfferStatus(offerId: number, status: string): Promise<Offer | undefined> {
    const [offer] = await db
      .update(offers)
      .set({ status, updatedAt: new Date() })
      .where(eq(offers.id, offerId))
      .returning();
    return offer;
  }

  async getOffer(id: number): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.id, id));
    return offer;
  }

  // Notification operations
  async getNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(result[0]?.count || 0);
  }

  async createNotification(userId: string, type: string, data: any): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values({ userId, type, data })
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: number): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  // Badge and Prestige operations
  async getAllBadges(): Promise<Badge[]> {
    return await db
      .select()
      .from(badges)
      .where(eq(badges.isActive, true))
      .orderBy(badges.category, badges.name);
  }

  async getBadge(id: string): Promise<Badge | undefined> {
    const [badge] = await db.select().from(badges).where(eq(badges.id, id));
    return badge;
  }

  async getUserBadges(userId: string): Promise<UserBadgeWithBadge[]> {
    const userBadgeRows = await db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.earnedAt));
    
    const result: UserBadgeWithBadge[] = [];
    for (const ub of userBadgeRows) {
      const [badge] = await db.select().from(badges).where(eq(badges.id, ub.badgeId));
      if (badge) {
        result.push({ ...ub, badge });
      }
    }
    return result;
  }

  async hasUserBadge(userId: string, badgeId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(userBadges)
      .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)));
    return !!existing;
  }

  async awardBadge(userId: string, badgeId: string): Promise<UserBadge> {
    const [userBadge] = await db
      .insert(userBadges)
      .values({ userId, badgeId })
      .onConflictDoNothing({ target: [userBadges.userId, userBadges.badgeId] })
      .returning();
    
    if (!userBadge) {
      const [existing] = await db
        .select()
        .from(userBadges)
        .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)));
      return existing;
    }
    return userBadge;
  }

  async updateUserScore(userId: string, score: number, tier: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ collectorScore: score, collectorTier: tier, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserPrestigeStats(userId: string): Promise<{ score: number; tier: string; badgeCount: number }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return { score: 0, tier: "bronze", badgeCount: 0 };
    }
    
    const badgeResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userBadges)
      .where(eq(userBadges.userId, userId));
    
    return {
      score: user.collectorScore,
      tier: user.collectorTier,
      badgeCount: Number(badgeResult[0]?.count || 0),
    };
  }

  // Trade offer operations
  async createTradeOffer(fromUserId: string, toUserId: string, offeredCardIds: number[], requestedCardIds: number[], cashAdjustment: number, message?: string): Promise<TradeOffer> {
    const [tradeOffer] = await db
      .insert(tradeOffers)
      .values({
        fromUserId,
        toUserId,
        offeredCardIds,
        requestedCardIds,
        cashAdjustment,
        message,
      })
      .returning();
    return tradeOffer;
  }

  async getTradeOffer(id: number): Promise<TradeOffer | undefined> {
    const [tradeOffer] = await db.select().from(tradeOffers).where(eq(tradeOffers.id, id));
    return tradeOffer;
  }

  async getReceivedTradeOffers(userId: string): Promise<TradeOfferWithDetails[]> {
    const tradeOfferRows = await db
      .select()
      .from(tradeOffers)
      .where(eq(tradeOffers.toUserId, userId))
      .orderBy(desc(tradeOffers.createdAt));
    
    return this.enrichTradeOffers(tradeOfferRows);
  }

  async getSentTradeOffers(userId: string): Promise<TradeOfferWithDetails[]> {
    const tradeOfferRows = await db
      .select()
      .from(tradeOffers)
      .where(eq(tradeOffers.fromUserId, userId))
      .orderBy(desc(tradeOffers.createdAt));
    
    return this.enrichTradeOffers(tradeOfferRows);
  }

  private async enrichTradeOffers(tradeOfferRows: TradeOffer[]): Promise<TradeOfferWithDetails[]> {
    const result: TradeOfferWithDetails[] = [];
    
    for (const trade of tradeOfferRows) {
      const [fromUser] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, trade.fromUserId));
      
      const [toUser] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, trade.toUserId));
      
      const offeredCards = trade.offeredCardIds.length > 0 
        ? await db.select().from(cards).where(inArray(cards.id, trade.offeredCardIds))
        : [];
      
      const requestedCards = trade.requestedCardIds.length > 0
        ? await db.select().from(cards).where(inArray(cards.id, trade.requestedCardIds))
        : [];
      
      result.push({
        ...trade,
        fromUser: fromUser || { id: '', firstName: null, lastName: null, profileImageUrl: null },
        toUser: toUser || { id: '', firstName: null, lastName: null, profileImageUrl: null },
        offeredCards,
        requestedCards,
      });
    }
    
    return result;
  }

  async updateTradeOfferStatus(id: number, status: string): Promise<TradeOffer | undefined> {
    const [tradeOffer] = await db
      .update(tradeOffers)
      .set({ status, updatedAt: new Date() })
      .where(eq(tradeOffers.id, id))
      .returning();
    return tradeOffer;
  }

  // Follow operations
  async followUser(followerId: string, followedId: string): Promise<Follow> {
    const [follow] = await db
      .insert(follows)
      .values({ followerId, followedId })
      .onConflictDoNothing({ target: [follows.followerId, follows.followedId] })
      .returning();
    
    if (!follow) {
      const [existing] = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, followerId), eq(follows.followedId, followedId)));
      return existing;
    }
    return follow;
  }

  async unfollowUser(followerId: string, followedId: string): Promise<void> {
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followedId, followedId)));
  }

  async isFollowing(followerId: string, followedId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followedId, followedId)));
    return !!existing;
  }

  async getFollowers(userId: string): Promise<(Follow & { follower: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'> })[]> {
    const followRows = await db
      .select()
      .from(follows)
      .where(eq(follows.followedId, userId))
      .orderBy(desc(follows.createdAt));
    
    const result = [];
    for (const follow of followRows) {
      const [follower] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, follow.followerId));
      
      if (follower) {
        result.push({ ...follow, follower });
      }
    }
    return result;
  }

  async getFollowing(userId: string): Promise<(Follow & { followed: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'> })[]> {
    const followRows = await db
      .select()
      .from(follows)
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt));
    
    const result = [];
    for (const follow of followRows) {
      const [followed] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, follow.followedId));
      
      if (followed) {
        result.push({ ...follow, followed });
      }
    }
    return result;
  }

  async getFollowerCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followedId, userId));
    return Number(result[0]?.count || 0);
  }

  async getFollowingCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId));
    return Number(result[0]?.count || 0);
  }

  // Messaging operations
  async getOrCreateConversation(participantAId: string, participantBId: string): Promise<Conversation> {
    // Always store with smaller ID first to ensure uniqueness
    const [smallerId, largerId] = [participantAId, participantBId].sort();
    
    // Check if conversation already exists
    const existing = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.participantAId, smallerId),
          eq(conversations.participantBId, largerId)
        )
      );
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    // Create new conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        participantAId: smallerId,
        participantBId: largerId,
      })
      .returning();
    
    return conversation;
  }

  async getConversation(id: number, userId: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, id),
          or(
            eq(conversations.participantAId, userId),
            eq(conversations.participantBId, userId)
          )
        )
      );
    return conversation;
  }

  async getUserConversations(userId: string): Promise<ConversationWithDetails[]> {
    const convos = await db
      .select()
      .from(conversations)
      .where(
        or(
          eq(conversations.participantAId, userId),
          eq(conversations.participantBId, userId)
        )
      )
      .orderBy(desc(conversations.lastMessageAt));
    
    const result: ConversationWithDetails[] = [];
    
    for (const convo of convos) {
      // Get the other user's info
      const otherUserId = convo.participantAId === userId ? convo.participantBId : convo.participantAId;
      const [otherUser] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(eq(users.id, otherUserId));
      
      // Count unread messages in this conversation
      const unreadResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, convo.id),
            eq(messages.isRead, false),
            sql`${messages.senderId} != ${userId}`
          )
        );
      
      if (otherUser) {
        result.push({
          ...convo,
          otherUser,
          unreadCount: Number(unreadResult[0]?.count || 0),
        });
      }
    }
    
    return result;
  }

  async getConversationMessages(conversationId: number, limit: number = 50): Promise<MessageWithSender[]> {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(limit);
    
    const result: MessageWithSender[] = [];
    
    for (const msg of msgs) {
      const [sender] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(eq(users.id, msg.senderId));
      
      if (sender) {
        result.push({ ...msg, sender });
      }
    }
    
    return result;
  }

  async createMessage(conversationId: number, senderId: string, content: string): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId,
        content,
      })
      .returning();
    
    // Update conversation's last message info
    await db
      .update(conversations)
      .set({
        lastMessageAt: new Date(),
        lastMessagePreview: content.substring(0, 100),
      })
      .where(eq(conversations.id, conversationId));
    
    return message;
  }

  async markMessagesAsRead(conversationId: number, userId: string): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          sql`${messages.senderId} != ${userId}`,
          eq(messages.isRead, false)
        )
      );
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    // First get all conversations the user is part of
    const convos = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        or(
          eq(conversations.participantAId, userId),
          eq(conversations.participantBId, userId)
        )
      );
    
    if (convos.length === 0) {
      return 0;
    }
    
    const convoIds = convos.map(c => c.id);
    
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          inArray(messages.conversationId, convoIds),
          eq(messages.isRead, false),
          sql`${messages.senderId} != ${userId}`
        )
      );
    
    return Number(result[0]?.count || 0);
  }

  // Promo code operations
  async getPromoCode(code: string): Promise<PromoCode | undefined> {
    const [promoCode] = await db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.code, code.toUpperCase()));
    return promoCode;
  }

  async createPromoCode(code: string, maxUses: number, description?: string, expiresAt?: Date): Promise<PromoCode> {
    const [promoCode] = await db
      .insert(promoCodes)
      .values({
        code: code.toUpperCase(),
        maxUses,
        description: description || null,
        expiresAt: expiresAt || null,
      })
      .returning();
    return promoCode;
  }

  async hasUserRedeemedPromoCode(userId: string, promoCodeId: number): Promise<boolean> {
    const [redemption] = await db
      .select()
      .from(promoCodeRedemptions)
      .where(
        and(
          eq(promoCodeRedemptions.userId, userId),
          eq(promoCodeRedemptions.promoCodeId, promoCodeId)
        )
      );
    return !!redemption;
  }

  async redeemPromoCode(code: string, userId: string): Promise<{ success: boolean; message: string }> {
    const promoCode = await this.getPromoCode(code);
    
    if (!promoCode) {
      return { success: false, message: "Invalid promo code" };
    }

    if (!promoCode.isActive) {
      return { success: false, message: "This promo code is no longer active" };
    }

    if (promoCode.expiresAt && new Date() > promoCode.expiresAt) {
      return { success: false, message: "This promo code has expired" };
    }

    if (promoCode.usedCount >= promoCode.maxUses) {
      return { success: false, message: "This promo code has reached its maximum uses" };
    }

    // Check if user already redeemed this code
    const alreadyRedeemed = await this.hasUserRedeemedPromoCode(userId, promoCode.id);
    if (alreadyRedeemed) {
      return { success: false, message: "You have already used this promo code" };
    }

    // Check if user already has PRO
    const user = await this.getUser(userId);
    if (user?.subscriptionStatus === 'PRO') {
      return { success: false, message: "You already have a Pro subscription" };
    }

    // Redeem the code - update user to PRO and track redemption
    await db.transaction(async (tx) => {
      // Update user subscription status
      await tx
        .update(users)
        .set({ subscriptionStatus: 'PRO' })
        .where(eq(users.id, userId));

      // Track redemption
      await tx
        .insert(promoCodeRedemptions)
        .values({
          promoCodeId: promoCode.id,
          userId,
        });

      // Increment used count
      await tx
        .update(promoCodes)
        .set({ usedCount: promoCode.usedCount + 1 })
        .where(eq(promoCodes.id, promoCode.id));
    });

    return { success: true, message: "Promo code redeemed! You now have Pro access." };
  }
}

export const storage = new DatabaseStorage();
