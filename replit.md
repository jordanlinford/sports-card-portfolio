# HobbyAlpha

## Overview
HobbyAlpha is a web application for sports card collectors to manage, analyze, and grow their collections. It leverages AI for market intelligence, real-time eBay comparisons, and investment-focused tools. The platform offers portfolio management, personalized buy recommendations, and collection sharing, with advanced features for Pro users. The project aims to be a comprehensive solution for sports card investment and management, using AI for valuation and market trend analysis to enhance collection value and user insight.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, and Wouter, built with `shadcn/ui` components based on Radix UI and Tailwind CSS. The design emphasizes card-focused layouts, clean aesthetics, DM Sans typography, and a dynamic HSL-based color system.

### Technical Implementations
The application features a full-stack TypeScript architecture. The frontend uses TanStack Query for server state, React Hook Form with Zod for forms, and React Context for theme management. The Express.js backend handles dual-provider authentication (Google OAuth, Replit OpenID Connect) with PostgreSQL-backed session management. Google Cloud Storage (via Replit Object Storage) handles image uploads.
Key features include:
- CRUD operations for cards and display cases.
- Stripe-based subscription model (Free/Pro).
- AI-powered value tracking, investment outlooks, and market intelligence.
- Gemini 2.5 Flash vision-based card image scanner for quick analysis and 1-of-1 card valuation.
- Advanced AI systems like Market Scoring Engine V2 for market phase classification and the Card Advisor (Pro-only) using Gemini 2.5 Flash for portfolio auditing.
- An Alpha Data Infrastructure supports a nightly Alpha Batch Job and Signal Engine, generating buy/sell/hold signals and a daily Alpha Feed V2 briefing.
- Features like the Hard-to-Comp Evidence Panel, Market Leaderboard, Relative Percentile Ranking, Signal Agreement & Conviction, and Trade Targets provide detailed market insights and actionable recommendations.
- A Holder/Buyer Decision UI simplifies complex analysis into clear actions.
- Prospect Detection identifies and provides specific insights for un-debuted players.
- Recommendation Engines include Next Buys, Dual-Source Hidden Gems, and Portfolio Alpha Benchmark.
- A Sealed Product ROI Calculator provides AI-powered expected value analysis for hobby boxes.

### Brand Assets
The HobbyAlpha visual identity (square mark, light/dark wordmarks, favicon, full PWA icon ladder, and `og-default.png` share card) is generated from SVG sources in `client/src/assets/brand/` by `scripts/brand/build-brand.mjs`. Re-run with `node scripts/brand/build-brand.mjs` after changing the source SVGs or palette to regenerate every output size at once.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **API**: RESTful API.
- **Build**: Vite for client, esbuild for server.
- **Session Management**: Secure, HttpOnly cookies with PostgreSQL-backed sessions.
- **AI Integration**: Gemini 2.5 Flash as the primary AI engine for market analysis and pricing.
- **Caching**: Extensive caching for eBay comps, player news, and Gemini analysis results.
- **Worker Architecture**: Dedicated-IP VPS for eBay scraper.
- **Scheduled Jobs**: Weekly auto-refresh for Hidden Gems, nightly player outlook refresh, and weekly Verdict Regression Test.

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