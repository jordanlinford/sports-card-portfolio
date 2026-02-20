import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LayoutGrid, 
  ArrowLeft,
  Calendar,
  ImageIcon,
  Lock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  Edit,
  Share2,
  Link as LinkIcon,
  Download,
  Instagram,
  Smartphone,
  Trophy,
  Wallet,
  Zap,
  ShoppingCart,
  Sparkles,
  X,
  Target,
  AlertCircle,
  Check
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card as CardUI, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasProAccess } from "@shared/schema";
import type { DisplayCaseWithCards, Card, User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CardDetailModal } from "@/components/card-detail-modal";
import { SocialFeatures } from "@/components/social-features";
import { PrestigeDisplay } from "@/components/prestige-display";
import { FollowButton } from "@/components/follow-button";
import { FollowStats } from "@/components/follow-stats";
import { MessageButton } from "@/components/message-button";
import { OutlookBadge } from "@/components/outlook-badge";
import { ProFeatureGate, ProBadge } from "@/components/pro-feature-gate";
import { Crown } from "lucide-react";

function PortfolioInsightLine({ cards }: { cards: Card[] }) {
  // Analyze the portfolio characteristics
  const positions: Record<string, number> = {};
  const sports: Record<string, number> = {};
  const legacyTiers: Record<string, number> = {};
  let rookieCount = 0;
  let autoCount = 0;
  let numberedCount = 0;
  
  cards.forEach(card => {
    if (card.position) positions[card.position] = (positions[card.position] || 0) + 1;
    if (card.sport) sports[card.sport] = (sports[card.sport] || 0) + 1;
    if (card.legacyTier) legacyTiers[card.legacyTier] = (legacyTiers[card.legacyTier] || 0) + 1;
    if (card.isRookie) rookieCount++;
    if (card.hasAuto) autoCount++;
    if (card.isNumbered) numberedCount++;
  });
  
  const totalCards = cards.length;
  const topPosition = Object.entries(positions).sort((a, b) => b[1] - a[1])[0];
  const topSport = Object.entries(sports).sort((a, b) => b[1] - a[1])[0];
  
  // Determine stability profile
  const retiredLegendCount = (legacyTiers["HOF"] || 0) + (legacyTiers["RETIRED"] || 0) + (legacyTiers["LEGEND_DECEASED"] || 0);
  const activeStarCount = (legacyTiers["SUPERSTAR"] || 0) + (legacyTiers["STAR"] || 0);
  const speculativeCount = (legacyTiers["PROSPECT"] || 0) + (legacyTiers["RISING_STAR"] || 0);
  
  // Build insight message
  let insight = "";
  
  if (retiredLegendCount >= totalCards * 0.6) {
    insight = "Legacy-focused collection with high stability and low volatility.";
  } else if (speculativeCount >= totalCards * 0.5) {
    insight = "Growth-oriented portfolio with higher upside potential and volatility.";
  } else if (rookieCount >= totalCards * 0.7) {
    insight = "Rookie-heavy collection - high upside but timing-sensitive.";
  } else if (topPosition && (topPosition[1] / totalCards) >= 0.8) {
    insight = `Concentrated in ${topPosition[0]}s - strong conviction, less diversification.`;
  } else if (activeStarCount >= totalCards * 0.5) {
    insight = "Balanced mix of proven stars - stable with moderate growth potential.";
  } else if (autoCount >= totalCards * 0.6 || numberedCount >= totalCards * 0.6) {
    insight = "Premium card focus with strong collector appeal and tighter supply.";
  } else {
    const sportCount = Object.keys(sports).length;
    if (sportCount >= 3) {
      insight = "Multi-sport diversification reduces single-market risk.";
    } else if (topSport) {
      insight = `${topSport[0].charAt(0).toUpperCase() + topSport[0].slice(1)}-focused collection with varied career stages.`;
    } else {
      insight = "Diversified collection across multiple player profiles.";
    }
  }
  
  return (
    <div className="mt-2 p-2 bg-muted/50 rounded-md" data-testid="portfolio-insight">
      <p className="text-sm text-muted-foreground italic">
        <Zap className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
        {insight}
      </p>
    </div>
  );
}

function ValueChangeIndicator({ card }: { card: Card }) {
  // Use manualValue if set, otherwise estimatedValue
  const currentValue = card.manualValue ?? card.estimatedValue;
  if (!currentValue || !card.previousValue || card.previousValue <= 0) return null;
  
  const change = currentValue - card.previousValue;
  if (Math.abs(change) < 0.01) return null;
  
  const percentChange = ((change / card.previousValue) * 100).toFixed(1);
  const isPositive = change > 0;
  
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPositive ? '+' : ''}{percentChange}%
    </span>
  );
}

