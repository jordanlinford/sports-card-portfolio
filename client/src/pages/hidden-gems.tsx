import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { 
  Search,
  TrendingUp,
  Minus,
  Flame,
  Thermometer,
  Snowflake,
  ShoppingCart,
  Eye as EyeIcon,
  Ban,
  Target,
  Layers,
  Zap,
  Crown,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  Filter,
  Gem,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { PlayerVerdict, StockTier, MarketTemperature, VerdictModifier } from "@shared/schema";
import { PageShareButton } from "@/components/page-share-button";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface GemCandidate {
  playerName: string;
  sport: string;
  position?: string;
  team?: string;
  verdict: PlayerVerdict;
  modifier: VerdictModifier;
  temperature: MarketTemperature;
  tier: StockTier;
  thesis: string; // One-line summary of the opportunity
  riskLevel: RiskLevel;
  whyDiscounted: string[];
  repricingCatalysts: string[];
  trapRisks: string[];
}

const FOOTBALL_GEMS: GemCandidate[] = [
  {
    playerName: "Bo Nix",
    sport: "football",
    position: "QB",
    team: "Denver Broncos",
    verdict: "MONITOR",
    modifier: "Value",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    thesis: "Market views him as solid, not special. Outperformance could force repricing.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Hobby ceiling risk: Market views him as 'solid starter' rather than 'franchise face', capping casual demand.",
      "Narrative gap: Fewer signature moments than peers like Williams or Daniels means slower repricing.",
    ],
    repricingCatalysts: [
      "Playoff run or prime-time signature wins would force market recalibration.",
      "Clear 'franchise QB' narrative emerging with sustained success.",
    ],
    trapRisks: ["If ceiling proves limited to 'game manager' tier, cards may stay permanently discounted."],
  },
  {
    playerName: "Jalen Hurts",
    sport: "football",
    position: "QB",
    team: "Philadelphia Eagles",
    verdict: "BUY",
    modifier: "Value",
    temperature: "NEUTRAL",
    tier: "CORE",
    thesis: "Elite production at suppressed prices. Super Bowl loss hangover is temporary.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Post-Super Bowl loss hangover suppressed prices despite continued elite play.",
      "Running QB archetype gets discounted vs. traditional pocket passers in long-term value.",
    ],
    repricingCatalysts: [
      "Super Bowl win would remove the 'can he close?' narrative overhang.",
      "MVP-caliber season with improved passing stats.",
    ],
    trapRisks: ["Injury risk from running style could accelerate timeline concerns."],
  },
  {
    playerName: "Sam Darnold",
    sport: "football",
    position: "QB",
    team: "Minnesota Vikings",
    verdict: "MONITOR",
    modifier: "Speculative",
    temperature: "WARM",
    tier: "SPECULATIVE",
    thesis: "Career resurrection play. Cheap for a reason, but asymmetric if real.",
    riskLevel: "HIGH",
    whyDiscounted: [
      "Career resurrection narrative is fragile - market remembers Jets/Panthers struggles.",
      "Older rookie cards have heavy supply from initial hype cycle that never panned out.",
    ],
    repricingCatalysts: [
      "Playoff success would prove the turnaround is real, not situational.",
      "New long-term contract would signal team confidence.",
    ],
    trapRisks: ["Regression to mean could happen quickly, collapsing the value proposition."],
  },
  {
    playerName: "Lamar Jackson",
    sport: "football",
    position: "QB",
    team: "Baltimore Ravens",
    verdict: "BUY",
    modifier: "Value",
    temperature: "WARM",
    tier: "PREMIUM",
    thesis: "2x MVP trading at a discount due to playoff narrative. One win changes everything.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Playoff narrative (0-4 record) creates persistent discount despite 2x MVP seasons.",
      "Running QB longevity concerns keep some collectors hesitant despite proven durability.",
    ],
    repricingCatalysts: [
      "A single playoff win would shift the narrative significantly.",
      "Super Bowl appearance would reprice cards 30-50% higher immediately.",
    ],
    trapRisks: ["Another early playoff exit could cement 'regular season only' narrative."],
  },
  {
    playerName: "Brock Purdy",
    sport: "football",
    position: "QB",
    team: "San Francisco 49ers",
    verdict: "MONITOR",
    modifier: "Value",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    thesis: "Results don't match draft pedigree perception. Market hasn't caught up yet.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Mr. Irrelevant draft status creates 'system QB' skepticism that persists despite results.",
      "Belief inertia: Market still anchoring to draft pedigree over actual performance.",
    ],
    repricingCatalysts: [
      "Super Bowl MVP would silence system QB narrative permanently.",
      "Maintaining production if key weapons leave proves it's him, not the cast.",
    ],
    trapRisks: ["Losing supporting cast (Kittle, Deebo, Aiyuk) could expose limitations."],
  },
];

