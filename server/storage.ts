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
  priceAlerts,
  priceHistory,
  userAlertSettings,
  cardOutlooks,
  outlookUsage,
  playerWatchlist,
  playerOutlookCache,
  sharedSnapshots,
  watchlist,
  breakEvents,
  splitInstances,
  seats,
  splitWebhookEvents,
  blogPosts,
  supportTickets,
  supportTicketMessages,
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
  type PriceAlert,
  type PriceAlertWithCard,
  type InsertPriceAlert,
  type PriceHistory,
  type UserAlertSettings,
  type InsertUserAlertSettings,
  type CardOutlook,
  type InsertCardOutlook,
  type CardOutlookWithCard,
  type PricePoint,
  type PlayerWatchlist,
  type InsertPlayerWatchlist,
  type PlayerOutlookCache,
  type SharedSnapshot,
  type InsertSharedSnapshot,
  type Watchlist,
  type InsertWatchlist,
  type WatchlistItemType,
  type BreakEvent,
  type InsertBreakEvent,
  type BreakEventWithSplits,
  type SplitInstance,
  type InsertSplitInstance,
  type SplitInstanceWithSeats,
  type SplitInstanceWithBreakEvent,
  type Seat,
  type InsertSeat,
  type SeatWithUser,
  type SeatCounts,
  type SplitStatus,
  type SplitWebhookEvent,
  isValidStatusTransition,
  type BlogPost,
  type InsertBlogPost,
  type BlogPostWithAuthor,
  type SupportTicket,
  type InsertSupportTicket,
  type SupportTicketWithRequester,
  type SupportTicketWithMessages,
  type SupportTicketMessage,
  type InsertSupportTicketMessage,
  type SupportTicketStatus,
  scanHistory,
  type ScanHistory,
  type InsertScanHistory,
  popHistory,
  type PopHistory,
  type InsertPopHistory,
  type PopTrend,
  cardPriceObservations,
  type CardPriceObservation,
  type InsertCardPriceObservation,
  cardMarketSnapshots,
  type CardMarketSnapshot,
  cardInterestEvents,
  type CardInterestEvent,
  type InsertCardInterestEvent,
  type InterestVelocity,
  cardSignals,
  type CardSignal,
  type InsertCardSignal,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, ilike, inArray, sql, isNull } from "drizzle-orm";

// Random handle generator for new users
const adjectives = [
  "Swift", "Golden", "Silver", "Lucky", "Epic", "Rare", "Vintage", "Classic", 
  "Prime", "Elite", "Royal", "Cosmic", "Shiny", "Pristine", "Mint", "Graded",
  "Rookie", "Legend", "Ace", "Pro", "Star", "Ultra", "Super", "Mega", "Neo"
];

const nouns = [
  "Collector", "Trader", "Hunter", "Vault", "Deck", "Stash", "Pack", "Case",
  "Grail", "Card", "Gem", "Diamond", "Pearl", "Crown", "Chest", "Cache",
  "Hoard", "Trove", "Find", "Score", "Pull", "Hit", "Keeper", "Archive"
];