const THEME_STYLES: Record<string, { bg: string; frame: string; glass: string; mat: string; text: string; textMuted: string }> = {
  "classic": {
    bg: "bg-gradient-to-b from-amber-100 to-amber-200 dark:from-amber-950 dark:to-amber-900",
    frame: "bg-amber-800 dark:bg-amber-900 border-amber-900 dark:border-amber-950",
    glass: "bg-white/10 dark:bg-white/5",
    mat: "bg-amber-50 dark:bg-amber-950/50",
    text: "text-stone-900 dark:text-amber-100",
    textMuted: "text-stone-600 dark:text-amber-300/70",
  },
  "midnight": {
    bg: "bg-gradient-to-b from-slate-900 to-slate-950",
    frame: "bg-slate-800 border-slate-900",
    glass: "bg-white/5",
    mat: "bg-slate-800/50",
    text: "text-slate-100",
    textMuted: "text-slate-300/80",
  },
  "wood": {
    bg: "bg-gradient-to-b from-amber-950 to-stone-950",
    frame: "bg-stone-900 border-stone-950",
    glass: "bg-white/5",
    mat: "bg-stone-900/80",
    text: "text-amber-100",
    textMuted: "text-amber-200/70",
  },
  "velvet": {
    bg: "bg-gradient-to-b from-red-950 to-rose-950",
    frame: "bg-stone-800 border-stone-900",
    glass: "bg-white/5",
    mat: "bg-red-950/50",
    text: "text-rose-100",
    textMuted: "text-rose-200/70",
  },
  "ocean": {
    bg: "bg-gradient-to-b from-blue-950 to-cyan-950",
    frame: "bg-blue-900 border-blue-950",
    glass: "bg-white/5",
    mat: "bg-blue-900/50",
    text: "text-cyan-100",
    textMuted: "text-cyan-200/70",
  },
  "emerald": {
    bg: "bg-gradient-to-b from-emerald-950 to-green-950",
    frame: "bg-emerald-900 border-emerald-950",
    glass: "bg-white/5",
    mat: "bg-emerald-900/50",
    text: "text-emerald-100",
    textMuted: "text-emerald-200/70",
  },
  "gold": {
    bg: "bg-gradient-to-b from-yellow-950 to-amber-950",
    frame: "bg-yellow-900 border-yellow-950",
    glass: "bg-white/5",
    mat: "bg-yellow-900/50",
    text: "text-yellow-100",
    textMuted: "text-yellow-200/70",
  },
  "purple": {
    bg: "bg-gradient-to-b from-purple-950 to-violet-950",
    frame: "bg-purple-900 border-purple-950",
    glass: "bg-white/5",
    mat: "bg-purple-900/50",
    text: "text-purple-100",
    textMuted: "text-purple-200/70",
  },
};

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="aspect-square">
          <Skeleton className="w-full h-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

interface CardItemProps {
  card: Card;
  theme: { bg: string; frame: string; glass: string; mat: string; text: string; textMuted: string };
  onClick: () => void;
  featured?: boolean;
  compact?: boolean;
}

