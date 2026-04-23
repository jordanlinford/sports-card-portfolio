import { doubleCsrf } from "csrf-csrf";
import type { RequestHandler } from "express";

const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || "csrf-fallback-secret",
  getSessionIdentifier: (req) =>
    (req as any).sessionID ||
    (req as any).session?.id ||
    req.ip ||
    "anonymous",
  cookieName: "__csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "none" as const,
    secure: true,
    path: "/",
  },
  getCsrfTokenFromRequest: (req) =>
    req.headers["x-csrf-token"] as string | undefined,
});

export const csrfTokenProvider: RequestHandler = (req, res, next) => {
  try {
    const token = generateCsrfToken(req, res);
    res.setHeader("x-csrf-token", token);
  } catch (err) {
    // Don't fail the request if token generation fails
    console.warn("[CSRF] token generation failed:", (err as Error).message);
  }
  next();
};

export const csrfProtection: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  // Skip Stripe webhooks (use signature verification instead)
  if (req.path.startsWith("/api/stripe/webhook") || req.path === "/api/webhooks/stripe") {
    return next();
  }
  // Skip OAuth callbacks (POST from external providers)
  if (req.path === "/api/callback" || req.path === "/api/auth/google/callback") {
    return next();
  }
  // Skip QA login (used by automated tests with header token instead)
  if (req.path === "/api/auth/qa-login") {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
};
