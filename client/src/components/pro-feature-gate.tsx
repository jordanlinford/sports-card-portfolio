import { useState } from "react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Sparkles, Check } from "lucide-react";

interface ProFeatureGateProps {
  isPro: boolean;
  featureName: string;
  featureDescription?: string;
  children: React.ReactNode;
  className?: string;
  showBadge?: boolean;
  onProClick?: () => void;
}

const PRO_BENEFITS = [
  "Unlimited display cases",
  "Premium themes",
  "AI-powered price lookups",
  "Card outlook analysis",
  "Premium sharing formats",
];

export function ProFeatureGate({
  isPro,
  featureName,
  featureDescription,
  children,
  className = "",
  showBadge = true,
  onProClick,
}: ProFeatureGateProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (isPro) {
      onProClick?.();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setShowUpgradeModal(true);
  };

  return (
    <>
      <div
        className={`relative ${!isPro ? "cursor-pointer" : ""} ${className}`}
        onClick={handleClick}
      >
        {children}
        {!isPro && showBadge && (
          <div className="absolute top-1 right-1 z-10">
            <Badge variant="secondary" className="bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5 gap-0.5">
              <Crown className="h-2.5 w-2.5" />
              PRO
            </Badge>
          </div>
        )}
        {!isPro && (
          <div className="absolute inset-0 bg-background/40 rounded-md pointer-events-none" />
        )}
      </div>

      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Crown className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle className="text-xl">Unlock {featureName}</DialogTitle>
            </div>
            <DialogDescription>
              {featureDescription || `Upgrade to Pro to access ${featureName.toLowerCase()} and many more premium features.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              What you get with Pro:
            </p>
            <ul className="space-y-2">
              {PRO_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowUpgradeModal(false)}>
              Maybe Later
            </Button>
            <Link href="/upgrade">
              <Button className="gap-2 w-full sm:w-auto" data-testid="button-upgrade-modal">
                <Crown className="h-4 w-4" />
                Upgrade to Pro
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <Badge variant="secondary" className={`bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5 gap-0.5 ${className}`}>
      <Crown className="h-2.5 w-2.5" />
      PRO
    </Badge>
  );
}
