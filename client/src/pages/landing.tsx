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
  Zap
} from "lucide-react";

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="secondary" className="mb-6">
              <Sparkles className="h-3 w-3 mr-1" />
              The home for your collection
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
              A Simple, Beautiful Way to{" "}
              <span className="text-primary">Showcase Your Collection</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Create stunning digital display cases for your sports cards, trading cards, and collectibles. 
              Share your passion with the world.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/api/login">
                <Button size="lg" className="w-full sm:w-auto gap-2" data-testid="button-hero-cta">
                  <LayoutGrid className="h-5 w-5" />
                  Create Your Free Display Case
                </Button>
              </a>
              <Link href="/cases/example">
                <Button variant="outline" size="lg" className="w-full sm:w-auto" data-testid="button-view-example">
                  View Example Case
                </Button>
              </Link>
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
              Simple tools designed specifically for collectors like you.
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
                  <LayoutGrid className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Beautiful Grids</CardTitle>
                <CardDescription>
                  Your cards displayed in a stunning, responsive gallery that looks great on any device.
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
              Start free. Upgrade when you need more space.
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
                    <span>Public sharing links</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Beautiful grid display</span>
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
                    <span>Unlimited cards per case</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Public sharing links</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Beautiful grid display</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Priority support</span>
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
          <a href="/api/login">
            <Button size="lg" className="gap-2" data-testid="button-cta-bottom">
              <LayoutGrid className="h-5 w-5" />
              Create Your Free Display Case
            </Button>
          </a>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" />
              <span className="font-semibold">MyDisplayCase</span>
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
