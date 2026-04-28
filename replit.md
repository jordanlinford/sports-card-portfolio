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

### Link Previews / SEO Meta
Per-route Open Graph and Twitter Card meta tags are rewritten server-side by `server/seo.ts`. The `<!-- SEO:START -->` / `<!-- SEO:END -->` block in `client/index.html` is replaced for every SPA shell request (in both `server/vite.ts` for dev and `server/static.ts` for prod) with absolute-URL OG image, route-specific title/description, og:url, canonical, image dimensions, og:locale, and Twitter handle. Static routes (Pricing, Intel, Podcast, Hidden Gems, Leaderboards, etc.) are configured in `ROUTE_META`; dynamic routes (`/blog/:slug`, `/outlook/:sport/:slug`) are resolved asynchronously from storage. Existing crawler-only SSR routes in `server/routes.ts` (e.g. blog/case/topps) take precedence and are not affected.

### Email Branded Header
Every outbound email (transactional + bulk announcements) renders the new HobbyAlpha wordmark at the top via `buildEmailHeaderHtml()` / `buildEmailHeaderText()` in `server/emailBranding.ts`. The header is a single-cell `<table>` with a navy (`#0F172A`) background so the white wordmark looks identical in light and dark email clients without relying on `prefers-color-scheme`. The logo image is a pre-rasterized PNG hosted at the SPA's static asset root (`client/public/email/hobbyalpha-wordmark-light.png` plus a `-dark` variant and the square `hobbyalpha-mark.png`) and is referenced by absolute URL using `CUSTOM_DOMAIN` (fallback `hobbyalpha.com`) so Gmail's image proxy and other webmail clients can cache it. To regenerate after a brand change, re-render the SVGs in `client/src/assets/brand/` to PNG with `sharp` at width 960 (wordmarks) / 256 (mark) and overwrite the files in `client/public/email/`.

### Bulk Email Unsubscribe
Bulk/marketing emails (`sendRebrandAnnouncementEmail`, `sendWeeklyDigestEmail`, `sendWinBackEmail`) include an HMAC-signed unsubscribe link in their visible footer and set the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` SMTP headers (RFC 8058) so Gmail/Yahoo/Apple Mail don't downgrade us as a bulk sender. The link points at `/api/unsubscribe?u=<userId>&c=<digest|winback|announcements>&s=<hmac>`; the route is public (no login required) and accepts both GET (renders an HTML confirmation page for footer clicks) and POST (returns JSON for one-click unsubscribe). Each category maps to a per-user boolean on `user_alert_settings` (`weeklyDigestEnabled`, `winBackEmailsEnabled`, `announcementEmailsEnabled`); the senders and their schedulers (`winBackJob`, `priceAlertJob`, the admin rebrand-announcement endpoint) skip users who have opted out. Transactional emails (price alerts, payment confirmations, split status, welcome) intentionally do not include unsubscribe links and are unaffected. Logic lives in `server/unsubscribe.ts`; secret is `SESSION_SECRET`.

### Domain & Redirects
The canonical production domain is `hobbyalpha.com`, configured via the shared `CUSTOM_DOMAIN` env var. The Express app in `server/index.ts` issues a permanent `301` redirect (with a 1-year `Cache-Control` for SEO) for any request whose `Host` header matches a legacy domain (`sportscardportfolio.io`, `sportscardportfolio.com`, with or without `www`), preserving path and query string. The legacy redirect set is intentionally kept indefinitely so backlinks and search rankings continue transferring to the new domain.

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