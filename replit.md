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