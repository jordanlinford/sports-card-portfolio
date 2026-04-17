import { useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { hasProAccess } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiGoogle } from "react-icons/si";
import {
  Check,
  X,
  Crown,
  Shield,
  Star,
  Zap,
  ArrowRight,
  HelpCircle,
} from "lucide-react";

type FeatureRow = {
  label: string;
  detail?: string;
  free: boolean | string;
  pro: boolean | string;
};

type FeatureGroup = {
  title: string;
  rows: FeatureRow[];
};

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Collection management",
    rows: [
      { label: "Display cases (portfolios)", free: "Up to 3", pro: "Unlimited" },
      { label: "Cards per case", free: "Unlimited", pro: "Unlimited" },
      { label: "Tagging & smart auto-cases", free: true, pro: true },
      { label: "Public sharing links & display themes", free: true, pro: true },
      { label: "Duplicate detection", free: true, pro: true },
    ],
  },
  {
    title: "AI card scanning & valuation",
    rows: [
      { label: "AI card image scanner (Gemini 2.5)", free: "Daily limit", pro: "Higher daily limit" },
      { label: "Batch scan multiple cards at once", free: false, pro: true },
      { label: "Batch portfolio analysis", free: false, pro: true },
      { label: "1-of-1 card valuation engine", free: true, pro: true },
      { label: "Live eBay comp lookups", free: true, pro: true },
    ],
  },
  {
    title: "Market intelligence",
    rows: [
      { label: "Player Outlook with verdict & conviction", free: true, pro: true },
      { label: "Market Leaderboard", free: true, pro: true },
      { label: "Hidden Gems feed", free: true, pro: true },
      { label: "Alpha Feed daily briefing", free: true, pro: true },
      { label: "Break Value Auditor (EV analysis)", free: "Summary", pro: "Full breakdown" },
      { label: "Sealed Product ROI Calculator", free: "Verdict only", pro: "Full breakdown" },
    ],
  },
  {
    title: "Pro investor tools",
    rows: [
      { label: "Card Advisor (AI portfolio audit)", free: false, pro: true },
      { label: "Portfolio-specific buy recommendations", free: false, pro: true },
      { label: "Growth projections (3 / 6 / 12 month)", free: false, pro: true },
      { label: "Portfolio Alpha benchmark", free: false, pro: true },
      { label: "Watchlist change alerts", free: true, pro: true },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Email support", free: true, pro: true },
      { label: "Priority support", free: false, pro: true },
    ],
  },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return <Check className="h-5 w-5 text-primary mx-auto" data-testid="cell-check" />;
  }
  if (value === false) {
    return <X className="h-5 w-5 text-muted-foreground/40 mx-auto" data-testid="cell-x" />;
  }
  return (
    <span className="text-sm text-foreground" data-testid="cell-text">
      {value}
    </span>
  );
}

