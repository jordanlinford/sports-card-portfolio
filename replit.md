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
- **Value Tracking & AI**: Tracks estimated card values with historical data and offers AI-powered price lookups and card outlook analysis (buy/watch/sell recommendations) for Pro users. Includes Quick Card Check for analyzing cards before purchase without adding to collection.
- **Role Stability System**: 6-tier player role classification (FRANCHISE_CORE → OUT_OF_LEAGUE) with associated stability scores (95 → 15). Used to filter backup/inactive players with automatic AVOID verdicts for low stability + unreliable comps, and restricts ACCUMULATE verdicts for uncertain-role players.
- **Unified Usage Tracking**: Both collection and quick analyses are tracked in the `outlook_usage` table for consistent free tier enforcement (3 analyses/month for free users).
- **Display Customization**: Multiple layout styles (grid, row, showcase) and premium themes for display cases.
- **Collection Organization**: Card tagging, automatic case generation from top cards or tags, and duplicate detection.
- **Social Features**: Liking, commenting, a prestige system with tiers and badges, and a bookmarking system for cards.
- **Trading & Communication**: An offers system for cards marked "Open to Offers" and a direct messaging system between collectors.
- **Analytics & Sharing**: Portfolio analytics page, and viral sharing features allowing export of cases as various image formats for social media.

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