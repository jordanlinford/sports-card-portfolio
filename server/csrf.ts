import { doubleCsrf } from "csrf-csrf";
import type { RequestHandler } from "express";

const {
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || "csrf-fallback-secret",
  cookieName: "__csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "none" as const,
    secure: true,
    path: "/",
  },
  getTokenFromRequest: (req) =>
    req.headers["x-csrf-token"] as string | undefined,
});

/**
 * Middleware that generates a CSRF token and sets it in a response header.
 * The frontend should read `x-csrf-token` from the response and send it
 * back on subsequent state-changing requests.
 */
export const csrfTokenProvider: RequestHandler = (req, res, next) => {
  const token = generateToken(req, res);
  res.setHeader("x-csrf-token", token);
  next();
};

/**
 * Middleware that validates the CSRF token on state-changing requests.
 * Skips GET, HEAD, OPTIONS requests and webhook endpoints.
 */
export const csrfProtection: RequestHandler = (req, res, next) => {
  // Skip safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  // Skip Stripe webhooks (they use signature verification instead)
  if (req.path === "/api/stripe/webhook" || req.path === "/api/webhooks/stripe") {
    return next();
  }
  // Skip auth callback routes (redirects from OAuth providers)
  if (req.path === "/api/callback" || req.path === "/api/auth/google/callback") {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
};
