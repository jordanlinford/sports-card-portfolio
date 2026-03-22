import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Shield,
  Calendar,
  Layers,
  Target,
  Flame,
  Snowflake,
  Minus,
  BarChart3,
  ChevronRight,
  Sparkles,
  Eye,
} from "lucide-react";
import { SiGoogle } from "react-icons/si";

const KEY_PLAYERS = [
  "Patrick Mahomes",
  "Josh Allen",
  "Lamar Jackson",
  "Ja'Marr Chase",
  "CeeDee Lamb",
  "Caleb Williams",
];

const FAQ_ITEMS = [
  {
    question: "Will Panini NFL cards lose value after the Topps takeover?",
    answer: "It depends on the player and card type. Panini's unlicensed status means new Panini NFL products will no longer carry official NFL logos or team imagery. Historically, unlicensed cards trade at a significant discount to licensed equivalents. However, key Panini rookie cards from stars like Patrick Mahomes or Justin Herbert may retain collector value as the definitive rookie cards for those players — the rookies don't get re-issued by Topps.",
  },
  {
    question: "When does Topps take over the NFL license from Panini?",
    answer: "Fanatics (which owns Topps) officially holds the exclusive NFL trading card license starting April 1, 2026. This means all officially licensed NFL cards going forward will be produced under the Topps brand. Panini can continue producing cards but without NFL logos, team names, or official imagery.",
  },
  {
    question: "Should I buy Topps NFL cards now or wait?",
    answer: "Early Topps NFL products will likely carry a premium due to novelty and pent-up demand. If you're investing, consider waiting for the initial hype to cool before buying base products. However, key rookie cards from the first Topps NFL release could have long-term historical significance as the 'first Topps NFL card' for that draft class.",
  },
  {
    question: "What happens to Panini Prizm and Select NFL value?",
    answer: "Panini Prizm and Select have been flagship NFL products for over a decade. While future releases won't carry NFL licensing, existing Prizm and Select rookie cards remain the recognized rookies for those players. The brand equity doesn't disappear overnight, but long-term premiums may shift toward Topps Chrome and similar licensed products.",
  },
  {
    question: "How does the license change affect graded Panini cards?",
    answer: "Already graded Panini cards (PSA, BGS, SGC) retain their established market value. A PSA 10 Panini Prizm Silver Patrick Mahomes rookie is still THE rookie card. The license change primarily affects new product releases and the relative desirability of future Panini vs. Topps products.",
  },
  {
    question: "Will Topps Chrome replace Panini Prizm as the top NFL product?",
    answer: "Topps Chrome is positioned to become the flagship NFL chromium product, similar to its dominance in baseball. Whether it fully replaces Prizm in collector preference will depend on product design, insert programs, and the strength of early releases. The first few Topps Chrome NFL releases will be closely watched by the market.",
  },
];

