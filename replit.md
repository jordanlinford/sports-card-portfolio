# Sports Card Portfolio

## Overview
Sports Card Portfolio is a web application for collectors to manage, analyze, and grow their sports card collections. It provides AI-powered market intelligence, real eBay comparisons, and investment-focused tools. Key features include portfolio management, personalized buy recommendations, and collection sharing, with advanced features available for Pro users. The project aims to offer a comprehensive platform for sports card investment and management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, and Wouter for routing. It utilizes `shadcn/ui` components based on Radix UI and Tailwind CSS for a modern, responsive design. The visual style emphasizes card-focused layouts, clean aesthetics, DM Sans typography, and a HSL-based color system with CSS variables for dynamic theming.

### Technical Implementations
The application uses a full-stack TypeScript architecture. The frontend manages server state with TanStack Query, handles forms with React Hook Form and Zod, and implements theme management via React Context. The backend, built with Express.js, features dual-provider authentication using Passport.js (Google OAuth as primary, Replit OpenID Connect as a legacy fallback) with session management backed by PostgreSQL. Google Cloud Storage (via Replit Object Storage) is used for image uploads. Key features include CRUD operations for cards and display cases, a Stripe-based subscription model (Free and Pro tiers), AI-powered value tracking, a Gemini 2.5 Flash vision-based card image scanner, and sophisticated 1-of-1 card valuation. Pro features include batch scanning, batch card analysis, growth projections, and portfolio-specific buy recommendations.

### Feature Specifications
- **Card and Display Case Management**: Full CRUD operations with visibility settings.
- **Subscription Model**: Free and Pro tiers managed via Stripe.
- **Authentication**: Dual-provider Passport.js with Google OAuth and Replit OpenID Connect, supporting account merging.
- **Image Handling**: Google Cloud Storage integration for card image uploads.
- **Value Tracking & AI**: AI-powered market intelligence, historical data, price lookups, and investment outlooks.
- **Card Image Scanner**: Gemini 2.5 Flash for card identification, supporting various workflows and daily scan limits.
- **Scan History**: Automatic saving and management of all card scans.
- **Batch Scanning (Pro-only)**: Multi-image upload for sequential processing of cards.
- **Batch Card Analysis (Pro-only)**: Analyze multiple unanalyzed cards with real-time progress and summary.
- **1-of-1 Card Valuation**: Automated detection and valuation of rare cards using Gemini AI and triangulation.
- **AI Player Registry Refresh**: Admin tool for bulk updating player data using Gemini AI.
- **Role Stability System**: 6-tier player role classification influencing investment recommendations.
- **Unified Usage Tracking**: Consistent enforcement of free tier limits.
- **Display Customization**: Multiple layout styles and premium themes for display cases.
- **Collection Organization**: Tagging, automatic case generation, and duplicate detection.
- **Social Features**: Liking, commenting, prestige system, bookmarking, and shareable display cases with rich previews.
- **Leaderboards**: Public display of top display cases.
- **Trading & Communication**: Offers system and direct messaging.
- **Growth Projections (Pro)**: AI-powered collection growth forecasts.
- **Monthly Price Trend Charts**: 18-month historical price charts.
- **Graded Value Matrix**: Estimates graded values for raw cards with grading recommendations.
- **Raw Card Price Accuracy**: Direct use of Gemini's raw price estimates.
- **Supply Saturation Alert**: Alerts for surging grading volume of specific cards. Now backed by real `pop_history` table data when available, falling back to AI estimates.
- **Pop Report History**: `pop_history` table stores weekly population snapshots from grading houses (PSA, BGS, SGC). VPS scraper POSTs to `POST /api/pop-history/ingest` (API key auth via `POP_INGESTION_API_KEY` env var). Query trends at `GET /api/pop-history/trends/:playerName` and raw history at `GET /api/pop-history/:playerName`.
- **Liquidity Scoring UI**: Visual badges for market health and exit risk.
- **Portfolio-Specific Next Buys (Pro)**: AI recommendations tailored to portfolio themes.
- **Next Buys Recommendation Engine**: Balanced, investment-focused recommendation system.
- **Podcast Landing Page & Pro Trial**: Public landing page with a 7-day Pro trial.
- **Dual-Source Hidden Gems**: Discovery of undervalued players via AI and community signals.
- **Portfolio Alpha Benchmark**: Compares portfolio performance against market benchmarks like S&P 500 and Bitcoin.
- **Nightly Player Outlook Refresh**: Automated refresh of public player outlook pages for SEO.
- **Agent Mode (Pro-only)**: AI-powered portfolio auditor sidebar (⌘+K toggle). Gemini 2.5 Flash with function-calling orchestrates 8 tools: portfolio summary, player outlooks, real-time news, eBay market data, display case inspection, hidden gems, market benchmarks, full collection scan. SSE streaming bypasses 120s timeout. Service: `server/agentService.ts`. Route: `GET /api/agent/stream?q=`. Frontend: `client/src/components/AgentSidebar.tsx`, `client/src/hooks/use-agent.ts`.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **API**: RESTful API design.
- **Build Process**: Vite for client, esbuild for server.
- **Session Management**: Secure, HttpOnly cookies with PostgreSQL-backed sessions.
- **Unified Card Analysis**: Single Gemini 2.5 Flash call for comprehensive market analysis.
- **SSP/Case Hit Parallel Detection**: Advanced detection and pricing of premium parallels.
- **Chrome Insert Scanner Accuracy**: Enhanced scanner prompts to differentiate various chrome inserts.
- **Numbered Card Parallel Isolation**: Strict enforcement of print-run matching for numbered cards.
- **Gemini-First Pricing Philosophy**: Gemini analysis as the primary pricing source with legacy fallbacks.
- **Player Outlook Parallelization**: Parallel fetching of news and market data.
- **eBay Comps Caching**: Stale-while-revalidate pattern with extended TTLs.
- **Player News Caching**: 4-hour in-memory cache for news results.
- **VPS Worker Architecture**: Dedicated-IP VPS for eBay scraper.
- **Hidden Gems Auto-Refresh**: Weekly scheduled job for refreshing Hidden Gems.
- **Unified Analysis DB Cache**: Persistent caching of Gemini analysis results in PostgreSQL.
- **Premium Numbered Parallel Detection**: Specific detection and handling for premium numbered parallels.

## External Dependencies

### Third-Party Services
- **Replit Services**: Replit Auth (OpenID Connect), Replit Object Storage (Google Cloud Storage).
- **Stripe**: Payment processing for subscriptions.
- **OpenAI GPT & Serper API**: AI-powered lookups and real-time news for recommendations.
- **Yahoo Finance**: For S&P 500 market data.
- **CoinGecko**: For Bitcoin market data.

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