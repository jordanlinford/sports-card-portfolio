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
- **1-of-1 Card Valuation**: Automatic detection of 1/1 cards (from variation text like "Superfractor 1/1", "one of one", serial number "1/1"). When direct comps are unavailable, the system searches for parallel comps (/5, /10, /25, /50, /99) via Gemini with Google Search grounding and applies tiered multipliers (2.5x-10x) to project the 1/1 value. Results are clearly labeled as "Projected from Parallel Comps" with full transparency showing reference parallels and multipliers used.
- **Role Stability System**: 6-tier player role classification (FRANCHISE_CORE → OUT_OF_LEAGUE) with associated stability scores (95 → 15). Used to filter backup/inactive players with automatic AVOID verdicts for low stability + unreliable comps, and restricts ACCUMULATE verdicts for uncertain-role players.
- **Unified Usage Tracking**: Both collection and quick analyses are tracked in the `outlook_usage` table for consistent free tier enforcement (3 analyses/month for free users).
- **Display Customization**: Multiple layout styles (grid, row, showcase) and premium themes for display cases.
- **Collection Organization**: Card tagging, automatic case generation from top cards or tags, and duplicate detection.
- **Social Features**: Liking, commenting, a prestige system with tiers and badges, and a bookmarking system for cards.
- **Trading & Communication**: An offers system for cards marked "Open to Offers" and a direct messaging system between collectors.
- **Analytics & Sharing**: Portfolio analytics page, and viral sharing features allowing export of cases as various image formats for social media.
- **Growth Projections (Pro)**: AI-powered personalized collection growth forecasts at 3/6/12 month intervals, showing bear/base/bull scenarios based on market temperature, investment verdicts, and upside/risk scores from player outlook data.
- **Liquidity Scoring UI**: Visual badges (VERY_HIGH/HIGH/MEDIUM/LOW/UNCERTAIN) showing market health and exit risk for each card. Integrated into card outlook displays and Card Analysis. Pro users see divergence warnings when price rises on weak liquidity.
- **Portfolio-Specific Next Buys**: AI-powered recommendations tailored to each display case's theme. Uses Gemini 2.0 Flash with Google Search grounding to analyze a portfolio's cards, detect themes (teams, eras, positions, card types), and suggest 5 complementary cards with pricing and investment rationale. Accessible via button on individual display case pages (Pro feature).
- **Next Buys Recommendation Engine**: Balanced, investment-focused recommendation system with multiple recommendation sources:
  - **Watchlist**: Players user is actively tracking
  - **Breakout**: HOT temperature players with strong momentum
  - **Team Theme**: Cards matching user's collection themes (Jazz, Celtics, etc.)
  - **Hidden Gems**: Undervalued picks from market analysis
  - **Market Outlook**: Trending fallback players
  
  Uses round-robin source selection with hard caps (max 2 per source) to ensure diverse recommendations. PLAYER_TEAM_MAP with 50+ popular player-to-team mappings enables reliable team detection. Scoring considers portfolio fit, diversification needs, career stage balance, value range alignment, and momentum signals.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM for type-safe schema management and queries.
- **API**: RESTful API design for all backend interactions.
- **Build Process**: Vite for client bundling and esbuild for server bundling, optimized for production deployment.
- **Session Management**: Secure, HttpOnly cookies with a 7-day TTL, storing session data in PostgreSQL.
- **eBay Comps Caching**: Uses a stale-while-revalidate (SWR) pattern with extended TTLs (7 days for 15+ comps, 72h for 6-14, 24h for sparse data). Includes query broadening ladder (stops at 12+ comps) and nightly prewarm job.
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