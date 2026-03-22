import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Check,
  Zap,
  TrendingUp,
  Search,
  LayoutGrid,
  ArrowRight,
  Crown,
  Brain,
  BarChart3,
  Share2,
  Star,
  Users,
  Shield,
  Eye,
  Lock,
  Sparkles
} from "lucide-react";
import { SiGoogle } from "react-icons/si";

import portfolioOutlookImg from "@assets/sportscardportfolio.io_portfolio_outlook_1766201421163.png";
import nextBuysImg from "@assets/sportscardportfolio.io_portfolio_next-buys_1766201421162.png";
import playerOutlookImg from "@assets/sportscardportfolio.io_player-outlook_1766201421160.png";
import cardOutlookImg from "@assets/sportscardportfolio.io_card_161_outlook_1766201421158.png";
import myPortfoliosImg from "@assets/sportscardportfolio.io__1766201421155.png";
import analyticsImg from "@assets/sportscardportfolio.io_analytics_1766201421156.png";
import exposureBreakdownImg from "@assets/Screenshot_2025-12-18_235051_1766201421153.png";

function AuthButtons({ 
  primaryVariant = "default",
  primaryLabel = "Continue with Google",
  primaryClassName = "",
  showReplit = true,
  fullWidth = false,
  testId = "button-google-login",
}: {
  primaryVariant?: "default" | "outline";
  primaryLabel?: string;
  primaryClassName?: string;
  showReplit?: boolean;
  fullWidth?: boolean;
  testId?: string;
}) {
  return (
    <div className={fullWidth ? "w-full" : ""}>
      <a href="/api/auth/google" data-testid={testId}>
        <Button 
          size="lg" 
          variant={primaryVariant}
          className={`gap-2 ${fullWidth ? "w-full" : ""} ${primaryClassName}`}
        >
          <SiGoogle className="h-4 w-4" />
          {primaryLabel}
        </Button>
      </a>
      {showReplit && (
        <div className="mt-2 text-center">
          <a 
            href="/api/login" 
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-replit-login"
          >
            Or sign in with Replit →
          </a>
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section - Portfolio Focused */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="outline" className="mb-4 text-xs font-medium tracking-wide uppercase px-3 py-1">
              Independent. Data-Driven. Conflict-Free.
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
              The only card auditor that doesn't sell you cards.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              In a market dominated by Fanatics, Topps exclusives, and marketplace hype, Sports Card Portfolio gives you unbiased investment analysis with zero conflicts of interest.
            </p>
            
            {/* Primary CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
              <AuthButtons primaryLabel="Get Started with Google" primaryClassName="w-full sm:w-auto" />
              <Link href="/explore">
                <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2" data-testid="button-view-portfolio">
                  <Eye className="h-5 w-5" />
                  View Sample Portfolios
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Independence Manifesto */}
      <section className="py-12 md:py-16 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-y" data-testid="section-manifesto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary uppercase tracking-wide">Why It Matters</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3" data-testid="text-manifesto-title">
              Your auditor shouldn't also be your dealer.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
              In 2026, Fanatics controls the licenses. Marketplaces profit when you buy. Grading companies profit when you submit. Everyone in the hobby has an angle — except us.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h4 className="font-semibold mb-1">No Marketplace</h4>
              <p className="text-sm text-muted-foreground">We don't sell cards, host auctions, or take commissions. Our only incentive is giving you the truth.</p>
            </div>
            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <h4 className="font-semibold mb-1">No License Bias</h4>
              <p className="text-sm text-muted-foreground">Topps or Panini, licensed or unlicensed — we analyze what the data says, not what manufacturers want you to believe.</p>
            </div>
            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <h4 className="font-semibold mb-1">Real Data Only</h4>
              <p className="text-sm text-muted-foreground">Every verdict is backed by actual eBay sales, grading populations, and AI market analysis — not sponsored content or paid placements.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility Strip */}
      <section className="py-6 border-y bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-6 md:gap-12 text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Zero marketplace commissions
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Real eBay sold comps — not estimates
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              No sponsored cards or paid placements
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Trusted by 300+ serious collectors
            </span>
          </div>
        </div>
      </section>

      {/* Your Portfolio, Explained - Flagship Features with Screenshots */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-background to-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-portfolio-explained-title">
              Your Portfolio, Explained
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Three tools to understand and grow your collection.
            </p>
          </div>

          {/* Feature 1: Portfolio Outlook */}
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center mb-16">
            <div className="order-2 lg:order-1">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Portfolio Outlook</h3>
              <p className="text-muted-foreground mb-4">
                See your portfolio's stance, risks, and opportunities in one AI-generated snapshot. 
                Understand your exposure by position, career stage, and top players.
              </p>
              <ul className="space-y-2 text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Risk signals and concentration warnings
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Personalized opportunities
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Recommended next steps
                </li>
              </ul>
              <a href="/api/auth/google" data-testid="button-portfolio-outlook-cta">
                <Button className="gap-2">
                  View Portfolio Outlook
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
            <div className="order-1 lg:order-2">
              <div className="rounded-xl overflow-hidden border shadow-lg">
                <img 
                  src={portfolioOutlookImg} 
                  alt="Portfolio Outlook showing exposure breakdown and recommendations" 
                  className="w-full h-auto"
                  data-testid="img-portfolio-outlook"
                />
              </div>
            </div>
          </div>

          {/* Feature 2: Next Buys */}
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center mb-16">
            <div>
              <div className="rounded-xl overflow-hidden border shadow-lg">
                <img 
                  src={nextBuysImg} 
                  alt="Next Buys recommendations with fit scores and prices" 
                  className="w-full h-auto"
                  data-testid="img-next-buys"
                />
              </div>
            </div>
            <div>
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Next Buys</h3>
              <p className="text-muted-foreground mb-4">
                Personalized card recommendations based on gaps and concentration in your collection.
                Each suggestion includes fit score, value assessment, and momentum indicators.
              </p>
              <ul className="space-y-2 text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Portfolio fit scoring
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Price and momentum tracking
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Gap and exposure analysis
                </li>
              </ul>
              <a href="/api/auth/google" data-testid="button-next-buys-cta">
                <Button className="gap-2">
                  See Next Buys
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>

          {/* Feature 3: Quick Card Check / Player Outlook */}
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="order-2 lg:order-1">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Player Outlook</h3>
              <p className="text-muted-foreground mb-4">
                Analyze any player before you buy — get instant investment calls with detailed reasoning.
                See stock tiers, exposure recommendations, and cards to buy or avoid.
              </p>
              <ul className="space-y-2 text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  5-state investment verdicts
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Real market comps data
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Real-time market context
                </li>
              </ul>
              <a href="/api/auth/google" data-testid="button-quick-check-cta">
                <Button variant="outline" className="gap-2">
                  Analyze a Player
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
            <div className="order-1 lg:order-2">
              <div className="rounded-xl overflow-hidden border shadow-lg">
                <img 
                  src={playerOutlookImg} 
                  alt="Player Outlook for Josh Allen with Trade the Hype verdict" 
                  className="w-full h-auto"
                  data-testid="img-player-outlook"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition - 3 Columns */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {/* Audit Your Collection */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Shield className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Audit Your Collection</h3>
              <ul className="text-muted-foreground space-y-2 text-left max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Unbiased valuations from real sales data
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Risk signals and concentration warnings
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  No marketplace to push you to sell
                </li>
              </ul>
            </div>

            {/* Cut Through the Hype */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Cut Through the Hype</h3>
              <ul className="text-muted-foreground space-y-2 text-left max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  AI verdicts backed by eBay comps
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Supply saturation and grading alerts
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  S&P 500 and Bitcoin benchmarking
                </li>
              </ul>
            </div>

            {/* Invest with Clarity */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Invest with Clarity</h3>
              <ul className="text-muted-foreground space-y-2 text-left max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Player-first analysis across all licenses
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Hidden gems from AI + community signals
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Agent Mode: autonomous portfolio auditor
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Example Insight Section - Card Analysis */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Analysis Without an Agenda
              </h2>
              <p className="text-muted-foreground text-lg mb-6">
                Every verdict tells you why — backed by real eBay sales, not marketplace hype or sponsored recommendations. No card company, auction house, or marketplace influences our analysis.
              </p>
              <ul className="space-y-3 text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Upside, downside risk, and market friction scores
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Liquidity scoring and supply saturation alerts
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  AI analysis grounded in actual sold comps
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Independent — we profit from your success, not your trades
                </li>
              </ul>
              <p className="text-sm text-muted-foreground italic">
                When everyone else in the hobby has an angle, objectivity is the product.
              </p>
            </div>
            <div>
              <div className="rounded-xl overflow-hidden border shadow-lg">
                <img 
                  src={cardOutlookImg} 
                  alt="Card analysis for Patrick Mahomes with market signals and AI insights" 
                  className="w-full h-auto"
                  data-testid="img-card-outlook"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolios Section - with Screenshot */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <div className="rounded-xl overflow-hidden border shadow-lg">
                <img 
                  src={myPortfoliosImg} 
                  alt="My Portfolios showing display cases with sports cards" 
                  className="w-full h-auto"
                  data-testid="img-my-portfolios"
                />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Show Your Portfolio — or Keep It Private
              </h2>
              <p className="text-muted-foreground text-lg mb-6">
                Your cards deserve more than a spreadsheet. Create beautiful display cases, organize by theme, and share with the community.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Share2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Share Publicly</h4>
                    <p className="text-sm text-muted-foreground">Let others discover your collection</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Lock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Keep Private</h4>
                    <p className="text-sm text-muted-foreground">Track for your eyes only</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Engage</h4>
                    <p className="text-sm text-muted-foreground">Likes, comments, and bookmarks</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Premium Themes</h4>
                    <p className="text-sm text-muted-foreground">Stand out with Pro themes</p>
                  </div>
                </div>
              </div>
              <Link href="/explore">
                <Button variant="outline" className="gap-2">
                  <Eye className="h-4 w-4" />
                  View Sample Portfolios
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Analytics Section - with Screenshots */}
      <section className="py-16 md:py-24 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="order-2 lg:order-1">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Track Your Portfolio Value
              </h2>
              <p className="text-muted-foreground text-lg mb-6">
                See your total collection value, top cards, value distribution, and recent price changes — all in one place.
              </p>
              <ul className="space-y-3 text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Total portfolio value with card counts
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Top 10 most valuable cards
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Value by display case breakdown
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Recent value changes and updates
                </li>
              </ul>
              <a href="/api/auth/google">
                <Button className="gap-2" data-testid="button-analytics-cta">
                  <BarChart3 className="h-4 w-4" />
                  View Your Analytics
                </Button>
              </a>
            </div>
            <div className="order-1 lg:order-2 grid grid-cols-2 gap-4">
              <div className="rounded-xl overflow-hidden border shadow-lg">
                <img 
                  src={analyticsImg} 
                  alt="Portfolio Analytics showing total value and top cards" 
                  className="w-full h-auto"
                  data-testid="img-analytics"
                />
              </div>
              <div className="rounded-xl overflow-hidden border shadow-lg">
                <img 
                  src={exposureBreakdownImg} 
                  alt="Portfolio exposure breakdown by position and career stage" 
                  className="w-full h-auto"
                  data-testid="img-exposure-breakdown"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pro Comparison Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Start Free. Upgrade When You're Ready.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No pressure, no upsells from a marketplace. Just independent tools for collectors who want the truth.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  Free
                </CardTitle>
                <div className="text-3xl font-bold">$0</div>
                <CardDescription>Forever free to start</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>3 AI analyses per month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Basic portfolios</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Market lookups</span>
                  </li>
                </ul>
                <div className="mt-6">
                  <AuthButtons primaryVariant="outline" primaryLabel="Get Started Free" fullWidth showReplit={false} testId="button-free-plan" />
                </div>
              </CardContent>
            </Card>

            {/* Pro Plan */}
            <Card className="relative border-primary">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="gap-1">
                  <Star className="h-3 w-3" />
                  Recommended
                </Badge>
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Pro
                </CardTitle>
                <div className="text-3xl font-bold">
                  $12<span className="text-lg font-normal text-muted-foreground">/month</span>
                </div>
                <CardDescription>For serious collectors</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="font-medium">Unlimited AI analyses</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Premium portfolio themes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Advanced market tools</span>
                  </li>
                </ul>
                <Link href="/upgrade" className="block mt-6">
                  <Button className="w-full" data-testid="button-pro-plan">
                    Upgrade When You're Ready
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer with Rebrand Message */}
      <footer className="py-12 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-4">
              <LayoutGrid className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold">Sports Card Portfolio</span>
            </div>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              The independent, conflict-free auditor for collectors who treat cards like assets.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="/explore" className="hover:text-foreground transition-colors">
                Explore Portfolios
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
