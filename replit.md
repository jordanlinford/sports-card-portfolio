# Sports Card Portfolio

## Overview
Sports Card Portfolio is a web application designed for collectors to track, analyze, and grow their sports card collections. It provides AI-powered market intelligence, real eBay comps, and investment-focused tools that treat players like stocks. The platform enables users to manage portfolios, get personalized buy recommendations, and share their collections — with Pro features for serious collectors.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend utilizes React 18 with TypeScript, Wouter for routing, and shadcn/ui components built on Radix UI and Tailwind CSS for a consistent and modern design. The design system emphasizes card-focused layouts, clean spacing, DM Sans typography, and a HSL-based color system with CSS variables for theming.

### Technical Implementations
The application is a full-stack TypeScript project. The frontend uses TanStack Query for server state, React Hook Form with Zod for form handling, and React Context for theme management. The backend is built with Express.js, handling authentication via Replit Auth (OpenID Connect) and session management with `express-session` backed by PostgreSQL. Google Cloud Storage, accessed via Replit Object Storage, manages file uploads.

### Feature Specifications
The application supports core functionalities including:
- **Card and Display Case Management**: CRUD operations for cards and display cases, including visibility settings.
- **Subscription Model**: Free and Pro tiers managed via Stripe for payments.
- **Authentication**: Secure user authentication and authorization using Replit Auth.
- **Image Handling**: Integration with Google Cloud Storage for card image uploads.
- **Value Tracking & AI**: Tracks estimated card values with historical data and offers AI-powered price lookups and card outlook analysis (buy/watch/sell recommendations) for Pro users. Includes Card Analysis for analyzing cards before purchase without adding to collection.
- **Card Image Scanner**: Gemini 2.5 Flash vision-based card identification from photos. Automatically identifies player, year, set, variation, grade, and grading company from card images.
  
  **Card Analysis Workflow** (for analyzing cards before buying):
  1. **Scan** - Fast identification-only (`/api/cards/scan-identify`) extracts card details without pricing
  2. **Confirm** - User reviews/edits detected fields with confidence indicators. Image automatically uploaded to object storage.
  3. **Action** - User can get Full Market Outlook (comprehensive analysis) or Add to Portfolio directly
  
  **Add Card Scan Workflow** (for adding cards to collection):
  - Available in display case edit page under "Add Card" → "Scan Photo" mode
  - Scans photo, auto-fills form fields with AI-identified card details
  - User reviews/edits prefilled fields, then adds to collection with one click
  - Scanned image persists throughout workflow and is saved with the card
  
  **Image Persistence**: Scanned card images persist throughout workflows and are displayed in analysis results. When adding to portfolio, the same scanned image is used - no need to re-upload.
  Daily limits: 10 scans/day for free users, 100 scans/day for Pro users.
