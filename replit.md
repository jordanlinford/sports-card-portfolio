# MyDisplayCase

## Overview

MyDisplayCase is a web application that allows users to create beautiful digital display cases for their card collections (sports cards, trading cards, collectibles). Users can upload card images, organize them into display cases, share their collections publicly, and optionally upgrade to a Pro subscription for enhanced features.

The application is built as a full-stack TypeScript project using React on the frontend and Express on the backend, with PostgreSQL for data persistence and Stripe for payment processing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, bundled using Vite

**Routing**: Wouter for lightweight client-side routing

**UI Components**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling

**State Management**: 
- TanStack Query (React Query) for server state management and caching
- React Hook Form with Zod validation for form handling
- React Context for theme management (light/dark mode)

**Design System**:
- Tailwind CSS with custom theme configuration
- Design guidelines emphasize card-focused layouts with clean spacing
- Typography uses DM Sans as the primary font
- Color system uses HSL values with CSS variables for theming

### Backend Architecture

**Framework**: Express.js with TypeScript

**Authentication**: Replit Auth using OpenID Connect (OIDC) with Passport.js strategy
- Session management via express-session with PostgreSQL session store
- User data stored in PostgreSQL users table

**API Design**: RESTful API endpoints
- Authentication routes (`/api/auth/*`)
- Display case CRUD operations (`/api/display-cases/*`)
- Card CRUD operations within display cases
- Stripe integration endpoints (`/api/create-checkout-session`, `/api/billing/success`)

**Object Storage**: Google Cloud Storage integration via Replit Object Storage sidecar
- File uploads handled through Uppy dashboard
- Access control policies stored in object metadata
- Public/private visibility settings per display case

**Build Process**: 
- Client builds to `dist/public` via Vite
- Server builds to `dist/index.cjs` via esbuild
- Production deployment serves static files from Express

### Data Storage

**Database**: PostgreSQL via Drizzle ORM

**Schema Design**:
- `users` - User profiles with subscription status and Stripe customer ID
- `sessions` - Express session storage
- `display_cases` - User-created collections with name, description, visibility settings, and view count tracking
- `cards` - Individual card items with image URLs, titles, descriptions, sort order, and value tracking (estimatedValue, previousValue, valueUpdatedAt)
- `comments` - User comments on display cases
- `likes` - Like tracking for display cases

**Database Access**: Drizzle ORM with type-safe query builder and schema definitions in `shared/schema.ts`

**Migrations**: Managed through Drizzle Kit (`drizzle.config.ts`)

### Authentication & Authorization

**Strategy**: Replit Auth (OpenID Connect)
- Discovery endpoint at `process.env.ISSUER_URL` (defaults to replit.com/oidc)
- Session-based authentication with PostgreSQL session store
- User profile synced from OIDC claims to local users table

**Session Management**:
- 7-day session TTL
- HttpOnly secure cookies
- Session data stored in PostgreSQL sessions table

**Authorization**:
- `isAuthenticated` middleware protects authenticated routes
- Display cases can be public (viewable by anyone) or private (owner only)
- Object storage ACL policies control file access

### Subscription & Payments

**Payment Processor**: Stripe

**Subscription Model**:
- Free tier with limited features
- Pro tier via Stripe Checkout
- User subscription status tracked in `users.subscriptionStatus` field
- Stripe customer ID stored for billing management

**Checkout Flow**:
1. User initiates upgrade from `/upgrade` page
2. Backend creates Stripe Checkout session
3. User completes payment on Stripe
4. Success callback updates user subscription status
5. Redirect to `/billing/success` with confirmation

## External Dependencies

### Third-Party Services

**Replit Services**:
- Replit Auth for authentication (OIDC provider)
- Replit Object Storage (Google Cloud Storage) for file uploads
- Replit Sidecar endpoint for cloud storage credentials

**Stripe**: Payment processing and subscription management
- API version: 2025-04-30.basil
- Checkout Sessions for payment collection
- Customer management for recurring billing

**Google Cloud Storage**: File storage backend accessed via Replit Object Storage
- Credentials obtained from Replit Sidecar
- Custom ACL implementation for access control

### Frontend Libraries

**UI Components**:
- Radix UI primitives (dialog, dropdown, popover, etc.)
- Uppy for file upload interface (@uppy/core, @uppy/dashboard, @uppy/aws-s3)
- date-fns for date formatting
- Lucide React for icons

**Form & Validation**:
- React Hook Form for form state
- Zod for schema validation
- @hookform/resolvers for Zod integration

