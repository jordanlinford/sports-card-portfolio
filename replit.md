# Sports Card Portfolio

## Overview
Sports Card Portfolio is a web application designed for sports card collectors to manage, analyze, and grow their collections. It offers AI-powered market intelligence, real-time eBay comparisons, and investment-focused tools. The platform includes portfolio management, personalized buy recommendations, and collection sharing, with advanced features available for Pro users. The project aims to be a comprehensive solution for sports card investment and management, leveraging AI for valuation and market trend analysis to enhance collection value and user insight.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, and Wouter for routing, built with `shadcn/ui` components based on Radix UI and Tailwind CSS. The design emphasizes card-focused layouts, clean aesthetics, DM Sans typography, and a dynamic HSL-based color system.

### Technical Implementations
The application features a full-stack TypeScript architecture. The frontend uses TanStack Query for server state, React Hook Form with Zod for forms, and React Context for theme management. The Express.js backend handles dual-provider authentication via Passport.js (Google OAuth, Replit OpenID Connect) with PostgreSQL-backed session management. Google Cloud Storage (via Replit Object Storage) handles image uploads. Key features include CRUD for cards and display cases, a Stripe-based subscription model (Free/Pro), AI-powered value tracking, and a Gemini 2.5 Flash vision-based card image scanner. Pro features include batch scanning, batch analysis, growth projections, and portfolio-specific buy recommendations. Advanced AI systems include 1-of-1 card valuation, a sophisticated Market Scoring Engine V2 for market phase classification and verdicts based on weighted signals (Demand, Momentum, Liquidity, Supply Pressure, Hype, Volatility, Confidence), and a Card Advisor (Pro-only) that uses Gemini 2.5 Flash with function-calling to orchestrate various tools for portfolio auditing. A robust Alpha Data Infrastructure with `card_price_observations`, `card_market_snapshots`, and `card_interest_events` tables supports a nightly Alpha Batch Job and Signal Engine, producing buy/sell/hold signals stored in `card_signals`. The Alpha Feed V2 provides a daily briefing with market pulse, price movers, investment signals, community momentum, and trending cards. A unified pipeline connects Alpha insights to player outlooks and individual cards, providing context-aware recommendations and actions.

