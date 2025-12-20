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
  thesis: string;
  riskLevel: RiskLevel;
  whyDiscounted: string[];
  repricingCatalysts: string[];
  trapRisks: string[];
}

// Updated for 2024-2025 season
const FOOTBALL_GEMS: GemCandidate[] = [
  {
    playerName: "CJ Stroud",
    sport: "football",
    position: "QB",
    team: "Houston Texans",
    verdict: "BUY",
    modifier: "Momentum",
    temperature: "HOT",
    tier: "PREMIUM",
    thesis: "Rookie of the Year with playoff success. Still room to run before peak pricing.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Prices spiked but haven't reached elite QB tier (Mahomes, Allen) yet.",
      "Small market Houston caps casual collector ceiling compared to NY/LA.",
    ],
    repricingCatalysts: [
      "MVP-caliber sophomore season confirms generational status.",
      "Deep playoff run or Super Bowl appearance.",
    ],
    trapRisks: ["Sophomore slump could stall momentum temporarily."],
  },
  {
    playerName: "Jayden Daniels",
    sport: "football",
    position: "QB",
    team: "Washington Commanders",
    verdict: "BUY",
    modifier: "Momentum",
    temperature: "HOT",
    tier: "GROWTH",
    thesis: "Electric dual-threat with top-2 pick pedigree. Heisman winner turning heads.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Washington dysfunction creates 'will they ruin him?' doubt.",
      "Dual-threat QBs get longevity discount despite modern success stories.",
    ],
    repricingCatalysts: [
      "Playoff berth in year one would cement franchise QB status.",
      "Sustained rushing + passing production builds unique profile.",
    ],
    trapRisks: ["Injury from running style could derail trajectory."],
  },
  {
    playerName: "Bijan Robinson",
    sport: "football",
    position: "RB",
    team: "Atlanta Falcons",
    verdict: "MONITOR",
    modifier: "Value",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    thesis: "Generational RB talent suppressed by position devaluation. Hobby doesn't match ability.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "RB position systematically discounted in modern hobby despite elite talent.",
      "Atlanta hasn't featured him optimally, limiting highlight reel.",
    ],
    repricingCatalysts: [
      "2000-yard season or receiving breakout expands value.",
      "Playoff success as featured weapon changes narrative.",
    ],
    trapRisks: ["RB shelf life concerns amplify if usage stays low."],
  },
  {
    playerName: "Malik Nabers",
    sport: "football",
    position: "WR",
    team: "New York Giants",
    verdict: "MONITOR",
    modifier: "Speculative",
    temperature: "WARM",
    tier: "GROWTH",
    thesis: "Elite talent in massive market. QB situation suppressing true ceiling.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Giants QB carousel limits stat accumulation and highlight plays.",
      "Team dysfunction creates 'wasted talent' fear.",
    ],
    repricingCatalysts: [
      "Competent QB play unlocking 1,400+ yard ceiling.",
      "Pro Bowl or All-Pro selection validates elite status.",
    ],
    trapRisks: ["Giants continue dysfunction, capping career production."],
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
    thesis: "2x MVP still trading below elite tier. Playoff win away from massive repricing.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Playoff struggles (1-4) create persistent 'regular season only' discount.",
      "Running QB longevity concerns despite proven durability.",
    ],
    repricingCatalysts: [
      "Playoff run or Super Bowl appearance reprices cards 30-50%.",
      "Third MVP would cement all-time status.",
    ],
    trapRisks: ["Another early playoff exit cements negative narrative."],
  },
  {
    playerName: "Brock Purdy",
    sport: "football",
    position: "QB",
    team: "San Francisco 49ers",
    verdict: "BUY",
    modifier: "Value",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    thesis: "Elite production ignored due to draft pedigree. Mr. Irrelevant outperforming perception.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Last pick draft status creates permanent 'system QB' skepticism.",
      "Market anchoring to pedigree over actual elite performance.",
    ],
    repricingCatalysts: [
      "Super Bowl win silences all doubters permanently.",
      "Sustained success without elite weapons proves it's him.",
    ],
    trapRisks: ["Injury or weapons departure could expose limitations."],
  },
  {
    playerName: "Aaron Rodgers",
    sport: "football",
    position: "QB",
    team: "New York Jets",
    verdict: "MONITOR",
    modifier: "Long-Term",
    temperature: "COOLING",
    tier: "CORE",
    thesis: "HOF lock at multi-year lows. Legacy cards will reprice post-retirement.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Age and injury tanked market sentiment from prior peaks.",
      "Jets dysfunction creating 'sad ending' narrative.",
    ],
    repricingCatalysts: [
      "Retirement triggers HOF legacy buying cycle.",
      "Any competitive success reminds market of all-time status.",
    ],
    trapRisks: ["Continued decline cements 'what if' rather than 'all-time great'."],
  },
];

