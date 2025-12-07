import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LayoutGrid, 
  ArrowLeft,
  Calendar,
  ImageIcon,
  Lock
} from "lucide-react";
import type { DisplayCaseWithCards, Card } from "@shared/schema";
import { format } from "date-fns";
import { CardDetailModal } from "@/components/card-detail-modal";

const THEME_BACKGROUNDS: Record<string, string> = {
  "classic": "",
  "dark-wood": "bg-amber-950",
  "velvet": "bg-red-950",
  "midnight": "bg-slate-900",
  "gallery": "bg-neutral-100 dark:bg-neutral-800",
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

export default function CaseView() {
  const { id } = useParams<{ id: string }>();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const { data: displayCase, isLoading, error } = useQuery<DisplayCaseWithCards>({
    queryKey: [`/api/display-cases/${id}/public`],
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
              <h1 className="text-3xl md:text-4xl font-bold mb-2" data-testid="text-case-title">
                {displayCase.name}
              </h1>
              {displayCase.description && (
                <p className="text-muted-foreground text-lg max-w-2xl" data-testid="text-case-description">
                  {displayCase.description}
                </p>
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
          <div className={`p-6 rounded-lg ${THEME_BACKGROUNDS[displayCase.theme || "classic"] || ""}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {displayCase.cards?.map((card) => (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className="group relative bg-card rounded-lg overflow-hidden border hover-elevate text-left cursor-pointer w-full"
                data-testid={`card-public-${card.id}`}
              >
                <div className="aspect-square">
                  <img
                    src={card.imagePath}
                    alt={card.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    <p className="font-medium text-sm truncate">{card.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/80">
                      {card.year && <span>{card.year}</span>}
                      {card.set && <span>{card.set}</span>}
                      {card.grade && (
                        <Badge variant="secondary" className="text-xs">
                          {card.grade}
                        </Badge>
                      )}
                    </div>
                    {card.estimatedValue && (
                      <p className="mt-1 text-primary font-semibold">
                        Est. ${card.estimatedValue.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
              ))}
            </div>
          </div>
        )}
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
        canEdit={false}
      />
    </div>
  );
}
