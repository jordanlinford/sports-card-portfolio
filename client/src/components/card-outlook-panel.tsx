import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Sparkles, 
  RefreshCw, 
  Loader2,
  ChevronDown,
  ChevronUp,
  Target,
  Shield,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Card as CardType } from "@shared/schema";

interface CardOutlookPanelProps {
  card: CardType;
  isPro?: boolean;
  canEdit?: boolean;
}

interface OutlookData {
  cardId: number;
  playerName: string | null;
  sport: string | null;
  position: string | null;
  action: "BUY" | "WATCH" | "SELL";
  upsideScore: number;
  riskScore: number;
  confidenceScore: number;
  projectedOutlook?: {
    bearCaseChangePct: number;
    baseCaseChangePct: number;
    bullCaseChangePct: number;
  };
  factors?: {
    cardTypeScore: number;
    positionScore: number;
    legacyScore: number;
    liquidityScore: number;
    volatilityScore: number;
    hypeScore: number;
  };
  explanation?: {
    short: string;
    long: string;
  } | null;
  generatedAt?: string | null;
  cached: boolean;
}

function getActionColor(action: "BUY" | "WATCH" | "SELL"): string {
  switch (action) {
    case "BUY":
      return "bg-green-600 text-white";
    case "SELL":
      return "bg-red-600 text-white";
    case "WATCH":
      return "bg-amber-500 text-white";
  }
}

function getActionIcon(action: "BUY" | "WATCH" | "SELL") {
  switch (action) {
    case "BUY":
      return <ArrowUpRight className="h-4 w-4" />;
    case "SELL":
      return <ArrowDownRight className="h-4 w-4" />;
    case "WATCH":
      return <Minus className="h-4 w-4" />;
  }
}

function getScoreColor(score: number, inverted = false): string {
  const effectiveScore = inverted ? 100 - score : score;
  if (effectiveScore >= 70) return "text-green-600";
  if (effectiveScore >= 40) return "text-amber-500";
  return "text-red-500";
}

function getProgressColor(score: number, inverted = false): string {
  const effectiveScore = inverted ? 100 - score : score;
  if (effectiveScore >= 70) return "bg-green-600";
  if (effectiveScore >= 40) return "bg-amber-500";
  return "bg-red-500";
}

export function CardOutlookPanel({ card, isPro = false, canEdit = false }: CardOutlookPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  const { data: outlook, isLoading, refetch } = useQuery<OutlookData>({
    queryKey: ["/api/cards", card.id, "outlook"],
    queryFn: async () => {
      const res = await fetch(`/api/cards/${card.id}/outlook`);
      if (!res.ok) throw new Error("Failed to fetch outlook");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const generateOutlookMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/cards/${card.id}/outlook`, { timeHorizonMonths: 12 });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cards", card.id, "outlook"] });
      toast({
        title: "Outlook Generated",
        description: `Analysis complete: ${data.action} recommendation with ${data.confidenceScore}% confidence.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate outlook",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading outlook...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!outlook) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-medium">Card Outlook AI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Get investment-style insights: BUY, WATCH, or SELL recommendations with upside and risk scores.
            </p>
            {isPro && canEdit ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => generateOutlookMutation.mutate()}
                disabled={generateOutlookMutation.isPending}
                data-testid="button-generate-outlook"
              >
                {generateOutlookMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generateOutlookMutation.isPending ? "Analyzing..." : "Generate Outlook"}
              </Button>
            ) : !isPro ? (
              <div className="text-sm text-amber-600">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Pro feature - Upgrade to unlock AI insights
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-muted/30 overflow-visible">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Card Outlook AI</CardTitle>
          </div>
          <Badge className={`${getActionColor(outlook.action)} gap-1`} data-testid="badge-outlook-action">
            {getActionIcon(outlook.action)}
            {outlook.action}
          </Badge>
        </div>
        {outlook.generatedAt && (
          <CardDescription className="text-xs">
            Generated {new Date(outlook.generatedAt).toLocaleDateString()}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>Upside</span>
            </div>
            <div className={`text-lg font-bold ${getScoreColor(outlook.upsideScore)}`} data-testid="text-upside-score">
              {outlook.upsideScore}
            </div>
            <Progress 
              value={outlook.upsideScore} 
              className="h-1.5"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              <span>Risk</span>
            </div>
            <div className={`text-lg font-bold ${getScoreColor(outlook.riskScore, true)}`} data-testid="text-risk-score">
              {outlook.riskScore}
            </div>
            <Progress 
              value={outlook.riskScore} 
              className="h-1.5"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Gauge className="h-3 w-3" />
              <span>Confidence</span>
            </div>
            <div className={`text-lg font-bold ${getScoreColor(outlook.confidenceScore)}`} data-testid="text-confidence-score">
              {outlook.confidenceScore}
            </div>
            <Progress 
              value={outlook.confidenceScore} 
              className="h-1.5"
            />
          </div>
        </div>

        {outlook.projectedOutlook && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">12-Month Price Outlook</span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-md bg-red-500/10">
                  <div className="text-xs text-muted-foreground">Bear Case</div>
                  <div className="font-medium text-red-600" data-testid="text-bear-case">
                    {outlook.projectedOutlook.bearCaseChangePct > 0 ? '+' : ''}{outlook.projectedOutlook.bearCaseChangePct}%
                  </div>
                </div>
                <div className="p-2 rounded-md bg-amber-500/10">
                  <div className="text-xs text-muted-foreground">Base Case</div>
                  <div className="font-medium text-amber-600" data-testid="text-base-case">
                    {outlook.projectedOutlook.baseCaseChangePct > 0 ? '+' : ''}{outlook.projectedOutlook.baseCaseChangePct}%
                  </div>
                </div>
                <div className="p-2 rounded-md bg-green-500/10">
                  <div className="text-xs text-muted-foreground">Bull Case</div>
                  <div className="font-medium text-green-600" data-testid="text-bull-case">
                    {outlook.projectedOutlook.bullCaseChangePct > 0 ? '+' : ''}{outlook.projectedOutlook.bullCaseChangePct}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {outlook.explanation?.short && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm" data-testid="text-explanation-short">
                {outlook.explanation.short}
              </p>
              
              {outlook.explanation.long && (
                <Collapsible open={showDetails} onOpenChange={setShowDetails}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1 p-0 h-auto text-muted-foreground">
                      {showDetails ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Less details
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          More details
                        </>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <p className="text-sm text-muted-foreground" data-testid="text-explanation-long">
                      {outlook.explanation.long}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </>
        )}

        {isPro && canEdit && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-full"
              onClick={() => generateOutlookMutation.mutate()}
              disabled={generateOutlookMutation.isPending}
              data-testid="button-refresh-outlook"
            >
              {generateOutlookMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {generateOutlookMutation.isPending ? "Analyzing..." : "Refresh Outlook"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
