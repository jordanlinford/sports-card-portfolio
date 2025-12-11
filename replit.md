# MyDisplayCase

## Overview
MyDisplayCase is a web application designed for collectors to digitally showcase their card collections (sports, trading, and other collectibles). It enables users to upload, organize, and share their collections, with an optional Pro subscription for advanced features. The platform aims to provide a visually appealing and functional environment for managing and displaying card collections.

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
- **Value Tracking & AI**: Tracks estimated card values with historical data and offers AI-powered price lookups and card outlook analysis (buy/watch/sell recommendations) for Pro users.
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

## External Dependencies

### Third-Party Services
- **Replit Services**:
    - **Replit Auth**: OpenID Connect provider for user authentication.
    - **Replit Object Storage (Google Cloud Storage)**: Primary storage for card images and other files, with credentials managed via Replit Sidecar.
- **Stripe**: Payment gateway for subscription management and processing, using Checkout Sessions for payments.
- **OpenAI GPT & Serper API**: Used for AI-powered price lookups and generating detailed card outlook explanations.

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