import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import type { Express } from "express";
import { storage } from "./storage";
import { sendWelcomeEmail } from "./email";

export function setupGoogleAuth(app: Express) {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.log("[GoogleAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google login disabled");
    return;
  }

  const callbackURL = process.env.REPLIT_DEPLOYMENT
    ? `https://${process.env.REPLIT_DEPLOYMENT_URL}/api/auth/google/callback`
    : `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/auth/google/callback`;

  const productionCallbackURL = process.env.GOOGLE_CALLBACK_URL || callbackURL;

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
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const firstName = profile.name?.givenName || "";
        const lastName = profile.name?.familyName || "";
        const profileImageUrl = profile.photos?.[0]?.value || "";

        if (!email) {
          return done(new Error("No email returned from Google"));
        }

        let existingUser = await storage.getUserByEmail(email);

        if (existingUser) {
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

      if ((req.session as any).rememberMe) {
        const EXTENDED_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
        req.session.cookie.maxAge = EXTENDED_SESSION_TTL;
        delete (req.session as any).rememberMe;
      }

      const returnTo = (req.session as any).returnTo || "/";
      delete (req.session as any).returnTo;
      res.redirect(returnTo);
    });
  });

  console.log("[GoogleAuth] Google OAuth strategy registered");
}
