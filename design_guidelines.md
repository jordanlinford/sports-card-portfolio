# Sports Card Portfolio Design Guidelines

## Design Approach

**Reference-Based Strategy**: Draw inspiration from visual showcase platforms (Pinterest, Behance, Instagram) combined with clean dashboard patterns (Notion, Linear). The design should feel like a premium digital museum for card collections.

**Core Principle**: Cards are the stars. Everything else supports their presentation.

## Layout System

**Spacing Scale**: Use Tailwind units of **2, 4, 6, 8, 12, 16, 24** for consistent rhythm
- Tight spacing: `p-2, gap-2` (within components)
- Standard spacing: `p-4, p-6, gap-4` (cards, forms)
- Section spacing: `py-12, py-16, py-24` (page sections)
- Container: `max-w-7xl mx-auto px-6`

## Typography

**Font Families**:
- Primary (UI/Body): Inter or DM Sans (Google Fonts)
- Display (Headers): Same as primary for cohesion

**Hierarchy**:
- Page Titles: `text-4xl md:text-5xl font-bold`
- Section Headers: `text-2xl md:text-3xl font-semibold`
- Card Titles: `text-lg font-medium`
- Body Text: `text-base`
- Metadata/Labels: `text-sm font-medium uppercase tracking-wide`
- Small Print: `text-xs`

## Core Components

### Navigation Header
- Sticky top navigation with logo left, user menu right
- "Dashboard" and "Upgrade to Pro" CTAs when logged in
- "Login / Sign Up" when logged out
- Clean horizontal layout with subtle bottom border
- Mobile: Hamburger menu for condensed nav

### Landing Page (Pre-Auth)
- **Hero Section** (80vh): Large, striking image showing beautiful card display cases with subtle overlay
  - Headline: "A Simple, Beautiful Way to Showcase Your Collection"
  - Subheading explaining the value proposition
  - Primary CTA: "Create Your Free Display Case"
  - Secondary CTA: "View Example Case"
- **Features Section**: 3-column grid on desktop (stacks mobile)
  - Icons + title + short description for: Easy Upload, Public Sharing, Beautiful Grids
- **Example Showcase**: Full-width embedded sample display case
- **Pricing Section**: Side-by-side Free vs Pro comparison cards
- **Footer**: Links, social, copyright - comprehensive with newsletter signup

### Authentication Pages
- Centered card layout (`max-w-md mx-auto`)
- Clean form fields with labels above inputs
- Large, accessible input fields with `p-3` padding
- Primary action button full-width and prominent
- "Or" divider for alternative actions
- Error messages inline above form, clear and helpful

### Dashboard
- Two-column layout on desktop: sidebar (filter/actions) + main content grid
- **Stats Bar**: Total cases, cards uploaded, plan status in horizontal pills
- **Display Case Grid**: 2-3 column responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
  - Each case card: Thumbnail preview, title, card count, created date, action buttons
  - Hover state: Subtle lift and shadow
- **Empty State**: Large centered illustration with "Create your first display case" CTA
- Mobile: Stack to single column, sticky "Create New" FAB

### Create/Edit Display Case
- Split layout: Left = form fields, Right = preview (desktop only)
- Form sections clearly separated: Basic Info, Privacy Settings, Cards
- **Card Upload Section**:
  - Drag-and-drop zone with file input fallback
  - Form fields for metadata (title, set, year, grade, prices)
  - "Add Card" button prominent
- **Existing Cards Grid**: Sortable thumbnails with quick-edit and delete icons
- Save button sticky at bottom on mobile

### Public Display Case View
- **Header Section**: Case name, description, card count, owner badge
- **Card Grid**: Masonry or equal-height responsive grid (`auto-fill minmax(250px, 1fr)`)
  - Each card tile:
    - Full-width image (aspect-ratio-square or auto)
    - Overlay on hover showing title and estimated value
    - Click to expand lightbox view
- **Lightbox Modal**: Full-screen image viewer with all metadata visible, nav arrows for browsing
- **Footer CTA**: "Create your own display case" for logged-out visitors
- Mobile: 2-column grid, tap for details

### Upgrade Page
- Hero section explaining Pro benefits
- **Comparison Table**: Feature-by-feature Free vs Pro
- **Pricing Card**: Centered, prominent with Stripe checkout button
- Testimonials or example use cases below
- Clear "Already Pro? View Dashboard" link for existing Pro users

### Billing Success
- Large checkmark icon or success illustration
- "Welcome to Pro!" headline
- Summary of unlocked features
- "Go to Dashboard" primary CTA

## Images

**Hero Image (Landing)**: High-quality photo of premium sports cards beautifully arranged or a clean digital grid showcase. Subtle dark overlay (20-30% opacity) for text readability. Buttons on hero should have frosted glass/blur backgrounds.

**Dashboard Thumbnails**: Auto-generated from first 4 cards in each case, arranged in mini-grid preview.

**Empty States**: Simple, friendly illustrations (not photos) for "No cases yet" states.

**Example Display Case**: Pre-populated with 12-16 vintage sports cards showing the platform's potential.

## Interaction Patterns

- **Buttons**: Rounded corners (`rounded-lg`), generous padding (`px-6 py-3`), clear hover states (subtle shadow/transform)
- **Cards/Tiles**: Subtle borders, rounded corners (`rounded-xl`), shadow on hover
- **Forms**: Focus states with ring/outline, clear validation states
- **Modals**: Center-screen overlay with backdrop blur, slide-up animation on mobile
- **Toasts**: Top-right notifications for actions (case created, card uploaded)
- **Loading States**: Skeleton screens for grids, spinner for form submissions

## Responsive Behavior

- **Desktop (lg+)**: Multi-column grids, sidebar layouts, hover states
- **Tablet (md)**: 2-column grids, stacked layouts for complex forms
- **Mobile (base)**: Single column, bottom-sticky CTAs, touch-optimized (min 44px tap targets)

## Accessibility

- Form labels always visible, never placeholder-only
- Focus indicators on all interactive elements
- Alt text for all card images
- ARIA labels for icon-only buttons
- Keyboard navigation for lightbox and modals
- Minimum contrast ratios maintained throughout