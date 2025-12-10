import { storage } from "./storage";
import { COLLECTOR_TIERS, type CollectorTier } from "@shared/schema";
import { db } from "./db";
import { badges } from "@shared/schema";

export const BADGE_DEFINITIONS = [
  {
    id: "first-case",
    name: "Case Creator",
    description: "Created your first display case",
    icon: "trophy",
    category: "collection",
    requirement: "Create 1 display case",
    pointValue: 10,
    rarity: "common",
  },
  {
    id: "five-cases",
    name: "Collector's Corner",
    description: "Created 5 display cases",
    icon: "layout-grid",
    category: "collection",
    requirement: "Create 5 display cases",
    pointValue: 25,
    rarity: "uncommon",
  },
  {
    id: "ten-cases",
    name: "Master Curator",
    description: "Created 10 display cases",
    icon: "crown",
    category: "collection",
    requirement: "Create 10 display cases",
    pointValue: 50,
    rarity: "rare",
  },
  {
    id: "first-card",
    name: "First Card",
    description: "Added your first card to a display case",
    icon: "id-card",
    category: "cards",
    requirement: "Add 1 card",
    pointValue: 5,
    rarity: "common",
  },
  {
    id: "ten-cards",
    name: "Growing Collection",
    description: "Added 10 cards to your collection",
    icon: "layers",
    category: "cards",
    requirement: "Add 10 cards",
    pointValue: 15,
    rarity: "common",
  },
  {
    id: "fifty-cards",
    name: "Serious Collector",
    description: "Added 50 cards to your collection",
    icon: "archive",
    category: "cards",
    requirement: "Add 50 cards",
    pointValue: 40,
    rarity: "uncommon",
  },
  {
    id: "hundred-cards",
    name: "Card Vault",
    description: "Added 100 cards to your collection",
    icon: "vault",
    category: "cards",
    requirement: "Add 100 cards",
    pointValue: 75,
    rarity: "rare",
  },
  {
    id: "first-value",
    name: "Value Tracker",
    description: "Added an estimated value to a card",
    icon: "trending-up",
    category: "value",
    requirement: "Add estimated value to 1 card",
    pointValue: 5,
    rarity: "common",
  },
  {
    id: "hundred-value",
    name: "Century Club",
    description: "Collection value reached $100",
    icon: "dollar-sign",
    category: "value",
    requirement: "Total collection value of $100",
    pointValue: 20,
    rarity: "common",
  },
  {
    id: "thousand-value",
    name: "Grand Collector",
    description: "Collection value reached $1,000",
    icon: "gem",
    category: "value",
    requirement: "Total collection value of $1,000",
    pointValue: 50,
    rarity: "uncommon",
  },
  {
    id: "ten-thousand-value",
    name: "Elite Vault",
    description: "Collection value reached $10,000",
    icon: "diamond",
    category: "value",
    requirement: "Total collection value of $10,000",
    pointValue: 100,
    rarity: "rare",
  },
  {
    id: "pro-member",
    name: "Pro Collector",
    description: "Upgraded to Pro membership",
    icon: "star",
    category: "membership",
    requirement: "Become a Pro member",
    pointValue: 25,
    rarity: "uncommon",
  },
  {
    id: "first-share",
    name: "Social Butterfly",
    description: "Made a display case public for the first time",
    icon: "share-2",
    category: "social",
    requirement: "Make 1 public display case",
    pointValue: 10,
    rarity: "common",
  },
  {
    id: "first-comment",
    name: "Community Voice",
    description: "Left a comment on another collector's case",
    icon: "message-circle",
    category: "social",
    requirement: "Leave 1 comment",
    pointValue: 5,
    rarity: "common",
  },
  {
    id: "first-like",
    name: "Appreciator",
    description: "Liked another collector's display case",
    icon: "heart",
    category: "social",
    requirement: "Like 1 display case",
    pointValue: 5,
    rarity: "common",
  },
  {
    id: "views-100",
    name: "Getting Noticed",
    description: "Your cases have been viewed 100 times",
    icon: "eye",
    category: "social",
    requirement: "Receive 100 total views",
    pointValue: 20,
    rarity: "common",
  },
  {
    id: "views-1000",
    name: "Popular Collector",
    description: "Your cases have been viewed 1,000 times",
    icon: "sparkles",
    category: "social",
    requirement: "Receive 1,000 total views",
    pointValue: 50,
    rarity: "rare",
  },
  {
    id: "first-bookmark",
    name: "Wishlist Starter",
    description: "Bookmarked your first card",
    icon: "bookmark",
    category: "engagement",
    requirement: "Bookmark 1 card",
    pointValue: 5,
    rarity: "common",
  },
  {
    id: "first-offer",
    name: "Deal Maker",
    description: "Made your first offer on a card",
    icon: "hand-coins",
    category: "trading",
    requirement: "Make 1 offer",
    pointValue: 10,
    rarity: "common",
  },
  {
    id: "offer-accepted",
    name: "Successful Trader",
    description: "Had an offer accepted",
    icon: "check-circle",
    category: "trading",
    requirement: "Have 1 offer accepted",
    pointValue: 25,
    rarity: "uncommon",
  },
];