const BASKETBALL_GEMS: GemCandidate[] = [
  {
    playerName: "Victor Wembanyama",
    sport: "basketball",
    position: "C",
    team: "San Antonio Spurs",
    verdict: "BUY",
    modifier: "Momentum",
    temperature: "HOT",
    tier: "PREMIUM",
    thesis: "Generational prospect delivering on hype. Still early in long-term appreciation curve.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Prices are high but not yet at Luka/Giannis tier for a comparable prospect.",
      "Small market San Antonio limits casual collector awareness.",
    ],
    repricingCatalysts: [
      "All-Star starter or All-NBA selection in year 2.",
      "Playoff appearance accelerates timeline.",
    ],
    trapRisks: ["Injury to 7'4\" frame could alter trajectory."],
  },
  {
    playerName: "Anthony Edwards",
    sport: "basketball",
    position: "SG",
    team: "Minnesota Timberwolves",
    verdict: "BUY",
    modifier: "Momentum",
    temperature: "HOT",
    tier: "PREMIUM",
    thesis: "Face of next generation. Olympic star power translating to hobby demand.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Small market Minnesota still creates slight discount vs. LA/NY peers.",
      "No championship yet keeps him below absolute elite tier pricing.",
    ],
    repricingCatalysts: [
      "Championship or Finals MVP would unlock Kobe-level trajectory.",
      "Sustained 30+ PPG scoring makes him undeniable.",
    ],
    trapRisks: ["Team construction issues limit playoff success window."],
  },
  {
    playerName: "Tyrese Haliburton",
    sport: "basketball",
    position: "PG",
    team: "Indiana Pacers",
    verdict: "BUY",
    modifier: "Value",
    temperature: "NEUTRAL",
    tier: "GROWTH",
    thesis: "Elite playmaker in smallest market. All-Star production at mid-tier prices.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Indiana market caps national visibility and casual demand.",
      "Playmaking doesn't create viral highlights like scoring.",
    ],
    repricingCatalysts: [
      "All-NBA selection validates superstar tier.",
      "Deep playoff run or Conference Finals appearance.",
    ],
    trapRisks: ["Back injury history could become recurring issue."],
  },
  {
    playerName: "Chet Holmgren",
    sport: "basketball",
    position: "C",
    team: "Oklahoma City Thunder",
    verdict: "MONITOR",
    modifier: "Speculative",
    temperature: "WARM",
    tier: "GROWTH",
    thesis: "Unicorn skillset on elite young team. Injury history creates buying window.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Missed rookie year to injury creates durability concerns.",
      "Thin frame raises questions about long-term NBA physicality.",
    ],
    repricingCatalysts: [
      "Full healthy season silences injury narrative.",
      "Thunder playoff success with him as key contributor.",
    ],
    trapRisks: ["Another significant injury could tank long-term value."],
  },
  {
    playerName: "James Harden",
    sport: "basketball",
    position: "SG",
    team: "Los Angeles Clippers",
    verdict: "MONITOR",
    modifier: "Long-Term",
    temperature: "COOLING",
    tier: "CORE",
    thesis: "Former MVP at career-low prices. HOF legacy underpriced if he ages gracefully.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Team-hopping and playoff struggles created 'quitter' narrative.",
      "Play style (free throw hunting) made him less beloved than peers.",
    ],
    repricingCatalysts: [
      "Championship would dramatically shift legacy narrative.",
      "Retirement triggers HOF legacy buying - MVP, scoring titles.",
    ],
    trapRisks: ["Further decline cements negative legacy perception."],
  },
];