- **Scan History**: Every card scan is automatically saved to a `scan_history` table. Users can browse past scans at `/scan-history`, re-analyze them (pre-fills Card Analysis form), add scanned cards to their collection, or delete entries. Accessible via "Scan History" link in the Market dropdown navigation. Schema: `scan_history` table with player/card details, image path, market value, and action. Backend: storage CRUD methods + `GET /api/scan-history` (paginated) + `DELETE /api/scan-history/:id`. The `scan-identify` endpoint auto-saves scans; `quick-analyze` updates the record with market value and verdict via `scanHistoryId`.
- **Batch Scanning** (Pro-only): Multi-image upload batch scan on the Card Analysis page. Users select multiple card photos at once, which are processed sequentially with a progress bar. Each card shows status (pending/processing/done/failed) with thumbnails, identified details, and confidence badges (High/Med/Low). Max 20 cards per batch. Includes cancel button mid-batch and completion toast summary. All scans auto-save to scan_history. Non-Pro users see a crown icon and upgrade prompt. Object URLs are properly cleaned up on completion/cancel/unmount. **Batch Add to Collection**: After batch scan completes, "Add All to Collection" button opens a dialog showing all successfully scanned cards with a display case picker. Bulk endpoint `POST /api/display-cases/:id/cards/bulk-from-scans` accepts `{ scanHistoryIds }`, looks up scan history records by ID (scoped to user), and creates cards in the chosen display case. Storage method: `getScanHistoryByIds(ids, userId)`.
- **1-of-1 Card Valuation**: Automatic detection of 1/1 cards (from variation text like "Superfractor 1/1", "one of one", serial number "1/1"). Gemini-first valuation: for 1/1 and low-pop (/49 and under) cards, Gemini with Google Search grounding is the primary price source (trusted even with 0 soldCount). Parallel comp fallback uses conservative multipliers (1.5x-5x for /5 through /99) with a Gemini sanity check — if Gemini's direct valuation is lower than the multiplied projection, Gemini wins. Cross-validation against price points is skipped for 1/1 cards since those points may come from inflated projections. Results are clearly labeled as "Projected from Parallel Comps" with full transparency.
- **AI Player Registry Refresh**: Admin feature to bulk-update player career stages and role tiers using Gemini AI with Google Search grounding. Processes players in batches of 20, searches for current news/trades/injuries/retirements, and proposes changes with confidence levels and rationale. Admin reviews diff view and approves/rejects individual changes before applying. Located in admin panel under Player Registry → AI Refresh button. Service: `server/playerRegistryAiUpdate.ts`.
- **Role Stability System**: 6-tier player role classification (FRANCHISE_CORE → OUT_OF_LEAGUE) with associated stability scores (95 → 15). Used to filter backup/inactive players with automatic AVOID verdicts for low stability + unreliable comps, and restricts ACCUMULATE verdicts for uncertain-role players.
- **Unified Usage Tracking**: Both collection and quick analyses are tracked in the `outlook_usage` table for consistent free tier enforcement (3 analyses/month for free users).
- **Display Customization**: Multiple layout styles (grid, row, showcase) and premium themes for display cases.
- **Collection Organization**: Card tagging, automatic case generation from top cards or tags, and duplicate detection.
- **Social Features**: Liking, commenting, a prestige system with tiers and badges, and a bookmarking system for cards.
- **Trading & Communication**: An offers system for cards marked "Open to Offers" and a direct messaging system between collectors.
- **Analytics & Sharing**: Portfolio analytics page, and viral sharing features allowing export of cases as various image formats for social media.
- **Growth Projections (Pro)**: AI-powered personalized collection growth forecasts at 3/6/12 month intervals, showing bear/base/bull scenarios based on market temperature, investment verdicts, and upside/risk scores from player outlook data.
- **Monthly Price Trend Charts**: 18-month lookback price charts using Gemini AI with Google Search grounding to fetch eBay sold data by month. Available on player outlook pages (single player line chart) and card outlook pages. Comparison pages show dual trend lines overlaid on the same chart for side-by-side visual analysis. Charts include percentage change badges and confidence indicators. Component: `client/src/components/price-trend-chart.tsx`, Backend: `fetchMonthlyPriceHistory()` in `server/outlookEngine.ts`.
- **Graded Value Matrix**: For raw/ungraded cards in Card Analysis, shows estimated PSA 9 and PSA 10 values alongside the raw price. Includes a "Grade It?" recommendation (Grade It / Maybe / Skip) based on whether grading costs (~$35) would be recouped by the value increase. Component: `client/src/components/graded-value-matrix.tsx`. Graded estimates sourced from Gemini via `psa9Price`/`psa10Price` fields in `GeminiMarketData`.
- **Raw Card Price Accuracy**: Multi-layer system to prevent graded card prices from inflating raw card valuations. Gemini prompt requests separate `rawPrice` and `psa9Price`/`psa10Price` fields. Deterministic server-side correction uses min-price ratio check as fallback. Shared `isRawCard()` helper in `priceService.ts` handles all raw grade representations (null, "Raw", "Ungraded", etc.).
- **Liquidity Scoring UI**: Visual badges (VERY_HIGH/HIGH/MEDIUM/LOW/UNCERTAIN) showing market health and exit risk for each card. Integrated into card outlook displays and Card Analysis. Pro users see divergence warnings when price rises on weak liquidity.
- **Portfolio-Specific Next Buys**: AI-powered recommendations tailored to each display case's theme. Uses Gemini 2.0 Flash with Google Search grounding to analyze a portfolio's cards, detect themes (teams, eras, positions, card types), and suggest 5 complementary cards with pricing and investment rationale. Accessible via button on individual display case pages (Pro feature).
- **Next Buys Recommendation Engine**: Balanced, investment-focused recommendation system with multiple recommendation sources:
  - **Watchlist**: Players user is actively tracking
  - **Breakout**: HOT temperature players with strong momentum
  - **Team Theme**: Cards matching user's collection themes (Jazz, Celtics, etc.)
  - **Hidden Gems**: Undervalued picks from market analysis
  - **Market Outlook**: Trending fallback players
  
  Uses round-robin source selection with hard caps (max 2 per source) to ensure diverse recommendations. PLAYER_TEAM_MAP with 50+ popular player-to-team mappings enables reliable team detection. Scoring considers portfolio fit, diversification needs, career stage balance, value range alignment, and momentum signals.

