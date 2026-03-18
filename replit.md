# Sports Card Portfolio

## Overview
Sports Card Portfolio is a web application designed for collectors to track, analyze, and grow their sports card collections. It provides AI-powered market intelligence, real eBay comps, and investment-focused tools that treat players like stocks. The platform enables users to manage portfolios, get personalized buy recommendations, and share their collections. Pro features are available for serious collectors.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript, Wouter for routing, and shadcn/ui components built on Radix UI and Tailwind CSS. The design system features card-focused layouts, clean spacing, DM Sans typography, and a HSL-based color system with CSS variables for theming.

### Technical Implementations
The application is a full-stack TypeScript project. The frontend uses TanStack Query for server state, React Hook Form with Zod for form handling, and React Context for theme management. The backend is built with Express.js, handling authentication via dual-provider Passport.js (Google OAuth as primary, Replit OpenID Connect as legacy fallback) with session management via `express-session` backed by PostgreSQL. Google Cloud Storage, accessed via Replit Object Storage, manages file uploads.

### Feature Specifications
- **Card and Display Case Management**: CRUD operations for cards and display cases, including visibility settings.
- **Subscription Model**: Free and Pro tiers managed via Stripe.
- **Authentication**: Dual-provider auth via Passport.js — "Continue with Google" (OAuth 2.0) is the primary login method; "Sign in with Replit" remains as a legacy fallback. Email-based account merging safely links Google logins to existing Replit accounts. Session fixation protection via `session.regenerate()` on Google login. Logged-in Replit users see a dismissible banner prompting them to link their Google account. Required secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (set to production domain callback URL).
- **Image Handling**: Integration with Google Cloud Storage for card image uploads.
- **Value Tracking & AI**: Tracks estimated card values with historical data and offers AI-powered price lookups and card outlook analysis (buy/watch/sell recommendations) for Pro users. Includes Card Analysis for analyzing cards before purchase.
- **Card Image Scanner**: Gemini 2.5 Flash vision-based card identification from photos, identifying player, year, set, variation, grade, and grading company. It supports a Card Analysis Workflow (scan, confirm, action) and an Add Card Scan Workflow (scan, auto-fill, review, add to collection). Scanned images persist throughout workflows. Daily scan limits apply (3 for free, 100 for Pro).
- **Scan History**: Automatically saves all card scans, allowing users to browse, re-analyze, add to collection, or delete entries.
- **Batch Scanning (Pro-only)**: Multi-image upload for processing up to 20 cards sequentially with progress tracking and per-card actions (analyze, add to collection) and batch add to collection functionality.
- **Batch Card Analysis (Pro-only)**: "Analyze All" button on the Card Analysis page runs outlook analysis on all unanalyzed cards sequentially via SSE streaming. Shows real-time progress bar, per-card results, and summary stats (Buy/Sell/Big Mover counts). Users can stop mid-batch. Route: `POST /api/cards/batch-outlook`.
- **1-of-1 Card Valuation**: Automatic detection of 1/1 cards and low-pop cards (/1-/5), using Gemini with Google Search grounding and a triangulation engine — Gemini searches for vertical comps (/5, /10, /25, /50, /75, /99 parallels), applies hobby-standard multipliers, checks cross-set "sister" comps (same player, different sets), horizontal comps (same-tier player 1/1s), and adjusts for brand tier. Parallel comp fallback in priceService as secondary source. Dedicated `fetchLowPopFallbackPrice` function provides triangulation-based pricing when unified analysis fails or returns 0 sold comps for /1-/5 cards. Cross-validation pull-down guards skip low-pop cards to prevent legacy comps from deflating rare card values.
- **AI Player Registry Refresh**: Admin feature to bulk-update player career stages and role tiers using Gemini AI with Google Search grounding, with admin review and approval.
- **Role Stability System**: 6-tier player role classification impacting investment verdicts and recommendations, with AI news search influencing role status.
- **Unified Usage Tracking**: Tracks collection and quick analyses for consistent free tier enforcement.
- **Display Customization**: Multiple layout styles and premium themes for display cases.
- **Collection Organization**: Card tagging, automatic case generation, and duplicate detection.
- **Social Features**: Liking, commenting, prestige system, and bookmarking.
- **Leaderboards**: Public page showing top 5 display cases ranked by likes, total value, and views. Accessible from main navigation.
- **Trading & Communication**: Offers system for cards and direct messaging.
- **Analytics & Sharing**: Portfolio analytics and viral sharing features.
- **Growth Projections (Pro)**: AI-powered collection growth forecasts using conservative base rates, additive (not multiplicative) modifiers, and real card value history as an anchor when available. Career stage caps prevent unrealistic projections. Methodology text dynamically reports how many cards have historical data anchoring their projections.
- **Monthly Price Trend Charts**: 18-month lookback price charts using Gemini AI with Google Search grounding for eBay sold data, available on player and card outlook pages.
- **Graded Value Matrix**: For raw cards, shows estimated PSA 9 and PSA 10 values with a "Grade It?" recommendation based on cost vs. value increase.
- **Raw Card Price Accuracy**: Gemini prompts request separate raw and graded prices. Gemini's rawPrice field is trusted directly without post-processing correction (previous double-correction removed as it systematically undervalued raw cards).
- **Liquidity Scoring UI**: Visual badges indicating market health and exit risk for cards, with Pro users seeing divergence warnings.
- **Portfolio-Specific Next Buys (Pro)**: AI-powered recommendations tailored to display case themes, suggesting complementary cards with pricing and investment rationale.
- **Next Buys Recommendation Engine**: Balanced, investment-focused recommendation system using diverse sources like watchlists, breakout players, team themes, hidden gems, and market outlook, with intelligent source selection and scoring.
- **Podcast Landing Page & Pro Trial**: Public landing page offering a 7-day Pro trial on signup, with trial status tracking and an app-wide trial banner.
- **Dual-Source Hidden Gems**: Hidden Gems page combines two discovery methods — AI-driven market intelligence (Gemini scans all 4 sports for undervalued players) and community signals (players recently searched in the outlook cache with bullish verdicts + players collected by 2+ distinct users). Each gem is tagged with its source: "AI", "COMMUNITY", or "BOTH". Community picks display a blue badge; AI+Community picks display a purple badge. Source is stored in the `hidden_gems.source` column and set during each refresh.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **API**: RESTful API design.
- **Build Process**: Vite for client bundling and esbuild for server bundling.
- **Session Management**: Secure, HttpOnly cookies with a 7-day TTL, storing session data in PostgreSQL.
- **Unified Card Analysis**: Single Gemini 2.5 Flash call for market pricing, player news, and investment verdict, reducing analysis time.
- **SSP/Case Hit Parallel Detection**: Premium unnumbered parallels (Zebra, Tiger Stripe, Color Blast, Shock, Downtown, Kaboom, Mojo, Shimmer, etc.) are explicitly detected and priced separately from base/silver parallels. Search broadening protects SSP keywords from being dropped. SSP cards are exempted from outlier protection and cross-validation guards since wide price ranges are expected. Optic SSP inserts have enhanced Gemini prompts to prevent confusion with base Donruss pricing.
- **Numbered Card Parallel Isolation**: Gemini prompts enforce strict print-run matching — a /50 Gold comp is never mixed with a /399 Yellow Holo. When exact comps don't exist, tiered triangulation searches adjacent parallels (e.g., /99, /199, base) and applies scarcity logic to estimate value. Covers all numbered cards: /1 through /999+. Low-pop (/1-/25) uses expert judgment; mid-numbered (/26-/199) and high-numbered (/200+) use scarcity multiplier guidelines.
- **Gemini-First Pricing Philosophy**: The unified Gemini analysis (with Google Search grounding) is the primary pricing source. Legacy price lookups and monthly trend data serve as fallbacks only when Gemini returns no price. Cross-validation guards are log-only (no longer override Gemini). This prevents legacy comps from systematically undervaluing cards.
- **Player Outlook Parallelization**: News signals and market data fetched via `Promise.all` in parallel, reducing outlook generation time by ~4-8 seconds.
- **eBay Comps Caching**: Stale-while-revalidate (SWR) pattern with extended TTLs and query broadening.
- **Player News Caching**: 4-hour in-memory cache for `fetchPlayerNews` results.
- **VPS Worker Architecture**: Dedicated-IP VPS for eBay scraper for improved reliability.
- **Hidden Gems Auto-Refresh**: Weekly scheduled job (Monday 5 AM UTC) automatically refreshes Hidden Gems using dual-source discovery (AI + community signals). Community signal window is 30 days. Admin can still trigger manual refreshes. Fallback featured players shown when no gems exist.

## External Dependencies

### Third-Party Services
- **Replit Services**: Replit Auth (OpenID Connect), Replit Object Storage (Google Cloud Storage).
- **Stripe**: Payment gateway for subscriptions.
- **OpenAI GPT & Serper API**: AI-powered price lookups and real-time news for AI recommendations.

### Frontend Libraries
- **UI & Components**: Radix UI, Uppy, date-fns, Lucide React, shadcn/ui.
- **Form & Validation**: React Hook Form, Zod, @hookform/resolvers.
- **Styling**: Tailwind CSS, class-variance-authority, clsx, tailwind-merge.

### Backend Libraries
- **Database & ORM**: `pg`, `drizzle-orm`, `drizzle-zod`.
- **Authentication & Session**: `passport`, `openid-client`, `express-session`, `connect-pg-simple`.
- **Cloud Integration**: `@google-cloud/storage`.
- **Image Processing**: `Sharp`.
- **Utilities**: `memoizee`.