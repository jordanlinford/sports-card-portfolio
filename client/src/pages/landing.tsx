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
      <section className="relative py-12 md:py-16 lg:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left side - Copy */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
                Your collection deserves more than a spreadsheet.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8" data-testid="text-hero-subtitle">
                Digital display cases, AI value tracking, and trading—built for serious collectors.
              </p>
              
              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-6">
                <a href="/api/login">
                  <Button size="lg" className="w-full sm:w-auto gap-2" data-testid="button-hero-cta">
                    Start your free display case
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
                No spreadsheets. No guesswork. No pressure to sell.
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
          <p className="text-muted-foreground mb-4">Built by a collector. Used by collectors.</p>
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
            Collecting shouldn't feel like accounting.
          </h2>
          <div className="text-lg text-muted-foreground space-y-4">
            <p>
              Most collectors end up juggling spreadsheets, notes apps, and endless eBay searches
              just to keep track of what they own and what it might be worth.
            </p>
            <p>
              Cards sit in boxes. Values go stale. Great collections stay hidden.
            </p>
            <p className="font-medium text-foreground">
              Your collection deserves better.
            </p>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            One home for your entire collection.
          </h2>
          <div className="text-lg text-muted-foreground space-y-4 mb-8">
            <p>
              MyDisplayCase gives your cards a digital home you're proud of.
            </p>
            <p>
              Upload cards, organize them into beautiful display cases, track value over time,
              and share your collection with the world—or keep it private.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm font-medium text-muted-foreground">
            <span>No marketplaces.</span>
            <span>No selling pressure.</span>
            <span>Just tools built for people who actually care about their cards.</span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything a serious collector needs.
            </h2>
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
                  Upload and manage your cards with ease.
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
                    <span>Add player, year, set, condition, and grade</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Track purchase price and estimated value</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Tag cards with custom labels</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Detect duplicates automatically</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Mark cards as "Open to Offers"</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Display Cases */}
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Layers className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Display Cases</CardTitle>
                <CardDescription>
                  Turn your collection into something worth showing off.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Create unlimited display cases</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Grid, Row, and Showcase layouts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Public or private visibility</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Auto-generate cases by tag or top value</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Premium themes for Pro users</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Portfolio Analytics */}
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Portfolio Analytics</CardTitle>
                <CardDescription>
                  See the big picture.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Total collection value</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Value breakdown by category</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Top performing cards</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Historical value tracking</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Collection growth over time</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* AI Value Section (Pro) */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Zap className="h-3 w-3 mr-1" />
              Pro Feature
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Know what your cards are worth—without the guesswork.
            </h2>
            <p className="text-muted-foreground text-lg max-w-3xl mx-auto mb-6">
              Pro users unlock AI-powered insights that analyze market data and turn it into
              clear, collector-friendly recommendations.
            </p>
            <p className="text-sm text-muted-foreground">
              This isn't day trading. It's clarity.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">AI Price Lookups</h3>
              <p className="text-sm text-muted-foreground">
                Real prices from eBay sold listings, powered by AI
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">BUY / WATCH / SELL</h3>
              <p className="text-sm text-muted-foreground">
                Investment-style recommendations for every card
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Confidence Scores</h3>
              <p className="text-sm text-muted-foreground">
                Explanations for every recommendation
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Category-Aware</h3>
              <p className="text-sm text-muted-foreground">
                Different logic for Sports, TCG, and Non-Sport
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social & Sharing Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Your collection. Your link.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Every display case can be shared with a single URL.
              Whether you're showing off, trading, or just keeping a personal archive,
              your collection finally lives somewhere that makes sense.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-5xl mx-auto">
            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Share2 className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">Shareable Cases</h3>
              <p className="text-xs text-muted-foreground">Public display cases</p>
            </div>

            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">Social Previews</h3>
              <p className="text-xs text-muted-foreground">X, Facebook, Discord</p>
            </div>

            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Image className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">Auto Images</h3>
              <p className="text-xs text-muted-foreground">Generated previews</p>
            </div>

            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Copy className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">Export Cases</h3>
              <p className="text-xs text-muted-foreground">Download as images</p>
            </div>

            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Heart className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">Like & Comment</h3>
              <p className="text-xs text-muted-foreground">Engage with cards</p>
            </div>

            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bookmark className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">Bookmark Cards</h3>
              <p className="text-xs text-muted-foreground">Save your favorites</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trading Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Trade on your terms.
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Mark cards as "Open to Offers" and let other collectors come to you.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground mb-12">
            <span>No listings.</span>
            <span>No auctions.</span>
            <span>No pressure.</span>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm">Make Offers</h3>
            </div>

            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm">Accept or Counter</h3>
            </div>

            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm">Track History</h3>
            </div>

            <div className="text-center p-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm">Private Messaging</h3>
            </div>
          </div>
        </div>
      </section>

      {/* Prestige Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Trophy className="h-3 w-3 mr-1" />
              Prestige System
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built for collectors, not flippers.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Earn prestige badges based on your collection and activity.
              Show your status, highlight milestones, and build a public collector profile
              that reflects how seriously you take the hobby.
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

      {/* Pricing Section */}
      <section className="py-16 md:py-24 bg-muted/30">
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
          <h2 className="text-3xl md:text-4xl font-bold mb-8">
            Give your collection the home it deserves.
          </h2>
          <a href="/api/login">
            <Button size="lg" className="gap-2" data-testid="button-cta-bottom">
              Start your free display case
              <ArrowRight className="h-4 w-4" />
            </Button>
          </a>
          <p className="text-sm text-muted-foreground mt-4">
            No credit card required.
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
              A simple, beautiful way to showcase your collection.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
