import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import type { Express } from "express";
import { storage } from "./storage";
import { sendWelcomeEmail, sendNewSignupNotification } from "./email";

export function setupGoogleAuth(app: Express) {
  // To enable Google login:
  // 1. Create an OAuth 2.0 Client ID in Google Cloud Console (APIs & Services → Credentials)
  // 2. Application type: Web application
  // 3. Add Authorized redirect URI: https://<your-production-domain>/api/auth/google/callback
  // 4. Set secrets in Replit: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  // 5. Set env: GOOGLE_CALLBACK_URL=https://<your-production-domain>/api/auth/google/callback
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.log("[GoogleAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google login disabled");
    return;
  }

  const domain = (process.env.REPLIT_DOMAINS || "").split(",")[0].trim();
  const fallbackCallbackURL = domain
    ? `https://${domain}/api/auth/google/callback`
    : "http://localhost:5000/api/auth/google/callback";

  const productionCallbackURL = process.env.GOOGLE_CALLBACK_URL || fallbackCallbackURL;

  const strategy = new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL: productionCallbackURL,
      scope: ["profile", "email"],
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: (error: any, user?: any) => void
    ) => {
      try {
        const emailObj = profile.emails?.[0];
        const email = emailObj?.value?.toLowerCase();
        const emailVerified = (emailObj as any)?.verified !== false;
        const googleId = profile.id;
        const firstName = profile.name?.givenName || "";
        const lastName = profile.name?.familyName || "";
        const profileImageUrl = profile.photos?.[0]?.value || "";

        if (!email) {
          return done(new Error("No email returned from Google"));
        }

        if (!emailVerified) {
          console.warn(`[GoogleAuth] Unverified email attempted login: ${email}`);
          return done(new Error("Google email address is not verified"));
        }

        const existingUser = await storage.getUserByEmail(email);

        if (existingUser) {
          if (existingUser.googleId && existingUser.googleId !== googleId) {
            console.warn(
              `[GoogleAuth] googleId mismatch for email ${email}: stored=${existingUser.googleId} incoming=${googleId}`
            );
            return done(new Error("This email is already linked to a different Google account"));
          }

          if (!existingUser.googleId) {
            await storage.updateGoogleId(existingUser.id, googleId);
          }

          const sessionUser = {
            claims: { sub: existingUser.id },
            authProvider: "google" as const,
          };
          return done(null, sessionUser);
        }

        const newUserId = crypto.randomUUID();
        const { user: newUser, isNewUser } = await storage.upsertUser({
          id: newUserId,
          email,
          firstName,
          lastName,
          profileImageUrl,
          googleId,
        });

        if (isNewUser && newUser.email) {
          const userName = [newUser.firstName, newUser.lastName].filter(Boolean).join(" ");
          sendWelcomeEmail(newUser.email, userName).catch((err) =>
            console.error("Failed to send welcome email:", err)
          );
          sendNewSignupNotification(userName, newUser.email, "google").catch(() => {});
        }

        const sessionUser = {
          claims: { sub: newUser.id },
          authProvider: "google" as const,
        };
        return done(null, sessionUser);
      } catch (error) {
        console.error("[GoogleAuth] Error in verify callback:", error);
        return done(error);
      }
    }
  );

  passport.use("google", strategy);

  app.get("/api/auth/google", (req, res, next) => {
    if (req.query.returnTo && typeof req.query.returnTo === "string") {
      const returnTo = req.query.returnTo;
      if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        (req.session as any).returnTo = returnTo;
      }
    }

    const rememberMe = req.query.remember === "true";
    (req.session as any).rememberMe = rememberMe;

    passport.authenticate("google", {
      scope: ["profile", "email"],
      prompt: "select_account",
    })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", {
      failureRedirect: "/?auth_error=google_failed",
    })(req, res, (err: any) => {
      if (err) {
        console.error("[GoogleAuth] Callback error:", err);
        return res.redirect("/?auth_error=google_failed");
      }

      const rememberMe = (req.session as any).rememberMe;
      const returnTo = (req.session as any).returnTo || "/";
      const user = req.user;

      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error("[GoogleAuth] Session regeneration error:", regenerateErr);
          return res.redirect("/?auth_error=session_error");
        }

        req.session.passport = { user };
        (req.session as any).returnTo = undefined;
        (req.session as any).rememberMe = undefined;

        if (rememberMe) {
          const EXTENDED_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
          req.session.cookie.maxAge = EXTENDED_SESSION_TTL;
        }

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[GoogleAuth] Session save error:", saveErr);
            return res.redirect("/?auth_error=session_error");
          }
          res.redirect(returnTo);
        });
      });
    });
  });

  console.log("[GoogleAuth] Google OAuth strategy registered");
}