**Styling**:
- Tailwind CSS
- class-variance-authority for component variants
- clsx and tailwind-merge for className utilities

### Backend Libraries

**Database & ORM**:
- pg (node-postgres) for PostgreSQL connection
- drizzle-orm for type-safe database queries
- drizzle-zod for schema validation

**Authentication & Session**:
- passport and passport-local for authentication
- openid-client for OIDC integration
- express-session for session management
- connect-pg-simple for PostgreSQL session store

**Cloud Integration**:
- @google-cloud/storage for object storage
- memoizee for caching OIDC configuration

**Build Tools**:
- esbuild for server bundling
- Vite for client bundling
- tsx for TypeScript execution in development

## Recent Features

### Top Cards Case Generator
- Dashboard includes "Create Top Cards Case" button
- Automatically creates a display case from user's top 12 most valuable cards
- Route: `POST /api/display-cases/top-cards`
- Shows only when user has cards with estimated values

### Value Change Tracking
- Cards track `previousValue` and `valueUpdatedAt` when estimated value changes
- Value change indicators (+/- percentage) displayed on:
  - Card grid in case-view page
  - Card detail modal
- Automatically tracks when `estimatedValue` is updated

### AI-Powered Price Lookups
- Uses OpenAI GPT + Serper API to search eBay sold listings
- Cost: ~$0.002 per card lookup
- **Refresh buttons available in:**
  - Case-view page: "Refresh Values" button next to Edit button (bulk update)
  - Case-edit page: "Refresh All Values" button in Cards section header
  - Card detail modal: "Refresh Value from eBay" button (single card)
- Routes:
  - `POST /api/cards/:id/lookup-price` - Single card price lookup
  - `POST /api/display-cases/:id/refresh-prices` - Bulk price refresh

### Admin Auto-Grant
- Users with email `jordanlinford@gmail.com` automatically receive admin access and PRO subscription on login
- Implemented in `upsertUser` function in `server/storage.ts`

### Layout Styles (Phase 1)
- Display cases support three layout styles: `grid` (default), `row`, and `showcase`
- **Grid**: Traditional 4-column grid of card images
- **Row**: Horizontal scrolling display of cards
- **Showcase**: Angled/fanned card display for premium presentation
- Layout selector available in case-edit page
- Layout stored in `display_cases.layout` field

### Card Tags (Phase 1)
- Cards can have multiple tags for organization
- Tags stored as PostgreSQL text array in `cards.tags` field
- **Adding tags**: In card detail modal edit mode, use the tag input field
  - Type tag name and press Enter/comma to add
  - Click suggestion buttons for common tags
  - Remove tags by clicking the X on badges
- **Viewing tags**: Tags displayed as badges in card detail modal
- Common tag suggestions: Vintage, Modern, Rare, Rookie, Autograph, Parallel, Insert, Numbered, Patch, Refractor, Gem Mint, PSA 10

### Create Case from Tag (Phase 1)
- Dashboard includes "Create from Tag" dropdown button (shows when user has tagged cards)
- Automatically creates a display case containing all cards with a selected tag
- Route: `POST /api/display-cases/from-tag` with `{ tag: string, name?: string }`
- Route to fetch user's unique tags: `GET /api/tags`
- Cards are copied (not moved) to preserve originals
- Copy includes all card metadata including tags, values, and value history

### Portfolio Analytics (Phase 2)
- New `/analytics` page with charts and collection insights
- Shows total collection value, card count, and case count
- Bar chart: Value breakdown by display case
- Pie chart: Card distribution across cases
- Top 10 most valuable cards list with images
- Recent value changes with percentage indicators
- Route: `GET /api/analytics`
- Accessible from user dropdown menu

### Premium Display Themes (Phase 2)
- 8 display case themes available (2 free, 6 Pro-only)
- **Free themes**: Classic, Midnight
- **Pro themes**: Wood Grain, Velvet Red, Ocean Blue, Emerald, Gold Luxury, Royal Purple
- Theme picker in case-edit page shows preview gradients
- Pro themes display "Pro" badge and are locked for free users
- Themes apply rich background gradients to case-view page
- Theme configuration in `client/src/lib/themes.ts`

### Duplicate Detection (Phase 2)
- When adding a new card, similar titles are detected automatically
- Warning alert shown if user already has cards with similar names
- Checks trigger after typing 3+ characters in title field
- Route: `GET /api/cards/duplicates?title=...&excludeId=...`
- Helps prevent accidental duplicate uploads