- **Podcast Landing Page & Pro Trial**: Public landing page at `/podcast` for converting podcast listeners. Grants 7-day Pro trial on signup with one-trial-per-user enforcement. Trial metadata stored on users table (trialStart, trialEnd, trialSource). `hasProAccess()` shared utility checks both paid Pro and active trial status. Trial banner shown app-wide during active trial with days remaining and upgrade CTA. Auth login supports `returnTo` parameter for post-login redirect flow.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM for type-safe schema management and queries.
- **API**: RESTful API design for all backend interactions.
- **Build Process**: Vite for client bundling and esbuild for server bundling, optimized for production deployment.
- **Session Management**: Secure, HttpOnly cookies with a 7-day TTL, storing session data in PostgreSQL.
- **Unified Card Analysis**: Card Analysis uses a single Gemini 2.5 Flash call with Google Search grounding (`fetchUnifiedCardAnalysis`) instead of 4-5 separate sequential calls. One prompt returns market pricing, player news, and investment verdict. Reduces analysis time from ~60-90s to ~10-15s. Price trend chart lazy-loads independently via `playerRequest` prop. Deterministic guardrails reconcile AI verdict with signal-based logic (injured/backup players can't get BUY, low-confidence data forces MONITOR). Function: `server/outlookEngine.ts`.
- **eBay Comps Caching**: Uses a stale-while-revalidate (SWR) pattern with extended TTLs (7 days for 15+ comps, 72h for 6-14, 24h for sparse data). Includes query broadening ladder (stops at 12+ comps) and nightly prewarm job.
- **Player News Caching**: 4-hour in-memory cache for `fetchPlayerNews` results to avoid redundant Gemini lookups for the same player within a session.
- **VPS Worker Architecture**: Documented pattern for moving eBay scraper to dedicated-IP VPS for improved reliability (see docs/VPS_SCRAPER_ARCHITECTURE.md).

## External Dependencies

### Third-Party Services
- **Replit Services**:
    - **Replit Auth**: OpenID Connect provider for user authentication.
    - **Replit Object Storage (Google Cloud Storage)**: Primary storage for card images and other files, with credentials managed via Replit Sidecar.
- **Stripe**: Payment gateway for subscription management and processing, using Checkout Sessions for payments.
- **OpenAI GPT & Serper API**: Used for AI-powered price lookups and generating detailed card outlook explanations. Serper provides real-time news about players to ensure AI recommendations use current information rather than outdated training data.

### Frontend Libraries
- **UI & Components**: Radix UI primitives, Uppy (for file uploads), date-fns, Lucide React (icons), shadcn/ui.
- **Form & Validation**: React Hook Form, Zod, @hookform/resolvers.
- **Styling**: Tailwind CSS, class-variance-authority, clsx, tailwind-merge.

### Backend Libraries
- **Database & ORM**: `pg` (node-postgres), `drizzle-orm`, `drizzle-zod`.
- **Authentication & Session**: `passport`, `openid-client`, `express-session`, `connect-pg-simple`.
- **Cloud Integration**: `@google-cloud/storage`.
- **Image Processing**: `Sharp` (for viral share features).
- **Utilities**: `memoizee`.