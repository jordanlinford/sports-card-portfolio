import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { sendWelcomeEmail } from "./email";


const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

// Session TTL constants
export const DEFAULT_SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week
export const EXTENDED_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days for "stay logged in"

export function getSession() {
  const sessionTtl = DEFAULT_SESSION_TTL;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: EXTENDED_SESSION_TTL, // Use max TTL for store, cookie controls actual expiry
    tableName: "sessions",
  });
  const isProduction = process.env.NODE_ENV === "production";
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true, // Always true for Replit (uses HTTPS)
      sameSite: "none" as const, // Required for cross-origin auth flows
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  const { user, isNewUser } = await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
  
  if (isNewUser && user.email) {
    const userName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    sendWelcomeEmail(user.email, userName).catch((err) => 
      console.error("Failed to send welcome email:", err)
    );
  }
}


export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    const rememberMe = req.query.remember === "true";
    (req.session as any).rememberMe = rememberMe;
    
    if (req.query.returnTo && typeof req.query.returnTo === "string") {
      const returnTo = req.query.returnTo;
      if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        (req.session as any).returnTo = returnTo;
      }
    }
    
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, (err: any) => {
      if (err) return next(err);
      
      if ((req.session as any).rememberMe) {
        req.session.cookie.maxAge = EXTENDED_SESSION_TTL;
        delete (req.session as any).rememberMe;
        console.log("[Auth] Extended session for 'stay logged in' - 30 days");
      }
      
      const returnTo = (req.session as any).returnTo || "/";
      delete (req.session as any).returnTo;
      res.redirect(returnTo);
    });
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    const isGoogleUser = user?.authProvider === "google";

    req.logout(() => {
      if (isGoogleUser) {
        res.redirect("/");
      } else {
        res.redirect(
          client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href
        );
      }
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.claims?.sub) {
    console.log("[Auth] Unauthorized - isAuthenticated:", req.isAuthenticated(), "user:", !!user);
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (user.authProvider === "google") {
    return next();
  }

  if (!user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    console.log("[Auth] Token refresh failed:", error);
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