const BASEBALL_GEMS: GemCandidate[] = [
  {
    playerName: "Elly De La Cruz",
    sport: "baseball",
    position: "SS",
    team: "Cincinnati Reds",
    verdict: "BUY",
    modifier: "Momentum",
    temperature: "HOT",
    tier: "GROWTH",
    thesis: "Historic speed + power combo. Most electric player in baseball right now.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Cincinnati market limits mainstream visibility.",
      "Strikeout rate creates boom-bust perception.",
    ],
    repricingCatalysts: [
      "All-Star or Silver Slugger validates elite status.",
      "40-40 season would be historic.",
    ],
    trapRisks: ["High strikeout rate limits consistency narratives."],
  },
  {
    playerName: "Gunnar Henderson",
    sport: "baseball",
    position: "SS",
    team: "Baltimore Orioles",
    verdict: "BUY",
    modifier: "Long-Term",
    temperature: "WARM",
    tier: "PREMIUM",
    thesis: "Generational talent on rising team. MVP trajectory at mid-tier prices.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Baltimore market smaller than NY/LA, limiting casual ceiling.",
      "Not flashy power numbers compared to Ohtani creates perception gap.",
    ],
    repricingCatalysts: [
      "MVP season establishes him as face of franchise.",
      "World Series appearance with star performance.",
    ],
    trapRisks: ["Power development stalls below elite tier."],
  },
  {
    playerName: "Paul Skenes",
    sport: "baseball",
    position: "SP",
    team: "Pittsburgh Pirates",
    verdict: "BUY",
    modifier: "Momentum",
    temperature: "HOT",
    tier: "GROWTH",
    thesis: "Most dominant pitching prospect in years. All-Star as rookie is just the start.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "Pittsburgh market severely limits mainstream demand.",
      "Pitcher cards historically capped vs. position players.",
    ],
    repricingCatalysts: [
      "Cy Young contention in year 2 validates elite trajectory.",
      "Trade to big market team would explode prices.",
    ],
    trapRisks: ["Pitcher injury risk (especially high-velo arms) is real."],
  },
  {
    playerName: "Mookie Betts",
    sport: "baseball",
    position: "OF",
    team: "Los Angeles Dodgers",
    verdict: "BUY",
    modifier: "Value",
    temperature: "COOLING",
    tier: "PREMIUM",
    thesis: "Multi-tool superstar down from peak. World Series champ with HOF trajectory.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Peak hype was 2018-2020 - market normalized from trade excitement.",
      "Ohtani arrival shifted LA market attention away.",
    ],
    repricingCatalysts: [
      "Another MVP season reminds market of elite tier.",
      "HOF trajectory becoming undeniable as stats accumulate.",
    ],
    trapRisks: ["Age-related decline could accelerate."],
  },
  {
    playerName: "Shohei Ohtani",
    sport: "baseball",
    position: "DH",
    team: "Los Angeles Dodgers",
    verdict: "MONITOR",
    modifier: "Momentum",
    temperature: "HOT",
    tier: "PREMIUM",
    thesis: "Historic talent but prices already reflect uniqueness. Buy dips, not peaks.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Not truly discounted - prices are high, but may not be peak yet.",
      "Post-surgery (no pitching 2024) creates temporary value opportunity.",
    ],
    repricingCatalysts: [
      "Return to two-way play in 2025 reignites hype.",
      "World Series championship in LA market.",
    ],
    trapRisks: ["Prices may already reflect historical status - ceiling unclear."],
  },
];

const HOCKEY_GEMS: GemCandidate[] = [
  {
    playerName: "Connor Bedard",
    sport: "hockey",
    position: "C",
    team: "Chicago Blackhawks",
    verdict: "BUY",
    modifier: "Momentum",
    temperature: "HOT",
    tier: "PREMIUM",
    thesis: "Generational prospect in historic market. McDavid comparisons are warranted.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Chicago rebuild means team success is years away.",
      "Hockey cards less mainstream than other sports limits casual demand.",
    ],
    repricingCatalysts: [
      "100-point season as young player validates hype.",
      "Blackhawks becoming competitive sooner than expected.",
    ],
    trapRisks: ["Slow team rebuild could frustrate collectors."],
  },
  {
    playerName: "Macklin Celebrini",
    sport: "hockey",
    position: "C",
    team: "San Jose Sharks",
    verdict: "MONITOR",
    modifier: "Speculative",
    temperature: "WARM",
    tier: "GROWTH",
    thesis: "Next generational prospect after Bedard. San Jose tank paid off.",
    riskLevel: "MEDIUM",
    whyDiscounted: [
      "San Jose market and rebuild timeline limit near-term upside.",
      "Hasn't played NHL games yet - all projection-based.",
    ],
    repricingCatalysts: [
      "Calder Trophy (Rookie of Year) would validate elite status.",
      "Point-per-game or better rookie season.",
    ],
    trapRisks: ["NHL transition proves harder than expected."],
  },
  {
    playerName: "Connor McDavid",
    sport: "hockey",
    position: "C",
    team: "Edmonton Oilers",
    verdict: "BUY",
    modifier: "Value",
    temperature: "WARM",
    tier: "PREMIUM",
    thesis: "Best player in hockey, prices don't fully reflect all-time trajectory.",
    riskLevel: "LOW",
    whyDiscounted: [
      "Canadian/small market limits mainstream US collector base.",
      "No Stanley Cup yet creates 'individual stats' discount.",
    ],
    repricingCatalysts: [
      "Stanley Cup championship unlocks Gretzky-tier legacy pricing.",
      "Breaking major scoring records.",
    ],
    trapRisks: ["Continued playoff frustration could cap ceiling."],
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
    case "BUY": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "MONITOR": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "AVOID": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    default: return "";
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
    case "HOT": return "text-red-600 dark:text-red-400";
    case "WARM": return "text-orange-600 dark:text-orange-400";
    case "NEUTRAL": return "text-gray-600 dark:text-gray-400";
    case "COOLING": return "text-blue-600 dark:text-blue-400";
    default: return "";
  }
}

