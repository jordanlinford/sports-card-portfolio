import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, 
  LayoutGrid, 
  Eye, 
  Pencil, 
  Calendar,
  ImageIcon,
  Crown,
  FolderOpen,
  Sparkles,
  TrendingUp,
  Tag,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasProAccess } from "@shared/schema";
import type { DisplayCaseWithCards } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ProFeatureGate } from "@/components/pro-feature-gate";
import { CardOfDay } from "@/components/card-of-day";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full rounded-md" />
              <div className="flex gap-2 mt-4">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
        <FolderOpen className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">No portfolios yet</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Create your first portfolio to start tracking and showcasing your card collection.
      </p>
      {canCreate && (
        <Link href="/cases/new">
          <Button className="gap-2" data-testid="button-create-first-case">
            <Plus className="h-4 w-4" />
            Create Your First Portfolio
          </Button>
        </Link>
      )}
    </div>
  );
}

function DisplayCaseCard({ displayCase }: { displayCase: DisplayCaseWithCards }) {
  const cardCount = displayCase.cards?.length || 0;
  const previewImages = displayCase.cards?.slice(0, 4) || [];

  return (
    <Card className="group hover-elevate overflow-hidden" data-testid={`card-display-case-${displayCase.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate text-base" data-testid={`text-case-name-${displayCase.id}`}>
              {displayCase.name}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Calendar className="h-3 w-3" />
              {displayCase.createdAt
                ? format(new Date(displayCase.createdAt), "MMM d, yyyy")
                : "Unknown"}
            </CardDescription>
          </div>
          <Badge variant={displayCase.isPublic ? "secondary" : "outline"}>
            {displayCase.isPublic ? "Public" : "Private"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="aspect-[4/3] bg-muted rounded-lg overflow-hidden mb-4">
          {previewImages.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 h-full p-1">
              {previewImages.map((card, index) => (
                <div
                  key={card.id}
                  className="bg-background rounded overflow-hidden"
                >
                  {card.imagePath ? (
                    <img
                      src={card.imagePath}
                      alt={card.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; if (e.currentTarget.nextElementSibling) (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex'; }}
                    />
                  ) : null}
                  <div className="w-full h-full flex items-center justify-center bg-muted" style={{ display: card.imagePath ? 'none' : 'flex' }}>
                    <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                </div>
              ))}
              {previewImages.length < 4 &&
                Array.from({ length: 4 - previewImages.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="bg-background/50 rounded flex items-center justify-center"
                  >
                    <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-12 w-12 mb-2 opacity-30" />
              <span className="text-sm">No cards yet</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{cardCount} {cardCount === 1 ? "card" : "cards"}</span>
            <span className="flex items-center gap-1" data-testid={`text-views-${displayCase.id}`}>
              <Eye className="h-3 w-3" />
              {displayCase.viewCount || 0} {displayCase.viewCount === 1 ? "view" : "views"}
            </span>
          </div>
          <div className="flex gap-2">
            <Link href={`/cases/${displayCase.id}`}>
              <Button variant="outline" size="sm" className="gap-1" data-testid={`button-view-case-${displayCase.id}`}>
                <Eye className="h-3 w-3" />
                View
              </Button>
            </Link>
            <Link href={`/cases/${displayCase.id}/edit`}>
              <Button variant="outline" size="sm" className="gap-1" data-testid={`button-edit-case-${displayCase.id}`}>
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const onboardingChecked = useRef(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: displayCases, isLoading: casesLoading } = useQuery<DisplayCaseWithCards[]>({
    queryKey: ["/api/display-cases"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!casesLoading && displayCases && !onboardingChecked.current) {
      onboardingChecked.current = true;
      const totalCards = displayCases.reduce((sum, c) => sum + (c.cards?.length || 0), 0);
      if (displayCases.length === 0 || totalCards === 0) {
        setLocation("/onboarding");
      }
    }
  }, [displayCases, casesLoading, setLocation]);

  const { data: userTags = [] } = useQuery<string[]>({
    queryKey: ["/api/tags"],
    enabled: isAuthenticated,
  });

  const createFromTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      return await apiRequest("POST", "/api/display-cases/from-tag", {
        tag,
        name: `${tag} Collection`
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases", data.id] });
      toast({
        title: "Case Created from Tag",
        description: `Created a collection of ${data.cards?.length || 0} cards!`,
      });
      setLocation(`/cases/${data.id}/edit`);
    },
    onError: (error: any) => {
      toast({
        title: "Could not create case",
        description: error.message || "Failed to create case from tag",
        variant: "destructive",
      });
    },
  });

  const createTopCardsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/display-cases/top-cards", {
        limit: 12,
        name: "My Top Cards"
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases", data.id] });
      toast({
        title: "Top Cards Case Created",
        description: `Created a showcase of your ${data.cards?.length || 0} most valuable cards!`,
      });
      setLocation(`/cases/${data.id}/edit`);
    },
    onError: (error: any) => {
      toast({
        title: "Could not create case",
        description: error.message || "Failed to create top cards case",
        variant: "destructive",
      });
    },
  });

  const isLoading = authLoading || casesLoading;
  const caseCount = displayCases?.length || 0;
  const isPro = hasProAccess(user);
  const canCreate = isPro || caseCount < 3;
  
  // Check if user has any cards with values (use manualValue if set, otherwise estimatedValue)
  const hasValuableCards = displayCases?.some(dc => 
    dc.cards?.some(card => (card.manualValue ?? card.estimatedValue) && (card.manualValue ?? card.estimatedValue)! > 0)
  ) ?? false;

  // Untagged cards banner: show when >10% of cards are missing playerName
  const untaggedStats = (() => {
    if (!displayCases) return { pct: 0, count: 0, total: 0 };
    let total = 0;
    let untagged = 0;
    for (const dc of displayCases) {
      for (const card of dc.cards || []) {
        total++;
        if (!card.playerName || card.playerName.trim().length === 0) untagged++;
      }
    }
    return { pct: total > 0 ? (untagged / total) * 100 : 0, count: untagged, total };
  })();
  const userId = (user as any)?.id ?? "anon";
  const dismissKey = `untagged-banner-dismissed:${userId}`;
  const [untaggedBannerDismissed, setUntaggedBannerDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setUntaggedBannerDismissed(window.localStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);
  const showUntaggedBanner = untaggedStats.pct > 10 && !untaggedBannerDismissed;
  const dismissUntaggedBanner = () => {
    window.localStorage.setItem(dismissKey, "1");
    setUntaggedBannerDismissed(true);
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {showUntaggedBanner && (
        <div
          className="mb-6 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-start gap-3"
          data-testid="banner-untagged-dashboard"
        >
          <Tag className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {untaggedStats.count} of your {untaggedStats.total} cards ({Math.round(untaggedStats.pct)}%) are missing player info.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Tag them so they show up in your portfolio exposure breakdown and get accurate market signals.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Link href="/search?filter=untagged">
                <Button size="sm" data-testid="button-view-untagged">
                  View untagged cards
                </Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                onClick={dismissUntaggedBanner}
                data-testid="button-dismiss-untagged-banner"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-dashboard-title">
            My Portfolios
          </h1>
          <p className="text-muted-foreground mt-1">
            {isPro ? (
              <span className="flex items-center gap-1">
                <Crown className="h-4 w-4 text-primary" />
                Pro Account - Unlimited Portfolios
              </span>
            ) : (
              `${caseCount} of 3 free portfolios used`
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {userTags.length > 0 && (
            <ProFeatureGate
              isPro={canCreate}
              featureName="Unlimited Portfolios"
              featureDescription="Free accounts are limited to 3 portfolios. Upgrade to Pro for unlimited portfolios and premium features."
              showBadge={false}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="gap-2"
                    disabled={createFromTagMutation.isPending}
                    data-testid="button-create-from-tag"
                  >
                    <Tag className="h-4 w-4" />
                    {createFromTagMutation.isPending ? "Creating..." : "Create from Tag"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Select a tag</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userTags.map((tag) => (
                    <DropdownMenuItem
                      key={tag}
                      onClick={() => createFromTagMutation.mutate(tag)}
                      data-testid={`dropdown-item-tag-${tag}`}
                    >
                      {tag}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </ProFeatureGate>
          )}
          {hasValuableCards && (
            <ProFeatureGate
              isPro={canCreate}
              featureName="Unlimited Portfolios"
              featureDescription="Free accounts are limited to 3 portfolios. Upgrade to Pro for unlimited portfolios and premium features."
              showBadge={false}
            >
              <Button 
                variant="outline" 
                className="gap-2" 
                onClick={() => createTopCardsMutation.mutate()}
                disabled={createTopCardsMutation.isPending}
                data-testid="button-create-top-cards"
              >
                <Sparkles className="h-4 w-4" />
                {createTopCardsMutation.isPending ? "Creating..." : "Create Top Cards Portfolio"}
              </Button>
            </ProFeatureGate>
          )}
          <ProFeatureGate
            isPro={canCreate}
            featureName="Unlimited Display Cases"
            featureDescription="Free accounts are limited to 3 display cases. Upgrade to Pro for unlimited cases and premium features."
            showBadge={!canCreate}
          >
            <Link href="/cases/new">
              <Button className="gap-2" data-testid="button-create-case">
                <Plus className="h-4 w-4" />
                New Portfolio
              </Button>
            </Link>
          </ProFeatureGate>
        </div>
      </div>

      {(() => {
        const allCards = displayCases?.flatMap(dc => dc.cards || []) ?? [];
        const totalCards = allCards.length;
        if (totalCards === 0) return null;
        const analyzedCards = allCards.filter(c => ((c.manualValue ?? c.estimatedValue) ?? 0) > 0);
        const analyzedCount = analyzedCards.length;
        const pct = Math.round((analyzedCount / totalCards) * 100);
        const fullyHealthy = analyzedCount === totalCards;
        const firstUnanalyzedCase = displayCases?.find(dc =>
          dc.cards?.some(c => !((c.manualValue ?? c.estimatedValue) ?? 0))
        );
        return (
          <Card
            className={`mb-6 border ${fullyHealthy ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20" : "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20"}`}
            data-testid="banner-collection-health"
          >
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
              <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${fullyHealthy ? "bg-green-100 dark:bg-green-900/40" : "bg-amber-100 dark:bg-amber-900/40"}`}>
                  {fullyHealthy ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm" data-testid="text-collection-health-title">
                      Collection Health
                    </h3>
                    <span className="text-sm text-muted-foreground" data-testid="text-collection-health-stats">
                      {analyzedCount} of {totalCards} cards analyzed ({pct}%)
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5 mt-2" data-testid="progress-collection-health" />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {fullyHealthy
                      ? "Every card has a value. Your portfolio data is fully up to date."
                      : `${totalCards - analyzedCount} card${totalCards - analyzedCount === 1 ? "" : "s"} still need a value to power accurate insights.`}
                  </p>
                </div>
              </div>
              {!fullyHealthy && firstUnanalyzedCase && (
                <Link href={`/cases/${firstUnanalyzedCase.id}/edit`}>
                  <Button size="sm" variant="outline" className="gap-2 shrink-0" data-testid="button-analyze-missing">
                    Analyze missing
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <CardOfDay />

      {/* Break Value Auditor CTA */}
      <Card className="mb-8 bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5 border-primary/20">
        <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold" data-testid="text-break-auditor-cta-title">Break Value Auditor</h3>
              <p className="text-sm text-muted-foreground">
                AI-powered EV analysis before you join any box break
              </p>
            </div>
          </div>
          <Link href="/market/break-auditor">
            <Button variant="outline" className="gap-2" data-testid="button-break-auditor">
              Analyze a Break
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {!displayCases || displayCases.length === 0 ? (
        <EmptyState canCreate={canCreate} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayCases.map((displayCase) => (
            <DisplayCaseCard key={displayCase.id} displayCase={displayCase} />
          ))}
        </div>
      )}
    </div>
  );
}
