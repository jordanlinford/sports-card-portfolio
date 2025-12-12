import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, ImageIcon, ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import type { Card as CardType } from "@shared/schema";
import { CardDetailModal } from "@/components/card-detail-modal";
import { OutlookBadge } from "@/components/outlook-badge";

type SearchResult = CardType & { displayCaseName: string; displayCaseId: number };

function SearchResultSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="aspect-square">
          <Skeleton className="w-full h-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export default function SearchPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({ set: "", year: "", grade: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SearchResult | null>(null);
  const [activeQuery, setActiveQuery] = useState("");

  const { data: user } = useQuery<{ subscriptionStatus: string }>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });

  const isPro = user?.subscriptionStatus === "PRO";

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (activeQuery) params.set("q", activeQuery);
    if (filters.set) params.set("set", filters.set);
    if (filters.year) params.set("year", filters.year);
    if (filters.grade) params.set("grade", filters.grade);
    return params.toString();
  };

  const { data: results, isLoading, isFetching } = useQuery<SearchResult[]>({
    queryKey: [`/api/cards/search?${buildQueryString()}`],
    enabled: isAuthenticated && (activeQuery.length > 0 || !!filters.set || !!filters.year || !!filters.grade),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchQuery);
  };

  if (!isAuthenticated && !authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to search your collection</h2>
        <a href="/api/login">
          <Button>Sign In</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold mb-4">Search Your Collection</h1>

        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by title or set..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Button type="submit" disabled={isFetching} data-testid="button-search">
              {isFetching ? "Searching..." : "Search"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {showFilters && (
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Set</label>
                    <Input
                      placeholder="Filter by set..."
                      value={filters.set}
                      onChange={(e) => setFilters({ ...filters, set: e.target.value })}
                      data-testid="input-filter-set"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Year</label>
                    <Input
                      type="number"
                      placeholder="Filter by year..."
                      value={filters.year}
                      onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                      data-testid="input-filter-year"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Grade</label>
                    <Input
                      placeholder="Filter by grade..."
                      value={filters.grade}
                      onChange={(e) => setFilters({ ...filters, grade: e.target.value })}
                      data-testid="input-filter-grade"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilters({ set: "", year: "", grade: "" });
                      setActiveQuery(searchQuery);
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear Filters
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setActiveQuery(searchQuery)}
                    data-testid="button-apply-filters"
                  >
                    Apply Filters
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </form>
      </div>

      {isLoading ? (
        <SearchResultSkeleton />
      ) : !activeQuery && !filters.set && !filters.year && !filters.grade ? (
        <div className="text-center py-16 px-4">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Search your collection</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Enter a search term above to find cards across all your display cases.
          </p>
        </div>
      ) : results && results.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No cards found</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Try a different search term or adjust your filters.
          </p>
        </div>
      ) : results ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {results.length} {results.length === 1 ? "card" : "cards"} found
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {results.map((card) => (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className="group relative bg-card rounded-lg overflow-hidden border hover-elevate text-left cursor-pointer w-full"
                data-testid={`card-search-result-${card.id}`}
              >
                <div className="aspect-square relative">
                  <img
                    src={card.imagePath}
                    alt={card.title}
                    className="w-full h-full object-cover"
                  />
                  {card.outlookAction && (
                    <div className="absolute top-1 left-1">
                      <OutlookBadge action={card.outlookAction} size="sm" />
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    <p className="font-medium text-sm truncate">{card.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/80">
                      {card.year && <span>{card.year}</span>}
                      {card.grade && (
                        <Badge variant="secondary" className="text-xs">
                          {card.grade}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-white/70">
                      <span className="truncate">{card.displayCaseName}</span>
                      <Link
                        href={`/cases/${card.displayCaseId}/edit`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <CardDetailModal
        card={selectedCard}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        displayCaseId={selectedCard?.displayCaseId || 0}
        canEdit={true}
        isPro={isPro}
      />
    </div>
  );
}