const BASKETBALL_GEMS: GemCandidate[] = [
  {
    playerName: "Tyrese Haliburton",
    sport: "basketball",
    position: "PG",
    team: "Indiana Pacers",
    verdict: "BUY",
    modifier: "Value",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    thesis: "Elite playmaker suppressed by small market. All-Star caliber, value prices.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Small market (Indiana) caps national visibility and casual collector demand.",
      "Not a highlight-reel scorer - his value is in playmaking which doesn't translate to hobby hype.",
    ],
    repricingCatalysts: [
      "All-NBA selection would validate star status.",
      "Deep playoff run or Conference Finals appearance.",
    ],
    trapRisks: ["Injury history (back) could become recurring concern."],
  },
  {
    playerName: "Jalen Brunson",
    sport: "basketball",
    position: "PG",
    team: "New York Knicks",
    verdict: "BUY",
    modifier: "Long-Term",
    temperature: "WARM",
    tier: "CORE",
    thesis: "Second-round pedigree masks first-round talent. NYC market upside is massive.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Second-round pick pedigree creates persistent 'not elite' perception.",
      "Late bloomer narrative means he missed the rookie hype window.",
    ],
    repricingCatalysts: [
      "Knicks championship run would make him a NYC legend (huge market).",
      "All-NBA First Team selection.",
    ],
    trapRisks: ["Small frame raises durability questions as primary scorer."],
  },
];

const BASEBALL_GEMS: GemCandidate[] = [
  {
    playerName: "Gunnar Henderson",
    sport: "baseball",
    position: "SS",
    team: "Baltimore Orioles",
    verdict: "BUY",
    modifier: "Long-Term",
    temperature: "WARM",
    tier: "PREMIUM",
    thesis: "Generational talent in a small market. MVP trajectory at mid-tier prices.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Baltimore market is smaller than NY/LA, limiting casual collector ceiling.",
      "Not flashy power numbers yet compared to peers like Ohtani.",
    ],
    repricingCatalysts: [
      "MVP season would establish him as face of franchise.",
      "World Series appearance with star performance.",
    ],
    trapRisks: ["Power development stalls below elite tier."],
  },
];

function getVerdictIcon(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return <ShoppingCart className="h-4 w-4" />;
    case "MONITOR": return <EyeIcon className="h-4 w-4" />;
    case "AVOID": return <Ban className="h-4 w-4" />;
    default: return null;
  }
}

