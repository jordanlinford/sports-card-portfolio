import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown,
  Activity,
  ShieldCheck,
  ShieldAlert,
  BarChart3,
  Target,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Plus,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

type DisplayCase = {
  id: number;
  name: string;
};

type OutlookData = {
  cardId: number;
  card: {
    id: number;
    title: string;
    playerName?: string;
    sport?: string;
    position?: string;
    grade?: string;
    year?: number;
    set?: string;
    variation?: string;
  };
  market: {
    value: number | null;
    min: number | null;
    max: number | null;
    compCount: number | null;
    pricePoints?: Array<{
      date: string;
      price: number;
      source: string;
      url?: string;
    }>;
  };
  signals: {
    trend?: number;
    liquidity?: number;
    volatility?: number;
    sport?: number;
    position?: number;
    cardType?: number;
    demand?: number;
    momentum?: number;
    quality?: number;
    upside: number;
    risk: number;
  };
  action: string;
  actionReasons?: string[];
  careerStage: string;
  confidence: {
    level: string;
    reason?: string;
  };
  explanation?: {
    short: string;
    long?: string;
    bullets?: string[];
  };
  bigMover?: {
    flag: boolean;
    reason?: string | null;
  };
  generatedAt: string;
  cached?: boolean;
  stale?: boolean;
  proRequired?: boolean;
  needsGeneration?: boolean;
};

const ACTION_STYLES: Record<string, { bg: string; border: string; icon: typeof TrendingUp; label: string }> = {
  BUY: { bg: "bg-green-500/20", border: "border-green-500", icon: TrendingUp, label: "Buy Signal" },
  WATCH: { bg: "bg-yellow-500/20", border: "border-yellow-500", icon: Activity, label: "Watch" },
  SELL: { bg: "bg-red-500/20", border: "border-red-500", icon: TrendingDown, label: "Sell Signal" },
  LONG_HOLD: { bg: "bg-blue-500/20", border: "border-blue-500", icon: Clock, label: "Long Hold" },
  LITTLE_VALUE: { bg: "bg-muted", border: "border-muted-foreground/30", icon: Info, label: "Low Value" },
};

const CONFIDENCE_STYLES: Record<string, { color: string; icon: typeof CheckCircle }> = {
  HIGH: { color: "text-green-500", icon: CheckCircle },
  MEDIUM: { color: "text-yellow-500", icon: AlertTriangle },
  LOW: { color: "text-red-500", icon: XCircle },
};

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SignalBar({ label, value, max = 10, color = "primary" }: { label: string; value?: number; max?: number; color?: string }) {
  if (value === undefined || value === null) return null;
  const percentage = (value / max) * 100;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

function CompositeScoreCard({ label, value, icon: Icon, description }: { 
  label: string; 
  value?: number; 
  icon: typeof Target; 
  description: string;
}) {
  if (value === undefined || value === null) return null;
  
  let colorClass = "text-muted-foreground";
  if (value >= 70) colorClass = "text-green-500";
  else if (value >= 40) colorClass = "text-yellow-500";
  else colorClass = "text-red-500";
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`p-2 rounded-full ${colorClass} bg-background`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{label}</span>
          <span className={`text-lg font-bold ${colorClass}`}>{value}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
    </div>
  );
}

function OutlookSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex gap-4">
            <Skeleton className="h-32 w-24 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-6 w-32" />
            </div>
          </div>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
          <CardContent><Skeleton className="h-48 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
          <CardContent><Skeleton className="h-48 w-full" /></CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CardOutlookPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [showFullExplanation, setShowFullExplanation] = useState(false);
  const [showAddToCaseModal, setShowAddToCaseModal] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const { toast } = useToast();

  const { data: outlook, isLoading, error } = useQuery<OutlookData>({
    queryKey: ["/api/cards", cardId, "outlook-v2"],
    enabled: !!cardId,
  });

  const { data: displayCases } = useQuery<DisplayCase[]>({
    queryKey: ["/api/display-cases"],
    enabled: isAuthenticated && showAddToCaseModal,
  });

  const addToCaseMutation = useMutation({
    mutationFn: async ({ caseId, cardData }: { caseId: number; cardData: any }) => {
      const res = await apiRequest("POST", `/api/display-cases/${caseId}/cards`, cardData);
      return res.json();
    },
    onSuccess: () => {
      setShowAddToCaseModal(false);
      setSelectedCaseId("");
      toast({
        title: "Card Added",
        description: "Card has been added to your display case.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add card to display case.",
        variant: "destructive",
      });
    },
  });

  const handleAddToCase = () => {
    if (!selectedCaseId || !outlook?.card) return;
    
    const cardData = {
      title: outlook.card.title,
      imagePath: "/placeholder-card.png",
      set: outlook.card.set || null,
      year: outlook.card.year || null,
      variation: outlook.card.variation || null,
      grade: outlook.card.grade || null,
      estimatedValue: outlook.market?.value || null,
      playerName: outlook.card.playerName || null,
      sport: outlook.card.sport || null,
      position: outlook.card.position || null,
    };
    
    addToCaseMutation.mutate({ caseId: parseInt(selectedCaseId), cardData });
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cards/${cardId}/outlook-v2`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cards", cardId, "outlook-v2"] });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <OutlookSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Failed to Load Outlook</h2>
        <p className="text-muted-foreground mb-4">We couldn't fetch the card outlook data.</p>
        <Button onClick={() => setLocation("/dashboard")} data-testid="button-back-dashboard">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const needsGeneration = outlook?.needsGeneration || (!outlook?.action && !outlook?.cached);
  const isPro = user?.subscriptionStatus === "PRO";
  
  const actionStyle = ACTION_STYLES[outlook?.action || "WATCH"] || ACTION_STYLES.WATCH;
  const ActionIcon = actionStyle.icon;
  const confidenceStyle = CONFIDENCE_STYLES[outlook?.confidence?.level || "LOW"] || CONFIDENCE_STYLES.LOW;
  const ConfidenceIcon = confidenceStyle.icon;

  const chartData = outlook?.market?.pricePoints?.map(pp => ({
    date: formatDate(pp.date),
    price: pp.price,
    fullDate: pp.date,
  })).sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime()) || [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Button 
        variant="ghost" 
        onClick={() => window.history.back()} 
        className="mb-6"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {needsGeneration && isPro && (
        <Card className="mb-6">
          <CardContent className="py-6">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Generate AI Outlook</h3>
              <p className="text-muted-foreground mb-4">
                Get detailed market signals, price analysis, and AI-powered insights for this card.
              </p>
              <Button 
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-generate-outlook"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate Outlook
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {needsGeneration && !isPro && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="py-6">
            <div className="text-center">
              <ShieldAlert className="h-12 w-12 mx-auto text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Pro Feature</h3>
              <p className="text-muted-foreground mb-4">
                Card Outlook AI 2.0 with signal-based analysis is available for Pro subscribers.
              </p>
              <Button onClick={() => setLocation("/upgrade")} data-testid="button-upgrade">
                Upgrade to Pro
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {outlook?.card && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl sm:text-2xl mb-2" data-testid="text-card-title">
                  {outlook.card.title}
                </CardTitle>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-3">
                  {outlook.card.year && <span>{outlook.card.year}</span>}
                  {outlook.card.set && <span>{outlook.card.set}</span>}
                  {outlook.card.grade && (
                    <Badge variant="outline" className="text-xs">{outlook.card.grade}</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {outlook.action && (
                    <Badge 
                      className={`${actionStyle.bg} ${actionStyle.border} border text-foreground gap-1`}
                      data-testid="badge-action"
                    >
                      <ActionIcon className="h-3 w-3" />
                      {actionStyle.label}
                    </Badge>
                  )}
                  {outlook.careerStage && outlook.careerStage !== "UNKNOWN" && (
                    <Badge variant="secondary" className="text-xs" data-testid="badge-career-stage">
                      {outlook.careerStage}
                    </Badge>
                  )}
                  {outlook.bigMover?.flag && (
                    <Badge 
                      className="bg-purple-500/20 border-purple-500 border text-foreground gap-1"
                      data-testid="badge-big-mover"
                    >
                      <Zap className="h-3 w-3" />
                      Big Mover
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold" data-testid="text-market-value">
                  {formatCurrency(outlook.market?.value)}
                </div>
                {outlook.market?.min && outlook.market?.max && (
                  <div className="text-sm text-muted-foreground">
                    Range: {formatCurrency(outlook.market.min)} - {formatCurrency(outlook.market.max)}
                  </div>
                )}
                {outlook.market?.compCount !== null && (
                  <div className="text-sm text-muted-foreground">
                    Based on {outlook.market.compCount} comp{outlook.market.compCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {outlook?.action && outlook?.actionReasons && (
        <Card className={`mb-6 ${actionStyle.bg} ${actionStyle.border} border`}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-background">
                <ActionIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{actionStyle.label} Recommendation</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {outlook.actionReasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-foreground mt-0.5">-</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2">
                <ConfidenceIcon className={`h-5 w-5 ${confidenceStyle.color}`} />
                <span className={`text-sm font-medium ${confidenceStyle.color}`}>
                  {outlook.confidence?.level}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {outlook?.bigMover?.flag && outlook?.bigMover?.reason && (
        <Card className="mb-6 bg-purple-500/10 border-purple-500/50 border">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Zap className="h-5 w-5 text-purple-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Big Mover Potential</h3>
                <p className="text-sm text-muted-foreground">
                  {outlook.bigMover.reason}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {chartData.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Price Trend</CardTitle>
              <CardDescription>Recent sold prices from market data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Price']}
                    />
                    <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" fill="url(#colorPrice)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {outlook?.signals && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Market Signals</CardTitle>
              <CardDescription>Computed from real market data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <CompositeScoreCard 
                  label="Upside" 
                  value={outlook.signals.upside} 
                  icon={TrendingUp} 
                  description="Growth potential"
                />
                <CompositeScoreCard 
                  label="Risk" 
                  value={outlook.signals.risk} 
                  icon={ShieldAlert} 
                  description="Market risk level"
                />
              </div>
              {isPro && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <SignalBar label="Trend" value={outlook.signals.trend} />
                    <SignalBar label="Liquidity" value={outlook.signals.liquidity} />
                    <SignalBar label="Volatility" value={outlook.signals.volatility} />
                    <SignalBar label="Card Quality" value={outlook.signals.cardType} />
                  </div>
                </>
              )}
              {!isPro && outlook.signals.trend && (
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-sm text-muted-foreground">
                    Upgrade to Pro to see detailed signal breakdowns
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {outlook?.explanation?.short && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Analysis</CardTitle>
            <CardDescription>AI-generated explanation of the recommendation</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-explanation-short">{outlook.explanation.short}</p>
            
            {outlook.explanation.bullets && outlook.explanation.bullets.length > 0 && (
              <ul className="mt-3 space-y-2">
                {outlook.explanation.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}

            {isPro && outlook.explanation.long && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullExplanation(!showFullExplanation)}
                  className="mt-3"
                  data-testid="button-toggle-explanation"
                >
                  {showFullExplanation ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Show Full Analysis
                    </>
                  )}
                </Button>
                {showFullExplanation && (
                  <div className="mt-3 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground whitespace-pre-wrap">
                    {outlook.explanation.long}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {outlook?.cached && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  Generated {outlook.generatedAt ? new Date(outlook.generatedAt).toLocaleDateString() : 'recently'}
                  {outlook.stale && <span className="text-yellow-500 ml-2">(may be outdated)</span>}
                </span>
              </div>
              {isPro && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  data-testid="button-refresh-outlook"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {outlook?.confidence?.reason && isPro && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="text-sm font-medium">Data Confidence: </span>
                <span className={`text-sm ${confidenceStyle.color}`}>{outlook.confidence.level}</span>
                <p className="text-sm text-muted-foreground mt-1">{outlook.confidence.reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {outlook?.card && isAuthenticated && (
        <Card className="mt-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-medium">Add to Your Collection</h3>
                <p className="text-sm text-muted-foreground">Save this card to one of your display cases</p>
              </div>
              <Button 
                onClick={() => setShowAddToCaseModal(true)}
                data-testid="button-add-to-case"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add to Display Case
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddToCaseModal} onOpenChange={setShowAddToCaseModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Display Case</DialogTitle>
            <DialogDescription>
              Select a display case to add "{outlook?.card?.title}" to your collection.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label className="text-sm font-medium mb-2 block">Select Display Case</Label>
            <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
              <SelectTrigger data-testid="select-display-case">
                <SelectValue placeholder="Choose a display case..." />
              </SelectTrigger>
              <SelectContent>
                {displayCases?.map((dc) => (
                  <SelectItem key={dc.id} value={dc.id.toString()}>
                    {dc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {(!displayCases || displayCases.length === 0) && (
              <div className="mt-4 p-4 rounded-lg bg-muted/50 text-center">
                <p className="text-sm text-muted-foreground mb-2">You don't have any display cases yet.</p>
                <Button variant="outline" size="sm" onClick={() => setLocation("/cases/new")}>
                  Create Your First Case
                </Button>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddToCaseModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddToCase}
              disabled={!selectedCaseId || addToCaseMutation.isPending}
              data-testid="button-confirm-add"
            >
              {addToCaseMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