function getVerdictBadge(verdict: string) {
  const v = verdict?.toUpperCase() || "";
  if (v.includes("ACCUMULATE") || v.includes("BUY"))
    return { color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30", icon: <TrendingUp className="h-3 w-3" />, label: "Buy" };
  if (v.includes("AVOID") || v.includes("SELL"))
    return { color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30", icon: <TrendingDown className="h-3 w-3" />, label: "Sell" };
  if (v.includes("TRADE") || v.includes("HYPE"))
    return { color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30", icon: <AlertTriangle className="h-3 w-3" />, label: "Trade the Hype" };
  if (v.includes("HOLD"))
    return { color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30", icon: <Minus className="h-3 w-3" />, label: "Hold" };
  if (v.includes("SPECULATIVE"))
    return { color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30", icon: <Sparkles className="h-3 w-3" />, label: "Speculative" };
  return { color: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30", icon: <Eye className="h-3 w-3" />, label: "Monitor" };
}

function getTemperatureBadge(temp: string) {
  switch (temp?.toUpperCase()) {
    case "HOT": return { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: <Flame className="h-3 w-3" />, label: "Hot" };
    case "WARM": return { color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: <TrendingUp className="h-3 w-3" />, label: "Warm" };
    case "COOLING": return { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <Snowflake className="h-3 w-3" />, label: "Cooling" };
    default: return { color: "bg-slate-500/10 text-slate-600 border-slate-500/20", icon: <Minus className="h-3 w-3" />, label: "Neutral" };
  }
}

function PlayerSignalCard({ playerName, data, isLoading }: { playerName: string; data: any; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card data-testid={`card-player-signal-loading-${playerName.replace(/\s/g, "-").toLowerCase()}`}>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-6 w-20" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const verdict = getVerdictBadge(data.verdict);
  const temp = getTemperatureBadge(data.temperature);
  const slug = playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return (
    <Card className="hover:border-primary/30 transition-colors" data-testid={`card-player-signal-${playerName.replace(/\s/g, "-").toLowerCase()}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{playerName}</CardTitle>
          <div className="flex gap-1.5">
            <Badge className={`${verdict.color} gap-1 text-xs`}>
              {verdict.icon}
              {verdict.label}
            </Badge>
            <Badge className={`${temp.color} gap-1 text-xs`}>
              {temp.icon}
              {temp.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2" data-testid={`text-player-summary-${playerName.replace(/\s/g, "-").toLowerCase()}`}>{data.summary}</p>
        <Link href={`/outlook/football/${slug}`}>
          <Button variant="ghost" size="sm" className="gap-1 text-xs p-0 h-auto text-primary" data-testid={`link-player-outlook-${slug}`}>
            Full Outlook <ChevronRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function ToppsTakeoverPage() {
  useEffect(() => {
    document.title = "Topps NFL Takeover 2026: What It Means for Card Values | Sports Card Portfolio";
  }, []);

  const { data: playerSignals, isLoading } = useQuery<Record<string, any>>({
    queryKey: ["/api/market/topps-takeover-signals"],
    staleTime: 1000 * 60 * 30,
  });

  return (
    <div className="flex flex-col min-h-screen" data-testid="page-topps-takeover">
      <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge variant="outline" className="mb-4 text-xs font-medium tracking-wide uppercase px-3 py-1" data-testid="badge-topps-takeover">
            Market Intelligence
          </Badge>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4" data-testid="text-topps-takeover-title">
            The Topps NFL Takeover: What It Means for Your Cards
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-6 max-w-2xl mx-auto" data-testid="text-topps-takeover-subtitle">
            On April 1, 2026, Fanatics hands the NFL trading card license exclusively to Topps. Here's how the biggest licensing shift in decades affects your portfolio.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" />
              Updated March 2026
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-primary" />
              Independent Analysis
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" />
              Real Market Data
            </span>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 border-t">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-6" data-testid="text-section-whats-happening">
            What's Happening
          </h2>
          <div className="prose prose-slate dark:prose-invert max-w-none space-y-4 text-muted-foreground">
            <p className="text-base leading-relaxed">
              After more than a decade of Panini dominance, the NFL trading card landscape is undergoing its most significant shift since the junk wax era. Fanatics — which acquired Topps in 2022 — is activating its exclusive NFL license on <strong className="text-foreground">April 1, 2026</strong>, making Topps the sole producer of officially licensed NFL trading cards.
            </p>
            <p className="text-base leading-relaxed">
              This means Panini can no longer use NFL team logos, names, or official imagery on new products. Existing Panini cards remain unaffected — a PSA 10 Prizm Silver rookie is still that player's recognized rookie card — but the market dynamics for new and future products are shifting dramatically.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-muted/30 border-t">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-4" data-testid="text-section-impact">
            How This Impacts Card Values
          </h2>
          <p className="text-muted-foreground mb-8 text-base">
            The license change creates winners and losers. Here's our independent, data-driven breakdown.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <Card className="border-green-500/20 bg-green-500/5" data-testid="card-beneficiaries">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-400">
                  <TrendingUp className="h-5 w-5" />
                  Likely Beneficiaries
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">Existing Panini rookie cards</strong> — Key Prizm, Select, and National Treasures rookies become the permanent rookie cards for those players. No Topps re-issue.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">First Topps NFL releases</strong> — Historical significance as the return of Topps to football. First Topps Chrome NFL cards will be highly collectible.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">Graded Panini flagship products</strong> — PSA 10 Prizm Silvers and BGS 9.5 Select rookies are established and won't be replaced.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-red-500/20 bg-red-500/5" data-testid="card-risks">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-red-700 dark:text-red-400">
                  <TrendingDown className="h-5 w-5" />
                  Potential Risks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">Future Panini base products</strong> — Without NFL licensing, new Panini football releases will trade at steep discounts to their licensed history.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">Panini brand hype premiums</strong> — Cards currently priced based on brand loyalty may correct as collector attention shifts to Topps.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">Overpaying for early Topps</strong> — Initial Topps NFL releases may carry a novelty premium that fades after the first few sets.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/20" data-testid="card-independent-take">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Our Independent Take</p>
                  <p className="text-sm text-muted-foreground">
                    We don't sell cards, represent manufacturers, or take marketplace commissions. Our analysis is based on historical license transitions, real eBay sold data, and AI-powered market signals — not sponsored content.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-12 md:py-16 border-t">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold" data-testid="text-section-live-signals">
                Live Player Signals
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                AI-powered outlook data for key NFL players affected by the transition.
              </p>
            </div>
            <Link href="/player-outlook">
              <Button variant="outline" size="sm" className="gap-1" data-testid="link-player-outlook-all">
                All Players <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {KEY_PLAYERS.map((name) => (
              <PlayerSignalCard
                key={name}
                playerName={name}
                data={playerSignals?.[name]}
                isLoading={isLoading}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-muted/30 border-t">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-4" data-testid="text-section-strategy">
            What Collectors Should Do Now
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">Protect Your Core</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Hold established Panini rookie cards for star players — they're irreplaceable. Focus on graded flagships (Prizm Silver, Select, National Treasures) that have years of market precedent.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">Avoid the Hype Trap</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Don't overpay for the first Topps NFL products out of FOMO. Supply will normalize. Wait for market signals before making large purchases on new Topps releases.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">Diversify Your Sets</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Collectors heavy in Panini should consider building positions in early Topps flagship releases. A balanced portfolio across both eras provides downside protection.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 border-t">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-6" data-testid="text-section-faq">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQ_ITEMS.map((faq, i) => (
              <Card key={i} data-testid={`card-faq-${i}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{faq.question}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-t">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Track the Transition with Data, Not Hype
          </h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Sports Card Portfolio gives you independent, AI-powered analysis on every player and card — so you can navigate the Topps takeover with confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/api/auth/google" data-testid="button-topps-cta-google">
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                <SiGoogle className="h-4 w-4" />
                Get Started Free
              </Button>
            </a>
            <Link href="/hidden-gems">
              <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto" data-testid="link-hidden-gems-cta">
                <Sparkles className="h-4 w-4" />
                Explore Hidden Gems
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