### Feature Specifications
- **Core Collection Management**: CRUD for cards and display cases, tagging, automatic case generation, duplicate detection, and visibility settings.
- **Monetization**: Free and Pro subscription tiers via Stripe.
- **Authentication**: Dual-provider (Google OAuth, Replit OpenID Connect) with account merging.
- **AI & Market Intelligence**: AI-powered value tracking, historical data, price lookups, investment outlooks, Gemini 2.5 Flash card image scanning with daily limits, and 1-of-1 card valuation.
- **Pro Features**: Batch scanning, batch card analysis, growth projections, and portfolio-specific buy recommendations.
- **Market Analysis**: Market Scoring Engine V2 with mathematically consistent continuous formulas. Uses sample-size normalization (`log(1+sales)/log(50)`), log-scaled demand, continuous momentum/volatility/supply curves, and price-vs-volume divergence for hype detection. 6 weighted signal contributions (Demand 25%, Momentum 20%, Liquidity 15%, Supply 15%, Anti-Hype 15%, Volatility 10%) plus Confidence. **Signal contribution cap**: individual signal capped at 35% of composite, excess redistributed proportionally. **Market Quality metric**: `(liquidityScore * 0.4) + (volatilityScore * 0.3) + (supplyPressureScore * 0.3)` — separates "good market to participate in" from "active but broken." **High-volume player handling**: Liquidity blends sell-through (30%) with absolute velocity (70%) when sales30d ≥ 100, scaling smoothly from 30-100 sales. Supply uses a volume-based floor (`log(1+velocity*7)/log(50) * 40`) so high-velocity players don't get penalized for deep inventory. Volatility uses log-dampened CV (`100 - log(1+cv)*45`) for players with velocity ≥ 5 and CV > 1.5, preventing cross-product-type price spread from flooring the score. **Zero-data guard**: all signals return neutral 50 when sampleFactor = 0. Deterministic phase classification (Accumulation, Breakout, Expansion, Exhaustion, Decline) from price trend, volume trend, and supply ratio with supply dominance penalty (supplyRatio > 10 → Exhaustion override). Phase is **descriptive, not authoritative** — scores drive verdict, phase qualifies it. Verdict boundary ordering: ACCUMULATE (scores-first path with agreement ≥ 4 OR favorable phase) → TRADE_THE_HYPE → HOLD_CORE → AVOID (hype checked before hold). **Confidence gating**: confidenceScore < 40 → SPECULATIVE_FLYER (early exit); 40-49 → downgrades ACCUMULATE→HOLD_CORE, TRADE_THE_HYPE→SPECULATIVE_FLYER. AVOID guardrail prevents AVOID when liquidity > 60 AND demand > 60 (routes to TRADE_THE_HYPE instead). Signal contribution tracking for debugging and UI. **Timing vs Structure**: AdvisorOutlook surfaces `timing` (Overextended/Early/Fair/Late from momentum+hype+acceleration) and `structure` (Strong/Mixed/Weak from market quality) as separate fields.
- **Advanced AI Tools**: Card Advisor (Pro-only) for portfolio auditing, utilizing Gemini 2.5 Flash with multiple function-calling tools (e.g., portfolio summary, player outlooks, eBay market data, Alpha signals).
- **Alpha Intelligence**: Alpha Data Infrastructure captures granular price observations and interest events. Alpha Batch Job and Signal Engine generate daily buy/sell/hold signals. Daily Alpha Feed (Alpha Feed V2) presents market pulse, price movers, investment signals, community momentum, and trending cards.
- **Social & Sharing**: Liking, commenting, prestige system, bookmarking, and shareable display cases.
- **Reporting & Alerts**: Monthly price trend charts, graded value matrix, supply saturation alerts, pop report history, watchlist change alerts, and liquidity scoring UI.
- **Market Leaderboard**: 3 ranked views of player markets — Best Markets (weighted by composite+momentum+demand+confidence), Hype/Sell Candidates (hype+momentum-volume divergence), Emerging Opportunities (demand+volume+low-hype+early-phase bonus). Sport filter, computed from player_outlook_cache, in-memory caching with 1hr TTL. Falls back to verdict-based scoring for older cached outlooks without full market signals. Includes percentile column (Top X% / Bottom X%).
- **Relative Percentile Ranking**: Percentile engine computes rank distributions across all cached players for composite, demand, momentum, hype, and quality scores. Displayed as "Top X%" / "Bottom X%" badges in player outlook header and leaderboard table. Color-coded (green for top 15%, blue for top 35%, neutral for mid, orange for bottom). Sample size disclaimer shown when < 100 players. API at `/api/market-percentiles/:playerKey`. Cached 1hr in-memory.
- **Signal Agreement & Conviction**: Directional classification of each signal (bullish/bearish/neutral based on thresholds), agreement score (abs(bullish-bearish)/total * 100), and conviction score combining agreement (40%) + confidence (30%) + distance-from-neutral (30%). Four levels: High (75+), Medium (55-74), Low (35-54), Very Low (<35). Conviction badge in player outlook header. Conviction < 40 downgrades ACCUMULATE to HOLD_CORE, TRADE_THE_HYPE to SPECULATIVE_FLYER. Narrative line describes signal alignment pattern.
- **Trade Targets**: Verdict-aware card-level execution layer on player outlook page. Appears below Action Plan. Shows 1-3 specific card targets with BUY/SELL/WATCH actions, prices from evidence breakdown, liquidity indicators, and contextual tags. Verdict mapping: BUY/HOLD_CORE → entry targets (lagging demand); SELL/AVOID → sell targets (take profits); SPECULATIVE → watch list (asymmetric upside); HOLD → selective exposure. Low conviction (<30) shows "No strong entries" with caveat. Uses tieredRecommendations, exposures, evidence breakdown, and whatToBuy/whatToSell data.
- **Holder/Buyer Decision UI**: AdvisorSnapshot leads with verdict+conviction, then two prominent decision boxes: "If you own → [action]" and "If you want exposure → [action]". Trade targets split inline under the relevant decision. All secondary analysis (narrative, signals, percentiles, action plan, pack hit, collector tip, badges) collapsed behind "Show analysis" toggle. Deterministic verdict-to-decision mapping: BUY→HOLD/ADD+BUY now, HOLD_CORE→HOLD+WAIT, TRADE_THE_HYPE→SELL into strength+DO NOT BUY, AVOID→SELL/EXIT+AVOID, SPECULATIVE→HOLD small+SMALL BUY only, HOLD→HOLD+WAIT.
- **Recommendation Engines**: Next Buys Recommendation Engine (balanced, investment-focused), Dual-Source Hidden Gems (AI and community signals, including Soccer with World Cup focus, **engine-enriched** with Market Scoring Engine composite/conviction/percentile data, blended ranking, AI-vs-engine conflict detection and override), and Portfolio Alpha Benchmark.
- **SEO & Public Pages**: Public landing pages for podcasts, Pro trials, and a Topps Takeover SEO page with live player signals.
- **Break Value Auditor**: AI-powered EV analysis for break slot value evaluation.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **API**: RESTful API.
- **Build**: Vite for client, esbuild for server.
- **Session Management**: Secure, HttpOnly cookies with PostgreSQL-backed sessions.
- **AI Integration**: Gemini 2.5 Flash as the primary AI engine for comprehensive market analysis and pricing, with strategic fallbacks.
- **Parallel Detection**: Advanced detection and pricing for SSPs, case hits, Chrome inserts, and numbered card parallels.
- **Caching**: eBay comps caching (stale-while-revalidate), player news caching (in-memory), and persistent caching of Gemini analysis results in PostgreSQL.
- **Worker Architecture**: Dedicated-IP VPS for eBay scraper.
- **Scheduled Jobs**: Weekly auto-refresh for Hidden Gems, nightly player outlook refresh.

## External Dependencies

### Third-Party Services
- **Replit Services**: Replit Auth (OpenID Connect), Replit Object Storage (Google Cloud Storage).
- **Stripe**: Payment processing.
- **OpenAI GPT & Serper API**: AI lookups and real-time news.
- **Yahoo Finance**: S&P 500 market data.
- **CoinGecko**: Bitcoin market data.

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