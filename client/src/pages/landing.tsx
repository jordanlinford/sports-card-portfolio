import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  Rows,
  Layers,
  Search,
  Globe,
  Users,
  Bookmark,
  ArrowRightLeft,
  Trophy,
  Award,
  Flame,
  BarChart3,
  Palette,
  UserPlus,
  Frame,
  Handshake,
  ArrowRight
} from "lucide-react";

type FeaturedCard = {
  id: number;
  title: string;
  imagePath: string;
  estimatedValue: number | null;
};

export default function Landing() {
  // Fetch featured cards for hero section
  const { data: featuredCards = [] } = useQuery<FeaturedCard[]>({
    queryKey: ["/api/featured-cards"],
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative py-16 md:py-24 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left side - Copy */}
            <div className="text-center lg:text-left">
              <Badge variant="secondary" className="mb-6">
                <Sparkles className="h-3 w-3 mr-1" />
                The home for your collection
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
                Your Collection, Finally Displayed{" "}
                <span className="text-primary">the Way It Deserves</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8" data-testid="text-hero-subtitle">
                Build stunning display cases, track your portfolio's value, get real-time price updates, 
                and trade with other collectors—all in one place.
              </p>
              
              {/* Hero Bullets */}
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Frame className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-muted-foreground">Beautiful customizable display cases</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-muted-foreground">AI-powered price lookups & analytics</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Handshake className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-muted-foreground">Offers, trades, likes, comments & follows</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Search className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-muted-foreground">Discover display cases from collectors everywhere</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Trophy className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-muted-foreground">Earn badges & climb collector tiers</span>
                </li>
              </ul>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <a href="/api/login">
                  <Button size="lg" className="w-full sm:w-auto gap-2" data-testid="button-hero-cta">
                    Start Your Free Collection
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
                <Link href="/explore">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2" data-testid="button-explore">
                    <Globe className="h-5 w-5" />
                    See Public Display Cases
                  </Button>
                </Link>
              </div>
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
                        mydisplaycase.com
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
                    
                    {/* Card grid with real images - 2x2 layout */}
                    <div className="grid grid-cols-2 gap-3">
                      {featuredCards.length > 0 ? (
                        featuredCards.slice(0, 4).map((card) => (
                          <div 
                            key={card.id} 
                            className="aspect-[2.5/3.5] rounded-lg overflow-hidden bg-gradient-to-br from-muted to-muted/50 shadow-md"
                          >
                            <img 
                              src={card.imagePath}
                              alt={card.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))
                      ) : (
                        [1, 2, 3, 4].map((i) => (
                          <div 
                            key={i} 
                            className="aspect-[2.5/3.5] bg-gradient-to-br from-muted to-muted/50 rounded-lg flex items-center justify-center"
                          >
                            <LayoutGrid className="h-5 w-5 text-muted-foreground/50" />
                          </div>
                        ))
                      )}
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

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to Show Off Your Cards
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Powerful tools designed specifically for collectors like you.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Easy Upload</CardTitle>
                <CardDescription>
                  Drag and drop your card images. Add details like year, set, grade, and value in seconds.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Layers className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Multiple Layout Styles</CardTitle>
                <CardDescription>
                  Choose from Grid, Row, or Showcase layouts. Display your cards the way you want them.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Share2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Public Sharing</CardTitle>
                <CardDescription>
                  Share your display cases with friends, fellow collectors, or on social media with a single link.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Tag className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Tag Organization</CardTitle>
                <CardDescription>
                  Organize cards with tags like Rookie, Auto, Refractor, Vintage, and more. Create cases from any tag instantly.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Value Tracking</CardTitle>
                <CardDescription>
                  Track your collection's value over time. See price changes with visual indicators on every card.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Heart className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Social Features</CardTitle>
                <CardDescription>
                  Like and comment on collections. Connect with fellow collectors and discover new cards.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Flame className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Trending Discovery</CardTitle>
                <CardDescription>
                  Explore trending collections, discover new collectors, and find inspiration for your own displays.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Portfolio Analytics</CardTitle>
                <CardDescription>
                  See charts of your collection value, breakdown by case, and track your top cards over time.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Palette className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Premium Themes</CardTitle>
                <CardDescription>
                  Choose from 8 beautiful display themes including Wood Grain, Velvet, Ocean Blue, and more.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Zap className="h-3 w-3 mr-1" />
              Pro Feature
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              AI-Powered Price Lookups
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Get instant card values from eBay sold listings. Our AI analyzes recent sales to give you accurate market prices.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">eBay Market Data</h3>
              <p className="text-sm text-muted-foreground">
                Real prices from actual eBay sold listings, not estimates
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">One-Click Refresh</h3>
              <p className="text-sm text-muted-foreground">
                Update all card values in a case with a single click
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Track Changes</h3>
              <p className="text-sm text-muted-foreground">
                See value increases and decreases with visual indicators
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Display Your Cards Your Way
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Choose from three beautiful layout styles for each display case.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card>
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Grid3X3 className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Grid Layout</CardTitle>
                <CardDescription>
                  Classic 4-column grid perfect for showcasing your full collection at a glance.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Rows className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Row Layout</CardTitle>
                <CardDescription>
                  Horizontal scrolling display that lets each card shine with room to breathe.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Layers className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>Showcase Layout</CardTitle>
                <CardDescription>
                  Premium fanned display that highlights your best cards with style.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Users className="h-3 w-3 mr-1" />
              Community
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Connect, Trade, and Collect Together
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Join a community of collectors. Follow your favorites, make offers, and trade cards.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Follow Collectors</h3>
              <p className="text-sm text-muted-foreground">
                Follow your favorite collectors and see their latest additions
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Make Offers</h3>
              <p className="text-sm text-muted-foreground">
                See a card you want? Send an offer directly to the owner
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <ArrowRightLeft className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Trade Cards</h3>
              <p className="text-sm text-muted-foreground">
                Propose card-for-card trades with other collectors
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bookmark className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Bookmark Cards</h3>
              <p className="text-sm text-muted-foreground">
                Save cards you love from any public collection
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Trophy className="h-3 w-3 mr-1" />
              Prestige System
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Build Your Collector Reputation
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Earn prestige points and unlock collector tiers as you grow your collection.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 mb-12">
            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#CD7F32', opacity: 0.2 }}>
                <Award className="h-8 w-8" style={{ color: '#CD7F32' }} />
              </div>
              <h3 className="font-semibold">Bronze</h3>
              <p className="text-xs text-muted-foreground">Getting Started</p>
            </div>

            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#C0C0C0', opacity: 0.2 }}>
                <Award className="h-8 w-8" style={{ color: '#C0C0C0' }} />
              </div>
              <h3 className="font-semibold">Silver</h3>
              <p className="text-xs text-muted-foreground">100+ Points</p>
            </div>

            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#FFD700', opacity: 0.2 }}>
                <Award className="h-8 w-8" style={{ color: '#FFD700' }} />
              </div>
              <h3 className="font-semibold">Gold</h3>
              <p className="text-xs text-muted-foreground">500+ Points</p>
            </div>

            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#E5E4E2', opacity: 0.2 }}>
                <Award className="h-8 w-8" style={{ color: '#A0A0A0' }} />
              </div>
              <h3 className="font-semibold">Platinum</h3>
              <p className="text-xs text-muted-foreground">2000+ Points</p>
            </div>

            <div className="text-center px-6 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#B9F2FF', opacity: 0.2 }}>
                <Award className="h-8 w-8" style={{ color: '#00CED1' }} />
              </div>
              <h3 className="font-semibold">Diamond</h3>
              <p className="text-xs text-muted-foreground">5000+ Points</p>
            </div>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              Earn points by adding cards, creating cases, getting likes, making trades, and more.
              Unlock achievement badges along the way!
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Collector-Friendly Pricing
            </h2>
            <p className="text-muted-foreground text-lg">
              Start free. Upgrade when you need more power.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="relative">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  Free
                </CardTitle>
                <div className="text-3xl font-bold">$0</div>
                <CardDescription>Perfect for getting started</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Up to 3 display cases</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Unlimited cards per case</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>All layout styles</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Tag organization</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Follow collectors & social features</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Make offers & trade cards</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Prestige badges & tiers</span>
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
                    <span className="font-medium">Unlimited display cases</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Everything in Free, plus:</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="font-medium">AI-powered price lookups</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Bulk value refresh</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="font-medium">6 Premium display themes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Portfolio analytics & charts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Top Cards case generator</span>
                  </li>
                </ul>
                <a href="/api/login" className="block mt-6">
                  <Button className="w-full" data-testid="button-pro-plan">
                    Start Pro Trial
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Showcase Your Collection?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Join collectors who are proudly displaying their cards online. It takes less than a minute to get started.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/api/login">
              <Button size="lg" className="gap-2" data-testid="button-cta-bottom">
                <LayoutGrid className="h-5 w-5" />
                Create Your Free Display Case
              </Button>
            </a>
            <Link href="/explore">
              <Button variant="outline" size="lg" className="gap-2">
                <Globe className="h-5 w-5" />
                Browse Public Collections
              </Button>
            </Link>
          </div>
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