function generateRandomHandle(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)].toLowerCase();
  const noun = nouns[Math.floor(Math.random() * nouns.length)].toLowerCase();
  const number = Math.floor(Math.random() * 9999) + 1;
  return `${adjective}_${noun}_${number}`;
}

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getAdminUsers(): Promise<User[]>;
  upsertUser(user: UpsertUser): Promise<{ user: User; isNewUser: boolean }>;
  updateUserHandle(userId: string, handle: string): Promise<User | undefined>;
  isHandleAvailable(handle: string, excludeUserId?: string): Promise<boolean>;
  updateUserSubscription(userId: string, status: string, stripeCustomerId?: string): Promise<User | undefined>;
  updateUserByStripeCustomerId(stripeCustomerId: string, data: { subscriptionStatus?: string; stripeSubscriptionId?: string | null }): Promise<User | undefined>;
  activateUserTrial(userId: string, trialStart: Date, trialEnd: Date, source: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateGoogleId(userId: string, googleId: string): Promise<User | undefined>;

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
    outlookAction: string | null;
    outlookUpsideScore: number | null;
    outlookRiskScore: number | null;
    outlookConfidenceScore: number | null;
    outlookExplanationShort: string | null;
    outlookExplanationLong: string | null;
    outlookGeneratedAt: Date | null;
  }): Promise<Card | undefined>;
  deleteCard(id: number): Promise<void>;
  getMaxSortOrder(displayCaseId: number): Promise<number>;

  // Card Outlook operations (new intelligence system)
  getCardOutlook(cardId: number): Promise<CardOutlook | undefined>;
  getCardOutlookWithCard(cardId: number): Promise<CardOutlookWithCard | undefined>;
  upsertCardOutlook(cardId: number, data: Partial<InsertCardOutlook>): Promise<CardOutlook>;
  deleteCardOutlook(cardId: number): Promise<void>;
  getExpiredOutlooks(limit?: number): Promise<CardOutlook[]>;
  updateOutlookPricePoints(cardId: number, pricePoints: PricePoint[]): Promise<CardOutlook | undefined>;

  // Comment operations
  getComments(displayCaseId: number): Promise<CommentWithUser[]>;
  createComment(displayCaseId: number, userId: string | null, content: string, guestName?: string): Promise<Comment>;
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

  // Leaderboard operations
  getTopLikedDisplayCases(limit?: number): Promise<{ id: number; name: string; ownerName: string; ownerImage: string | null; likeCount: number; cardCount: number; theme: string }[]>;
  getTopValueDisplayCases(limit?: number): Promise<{ id: number; name: string; ownerName: string; ownerImage: string | null; totalValue: number; cardCount: number; theme: string }[]>;
  getMostViewedDisplayCases(limit?: number): Promise<{ id: number; name: string; ownerName: string; ownerImage: string | null; viewCount: number; cardCount: number; theme: string }[]>;

  // Admin operations
  getAllUsers(): Promise<User[]>;
  getAllDisplayCases(): Promise<(DisplayCaseWithCards & { ownerName: string })[]>;
  getPlatformStats(): Promise<{ totalUsers: number; totalDisplayCases: number; totalCards: number; proUsers: number }>;
  isUserAdmin(userId: string): Promise<boolean>;
  adminDeleteUser(userId: string): Promise<void>;
  adminDeleteDisplayCase(displayCaseId: number): Promise<void>;

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
  getFollowers(userId: string): Promise<(Follow & { follower: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> })[]>;
  getFollowing(userId: string): Promise<(Follow & { followed: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> })[]>;
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

  // Price alert operations
  getPriceAlerts(userId: string): Promise<PriceAlertWithCard[]>;
  getPriceAlert(id: number): Promise<PriceAlert | undefined>;
  getCardPriceAlerts(cardId: number, userId: string): Promise<PriceAlert[]>;
  createPriceAlert(userId: string, data: InsertPriceAlert): Promise<PriceAlert>;
  updatePriceAlert(id: number, data: Partial<InsertPriceAlert>): Promise<PriceAlert | undefined>;
  deletePriceAlert(id: number): Promise<void>;
  countUserPriceAlerts(userId: string): Promise<number>;
  getActiveAlertsForProcessing(): Promise<(PriceAlert & { card: Card; user: User })[]>;
  markAlertTriggered(id: number): Promise<void>;

  // Price history operations
  recordPriceHistory(cardId: number, price: number): Promise<PriceHistory>;
  getCardPriceHistory(cardId: number, days?: number): Promise<PriceHistory[]>;
  getLatestPriceHistory(cardId: number): Promise<PriceHistory | undefined>;

  // User alert settings operations
  getUserAlertSettings(userId: string): Promise<UserAlertSettings | undefined>;
  upsertUserAlertSettings(userId: string, data: InsertUserAlertSettings): Promise<UserAlertSettings>;
  getUsersForWeeklyDigest(): Promise<(UserAlertSettings & { user: User })[]>;
  markDigestSent(userId: string): Promise<void>;

  // Outlook usage tracking (for free tier enforcement)
  countUserMonthlyOutlookGenerations(userId: string): Promise<number>;
  countDailyFreeUserOutlookGenerations(): Promise<number>;
  recordOutlookUsage(userId: string, source: 'collection' | 'quick', cardId?: number, cardTitle?: string): Promise<void>;

  // Player Watchlist operations
  getWatchlist(userId: string, sport?: string): Promise<PlayerWatchlist[]>;
  getWatchlistItem(userId: string, playerKey: string): Promise<PlayerWatchlist | undefined>;
  addToWatchlist(data: InsertPlayerWatchlist): Promise<PlayerWatchlist>;
  removeFromWatchlist(userId: string, playerKey: string): Promise<boolean>;
  updateWatchlistNotes(userId: string, playerKey: string, notes: string | null): Promise<PlayerWatchlist | undefined>;

  // Player Outlook Cache operations
  getCachedPlayerOutlook(playerKey: string): Promise<PlayerOutlookCache | undefined>;
  getPublicPlayerOutlookBySlug(sport: string, slug: string): Promise<PlayerOutlookCache | undefined>;
  getAllPublicPlayerOutlooks(): Promise<PlayerOutlookCache[]>;
  getAllPlayerOutlookCache(): Promise<PlayerOutlookCache[]>;
  updatePlayerOutlookPublicFields(playerKey: string, data: { slug?: string; isPublic?: boolean; seoTitle?: string; seoDescription?: string }): Promise<PlayerOutlookCache | undefined>;

  // Shared Snapshot operations
  createSharedSnapshot(userId: string, data: Omit<InsertSharedSnapshot, 'userId'>): Promise<SharedSnapshot>;
  getSharedSnapshotByToken(token: string): Promise<SharedSnapshot | undefined>;
  incrementSnapshotViewCount(token: string): Promise<void>;
  getUserSharedSnapshots(userId: string): Promise<SharedSnapshot[]>;
  deleteSharedSnapshot(token: string, userId: string): Promise<void>;

  // Unified Watchlist operations (supports both players and cards)
  getUnifiedWatchlist(userId: string, itemType?: WatchlistItemType): Promise<Watchlist[]>;
  getUnifiedWatchlistItem(userId: string, itemType: WatchlistItemType, playerKey?: string, cardId?: number): Promise<Watchlist | undefined>;
  addToUnifiedWatchlist(data: InsertWatchlist): Promise<Watchlist>;
  removeFromUnifiedWatchlist(id: number, userId: string): Promise<boolean>;
  updateUnifiedWatchlistNotes(id: number, userId: string, notes: string | null): Promise<Watchlist | undefined>;
  isInUnifiedWatchlist(userId: string, itemType: WatchlistItemType, playerKey?: string, cardId?: number): Promise<boolean>;

  // =============================================================================
  // PORTFOLIO BUILDER - Box Break Splitting System
  // =============================================================================

  // Break Event operations
  getBreakEvents(activeOnly?: boolean): Promise<BreakEventWithSplits[]>;
  getBreakEvent(id: number): Promise<BreakEventWithSplits | undefined>;
  createBreakEvent(data: InsertBreakEvent): Promise<BreakEvent>;
  updateBreakEvent(id: number, data: Partial<InsertBreakEvent>): Promise<BreakEvent | undefined>;
  deleteBreakEvent(id: number): Promise<void>;

  // Split Instance operations
  getSplitInstance(id: number): Promise<SplitInstanceWithSeats | undefined>;
  getSplitInstanceWithBreakEvent(id: number): Promise<SplitInstanceWithBreakEvent | undefined>;
  createSplitInstance(data: InsertSplitInstance): Promise<SplitInstance>;
  updateSplitInstance(id: number, data: Partial<SplitInstance>): Promise<SplitInstance | undefined>;
  updateSplitStatus(id: number, status: SplitStatus, additionalData?: { youtubeUrl?: string; orderMeta?: any; paymentWindowEndsAt?: Date }): Promise<SplitInstance | undefined>;
  getSplitsReadyForPaymentWindowClose(): Promise<SplitInstance[]>;
  getAllSplitInstances(): Promise<SplitInstance[]>;
  getSeatCounts(splitId: number): Promise<SeatCounts>;

  // Seat operations
  getSeat(id: number): Promise<Seat | undefined>;
  getSeatByUserAndSplit(userId: string, splitId: number): Promise<Seat | undefined>;
  getSeatsForSplit(splitId: number): Promise<SeatWithUser[]>;
  getPaidSeatsForSplit(splitId: number): Promise<Seat[]>;
  createSeat(data: InsertSeat): Promise<Seat>;
  updateSeat(id: number, data: Partial<Seat>): Promise<Seat | undefined>;
  updateSeatPreferences(seatId: number, preferences: string[]): Promise<Seat | undefined>;
  markSeatAsPaid(seatId: number, checkoutSessionId: string): Promise<Seat | undefined>;
  markSeatAsRefunded(seatId: number): Promise<Seat | undefined>;
  getUserSeats(userId: string): Promise<(Seat & { splitInstance: SplitInstanceWithBreakEvent })[]>;

  // Webhook idempotency
  hasProcessedWebhookEvent(eventId: string): Promise<boolean>;
  recordProcessedWebhookEvent(eventId: string, eventType: string, metadata?: any): Promise<SplitWebhookEvent>;

  // Blog operations
  getBlogPosts(publishedOnly?: boolean): Promise<BlogPostWithAuthor[]>;
  getBlogPostBySlug(slug: string): Promise<BlogPostWithAuthor | undefined>;
  getBlogPostById(id: number): Promise<BlogPost | undefined>;
  createBlogPost(data: InsertBlogPost): Promise<BlogPost>;
  updateBlogPost(id: number, data: Partial<InsertBlogPost>): Promise<BlogPost | undefined>;
  deleteBlogPost(id: number): Promise<void>;
  toggleBlogPostPublished(id: number): Promise<BlogPost | undefined>;

  // Support ticket operations
  getSupportTicketsForUser(userId: string): Promise<SupportTicketWithRequester[]>;
  getAllOpenSupportTickets(): Promise<SupportTicketWithRequester[]>;
  getSupportTicketById(id: number): Promise<SupportTicketWithMessages | undefined>;
  createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket>;
  updateSupportTicketStatus(id: number, status: SupportTicketStatus, adminId?: string): Promise<SupportTicket | undefined>;
  addSupportTicketMessage(data: InsertSupportTicketMessage & { isAdminReply: boolean }): Promise<SupportTicketMessage>;

  // Scan History operations
  createScanHistory(data: InsertScanHistory): Promise<ScanHistory>;
  getScanHistory(userId: string, limit?: number, offset?: number): Promise<ScanHistory[]>;
  getScanHistoryCount(userId: string): Promise<number>;
  deleteScanHistory(id: number, userId: string): Promise<void>;
  getScanHistoryByIds(ids: number[], userId: string): Promise<ScanHistory[]>;
  updateScanHistoryAnalysis(id: number, userId: string, marketValue: number | null, action: string | null): Promise<ScanHistory | undefined>;

  // Pop Report History operations
  insertPopSnapshots(snapshots: InsertPopHistory[]): Promise<PopHistory[]>;
  getPopTrends(playerName: string, grader?: string, grade?: string, cardFilters?: { year?: number; setName?: string; variation?: string; cardNumber?: string }): Promise<PopTrend[]>;
  getPopHistory(playerName: string, options?: { year?: number; setName?: string; grader?: string; grade?: string; limit?: number }): Promise<PopHistory[]>;
  getLatestPopSnapshot(playerName: string, grader: string, grade: string): Promise<PopHistory | undefined>;

  // Alpha Engine - Price Observations
  insertPriceObservation(data: InsertCardPriceObservation): Promise<CardPriceObservation>;
  getPriceObservations(cardId?: number, playerName?: string, limit?: number, cardTitle?: string): Promise<CardPriceObservation[]>;
  updateMarketSnapshot(cardId?: number, playerName?: string, cardTitle?: string): Promise<CardMarketSnapshot | undefined>;
  getMarketSnapshot(cardId?: number, playerName?: string, cardTitle?: string): Promise<CardMarketSnapshot | undefined>;

  // Alpha Engine - Interest Events
  insertInterestEvent(data: InsertCardInterestEvent): Promise<CardInterestEvent>;
  getInterestVelocity(cardId?: number, playerName?: string, cardTitle?: string): Promise<InterestVelocity>;
  getTopCardsByInterest(limit?: number): Promise<{ cardId: number | null; playerName: string | null; cardTitle: string | null; totalEvents: number }[]>;

  // Alpha Engine - Signals
  upsertCardSignal(data: InsertCardSignal): Promise<CardSignal>;
  getActiveSignals(limit?: number, signalType?: string): Promise<CardSignal[]>;
  getCardSignal(cardId: number): Promise<CardSignal | undefined>;
  getTopCardsByOwnership(limit?: number): Promise<{ cardId: number; title: string; playerName: string | null; ownerCount: number; interestCount: number; observationCount: number; totalScore: number }[]>;
  getAllCardIdsWithSnapshots(): Promise<number[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getAdminUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.isAdmin, true));
  }

  async upsertUser(userData: UpsertUser): Promise<{ user: User; isNewUser: boolean }> {
    // Admin emails that should automatically get admin access
    const ADMIN_EMAILS = ['jordanlinford@gmail.com'];
    
    const isAdminEmail = userData.email && ADMIN_EMAILS.includes(userData.email.toLowerCase());
    
    // Check if user exists and has a handle
    const existingUser = userData.id ? await this.getUser(userData.id) : undefined;
    const isNewUser = !existingUser;
    
    // Generate a unique handle for new users
    let handle = existingUser?.handle;
    if (!handle) {
      // Try to generate a unique handle (with retries for collisions)
      for (let i = 0; i < 5; i++) {
        const candidateHandle = generateRandomHandle();
        const [existing] = await db.select().from(users).where(eq(users.handle, candidateHandle));
        if (!existing) {
          handle = candidateHandle;
          break;
        }
      }
      // If all retries fail, append more random digits
      if (!handle) {
        handle = generateRandomHandle() + Math.floor(Math.random() * 1000);
      }
    }
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        handle,
        isAdmin: isAdminEmail ? true : false,
        subscriptionStatus: isAdminEmail ? 'PRO' : 'FREE',
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
          // Only set handle if user doesn't have one
          ...(existingUser?.handle ? {} : { handle }),
          // Always ensure admin emails have admin access
          ...(isAdminEmail ? { isAdmin: true, subscriptionStatus: 'PRO' } : {}),
        },
      })
      .returning();
    return { user, isNewUser };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateGoogleId(userId: string, googleId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ googleId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserHandle(userId: string, handle: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ handle, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async isHandleAvailable(handle: string, excludeUserId?: string): Promise<boolean> {
    const query = excludeUserId
      ? and(eq(users.handle, handle), sql`${users.id} != ${excludeUserId}`)
      : eq(users.handle, handle);
    const [existing] = await db.select().from(users).where(query);
    return !existing;
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

  async activateUserTrial(userId: string, trialStart: Date, trialEnd: Date, source: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        trialStart,
        trialEnd,
        trialSource: source,
        updatedAt: new Date(),
      })
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
    outlookAction: string | null;
    outlookUpsideScore: number | null;
    outlookRiskScore: number | null;
    outlookConfidenceScore: number | null;
    outlookExplanationShort: string | null;
    outlookExplanationLong: string | null;
    outlookGeneratedAt: Date | null;
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

  // Card Outlook operations (new intelligence system)
  async getCardOutlook(cardId: number): Promise<CardOutlook | undefined> {
    const [outlook] = await db
      .select()
      .from(cardOutlooks)
      .where(eq(cardOutlooks.cardId, cardId));
    return outlook;
  }

  async getCardOutlookWithCard(cardId: number): Promise<CardOutlookWithCard | undefined> {
    const [outlook] = await db
      .select()
      .from(cardOutlooks)
      .where(eq(cardOutlooks.cardId, cardId));
    
    if (!outlook) return undefined;
    
    const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
    if (!card) return undefined;
    
    return { ...outlook, card };
  }

  async upsertCardOutlook(cardId: number, data: Partial<InsertCardOutlook>): Promise<CardOutlook> {
    const existing = await this.getCardOutlook(cardId);
    
    // Build update data excluding cardId (it's the key)
    const updateData = { ...data } as Record<string, unknown>;
    delete updateData.cardId;
    updateData.updatedAt = new Date();
    
    if (existing) {
      const [updated] = await db
        .update(cardOutlooks)
        .set(updateData)
        .where(eq(cardOutlooks.cardId, cardId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(cardOutlooks)
        .values({ 
          cardId,
          ...updateData,
        } as typeof cardOutlooks.$inferInsert)
        .returning();
      return created;
    }
  }

  async countUserMonthlyOutlookGenerations(userId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outlookUsage)
      .where(
        and(
          eq(outlookUsage.userId, userId),
          sql`${outlookUsage.createdAt} >= ${startOfMonth}`
        )
      );
    
    return result?.count || 0;
  }

  async recordOutlookUsage(userId: string, source: 'collection' | 'quick', cardId?: number, cardTitle?: string): Promise<void> {
    await db.insert(outlookUsage).values({
      userId,
      cardId: cardId || null,
      source,
      cardTitle: cardTitle || null,
    });
  }

  // Count all free user outlook generations today (global daily cap)
  async countDailyFreeUserOutlookGenerations(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    // Join with users table to only count free users
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outlookUsage)
      .innerJoin(users, eq(outlookUsage.userId, users.id))
      .where(
        and(
          sql`${outlookUsage.createdAt} >= ${startOfDay}`,
          sql`${users.subscriptionStatus} != 'PRO'`
        )
      );
    
    return result?.count || 0;
  }

  async deleteCardOutlook(cardId: number): Promise<void> {
    await db.delete(cardOutlooks).where(eq(cardOutlooks.cardId, cardId));
  }

  async getExpiredOutlooks(limit: number = 100): Promise<CardOutlook[]> {
    return db
      .select()
      .from(cardOutlooks)
      .where(sql`${cardOutlooks.expiresAt} IS NOT NULL AND ${cardOutlooks.expiresAt} < NOW()`)
      .limit(limit);
  }

  async updateOutlookPricePoints(cardId: number, pricePoints: PricePoint[]): Promise<CardOutlook | undefined> {
    const [updated] = await db
      .update(cardOutlooks)
      .set({ pricePoints, updatedAt: new Date() })
      .where(eq(cardOutlooks.cardId, cardId))
      .returning();
    return updated;
  }

  async reorderCards(displayCaseId: number, cardIds: number[]): Promise<void> {
    for (let i = 0; i < cardIds.length; i++) {
      await db
        .update(cards)
        .set({ sortOrder: i })
        .where(eq(cards.id, cardIds[i]));
    }
  }

  async autoOrderCards(displayCaseId: number, orderBy: "alpha" | "year_newest" | "year_oldest" | "value_high" | "value_low"): Promise<void> {
    const caseCards = await db
      .select()
      .from(cards)
      .where(eq(cards.displayCaseId, displayCaseId));

    if (caseCards.length === 0) return;

    let sortedCards: typeof caseCards;
    
    switch (orderBy) {
      case "alpha":
        sortedCards = [...caseCards].sort((a, b) => {
          const nameA = (a.playerName || a.title || "").toLowerCase();
          const nameB = (b.playerName || b.title || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
        break;
      case "year_newest":
        sortedCards = [...caseCards].sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case "year_oldest":
        sortedCards = [...caseCards].sort((a, b) => (a.year || 0) - (b.year || 0));
        break;
      case "value_high":
        sortedCards = [...caseCards].sort((a, b) => {
          const valA = a.estimatedValue ?? 0;
          const valB = b.estimatedValue ?? 0;
          return valB - valA;
        });
        break;
      case "value_low":
        sortedCards = [...caseCards].sort((a, b) => {
          const valA = a.estimatedValue ?? 0;
          const valB = b.estimatedValue ?? 0;
          return valA - valB;
        });
        break;
      default:
        return;
    }

    for (let i = 0; i < sortedCards.length; i++) {
      await db
        .update(cards)
        .set({ sortOrder: i })
        .where(eq(cards.id, sortedCards[i].id));
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
      if (comment.userId) {
        const [user] = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            handle: users.handle,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .where(eq(users.id, comment.userId));

        commentsWithUsers.push({
          ...comment,
          user: user || { id: comment.userId, firstName: null, lastName: null, handle: null, profileImageUrl: null },
        });
      } else {
        commentsWithUsers.push({
          ...comment,
          user: null,
        });
      }
    }

    return commentsWithUsers;
  }

  async createComment(displayCaseId: number, userId: string | null, content: string, guestName?: string): Promise<Comment> {
    const [comment] = await db
      .insert(comments)
      .values({
        displayCaseId,
        userId,
        guestName: guestName || null,
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
        .select({ firstName: users.firstName, lastName: users.lastName, handle: users.handle })
        .from(users)
        .where(eq(users.id, c.userId));

      const likeCount = await this.getLikeCount(c.id);

      const ownerName = owner?.handle
        ? `@${owner.handle}`
        : owner
          ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous"
          : "Anonymous";

      // Only include cases with at least one card
      if (caseCards.length > 0) {
        enrichedCases.push({
          ...c,
          cards: caseCards,
          ownerName,
          likeCount,
        });
      }
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
        .select({ firstName: users.firstName, lastName: users.lastName, handle: users.handle })
        .from(users)
        .where(eq(users.id, c.userId));

      const ownerName = owner?.handle
        ? `@${owner.handle}`
        : owner
          ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous"
          : "Anonymous";

      // Only include cases with at least one card
      if (caseCards.length > 0) {
        enrichedCases.push({
          ...c,
          cards: caseCards,
          ownerName,
          likeCount: c.likeCount,
        });
      }
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
        .select({ firstName: users.firstName, lastName: users.lastName, handle: users.handle })
        .from(users)
        .where(eq(users.id, c.userId));

      const ownerName = owner?.handle
        ? `@${owner.handle}`
        : owner
          ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous"
          : "Anonymous";

      // Only include cases with at least one card
      if (caseCards.length > 0) {
        enrichedCases.push({
          ...c,
          cards: caseCards,
          ownerName,
          likeCount: c.likeCount,
          trendingScore: c.trendingScore,
        });
      }
    }

    return enrichedCases;
  }

  async getTopLikedDisplayCases(limit: number = 5): Promise<{ id: number; name: string; ownerName: string; ownerImage: string | null; likeCount: number; cardCount: number; theme: string }[]> {
    const results = await db
      .select({
        id: displayCases.id,
        name: displayCases.name,
        theme: displayCases.theme,
        userId: displayCases.userId,
        likeCount: sql<number>`count(${likes.id})::int`,
      })
      .from(displayCases)
      .innerJoin(likes, eq(likes.displayCaseId, displayCases.id))
      .where(eq(displayCases.isPublic, true))
      .groupBy(displayCases.id)
      .orderBy(sql`count(${likes.id}) DESC`)
      .limit(limit);

    const enriched = await Promise.all(results.map(async (r) => {
      const [owner] = await db.select({ firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl }).from(users).where(eq(users.id, r.userId));
      const [cardCountResult] = await db.select({ count: sql<number>`count(*)::int` }).from(cards).where(eq(cards.displayCaseId, r.id));
      const cardCount = cardCountResult?.count || 0;
      if (cardCount === 0) return null;
      const ownerName = owner?.handle ? `@${owner.handle}` : owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous" : "Anonymous";
      return { id: r.id, name: r.name, ownerName, ownerImage: owner?.profileImageUrl || null, likeCount: r.likeCount, cardCount, theme: r.theme || "classic" };
    }));

    return enriched.filter((e): e is NonNullable<typeof e> => e !== null);
  }

  async getTopValueDisplayCases(limit: number = 5): Promise<{ id: number; name: string; ownerName: string; ownerImage: string | null; totalValue: number; cardCount: number; theme: string }[]> {
    const results = await db
      .select({
        id: displayCases.id,
        name: displayCases.name,
        theme: displayCases.theme,
        userId: displayCases.userId,
        totalValue: sql<number>`coalesce(sum(coalesce(${cards.estimatedValue}, ${cards.purchasePrice}, 0)), 0)::numeric`,
        cardCount: sql<number>`count(${cards.id})::int`,
      })
      .from(displayCases)
      .innerJoin(cards, eq(cards.displayCaseId, displayCases.id))
      .where(eq(displayCases.isPublic, true))
      .groupBy(displayCases.id)
      .orderBy(sql`coalesce(sum(coalesce(${cards.estimatedValue}, ${cards.purchasePrice}, 0)), 0) DESC`)
      .limit(limit);

    const enriched = await Promise.all(results.map(async (r) => {
      const [owner] = await db.select({ firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl }).from(users).where(eq(users.id, r.userId));
      if (r.cardCount === 0) return null;
      const ownerName = owner?.handle ? `@${owner.handle}` : owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous" : "Anonymous";
      return { id: r.id, name: r.name, ownerName, ownerImage: owner?.profileImageUrl || null, totalValue: Math.round(Number(r.totalValue) * 100) / 100, cardCount: r.cardCount, theme: r.theme || "classic" };
    }));

    return enriched.filter((e): e is NonNullable<typeof e> => e !== null);
  }

  async getMostViewedDisplayCases(limit: number = 5): Promise<{ id: number; name: string; ownerName: string; ownerImage: string | null; viewCount: number; cardCount: number; theme: string }[]> {
    const results = await db
      .select({
        id: displayCases.id,
        name: displayCases.name,
        theme: displayCases.theme,
        userId: displayCases.userId,
        viewCount: displayCases.viewCount,
      })
      .from(displayCases)
      .where(eq(displayCases.isPublic, true))
      .orderBy(desc(displayCases.viewCount))
      .limit(limit * 2);

    const enriched = await Promise.all(results.map(async (r) => {
      const [owner] = await db.select({ firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl }).from(users).where(eq(users.id, r.userId));
      const [cardCountResult] = await db.select({ count: sql<number>`count(*)::int` }).from(cards).where(eq(cards.displayCaseId, r.id));
      const cardCount = cardCountResult?.count || 0;
      if (cardCount === 0) return null;
      const ownerName = owner?.handle ? `@${owner.handle}` : owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Anonymous" : "Anonymous";
      return { id: r.id, name: r.name, ownerName, ownerImage: owner?.profileImageUrl || null, viewCount: r.viewCount, cardCount, theme: r.theme || "classic" };
    }));

    return enriched.filter((e): e is NonNullable<typeof e> => e !== null).slice(0, limit);
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
        .select({ firstName: users.firstName, lastName: users.lastName, handle: users.handle })
        .from(users)
        .where(eq(users.id, c.userId));

      const ownerName = owner?.handle
        ? `@${owner.handle}`
        : owner
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

  async adminDeleteUser(userId: string): Promise<void> {
    // Get all display cases for this user
    const userCases = await db.select({ id: displayCases.id }).from(displayCases).where(eq(displayCases.userId, userId));
    const caseIds = userCases.map(c => c.id);

    // Delete related data in order (respecting foreign key constraints)
    if (caseIds.length > 0) {
      // Get all cards for these cases
      const userCards = await db.select({ id: cards.id }).from(cards).where(inArray(cards.displayCaseId, caseIds));
      const cardIds = userCards.map(c => c.id);

      if (cardIds.length > 0) {
        // Delete card-related data
        await db.delete(cardOutlooks).where(inArray(cardOutlooks.cardId, cardIds));
        await db.delete(bookmarks).where(inArray(bookmarks.cardId, cardIds));
        await db.delete(priceAlerts).where(inArray(priceAlerts.cardId, cardIds));
        await db.delete(priceHistory).where(inArray(priceHistory.cardId, cardIds));
        // Delete cards
        await db.delete(cards).where(inArray(cards.id, cardIds));
      }

      // Delete display case related data
      await db.delete(comments).where(inArray(comments.displayCaseId, caseIds));
      await db.delete(likes).where(inArray(likes.displayCaseId, caseIds));
      // Delete display cases
      await db.delete(displayCases).where(inArray(displayCases.id, caseIds));
    }

    // Delete user-related data
    await db.delete(offers).where(or(eq(offers.fromUserId, userId), eq(offers.toUserId, userId)));
    await db.delete(tradeOffers).where(or(eq(tradeOffers.fromUserId, userId), eq(tradeOffers.toUserId, userId)));
    await db.delete(notifications).where(eq(notifications.userId, userId));
    await db.delete(userBadges).where(eq(userBadges.userId, userId));
    await db.delete(follows).where(or(eq(follows.followerId, userId), eq(follows.followingId, userId)));
    await db.delete(messages).where(eq(messages.senderId, userId));
    await db.delete(conversations).where(or(eq(conversations.user1Id, userId), eq(conversations.user2Id, userId)));
    await db.delete(outlookUsage).where(eq(outlookUsage.userId, userId));
    await db.delete(playerWatchlist).where(eq(playerWatchlist.userId, userId));
    await db.delete(userAlertSettings).where(eq(userAlertSettings.userId, userId));
    await db.delete(promoCodeRedemptions).where(eq(promoCodeRedemptions.userId, userId));
    await db.delete(watchlist).where(eq(watchlist.userId, userId));
    await db.delete(sharedSnapshots).where(eq(sharedSnapshots.userId, userId));

    // Finally delete the user
    await db.delete(users).where(eq(users.id, userId));
  }

  async adminDeleteDisplayCase(displayCaseId: number): Promise<void> {
    // Get all cards in this display case
    const caseCards = await db.select({ id: cards.id }).from(cards).where(eq(cards.displayCaseId, displayCaseId));
    const cardIds = caseCards.map(c => c.id);

    if (cardIds.length > 0) {
      // Delete card-related data
      await db.delete(cardOutlooks).where(inArray(cardOutlooks.cardId, cardIds));
      await db.delete(bookmarks).where(inArray(bookmarks.cardId, cardIds));
      await db.delete(priceAlerts).where(inArray(priceAlerts.cardId, cardIds));
      await db.delete(priceHistory).where(inArray(priceHistory.cardId, cardIds));
      // Delete cards
      await db.delete(cards).where(inArray(cards.id, cardIds));
    }

    // Delete display case related data
    await db.delete(comments).where(eq(comments.displayCaseId, displayCaseId));
    await db.delete(likes).where(eq(likes.displayCaseId, displayCaseId));

    // Delete the display case
    await db.delete(displayCases).where(eq(displayCases.id, displayCaseId));
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

    // Deduplicate cards by imagePath to avoid counting the same physical card multiple times
    // when it appears in multiple display cases. Keep the version with highest value.
    const uniqueCardsMap = new Map<string, typeof allCards[0]>();
    for (const card of allCards) {
      const key = card.imagePath;
      const existing = uniqueCardsMap.get(key);
      if (!existing || (card.estimatedValue || 0) > (existing.estimatedValue || 0)) {
        uniqueCardsMap.set(key, card);
      }
    }
    const uniqueCards = Array.from(uniqueCardsMap.values());

    // Helper to get effective value (manualValue takes precedence over estimatedValue)
    const getEffectiveValue = (c: typeof uniqueCards[0]) => c.manualValue ?? c.estimatedValue ?? 0;

    // Calculate totals using deduplicated cards
    const totalValue = uniqueCards.reduce((sum, c) => sum + getEffectiveValue(c), 0);
    const totalCards = uniqueCards.length;
    const totalCases = userCases.length;

    // Get top 10 cards by value (from unique cards)
    const topCards = [...uniqueCards]
      .filter(c => getEffectiveValue(c) > 0)
      .sort((a, b) => getEffectiveValue(b) - getEffectiveValue(a))
      .slice(0, 10);

    // Calculate value by case
    const valueByCase = userCases.map(c => {
      const caseCards = allCards.filter(card => card.displayCaseId === c.id);
      return {
        caseName: c.name,
        totalValue: caseCards.reduce((sum, card) => sum + (card.manualValue ?? card.estimatedValue ?? 0), 0),
        cardCount: caseCards.length,
      };
    }).filter(c => c.cardCount > 0);

    // Get cards with recent value changes (has previousValue and valueUpdatedAt)
    // Use unique cards to avoid showing duplicate entries
    const recentValueChanges = uniqueCards
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
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl })
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
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl })
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
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, trade.fromUserId));
      
      const [toUser] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl })
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
        fromUser: fromUser || { id: '', firstName: null, lastName: null, handle: null, profileImageUrl: null },
        toUser: toUser || { id: '', firstName: null, lastName: null, handle: null, profileImageUrl: null },
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

  async getFollowers(userId: string): Promise<(Follow & { follower: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> })[]> {
    const followRows = await db
      .select()
      .from(follows)
      .where(eq(follows.followedId, userId))
      .orderBy(desc(follows.createdAt));
    
    const result = [];
    for (const follow of followRows) {
      const [follower] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, follow.followerId));
      
      if (follower) {
        result.push({ ...follow, follower });
      }
    }
    return result;
  }

  async getFollowing(userId: string): Promise<(Follow & { followed: Pick<User, 'id' | 'firstName' | 'lastName' | 'handle' | 'profileImageUrl'> })[]> {
    const followRows = await db
      .select()
      .from(follows)
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt));
    
    const result = [];
    for (const follow of followRows) {
      const [followed] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, handle: users.handle, profileImageUrl: users.profileImageUrl })
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
          handle: users.handle,
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
          handle: users.handle,
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

  // Price alert operations
  async getPriceAlerts(userId: string): Promise<PriceAlertWithCard[]> {
    const alerts = await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.userId, userId))
      .orderBy(desc(priceAlerts.createdAt));
    
    const alertsWithCards: PriceAlertWithCard[] = [];
    for (const alert of alerts) {
      const [card] = await db.select().from(cards).where(eq(cards.id, alert.cardId));
      if (card) {
        alertsWithCards.push({ ...alert, card });
      }
    }
    return alertsWithCards;
  }

  async getPriceAlert(id: number): Promise<PriceAlert | undefined> {
    const [alert] = await db.select().from(priceAlerts).where(eq(priceAlerts.id, id));
    return alert;
  }

  async getCardPriceAlerts(cardId: number, userId: string): Promise<PriceAlert[]> {
    return db
      .select()
      .from(priceAlerts)
      .where(and(eq(priceAlerts.cardId, cardId), eq(priceAlerts.userId, userId)));
  }

  async createPriceAlert(userId: string, data: InsertPriceAlert): Promise<PriceAlert> {
    const [alert] = await db
      .insert(priceAlerts)
      .values({ ...data, userId })
      .returning();
    return alert;
  }

  async updatePriceAlert(id: number, data: Partial<InsertPriceAlert>): Promise<PriceAlert | undefined> {
    const [alert] = await db
      .update(priceAlerts)
      .set(data)
      .where(eq(priceAlerts.id, id))
      .returning();
    return alert;
  }

  async deletePriceAlert(id: number): Promise<void> {
    await db.delete(priceAlerts).where(eq(priceAlerts.id, id));
  }

  async countUserPriceAlerts(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(priceAlerts)
      .where(eq(priceAlerts.userId, userId));
    return Number(result[0]?.count || 0);
  }

  async getActiveAlertsForProcessing(): Promise<(PriceAlert & { card: Card; user: User })[]> {
    const alerts = await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.isActive, true));
    
    const result: (PriceAlert & { card: Card; user: User })[] = [];
    for (const alert of alerts) {
      const [card] = await db.select().from(cards).where(eq(cards.id, alert.cardId));
      const [user] = await db.select().from(users).where(eq(users.id, alert.userId));
      if (card && user) {
        result.push({ ...alert, card, user });
      }
    }
    return result;
  }

  async markAlertTriggered(id: number): Promise<void> {
    await db
      .update(priceAlerts)
      .set({ lastTriggeredAt: new Date() })
      .where(eq(priceAlerts.id, id));
  }

  // Price history operations
  async recordPriceHistory(cardId: number, price: number): Promise<PriceHistory> {
    const [record] = await db
      .insert(priceHistory)
      .values({ cardId, price })
      .returning();
    return record;
  }

  async getCardPriceHistory(cardId: number, days: number = 30): Promise<PriceHistory[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return db
      .select()
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.cardId, cardId),
          sql`${priceHistory.recordedAt} >= ${cutoffDate}`
        )
      )
      .orderBy(asc(priceHistory.recordedAt));
  }

  async getLatestPriceHistory(cardId: number): Promise<PriceHistory | undefined> {
    const [record] = await db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.cardId, cardId))
      .orderBy(desc(priceHistory.recordedAt))
      .limit(1);
    return record;
  }

  // User alert settings operations
  async getUserAlertSettings(userId: string): Promise<UserAlertSettings | undefined> {
    const [settings] = await db
      .select()
      .from(userAlertSettings)
      .where(eq(userAlertSettings.userId, userId));
    return settings;
  }

  async upsertUserAlertSettings(userId: string, data: InsertUserAlertSettings): Promise<UserAlertSettings> {
    const [settings] = await db
      .insert(userAlertSettings)
      .values({ ...data, userId })
      .onConflictDoUpdate({
        target: userAlertSettings.userId,
        set: data,
      })
      .returning();
    return settings;
  }

  async getUsersForWeeklyDigest(): Promise<(UserAlertSettings & { user: User })[]> {
    const settings = await db
      .select()
      .from(userAlertSettings)
      .where(eq(userAlertSettings.weeklyDigestEnabled, true));
    
    const result: (UserAlertSettings & { user: User })[] = [];
    for (const setting of settings) {
      const [user] = await db.select().from(users).where(eq(users.id, setting.userId));
      if (user) {
        result.push({ ...setting, user });
      }
    }
    return result;
  }

  async markDigestSent(userId: string): Promise<void> {
    await db
      .update(userAlertSettings)
      .set({ lastDigestSentAt: new Date() })
      .where(eq(userAlertSettings.userId, userId));
  }

  // Player Watchlist operations
  async getWatchlist(userId: string, sport?: string): Promise<PlayerWatchlist[]> {
    if (sport) {
      return db
        .select()
        .from(playerWatchlist)
        .where(and(
          eq(playerWatchlist.userId, userId),
          eq(playerWatchlist.sport, sport)
        ))
        .orderBy(desc(playerWatchlist.createdAt));
    }
    return db
      .select()
      .from(playerWatchlist)
      .where(eq(playerWatchlist.userId, userId))
      .orderBy(desc(playerWatchlist.createdAt));
  }

  async getWatchlistItem(userId: string, playerKey: string): Promise<PlayerWatchlist | undefined> {
    const [item] = await db
      .select()
      .from(playerWatchlist)
      .where(and(
        eq(playerWatchlist.userId, userId),
        eq(playerWatchlist.playerKey, playerKey)
      ));
    return item;
  }

  async addToWatchlist(data: InsertPlayerWatchlist): Promise<PlayerWatchlist> {
    const [item] = await db
      .insert(playerWatchlist)
      .values(data)
      .returning();
    return item;
  }

  async removeFromWatchlist(userId: string, playerKey: string): Promise<boolean> {
    const result = await db
      .delete(playerWatchlist)
      .where(and(
        eq(playerWatchlist.userId, userId),
        eq(playerWatchlist.playerKey, playerKey)
      ))
      .returning();
    return result.length > 0;
  }

  async updateWatchlistNotes(userId: string, playerKey: string, notes: string | null): Promise<PlayerWatchlist | undefined> {
    const [updated] = await db
      .update(playerWatchlist)
      .set({ notes, updatedAt: new Date() })
      .where(and(
        eq(playerWatchlist.userId, userId),
        eq(playerWatchlist.playerKey, playerKey)
      ))
      .returning();
    return updated;
  }

  // Player Outlook Cache operations
  async getCachedPlayerOutlook(playerKey: string): Promise<PlayerOutlookCache | undefined> {
    const [cached] = await db
      .select()
      .from(playerOutlookCache)
      .where(eq(playerOutlookCache.playerKey, playerKey));
    return cached;
  }

  async getPublicPlayerOutlookBySlug(sport: string, slug: string): Promise<PlayerOutlookCache | undefined> {
    const [cached] = await db
      .select()
      .from(playerOutlookCache)
      .where(and(
        eq(playerOutlookCache.sport, sport),
        eq(playerOutlookCache.slug, slug),
        eq(playerOutlookCache.isPublic, true)
      ));
    return cached;
  }

  async getAllPublicPlayerOutlooks(): Promise<PlayerOutlookCache[]> {
    return db
      .select()
      .from(playerOutlookCache)
      .where(eq(playerOutlookCache.isPublic, true))
      .orderBy(playerOutlookCache.playerName);
  }

  async getAllPlayerOutlookCache(): Promise<PlayerOutlookCache[]> {
    return db
      .select()
      .from(playerOutlookCache)
      .orderBy(playerOutlookCache.playerName);
  }

  async updatePlayerOutlookPublicFields(playerKey: string, data: { slug?: string; isPublic?: boolean; seoTitle?: string; seoDescription?: string }): Promise<PlayerOutlookCache | undefined> {
    const [updated] = await db
      .update(playerOutlookCache)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(playerOutlookCache.playerKey, playerKey))
      .returning();
    return updated;
  }

  // Shared Snapshot operations
  async createSharedSnapshot(userId: string, data: Omit<InsertSharedSnapshot, 'userId'>): Promise<SharedSnapshot> {
    const [snapshot] = await db
      .insert(sharedSnapshots)
      .values({
        ...data,
        userId,
      })
      .returning();
    return snapshot;
  }

  async getSharedSnapshotByToken(token: string): Promise<SharedSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(sharedSnapshots)
      .where(eq(sharedSnapshots.token, token));
    return snapshot;
  }

  async incrementSnapshotViewCount(token: string): Promise<void> {
    await db
      .update(sharedSnapshots)
      .set({ viewCount: sql`${sharedSnapshots.viewCount} + 1` })
      .where(eq(sharedSnapshots.token, token));
  }

  async getUserSharedSnapshots(userId: string): Promise<SharedSnapshot[]> {
    return db
      .select()
      .from(sharedSnapshots)
      .where(eq(sharedSnapshots.userId, userId))
      .orderBy(desc(sharedSnapshots.createdAt));
  }

  async deleteSharedSnapshot(token: string, userId: string): Promise<void> {
    await db
      .delete(sharedSnapshots)
      .where(and(
        eq(sharedSnapshots.token, token),
        eq(sharedSnapshots.userId, userId)
      ));
  }

  // Unified Watchlist operations
  async getUnifiedWatchlist(userId: string, itemType?: WatchlistItemType): Promise<Watchlist[]> {
    if (itemType) {
      return db
        .select()
        .from(watchlist)
        .where(and(
          eq(watchlist.userId, userId),
          eq(watchlist.itemType, itemType)
        ))
        .orderBy(desc(watchlist.createdAt));
    }
    return db
      .select()
      .from(watchlist)
      .where(eq(watchlist.userId, userId))
      .orderBy(desc(watchlist.createdAt));
  }

  async getUnifiedWatchlistItem(userId: string, itemType: WatchlistItemType, playerKey?: string, cardId?: number): Promise<Watchlist | undefined> {
    if (itemType === 'player' && playerKey) {
      const [item] = await db
        .select()
        .from(watchlist)
        .where(and(
          eq(watchlist.userId, userId),
          eq(watchlist.itemType, 'player'),
          eq(watchlist.playerKey, playerKey)
        ));
      return item;
    }
    if (itemType === 'card' && cardId) {
      const [item] = await db
        .select()
        .from(watchlist)
        .where(and(
          eq(watchlist.userId, userId),
          eq(watchlist.itemType, 'card'),
          eq(watchlist.cardId, cardId)
        ));
      return item;
    }
    return undefined;
  }

  async addToUnifiedWatchlist(data: InsertWatchlist): Promise<Watchlist> {
    const insertData = {
      ...data,
      itemType: data.itemType as "player" | "card",
    };
    const [item] = await db
      .insert(watchlist)
      .values(insertData)
      .returning();
    return item;
  }

  async removeFromUnifiedWatchlist(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(watchlist)
      .where(and(
        eq(watchlist.id, id),
        eq(watchlist.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  async updateUnifiedWatchlistNotes(id: number, userId: string, notes: string | null): Promise<Watchlist | undefined> {
    const [updated] = await db
      .update(watchlist)
      .set({ notes, updatedAt: new Date() })
      .where(and(
        eq(watchlist.id, id),
        eq(watchlist.userId, userId)
      ))
      .returning();
    return updated;
  }

  async isInUnifiedWatchlist(userId: string, itemType: WatchlistItemType, playerKey?: string, cardId?: number): Promise<boolean> {
    const item = await this.getUnifiedWatchlistItem(userId, itemType, playerKey, cardId);
    return !!item;
  }

  // =============================================================================
  // PORTFOLIO BUILDER - Box Break Splitting System
  // =============================================================================

  // Break Event operations
  async getBreakEvents(activeOnly: boolean = true): Promise<BreakEventWithSplits[]> {
    const query = activeOnly
      ? db.select().from(breakEvents).where(eq(breakEvents.isActive, true))
      : db.select().from(breakEvents);
    
    const events = await query.orderBy(desc(breakEvents.createdAt));
    
    const eventsWithSplits: BreakEventWithSplits[] = [];
    for (const event of events) {
      const splits = await db
        .select()
        .from(splitInstances)
        .where(eq(splitInstances.breakEventId, event.id))
        .orderBy(asc(splitInstances.participantCount));
      eventsWithSplits.push({ ...event, splitInstances: splits });
    }
    return eventsWithSplits;
  }

  async getBreakEvent(id: number): Promise<BreakEventWithSplits | undefined> {
    const [event] = await db.select().from(breakEvents).where(eq(breakEvents.id, id));
    if (!event) return undefined;
    
    const splits = await db
      .select()
      .from(splitInstances)
      .where(eq(splitInstances.breakEventId, id))
      .orderBy(asc(splitInstances.participantCount));
    
    return { ...event, splitInstances: splits };
  }

  async createBreakEvent(data: InsertBreakEvent): Promise<BreakEvent> {
    const [event] = await db.insert(breakEvents).values(data).returning();
    return event;
  }

  async updateBreakEvent(id: number, data: Partial<InsertBreakEvent>): Promise<BreakEvent | undefined> {
    const [event] = await db
      .update(breakEvents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(breakEvents.id, id))
      .returning();
    return event;
  }

  async deleteBreakEvent(id: number): Promise<void> {
    await db.delete(breakEvents).where(eq(breakEvents.id, id));
  }

  // Split Instance operations
  async getSplitInstance(id: number): Promise<SplitInstanceWithSeats | undefined> {
    const [split] = await db.select().from(splitInstances).where(eq(splitInstances.id, id));
    if (!split) return undefined;
    
    const splitSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.splitInstanceId, id))
      .orderBy(asc(seats.paidAt), asc(seats.createdAt));
    
    return { ...split, seats: splitSeats };
  }

  async getSplitInstanceWithBreakEvent(id: number): Promise<SplitInstanceWithBreakEvent | undefined> {
    const [split] = await db.select().from(splitInstances).where(eq(splitInstances.id, id));
    if (!split) return undefined;
    
    const [event] = await db.select().from(breakEvents).where(eq(breakEvents.id, split.breakEventId));
    if (!event) return undefined;
    
    return { ...split, breakEvent: event };
  }

  async createSplitInstance(data: InsertSplitInstance): Promise<SplitInstance> {
    const [split] = await db.insert(splitInstances).values(data).returning();
    return split;
  }

  async updateSplitInstance(id: number, data: Partial<SplitInstance>): Promise<SplitInstance | undefined> {
    const [split] = await db
      .update(splitInstances)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(splitInstances.id, id))
      .returning();
    return split;
  }

  async updateSplitStatus(
    id: number,
    status: SplitStatus,
    additionalData?: { youtubeUrl?: string; orderMeta?: any; paymentWindowEndsAt?: Date }
  ): Promise<SplitInstance | undefined> {
    const [currentSplit] = await db.select().from(splitInstances).where(eq(splitInstances.id, id));
    if (!currentSplit) return undefined;
    
    // Validate status transition
    if (!isValidStatusTransition(currentSplit.status as SplitStatus, status)) {
      throw new Error(`Invalid status transition from ${currentSplit.status} to ${status}`);
    }
    
    const updateData: Partial<SplitInstance> = {
      status,
      updatedAt: new Date(),
    };
    
    if (additionalData?.youtubeUrl) updateData.youtubeUrl = additionalData.youtubeUrl;
    if (additionalData?.orderMeta) updateData.orderMeta = additionalData.orderMeta;
    if (additionalData?.paymentWindowEndsAt) updateData.paymentWindowEndsAt = additionalData.paymentWindowEndsAt;
    
    const [split] = await db
      .update(splitInstances)
      .set(updateData)
      .where(eq(splitInstances.id, id))
      .returning();
    return split;
  }

  async getSplitsReadyForPaymentWindowClose(): Promise<SplitInstance[]> {
    const now = new Date();
    return db
      .select()
      .from(splitInstances)
      .where(
        and(
          eq(splitInstances.status, "PAYMENT_OPEN"),
          sql`${splitInstances.paymentWindowEndsAt} <= ${now}`
        )
      );
  }

  async getAllSplitInstances(): Promise<SplitInstance[]> {
    return db
      .select()
      .from(splitInstances)
      .orderBy(desc(splitInstances.createdAt));
  }

  async getSeatCounts(splitId: number): Promise<SeatCounts> {
    const allSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.splitInstanceId, splitId));
    
    const counts = {
      interested: 0,
      waitlist: 0,
      paid: 0,
      total: allSeats.length,
    };
    
    for (const seat of allSeats) {
      if (seat.status === "INTERESTED") counts.interested++;
      else if (seat.status === "WAITLIST") counts.waitlist++;
      else if (seat.status === "PAID") counts.paid++;
    }
    
    return counts;
  }

  // Seat operations
  async getSeat(id: number): Promise<Seat | undefined> {
    const [seat] = await db.select().from(seats).where(eq(seats.id, id));
    return seat;
  }

  async getSeatByUserAndSplit(userId: string, splitId: number): Promise<Seat | undefined> {
    const [seat] = await db
      .select()
      .from(seats)
      .where(and(eq(seats.userId, userId), eq(seats.splitInstanceId, splitId)));
    return seat;
  }

  async getSeatsForSplit(splitId: number): Promise<SeatWithUser[]> {
    const splitSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.splitInstanceId, splitId))
      .orderBy(asc(seats.paidAt), asc(seats.createdAt));
    
    const seatsWithUsers: SeatWithUser[] = [];
    for (const seat of splitSeats) {
      const [user] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          handle: users.handle,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(eq(users.id, seat.userId));
      
      if (user) {
        seatsWithUsers.push({ ...seat, user });
      }
    }
    return seatsWithUsers;
  }

  async getPaidSeatsForSplit(splitId: number): Promise<Seat[]> {
    return db
      .select()
      .from(seats)
      .where(and(eq(seats.splitInstanceId, splitId), eq(seats.status, "PAID")))
      .orderBy(asc(seats.paidAt));
  }

  async createSeat(data: InsertSeat): Promise<Seat> {
    const [seat] = await db.insert(seats).values(data).returning();
    return seat;
  }

  async updateSeat(id: number, data: Partial<Seat>): Promise<Seat | undefined> {
    const [seat] = await db
      .update(seats)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(seats.id, id))
      .returning();
    return seat;
  }

  async updateSeatPreferences(seatId: number, preferences: string[]): Promise<Seat | undefined> {
    const [seat] = await db
      .update(seats)
      .set({ preferences, updatedAt: new Date() })
      .where(eq(seats.id, seatId))
      .returning();
    return seat;
  }

  async markSeatAsPaid(seatId: number, checkoutSessionId: string): Promise<Seat | undefined> {
    const [seat] = await db
      .update(seats)
      .set({
        status: "PAID",
        paidAt: new Date(),
        stripeCheckoutSessionId: checkoutSessionId,
        updatedAt: new Date(),
      })
      .where(eq(seats.id, seatId))
      .returning();
    return seat;
  }

  async markSeatAsRefunded(seatId: number): Promise<Seat | undefined> {
    const [seat] = await db
      .update(seats)
      .set({
        status: "REFUNDED",
        updatedAt: new Date(),
      })
      .where(eq(seats.id, seatId))
      .returning();
    return seat;
  }

  async getUserSeats(userId: string): Promise<(Seat & { splitInstance: SplitInstanceWithBreakEvent })[]> {
    const userSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.userId, userId))
      .orderBy(desc(seats.createdAt));
    
    const seatsWithSplits: (Seat & { splitInstance: SplitInstanceWithBreakEvent })[] = [];
    for (const seat of userSeats) {
      const splitWithEvent = await this.getSplitInstanceWithBreakEvent(seat.splitInstanceId);
      if (splitWithEvent) {
        seatsWithSplits.push({ ...seat, splitInstance: splitWithEvent });
      }
    }
    return seatsWithSplits;
  }

  // Webhook idempotency
  async hasProcessedWebhookEvent(eventId: string): Promise<boolean> {
    const [event] = await db
      .select()
      .from(splitWebhookEvents)
      .where(eq(splitWebhookEvents.eventId, eventId));
    return !!event;
  }

  async recordProcessedWebhookEvent(eventId: string, eventType: string, metadata?: any): Promise<SplitWebhookEvent> {
    const [event] = await db
      .insert(splitWebhookEvents)
      .values({ eventId, eventType, metadata })
      .returning();
    return event;
  }

  // Blog operations
  async getBlogPosts(publishedOnly?: boolean): Promise<BlogPostWithAuthor[]> {
    const posts = publishedOnly 
      ? await db.select().from(blogPosts).where(eq(blogPosts.isPublished, true)).orderBy(desc(blogPosts.publishedAt))
      : await db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
    
    const postsWithAuthor: BlogPostWithAuthor[] = [];
    for (const post of posts) {
      let author = null;
      if (post.authorId) {
        const [user] = await db.select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          handle: users.handle,
          profileImageUrl: users.profileImageUrl,
        }).from(users).where(eq(users.id, post.authorId));
        author = user || null;
      }
      postsWithAuthor.push({ ...post, author });
    }
    return postsWithAuthor;
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPostWithAuthor | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug));
    if (!post) return undefined;
    
    let author = null;
    if (post.authorId) {
      const [user] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        handle: users.handle,
        profileImageUrl: users.profileImageUrl,
      }).from(users).where(eq(users.id, post.authorId));
      author = user || null;
    }
    return { ...post, author };
  }

  async getBlogPostById(id: number): Promise<BlogPost | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return post;
  }

  async createBlogPost(data: InsertBlogPost): Promise<BlogPost> {
    const [post] = await db.insert(blogPosts).values(data).returning();
    return post;
  }

  async updateBlogPost(id: number, data: Partial<InsertBlogPost>): Promise<BlogPost | undefined> {
    const [post] = await db
      .update(blogPosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(blogPosts.id, id))
      .returning();
    return post;
  }

  async deleteBlogPost(id: number): Promise<void> {
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
  }

  async toggleBlogPostPublished(id: number): Promise<BlogPost | undefined> {
    const post = await this.getBlogPostById(id);
    if (!post) return undefined;
    
    const isPublished = !post.isPublished;
    const [updated] = await db
      .update(blogPosts)
      .set({
        isPublished,
        publishedAt: isPublished ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, id))
      .returning();
    return updated;
  }

  // Support ticket operations
  async getSupportTicketsForUser(userId: string): Promise<SupportTicketWithRequester[]> {
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.requesterId, userId))
      .orderBy(desc(supportTickets.createdAt));
    
    const result: SupportTicketWithRequester[] = [];
    for (const ticket of tickets) {
      const [requester] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        handle: users.handle,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
      }).from(users).where(eq(users.id, ticket.requesterId));
      
      if (requester) {
        result.push({ ...ticket, requester });
      }
    }
    return result;
  }

  async getAllOpenSupportTickets(): Promise<SupportTicketWithRequester[]> {
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(
        or(
          eq(supportTickets.status, 'OPEN'),
          eq(supportTickets.status, 'IN_PROGRESS'),
          eq(supportTickets.status, 'WAITING_ON_USER')
        )
      )
      .orderBy(desc(supportTickets.createdAt));
    
    const result: SupportTicketWithRequester[] = [];
    for (const ticket of tickets) {
      const [requester] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        handle: users.handle,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
      }).from(users).where(eq(users.id, ticket.requesterId));
      
      if (requester) {
        result.push({ ...ticket, requester });
      }
    }
    return result;
  }

  async getSupportTicketById(id: number): Promise<SupportTicketWithMessages | undefined> {
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, id));
    
    if (!ticket) return undefined;
    
    const [requester] = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      handle: users.handle,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
    }).from(users).where(eq(users.id, ticket.requesterId));
    
    if (!requester) return undefined;
    
    const messageRows = await db
      .select()
      .from(supportTicketMessages)
      .where(eq(supportTicketMessages.ticketId, id))
      .orderBy(asc(supportTicketMessages.createdAt));
    
    const messagesWithSenders = [];
    for (const msg of messageRows) {
      const [sender] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        handle: users.handle,
        profileImageUrl: users.profileImageUrl,
      }).from(users).where(eq(users.id, msg.senderId));
      
      if (sender) {
        messagesWithSenders.push({ ...msg, sender });
      }
    }
    
    return { ...ticket, requester, messages: messagesWithSenders };
  }

  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [ticket] = await db
      .insert(supportTickets)
      .values(data)
      .returning();
    return ticket;
  }

  async updateSupportTicketStatus(id: number, status: SupportTicketStatus, adminId?: string): Promise<SupportTicket | undefined> {
    const updateData: any = { status, updatedAt: new Date() };
    if (adminId) {
      updateData.assignedAdminId = adminId;
    }
    
    const [ticket] = await db
      .update(supportTickets)
      .set(updateData)
      .where(eq(supportTickets.id, id))
      .returning();
    return ticket;
  }

  async addSupportTicketMessage(data: InsertSupportTicketMessage & { isAdminReply: boolean }): Promise<SupportTicketMessage> {
    const [message] = await db
      .insert(supportTicketMessages)
      .values(data)
      .returning();
    
    // Update the ticket's lastReplyAt and adminReplyCount if admin
    const updateData: any = { lastReplyAt: new Date(), updatedAt: new Date() };
    if (data.isAdminReply) {
      await db
        .update(supportTickets)
        .set({
          ...updateData,
          adminReplyCount: sql`${supportTickets.adminReplyCount} + 1`,
        })
        .where(eq(supportTickets.id, data.ticketId));
    } else {
      await db
        .update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, data.ticketId));
    }
    
    return message;
  }

  async createScanHistory(data: InsertScanHistory): Promise<ScanHistory> {
    const [record] = await db
      .insert(scanHistory)
      .values(data)
      .returning();
    return record;
  }

  async getScanHistory(userId: string, limit: number = 50, offset: number = 0): Promise<ScanHistory[]> {
    return db
      .select()
      .from(scanHistory)
      .where(eq(scanHistory.userId, userId))
      .orderBy(desc(scanHistory.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getScanHistoryCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scanHistory)
      .where(eq(scanHistory.userId, userId));
    return result?.count ?? 0;
  }

  async deleteScanHistory(id: number, userId: string): Promise<void> {
    await db
      .delete(scanHistory)
      .where(and(eq(scanHistory.id, id), eq(scanHistory.userId, userId)));
  }

  async getScanHistoryByIds(ids: number[], userId: string): Promise<ScanHistory[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(scanHistory)
      .where(and(inArray(scanHistory.id, ids), eq(scanHistory.userId, userId)));
  }

  async updateScanHistoryAnalysis(id: number, userId: string, marketValue: number | null, action: string | null): Promise<ScanHistory | undefined> {
    const [record] = await db
      .update(scanHistory)
      .set({ marketValue, action })
      .where(and(eq(scanHistory.id, id), eq(scanHistory.userId, userId)))
      .returning();
    return record;
  }

  // Pop Report History operations
  async insertPopSnapshots(snapshots: InsertPopHistory[]): Promise<PopHistory[]> {
    if (snapshots.length === 0) return [];
    const results: PopHistory[] = [];
    for (const snap of snapshots) {
      const [row] = await db.execute(sql`
        INSERT INTO pop_history (player_name, year, set_name, variation, card_number, grader, grade, population, snapshot_date, source)
        VALUES (${snap.playerName}, ${snap.year ?? null}, ${snap.setName ?? null}, ${snap.variation ?? null}, ${snap.cardNumber ?? null}, ${snap.grader}, ${snap.grade}, ${snap.population}, ${snap.snapshotDate}, ${snap.source ?? 'vps_scraper'})
        ON CONFLICT (player_name, COALESCE(year::text, ''), COALESCE(set_name, ''), COALESCE(variation, ''), COALESCE(card_number, ''), grader, grade, snapshot_date)
        DO UPDATE SET population = EXCLUDED.population, source = EXCLUDED.source
        RETURNING *
      `);
      if (row) results.push(row as unknown as PopHistory);
    }
    return results;
  }

  async getPopTrends(playerName: string, grader?: string, grade?: string, cardFilters?: { year?: number; setName?: string; variation?: string; cardNumber?: string }): Promise<PopTrend[]> {
    const conditions = [sql`LOWER(${popHistory.playerName}) = LOWER(${playerName})`];
    if (grader) conditions.push(eq(popHistory.grader, grader));
    if (grade) conditions.push(eq(popHistory.grade, grade));
    if (cardFilters?.year) conditions.push(eq(popHistory.year, cardFilters.year));
    if (cardFilters?.setName) conditions.push(sql`LOWER(${popHistory.setName}) = LOWER(${cardFilters.setName})`);
    if (cardFilters?.variation) conditions.push(sql`LOWER(${popHistory.variation}) = LOWER(${cardFilters.variation})`);
    if (cardFilters?.cardNumber) conditions.push(eq(popHistory.cardNumber, cardFilters.cardNumber));

    const rows = await db
      .select()
      .from(popHistory)
      .where(and(...conditions))
      .orderBy(asc(popHistory.snapshotDate));

    const grouped = new Map<string, PopHistory[]>();
    for (const row of rows) {
      const key = `${row.grader}|${row.grade}`;
      const arr = grouped.get(key) || [];
      arr.push(row);
      grouped.set(key, arr);
    }

    const trends: PopTrend[] = [];
    for (const [key, snapshots] of grouped) {
      const [g, gr] = key.split("|");
      const sorted = snapshots.sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime());
      const current = sorted[sorted.length - 1];
      const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
      const momGrowthPct = previous && previous.population > 0
        ? Math.round(((current.population - previous.population) / previous.population) * 10000) / 100
        : null;

      trends.push({
        playerName: current.playerName,
        grader: g,
        grade: gr,
        snapshots: sorted.map(s => ({
          date: new Date(s.snapshotDate).toISOString().split("T")[0],
          population: s.population,
        })),
        currentPopulation: current.population,
        previousPopulation: previous?.population ?? null,
        momGrowthPct,
        totalSnapshots: sorted.length,
      });
    }

    return trends;
  }

  async getPopHistory(playerName: string, options?: { year?: number; setName?: string; grader?: string; grade?: string; limit?: number }): Promise<PopHistory[]> {
    const conditions = [sql`LOWER(${popHistory.playerName}) = LOWER(${playerName})`];
    if (options?.year) conditions.push(eq(popHistory.year, options.year));
    if (options?.setName) conditions.push(sql`LOWER(${popHistory.setName}) = LOWER(${options.setName})`);
    if (options?.grader) conditions.push(eq(popHistory.grader, options.grader));
    if (options?.grade) conditions.push(eq(popHistory.grade, options.grade));

    return db
      .select()
      .from(popHistory)
      .where(and(...conditions))
      .orderBy(desc(popHistory.snapshotDate))
      .limit(options?.limit ?? 100);
  }

  async getLatestPopSnapshot(playerName: string, grader: string, grade: string): Promise<PopHistory | undefined> {
    const [row] = await db
      .select()
      .from(popHistory)
      .where(and(
        sql`LOWER(${popHistory.playerName}) = LOWER(${playerName})`,
        eq(popHistory.grader, grader),
        eq(popHistory.grade, grade),
      ))
      .orderBy(desc(popHistory.snapshotDate))
      .limit(1);
    return row;
  }

  // =========================================================================
  // Alpha Engine - Price Observations
  // =========================================================================

  async insertPriceObservation(data: InsertCardPriceObservation): Promise<CardPriceObservation> {
    const [row] = await db.insert(cardPriceObservations).values(data).returning();
    return row;
  }

  async getPriceObservations(cardId?: number, playerName?: string, limit: number = 10, cardTitle?: string): Promise<CardPriceObservation[]> {
    const conditions = [];
    if (cardId) conditions.push(eq(cardPriceObservations.cardId, cardId));
    else if (cardTitle) conditions.push(sql`LOWER(${cardPriceObservations.cardTitle}) = LOWER(${cardTitle})`);
    else if (playerName) conditions.push(sql`LOWER(${cardPriceObservations.playerName}) = LOWER(${playerName})`);
    if (conditions.length === 0) return [];

    return db
      .select()
      .from(cardPriceObservations)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .orderBy(desc(cardPriceObservations.createdAt))
      .limit(limit);
  }

  async updateMarketSnapshot(cardId?: number, playerName?: string, cardTitle?: string): Promise<CardMarketSnapshot | undefined> {
    const observations = await this.getPriceObservations(cardId, playerName, 10, cardTitle);
    if (observations.length === 0) return undefined;

    const prices = observations.map(o => o.priceEstimate).filter(p => p > 0);
    if (prices.length === 0) return undefined;

    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    const lookupConditions = [];
    if (cardId) lookupConditions.push(eq(cardMarketSnapshots.cardId, cardId));
    else if (cardTitle) lookupConditions.push(sql`LOWER(${cardMarketSnapshots.cardTitle}) = LOWER(${cardTitle})`);
    else if (playerName) lookupConditions.push(sql`LOWER(${cardMarketSnapshots.playerName}) = LOWER(${playerName})`);
    else return undefined;

    const existing = await db
      .select()
      .from(cardMarketSnapshots)
      .where(lookupConditions[0])
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(cardMarketSnapshots)
        .set({
          avgPriceSimple: Math.round(avg * 100) / 100,
          observationCount: observations.length,
          priceRangeMin: Math.round(min * 100) / 100,
          priceRangeMax: Math.round(max * 100) / 100,
          lastPrice: Math.round(prices[0] * 100) / 100,
          lastUpdated: new Date(),
          ...(cardTitle ? { cardTitle } : {}),
        })
        .where(eq(cardMarketSnapshots.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(cardMarketSnapshots)
        .values({
          cardId: cardId ?? null,
          playerName: playerName ?? null,
          cardTitle: cardTitle ?? null,
          avgPriceSimple: Math.round(avg * 100) / 100,
          observationCount: observations.length,
          priceRangeMin: Math.round(min * 100) / 100,
          priceRangeMax: Math.round(max * 100) / 100,
          lastPrice: Math.round(prices[0] * 100) / 100,
          lastUpdated: new Date(),
        })
        .returning();
      return created;
    }
  }

  async getMarketSnapshot(cardId?: number, playerName?: string, cardTitle?: string): Promise<CardMarketSnapshot | undefined> {
    const conditions = [];
    if (cardId) conditions.push(eq(cardMarketSnapshots.cardId, cardId));
    else if (cardTitle) conditions.push(sql`LOWER(${cardMarketSnapshots.cardTitle}) = LOWER(${cardTitle})`);
    else if (playerName) conditions.push(sql`LOWER(${cardMarketSnapshots.playerName}) = LOWER(${playerName})`);
    if (conditions.length === 0) return undefined;

    const [row] = await db
      .select()
      .from(cardMarketSnapshots)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .limit(1);
    return row;
  }

  // =========================================================================
  // Alpha Engine - Interest Events
  // =========================================================================

  async insertInterestEvent(data: InsertCardInterestEvent): Promise<CardInterestEvent> {
    const [row] = await db.insert(cardInterestEvents).values(data).returning();
    return row;
  }

  async getInterestVelocity(cardId?: number, playerName?: string, cardTitle?: string): Promise<InterestVelocity> {
    const conditions = [];
    if (cardId) conditions.push(eq(cardInterestEvents.cardId, cardId));
    else if (cardTitle) conditions.push(sql`LOWER(${cardInterestEvents.cardTitle}) = LOWER(${cardTitle})`);
    else if (playerName) conditions.push(sql`LOWER(${cardInterestEvents.playerName}) = LOWER(${playerName})`);

    const empty: InterestVelocity = {
      cardId: cardId ?? null,
      playerName: playerName ?? null,
      recentCount: 0,
      historicalAvgWeekly: 0,
      velocity: 0,
      eventBreakdown: {},
    };

    if (conditions.length === 0) return empty;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const condition = conditions.length === 1 ? conditions[0] : or(...conditions);

    const recentRows = await db
      .select({
        eventType: cardInterestEvents.eventType,
        cnt: sql<number>`count(*)::int`,
      })
      .from(cardInterestEvents)
      .where(and(condition, sql`${cardInterestEvents.createdAt} >= ${sevenDaysAgo}`))
      .groupBy(cardInterestEvents.eventType);

    const recentCount = recentRows.reduce((s, r) => s + r.cnt, 0);
    const eventBreakdown: Record<string, number> = {};
    for (const r of recentRows) eventBreakdown[r.eventType] = r.cnt;

    const [historicalRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(cardInterestEvents)
      .where(and(condition, sql`${cardInterestEvents.createdAt} >= ${thirtyDaysAgo}`));

    const totalIn30d = historicalRow?.cnt ?? 0;
    const historicalAvgWeekly = totalIn30d > 0 ? totalIn30d / 4.28 : 0;
    const velocity = historicalAvgWeekly > 0 ? recentCount / historicalAvgWeekly : (recentCount > 0 ? recentCount : 0);

    return {
      cardId: cardId ?? null,
      playerName: playerName ?? null,
      recentCount,
      historicalAvgWeekly: Math.round(historicalAvgWeekly * 100) / 100,
      velocity: Math.round(velocity * 100) / 100,
      eventBreakdown,
    };
  }

  async getTopCardsByInterest(limit: number = 50): Promise<{ cardId: number | null; playerName: string | null; cardTitle: string | null; totalEvents: number }[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return db
      .select({
        cardId: cardInterestEvents.cardId,
        playerName: cardInterestEvents.playerName,
        cardTitle: cardInterestEvents.cardTitle,
        totalEvents: sql<number>`count(*)::int`,
      })
      .from(cardInterestEvents)
      .where(sql`${cardInterestEvents.createdAt} >= ${thirtyDaysAgo}`)
      .groupBy(cardInterestEvents.cardId, cardInterestEvents.playerName, cardInterestEvents.cardTitle)
      .orderBy(sql`count(*) DESC`)
      .limit(limit);
  }

  // =========================================================================
  // Alpha Engine - Signals
  // =========================================================================

  async upsertCardSignal(data: InsertCardSignal): Promise<CardSignal> {
    const [row] = await db
      .insert(cardSignals)
      .values(data)
      .onConflictDoUpdate({
        target: cardSignals.cardId,
        set: {
          alphaScore: data.alphaScore,
          signalType: data.signalType,
          confidence: data.confidence,
          reasoning: data.reasoning,
          playerName: data.playerName,
          cardTitle: data.cardTitle,
          expiresAt: data.expiresAt,
          batchRunId: data.batchRunId,
          createdAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async getActiveSignals(limit: number = 50, signalType?: string): Promise<CardSignal[]> {
    const now = new Date();
    const conditions = [sql`${cardSignals.expiresAt} > ${now}`];
    if (signalType) {
      conditions.push(eq(cardSignals.signalType, signalType));
    }

    return db
      .select()
      .from(cardSignals)
      .where(and(...conditions))
      .orderBy(desc(cardSignals.alphaScore))
      .limit(limit);
  }

  async getCardSignal(cardId: number): Promise<CardSignal | undefined> {
    const now = new Date();
    const [row] = await db
      .select()
      .from(cardSignals)
      .where(and(eq(cardSignals.cardId, cardId), sql`${cardSignals.expiresAt} > ${now}`))
      .orderBy(desc(cardSignals.createdAt))
      .limit(1);
    return row;
  }

  async getTopCardsByOwnership(limit: number = 50): Promise<{ cardId: number; title: string; playerName: string | null; ownerCount: number; interestCount: number; observationCount: number; totalScore: number }[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const ownershipQuery = db
      .select({
        cardId: sql<number>`MIN(${cards.id})::int`.as("card_id"),
        title: sql<string>`MIN(${cards.title})`.as("title"),
        playerName: sql<string | null>`MIN(${cards.playerName})`.as("player_name"),
        ownerCount: sql<number>`COUNT(DISTINCT ${displayCases.userId})::int`.as("owner_count"),
      })
      .from(cards)
      .innerJoin(displayCases, eq(cards.displayCaseId, displayCases.id))
      .where(sql`${cards.estimatedValue} IS NOT NULL AND ${cards.estimatedValue} > 0`)
      .groupBy(sql`LOWER(${cards.title})`, cards.playerName)
      .orderBy(sql`COUNT(DISTINCT ${displayCases.userId}) DESC`)
      .limit(limit * 2);

    const rows = await ownershipQuery;

    const cardIds = rows.map(r => r.cardId).filter(Boolean);
    if (cardIds.length === 0) return [];

    const interestCounts = await db
      .select({
        cardId: cardInterestEvents.cardId,
        count: sql<number>`count(*)::int`,
      })
      .from(cardInterestEvents)
      .where(and(
        inArray(cardInterestEvents.cardId, cardIds),
        sql`${cardInterestEvents.createdAt} >= ${thirtyDaysAgo}`
      ))
      .groupBy(cardInterestEvents.cardId);

    const observationCounts = await db
      .select({
        cardId: cardPriceObservations.cardId,
        count: sql<number>`count(*)::int`,
      })
      .from(cardPriceObservations)
      .where(inArray(cardPriceObservations.cardId, cardIds))
      .groupBy(cardPriceObservations.cardId);

    const interestMap = new Map(interestCounts.map(r => [r.cardId, r.count]));
    const obsMap = new Map(observationCounts.map(r => [r.cardId, r.count]));

    const scored = rows.map(r => ({
      cardId: r.cardId,
      title: r.title,
      playerName: r.playerName,
      ownerCount: r.ownerCount,
      interestCount: interestMap.get(r.cardId) ?? 0,
      observationCount: obsMap.get(r.cardId) ?? 0,
      totalScore: (r.ownerCount * 3) + ((interestMap.get(r.cardId) ?? 0) * 2) + (obsMap.get(r.cardId) ?? 0),
    }));

    scored.sort((a, b) => b.totalScore - a.totalScore);
    return scored.slice(0, limit);
  }

  async getAllCardIdsWithSnapshots(): Promise<number[]> {
    const rows = await db
      .select({ cardId: cardMarketSnapshots.cardId })
      .from(cardMarketSnapshots)
      .where(sql`${cardMarketSnapshots.cardId} IS NOT NULL`);
    return rows.map(r => r.cardId!).filter(Boolean);
  }
}

export const storage = new DatabaseStorage();
