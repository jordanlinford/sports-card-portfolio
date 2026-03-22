import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Lock, 
  Crown, 
  Loader2, 
  Info,
  ShieldCheck,
  ShieldAlert,
  Target,
  BarChart3
} from "lucide-react";
import { hasProAccess, type User } from "@shared/schema";

interface SlotAnalysis {
  team: string;
  estimatedValue: number;
  keyPlayers: string[];
  outlook: string;
  verdict: "GREAT_VALUE" | "FAIR" | "OVERPRICED" | "RISKY";
}

interface BreakAuditResult {
  product: string;
  pricePerSlot: number;
  totalSlots: number;
  sport: string;
  overallVerdict: "BUY" | "PASS" | "SELECTIVE";
  overallEV: number;
  evRatio: number;
  summary: string;
  slotAnalyses: SlotAnalysis[];
  topPicks: string[];
  avoidSlots: string[];
  marketContext: string;
}

const SPORTS = [
  { value: "football", label: "Football (NFL)" },
  { value: "basketball", label: "Basketball (NBA)" },
  { value: "baseball", label: "Baseball (MLB)" },
  { value: "hockey", label: "Hockey (NHL)" },
  { value: "soccer", label: "Soccer" },
];

const POPULAR_PRODUCTS: Record<string, string[]> = {
  football: [
    "2024 Panini Prizm",
    "2024 Panini Donruss Optic",
    "2024 Panini Contenders",
    "2024 Panini National Treasures",
    "2024 Panini Select",
    "2024 Panini Mosaic",
    "2024 Panini Immaculate",
    "2024 Panini Flawless",
  ],
  basketball: [
    "2024-25 Panini Prizm",
    "2024-25 Panini Donruss Optic",
    "2024-25 Panini Select",
    "2024-25 Panini Contenders",
    "2024-25 Panini National Treasures",
    "2024-25 Panini Mosaic",
    "2024-25 Panini Immaculate",
  ],
  baseball: [
    "2024 Topps Chrome",
    "2024 Topps Bowman Chrome",
    "2024 Panini Prizm",
    "2024 Topps Series 1",
    "2024 Topps Series 2",
    "2024 Topps Sterling",
    "2024 Topps Inception",
  ],
  hockey: [
    "2024-25 Upper Deck Series 1",
    "2024-25 Upper Deck Series 2",
    "2024-25 Upper Deck Young Guns",
    "2024-25 Upper Deck Artifacts",
  ],
  soccer: [
    "2024 Topps Chrome UCL",
    "2024 Panini Prizm World Cup",
    "2024 Topps Merlin",
    "2024 Panini Select",
  ],
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { color: string; icon: typeof TrendingUp }> = {
    GREAT_VALUE: { color: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30", icon: TrendingUp },
    FAIR: { color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30", icon: Target },
    OVERPRICED: { color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", icon: TrendingDown },
    RISKY: { color: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30", icon: AlertTriangle },
    BUY: { color: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30", icon: ShieldCheck },
    PASS: { color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", icon: ShieldAlert },
    SELECTIVE: { color: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30", icon: Target },
  };
  
  const c = config[verdict] || config.FAIR;
  const Icon = c.icon;
  
  return (
    <Badge variant="outline" className={`${c.color} border gap-1`}>
      <Icon className="h-3 w-3" />
      {verdict.replace("_", " ")}
    </Badge>
  );
}

export default function BreakAuditorPage() {
  const { isAuthenticated } = useAuth();
  const [sport, setSport] = useState("");
  const [product, setProduct] = useState("");
  const [customProduct, setCustomProduct] = useState("");
  const [pricePerSlot, setPricePerSlot] = useState("");
  const [totalSlots, setTotalSlots] = useState("");
  const [teams, setTeams] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<BreakAuditResult | null>(null);
  const [error, setError] = useState("");

  const { data: userData } = useQuery<User>({
    queryKey: ["/api/user"],
    enabled: isAuthenticated,
  });

  const isPro = userData ? hasProAccess(userData) : false;

  const handleAnalyze = async () => {
    const selectedProduct = product === "custom" ? customProduct : product;
    if (!sport || !selectedProduct || !pricePerSlot || !totalSlots) {
      setError("Please fill in all required fields");
      return;
    }

    setError("");
    setIsAnalyzing(true);
    setResult(null);

    try {
      const response = await apiRequest("POST", "/api/market/break-audit", {
        sport,
        product: selectedProduct,
        pricePerSlot: parseFloat(pricePerSlot),
        totalSlots: parseInt(totalSlots),
        teams: teams ? teams.split(",").map(t => t.trim()).filter(Boolean) : [],
      });
      
      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to analyze break. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Package className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Break Value Auditor</h1>
        </div>
        <p className="text-muted-foreground text-lg" data-testid="text-page-description">
          Should you join that box break? Analyze the expected value of any break before you buy in.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card data-testid="card-break-input">
            <CardHeader>
              <CardTitle className="text-lg">Break Details</CardTitle>
              <CardDescription>Enter the break you're considering joining</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sport">Sport *</Label>
                <Select value={sport} onValueChange={(v) => { setSport(v); setProduct(""); }}>
                  <SelectTrigger id="sport" data-testid="select-sport">
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORTS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product">Product *</Label>
                <Select value={product} onValueChange={setProduct}>
                  <SelectTrigger id="product" data-testid="select-product">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {sport && POPULAR_PRODUCTS[sport]?.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                    <SelectItem value="custom">Other (type below)</SelectItem>
                  </SelectContent>
                </Select>
                {product === "custom" && (
                  <Input
                    placeholder="e.g. 2024 Panini Prizm Football Hobby"
                    value={customProduct}
                    onChange={(e) => setCustomProduct(e.target.value)}
                    data-testid="input-custom-product"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price Per Slot ($) *</Label>
                <Input
                  id="price"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="e.g. 25.00"
                  value={pricePerSlot}
                  onChange={(e) => setPricePerSlot(e.target.value)}
                  data-testid="input-price"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slots">Total Slots *</Label>
                <Input
                  id="slots"
                  type="number"
                  min="2"
                  max="32"
                  placeholder="e.g. 12"
                  value={totalSlots}
                  onChange={(e) => setTotalSlots(e.target.value)}
                  data-testid="input-slots"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="teams">Available Teams/Slots (optional)</Label>
                <Input
                  id="teams"
                  placeholder="e.g. Chiefs, Eagles, Bills"
                  value={teams}
                  onChange={(e) => setTeams(e.target.value)}
                  data-testid="input-teams"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of teams still available
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-500" data-testid="text-error">{error}</p>
              )}

              {!isAuthenticated ? (
                <div className="p-3 bg-muted rounded-lg text-center space-y-2">
                  <Lock className="h-5 w-5 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Sign in to analyze breaks</p>
                  <Button size="sm" asChild>
                    <a href="/api/login">Sign In</a>
                  </Button>
                </div>
              ) : !isPro ? (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !sport || !pricePerSlot || !totalSlots || !(product || customProduct)}
                    data-testid="button-analyze"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Preview Analysis
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Free users get a summary. Upgrade for full slot-by-slot analysis.
                  </p>
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !sport || !pricePerSlot || !totalSlots || !(product || customProduct)}
                  data-testid="button-analyze"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Analyze Break
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>This tool estimates expected value based on current card market data and player outlooks.</p>
                  <p>Actual break results vary. This is a guide, not a guarantee.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {!result && !isAnalyzing && (
            <Card className="h-full flex items-center justify-center min-h-[400px]" data-testid="card-empty-state">
              <CardContent className="text-center py-12">
                <Package className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Ready to Audit a Break</h3>
                <p className="text-muted-foreground max-w-md">
                  Enter the break details on the left and we'll analyze the expected value of each slot based on current market data.
                </p>
              </CardContent>
            </Card>
          )}

          {isAnalyzing && (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center py-12">
                <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
                <h3 className="text-xl font-semibold mb-2">Analyzing Break Value...</h3>
                <p className="text-muted-foreground">
                  Evaluating card values, player outlooks, and market conditions
                </p>
              </CardContent>
            </Card>
          )}

          {result && (
            <div className="space-y-4" data-testid="card-results">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl" data-testid="text-product-name">{result.product}</CardTitle>
                      <CardDescription>{result.totalSlots} slots at ${result.pricePerSlot.toFixed(2)} each</CardDescription>
                    </div>
                    <VerdictBadge verdict={result.overallVerdict} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <DollarSign className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-2xl font-bold" data-testid="text-ev">${result.overallEV.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Avg EV / Slot</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <DollarSign className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-2xl font-bold">${result.pricePerSlot.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Cost / Slot</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <BarChart3 className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                      <p className={`text-2xl font-bold ${result.evRatio >= 1 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-ev-ratio">
                        {result.evRatio.toFixed(2)}x
                      </p>
                      <p className="text-xs text-muted-foreground">EV Ratio</p>
                    </div>
                  </div>

                  <p className="text-sm mb-4" data-testid="text-summary">{result.summary}</p>

                  {result.topPicks.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">Best Slots:</p>
                      <p className="text-sm text-muted-foreground">{result.topPicks.join(", ")}</p>
                    </div>
                  )}

                  {result.avoidSlots.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Avoid:</p>
                      <p className="text-sm text-muted-foreground">{result.avoidSlots.join(", ")}</p>
                    </div>
                  )}

                  {result.marketContext && (
                    <p className="text-xs text-muted-foreground italic mt-2">{result.marketContext}</p>
                  )}
                </CardContent>
              </Card>

              {isPro ? (
                result.slotAnalyses.length > 0 && (
                  <Card data-testid="card-slot-details">
                    <CardHeader>
                      <CardTitle className="text-lg">Slot-by-Slot Analysis</CardTitle>
                      <CardDescription>Detailed expected value for each team/slot</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {result.slotAnalyses.map((slot, i) => (
                          <div key={i} className="flex items-start justify-between p-3 border rounded-lg" data-testid={`slot-analysis-${i}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{slot.team}</span>
                                <VerdictBadge verdict={slot.verdict} />
                              </div>
                              <p className="text-sm text-muted-foreground mb-1">{slot.outlook}</p>
                              {slot.keyPlayers.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Key: {slot.keyPlayers.join(", ")}
                                </p>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <p className={`text-lg font-bold ${slot.estimatedValue >= parseFloat(pricePerSlot) ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                ${slot.estimatedValue.toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground">est. value</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              ) : (
                <Card className="relative overflow-hidden" data-testid="card-pro-gate">
                  <div className="absolute inset-0 backdrop-blur-sm bg-background/60 z-10 flex items-center justify-center">
                    <div className="text-center p-6">
                      <Crown className="h-8 w-8 mx-auto mb-3 text-yellow-500" />
                      <h3 className="text-lg font-semibold mb-2">Slot-by-Slot Analysis</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Upgrade to Pro to see detailed value estimates for every team/slot
                      </p>
                      <Button asChild>
                        <Link href="/upgrade">
                          Upgrade to Pro
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg">Slot-by-Slot Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-start justify-between p-3 border rounded-lg opacity-30">
                          <div className="flex-1">
                            <div className="h-4 bg-muted rounded w-24 mb-2" />
                            <div className="h-3 bg-muted rounded w-48 mb-1" />
                            <div className="h-3 bg-muted rounded w-32" />
                          </div>
                          <div className="text-right ml-4">
                            <div className="h-5 bg-muted rounded w-16 mb-1" />
                            <div className="h-3 bg-muted rounded w-12" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
