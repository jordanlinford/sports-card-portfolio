import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldAlert,
  Target,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Trophy,
  MinusCircle,
  ExternalLink,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type OutlookDisplayData = {
  card: {
    title: string;
    playerName?: string | null;
    sport?: string | null;
    position?: string | null;
    grade?: string | null;
    year?: number | string | null;
    set?: string | null;
    variation?: string | null;
    imagePath?: string | null;
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
    modeledEstimate?: {
      low: number;
      mid: number;
      high: number;
      methodology: string;
      referenceComps: Array<{ cardType: string; estimatedValue: number; liquidity: string }>;
      source: "MODEL";
    } | null;
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
    downsideRisk: number;
    marketFriction: number;
  };
  action: string;
  actionReasons?: string[] | null;
  careerStage?: string;
  confidence: {
    level: string;
    reason?: string | null;
  };
  matchConfidence?: {
    score: number;
    tier: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    matchedComps?: number;
    totalComps?: number;
    samples?: Array<{
      title: string;
      snippet?: string;
      source?: string;
      price?: number;
      matchScore?: number;
      url?: string;
    }>;
  } | null;
  explanation?: {
    short: string;
    long?: string | null;
    bullets?: string[];
  } | null;
  bigMover?: {
    flag: boolean;
    reason?: string | null;
  };
  generatedAt?: string;
  isPro?: boolean;
};

const ACTION_STYLES: Record<string, { bg: string; border: string; icon: typeof TrendingUp; label: string; takeaway: string }> = {
  BUY: { bg: "bg-green-500/20", border: "border-green-500", icon: TrendingUp, label: "Buy Signal", takeaway: "Good entry point at current prices. Consider adding to your collection." },
  WATCH: { bg: "bg-yellow-500/20", border: "border-yellow-500", icon: Activity, label: "Watch", takeaway: "Do not buy aggressively. Monitor for volume changes or news." },
  SELL: { bg: "bg-red-500/20", border: "border-red-500", icon: TrendingDown, label: "Sell Signal", takeaway: "Consider reducing position. Risk outweighs potential upside." },
  LONG_HOLD: { bg: "bg-blue-500/20", border: "border-blue-500", icon: Clock, label: "Long Hold", takeaway: "Hold for the long term. Short-term gains unlikely but solid floor." },
  LEGACY_HOLD: { bg: "bg-indigo-500/20", border: "border-indigo-500", icon: Trophy, label: "Legacy Hold", takeaway: "Collector piece. Value driven by legacy appeal, not performance." },
  LITTLE_VALUE: { bg: "bg-muted", border: "border-muted-foreground/30", icon: MinusCircle, label: "Low Value", takeaway: "Limited market interest. Unlikely to appreciate significantly." },
};

const CONFIDENCE_STYLES: Record<string, { color: string; icon: typeof CheckCircle }> = {
  HIGH: { color: "text-green-500", icon: CheckCircle },
  MEDIUM: { color: "text-yellow-500", icon: AlertTriangle },
  LOW: { color: "text-red-500", icon: XCircle },
};

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SignalBar({ label, value, max = 10, tooltip }: { label: string; value?: number; max?: number; tooltip?: string }) {
  if (value === undefined || value === null) return null;
  const percentage = (value / max) * 100;
  
  const content = (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground flex items-center gap-1">
          {label}
          {tooltip && <Info className="h-3 w-3 text-muted-foreground/50" />}
        </span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
  
  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return content;
}

function CompositeScoreCard({ label, value, icon: Icon, description, helperText, tooltip }: { 
  label: string; 
  value?: number; 
  icon: typeof Target; 
  description: string;
  helperText?: string;
  tooltip?: string;
}) {
  if (value === undefined || value === null) return null;
  
  let colorClass = "text-muted-foreground";
  if (value >= 70) colorClass = "text-green-500";
  else if (value >= 40) colorClass = "text-yellow-500";
  else colorClass = "text-red-500";
  
  const content = (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`p-2 rounded-full ${colorClass} bg-background`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate flex items-center gap-1">
            {label}
            {tooltip && <Info className="h-3 w-3 text-muted-foreground/50" />}
          </span>
          <span className={`text-lg font-bold ${colorClass}`}>{value}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
        {helperText && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{helperText}</p>
        )}
      </div>
    </div>
  );
  
  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return content;
}

