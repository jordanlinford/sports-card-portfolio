# HobbyAlpha

## Overview
HobbyAlpha is a web application for sports card collectors, providing tools for managing, analyzing, and growing collections. It leverages AI for market intelligence, real-time comparisons, investment insights, portfolio management, and personalized buying recommendations. The platform aims to be a comprehensive solution for sports card investment and collection management, improving valuation accuracy and market trend analysis.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, and Wouter, with `shadcn/ui` components built on Radix UI and Tailwind CSS. The design emphasizes card-centric layouts, a clean aesthetic, DM Sans typography, and a dynamic HSL-based color system. Key UI/UX features include a "FaithfulNeon" dark-mode brand palette, a graduated landing page with brand-tinted overlays, and a "Card Outlook" page with a 6-color verdict palette and custom signal bars. The "Player Outlook" page incorporates a holographic ring around player avatars and specialized signal bar styling. The Market Leaderboard, Track Record, and Leaderboards pages share the same 6-color verdict palette (BUY=emerald, HOLD=blue, TRADE_THE_HYPE=rose, AVOID=violet, SPECULATIVE/MONITOR=amber) for visual consistency across the verdict surface area; sport-identity badges (NBA, NFL, MLB, NHL, Soccer) and medal-rank colors (gold/silver/bronze) are intentionally exempt from brand graduation.

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