export default function PricingPage() {
  const { isAuthenticated, user } = useAuth();
  const isPro = hasProAccess(user);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Pricing — Free vs Pro | Sports Card Portfolio";

    const setMeta = (selector: string, attr: string, name: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
      return el;
    };

    const description =
      "Compare Sports Card Portfolio Free and Pro plans. Pro is $12/month and unlocks batch analysis, the Card Advisor, growth projections, and the full investor toolkit.";

    const metaDesc = setMeta('meta[name="description"]', "name", "description", description);
    const ogTitle = setMeta('meta[property="og:title"]', "property", "og:title", "Sports Card Portfolio Pricing");
    const ogDesc = setMeta('meta[property="og:description"]', "property", "og:description", description);

    return () => {
      document.title = prevTitle;
      metaDesc.setAttribute("content", "");
      ogTitle.setAttribute("content", "");
      ogDesc.setAttribute("content", "");
    };
  }, []);

  const FreeCta = () =>
    isAuthenticated ? (
      <Link href="/dashboard" className="block">
        <Button variant="outline" className="w-full" data-testid="button-free-dashboard">
          Go to Dashboard
        </Button>
      </Link>
    ) : (
      <a href="/api/auth/google" className="block" data-testid="link-free-signup">
        <Button variant="outline" className="w-full gap-2">
          <SiGoogle className="h-4 w-4" />
          Get Started Free
        </Button>
      </a>
    );

  const ProCta = () => {
    if (isPro) {
      return (
        <Button variant="outline" className="w-full gap-2" disabled data-testid="button-pro-current">
          <Crown className="h-4 w-4" />
          You're on Pro
        </Button>
      );
    }
    if (isAuthenticated) {
      return (
        <Link href="/upgrade" className="block">
          <Button className="w-full gap-2" data-testid="button-pro-upgrade">
            <Zap className="h-4 w-4" />
            Upgrade to Pro
          </Button>
        </Link>
      );
    }
    return (
      <a href="/api/auth/google" className="block" data-testid="link-pro-signup">
        <Button className="w-full gap-2">
          <SiGoogle className="h-4 w-4" />
          Start with Pro
        </Button>
      </a>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
      <div className="text-center mb-12">
        <Badge className="mb-4 gap-1" variant="secondary">
          <Star className="h-3 w-3" />
          Pricing
        </Badge>
        <h1 className="text-3xl md:text-5xl font-bold mb-4" data-testid="text-pricing-title">
          Simple pricing. Real tools.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Start free with the core portfolio and market tools. Upgrade to Pro when you want
          batch analysis, the Card Advisor, growth projections, and the rest of our investor toolkit.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
        <Card data-testid="card-plan-free">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              Free
            </CardTitle>
            <div className="text-4xl font-bold pt-2">$0</div>
            <CardDescription>Forever free. No credit card required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Up to 3 display cases with unlimited cards</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>AI card scanner (daily limit)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Player Outlook, Hidden Gems, Alpha Feed, Market Leaderboard</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Break and sealed product summary verdicts</span>
              </li>
            </ul>
            <FreeCta />
          </CardContent>
        </Card>

        <Card className="border-primary relative" data-testid="card-plan-pro">
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
            <div className="text-4xl font-bold pt-2">
              $12<span className="text-lg font-normal text-muted-foreground">/month</span>
            </div>
            <CardDescription>Everything in Free, plus the full investor toolkit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span className="font-medium">Unlimited display cases</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Batch scan and batch portfolio analysis</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Card Advisor — AI portfolio audit with function-calling tools</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Growth projections and portfolio-specific buy recommendations</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Full break and sealed product EV breakdowns</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Priority support</span>
              </li>
            </ul>
            <ProCta />
          </CardContent>
        </Card>
      </div>

      <div className="mb-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8" data-testid="text-compare-title">
          Compare plans, feature by feature
        </h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium p-4 w-1/2">Feature</th>
                    <th className="font-medium p-4 w-1/4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        Free
                      </div>
                    </th>
                    <th className="font-medium p-4 w-1/4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Crown className="h-4 w-4 text-primary" />
                        Pro
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_GROUPS.flatMap((group) => [
                    <tr key={`group-${group.title}`} className="bg-muted/40">
                      <td colSpan={3} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                      </td>
                    </tr>,
                    ...group.rows.map((row, i) => (
                      <tr
                        key={`${group.title}-${i}`}
                        className="border-b last:border-0"
                        data-testid={`row-feature-${group.title.replace(/\s+/g, "-").toLowerCase()}-${i}`}
                      >
                        <td className="p-4">
                          <div className="font-medium">{row.label}</div>
                          {row.detail && (
                            <div className="text-xs text-muted-foreground mt-1">{row.detail}</div>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <Cell value={row.free} />
                        </td>
                        <td className="p-4 text-center">
                          <Cell value={row.pro} />
                        </td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-3xl mx-auto mb-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8 flex items-center justify-center gap-2">
          <HelpCircle className="h-6 w-6 text-muted-foreground" />
          Frequently asked questions
        </h2>
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Can I try Pro before paying?</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Yes. Sign up free and you'll get the core portfolio and market tools right away. You can
              upgrade to Pro any time from the Upgrade page or by entering a promo code if you have one.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Can I cancel anytime?</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Yes. Pro is month-to-month and managed through Stripe. Cancel from your billing settings
              and you'll keep Pro access through the end of your billing period.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Do I lose my collection if I downgrade?</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              No. Your cards and display cases stay intact. If you've gone over the 3-case free limit,
              you'll just be unable to create new cases until you re-upgrade or remove some.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Are values guaranteed?</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              No. All AI valuations, growth projections, and verdicts are research tools, not financial
              advice. Markets move and our signals can be wrong — always do your own due diligence.
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="text-center bg-muted/40 rounded-lg p-8 md:p-12">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Ready to get started?</h2>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Start free in under a minute. Upgrade to Pro whenever you want the full investor toolkit.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {isAuthenticated ? (
            <>
              <Link href="/dashboard">
                <Button size="lg" variant="outline" className="gap-2" data-testid="button-cta-dashboard">
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              {!isPro && (
                <Link href="/upgrade">
                  <Button size="lg" className="gap-2" data-testid="button-cta-upgrade">
                    <Zap className="h-4 w-4" />
                    Upgrade to Pro
                  </Button>
                </Link>
              )}
            </>
          ) : (
            <a href="/api/auth/google">
              <Button size="lg" className="gap-2" data-testid="button-cta-signup">
                <SiGoogle className="h-4 w-4" />
                Continue with Google
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
