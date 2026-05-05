# Sports Card Portfolio
A web application for sports card collectors to manage, analyze, and grow their collections with AI-powered market intelligence.

## Run & Operate
- **Run Dev Server**: `npm run dev`
- **Build**: `npm run build`
- **Typecheck**: `npm run typecheck`
- **Codegen (Drizzle)**: `npm run generate:drizzle`
- **DB Push (Drizzle)**: `npm run db:push`
- **Env Vars**: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REPLIT_APP_CLIENT_ID`, `REPLIT_APP_CLIENT_SECRET`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY`, `GEMINI_API_KEY`, `SERPER_API_KEY`, `QA_LOGIN_TOKEN` (for QA login bypass and regression tests)

## Stack
- **Frontend**: React 18, TypeScript, Wouter, shadcn/ui (Radix UI, Tailwind CSS), TanStack Query, React Hook Form, Zod
- **Backend**: Express.js, TypeScript, Passport.js
- **Database**: PostgreSQL with Drizzle ORM
- **Runtime**: Node.js
- **Build Tool**: Vite (client), esbuild (server)

## Where things live
- **Frontend Source**: `client/src/`
- **Backend Source**: `server/src/`
- **Database Schema**: `server/src/db/schema.ts`
- **API Routes**: `server/src/routes/api/`
- **Shared Utilities/Types**: `server/src/common/`
- **UI Components**: `client/src/components/ui/`
- **Styling**: `client/src/index.css`, `tailwind.config.cjs`

## Architecture decisions
- **AI-first Valuation**: Gemini 2.5 Flash is central for vision-based scanning, 1-of-1 valuation, and orchestrating complex market analysis via function calling tools.
- **Dual-Provider Authentication**: Supports Google OAuth and Replit OpenID Connect with account merging for flexibility.
- **Robust Market Scoring Engine V2**: Utilizes mathematically consistent continuous formulas, sample-size normalization, tiered volatility dampening, and advanced signal weighting for nuanced market verdicts. Includes specific handling for high-volume players and zero-data scenarios.
- **Alpha Data Infrastructure**: Granular capture of price observations and interest events, feeding a nightly batch job and signal engine to generate daily buy/sell/hold signals.
- **Realistic Sealed Product ROI**: EV calculations for sealed products incorporate real-world corrections like transaction friction, illiquidity haircuts, eBay fees, and median sold prices to provide actionable insights.
- **Verdict Regression Testing**: Automated weekly tests ensure consistency of market verdicts over time, flagging significant changes for review.

## Product
- **Collection Management**: CRUD for cards and display cases, tagging, duplicate detection.
- **Market Intelligence**: AI-powered value tracking, real-time eBay comparisons, historical data, price lookups, investment outlooks.
- **AI Tools**: Card image scanning, 1-of-1 card valuation, Card Advisor for portfolio auditing.
- **Subscription Model**: Free and Pro tiers with advanced features like batch scanning/analysis and portfolio-specific recommendations.
- **Social Features**: Liking, commenting, sharing display cases, prestige system.
- **Reporting & Alerts**: Price trend charts, graded value matrix, supply saturation alerts, watchlist changes.
- **Market Leaderboards**: Ranked views of player markets (Best, Hype/Sell Candidates, Emerging Opportunities).
- **Recommendation Engines**: Next Buys, Dual-Source Hidden Gems, Portfolio Alpha Benchmark.
- **SEO**: Public landing pages with live player signals.
- **Financial Tools**: Break Value Auditor, Sealed Product ROI Calculator.

## User preferences
Preferred communication style: Simple, everyday language.

## Gotchas
- **API Response Shape Changes**: Any change in the shape of a backend response field (e.g., string to object) requires an atomic audit and update of all frontend consumers in the same commit to prevent latent crashes.
- **QA Login Token**: The `QA_LOGIN_TOKEN` is critical for automated testing agents and triggering regression tests. It must be provided as an `x-qa-token` header.

## API Response Shape Changes

When a backend response field changes shape (primitive ↔ structured type, field added/removed, nullability changed), every frontend consumer reading that field must be audited atomically with the change. Treating shape changes as local fixes ships latent crashes.

Audit pattern:

1. Grep client/src/ for the field name combined with string methods (.replace, .toUpperCase, .split, .toFixed), array methods (.map, .filter where field is assumed iterable), map lookups (MAP[field]), and direct JSX renders ({field})

2. Classify each hit: typed utility function (safe) | API consumer (must audit) | newly-added component (highest risk - test specifically)

3. Fix all API consumers in the same commit as the shape change. TSC clean before ship.

Today's example: verdict shape changed from string to {verdict, modifier, ...} object. Three components added by parallel work assumed the old string shape. Production crashed site-wide on every page render until rolled back and patched.

## Pointers
- **Drizzle ORM Docs**: _Populate as you build_
- **Radix UI Docs**: _Populate as you build_
- **Tailwind CSS Docs**: _Populate as you build_
- **React Hook Form Docs**: _Populate as you build_
- **Zod Docs**: _Populate as you build_
- **Passport.js Docs**: _Populate as you build_
- **Gemini API Docs**: _Populate as you build_
## Shipping Pages Without Backend
Before merging any commit that adds a new Route in App.tsx or new client-side navigation entry, verify the corresponding server route exists. Quick smoke check:

1. Grep ALL server files (not just routes.ts): grep -rn your-route-path server/
2. Confirm the route is actually wired into the Express app (registered, not just defined)
3. Hit the endpoint with curl to confirm it responds (200 or expected error, not 404)

If the route is missing or unwired, either implement it in the same commit or dont ship the page yet.

Todays example: client/src/pages/track-record.tsx initially appeared dead because routes were grepped only in server/routes.ts. The actual registration was in server/index.ts. Routes can be registered in multiple files - check all of server/.

## Destructive Audit Findings Need Higher Verification Bar
When an audit finding leads to a destructive action (delete code, revert commits, drop data, remove pages), the verification bar is higher than for additive actions. Wrong feature-is-broken investigation is recoverable. Wrong feature-is-dead-delete-it decision often is not.

Before destructive action based on an audit finding:
1. Verify the finding from at least two angles (different greps, runtime check, log inspection)
2. Surface the verification evidence, not just the conclusion
3. Get explicit human approval citing the verified evidence

Todays example: audit concluded /track-record page was dead because routes were not found in server/routes.ts. The route exists in server/index.ts. The agent caught its own false finding before executing the deletion that had been approved based on it.
