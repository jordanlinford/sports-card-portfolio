import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Loader2, Eye, Calendar, TrendingUp, TrendingDown, Target, AlertTriangle, Sparkles } from "lucide-react";
import { format } from "date-fns";

interface SnapshotResponse {
  snapshotType: string;
  title: string;
  snapshotData: any;
  ownerName: string;
  ownerHandle?: string;
  ownerProfileImage?: string;
  createdAt?: string;
  viewCount: number;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getActionColor(action: string): string {
  switch (action) {
    case "BUY": return "bg-green-500/20 text-green-700 dark:text-green-400";
    case "SELL": return "bg-red-500/20 text-red-700 dark:text-red-400";
    case "MONITOR": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
    case "LONG_HOLD": return "bg-blue-500/20 text-blue-700 dark:text-blue-400";
    case "LEGACY_HOLD": return "bg-purple-500/20 text-purple-700 dark:text-purple-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function CardOutlookView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">{data.cardTitle || data.playerName || "Card Outlook"}</h2>
          {data.playerName && <p className="text-muted-foreground">{data.playerName}</p>}
        </div>
        <Badge className={`text-lg px-4 py-2 ${getActionColor(data.action)}`}>
          {data.action?.replace("_", " ") || "MONITOR"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-600">{data.upsideScore || 0}</div>
            <p className="text-sm text-muted-foreground">Upside Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-red-500">{data.riskScore || 0}</div>
            <p className="text-sm text-muted-foreground">Risk Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-blue-500">{data.confidenceScore || 0}</div>
            <p className="text-sm text-muted-foreground">Confidence</p>
          </CardContent>
        </Card>
      </div>

      {data.explanation?.short && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{data.explanation.short}</p>
            {data.explanation.long && (
              <p className="mt-4 text-sm">{data.explanation.long}</p>
            )}
          </CardContent>
        </Card>
      )}

      {data.priceTargets && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5" />
              Price Targets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Strong Buy Below</p>
                <p className="font-semibold text-green-600">{formatCurrency(data.priceTargets.strongBuyBelow)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Buy Below</p>
                <p className="font-semibold text-green-500">{formatCurrency(data.priceTargets.buyBelow)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fair Value</p>
                <p className="font-semibold">{formatCurrency(data.priceTargets.fairValue)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sell Above</p>
                <p className="font-semibold text-red-500">{formatCurrency(data.priceTargets.sellAbove)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PortfolioAnalyticsView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{formatCurrency(data.totalValue)}</div>
            <p className="text-sm text-muted-foreground">Total Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{data.totalCards || 0}</div>
            <p className="text-sm text-muted-foreground">Total Cards</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{data.totalCases || 0}</div>
            <p className="text-sm text-muted-foreground">Portfolios</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{formatCurrency(data.avgCardValue)}</div>
            <p className="text-sm text-muted-foreground">Avg Card Value</p>
          </CardContent>
        </Card>
      </div>

      {data.topCards && data.topCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Cards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topCards.slice(0, 5).map((card: any, index: number) => (
                <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="font-medium">{card.title}</span>
                  <span className="text-muted-foreground">{formatCurrency(card.estimatedValue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PortfolioOutlookView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {data.overallHealth && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Portfolio Health
              <Badge variant="outline">{data.overallHealth.grade}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{data.overallHealth.summary}</p>
          </CardContent>
        </Card>
      )}

      {data.riskSignals && data.riskSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Risk Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.riskSignals.map((signal: any, index: number) => (
                <div key={index} className="flex items-start gap-3">
                  <Badge variant={signal.severity === 'high' ? 'destructive' : 'secondary'}>
                    {signal.severity}
                  </Badge>
                  <div>
                    <p className="font-medium">{signal.title}</p>
                    <p className="text-sm text-muted-foreground">{signal.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.recommendations && data.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recommendations.map((rec: string, index: number) => (
                <div key={index} className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getTemperatureLabel(temp: string) {
  switch (temp) {
    case "HOT": return { label: "Hot", color: "bg-red-500/20 text-red-700 dark:text-red-400" };
    case "WARM": return { label: "Warm", color: "bg-orange-500/20 text-orange-700 dark:text-orange-400" };
    case "NEUTRAL": return { label: "Neutral", color: "bg-slate-500/20 text-slate-700 dark:text-slate-400" };
    case "COOLING": return { label: "Cooling", color: "bg-blue-500/20 text-blue-700 dark:text-blue-400" };
    default: return { label: temp, color: "bg-muted text-muted-foreground" };
  }
}

function PlayerOutlookView({ data }: { data: any }) {
  const tempInfo = getTemperatureLabel(data.temperature || "NEUTRAL");
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">{data.playerName}</h2>
          <p className="text-muted-foreground">
            {data.sport} {data.position && `- ${data.position}`}
            {data.team && ` | ${data.team}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {data.outlook && (
            <Badge className={`text-lg px-4 py-2 ${getActionColor(data.outlook)}`}>
              {data.modifier && `${data.modifier} `}{data.outlook}
            </Badge>
          )}
          {data.temperature && (
            <Badge className={tempInfo.color}>
              {tempInfo.label}
            </Badge>
          )}
        </div>
      </div>

      {data.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Investment Verdict</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{data.summary}</p>
          </CardContent>
        </Card>
      )}

      {data.thesis && data.thesis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Thesis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.thesis.map((point: string, index: number) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.marketRealityCheck && data.marketRealityCheck.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Market Reality Check
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.marketRealityCheck.map((check: string, index: number) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 mt-2 shrink-0" />
                  <span className="text-muted-foreground">{check}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}


      {/* Backward compatibility for legacy snapshots */}
      {data.keyFactors && data.keyFactors.length > 0 && !data.thesis && (
        <Card>
          <CardHeader>
            <CardTitle>Key Factors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.keyFactors.map((factor: string, index: number) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span>{factor}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.generatedAt && (
        <p className="text-xs text-center text-muted-foreground">
          Generated {format(new Date(data.generatedAt), "MMM d, yyyy 'at' h:mm a")}
        </p>
      )}
    </div>
  );
}

export default function ShareViewer() {
  const { token } = useParams<{ token: string }>();

  const { data: snapshot, isLoading, error } = useQuery<SnapshotResponse>({
    queryKey: ["/api/snapshots", token],
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold">Snapshot Not Found</h1>
        <p className="text-muted-foreground">This shared link may have expired or been deleted.</p>
      </div>
    );
  }

  const snapshotData = snapshot.snapshotData as any;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={snapshot.ownerProfileImage} />
                  <AvatarFallback>
                    {snapshot.ownerName?.charAt(0)?.toUpperCase() || "C"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{snapshot.ownerName}</p>
                  {snapshot.ownerHandle && (
                    <p className="text-sm text-muted-foreground">@{snapshot.ownerHandle}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  <span>{snapshot.viewCount} views</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{snapshot.createdAt ? format(new Date(snapshot.createdAt), "MMM d, yyyy") : "Unknown"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <h1 className="text-3xl font-bold mb-6">{snapshot.title}</h1>

        {snapshot.snapshotType === 'card_outlook' && <CardOutlookView data={snapshotData} />}
        {snapshot.snapshotType === 'player_outlook' && <PlayerOutlookView data={snapshotData} />}
        {snapshot.snapshotType === 'portfolio_analytics' && <PortfolioAnalyticsView data={snapshotData} />}
        {snapshot.snapshotType === 'portfolio_outlook' && <PortfolioOutlookView data={snapshotData} />}

        <Separator className="my-8" />
        
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Shared from Sports Card Portfolio</p>
          <a href="/" className="text-primary hover:underline text-sm">
            Create your own collection
          </a>
        </div>
      </div>
    </div>
  );
}