function CardItem({ card, theme, onClick, featured = false, compact = false }: CardItemProps) {
  return (
    <button
      onClick={onClick}
      className="group relative text-left cursor-pointer w-full transition-transform duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      data-testid={`card-public-${card.id}`}
    >
      <div className={`${theme.mat} rounded-lg ${compact ? 'p-1.5' : 'p-2'} shadow-lg`}>
        <div className="relative rounded overflow-hidden shadow-inner bg-black/20">
          <div style={{ paddingBottom: '140%' }} className="relative">
            <img
              src={card.imagePath || undefined}
              alt={card.title}
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent pointer-events-none" />
          {card.outlookAction && !compact && (
            <div className="absolute top-1 left-1 flex items-center gap-1">
              <OutlookBadge action={card.outlookAction} size="sm" />
              {card.outlookBigMover && (
                <div 
                  className="bg-purple-500/90 p-1 rounded"
                  title="Big Mover Potential"
                  data-testid={`badge-big-mover-${card.id}`}
                >
                  <Zap className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className={`mt-2 px-1 ${compact ? 'hidden sm:block' : ''}`}>
          <p className={`font-medium ${compact ? 'text-xs' : 'text-sm'} truncate ${theme.text}`}>{card.title}</p>
          {!compact && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {card.year && (
                <span className={`text-xs ${theme.textMuted}`}>{card.year}</span>
              )}
              {card.variation && (
                <Badge variant="outline" className="text-xs">
                  {card.variation}
                </Badge>
              )}
              {card.grade && (
                <Badge variant="secondary" className="text-xs">
                  {card.grade}
                </Badge>
              )}
            </div>
          )}
          {(card.manualValue ?? card.estimatedValue) && !compact && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-xs text-primary font-semibold">
                ${(card.manualValue ?? card.estimatedValue)?.toFixed(2)}
              </span>
              <ValueChangeIndicator card={card} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

interface PortfolioNextBuyRecommendation {
  playerName: string;
  cardSuggestion: string;
  sport: string;
  position?: string;
  estimatedPrice: number;
  whyItFits: string;
  investmentRationale: string;
}

interface PortfolioThemeAnalysis {
  identifiedTheme: string;
  themeDescription: string;
  detectedPatterns: {
    teams: string[];
    sports: string[];
    positions: string[];
    eras: string[];
    players: string[];
    cardTypes: string[];
  };
  recommendations: PortfolioNextBuyRecommendation[];
  displayCaseId: number;
  generatedAt: string;
}

export default function CaseView() {
  const { id } = useParams<{ id: string }>();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showProUpgradeModal, setShowProUpgradeModal] = useState(false);
  const [showNextBuysModal, setShowNextBuysModal] = useState(false);
  const [nextBuysAnalysis, setNextBuysAnalysis] = useState<PortfolioThemeAnalysis | null>(null);
  const { toast } = useToast();

  const { data: displayCase, isLoading, error } = useQuery<DisplayCaseWithCards>({
    queryKey: [`/api/display-cases/${id}/public`],
  });

  const { data: user } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
  });

  const isOwner = user?.id === displayCase?.userId;
  const isPro = hasProAccess(user);

  const refreshAllPricesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/display-cases/${id}/refresh-prices`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}/public`] });
      
      const updatedCount = data.results?.filter((r: any) => r.oldValue !== r.newValue).length || 0;
      toast({
        title: "Values Refreshed",
        description: `Processed ${data.cardsProcessed} cards. ${updatedCount} values updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh card values",
        variant: "destructive",
      });
    },
  });

  const portfolioNextBuysMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/display-cases/${id}/next-buys`);
    },
    onSuccess: (data: PortfolioThemeAnalysis) => {
      setNextBuysAnalysis(data);
      setShowNextBuysModal(true);
    },
    onError: (error: any) => {
      if (error.message?.includes("Pro feature") || error.proRequired) {
        setShowProUpgradeModal(true);
      } else {
        toast({
          title: "Couldn't Generate Recommendations",
          description: error.message || "Failed to generate recommendations for this portfolio",
          variant: "destructive",
        });
      }
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <CardGridSkeleton />
      </div>
    );
  }

  if (error || !displayCase) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Display Case Not Found</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          This display case doesn't exist, is private, or has been removed.
        </p>
        <Link href="/">
          <Button className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go Home
          </Button>
        </Link>
      </div>
    );
  }

  const cardCount = displayCase.cards?.length || 0;
  const totalValue = displayCase.cards?.reduce((sum, card) => sum + (card.manualValue ?? card.estimatedValue ?? 0), 0) || 0;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-case-title">
                  {displayCase.name}
                </h1>
                {isOwner && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/cases/${id}/edit`}>
                      <Button variant="outline" size="sm" className="gap-2" data-testid="button-edit-case">
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    </Link>
                    {hasProAccess(user) && displayCase.cards && displayCase.cards.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => refreshAllPricesMutation.mutate()}
                        disabled={refreshAllPricesMutation.isPending}
                        data-testid="button-refresh-all-prices"
                      >
                        {refreshAllPricesMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {refreshAllPricesMutation.isPending ? "Refreshing..." : "Refresh Values"}
                      </Button>
                    )}
                    {displayCase.cards && displayCase.cards.length > 0 && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-2"
                        onClick={() => portfolioNextBuysMutation.mutate()}
                        disabled={portfolioNextBuysMutation.isPending}
                        data-testid="button-portfolio-next-buys"
                      >
                        {portfolioNextBuysMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShoppingCart className="h-4 w-4" />
                        )}
                        {portfolioNextBuysMutation.isPending ? "Analyzing..." : "Next Buys"}
                        {!isPro && <Crown className="h-3 w-3 text-yellow-500" />}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {displayCase.description && (
                <p className="text-muted-foreground text-lg max-w-2xl" data-testid="text-case-description">
                  {displayCase.description}
                </p>
              )}
              
              {displayCase.cards && displayCase.cards.length >= 3 && (
                <PortfolioInsightLine cards={displayCase.cards} />
              )}
              
              {(displayCase.showCardCount || displayCase.showTotalValue) && (
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  {displayCase.showCardCount && (
                    <Badge variant="secondary" className="text-sm gap-1.5 px-3 py-1">
                      <ImageIcon className="h-4 w-4" />
                      {cardCount} {cardCount === 1 ? "Card" : "Cards"}
                    </Badge>
                  )}
                  {displayCase.showTotalValue && totalValue > 0 && (
                    <Badge variant="secondary" className="text-sm gap-1.5 px-3 py-1">
                      <DollarSign className="h-4 w-4" />
                      ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Est. Value
                    </Badge>
                  )}
                </div>
              )}
              <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ImageIcon className="h-4 w-4" />
                  {cardCount} {cardCount === 1 ? "card" : "cards"}
                </span>
                {displayCase.createdAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Created {format(new Date(displayCase.createdAt), "MMMM d, yyyy")}
                  </span>
                )}
              </div>
              {displayCase.userId && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <PrestigeDisplay userId={displayCase.userId} compact />
                    {user && !isOwner && (
                      <>
                        <FollowButton userId={displayCase.userId} compact />
                        <MessageButton userId={displayCase.userId} compact />
                      </>
                    )}
                  </div>
                  <FollowStats userId={displayCase.userId} compact />
                </div>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-share">
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem 
                  onClick={() => {
                    const url = `${window.location.origin}/case/${id}`;
                    navigator.clipboard.writeText(url);
                    toast({
                      title: "Link Copied",
                      description: "Case link copied to clipboard!",
                    });
                  }}
                  data-testid="button-copy-link"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Copy Link
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Download Images</DropdownMenuLabel>
                
                <DropdownMenuItem 
                  onClick={() => {
                    const imageUrl = `/api/share-image/case/${id}?format=teaser`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-teaser.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "TikTok/Instagram teaser image downloading.",
                    });
                  }}
                  data-testid="button-download-teaser"
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Teaser Image (4:5)
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => {
                    const imageUrl = `/api/share-image/case/${id}?format=story`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-story.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "Instagram Story image downloading.",
                    });
                  }}
                  data-testid="button-download-story"
                >
                  <Instagram className="h-4 w-4 mr-2" />
                  Story Image (9:16)
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => {
                    const imageUrl = `/api/share-image/case/${id}`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-share.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "Social share image downloading.",
                    });
                  }}
                  data-testid="button-download-social"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Social Preview (16:9)
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1">
                  Brag Images
                  {!isPro && <ProBadge />}
                </DropdownMenuLabel>
                
                <DropdownMenuItem 
                  onClick={() => {
                    if (!isPro) {
                      setShowProUpgradeModal(true);
                      return;
                    }
                    const imageUrl = `/api/share-image/case/${id}?format=brag-card`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-top-card.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "Top card brag image downloading.",
                    });
                  }}
                  className={!isPro ? "opacity-60" : ""}
                  data-testid="button-download-brag-card"
                >
                  <Trophy className="h-4 w-4 mr-2" />
                  Top Card Flex
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => {
                    if (!isPro) {
                      setShowProUpgradeModal(true);
                      return;
                    }
                    const imageUrl = `/api/share-image/case/${id}?format=brag-portfolio`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-portfolio.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "Portfolio value image downloading.",
                    });
                  }}
                  className={!isPro ? "opacity-60" : ""}
                  data-testid="button-download-brag-portfolio"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Portfolio Value
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {cardCount === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No cards yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              This display case is empty. Check back later for some amazing cards!
            </p>
          </div>
        ) : (
          (() => {
            const theme = THEME_STYLES[displayCase.theme || "classic"] || THEME_STYLES.classic;
            return (
              <div className={`relative rounded-lg ${theme.frame} border-4 p-1 shadow-2xl`}>
                <div className={`absolute inset-0 rounded-md ${theme.glass} pointer-events-none`} />
                <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-stone-400/50" />
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-stone-400/50" />
                <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-stone-400/50" />
                <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-stone-400/50" />
                
                <div className={`${theme.bg} rounded-md p-6 sm:p-8`}>
                  {/* Grid Layout (default) */}
                  {(!displayCase.layout || displayCase.layout === "grid") && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
                      {displayCase.cards?.map((card) => (
                        <CardItem key={card.id} card={card} theme={theme} onClick={() => setSelectedCard(card)} />
                      ))}
                    </div>
                  )}
                  
                  {/* Row Layout - horizontal scrollable row */}
                  {displayCase.layout === "row" && (
                    <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 scrollbar-thin">
                      {displayCase.cards?.map((card) => (
                        <div key={card.id} className="flex-shrink-0 w-40 sm:w-48 md:w-56">
                          <CardItem card={card} theme={theme} onClick={() => setSelectedCard(card)} />
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Showcase Layout - featured first card, grid for rest */}
                  {displayCase.layout === "showcase" && displayCase.cards && displayCase.cards.length > 0 && (
                    <div className="space-y-6">
                      {/* Featured first card - larger */}
                      <div className="flex justify-center">
                        <div className="w-full max-w-sm">
                          <CardItem 
                            card={displayCase.cards[0]} 
                            theme={theme} 
                            onClick={() => setSelectedCard(displayCase.cards![0])} 
                            featured
                          />
                        </div>
                      </div>
                      {/* Rest of cards in a grid */}
                      {displayCase.cards.length > 1 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
                          {displayCase.cards.slice(1).map((card) => (
                            <CardItem key={card.id} card={card} theme={theme} onClick={() => setSelectedCard(card)} compact />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SocialFeatures displayCaseId={parseInt(id || "0")} user={user || null} caseName={displayCase.name} />
      </div>

      <div className="border-t mt-16 py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-xl font-semibold mb-2">
            Want to create your own display case?
          </h3>
          <p className="text-muted-foreground mb-6">
            Showcase your collection in a beautiful, shareable display case.
          </p>
          <a href="/api/login">
            <Button className="gap-2" data-testid="button-create-own">
              <LayoutGrid className="h-4 w-4" />
              Create Your Free Display Case
            </Button>
          </a>
        </div>
      </div>

      <CardDetailModal
        card={selectedCard}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        displayCaseId={parseInt(id || "0")}
        canEdit={isOwner}
        isPro={hasProAccess(user)}
        isAuthenticated={!!user}
        ownerUserId={displayCase?.userId}
      />

      <ProUpgradeDialog
        open={showProUpgradeModal}
        onOpenChange={setShowProUpgradeModal}
        featureName="Portfolio Next Buys"
        featureDescription="Upgrade to Pro to get AI-powered recommendations tailored to each of your portfolios."
      />

      {/* Portfolio Next Buys Modal */}
      <Dialog open={showNextBuysModal} onOpenChange={setShowNextBuysModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Next Buys for This Portfolio</DialogTitle>
                {nextBuysAnalysis && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Theme: {nextBuysAnalysis.identifiedTheme}
                  </p>
                )}
              </div>
            </div>
            {nextBuysAnalysis && (
              <DialogDescription className="text-sm">
                {nextBuysAnalysis.themeDescription}
              </DialogDescription>
            )}
          </DialogHeader>

          {nextBuysAnalysis && nextBuysAnalysis.recommendations.length > 0 ? (
            <div className="space-y-3 py-2">
              {nextBuysAnalysis.recommendations.map((rec, index) => (
                <CardUI key={index} className="hover-elevate">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          {rec.playerName}
                          <Badge variant="secondary" className="text-xs">
                            {rec.sport}
                          </Badge>
                          {rec.position && (
                            <Badge variant="outline" className="text-xs">
                              {rec.position}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {rec.cardSuggestion}
                        </CardDescription>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-lg font-semibold text-primary">
                          ~${typeof rec.estimatedPrice === 'number' ? rec.estimatedPrice.toLocaleString() : '???'}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">{rec.whyItFits}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">{rec.investmentRationale}</p>
                    </div>
                  </CardContent>
                </CardUI>
              ))}
            </div>
          ) : nextBuysAnalysis ? (
            <div className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No recommendations available for this portfolio yet.
              </p>
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setShowNextBuysModal(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PRO_BENEFITS = [
  "Unlimited display cases",
  "Premium themes",
  "AI-powered price lookups",
  "Card outlook analysis",
  "Premium sharing formats",
];

function ProUpgradeDialog({
  open,
  onOpenChange,
  featureName,
  featureDescription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  featureDescription?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
  );
}
