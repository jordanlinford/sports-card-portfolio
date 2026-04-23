# Architecture Overview

## How the pieces fit together

```
User Browser
    │
    ├─ React SPA (Vite) ──── TanStack Query ──── /api/* endpoints
    │                                                    │
    │                                              Express.js
    │                                                    │
    ├── Auth ─────── Passport.js ──── Google OAuth / Replit OIDC
    │                                         │
    ├── Cards ────── Card Scanner ──── Gemini 2.5 Flash (vision)
    │                     │
    │                     ▼
    ├── Pricing ─── eBay Comps Service ──── VPS Scraper (dedicated IP)
    │                     │
    │                     ▼
    ├── Outlooks ── Outlook Engine (orchestrator)
    │                     │
    │         ┌───────────┼───────────┐
    │         ▼           ▼           ▼
    │   Player Outlook  Market     Investment
    │     Engine       Scoring    Decision Engine
    │         │        Engine V2       │
    │         │           │            │
    │         ▼           ▼            ▼
    │      Verdict: ACCUMULATE / TRADE_THE_HYPE / HOLD_CORE / SPECULATIVE / AVOID
    │
    ├── Alpha ──── Nightly Batch Job ──── card_signals table
    │                                          │
    │                                     Alpha Feed V2
    │
    └── Payments ── Stripe ── Webhooks ── Free/Pro tiers
```

## Data flow: Card → Price → Verdict

1. **Card enters system** — user uploads image or creates manually
2. **Card Scanner** (`cardImageScannerService`) — Gemini vision extracts player, set, year, variation
3. **eBay Comps** (`ebayCompsService`) — VPS scraper fetches recent sold listings
4. **Price Observation** — every lookup stored in `card_price_observations` (Alpha data)
5. **Market Scoring** (`marketScoringEngine`) — 6 weighted signals computed:
   - Demand (25%), Momentum (20%), Liquidity (15%), Supply (15%), Anti-Hype (15%), Volatility (10%)
6. **Investment Decision** (`investmentDecisionEngine`) — applies confidence gating + guardrails → verdict
7. **Outlook Cache** — result cached in `player_outlook_cache` (1hr TTL)
8. **Alpha Engine** — nightly batch reads observations → produces BUY/SELL/HOLD signals in `card_signals`

## The Market Scoring Engine

The scoring engine is the brain of the analysis system. Key concepts:

- **Composite Score**: weighted sum of 6 signals (0-100 each)
- **Confidence Gating**: < 40 confidence → SPECULATIVE_FLYER; 40-49 → downgrade
- **Phase Classification**: Accumulation → Breakout → Expansion → Exhaustion → Decline (descriptive, not authoritative — scores drive verdict, phase qualifies it)
- **AVOID Guardrail**: prevents AVOID when liquidity > 60 AND demand > 60 (routes to TRADE_THE_HYPE)
- **Signal Cap**: individual signal capped at 35% of composite, excess redistributed

## Key tables and their relationships

```
users ──┬── display_cases ──── cards ──── card_outlooks
        │                       │
        │                       ├── bookmarks
        │                       ├── price_alerts
        │                       └── price_history
        │
        ├── follows
        ├── notifications
        ├── conversations ──── messages
        ├── offers
        ├── trade_offers
        └── support_tickets ──── support_ticket_messages

player_outlook_cache ──── (computed from cards + eBay data)
card_price_observations ── (every price lookup stored)
card_market_snapshots ──── (aggregated stats)
card_interest_events ───── (user interactions)
card_signals ──────────── (nightly BUY/SELL/HOLD)
comp_observations ─────── (historical eBay comps)
```

## Background jobs (all in-process)

| Job | Schedule | File | Purpose |
|-----|----------|------|---------|
| Scan Worker | Continuous (poll) | `scanWorker.ts` | Process card image scan queue |
| Prewarm | On startup | `prewarmJob.ts` | Warm caches for popular players |
| Career Stage | Periodic | `careerStageJob.ts` | Update player career classifications |
| Hidden Gems | Weekly | `hiddenGemsService.ts` | Refresh gem recommendations |
| Regression Test | Sundays 02:00 UTC | `regressionTestJob.ts` | Snapshot top 50 verdicts, flag flips |
| Alpha Batch | Nightly | `alphaEngine.ts` | Generate BUY/SELL/HOLD signals |

**Risk**: All jobs run in the Express process. A server restart kills in-flight jobs.

## Authentication flow

```
Google OAuth:  /api/auth/google → Google → /api/auth/google/callback → session
Replit OIDC:   /api/login → Replit → /api/callback → session
QA bypass:     POST /api/auth/qa-login (header: x-qa-token, non-production only)
```

Session stored in PostgreSQL (`sessions` table) via `connect-pg-simple`.
User identity: `req.user.claims.sub` (string UUID).

## Subscription model

- **Free**: 3 card scans/day, basic outlooks, limited features
- **Pro**: 20 scans/day, batch operations, growth projections, Card Advisor, sealed ROI
- Access checked via `hasProAccess(user)` in `shared/schema.ts`
- Managed by Stripe, synced via webhooks in `webhookHandlers.ts`
