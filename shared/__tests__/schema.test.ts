import { describe, it, expect } from "vitest";
import { hasProAccess } from "../schema";
import type { User } from "../schema";

/**
 * Build a minimal User object for testing.
 * Only the fields used by hasProAccess matter; the rest are filled with defaults.
 */
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-user-id",
    email: null,
    firstName: null,
    lastName: null,
    handle: null,
    profileImageUrl: null,
    subscriptionStatus: "FREE",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    googleId: null,
    isAdmin: false,
    collectorScore: 0,
    collectorTier: "bronze",
    trialStart: null,
    trialEnd: null,
    trialSource: null,
    lastLoginAt: null,
    loginCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

describe("hasProAccess", () => {
  it("returns true for PRO users", () => {
    const user = makeUser({ subscriptionStatus: "PRO" });
    expect(hasProAccess(user)).toBe(true);
  });

  it("returns true during active trial", () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const user = makeUser({ trialEnd: future });
    expect(hasProAccess(user)).toBe(true);
  });

  it("returns false after trial expiry", () => {
    const past = new Date();
    past.setDate(past.getDate() - 7);
    const user = makeUser({ trialEnd: past });
    expect(hasProAccess(user)).toBe(false);
  });

  it("returns false for free users with no trial", () => {
    const user = makeUser({ subscriptionStatus: "FREE" });
    expect(hasProAccess(user)).toBe(false);
  });

  it("returns false for null user", () => {
    expect(hasProAccess(null)).toBe(false);
  });

  it("returns false for undefined user", () => {
    expect(hasProAccess(undefined)).toBe(false);
  });
});
