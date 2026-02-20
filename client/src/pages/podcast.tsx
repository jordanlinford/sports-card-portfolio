import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { hasProAccess } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Gem,
  BarChart3,
  Eye,
  TrendingUp,
  Brain,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex w-full items-center justify-between gap-2 py-4 text-left font-medium hover-elevate rounded-md px-2"
        onClick={() => setOpen(!open)}
        data-testid={`faq-toggle-${question.slice(0, 20).replace(/\s/g, "-").toLowerCase()}`}
      >
        <span>{question}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <p className="pb-4 px-2 text-muted-foreground text-sm leading-relaxed">{answer}</p>
      )}
    </div>
  );
}

const benefits = [
  {
    icon: Gem,
    title: "Hidden Gems Discovery",
    description: "AI-curated undervalued players across all major sports, refreshed regularly.",
  },
  {
    icon: BarChart3,
    title: "Portfolio Health Score",
    description: "See how your collection stacks up with risk signals and diversification analysis.",
  },
  {
    icon: Eye,
    title: "Watchlist Tracking",
    description: "Track players you're eyeing and get alerts when market conditions change.",
  },
  {
    icon: TrendingUp,
    title: "Price Trend Charts",
    description: "18-month eBay sold data visualized so you can spot momentum and dips.",
  },
  {
    icon: Brain,
    title: "AI Card Outlook",
    description: "Buy, hold, or sell verdicts powered by real market data and player news.",
  },
  {
    icon: Crown,
    title: "Unlimited Analyses",
    description: "No monthly caps on card lookups, portfolio insights, or market tools.",
  },
];

const faqs = [
  {
    question: "Do I need a credit card to start the trial?",
    answer: "No. Just sign up and the 7-day Pro trial activates automatically. No credit card required.",
  },
  {
    question: "What happens after the 7 days?",
    answer: "Your account reverts to our free tier. You keep your cards and portfolios, but Pro-only features like unlimited analyses, growth projections, and next-buy recommendations will be locked until you upgrade.",
  },
  {
    question: "Can I upgrade or cancel anytime?",
    answer: "Yes. You can upgrade to Pro at any point during or after your trial. There's nothing to cancel since no payment info is collected for the trial.",
  },
  {
    question: "What if I already have an account?",
    answer: "Log in and you'll be able to activate the trial if you haven't used one before. If you're already Pro, you're all set.",
  },
];

export default function PodcastLanding() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [trialActivated, setTrialActivated] = useState(false);
  const [trialMessage, setTrialMessage] = useState("");

  const isPro = hasProAccess(user);

  const activateTrialMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trial/activate", { source: "podcast" });
      return res.json();
    },
    onSuccess: (data) => {
      setTrialActivated(true);
      setTrialMessage(data.message);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Trial Activated",
        description: data.message,
      });
    },
    onError: (error: any) => {
      const msg = error?.message || "Could not activate trial.";
      toast({
        title: "Trial Unavailable",
        description: msg,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("activate") === "true" && isAuthenticated && !authLoading) {
      if (!isPro && !user?.trialEnd) {
        activateTrialMutation.mutate();
        window.history.replaceState({}, "", "/podcast");
      } else if (isPro) {
        setTrialActivated(true);
        if (user?.trialEnd && new Date(user.trialEnd) > new Date()) {
          setTrialMessage("Your Pro trial is already active.");
        } else {
          setTrialMessage("You already have Pro access.");
        }
      } else if (user?.trialEnd) {
        setTrialMessage("You've already used your free trial.");
      }
    }
  }, [isAuthenticated, authLoading, isPro, user?.trialEnd]);

  const handleCTA = () => {
    if (!isAuthenticated) {
      window.location.href = `/api/login?returnTo=/podcast?activate=true`;
    } else if (!isPro && !user?.trialEnd) {
      activateTrialMutation.mutate();
    } else if (isPro) {
      setLocation("/dashboard");
    } else {
      setLocation("/upgrade");
    }
  };

  const alreadyUsedTrial = !!user?.trialEnd && !isPro;

  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-accent/12" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge variant="secondary" className="mb-6 gap-1.5" data-testid="badge-podcast-offer">
            <Sparkles className="h-3.5 w-3.5" />
            Podcast Listener Exclusive
          </Badge>

          <h1
            className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4"
            data-testid="text-podcast-title"
          >
            7-Day Pro Access, Free
          </h1>
          <p
            className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            data-testid="text-podcast-subtitle"
          >
            Unlock Hidden Gems, portfolio insights, and market tools free for 7 days. No credit card required.
          </p>

          {trialActivated || (isAuthenticated && isPro) ? (
            <Card className="max-w-md mx-auto" data-testid="card-trial-success">
              <CardContent className="pt-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <p className="font-semibold mb-1" data-testid="text-trial-success-message">
                  {trialMessage || "You have Pro access."}
                </p>
                <Link href="/dashboard">
                  <Button className="mt-4 gap-2" data-testid="button-go-dashboard">
                    Go to Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Button
                size="lg"
                className="gap-2 text-base"
                onClick={handleCTA}
                disabled={activateTrialMutation.isPending}
                data-testid="button-start-trial"
              >
                {activateTrialMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Crown className="h-5 w-5" />
                )}
                {alreadyUsedTrial ? "Upgrade to Pro" : "Start Free 7-Day Pro Trial"}
              </Button>
              {alreadyUsedTrial && (
                <p className="text-sm text-muted-foreground" data-testid="text-trial-used">
                  You've already used your free trial.{" "}
                  <Link href="/upgrade" className="underline text-primary">
                    View Pro plans
                  </Link>
                </p>
              )}
              {!isAuthenticated && (
                <a href="/api/login" className="text-sm text-muted-foreground hover:underline" data-testid="link-login">
                  Already have an account? Log in
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 border-t">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-10" data-testid="text-benefits-heading">
            What You Get With Pro
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b, i) => (
              <Card key={i} className="hover-elevate" data-testid={`card-benefit-${i}`}>
                <CardContent className="pt-6">
                  <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                    <b.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-8" data-testid="text-faq-heading">
            Frequently Asked Questions
          </h2>
          <Card>
            <CardContent className="pt-4">
              {faqs.map((faq, i) => (
                <FAQItem key={i} question={faq.question} answer={faq.answer} />
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-12 border-t">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-muted-foreground mb-4">Ready to level up your collection strategy?</p>
          <Button
            size="lg"
            className="gap-2"
            onClick={handleCTA}
            disabled={activateTrialMutation.isPending}
            data-testid="button-start-trial-bottom"
          >
            {activateTrialMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Crown className="h-5 w-5" />
            )}
            {alreadyUsedTrial ? "Upgrade to Pro" : "Start Free 7-Day Pro Trial"}
          </Button>
        </div>
      </section>
    </div>
  );
}
