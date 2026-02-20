import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Crown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TrialBanner() {
  const { user } = useAuth();

  if (!user?.trialEnd) return null;

  const trialEnd = new Date(user.trialEnd);
  const now = new Date();

  if (trialEnd <= now) return null;
  if (user.subscriptionStatus === "PRO") return null;

  const msRemaining = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

  const endDateStr = trialEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="flex items-center justify-center gap-3 flex-wrap px-4 py-2 bg-primary/10 border-b text-sm"
      data-testid="banner-trial"
    >
      <div className="flex items-center gap-1.5" data-testid="text-trial-status">
        <Crown className="h-3.5 w-3.5 text-primary" />
        <span>
          <span className="font-medium">Pro Trial</span>
          {" \u2014 "}
          {daysRemaining === 1 ? "Last day" : `${daysRemaining} days left`}
          {" (ends "}
          {endDateStr}
          {")"}
        </span>
      </div>
      <Link href="/upgrade">
        <Button variant="outline" size="sm" className="gap-1" data-testid="button-trial-upgrade">
          Upgrade
          <ArrowRight className="h-3 w-3" />
        </Button>
      </Link>
    </div>
  );
}
