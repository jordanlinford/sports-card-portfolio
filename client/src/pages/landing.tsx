import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Check,
  Sparkles,
  Shield,
  Zap,
  TrendingUp,
  TrendingDown,
  Search,
  LayoutGrid,
  ArrowRight,
  Crown,
  Target,
  Activity,
  Brain,
  Lightbulb,
  BarChart3,
  Frame,
  Share2,
  CircleDot,
  Award,
  ShoppingCart,
  DollarSign,
  Star,
  Trophy,
  Users
} from "lucide-react";

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section - Market Outlook Focused */}
      <section className="relative pt-8 pb-16 md:pt-12 md:pb-24 lg:pt-16 lg:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left side - Copy */}
            <div className="text-center lg:text-left">
              <Badge variant="secondary" className="mb-4">
                <Sparkles className="h-3 w-3 mr-1" />
                AI-Powered Card Intelligence
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
                See where your card's value is headed — before you buy, sell, or grade.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8" data-testid="text-hero-subtitle">
                Real sales data + AI market signals.
                <br />
                <span className="font-medium text-foreground">Free users get 3 outlooks/month. Pro users get unlimited.</span>
              </p>
              
              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-6">
                <a href="/api/login">
                  <Button size="lg" className="w-full sm:w-auto gap-2" data-testid="button-hero-cta">
                    <Search className="h-5 w-5" />
                    Run a Free Market Outlook
                  </Button>
                </a>
                <Link href="/upgrade">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2" data-testid="button-upgrade-hero">
                    <Crown className="h-5 w-5" />
                    Upgrade for Unlimited Outlooks
                  </Button>
                </Link>
              </div>

              <p className="text-sm text-muted-foreground">
                No credit card required. Start analyzing cards instantly.
              </p>
            </div>

            {/* Right side - Market Outlook Mockup */}
            <div className="relative lg:pl-8">
              <div className="relative">
                {/* Main frame */}
                <div className="relative bg-card border rounded-xl shadow-2xl overflow-hidden">
                  {/* Browser-style header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="px-4 py-1 bg-background rounded-md text-xs text-muted-foreground">
                        Market Outlook
                      </div>
                    </div>
                  </div>
                  
                  {/* Market Outlook Preview */}
                  <div className="p-5 space-y-4">
                    {/* Card being analyzed */}
                    <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                      <div className="w-16 h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-md flex items-center justify-center">
                        <LayoutGrid className="h-8 w-8 text-primary/50" />
                      </div>
                      <div>
                        <div className="font-semibold">2020 Panini Prizm</div>
                        <div className="text-sm text-muted-foreground">Justin Herbert RC PSA 10</div>
                        <div className="text-lg font-bold text-primary mt-1">$245</div>
                      </div>
                    </div>
                    
                    {/* AI Recommendation Badge */}
                    <div className="flex items-center justify-center">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full">
                        <TrendingUp className="h-5 w-5 text-green-500" />
                        <span className="font-semibold text-green-500">BUY</span>
                        <span className="text-sm text-muted-foreground">High Confidence</span>
                      </div>
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-green-500">+12%</div>
                        <div className="text-xs text-muted-foreground">30-Day Trend</div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">High</div>
                        <div className="text-xs text-muted-foreground">Liquidity</div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">Low</div>
                        <div className="text-xs text-muted-foreground">Volatility</div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-primary">Strong</div>
                        <div className="text-xs text-muted-foreground">Outlook</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating AI badge */}
                <div className="absolute -bottom-4 -left-4 bg-card border rounded-lg shadow-lg p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Brain className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">AI Analysis</div>
                    <div className="text-xs text-muted-foreground">Real-time data</div>
                  </div>
                </div>

                {/* Floating trend indicator */}
                <div className="absolute -top-2 -right-2 bg-card border rounded-lg shadow-lg p-2 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium">Live Market Data</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Strip */}
      <section className="py-8 border-y bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-muted-foreground mb-4">AI-powered market intelligence for every card category.</p>
          <div className="flex flex-wrap justify-center gap-4 md:gap-8 text-sm font-medium">
            <span className="flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-primary" />
              Sports Cards
            </span>
            <span className="flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-primary" />
              Pokemon & TCG
            </span>
            <span className="flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-primary" />
              Non-Sport & Pop Culture
            </span>
          </div>
        </div>
      </section>

      {/* Proof Section - What a Market Outlook Shows */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              What a Market Outlook Shows You
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Not just prices — actionable intelligence based on real sales data.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <Card className="text-center">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Price Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  30 / 90 / 180-day price movement with visual charts
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Volatility & Liquidity</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  How stable is the price? How easy to buy or sell?
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">AI Outlook</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Bullish / Neutral / Risky — with confidence scoring
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lightbulb className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Action Suggestion</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Hold / Buy / Grade / Sell — with reasoning explained
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-muted-foreground mt-8 font-medium">
            Based on real sales — not guesses or hype.
          </p>
        </div>
      </section>

      {/* Freemium Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Try It Free. Upgrade When It Pays for Itself.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Start with 3 free Market Outlooks per month. Go Pro when you're ready for unlimited intelligence.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <Card className="relative">
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
                    <span>3 Market Outlooks per month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Real sales comps</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Basic AI outlook</span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-4 w-4 flex items-center justify-center">-</span>
                    <span>Limited history depth</span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-4 w-4 flex items-center justify-center">-</span>
                    <span>No saved outlooks</span>
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
                  <Zap className="h-5 w-5 text-primary" />
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
                    <span className="font-medium">Unlimited Market Outlooks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Deeper historical trends</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Save & track cards over time</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Advanced AI signals</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Full Display Case features</span>
                  </li>
                </ul>
                <Link href="/upgrade" className="block mt-6">
                  <Button className="w-full" data-testid="button-pro-plan">
                    Unlock Unlimited Market Outlooks
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Make Smarter Decisions
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Whether you're buying, selling, or deciding whether to grade — know what the market says first.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Buy Smarter */}
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4">
                  <ShoppingCart className="h-6 w-6 text-green-500" />
                </div>
                <CardTitle>Buy Smarter</CardTitle>
                <CardDescription>
                  Know before you overpay
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>See if a card is trending up or down</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Compare asking price to recent sales</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Get AI confidence on buy timing</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Sell Smarter */}
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4">
                  <DollarSign className="h-6 w-6 text-amber-500" />
                </div>
                <CardTitle>Sell Smarter</CardTitle>
                <CardDescription>
                  Time your exit perfectly
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span>Know if you're selling at peak or dip</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span>Get realistic price expectations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span>Understand market liquidity</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Grade Smarter */}
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
                  <Target className="h-6 w-6 text-blue-500" />
                </div>
                <CardTitle>Grade Smarter</CardTitle>
                <CardDescription>
                  Is the grading premium worth it?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span>Compare raw vs graded values</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span>See grade-specific price trends</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span>Calculate if grading ROI makes sense</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Display Cases Section - Repositioned */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Frame className="h-3 w-3 mr-1" />
              Plus: Display Cases
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Show off collections backed by data.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Beautiful display cases that show more than just pictures — 
              your cards come with market intelligence built in.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Trend Arrows</h3>
              <p className="text-sm text-muted-foreground">
                Each card shows its price direction at a glance
              </p>
            </div>

            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Outlook Status</h3>
              <p className="text-sm text-muted-foreground">
                Display the last AI outlook for each card
              </p>
            </div>

            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Share2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Shareable Links</h3>
              <p className="text-sm text-muted-foreground">
                Public or private — share your portfolio anywhere
              </p>
            </div>
          </div>

          <div className="text-center mt-8">
            <Link href="/explore">
              <Button variant="outline" className="gap-2" data-testid="button-explore-cases">
                Explore Public Display Cases
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof / Prestige Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Trophy className="h-3 w-3 mr-1" />
              Collector Credibility
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Build trust in the collector community.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Earn prestige badges based on your portfolio value. 
              Data-backed credibility when you're ready to trade.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 mb-8">
            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'rgba(205, 127, 50, 0.2)' }}>
                <Award className="h-8 w-8" style={{ color: '#CD7F32' }} />
              </div>
              <h3 className="font-semibold">Bronze</h3>
            </div>

            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'rgba(192, 192, 192, 0.2)' }}>
                <Award className="h-8 w-8" style={{ color: '#C0C0C0' }} />
              </div>
              <h3 className="font-semibold">Silver</h3>
            </div>

            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'rgba(255, 215, 0, 0.2)' }}>
                <Award className="h-8 w-8" style={{ color: '#FFD700' }} />
              </div>
              <h3 className="font-semibold">Gold</h3>
            </div>

            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'rgba(229, 228, 226, 0.2)' }}>
                <Award className="h-8 w-8" style={{ color: '#A0A0A0' }} />
              </div>
              <h3 className="font-semibold">Platinum</h3>
            </div>

            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'rgba(185, 242, 255, 0.2)' }}>
                <Award className="h-8 w-8" style={{ color: '#00CED1' }} />
              </div>
              <h3 className="font-semibold">Diamond</h3>
            </div>
          </div>
        </div>
      </section>

      {/* Founder Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Built by a collector—because the tools didn't exist.
          </h2>
          <div className="text-lg text-muted-foreground space-y-4">
            <p>
              I wanted to know if a card was worth buying before I pulled the trigger.
              If it was time to sell before prices dropped. If grading would even be worth it.
            </p>
            <p>
              Pricing apps gave me numbers. Marketplaces pushed me to list.
              Nothing actually helped me make smarter decisions.
            </p>
            <p className="font-medium text-foreground">
              So I built MyDisplayCase. AI intelligence for collectors who treat their hobby like an investment.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Run your first Market Outlook — free.
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            See where any card's value is headed. Make smarter buying, selling, and grading decisions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/api/login">
              <Button size="lg" className="gap-2" data-testid="button-cta-bottom">
                <Search className="h-5 w-5" />
                Run a Free Market Outlook
              </Button>
            </a>
            <Link href="/upgrade">
              <Button variant="outline" size="lg" className="gap-2" data-testid="button-upgrade-bottom">
                <Crown className="h-5 w-5" />
                Upgrade for Unlimited
              </Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            3 free outlooks per month. Pro unlocks unlimited.
          </p>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" />
              <span className="font-semibold">MyDisplayCase</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/explore" className="hover:text-foreground transition-colors" data-testid="link-footer-explore">
                Explore
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">
                Privacy
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered market intelligence for card collectors.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
