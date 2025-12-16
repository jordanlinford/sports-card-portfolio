import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  Share2, 
  LayoutGrid, 
  Check,
  Star,
  Sparkles,
  Shield,
  Zap,
  DollarSign,
  Tag,
  TrendingUp,
  Heart,
  MessageCircle,
  Grid3X3,
  Layers,
  Search,
  Globe,
  Users,
  Bookmark,
  ArrowRightLeft,
  Trophy,
  Award,
  BarChart3,
  Palette,
  UserPlus,
  Frame,
  Handshake,
  ArrowRight,
  Eye,
  AlertCircle,
  Copy,
  Image,
  CircleDot
} from "lucide-react";

import heroCard1 from "@assets/Screenshot_2025-12-10_at_9.49.12_AM_1765385357760.png";
import heroCard2 from "@assets/Screenshot_2025-12-10_at_9.49.37_AM_1765385383043.png";
import heroCard3 from "@assets/PSA-98304469-front_1765385407925.jpg";
import heroCard4 from "@assets/110043113-front_1765385918538.jpg";

const heroCards = [
  { id: 1, title: "Charizard PSA 10", image: heroCard1 },
  { id: 2, title: "Mike Trout PSA 9", image: heroCard2 },
  { id: 3, title: "Josh Allen PSA 10", image: heroCard3 },
  { id: 4, title: "Kobe Bryant PSA 10", image: heroCard4 },
];

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-2 pb-12 md:pt-4 md:pb-16 lg:pt-6 lg:pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left side - Copy */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
                The AI-powered portfolio for card collectors.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-4" data-testid="text-hero-subtitle">
                Track value. Predict movement. Showcase your collection. Trade with confidence.
              </p>
              
              {/* 3 Key Value Props */}
              <ul className="flex flex-col gap-2 mb-8 text-left max-w-md mx-auto lg:mx-0">
                <li className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">AI-powered pricing and market outlooks</span>
                </li>
                <li className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Portfolio-level analytics and value tracking</span>
                </li>
                <li className="flex items-center gap-3">
                  <Layers className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Beautiful, shareable display cases</span>
                </li>
              </ul>
              
              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-6">
                <a href="/api/login">
                  <Button size="lg" className="w-full sm:w-auto gap-2" data-testid="button-hero-cta">
                    Start tracking your collection
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
                <Link href="/explore">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2" data-testid="button-explore">
                    <Eye className="h-5 w-5" />
                    View a public display case
                  </Button>
                </Link>
              </div>

              {/* Microcopy */}
              <p className="text-sm text-muted-foreground">
                Free forever. Pro unlocks AI intelligence.
              </p>
            </div>

            {/* Right side - Framed Mockup */}
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
                        mydisplaycase.io
                      </div>
                    </div>
                  </div>
                  
                  {/* Mock dashboard content */}
                  <div className="p-4 space-y-4">
                    {/* Analytics preview */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-primary">$12,450</div>
                        <div className="text-xs text-muted-foreground">Total Value</div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold">156</div>
                        <div className="text-xs text-muted-foreground">Cards</div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-500">+8.2%</div>
                        <div className="text-xs text-muted-foreground">This Month</div>
                      </div>
                    </div>
                    
                    {/* Card grid with static images - 2x2 layout */}
                    <div className="grid grid-cols-2 gap-3">
                      {heroCards.map((card) => (
                        <div 
                          key={card.id} 
                          className="aspect-[2.5/3.5] rounded-lg overflow-hidden bg-gradient-to-br from-muted to-muted/50 shadow-md"
                        >
                          <img 
                            src={card.image}
                            alt={card.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Floating badge card */}
                <div className="absolute -bottom-4 -left-4 bg-card border rounded-lg shadow-lg p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFD700' }}>
                    <Award className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Gold Tier</div>
                    <div className="text-xs text-muted-foreground">Top Collector</div>
                  </div>
                </div>

                {/* Floating price update */}
                <div className="absolute -top-2 -right-2 bg-card border rounded-lg shadow-lg p-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium text-green-500">+$45</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Category Strip */}
      <section className="py-8 border-y bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-muted-foreground mb-4">AI-powered pricing intelligence for every card category.</p>
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

      {/* Problem Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Your cards aren't just collectibles—they're a portfolio.
          </h2>
          <div className="text-lg text-muted-foreground space-y-4">
            <p>
              Most collectors end up juggling spreadsheets, notes apps, and endless eBay searches
              just to keep track of what they own and what it might be worth.
            </p>
            <p>
              Pricing apps give you numbers, but no context. No intelligence. No recommendations.
            </p>
            <p className="font-medium text-foreground">
              You need a system that thinks like a collector.
            </p>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Finally—AI that understands the card market.
          </h2>
          <div className="text-lg text-muted-foreground space-y-4 mb-8">
            <p>
              MyDisplayCase analyzes real sales data, evaluates market trends, and delivers 
              actionable intelligence—not just static prices.
            </p>
            <p>
              Know what to buy. Know when to sell. Know exactly where you stand.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm font-medium text-muted-foreground">
            <span>Real market data.</span>
            <span>AI-powered recommendations.</span>
            <span>Built for collectors who invest in their hobby.</span>
          </div>
        </div>
      </section>

      {/* AI Intelligence Section - THE DIFFERENTIATOR */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Sparkles className="h-3 w-3 mr-1" />
              What Sets Us Apart
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              AI-powered pricing intelligence.
            </h2>
            <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
              We don't just show you numbers. Our AI analyzes real market data from eBay, PSA, and price guides
              to give you actionable insights—not just prices.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Current Value */}
            <Card className="relative">
              <div className="absolute -top-3 left-4">
                <Badge variant="outline" className="bg-background">Step 1</Badge>
              </div>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>AI Price Lookup</CardTitle>
                <CardDescription>
                  Real market values, not guesswork
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Scans eBay sold listings in real-time</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Considers grade, variation, and condition</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Confidence scores on every lookup</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Works for Sports, Pokemon, and Non-Sport</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Future Outlook */}
            <Card className="relative">
              <div className="absolute -top-3 left-4">
                <Badge variant="outline" className="bg-background">Step 2</Badge>
              </div>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Card Outlook AI</CardTitle>
                <CardDescription>
                  BUY / WATCH / SELL recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Investment-style recommendations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Detailed reasoning for every outlook</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Category-aware analysis (sports vs TCG)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Factors in player career, set rarity, trends</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Actionable Alerts */}
            <Card className="relative">
              <div className="absolute -top-3 left-4">
                <Badge variant="outline" className="bg-background">Step 3</Badge>
              </div>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Never Miss a Move</CardTitle>
                <CardDescription>
                  Stay informed automatically
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Value history tracking over time</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Weekly portfolio digest emails</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Top movers and biggest changes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Portfolio-level profit/loss tracking</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-8">
            <Badge variant="secondary" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              Pro Feature
            </Badge>
          </div>
        </div>
      </section>

      {/* Portfolio Management Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Manage your collection like a portfolio.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              See the big picture. Track performance. Understand your position.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Total Value</h3>
              <p className="text-sm text-muted-foreground">
                Real-time collection worth
              </p>
            </div>

            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Profit / Loss</h3>
              <p className="text-sm text-muted-foreground">
                Purchase vs. current value
              </p>
            </div>

            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Top Movers</h3>
              <p className="text-sm text-muted-foreground">
                Cards gaining or losing value
              </p>
            </div>

            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Category Breakdown</h3>
              <p className="text-sm text-muted-foreground">
                Value by player, set, or sport
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Display & Organization Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Plus: organization and presentation tools.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Organize your collection. Share your wins. Keep everything in one place.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Card Management */}
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Card Management</CardTitle>
                <CardDescription>
                  Upload and organize with ease
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Upload and store card images</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Track player, year, set, and grade</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Tag cards with custom labels</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Detect duplicates automatically</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Collection Views */}
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Frame className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Collection Views</CardTitle>
                <CardDescription>
                  Organize cards for better insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Group by player, set, or category</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Auto-generate by top value</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Public or private visibility</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Multiple layout options</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Share & Connect */}
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Share2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Share & Connect</CardTitle>
                <CardDescription>
                  Show your portfolio to the world
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Shareable collection links</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Social previews for X, Facebook</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Export for social media</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Auto-generated preview images</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* From Discovery to Deal Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              From discovery to deal.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Explore collections. Engage with cards. Make offers. Close deals.
              The complete collector lifecycle in one platform.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Explore</h3>
              <p className="text-sm text-muted-foreground">
                Discover trending cases and cards from other collectors
              </p>
            </div>

            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Engage</h3>
              <p className="text-sm text-muted-foreground">
                Like, comment, and bookmark cards you're interested in
              </p>
            </div>

            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Handshake className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Offer</h3>
              <p className="text-sm text-muted-foreground">
                Make offers on cards marked "Open to Offers"
              </p>
            </div>

            <div className="text-center p-6 bg-background rounded-lg border">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Connect</h3>
              <p className="text-sm text-muted-foreground">
                Direct messaging to negotiate and close deals
              </p>
            </div>
          </div>

          <div className="text-center mt-8 text-sm text-muted-foreground">
            No marketplace listings. No auction fees. Trade on your terms.
          </div>
        </div>
      </section>

      {/* Prestige Section */}
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
              Earn prestige badges based on your portfolio value and activity.
              Verified collection data and transparent analytics build credibility
              when you're ready to trade.
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

          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="text-center">
              <Award className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-medium">Prestige Badges</h3>
            </div>
            <div className="text-center">
              <Trophy className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-medium">Tiered Recognition</h3>
            </div>
            <div className="text-center">
              <Users className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-medium">Public Profiles</h3>
            </div>
          </div>
        </div>
      </section>

      {/* Why MyDisplayCase Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why collectors choose MyDisplayCase
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Pricing apps give you numbers. Marketplaces push you to sell. 
              We give you intelligence and control.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-4 gap-4 mb-6 text-center">
              <div></div>
              <div className="font-semibold text-muted-foreground text-sm">Pricing Apps</div>
              <div className="font-semibold text-muted-foreground text-sm">Marketplaces</div>
              <div className="font-semibold text-primary text-sm">MyDisplayCase</div>
            </div>
            
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-4 items-center py-3 border-b">
                <div className="text-sm font-medium">Real-time price data</div>
                <div className="text-center text-muted-foreground">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
                <div className="text-center text-muted-foreground">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
                <div className="text-center text-primary">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 items-center py-3 border-b">
                <div className="text-sm font-medium">AI-powered market outlook</div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-primary">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 items-center py-3 border-b">
                <div className="text-sm font-medium">BUY / WATCH / SELL guidance</div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-primary">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 items-center py-3 border-b">
                <div className="text-sm font-medium">Portfolio-level analytics</div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-primary">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 items-center py-3 border-b">
                <div className="text-sm font-medium">No selling pressure</div>
                <div className="text-center text-muted-foreground">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-primary">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 items-center py-3 border-b">
                <div className="text-sm font-medium">Collection organization</div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-muted-foreground text-sm">Limited</div>
                <div className="text-center text-primary">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 items-center py-3">
                <div className="text-sm font-medium">Direct trading</div>
                <div className="text-center text-muted-foreground text-sm">—</div>
                <div className="text-center text-muted-foreground">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
                <div className="text-center text-primary">
                  <Check className="h-5 w-5 mx-auto" />
                </div>
              </div>
            </div>
            
            <p className="text-center text-sm text-muted-foreground mt-8">
              The only platform that combines AI intelligence with portfolio management and social features.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple pricing. No games.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="relative">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  Free
                </CardTitle>
                <div className="text-3xl font-bold">$0</div>
                <CardDescription>Forever free</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Upload cards</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Create display cases</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Public or private visibility</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Basic analytics</span>
                  </li>
                </ul>
                <a href="/api/login" className="block mt-6">
                  <Button variant="outline" className="w-full" data-testid="button-free-plan">
                    Get Started Free
                  </Button>
                </a>
              </CardContent>
            </Card>

            <Card className="relative border-primary">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="gap-1">
                  <Star className="h-3 w-3" />
                  Most Popular
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
                    <Check className="h-4 w-4 text-primary" />
                    <span>AI price lookups</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>BUY / WATCH / SELL outlooks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Value history tracking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Premium display case themes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Unlimited display cases</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Advanced portfolio analytics</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Export and social sharing tools</span>
                  </li>
                </ul>
                <a href="/api/login" className="block mt-6">
                  <Button className="w-full" data-testid="button-pro-plan">
                    Start Pro
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-muted-foreground mt-8">
            Start free. Upgrade anytime.
          </p>
        </div>
      </section>

      {/* Founder Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Built by a collector—because the tools didn't exist.
          </h2>
          <div className="text-lg text-muted-foreground space-y-4">
            <p>
              I built MyDisplayCase for myself first.
            </p>
            <p>
              I wanted a better way to track my collection, understand its value,
              and actually enjoy looking at it—without spreadsheets or noisy marketplaces.
            </p>
            <p className="font-medium text-foreground">
              If you care about your cards, you'll feel at home here.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to manage your collection like a pro?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            AI pricing. Portfolio analytics. Beautiful display cases. All in one place.
          </p>
          <a href="/api/login">
            <Button size="lg" className="gap-2" data-testid="button-cta-bottom">
              Start tracking your collection
              <ArrowRight className="h-4 w-4" />
            </Button>
          </a>
          <p className="text-sm text-muted-foreground mt-4">
            Free forever. Pro unlocks AI intelligence.
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
              <Link href="/explore" className="hover:text-foreground transition-colors">
                Explore
              </Link>
              <Link href="/terms-of-service" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered portfolio management for card collectors.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
