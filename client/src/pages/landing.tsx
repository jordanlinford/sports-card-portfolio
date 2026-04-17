import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Check,
  ArrowRight,
  Store,
  ShieldCheck,
  Database,
  TrendingUp,
  Package,
  Brain,
} from "lucide-react";
import { SiGoogle } from "react-icons/si";

import playerOutlookImg from "@assets/sportscardportfolio.io_player-outlook_1766201421160.png";

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* SECTION 1 — HERO */}
      <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left — text */}
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-4" data-testid="text-hero-eyebrow">
                Independent. Data-Driven. Conflict-Free.
              </p>
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.05]"
                data-testid="text-hero-title"
              >
                Know exactly what your cards are worth — and what to do about it.
              </h1>
              <p
                className="text-base md:text-lg text-muted-foreground mb-8 max-w-xl"
                data-testid="text-hero-subtitle"
              >
                AI-powered buy, hold, and sell verdicts backed by real eBay data. No conflicts. No hype.
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                <Button asChild size="lg" className="gap-2 w-full sm:w-auto">
                  <a href="/api/auth/google" data-testid="button-hero-cta-primary">
                    <SiGoogle className="h-4 w-4" />
                    Get Started Free
                  </a>
                </Button>
                <Link
                  href="/player-outlook"
                  className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  data-testid="link-hero-live-analysis"
                >
                  → See a live player analysis
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground" data-testid="text-hero-social-proof">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  1,000+ collectors
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  812 markets tracked
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Free to start
                </span>
              </div>
            </div>

            {/* Right — browser-frame product screenshot */}
            <div className="relative" data-testid="hero-product-mockup">
              <div className="rounded-xl overflow-hidden border border-border/60 shadow-2xl bg-zinc-900">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 border-b border-zinc-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
                  <div className="ml-3 flex-1 max-w-xs px-2.5 py-1 rounded-md bg-zinc-700/70 text-[10px] text-zinc-400 truncate">
                    sportscardportfolio.io / player-outlook
                  </div>
                </div>
                {/* Cropped player outlook screenshot with bottom fade */}
                <div className="bg-white dark:bg-zinc-950">
                  <div
                    className="aspect-[4/3] overflow-hidden"
                    style={{
                      WebkitMaskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
                      maskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
                    }}
                  >
                    <img
                      src={playerOutlookImg}
                      alt="Player Outlook for Josh Allen showing Trade the Hype verdict, with Hold and Buy recommendation cards and a brief market summary"
                      className="w-full h-auto block object-cover object-top"
                      data-testid="img-hero-player-outlook"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 — TRUST BAR */}
      <section className="py-10 md:py-12 bg-muted/40 border-y" data-testid="section-trust-bar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                icon: Store,
                title: "No Marketplace",
                detail: "We don't sell cards or take commissions",
                testId: "trust-no-marketplace",
              },
              {
                icon: ShieldCheck,
                title: "No License Bias",
                detail: "We analyze what the data says, not what manufacturers want",
                testId: "trust-no-license-bias",
              },
              {
                icon: Database,
                title: "Real eBay Data",
                detail: "Every verdict backed by actual sold comps",
                testId: "trust-real-ebay-data",
              },
            ].map(({ icon: Icon, title, detail, testId }) => (
              <div key={title} className="flex flex-col items-center text-center" data-testid={testId}>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-semibold mb-1">{title}</p>
                <p className="text-xs text-muted-foreground max-w-[16rem]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 — FEATURES */}
      <section className="py-16 md:py-24" data-testid="section-features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-features-title">
              Everything you need to invest smarter
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                icon: TrendingUp,
                title: "Player Outlook",
                blurb: "Analyze any player as a stock. Get Buy, Hold, or Sell verdicts with market data.",
                href: "/player-outlook",
                testId: "feature-player-outlook",
              },
              {
                icon: Package,
                title: "Break Value Auditor",
                blurb: "Should you join that break? See EV per slot before you spend $25.",
                href: "/market/break-auditor",
                testId: "feature-break-auditor",
              },
              {
                icon: Brain,
                title: "Portfolio Intelligence",
                blurb: "AI reads your whole collection and tells you what to do next.",
                href: "/portfolio",
                testId: "feature-portfolio",
              },
            ].map(({ icon: Icon, title, blurb, href, testId }) => (
              <Link key={title} href={href} className="group block">
                <div
                  className="h-full rounded-xl border bg-card p-6 transition hover-elevate active-elevate-2"
                  data-testid={testId}
                >
                  <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{blurb}</p>
                  <span className="inline-flex items-center text-sm font-medium text-primary">
                    Try it free
                    <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4 — CLOSING CTA (DARK) */}
      <section className="py-16 md:py-24 bg-zinc-950 text-zinc-50" data-testid="section-cta-closer">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-8 leading-tight"
            data-testid="text-cta-closer-headline"
          >
            1,000+ collectors trust Sports Card Portfolio to make smarter decisions.
          </h2>
          <Button asChild size="lg" className="gap-2">
            <a href="/api/auth/google" data-testid="button-cta-closer">
              <SiGoogle className="h-4 w-4" />
              Start Free — No Credit Card Required
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
