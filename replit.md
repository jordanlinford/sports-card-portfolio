# HobbyAlpha

## Overview
HobbyAlpha is a web application for sports card collectors, providing tools for managing, analyzing, and growing collections. It leverages AI for market intelligence, real-time comparisons, investment insights, portfolio management, and personalized buying recommendations. The platform aims to be a comprehensive solution for sports card investment and collection management, improving valuation accuracy and market trend analysis.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, and Wouter, with `shadcn/ui` components built on Radix UI and Tailwind CSS. The design emphasizes card-centric layouts, a clean aesthetic, DM Sans typography, and a dynamic HSL-based color system. Key UI/UX features include a "FaithfulNeon" dark-mode brand palette, a graduated landing page with brand-tinted overlays, and a "Card Outlook" page with a 6-color verdict palette and custom signal bars. The "Player Outlook" page incorporates a holographic ring around player avatars and specialized signal bar styling. The Market Leaderboard, Track Record, and Leaderboards pages share the same 6-color verdict palette (BUY=emerald, HOLD=blue, TRADE_THE_HYPE=rose, AVOID=violet, SPECULATIVE/MONITOR=amber) for visual consistency across the verdict surface area; sport-identity badges (NBA, NFL, MLB, NHL, Soccer) and medal-rank colors (gold/silver/bronze) are intentionally exempt from brand graduation. The Display Case viewer and editor (`case-view.tsx`, `case-edit.tsx`), the Public Intel page (`public-intel.tsx`), and the Outlook Overview page (`outlook-overview.tsx`) reuse the same verdict palette for verdict pills and case-level dominant-signal indicators, with Big Mover badges in pink and Supply Saturation badges in amber to match Card Outlook; case-prestige tiers (Vault/Platinum/Gold/Silver/Bronze), user-selectable case theme presets, scan-confidence traffic-light, rarity tiers, and the Player Outlook volatility/archetype categorical palettes are intentionally preserved as feature-defining or universal-language palettes. The Explore and Blog pages already use semantic theme tokens (no hardcoded brand colors), and the Admin pages use emerald for success-state CheckCircle indicators while preserving categorical palettes (16-color ACTIVITY_TYPES feed, LINK_TYPES, feedback-type Bug/Feature/General/Praise) and universal Loader2 blue for loading state. Shared verdict-bearing components (`outlook/AdvisorSnapshot.tsx`, `outlook/OutlookAccordions.tsx`, `investment-call-card.tsx`, `card-outlook-panel.tsx`, `outlook-details.tsx`, `CollectorTake.tsx`) all share the same expanded verdict palette so verdict pills render identically across every surface that consumes them: BUY/ACCUMULATE/SPECULATIVE_SUPPRESSED → emerald, HOLD/HOLD_CORE/LONG_HOLD/HOLD_INJURY_CONTINGENT → blue, WATCH/SPECULATIVE_FLYER/HOLD_ROLE_RISK/MONITOR/SPECULATIVE → amber, SELL/TRADE_THE_HYPE → rose, AVOID/AVOID_NEW_MONEY/AVOID_STRUCTURAL/LEGACY_HOLD → violet (Trophy icon distinguishes LEGACY_HOLD from AVOID), LITTLE_VALUE/HOLD → muted/slate. Trend indicators (`price-sparkline.tsx`, `price-trend-chart.tsx`, `OutlookAccordions.tsx` volume trend) use emerald for positive movement and red for negative (red preserved as universal destructive trend signal). Success-state indicators (`success-animation.tsx`, `analysis-progress-steps.tsx`, `scan-status-indicator.tsx` flash + complete, `batch-analysis-banner.tsx`, `card-detail-modal.tsx` Open-to-Offers, `card-price-alerts-panel.tsx` above-target) use emerald. Confidence-tier traffic-light (`price-trend-chart.tsx` getConfidenceColor HIGH=green/MEDIUM=amber/LOW=red), notification-type icons (`notification-bell.tsx`), sport-identity badges (`player-autocomplete.tsx`), Google sign-in blue (`google-link-banner.tsx`), brand-orange alert badges (`navigation.tsx`), brand amber/orange AgentSidebar, payment-warning amber, liquidity tier (already on brand), and PSA9/PSA10 badges (`graded-value-matrix.tsx` PSA grading language) are all intentionally preserved as universal/feature-defining palettes. The tools & feeds pages (`scan-history.tsx`, `watchlist.tsx`, `alpha-feed.tsx`, `hidden-gems.tsx`, `next-buys.tsx`, `sealed-roi.tsx`, `bookmarks.tsx`) all share the same verdict palette — scan-history action colors (BUY emerald, MONITOR amber, LEGACY_HOLD violet), watchlist verdict (BUY emerald, MONITOR amber) and stock-tier categorical palette (PREMIUM violet, GROWTH emerald, CORE blue, COMMON slate, SPECULATIVE orange-brand), alpha-feed verdict pills (HOLD blue, SPECULATIVE_FLYER amber), hidden-gems tier (PREMIUM violet) + conviction tiers (HIGH emerald, LOW amber) + percentile rank (top emerald) + refresh-complete emerald, next-buys score tiers (≥75 emerald, ≥50 amber) + ArrowUpRight emerald + Sparkles violet + BUY badge emerald-600, sealed-roi VerdictBadge (POSITIVE_EV emerald, WAIT amber, LOTTERY_PLAY violet, GRADE_IT emerald) + GradingBadge (HOLD slate) + QualityBar tiers + new-release banner amber + EV ratio emerald + winner emerald + comparison bars emerald, bookmarks Open-to-Offers emerald-600. Watchlist verdict-modifier categorical palette (Speculative orange, Momentum purple, Value green, Long-Term blue, Late Cycle red), sealed-roi case-hit/treasure language (case-hit yellow, Trophy yellow), and Pro Crown yellow are intentionally preserved as feature-defining palettes.

