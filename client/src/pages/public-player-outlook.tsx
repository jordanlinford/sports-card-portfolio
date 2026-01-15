import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Thermometer,
  Snowflake,
  ShoppingCart,
  Eye,
  Ban,
  Target,
  Sparkles,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import type { 
  PlayerOutlookResponse, 
  MarketTemperature, 
  AdvisorOutlook 
} from "@shared/schema";
import { useEffect } from "react";
import { transformToAdvisorOutlook, applyVerdictGuardrails } from "@/lib/transformToAdvisorOutlook";

interface PublicOutlookData {
  playerName: string;
  sport: string;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  classification: {
    stage?: string;
    position?: string;
    team?: string;
    baseTemperature?: MarketTemperature;
  } | null;
  outlook: PlayerOutlookResponse | null;
  lastUpdated: string | null;
}

function getTemperatureIcon(temp?: MarketTemperature) {
  switch (temp) {
    case "HOT": return <Flame className="h-4 w-4" />;
    case "WARM": return <Thermometer className="h-4 w-4" />;
    case "NEUTRAL": return <Minus className="h-4 w-4" />;
    case "COOLING": return <Snowflake className="h-4 w-4" />;
    default: return null;
  }
}

function getTemperatureColor(temp?: MarketTemperature) {
  switch (temp) {
    case "HOT": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "WARM": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "NEUTRAL": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "COOLING": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getVerdictIcon(verdict?: string) {
  switch (verdict) {
    case "BUY":
    case "ACCUMULATE":
    case "SPECULATIVE_FLYER":
      return <ShoppingCart className="h-5 w-5" />;
    case "MONITOR":
    case "HOLD_CORE":
    case "TRADE_THE_HYPE":
      return <Eye className="h-5 w-5" />;
    case "AVOID":
    case "AVOID_NEW_MONEY":
    case "AVOID_STRUCTURAL":
      return <Ban className="h-5 w-5" />;
    default: 
      return <Target className="h-5 w-5" />;
  }
}

function getVerdictColor(verdict?: string) {
  switch (verdict) {
    case "BUY":
    case "ACCUMULATE":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
    case "SPECULATIVE_FLYER":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30";
    case "MONITOR":
    case "HOLD_CORE":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    case "TRADE_THE_HYPE":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30";
    case "AVOID":
    case "AVOID_NEW_MONEY":
    case "AVOID_STRUCTURAL":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatSport(sport: string): string {
  const sportLabels: Record<string, string> = {
    football: "NFL Football",
    basketball: "NBA Basketball",
    baseball: "MLB Baseball",
    hockey: "NHL Hockey",
    soccer: "Soccer",
  };
  return sportLabels[sport] || sport;
}

export default function PublicPlayerOutlookPage() {
  const [match, params] = useRoute("/outlook/:sport/:slug");
  const sport = params?.sport || "";
  const slug = params?.slug || "";

  const { data: outlookData, isLoading, error } = useQuery<PublicOutlookData>({
    queryKey: ["/api/outlook", sport, slug],
    enabled: !!sport && !!slug,
  });

  useEffect(() => {
    if (outlookData) {
      document.title = outlookData.seoTitle || 
        `${outlookData.playerName} Sports Card Investment Outlook | Sports Card Portfolio`;
      
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute("content", 
          outlookData.seoDescription || 
          `Should you buy or sell ${outlookData.playerName} cards? Get AI-powered investment analysis.`
        );
      }
    }
  }, [outlookData]);

  if (!match) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-8" />
          <Skeleton className="h-64 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !outlookData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-16 max-w-4xl text-center">
          <AlertTriangle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Player Not Found</h1>
          <p className="text-muted-foreground mb-6">
            We don't have an outlook for this player yet.
          </p>
          <Button 
            data-testid="link-home"
            onClick={() => window.location.href = "/"}
          >
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  const { playerName, outlook, classification, lastUpdated } = outlookData;
  
  const advisorOutlook: AdvisorOutlook | null = outlook 
    ? applyVerdictGuardrails(transformToAdvisorOutlook(JSON.parse(JSON.stringify(outlook))))
    : null;
  
  const temperature = classification?.baseTemperature || outlook?.snapshot?.temperature;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <nav className="mb-6" data-testid="breadcrumb">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li><a href="/" className="hover:text-foreground" data-testid="link-home">Home</a></li>
            <li>/</li>
            <li><a href={`/outlook/${sport}`} className="hover:text-foreground" data-testid="link-sport">{formatSport(sport)}</a></li>
            <li>/</li>
            <li className="text-foreground" data-testid="text-player-name">{playerName}</li>
          </ol>
        </nav>

        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h1 className="text-3xl font-bold" data-testid="text-player-title">
              {playerName} Sports Card Investment Outlook
            </h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {classification?.position && (
              <span data-testid="text-position">{classification.position}</span>
            )}
            {classification?.team && (
              <>
                <span>·</span>
                <span data-testid="text-team">{classification.team}</span>
              </>
            )}
            {classification?.stage && (
              <>
                <span>·</span>
                <Badge variant="outline" data-testid="badge-stage">
                  {classification.stage.replace(/_/g, " ")}
                </Badge>
              </>
            )}
            {lastUpdated && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1" data-testid="text-last-updated">
                  <Clock className="h-3 w-3" />
                  Updated {new Date(lastUpdated).toLocaleDateString()}
                </span>
              </>
            )}
          </div>
        </header>

        {advisorOutlook && (
          <Card className="mb-6" data-testid="card-verdict">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge 
                  className={`text-lg px-4 py-2 ${getVerdictColor(advisorOutlook.verdict)}`}
                  data-testid="badge-verdict"
                >
                  {getVerdictIcon(advisorOutlook.verdict)}
                  <span className="ml-2">{advisorOutlook.verdictLabel || advisorOutlook.verdict}</span>
                </Badge>
                
                {temperature && (
                  <Badge 
                    variant="outline" 
                    className={getTemperatureColor(temperature)}
                    data-testid="badge-temperature"
                  >
                    {getTemperatureIcon(temperature)}
                    <span className="ml-1">{temperature} Market</span>
                  </Badge>
                )}
                
                {advisorOutlook.confidence && (
                  <Badge variant="outline" data-testid="badge-confidence">
                    {advisorOutlook.confidence} Confidence
                  </Badge>
                )}
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-6">
                {advisorOutlook.advisorTake && (
                  <div data-testid="section-advisor-take">
                    <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Our Take
                    </h2>
                    <p className="text-foreground leading-relaxed">
                      {advisorOutlook.advisorTake}
                    </p>
                  </div>
                )}

                {advisorOutlook.topReasons && advisorOutlook.topReasons.length > 0 && (
                  <div data-testid="section-top-reasons">
                    <h2 className="text-lg font-semibold mb-3">Key Factors</h2>
                    <ul className="space-y-2">
                      {advisorOutlook.topReasons.map((reason, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {advisorOutlook.collectorTip && (
                  <div className="bg-muted/50 rounded-lg p-4" data-testid="section-collector-tip">
                    <h3 className="font-medium mb-1 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Collector Tip
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {advisorOutlook.collectorTip}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {advisorOutlook?.whatChangesMyMind && advisorOutlook.whatChangesMyMind.length > 0 && (
          <Card className="mb-6" data-testid="card-what-changes">
            <CardHeader>
              <CardTitle className="text-lg">What Would Change This Outlook</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {advisorOutlook.whatChangesMyMind.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="bg-primary/5 border-primary/20" data-testid="card-cta">
          <CardContent className="p-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">
                Get Real-Time Market Intelligence
              </h2>
              <p className="text-muted-foreground mb-4">
                Track your collection, get personalized buy recommendations, and access AI-powered insights for every player in your portfolio.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button 
                  size="lg"
                  data-testid="button-signup"
                  onClick={() => window.location.href = "/"}
                >
                  Start Free Today
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  data-testid="button-explore"
                  onClick={() => window.location.href = "/explore"}
                >
                  Explore Collections
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <footer className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
          <p className="mb-2">
            This analysis is AI-generated and updated regularly. Past performance does not guarantee future results.
          </p>
          <p>
            <a href="/terms" className="hover:underline" data-testid="link-terms">Terms of Service</a>
            {" · "}
            <a href="/privacy" className="hover:underline" data-testid="link-privacy">Privacy Policy</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
