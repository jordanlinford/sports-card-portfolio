# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Express + Vite HMR) on port 5000
npm run build        # Build for production (esbuild server → dist/index.cjs, Vite client → dist/public/)
npm run start        # Run production build
npm run check        # TypeScript type-check (no emit)
npm run db:push      # Push Drizzle schema changes to PostgreSQL
```

There are no test or lint commands configured.

## Architecture

Full-stack TypeScript app for sports card portfolio management with AI-powered market intelligence.

### Three-layer structure

- **`client/src/`** — React 18 SPA. Wouter for routing, TanStack Query for server state, shadcn/ui (Radix + Tailwind) for components. Entry: `App.tsx` defines all routes (public and auth-gated).
- **`server/`** — Express.js API. All routes defined in `routes.ts` (single large file, 6000+ lines). Entry: `index.ts` boots Express, registers routes, starts background workers.
- **`shared/`** — Shared between client and server. `schema.ts` contains all Drizzle ORM table definitions and Zod insert schemas.

### Path aliases

- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

Configured in both `tsconfig.json` (for TS) and `vite.config.ts` (for bundling).

### Database

PostgreSQL 16 via Drizzle ORM. Connection pool in `server/db.ts`. All tables defined in `shared/schema.ts` with `drizzle-zod` for auto-generated validation schemas. Sessions stored in PostgreSQL via `connect-pg-simple`.

### Authentication

Dual-provider via Passport.js:
- **Google OAuth** (`server/googleAuth.ts`) — primary auth in production
- **Replit OpenID Connect** (`server/replitAuth.ts`) — for Replit environment
- **QA bypass** — `POST /api/auth/qa-login` with `x-qa-token` header matching `QA_LOGIN_TOKEN` env var

Auth middleware: `isAuthenticated` from `replitAuth.ts` gates protected routes.

### Key server services

| File | Purpose |
|------|---------|
| `routes.ts` | All API endpoints (single file) |
| `storage.ts` | Database CRUD operations (repository pattern) |
| `ebayCompsService.ts` | eBay market comparison data via VPS scraper |
| `cardImageScannerService.ts` | Gemini 2.5 Flash vision for card scanning |
| `playerOutlookEngine.ts` | Player market sentiment analysis |
| `marketScoringEngine.ts` | 6-factor weighted market scoring (Demand/Momentum/Liquidity/Supply/Anti-Hype/Volatility) |
| `investmentDecisionEngine.ts` | Verdict generation (ACCUMULATE/TRADE_THE_HYPE/HOLD_CORE/SPECULATIVE_FLYER/AVOID) |
| `alphaEngine.ts` | Nightly batch job producing BUY/SELL/HOLD signals |
| `outlookEngine.ts` | Outlook orchestration and caching |
| `agentService.ts` | AI agent with Gemini function-calling (Card Advisor) |
| `scanWorker.ts` | Background queue processor for card image scans |

### Background jobs

Started in `server/index.ts`: scan worker, prewarm job, career stage job, hidden gems refresh, regression test scheduler. These run on timers/schedules within the Express process.

### Data flow for market analysis

1. User requests player outlook → `outlookEngine` orchestrates
2. `ebayCompsService` fetches sold comps (cached, stale-while-revalidate)
3. `marketScoringEngine` computes 6 weighted signals → composite score + phase
4. `investmentDecisionEngine` applies confidence gating + guardrails → verdict
5. Results cached in `player_outlook_cache` table
6. `alphaEngine` runs nightly, reading observations → producing signals in `card_signals`

### Frontend patterns

- Pages in `client/src/pages/`, components in `client/src/components/`
- UI primitives in `client/src/components/ui/` (shadcn/ui)
- API calls via TanStack Query hooks using `client/src/lib/queryClient.ts`
- Auth state via `useAuth()` hook
- Forms use React Hook Form + Zod resolvers

### Subscription model

Free and Pro tiers via Stripe. Pro access checked with `hasProAccess()` from `shared/schema.ts`. Stripe webhooks handled in `server/webhookHandlers.ts`.

## Environment Variables

Required for local development:

```
DATABASE_URL          # PostgreSQL connection string
SESSION_SECRET        # Express session secret
GOOGLE_CLIENT_ID      # Google OAuth
GOOGLE_CLIENT_SECRET  # Google OAuth
GOOGLE_CALLBACK_URL   # e.g. http://localhost:5000/auth/callback
AI_INTEGRATIONS_GEMINI_API_KEY  # Gemini API key (card scanning, outlooks)
```

Optional:
```
QA_LOGIN_TOKEN        # Enables QA login bypass
STRIPE_PRICE_ID       # Stripe Pro tier price
ZOHO_EMAIL / ZOHO_APP_PASSWORD  # Email via Zoho SMTP
VITE_GA_MEASUREMENT_ID  # Google Analytics
```

Production env vars are managed through Replit Secrets.