### Bookmarks System (Phase 3)
- Users can bookmark cards from any public display case
- Bookmark button in card detail modal for authenticated users
- Route: `POST /api/bookmarks` to add, `DELETE /api/bookmarks/:cardId` to remove
- Route: `GET /api/bookmarks` to list all user's bookmarked cards
- Bookmarks page accessible from user dropdown menu

### Offers System (Phase 3)
- Cards can be marked as "Open to Offers" with optional minimum amount
- Fields: `cards.openToOffers` (boolean), `cards.minOfferAmount` (real)
- "Make Offer" button appears in card detail modal for open-to-offer cards
- Routes:
  - `POST /api/offers` - Create new offer
  - `GET /api/offers/received` - Get offers on user's cards
  - `GET /api/offers/sent` - Get offers user has made
  - `PATCH /api/offers/:id/accept` - Accept offer
  - `PATCH /api/offers/:id/decline` - Decline offer
- Offers inbox at `/offers` with received/sent tabs
- Notifications sent when offers are accepted/declined

### Prestige System (Phase 3)
- Collector tiers based on prestige score:
  - Bronze: 0+ points (color: #CD7F32)
  - Silver: 100+ points (color: #C0C0C0)
  - Gold: 500+ points (color: #FFD700)
  - Platinum: 2000+ points (color: #E5E4E2)
  - Diamond: 5000+ points (color: #B9F2FF)
- 11 achievement badges:
  - First Steps (create first case)
  - Card Collector (own 10 cards)
  - Serious Collector (own 50 cards)
  - Master Collector (own 100 cards)
  - Social Butterfly (receive 5 likes)
  - Deal Maker (make first offer)
  - Offer Accepted (have offer accepted)
  - Community Helper (add 3 comments)
  - Early Adopter (special)
  - Trendsetter (create 5 public cases)
  - Curator (add value to 10 cards)
- Score calculation: cards (10 pts), cases (50 pts), public cases (25 pts), likes received (5 pts), offers (20 pts), bookmarks (10 pts)
- Routes:
  - `GET /api/prestige` - Current user's prestige stats
  - `GET /api/prestige/:userId` - Specific user's prestige stats
  - `GET /api/badges` - All available badges
  - `GET /api/badges/user/:userId` - User's earned badges
  - `POST /api/prestige/recalculate` - Recalculate user's score
- PrestigeDisplay component shows tier badge and earned badges on case-view page
- Tables: `badges` (definitions), `user_badges` (earned badges with unique constraint)

### Messaging System (Phase 4)
- Direct messaging between collectors to discuss trades and sales
- Conversation-based model with persistent message history
- Database tables:
  - `conversations` - Tracks participant pairs with last message preview
  - `messages` - Individual messages with sender, content, read status
- Routes:
  - `GET /api/messages/inbox` - List all user's conversations with unread counts
  - `GET /api/messages/unread-count` - Total unread message count
  - `POST /api/messages/conversations` - Start or get existing conversation with user
  - `GET /api/messages/conversations/:id` - Get conversation with messages
  - `POST /api/messages/conversations/:id` - Send a new message
  - `POST /api/messages/conversations/:id/read` - Mark messages as read
- Entry points:
  - User dropdown menu "Messages" link with unread badge
  - MessageButton component on case-view page (next to Follow button)
- Messages page at `/messages` shows conversation list
- Auto-refresh every 30 seconds for unread count, 10 seconds for conversation view
- Notifications sent when receiving new messages

### Viral Share Features (Phase 5)
- Share dropdown on case-view page with multiple export formats
- **Copy Link**: Copies case URL to clipboard
- **Download Image Formats**:
  - Teaser Image (4:5, 1080x1350) - TikTok/Instagram feed format
  - Story Image (9:16, 1080x1920) - Instagram/TikTok Stories
  - Social Preview (16:9, 1200x630) - Discord/Twitter/iMessage OG image
- **Brag Image Formats**:
  - Top Card Flex - Highlights the highest value card in the case
  - Portfolio Value - Shows total collection value with top 4 cards
- Routes:
  - `GET /api/share-image/case/:id?format=<format>` - Generate share image
  - Formats: `social` (default), `story`, `teaser`, `brag-card`, `brag-portfolio`
- Uses Sharp for image generation with theme-based gradient backgrounds
- Images include card previews, owner name, value indicators, and branding
- Implementation in `server/shareImageService.ts`