function getVerdictColor(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
    case "MONITOR": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    case "AVOID": return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function getTierIcon(tier: StockTier) {
  switch (tier) {
    case "PREMIUM": return <Crown className="h-3 w-3" />;
    case "GROWTH": return <TrendingUp className="h-3 w-3" />;
    case "CORE": return <Target className="h-3 w-3" />;
    case "COMMON": return <Layers className="h-3 w-3" />;
    case "SPECULATIVE": return <Zap className="h-3 w-3" />;
    default: return null;
  }
}

function getTierColor(tier: StockTier) {
  switch (tier) {
    case "PREMIUM": return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "GROWTH": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "CORE": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "COMMON": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "SPECULATIVE": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getTemperatureIcon(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return <Flame className="h-3 w-3" />;
    case "WARM": return <Thermometer className="h-3 w-3" />;
    case "NEUTRAL": return <Minus className="h-3 w-3" />;
    case "COOLING": return <Snowflake className="h-3 w-3" />;
    default: return null;
  }
}

function getTemperatureColor(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "WARM": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "NEUTRAL": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "COOLING": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getRiskColor(risk: RiskLevel) {
  switch (risk) {
    case "LOW": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "MEDIUM": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "HIGH": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getRiskLabel(risk: RiskLevel) {
  switch (risk) {
    case "LOW": return "Lower Risk";
    case "MEDIUM": return "Moderate Risk";
    case "HIGH": return "Higher Risk";
    default: return risk;
  }
}

function GemCard({ gem }: { gem: GemCandidate }) {
  return (
    <Card className="hover-elevate" data-testid={`card-gem-${gem.playerName.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{gem.playerName}</CardTitle>
            <CardDescription>
              {gem.position && `${gem.position} `}
              {gem.team && `- ${gem.team}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className={`${getVerdictColor(gem.verdict)} flex items-center gap-1`}>
              {getVerdictIcon(gem.verdict)}
              {gem.verdict}
            </Badge>
          </div>
        </div>
        
        {/* One-line thesis summary */}
        <p className="text-sm text-foreground/80 italic mt-2 leading-snug">
          "{gem.thesis}"
        </p>
        
        <div className="flex flex-wrap gap-1 mt-2">
          <Badge variant="outline" className={`${getTierColor(gem.tier)} flex items-center gap-1 text-xs`}>
            {getTierIcon(gem.tier)}
            {gem.tier}
          </Badge>
          <Badge variant="outline" className={`${getTemperatureColor(gem.temperature)} flex items-center gap-1 text-xs`}>
            {getTemperatureIcon(gem.temperature)}
            {gem.temperature}
          </Badge>
          <Badge variant="outline" className={`${getRiskColor(gem.riskLevel)} flex items-center gap-1 text-xs`}>
            <AlertTriangle className="h-3 w-3" />
            {getRiskLabel(gem.riskLevel)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {gem.modifier}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            Why Discounted
          </h4>
          <ul className="space-y-1">
            {gem.whyDiscounted.slice(0, 2).map((reason, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">-</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
        
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            Repricing Catalyst
          </h4>
          <p className="text-sm text-foreground">{gem.repricingCatalysts[0]}</p>
        </div>
        
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            Trap Risk
          </h4>
          <p className="text-sm text-foreground">{gem.trapRisks[0]}</p>
        </div>
        
        <Button variant="outline" className="w-full" asChild>
          <Link href={`/player-outlook?player=${encodeURIComponent(gem.playerName)}&sport=${gem.sport}`}>
            View Full Analysis
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function HiddenGemsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [sport, setSport] = useState("all");
  const [temperatureFilter, setTemperatureFilter] = useState("non-hot");
  const [verdictFilter, setVerdictFilter] = useState("buy-watch");
  
  const allGems = [...FOOTBALL_GEMS, ...BASKETBALL_GEMS, ...BASEBALL_GEMS];
  
  const filteredGems = allGems.filter(gem => {
    if (sport !== "all" && gem.sport !== sport) return false;
    
    if (temperatureFilter === "non-hot" && gem.temperature === "HOT") return false;
    if (temperatureFilter === "cooling-only" && gem.temperature !== "COOLING") return false;
    
    if (verdictFilter === "buy-only" && gem.verdict !== "BUY") return false;
    if (verdictFilter === "buy-watch" && gem.verdict === "AVOID") return false;
    
    return true;
  });
  
  if (authLoading) {
    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Gem className="h-8 w-8 text-emerald-500" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Hidden Gems</h1>
          </div>
          <PageShareButton pageSlug="hidden-gems" />
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Players who might be underpriced relative to their talent. Each card explains why 
          they're cheap, what would flip the pricing, and what could confirm the discount is justified.
        </p>
      </div>
      
      <Card className="mb-8" data-testid="card-filters">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sport-filter">Sport</Label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger id="sport-filter" data-testid="select-sport">
                  <SelectValue placeholder="All Sports" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sports</SelectItem>
                  <SelectItem value="football">Football</SelectItem>
                  <SelectItem value="basketball">Basketball</SelectItem>
                  <SelectItem value="baseball">Baseball</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="temperature-filter">Temperature</Label>
              <Select value={temperatureFilter} onValueChange={setTemperatureFilter}>
                <SelectTrigger id="temperature-filter" data-testid="select-temperature">
                  <SelectValue placeholder="Non-Hot Only" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Temperatures</SelectItem>
                  <SelectItem value="non-hot">Exclude HOT (Value Plays)</SelectItem>
                  <SelectItem value="cooling-only">COOLING Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="verdict-filter">Verdict</Label>
              <Select value={verdictFilter} onValueChange={setVerdictFilter}>
                <SelectTrigger id="verdict-filter" data-testid="select-verdict">
                  <SelectValue placeholder="BUY + WATCH" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verdicts</SelectItem>
                  <SelectItem value="buy-only">BUY Only</SelectItem>
                  <SelectItem value="buy-watch">BUY + WATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {filteredGems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No gems match your filters</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your filter settings to see more candidates.
            </p>
            <Button variant="outline" onClick={() => {
              setSport("all");
              setTemperatureFilter("non-hot");
              setVerdictFilter("buy-watch");
            }} data-testid="button-reset-filters">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Showing {filteredGems.length} potential hidden gem{filteredGems.length !== 1 ? "s" : ""}
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-gems">
            {filteredGems.map((gem) => (
              <GemCard key={`${gem.sport}:${gem.playerName}`} gem={gem} />
            ))}
          </div>
        </>
      )}
      
      <Card className="mt-8 border-dashed" data-testid="card-how-it-works">
        <CardHeader>
          <CardTitle className="text-lg">How Hidden Gem Analysis Works</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-muted-foreground">
            A card being "cheap" relative to talent can mean two things:
          </p>
          <ul className="text-muted-foreground space-y-1">
            <li><strong className="text-foreground">Undervalued Opportunity:</strong> Market is slow to reprice, player is under the radar, or the "setup" hasn't happened yet.</li>
            <li><strong className="text-foreground">Smart Discount:</strong> The market is pricing in risks the casual buyer isn't seeing.</li>
          </ul>
          <p className="text-muted-foreground">
            Our analysis explains <em>why</em> it's cheap, what must happen for repricing, and what could confirm the discount is justified.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