function getMarketFrictionHelperText(value: number, action?: string): string {
  if (action === "LEGACY_HOLD") {
    return value > 75 
      ? "Thin market—eye appeal drives big spreads." 
      : "Sells slowly—patient pricing works best.";
  }
  if (value <= 25) return "Easy to move—buyers are plentiful.";
  if (value <= 50) return "Usually sellable, but timing matters.";
  if (value <= 75) return "May take a while to sell at a fair price.";
  return "Trades infrequently—expect wide spreads.";
}

interface OutlookDetailsProps {
  data: OutlookDisplayData;
  cardImageUrl?: string | null;
  showDetailedSignals?: boolean;
  compact?: boolean;
  onShowMatchSamples?: () => void;
}

export function OutlookDetails({ 
  data, 
  cardImageUrl, 
  showDetailedSignals = true,
  compact = false,
  onShowMatchSamples,
}: OutlookDetailsProps) {
  const [showFullExplanation, setShowFullExplanation] = useState(false);

  const actionStyle = ACTION_STYLES[data.action] || ACTION_STYLES.WATCH;
  const ActionIcon = actionStyle.icon;
  const confidenceStyle = CONFIDENCE_STYLES[data.confidence?.level || "LOW"] || CONFIDENCE_STYLES.LOW;
  const ConfidenceIcon = confidenceStyle.icon;

  const chartData = data.market?.pricePoints?.map(pp => ({
    date: formatDate(pp.date),
    price: pp.price,
    fullDate: pp.date,
  })).sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime()) || [];

  const imageUrl = cardImageUrl || data.card.imagePath;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            {imageUrl && (
              <div className="flex-shrink-0">
                <div className="w-24 h-32 sm:w-28 sm:h-36 rounded-lg overflow-hidden border bg-muted/30">
                  <img 
                    src={imageUrl} 
                    alt={data.card.title} 
                    className="w-full h-full object-contain"
                    data-testid="img-card"
                  />
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl sm:text-2xl mb-2" data-testid="text-card-title">
                {data.card.title}
              </CardTitle>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-3">
                {data.card.year && <span>{data.card.year}</span>}
                {data.card.set && <span>{data.card.set}</span>}
                {data.card.variation && <span>- {data.card.variation}</span>}
                {data.card.grade && (
                  <Badge variant="outline" className="text-xs">{data.card.grade}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge 
                  className={`${actionStyle.bg} ${actionStyle.border} border text-foreground gap-1`}
                  data-testid="badge-action"
                >
                  <ActionIcon className="h-3 w-3" />
                  {actionStyle.label}
                </Badge>
                {data.careerStage && data.careerStage !== "UNKNOWN" && (
                  <Badge variant="secondary" className="text-xs" data-testid="badge-career-stage">
                    {data.careerStage}
                  </Badge>
                )}
                {data.bigMover?.flag && (
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
              {data.market?.value != null ? (
                <>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Est. Fair Value</div>
                  <div className="text-3xl font-bold" data-testid="text-market-value">
                    {formatCurrency(data.market.value)}
                  </div>
                  {data.market?.min != null && data.market?.max != null && (
                    <div className="text-sm text-muted-foreground">
                      Range: {formatCurrency(data.market.min)} - {formatCurrency(data.market.max)}
                    </div>
                  )}
                </>
              ) : data.market?.modeledEstimate ? (
                <>
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">Modeled</Badge>
                  </div>
                  <div className="text-2xl font-bold text-muted-foreground" data-testid="text-market-value">
                    ${data.market.modeledEstimate.low} - ${data.market.modeledEstimate.high}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Mid: ${data.market.modeledEstimate.mid}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    No live comps found
                  </div>
                </>
              ) : (
                <div className="text-3xl font-bold text-muted-foreground" data-testid="text-market-value">
                  N/A
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {data.actionReasons && data.actionReasons.length > 0 && (
        <Card className={`${actionStyle.bg} ${actionStyle.border} border`}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-background">
                <ActionIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{actionStyle.label} Recommendation</h3>
                <p className="text-sm font-medium mb-2">{actionStyle.takeaway}</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {data.actionReasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-foreground mt-0.5">-</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  Re-evaluate in 30-60 days or after major news.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ConfidenceIcon className={`h-5 w-5 ${confidenceStyle.color}`} />
                <span className={`text-sm font-medium ${confidenceStyle.color}`}>
                  {data.confidence?.level}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data.bigMover?.flag && data.bigMover?.reason && (
        <Card className="bg-purple-500/10 border-purple-500/50 border">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Zap className="h-5 w-5 text-purple-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Big Mover Potential</h3>
                <p className="text-sm text-muted-foreground">
                  {data.bigMover.reason}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6">
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
                      <linearGradient id="colorPriceOutlook" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${v}`} />
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Price']}
                    />
                    <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" fill="url(#colorPriceOutlook)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {data.signals && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Market Signals</CardTitle>
              <CardDescription>Computed from real market data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <CompositeScoreCard 
                  label="Upside" 
                  value={data.signals.upside} 
                  icon={TrendingUp} 
                  description="Growth potential"
                  tooltip="How much room the card has to grow in value. Based on player career stage, role stability (starters vs backups), card quality, and market momentum. Players with uncertain roles have dampened upside."
                />
                <CompositeScoreCard 
                  label="Downside" 
                  value={data.signals.downsideRisk} 
                  icon={ShieldAlert} 
                  description="Loss exposure"
                  tooltip="Risk of the card losing value. Considers price volatility, recent trends, and data confidence. Lower = safer investment. High downside means prices could drop."
                />
                <CompositeScoreCard 
                  label="Friction" 
                  value={data.signals.marketFriction} 
                  icon={Clock} 
                  description="Time to sell"
                  helperText={getMarketFrictionHelperText(data.signals.marketFriction, data.action)}
                  tooltip="How easy it is to sell this card at fair value. Low friction = quick sales, many buyers. High friction = may sit on the market or require price cuts to move."
                />
              </div>
              {showDetailedSignals && data.signals.trend != null && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <SignalBar 
                      label="Recent Momentum" 
                      value={data.signals.trend} 
                      tooltip="How prices are trending recently. High = prices rising. Low = prices falling or flat."
                    />
                    <SignalBar 
                      label="Comp Volume" 
                      value={data.signals.liquidity}
                      tooltip="Number of recent sales found. Higher = more data points for accurate pricing. 7+ is solid."
                    />
                    <SignalBar 
                      label="Price Volatility" 
                      value={data.signals.volatility}
                      tooltip="How much prices vary between sales. Low = tight, predictable pricing. High = wide price swings."
                    />
                    <SignalBar 
                      label="Card Quality" 
                      value={data.signals.cardType}
                      tooltip="How desirable the card itself is. Factors: brand (Prizm, National Treasures = premium), grade (PSA 10 = highest), rookie status, autograph, serial numbering, and parallels (Gold, Silver, Refractor). Higher = more collectible."
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {data.explanation?.short && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Analysis</CardTitle>
            <CardDescription>AI-generated explanation of the recommendation</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-explanation-short">{data.explanation.short}</p>
            
            {data.explanation.bullets && data.explanation.bullets.length > 0 && (
              <ul className="mt-3 space-y-2">
                {data.explanation.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}

            {data.explanation.long && (
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
                    {data.explanation.long}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {data.matchConfidence && (
        <Card className={
          data.matchConfidence.tier === "HIGH" 
            ? "bg-green-500/5 border-green-500/30" 
            : data.matchConfidence.tier === "MEDIUM"
            ? "bg-yellow-500/5 border-yellow-500/30"
            : "bg-red-500/5 border-red-500/30"
        }>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                {data.matchConfidence.tier === "HIGH" && <CheckCircle className="h-5 w-5 text-green-500" />}
                {data.matchConfidence.tier === "MEDIUM" && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                {data.matchConfidence.tier === "LOW" && <XCircle className="h-5 w-5 text-red-500" />}
                <span className="font-semibold">Card Match Confidence</span>
                <Badge 
                  variant={data.matchConfidence.tier === "HIGH" ? "default" : data.matchConfidence.tier === "MEDIUM" ? "secondary" : "destructive"}
                  data-testid="badge-match-confidence"
                >
                  {data.matchConfidence.tier} ({Math.round(data.matchConfidence.score * 100)}%)
                </Badge>
              </div>
              {data.matchConfidence.samples && data.matchConfidence.samples.length > 0 && onShowMatchSamples && (
                <Button variant="ghost" size="sm" onClick={onShowMatchSamples}>
                  View Samples
                  <ExternalLink className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {data.matchConfidence.reason}
            </p>
            {data.matchConfidence.tier === "LOW" && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2 font-medium">
                Pricing data may not accurately reflect this exact card.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {data.generatedAt && (
        <div className="text-xs text-muted-foreground text-center">
          Analysis generated {new Date(data.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