### Technical Implementations
The application features a full-stack TypeScript architecture. The frontend utilizes TanStack Query for server state, React Hook Form with Zod for forms, and React Context for themes. The Express.js backend handles dual-provider authentication (Google OAuth, Replit OpenID Connect) with PostgreSQL-backed sessions. Image uploads are managed via Google Cloud Storage.

Core features include:
- CRUD operations for cards and display cases with an optional "Centerpiece Card" feature.
- A public case viewer with client-side sorting and filtering, designed to display grid cards, not stats or hero.
- A Pro-only holographic display-case theme featuring 3D mouse-tilt and iridescent shimmer effects.
- Stripe-based Free and Pro subscription tiers.
- AI-driven value tracking, investment outlooks, and market intelligence, including a Gemini 2.5 Flash vision-based scanner.
- Advanced AI systems like Market Scoring Engine V2 and the Card Advisor (Pro-only).
- Alpha Data Infrastructure supporting nightly batch jobs and a Signal Engine for buy/sell/hold signals.
- Detailed market insights through features like Hard-to-Comp Evidence Panel, Market Leaderboard, and Trade Targets.
- Prospect Detection and Recommendation Engines for Next Buys and Hidden Gems.
- A Sealed Product ROI Calculator.
- Server-side rewriting of Open Graph and Twitter Card meta tags for SEO.
- Bulk email management with unsubscribe functionality and an automated IMAP poller.
- Automated weekly report generation for the "State of the Hobby" blog post.
- External cron endpoints for managing long-running scheduled jobs and canonical domain management with 301 redirects.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **API**: RESTful API.
- **Build Tools**: Vite for client, esbuild for server.
- **Session Management**: Secure, HttpOnly cookies with PostgreSQL-backed sessions.
- **AI Integration**: Gemini 2.5 Flash for market analysis.
- **Caching**: Extensive caching for external data.
- **Worker Architecture**: Dedicated-IP VPS for eBay scraping.
- **Scheduled Jobs**: Weekly auto-refresh for Hidden Gems, nightly player outlook refresh, weekly Verdict Regression Test, nightly Verdict Outcomes grading.
- **eBay Comps Scraper**: Utilizes synonym groups and specific rejection patterns for accurate parallel matching.
- **Price Trend Chart**: Logic implemented to suppress fabricated trends and ensure accurate percentage change calculations for low-confidence data.
- **Verdict Accuracy Tracking**: Records `priceAtSignal`, `weightsVersion`, and `inputsJson` at issue time, with `signal_id` reuse and `createdAt` resets for accurate episode grading and public track record display.

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