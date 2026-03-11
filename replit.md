# Sports Card Portfolio

## Overview
Sports Card Portfolio is a web application designed for collectors to track, analyze, and grow their sports card collections. It provides AI-powered market intelligence, real eBay comps, and investment-focused tools that treat players like stocks. The platform enables users to manage portfolios, get personalized buy recommendations, and share their collections. Pro features are available for serious collectors.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript, Wouter for routing, and shadcn/ui components built on Radix UI and Tailwind CSS. The design system features card-focused layouts, clean spacing, DM Sans typography, and a HSL-based color system with CSS variables for theming.

### Technical Implementations
The application is a full-stack TypeScript project. The frontend uses TanStack Query for server state, React Hook Form with Zod for form handling, and React Context for theme management. The backend is built with Express.js, handling authentication via Replit Auth (OpenID Connect) and session management with `express-session` backed by PostgreSQL. Google Cloud Storage, accessed via Replit Object Storage, manages file uploads.

### Feature Specifications
- **Card and Display Case Management**: CRUD operations for cards and display cases, including visibility settings.
- **Subscription Model**: Free and Pro tiers managed via Stripe.
- **Authentication**: Secure user authentication and authorization using Replit Auth.
- **Image Handling**: Integration with Google Cloud Storage for card image uploads.
- **Value Tracking & AI**: Tracks estimated card values with historical data and offers AI-powered price lookups and card outlook analysis (buy/watch/sell recommendations) for Pro users. Includes Card Analysis for analyzing cards before purchase.
- **Card Image Scanner**: Gemini 2.5 Flash vision-based card identification from photos, identifying player, year, set, variation, grade, and grading company. It supports a Card Analysis Workflow (scan, confirm, action) and an Add Card Scan Workflow (scan, auto-fill, review, add to collection). Scanned images persist throughout workflows. Daily scan limits apply (10 for free, 100 for Pro).
- **Scan History**: Automatically saves all card scans, allowing users to browse, re-analyze, add to collection, or delete entries.
- **Batch Scanning (Pro-only)**: Multi-image upload for processing up to 20 cards sequentially with progress tracking and per-card actions (analyze, add to collection) and batch add to collection functionality.
- **1-of-1 Card Valuation**: Automatic detection of 1/1 cards and low-pop cards (/1-/5), using Gemini with Google Search grounding and a triangulation engine — Gemini searches for vertical comps (/5, /10, /25 parallels), applies hobby-standard multipliers, checks horizontal comps (same-tier player 1/1s), and adjusts for brand tier. Parallel comp fallback in priceService as secondary source. Dedicated `fetchLowPopFallbackPrice` function provides triangulation-based pricing when unified analysis fails for /1-/5 cards. Cross-validation pull-down guards skip low-pop cards to prevent legacy comps from deflating rare card values.
- **AI Player Registry Refresh**: Admin feature to bulk-update player career stages and role tiers using Gemini AI with Google Search grounding, with admin review and approval.
- **Role Stability System**: 6-tier player role classification impacting investment verdicts and recommendations, with AI news search influencing role status.
- **Unified Usage Tracking**: Tracks collection and quick analyses for consistent free tier enforcement.
- **Display Customization**: Multiple layout styles and premium themes for display cases.
- **Collection Organization**: Card tagging, automatic case generation, and duplicate detection.
- **Social Features**: Liking, commenting, prestige system, and bookmarking.
- **Leaderboards**: Public page showing top 5 display cases ranked by likes, total value, and views. Accessible from main navigation.
- **Trading & Communication**: Offers system for cards and direct messaging.
- **Analytics & Sharing**: Portfolio analytics and viral sharing features.
- **Growth Projections (Pro)**: AI-powered personalized collection growth forecasts.
- **Monthly Price Trend Charts**: 18-month lookback price charts using Gemini AI with Google Search grounding for eBay sold data, available on player and card outlook pages.
- **Graded Value Matrix**: For raw cards, shows estimated PSA 9 and PSA 10 values with a "Grade It?" recommendation based on cost vs. value increase.
- **Raw Card Price Accuracy**: Multi-layer system preventing graded card prices from inflating raw card valuations, using Gemini prompts for separate raw and graded prices. Price-trend guard only trusts monthly history data backed by real sales (salesCount > 0); trend data with all-zero sales is flagged as fabricated and skipped to prevent hallucinated price fallbacks.
- **Liquidity Scoring UI**: Visual badges indicating market health and exit risk for cards, with Pro users seeing divergence warnings.
- **Portfolio-Specific Next Buys (Pro)**: AI-powered recommendations tailored to display case themes, suggesting complementary cards with pricing and investment rationale.
- **Next Buys Recommendation Engine**: Balanced, investment-focused recommendation system using diverse sources like watchlists, breakout players, team themes, hidden gems, and market outlook, with intelligent source selection and scoring.
- **Podcast Landing Page & Pro Trial**: Public landing page offering a 7-day Pro trial on signup, with trial status tracking and an app-wide trial banner.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **API**: RESTful API design.
- **Build Process**: Vite for client bundling and esbuild for server bundling.
- **Session Management**: Secure, HttpOnly cookies with a 7-day TTL, storing session data in PostgreSQL.
- **Unified Card Analysis**: Single Gemini 2.5 Flash call for market pricing, player news, and investment verdict, reducing analysis time.
- **SSP/Case Hit Parallel Detection**: Premium unnumbered parallels (Zebra, Tiger Stripe, Color Blast, Shock, Downtown, Kaboom, Mojo, Shimmer, etc.) are explicitly detected and priced separately from base/silver parallels. Search broadening protects SSP keywords from being dropped.
- **Player Outlook Parallelization**: News signals and market data fetched via `Promise.all` in parallel, reducing outlook generation time by ~4-8 seconds.
- **eBay Comps Caching**: Stale-while-revalidate (SWR) pattern with extended TTLs and query broadening.
- **Player News Caching**: 4-hour in-memory cache for `fetchPlayerNews` results.
- **VPS Worker Architecture**: Dedicated-IP VPS for eBay scraper for improved reliability.

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