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

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section - Portfolio Focused */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
              Track, Analyze, and Grow Your Sports Card Portfolio
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Real market data, AI-powered insights, and public portfolios — built for modern collectors who treat cards like assets.
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

      {/* Example Insight Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Not Just Prices — Explanations
              </h2>
              <p className="text-muted-foreground text-lg">
                Every analysis tells you why, not just what.
              </p>
            </div>

            {/* Example Insight Card */}
            <Card className="border-2">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-16 bg-gradient-to-br from-primary/20 to-primary/5 rounded-md flex items-center justify-center">
                      <LayoutGrid className="h-6 w-6 text-primary/50" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">2023 Panini Prizm</CardTitle>
                      <CardDescription>CJ Stroud RC PSA 10</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="font-semibold text-amber-600 dark:text-amber-400">WATCH</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">Why:</span> Strong rookie season with immediate playoff success, but limited market upside due to position saturation and team exposure concerns. Comparable players historically plateau in value without sustained playoff visibility. Current pricing reflects peak hype — consider waiting for a post-season correction before adding to your portfolio.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <div className="text-lg font-bold text-green-500">72</div>
                    <div className="text-xs text-muted-foreground">Upside Score</div>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <div className="text-lg font-bold text-amber-500">58</div>
                    <div className="text-xs text-muted-foreground">Risk Score</div>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <div className="text-lg font-bold">High</div>
                    <div className="text-xs text-muted-foreground">Confidence</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-center text-muted-foreground mt-6 font-medium">
              We don't just tell you what to do — we tell you why.
            </p>
          </div>
        </div>
      </section>

      {/* Portfolios Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Show Your Portfolio — or Keep It Private
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Your cards deserve more than a spreadsheet.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <Card className="text-center">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Share2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Share Publicly</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Let others discover and follow your portfolio
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Keep Private</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Track your collection for your eyes only
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Engage</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Likes, comments, and bookmarks from collectors
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Premium Themes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Stand out with exclusive Pro display themes
                </p>
              </CardContent>
            </Card>
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
              <span className="text-lg font-semibold">MyDisplayCase</span>
            </div>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              MyDisplayCase is evolving into Sports Card Portfolio — the long-term home for serious collectors.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <Link href="/terms-of-service" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
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
