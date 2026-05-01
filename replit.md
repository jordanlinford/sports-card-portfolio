# HobbyAlpha

## Overview
HobbyAlpha is a web application for sports card collectors, offering tools for managing, analyzing, and growing collections. It utilizes AI for market intelligence, real-time comparisons, and investment insights, including portfolio management and personalized buying recommendations. The platform aims to be a comprehensive solution for sports card investment and collection management, enhancing valuation accuracy and market trend analysis.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, and Wouter, with `shadcn/ui` components built on Radix UI and Tailwind CSS. The design emphasizes card-centric layouts, a clean aesthetic, DM Sans typography, and a dynamic HSL-based color system.

### Technical Implementations
The application features a full-stack TypeScript architecture. The frontend uses TanStack Query for server state, React Hook Form with Zod for forms, and React Context for themes. The Express.js backend handles dual-provider authentication (Google OAuth, Replit OpenID Connect) with PostgreSQL-backed sessions. Image uploads are managed via Google Cloud Storage (through Replit Object Storage).

Core features include:
- CRUD operations for cards and display cases.
- Optional Centerpiece Card per display case: owner can pick one card via a thumbnail picker in the case editor (or "None" for the standard layout). When set, the public case viewer renders a `HeroCenterpiece` block above the themed grid (large image + title/grade/value/outlook), and that card is filtered out of the grid below to avoid duplication. `displayCases.heroCardId` is a nullable FK to `cards.id` with `onDelete: SET NULL` so deleting the hero card silently reverts the case to standard layout.
- Public case viewer toolbar (Sort & Filter): a search/filter/sort toolbar renders between the hero centerpiece and the themed grid frame on `/cases/:id` whenever the grid has 6+ cards (`gridCards.length >= 6`). All filtering is client-side. Filter chips are grouped by facet (`outlook` for Buy/Sell/Monitor; standalone for Big movers/Graded/Rookies) — chips OR within a facet, AND across facets, so e.g. Buy+Sell shows cards with either signal instead of collapsing to zero. Stats strip and hero centerpiece are intentionally NOT affected by filters (they always reflect the whole case). Filter state (`caseSearch`/`caseFilters`/`caseSort`) is reset via `useEffect([id])` on case-id change so persisted filters from a larger case can never silently hide everything on a smaller one.
- Holographic display-case theme (Pro-only): the 9th theme in `DISPLAY_CASE_THEMES` (`holo`) layers two opt-in flourishes onto each card image and the hero centerpiece: a 3D mouse-tilt (rotateX/rotateY up to ±8°, ±6° on the hero) and an iridescent conic-gradient shimmer (`color-dodge` + `blur(20px)`, opacity 0.25 → 0.5 on hover). Both effects are gated by `THEME_STYLES.holo.isHolo === true` and rendered through `TiltWrapper` (mutates DOM directly via ref + `requestAnimationFrame`, no React re-renders on pointer move) and `HoloShimmer` (`aria-hidden`, `pointer-events-none`). `usePrefersReducedMotion` disables the tilt for users with reduced-motion enabled while keeping the static shimmer. Non-holo themes keep the original CSS hover scale; for `holo` it's intentionally dropped so the tilt drives the motion.
- Stripe-based Free and Pro subscription tiers.
- AI-driven value tracking, investment outlooks, and market intelligence.
- A Gemini 2.5 Flash vision-based scanner for card analysis.
- Advanced AI systems like Market Scoring Engine V2 and the Card Advisor (Pro-only).
- An Alpha Data Infrastructure supporting nightly Alpha Batch Jobs and a Signal Engine for buy/sell/hold signals.
- Detailed market insights through features like Hard-to-Comp Evidence Panel, Market Leaderboard, and Trade Targets.
- Prospect Detection and Recommendation Engines for Next Buys and Hidden Gems.
- A Sealed Product ROI Calculator.
- Server-side rewriting of Open Graph and Twitter Card meta tags for SEO.
- Bulk email management with unsubscribe functionality (RFC 8058 compliant).
- Automated weekly report generation for the "State of the Hobby" blog post.
- External cron endpoints for managing long-running scheduled jobs.
- Canonical domain management with 301 redirects for legacy domains.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **API**: RESTful API.
- **Build Tools**: Vite for client, esbuild for server.
- **Session Management**: Secure, HttpOnly cookies with PostgreSQL-backed sessions.
- **AI Integration**: Gemini 2.5 Flash for market analysis.
- **Caching**: Extensive caching for external data.
- **Worker Architecture**: Dedicated-IP VPS for eBay scraping.
- **Scheduled Jobs**: Weekly auto-refresh for Hidden Gems, nightly player outlook refresh, weekly Verdict Regression Test, nightly Verdict Outcomes grading job (03:00 UTC) that classifies 60-day-old signals as HIT/MISS/NEUTRAL/INSUFFICIENT_DATA.
- **Verdict Accuracy Tracking**: Each card signal records `priceAtSignal`, `weightsVersion`, and `inputsJson` at issue time. `card_signals` is unique on `cardId` (one row per card), so `signal_id` is reused across verdict-flip episodes. To preserve episode identity for grading, `upsertCardSignal` keeps the original `createdAt`/`priceAtSignal`/`weightsVersion`/`inputsJson` when the same signal type re-asserts, and resets them (with `createdAt = NOW()`) when the verdict TYPE flips — that fresh `createdAt` is the new episode's start. `verdict_outcomes` is unique on `(signalId, windowDays, signalIssuedAt)` so each episode produces its own outcome row even though `signalId` repeats; both `getSignalsToGrade` and `countOldUngraduatedSignals` join on `signalIssuedAt = cardSignals.createdAt` so post-flip episodes correctly become eligible for grading. The public Track Record page (`/track-record`) shows overall hit rate to all users, with breakdowns (by verdict type, sport, confidence, graded vs raw) gated to Pro subscribers via `hasProAccess`.

## External Dependencies

### Third-Party Services
- **Replit Services**: Replit Auth (OpenID Connect), Replit Object Storage (Google Cloud Storage).
- **Stripe**: Payment processing.
- **OpenAI GPT**: AI lookups.
- **Serper API**: Real-time news aggregation.
- **Yahoo Finance**: S&P 500 market data.
- **CoinGecko**: Bitcoin market data.

### Frontend Libraries
- **UI & Components**: Radix UI, Uppy, date-fns, Lucide React, shadcn/ui.
- **Form & Validation**: React Hook Form, Zod.
- **Styling**: Tailwind CSS.

### Backend Libraries
- **Database & ORM**: `pg`, `drizzle-orm`.
- **Authentication & Session**: `passport`, `openid-client`, `express-session`, `connect-pg-simple`.
- **Cloud Integration**: `@google-cloud/storage`.
- **Image Processing**: `sharp`.
- **Utilities**: `memoizee`.