function getTierIcon(tier: StockTier) {
  switch (tier) {
    case "PREMIUM": return <Crown className="h-3 w-3" />;
    case "CORE": return <Target className="h-3 w-3" />;
    case "GROWTH": return <TrendingUp className="h-3 w-3" />;
    case "SPECULATIVE": return <Zap className="h-3 w-3" />;
    default: return <Layers className="h-3 w-3" />;
  }
}

function getTierColor(tier: StockTier) {
  switch (tier) {
    case "PREMIUM": return "text-purple-600 dark:text-purple-400";
    case "CORE": return "text-blue-600 dark:text-blue-400";
    case "GROWTH": return "text-emerald-600 dark:text-emerald-400";
    case "SPECULATIVE": return "text-amber-600 dark:text-amber-400";
    default: return "text-gray-600 dark:text-gray-400";
  }
}

function getRiskColor(risk: RiskLevel) {
  switch (risk) {
    case "LOW": return "text-emerald-600 dark:text-emerald-400";
    case "MEDIUM": return "text-amber-600 dark:text-amber-400";
    case "HIGH": return "text-red-600 dark:text-red-400";
    default: return "";
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
    <Card className="h-full flex flex-col" data-testid={`card-gem-${gem.playerName.replace(/\s+/g, '-').toLowerCase()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg">{gem.playerName}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <span className="capitalize">{gem.sport}</span>
              {gem.position && <span>- {gem.position}</span>}
              {gem.team && <span className="text-xs">({gem.team})</span>}
            </CardDescription>
          </div>
          <Badge className={`${getVerdictColor(gem.verdict)} flex items-center gap-1`}>
            {getVerdictIcon(gem.verdict)}
            {gem.verdict}
          </Badge>
        </div>
        
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
      
      <CardContent className="space-y-4 flex-1 flex flex-col">
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
        
        <div className="mt-auto pt-4">
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/player-outlook?player=${encodeURIComponent(gem.playerName)}&sport=${gem.sport}`}>
              View Full Analysis
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HiddenGemsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [sport, setSport] = useState("all");
  const [temperatureFilter, setTemperatureFilter] = useState("all");
  const [verdictFilter, setVerdictFilter] = useState("buy-watch");
  
  const allGems = [...FOOTBALL_GEMS, ...BASKETBALL_GEMS, ...BASEBALL_GEMS, ...HOCKEY_GEMS];
  
  const filteredGems = allGems.filter(gem => {
    if (sport !== "all" && gem.sport !== sport) return false;
    
    if (temperatureFilter === "non-hot" && gem.temperature === "HOT") return false;
    if (temperatureFilter === "cooling-only" && gem.temperature !== "COOLING") return false;
    if (temperatureFilter === "hot-only" && gem.temperature !== "HOT") return false;
    
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
          they're discounted, what would trigger repricing, and what trap risks to watch for.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Updated for 2024-2025 season. Last refresh: December 2024.
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
                  <SelectItem value="hockey">Hockey</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="temperature-filter">Temperature</Label>
              <Select value={temperatureFilter} onValueChange={setTemperatureFilter}>
                <SelectTrigger id="temperature-filter" data-testid="select-temperature">
                  <SelectValue placeholder="All Temperatures" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Temperatures</SelectItem>
                  <SelectItem value="hot-only">HOT Only (Momentum Plays)</SelectItem>
                  <SelectItem value="non-hot">Exclude HOT (Value Plays)</SelectItem>
                  <SelectItem value="cooling-only">COOLING Only (Legacy Plays)</SelectItem>
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
                  <SelectItem value="buy-watch">BUY + MONITOR</SelectItem>
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
              setTemperatureFilter("all");
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
            Showing {filteredGems.length} potential hidden gem{filteredGems.length !== 1 ? "s" : ""} across {new Set(filteredGems.map(g => g.sport)).size} sport{new Set(filteredGems.map(g => g.sport)).size !== 1 ? "s" : ""}
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-gems">
            {filteredGems.map((gem) => (
              <GemCard key={`${gem.sport}-${gem.playerName}`} gem={gem} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
