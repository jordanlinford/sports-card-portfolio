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
  Edit
} from "lucide-react";
import type { DisplayCaseWithCards, Card, User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CardDetailModal } from "@/components/card-detail-modal";
import { SocialFeatures } from "@/components/social-features";

function ValueChangeIndicator({ card }: { card: Card }) {
  if (!card.estimatedValue || !card.previousValue || card.previousValue <= 0) return null;
  
  const change = card.estimatedValue - card.previousValue;
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
  "dark-wood": {
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
  "midnight": {
    bg: "bg-gradient-to-b from-slate-900 to-slate-950",
    frame: "bg-slate-800 border-slate-900",
    glass: "bg-white/5",
    mat: "bg-slate-800/50",
    text: "text-slate-100",
    textMuted: "text-slate-300/80",
  },
  "gallery": {
    bg: "bg-gradient-to-b from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900",
    frame: "bg-neutral-300 dark:bg-neutral-700 border-neutral-400 dark:border-neutral-800",
    glass: "bg-white/20 dark:bg-white/5",
    mat: "bg-white dark:bg-neutral-800",
    text: "text-neutral-900 dark:text-neutral-100",
    textMuted: "text-neutral-500 dark:text-neutral-400",
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
              src={card.imagePath}
              alt={card.title}
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent pointer-events-none" />
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
          {card.estimatedValue && !compact && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-xs text-primary font-semibold">
                ${card.estimatedValue.toFixed(2)}
              </span>
              <ValueChangeIndicator card={card} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function CaseView() {
  const { id } = useParams<{ id: string }>();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const { toast } = useToast();

  const { data: displayCase, isLoading, error } = useQuery<DisplayCaseWithCards>({
    queryKey: [`/api/display-cases/${id}/public`],
  });

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const isOwner = user?.id === displayCase?.userId;

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
  const totalValue = displayCase.cards?.reduce((sum, card) => sum + (card.estimatedValue || 0), 0) || 0;

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
                    {displayCase.cards && displayCase.cards.length > 0 && (
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
                  </div>
                )}
              </div>
              {displayCase.description && (
                <p className="text-muted-foreground text-lg max-w-2xl" data-testid="text-case-description">
                  {displayCase.description}
                </p>
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
            </div>
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
      />
    </div>
  );
}
