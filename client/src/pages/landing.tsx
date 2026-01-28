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
  Frame,
  Share2,
  Star,
  Users,
  Shield,
  Eye,
  Lock,
  Sparkles
} from "lucide-react";

import portfolioOutlookImg from "@assets/sportscardportfolio.io_portfolio_outlook_1766201421163.png";
import nextBuysImg from "@assets/sportscardportfolio.io_portfolio_next-buys_1766201421162.png";
import playerOutlookImg from "@assets/sportscardportfolio.io_player-outlook_1766201421160.png";
import cardOutlookImg from "@assets/sportscardportfolio.io_card_161_outlook_1766201421158.png";
import myPortfoliosImg from "@assets/sportscardportfolio.io__1766201421155.png";
import analyticsImg from "@assets/sportscardportfolio.io_analytics_1766201421156.png";
import exposureBreakdownImg from "@assets/Screenshot_2025-12-18_235051_1766201421153.png";

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section - Portfolio Focused */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
              The first sports card tracker that tells you Why to buy, not just what it's worth.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Sports Card Portfolio helps collectors reduce regret by understanding when to buy, hold, sell, or wait across their entire collection.
            </p>
            
            {/* Primary CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <a href="/api/login">
                <Button size="lg" className="w-full sm:w-auto gap-2" data-testid="button-hero-cta">
                  <Search className="h-5 w-5" />
                  Analyze a Card
                </Button>
              </a>
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

      {/* Hobby Box Splits Banner */}
      <section className="py-10 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-y">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-primary uppercase tracking-wide">New Feature</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2" data-testid="text-splits-title">
                Split the Box, Share the Hits
              </h2>
              <p className="text-muted-foreground max-w-xl" data-testid="text-splits-tagline">
                Join hobby box breaks with fellow collectors. Pick your division, pay your share, and get your cards shipped directly to you.
              </p>
            </div>
            <Link href="/portfolio-builder">
              <Button size="lg" className="gap-2 whitespace-nowrap" data-testid="button-join-splits">
                <LayoutGrid className="h-5 w-5" />
                Browse Open Splits
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Credibility Strip */}
      <section className="py-6 border-y bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-6 md:gap-12 text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Real eBay sold comps
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Player-based investment analysis
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Public & private portfolios
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Trusted by serious collectors
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
              <a href="/api/login">
                <Button className="gap-2" data-testid="button-portfolio-outlook-cta">
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
              <a href="/api/login">
                <Button className="gap-2" data-testid="button-next-buys-cta">
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
              <a href="/api/login">
                <Button variant="outline" className="gap-2" data-testid="button-quick-check-cta">
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
            {/* Build Your Portfolio */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Frame className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Build Your Portfolio</h3>
              <ul className="text-muted-foreground space-y-2 text-left max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Track cards with or without images
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Organize by tags or themes
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Public or private portfolios
                </li>
              </ul>
            </div>

            {/* Understand the Market */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Understand the Market</h3>
              <ul className="text-muted-foreground space-y-2 text-left max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  AI-powered BUY / WATCH / AVOID signals
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Upside, risk, and confidence scores
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Real comps from eBay and collectors
                </li>
              </ul>
            </div>

            {/* Invest Player-First */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Invest Player-First</h3>
              <ul className="text-muted-foreground space-y-2 text-left max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Treat players like stocks
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Career trajectory & legacy analysis
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  Watchlists and long-term outlooks
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
                Not Just Prices — Explanations
              </h2>
              <p className="text-muted-foreground text-lg mb-6">
                Every analysis tells you why, not just what. Get market signals, AI-generated insights, and actionable recommendations for every card.
              </p>
              <ul className="space-y-3 text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Upside, downside risk, and market friction scores
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Trend, liquidity, volatility, and card quality metrics
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  AI-generated analysis with real market context
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Data confidence indicators
                </li>
              </ul>
              <p className="text-sm text-muted-foreground italic">
                We don't just tell you what to do — we tell you why.
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
              <a href="/api/login">
                <Button className="gap-2">
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
              No pressure. Just powerful tools for collectors who want more.
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
                <a href="/api/login" className="block mt-6">
                  <Button variant="outline" className="w-full" data-testid="button-free-plan">
                    Get Started Free
                  </Button>
                </a>
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
              The long-term home for serious collectors who treat cards like assets.
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