function calculateTier(score: number): CollectorTier {
  if (score >= COLLECTOR_TIERS.diamond.minScore) return "diamond";
  if (score >= COLLECTOR_TIERS.platinum.minScore) return "platinum";
  if (score >= COLLECTOR_TIERS.gold.minScore) return "gold";
  if (score >= COLLECTOR_TIERS.silver.minScore) return "silver";
  return "bronze";
}

export class PrestigeService {
  async initializeBadges(): Promise<void> {
    for (const badge of BADGE_DEFINITIONS) {
      const existing = await storage.getBadge(badge.id);
      if (!existing) {
        await db.insert(badges).values(badge);
        console.log(`Created badge: ${badge.name}`);
      }
    }
  }

  async recalculateUserPrestige(userId: string): Promise<{ score: number; tier: CollectorTier; newBadges: string[] }> {
    const newBadges: string[] = [];
    let totalScore = 0;

    const user = await storage.getUser(userId);
    if (!user) {
      return { score: 0, tier: "bronze", newBadges: [] };
    }

    const userBadges = await storage.getUserBadges(userId);
    for (const ub of userBadges) {
      totalScore += ub.badge.pointValue;
    }

    const displayCases = await storage.getDisplayCases(userId);
    const caseCount = displayCases.length;
    let cardCount = 0;
    let totalValue = 0;
    let cardsWithValue = 0;
    let totalViews = 0;
    let publicCases = 0;

    for (const dc of displayCases) {
      totalViews += dc.viewCount;
      if (dc.isPublic) publicCases++;
      for (const card of dc.cards) {
        cardCount++;
        if (card.estimatedValue) {
          totalValue += card.estimatedValue;
          cardsWithValue++;
        }
      }
    }

    const badgesToCheck = [
      { id: "first-case", condition: caseCount >= 1 },
      { id: "five-cases", condition: caseCount >= 5 },
      { id: "ten-cases", condition: caseCount >= 10 },
      { id: "first-card", condition: cardCount >= 1 },
      { id: "ten-cards", condition: cardCount >= 10 },
      { id: "fifty-cards", condition: cardCount >= 50 },
      { id: "hundred-cards", condition: cardCount >= 100 },
      { id: "first-value", condition: cardsWithValue >= 1 },
      { id: "hundred-value", condition: totalValue >= 100 },
      { id: "thousand-value", condition: totalValue >= 1000 },
      { id: "ten-thousand-value", condition: totalValue >= 10000 },
      { id: "pro-member", condition: user.subscriptionStatus === "PRO" },
      { id: "first-share", condition: publicCases >= 1 },
      { id: "views-100", condition: totalViews >= 100 },
      { id: "views-1000", condition: totalViews >= 1000 },
    ];

    for (const check of badgesToCheck) {
      if (check.condition) {
        const hasBadge = await storage.hasUserBadge(userId, check.id);
        if (!hasBadge) {
          const badge = await storage.getBadge(check.id);
          if (badge) {
            await storage.awardBadge(userId, check.id);
            totalScore += badge.pointValue;
            newBadges.push(badge.name);
            
            await storage.createNotification(userId, "badge_earned", {
              badgeId: check.id,
              badgeName: badge.name,
              badgeIcon: badge.icon,
            });
          }
        }
      }
    }

    const tier = calculateTier(totalScore);
    await storage.updateUserScore(userId, totalScore, tier);

    return { score: totalScore, tier, newBadges };
  }

  async awardActivityBadge(userId: string, badgeId: string): Promise<boolean> {
    const hasBadge = await storage.hasUserBadge(userId, badgeId);
    if (hasBadge) return false;

    const badge = await storage.getBadge(badgeId);
    if (!badge) return false;

    await storage.awardBadge(userId, badgeId);
    
    await storage.createNotification(userId, "badge_earned", {
      badgeId: badge.id,
      badgeName: badge.name,
      badgeIcon: badge.icon,
    });

    await this.recalculateUserPrestige(userId);
    return true;
  }

  async checkAndAwardLikeBadge(userId: string): Promise<void> {
    await this.awardActivityBadge(userId, "first-like");
  }

  async checkAndAwardCommentBadge(userId: string): Promise<void> {
    await this.awardActivityBadge(userId, "first-comment");
  }

  async checkAndAwardBookmarkBadge(userId: string): Promise<void> {
    await this.awardActivityBadge(userId, "first-bookmark");
  }

  async checkAndAwardOfferBadge(userId: string): Promise<void> {
    await this.awardActivityBadge(userId, "first-offer");
  }

  async checkAndAwardOfferAcceptedBadge(userId: string): Promise<void> {
    await this.awardActivityBadge(userId, "offer-accepted");
  }
}

export const prestigeService = new PrestigeService();
