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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  BarChart3,
  Star,
  Award,
  Scale,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  Trophy,
} from "lucide-react";
import { hasProAccess, type User } from "@shared/schema";

interface HitBreakdownItem {
  cardType: string;
  odds: string;
  isCaseHit?: boolean;
  estimatedRawValue: number;
  estimatedRawMin: number;
  estimatedRawMax: number;
  estimatedGradedValue: number;
  estimatedGradedMin: number;
  estimatedGradedMax: number;
  gradingRecommendation: "GRADE_IT" | "SELL_RAW" | "HOLD";
  gradingRationale: string;
  playerExample: string;
  exampleImageUrl?: string;
}

interface StarRookie {
  playerName: string;
  position: string;
  team: string;
  currentRawValue: number;
  currentGradedValue: number;
  outlook: string;
}

interface SealedProductResult {
  productName: string;
  sport: string;
  productImageUrl?: string;
  boxCost: number;
  configuration: string;
  releaseDate: string;
  releaseRecency: "new_release" | "established";
  volatilityNote: string;
  keyRookieClass: string;
  hitBreakdown: HitBreakdownItem[];
  starRookies: StarRookie[];
  expectedValue: number;
  evRatio: number;
  roiVerdict: "POSITIVE_EV" | "NEGATIVE_EV" | "BREAK_EVEN" | "SPECULATIVE" | "WAIT";
  verdictExplanation: string;
  qualityScore: number;
  qualityBreakdown: {
    costEfficiency: number;
    hitCeiling: number;
    rookieClassDepth: number;
    gradability: number;
  };
  marketContext: string;
  caseHitCeilingEV?: number;
}

interface ComparisonResult {
  productA: SealedProductResult & { computedQualityScore: number; maxHitValue: number; rookieCount: number; gradableHits: number };
  productB: SealedProductResult & { computedQualityScore: number; maxHitValue: number; rookieCount: number; gradableHits: number };
  winner: "A" | "B" | "TIE";
  recommendation: string;
}

const SPORTS = [
  { value: "football", label: "Football (NFL)" },
  { value: "basketball", label: "Basketball (NBA)" },
  { value: "baseball", label: "Baseball (MLB)" },
  { value: "hockey", label: "Hockey (NHL)" },
  { value: "soccer", label: "Soccer / Football" },
];

const BOX_TYPES = [
  { value: "all", label: "All Types" },
  { value: "hobby", label: "Hobby" },
  { value: "retail", label: "Retail / Blaster / Mega" },
];

const SEALED_PRODUCTS: Record<string, Array<{ name: string; msrp: number; type: string }>> = {
  football: [
    { name: "2025 Panini Prizm Football Hobby", msrp: 450, type: "hobby" },
    { name: "2025 Panini Select Football Hobby", msrp: 400, type: "hobby" },
    { name: "2025 Panini Donruss Optic Football Hobby", msrp: 300, type: "hobby" },
    { name: "2025 Panini Contenders Football Hobby", msrp: 350, type: "hobby" },
    { name: "2025 Panini Mosaic Football Hobby", msrp: 250, type: "hobby" },
    { name: "2025 Panini National Treasures Football Hobby", msrp: 850, type: "hobby" },
    { name: "2025 Panini Immaculate Football Hobby", msrp: 700, type: "hobby" },
    { name: "2025 Panini Prizm Football Blaster", msrp: 40, type: "retail" },
    { name: "2025 Panini Prizm Football Mega Box", msrp: 80, type: "retail" },
    { name: "2025 Panini Prizm Football Retail Hanger", msrp: 15, type: "retail" },
    { name: "2025 Panini Prizm Football Cello/Fat Pack", msrp: 10, type: "retail" },
    { name: "2025 Panini Select Football Blaster", msrp: 35, type: "retail" },
    { name: "2025 Panini Select Football Mega Box", msrp: 70, type: "retail" },
    { name: "2025 Panini Donruss Football Blaster", msrp: 30, type: "retail" },
    { name: "2025 Panini Donruss Football Mega Box", msrp: 55, type: "retail" },
    { name: "2025 Panini Mosaic Football Blaster", msrp: 35, type: "retail" },
    { name: "2025 Panini Mosaic Football Mega Box", msrp: 65, type: "retail" },
    { name: "2024 Panini Prizm Football Hobby", msrp: 400, type: "hobby" },
    { name: "2024 Panini Select Football Hobby", msrp: 375, type: "hobby" },
    { name: "2024 Panini Donruss Optic Football Hobby", msrp: 275, type: "hobby" },
    { name: "2024 Panini Contenders Football Hobby", msrp: 325, type: "hobby" },
    { name: "2024 Panini National Treasures Football Hobby", msrp: 800, type: "hobby" },
    { name: "2024 Panini Flawless Football Hobby", msrp: 3500, type: "hobby" },
    { name: "2024 Panini Prizm Football Blaster", msrp: 35, type: "retail" },
    { name: "2024 Panini Prizm Football Mega Box", msrp: 75, type: "retail" },
    { name: "2024 Panini Select Football Blaster", msrp: 30, type: "retail" },
  ],
  basketball: [
    { name: "2025-26 Panini Prizm Basketball Hobby", msrp: 500, type: "hobby" },
    { name: "2025-26 Panini Select Basketball Hobby", msrp: 450, type: "hobby" },
    { name: "2025-26 Panini Donruss Optic Basketball Hobby", msrp: 350, type: "hobby" },
    { name: "2025-26 Panini Contenders Basketball Hobby", msrp: 400, type: "hobby" },
    { name: "2025-26 Panini National Treasures Basketball Hobby", msrp: 900, type: "hobby" },
    { name: "2025-26 Panini Mosaic Basketball Hobby", msrp: 300, type: "hobby" },
    { name: "2025-26 Panini Prizm Basketball Blaster", msrp: 40, type: "retail" },
    { name: "2025-26 Panini Prizm Basketball Mega Box", msrp: 80, type: "retail" },
    { name: "2025-26 Panini Prizm Basketball Retail Hanger", msrp: 15, type: "retail" },
    { name: "2025-26 Panini Select Basketball Blaster", msrp: 35, type: "retail" },
    { name: "2025-26 Panini Select Basketball Mega Box", msrp: 70, type: "retail" },
    { name: "2025-26 Panini Donruss Basketball Blaster", msrp: 30, type: "retail" },
    { name: "2025-26 Panini Mosaic Basketball Blaster", msrp: 35, type: "retail" },
    { name: "2024-25 Panini Prizm Basketball Hobby", msrp: 450, type: "hobby" },
    { name: "2024-25 Panini Select Basketball Hobby", msrp: 400, type: "hobby" },
    { name: "2024-25 Panini Donruss Optic Basketball Hobby", msrp: 300, type: "hobby" },
    { name: "2024-25 Panini Contenders Basketball Hobby", msrp: 375, type: "hobby" },
    { name: "2024-25 Panini National Treasures Basketball Hobby", msrp: 850, type: "hobby" },
    { name: "2024-25 Panini Immaculate Basketball Hobby", msrp: 750, type: "hobby" },
    { name: "2024-25 Panini Prizm Basketball Blaster", msrp: 35, type: "retail" },
    { name: "2024-25 Panini Prizm Basketball Mega Box", msrp: 75, type: "retail" },
  ],
  baseball: [
    { name: "2025 Topps Chrome Baseball Hobby", msrp: 300, type: "hobby" },
    { name: "2025 Topps Series 1 Baseball Hobby", msrp: 200, type: "hobby" },
    { name: "2025 Topps Series 2 Baseball Hobby", msrp: 200, type: "hobby" },
    { name: "2025 Bowman Chrome Baseball Hobby", msrp: 350, type: "hobby" },
    { name: "2025 Topps Sterling Baseball Hobby", msrp: 500, type: "hobby" },
    { name: "2025 Topps Inception Baseball Hobby", msrp: 250, type: "hobby" },
    { name: "2025 Panini Prizm Baseball Hobby", msrp: 300, type: "hobby" },
    { name: "2025 Topps Series 1 Baseball Blaster", msrp: 30, type: "retail" },
    { name: "2025 Topps Series 1 Baseball Mega Box", msrp: 50, type: "retail" },
    { name: "2025 Topps Series 1 Baseball Hanger", msrp: 12, type: "retail" },
    { name: "2025 Topps Chrome Baseball Blaster", msrp: 40, type: "retail" },
    { name: "2025 Topps Chrome Baseball Mega Box", msrp: 70, type: "retail" },
    { name: "2025 Bowman Baseball Blaster", msrp: 35, type: "retail" },
    { name: "2025 Bowman Baseball Mega Box", msrp: 60, type: "retail" },
    { name: "2024 Topps Chrome Baseball Hobby", msrp: 275, type: "hobby" },
    { name: "2024 Bowman Chrome Baseball Hobby", msrp: 325, type: "hobby" },
    { name: "2024 Topps Series 1 Baseball Hobby", msrp: 175, type: "hobby" },
    { name: "2024 Topps Series 2 Baseball Hobby", msrp: 175, type: "hobby" },
    { name: "2024 Topps Sterling Baseball Hobby", msrp: 450, type: "hobby" },
    { name: "2024 Panini Prizm Baseball Hobby", msrp: 275, type: "hobby" },
    { name: "2024 Topps Chrome Baseball Blaster", msrp: 35, type: "retail" },
    { name: "2024 Topps Series 1 Baseball Blaster", msrp: 25, type: "retail" },
  ],
  hockey: [
    { name: "2025-26 Upper Deck Series 1 Hockey Hobby", msrp: 200, type: "hobby" },
    { name: "2025-26 Upper Deck Series 2 Hockey Hobby", msrp: 200, type: "hobby" },
    { name: "2025-26 Upper Deck Artifacts Hockey Hobby", msrp: 250, type: "hobby" },
    { name: "2025-26 Upper Deck SP Authentic Hockey Hobby", msrp: 350, type: "hobby" },
    { name: "2025-26 Upper Deck Series 1 Hockey Blaster", msrp: 30, type: "retail" },
    { name: "2025-26 Upper Deck Series 1 Hockey Mega Box", msrp: 55, type: "retail" },
    { name: "2025-26 Upper Deck Series 1 Hockey Retail Tin", msrp: 25, type: "retail" },
    { name: "2024-25 Upper Deck Series 1 Hockey Hobby", msrp: 175, type: "hobby" },
    { name: "2024-25 Upper Deck Series 2 Hockey Hobby", msrp: 175, type: "hobby" },
    { name: "2024-25 Upper Deck Artifacts Hockey Hobby", msrp: 225, type: "hobby" },
    { name: "2024-25 Upper Deck SP Authentic Hockey Hobby", msrp: 325, type: "hobby" },
    { name: "2024-25 Upper Deck The Cup Hockey Hobby", msrp: 750, type: "hobby" },
    { name: "2024-25 Upper Deck Series 1 Hockey Blaster", msrp: 25, type: "retail" },
    { name: "2024-25 Upper Deck Series 2 Hockey Blaster", msrp: 25, type: "retail" },
  ],
  soccer: [
    { name: "2025 Panini Prizm FIFA Club World Cup Soccer Hobby", msrp: 350, type: "hobby" },
    { name: "2025 Topps Chrome UEFA Champions League Soccer Hobby", msrp: 300, type: "hobby" },
    { name: "2025 Panini Select FIFA Soccer Hobby", msrp: 400, type: "hobby" },
    { name: "2025 Topps Merlin Heritage Soccer Hobby", msrp: 250, type: "hobby" },
    { name: "2025 Panini Prizm FIFA Club World Cup Soccer Blaster", msrp: 35, type: "retail" },
    { name: "2025 Panini Prizm FIFA Club World Cup Soccer Mega Box", msrp: 65, type: "retail" },
    { name: "2024-25 Topps Chrome UEFA Champions League Soccer Hobby", msrp: 275, type: "hobby" },
    { name: "2024 Panini Prizm World Cup Soccer Hobby", msrp: 350, type: "hobby" },
    { name: "2024 Panini Prizm Premier League Soccer Hobby", msrp: 300, type: "hobby" },
    { name: "2024 Panini Prizm Premier League Soccer Blaster", msrp: 30, type: "retail" },
  ],
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { color: string; icon: typeof TrendingUp; label: string }> = {
    POSITIVE_EV: { color: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30", icon: CheckCircle2, label: "Positive EV" },
    NEGATIVE_EV: { color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", icon: XCircle, label: "Negative EV" },
    SPECULATIVE: { color: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30", icon: AlertTriangle, label: "Speculative" },
    BREAK_EVEN: { color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30", icon: Scale, label: "Break Even" },
    WAIT: { color: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30", icon: Pause, label: "Wait" },
  };

  const c = config[verdict] || config.BREAK_EVEN;
  const Icon = c.icon;

  return (
    <Badge variant="outline" className={`${c.color} border gap-1`} data-testid={`badge-verdict-${verdict}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function GradingBadge({ recommendation }: { recommendation: string }) {
  const config: Record<string, { color: string; label: string }> = {
    GRADE_IT: { color: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30", label: "Grade It" },
    SELL_RAW: { color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30", label: "Sell Raw" },
    HOLD: { color: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30", label: "Hold" },
  };

  const c = config[recommendation] || config.HOLD;

  return (
    <Badge variant="outline" className={`${c.color} border text-xs`}>
      {c.label}
    </Badge>
  );
}

function QualityBar({ label, value, maxValue = 100 }: { label: string; value: number; maxValue?: number }) {
  const pct = Math.min((value / maxValue) * 100, 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SealedRoiPage() {
  const { isAuthenticated } = useAuth();
  const [sport, setSport] = useState("");
  const [boxType, setBoxType] = useState("all");
  const [product, setProduct] = useState("");
  const [customProduct, setCustomProduct] = useState("");
  const [boxCost, setBoxCost] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<SealedProductResult | null>(null);
  const [error, setError] = useState("");

  const [compareMode, setCompareMode] = useState(false);
  const [sportB, setSportB] = useState("");
  const [boxTypeB, setBoxTypeB] = useState("all");
  const [productB, setProductB] = useState("");
  const [customProductB, setCustomProductB] = useState("");
  const [boxCostB, setBoxCostB] = useState("");
  const [isComparing, setIsComparing] = useState(false);
  const [resultB, setResultB] = useState<SealedProductResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

  const { data: userData } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });

  const isPro = userData ? hasProAccess(userData) : false;

  const selectedProduct = product === "custom" ? customProduct : product;
  const selectedMsrp = product !== "custom" && sport
    ? SEALED_PRODUCTS[sport]?.find(p => p.name === product)?.msrp
    : undefined;

  const selectedProductB = productB === "custom" ? customProductB : productB;

  const handleAnalyze = async () => {
    if (!sport || !selectedProduct) {
      setError("Please select a sport and product");
      return;
    }

    setError("");
    setIsAnalyzing(true);
    setResult(null);

    try {
      const data = await apiRequest("POST", "/api/market/sealed-product-roi", {
        sport,
        product: selectedProduct,
        boxCost: boxCost ? parseFloat(boxCost) : (selectedMsrp || undefined),
      });
      setResult(data as SealedProductResult);
    } catch (err: any) {
      setError(err.message || "Failed to analyze product. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCompare = async () => {
    const prodA = selectedProduct;
    const prodB = selectedProductB;
    if (!sport || !prodA || !sportB || !prodB) {
      setError("Please select both products for comparison");
      return;
    }

    setError("");
    setIsComparing(true);
    setComparisonResult(null);

    try {
      const msrpA = product !== "custom" ? SEALED_PRODUCTS[sport]?.find(p => p.name === product)?.msrp : undefined;
      const msrpB = productB !== "custom" ? SEALED_PRODUCTS[sportB]?.find(p => p.name === productB)?.msrp : undefined;

      const effectiveBoxCostA = boxCost ? parseFloat(boxCost) : (msrpA || 0);
      const canReuseResultA = result
        && result.productName === prodA
        && result.sport?.toLowerCase() === sport.toLowerCase()
        && (!effectiveBoxCostA || Math.abs((result.boxCost || 0) - effectiveBoxCostA) < 1);

      const [dataA, dataB] = await Promise.all([
        canReuseResultA ? result : apiRequest("POST", "/api/market/sealed-product-roi", {
          sport,
          product: prodA,
          boxCost: boxCost ? parseFloat(boxCost) : (msrpA || undefined),
        }),
        apiRequest("POST", "/api/market/sealed-product-roi", {
          sport: sportB,
          product: prodB,
          boxCost: boxCostB ? parseFloat(boxCostB) : (msrpB || undefined),
        }),
      ]) as [SealedProductResult, SealedProductResult];

      setResult(dataA);
      setResultB(dataB);

      const comparison = await apiRequest("POST", "/api/market/sealed-product-compare", {
        productA: dataA,
        productB: dataB,
      });

      setComparisonResult(comparison as ComparisonResult);
    } catch (err: any) {
      setError(err.message || "Failed to compare products. Please try again.");
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Package className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Sealed Product ROI</h1>
        </div>
        <p className="text-muted-foreground text-lg" data-testid="text-page-description">
          Should you buy that hobby box? Analyze the expected value, hit odds, and grading potential of any sealed product.
        </p>
      </div>

      <Tabs defaultValue="analyze" className="space-y-6">
        <TabsList data-testid="tabs-mode">
          <TabsTrigger value="analyze" data-testid="tab-analyze" onClick={() => setCompareMode(false)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Analyze Product
          </TabsTrigger>
          <TabsTrigger value="compare" data-testid="tab-compare" onClick={() => setCompareMode(true)}>
            <Scale className="h-4 w-4 mr-2" />
            Head-to-Head
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analyze">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card data-testid="card-product-input">
                <CardHeader>
                  <CardTitle className="text-lg">Product Details</CardTitle>
                  <CardDescription>Select a sealed product to analyze</CardDescription>
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
                    <Label>Box Type</Label>
                    <Select value={boxType} onValueChange={(v) => { setBoxType(v); setProduct(""); }}>
                      <SelectTrigger data-testid="select-box-type">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        {BOX_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product">Product *</Label>
                    <Select value={product} onValueChange={(v) => {
                      setProduct(v);
                      if (v !== "custom") {
                        const p = SEALED_PRODUCTS[sport]?.find(pr => pr.name === v);
                        if (p) setBoxCost(p.msrp.toString());
                      }
                    }}>
                      <SelectTrigger id="product" data-testid="select-product">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {sport && SEALED_PRODUCTS[sport]
                          ?.filter(p => boxType === "all" || p.type === boxType)
                          .map(p => (
                            <SelectItem key={p.name} value={p.name}>
                              {p.name} (~${p.msrp})
                            </SelectItem>
                          ))}
                        <SelectItem value="custom">Other (custom entry)</SelectItem>
                      </SelectContent>
                    </Select>
                    {product === "custom" && (
                      <Input
                        placeholder="e.g. 2025 Panini Prizm Football Blaster"
                        value={customProduct}
                        onChange={(e) => setCustomProduct(e.target.value)}
                        data-testid="input-custom-product"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="boxCost">Box Cost ($) {selectedMsrp ? "(pre-filled from MSRP)" : "(optional)"}</Label>
                    <Input
                      id="boxCost"
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="e.g. 450.00"
                      value={boxCost}
                      onChange={(e) => setBoxCost(e.target.value)}
                      data-testid="input-box-cost"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use current market price research
                    </p>
                  </div>

                  {error && (
                    <p className="text-sm text-red-500" data-testid="text-error">{error}</p>
                  )}

                  {!isAuthenticated ? (
                    <div className="p-3 bg-muted rounded-lg text-center space-y-2">
                      <Lock className="h-5 w-5 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Sign in to analyze products</p>
                      <Button size="sm" asChild>
                        <a href="/api/login" data-testid="link-sign-in">Sign In</a>
                      </Button>
                    </div>
                  ) : !isPro ? (
                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || !sport || !(product === "custom" ? customProduct : product)}
                        data-testid="button-analyze"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Researching...
                          </>
                        ) : (
                          <>
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Preview Analysis
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        Free users get a summary. Upgrade for full breakdown + grading recs.
                      </p>
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || !sport || !(product === "custom" ? customProduct : product)}
                      data-testid="button-analyze"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Researching...
                        </>
                      ) : (
                        <>
                          <BarChart3 className="h-4 w-4 mr-2" />
                          Analyze Product
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>Analysis covers hits and star rookies only — the cards that drive box value.</p>
                      <p>Values are point-in-time estimates based on current market data.</p>
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
                    <h3 className="text-xl font-semibold mb-2">Ready to Analyze</h3>
                    <p className="text-muted-foreground max-w-md">
                      Select a sport and hobby box product to get a detailed ROI breakdown with hit odds, grading recommendations, and star rookie spotlight.
                    </p>
                  </CardContent>
                </Card>
              )}

              {isAnalyzing && (
                <Card className="h-full flex items-center justify-center min-h-[400px]">
                  <CardContent className="text-center py-12">
                    <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Researching Product...</h3>
                    <p className="text-muted-foreground">
                      Analyzing checklist, hit odds, market values, and grading potential
                    </p>
                  </CardContent>
                </Card>
              )}

              {result && <ProductResults result={result} isPro={isPro} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compare">
          <CompareView
            sport={sport}
            setSport={setSport}
            boxType={boxType}
            setBoxType={setBoxType}
            product={product}
            setProduct={setProduct}
            customProduct={customProduct}
            setCustomProduct={setCustomProduct}
            boxCost={boxCost}
            setBoxCost={setBoxCost}
            sportB={sportB}
            setSportB={setSportB}
            boxTypeB={boxTypeB}
            setBoxTypeB={setBoxTypeB}
            productB={productB}
            setProductB={setProductB}
            customProductB={customProductB}
            setCustomProductB={setCustomProductB}
            boxCostB={boxCostB}
            setBoxCostB={setBoxCostB}
            isAuthenticated={isAuthenticated}
            isPro={isPro}
            isComparing={isComparing}
            error={error}
            comparisonResult={comparisonResult}
            resultA={result}
            resultB={resultB}
            onCompare={handleCompare}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-lg ${className || ""}`}>
        <Package className="h-12 w-12 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain rounded-lg bg-muted ${className || ""}`}
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function HitImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    <img
      src={src}
      alt={alt}
      className="w-16 h-20 object-contain rounded border bg-muted flex-shrink-0"
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function ProductResults({ result, isPro }: { result: SealedProductResult; isPro: boolean }) {
  return (
    <div className="space-y-4" data-testid="card-results">
      {result.releaseRecency === "new_release" && (
        <Card className="border-yellow-500/50 bg-yellow-500/5" data-testid="banner-new-release">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-yellow-600 dark:text-yellow-400">New Release — Prices Volatile</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.volatilityNote || "This product released recently. Prices are still settling and may drop significantly in the coming weeks. ROI estimates use conservative lower-bound values."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-overview">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-xl" data-testid="text-product-name">{result.productName}</CardTitle>
              <CardDescription>{result.configuration}</CardDescription>
            </div>
            <VerdictBadge verdict={result.roiVerdict} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            {result.productImageUrl && (
              <div className="flex-shrink-0">
                <ProductImage
                  src={result.productImageUrl}
                  alt={result.productName}
                  className="w-28 h-28 sm:w-36 sm:h-36"
                />
              </div>
            )}
            <div className="flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <DollarSign className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xl font-bold" data-testid="text-box-cost">${result.boxCost?.toFixed(0) || "N/A"}</p>
                  <p className="text-xs text-muted-foreground">Box Cost</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <TrendingUp className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xl font-bold" data-testid="text-ev">${result.expectedValue?.toFixed(0) || "N/A"}</p>
                  <p className="text-xs text-muted-foreground">Expected Value</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <BarChart3 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className={`text-xl font-bold ${result.evRatio >= 1 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-ev-ratio">
                    {result.evRatio?.toFixed(2) || "N/A"}x
                  </p>
                  <p className="text-xs text-muted-foreground">EV Ratio</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <Award className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xl font-bold" data-testid="text-quality-score">{result.qualityScore}</p>
                  <p className="text-xs text-muted-foreground">Quality Score</p>
                </div>
              </div>
              {result.caseHitCeilingEV != null && result.caseHitCeilingEV > 0 && (
                <div className="flex items-center gap-2 p-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg text-sm" data-testid="text-ceiling-ev">
                  <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                  <span className="text-muted-foreground">Case hit ceiling adds</span>
                  <span className="font-semibold text-yellow-600 dark:text-yellow-400">${result.caseHitCeilingEV.toFixed(0)}</span>
                  <span className="text-muted-foreground text-xs">(lottery outcomes — not in base EV)</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg mb-3">
            <p className="text-sm" data-testid="text-verdict-explanation">{result.verdictExplanation}</p>
            <p className="text-xs text-muted-foreground mt-1 italic">EV reflects median sold prices minus 13% eBay fees and shipping. Cards under $5 are zeroed out (unliquidatable).</p>
          </div>

          {result.keyRookieClass && (
            <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Rookie Class:</span> {result.keyRookieClass}</p>
            </div>
          )}

          {result.marketContext && (
            <p className="text-xs text-muted-foreground italic mt-3">{result.marketContext}</p>
          )}
        </CardContent>
      </Card>

      {isPro ? (
        <>
          {result.hitBreakdown && result.hitBreakdown.length > 0 && (
            <Card data-testid="card-hit-breakdown">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Hit Breakdown & Grading Recommendations
                </CardTitle>
                <CardDescription>Key hits, their odds, values, and whether grading is worthwhile</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.hitBreakdown.map((hit, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border ${hit.isCaseHit ? "border-yellow-500/50 bg-yellow-500/5" : ""}`}
                      data-testid={`row-hit-${i}`}
                    >
                      <div className="flex gap-3">
                        <HitImage src={hit.exampleImageUrl} alt={hit.cardType} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {hit.isCaseHit && (
                              <Badge variant="outline" className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 gap-1 text-xs" data-testid={`badge-case-hit-${i}`}>
                                <Star className="h-3 w-3 fill-yellow-500" />
                                Case Hit
                              </Badge>
                            )}
                            <p className="font-medium">{hit.cardType}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <span>{hit.odds}</span>
                            {hit.playerExample && (
                              <>
                                <span>·</span>
                                <span>e.g. {hit.playerExample}</span>
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <div>
                              <span className="text-muted-foreground">Raw: </span>
                              <span className="font-medium">${hit.estimatedRawValue?.toFixed(0)}</span>
                              {hit.estimatedRawMin !== undefined && hit.estimatedRawMax !== undefined && (
                                <span className="text-xs text-muted-foreground ml-1">(${hit.estimatedRawMin?.toFixed(0)}-${hit.estimatedRawMax?.toFixed(0)})</span>
                              )}
                            </div>
                            <div>
                              <span className="text-muted-foreground">PSA 10: </span>
                              <span className="font-medium">${hit.estimatedGradedValue?.toFixed(0)}</span>
                              {hit.estimatedGradedMin !== undefined && hit.estimatedGradedMax !== undefined && (
                                <span className="text-xs text-muted-foreground ml-1">(${hit.estimatedGradedMin?.toFixed(0)}-${hit.estimatedGradedMax?.toFixed(0)})</span>
                              )}
                            </div>
                            <GradingBadge recommendation={hit.gradingRecommendation} />
                          </div>
                          {hit.gradingRationale && (
                            <p className="text-xs text-muted-foreground mt-1">{hit.gradingRationale}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.starRookies && result.starRookies.length > 0 && (
            <Card data-testid="card-star-rookies">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5" />
                  Star Rookie Spotlight
                </CardTitle>
                <CardDescription>The most valuable rookies in this product</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {result.starRookies.map((rookie, i) => (
                    <div key={i} className="p-3 border rounded-lg" data-testid={`card-rookie-${i}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Trophy className="h-4 w-4 text-yellow-500" />
                        <span className="font-semibold">{rookie.playerName}</span>
                        <Badge variant="secondary" className="text-xs">{rookie.position}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{rookie.team}</p>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Raw:</span>
                        <span className="font-medium">${rookie.currentRawValue?.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">PSA 10:</span>
                        <span className="font-medium text-green-600 dark:text-green-400">${rookie.currentGradedValue?.toFixed(0)}</span>
                      </div>
                      {rookie.outlook && (
                        <p className="text-xs text-muted-foreground italic">{rookie.outlook}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.qualityBreakdown && (
            <Card data-testid="card-quality-breakdown">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Quality Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <QualityBar label="Cost Efficiency" value={result.qualityBreakdown.costEfficiency} />
                <QualityBar label="Hit Ceiling" value={result.qualityBreakdown.hitCeiling} />
                <QualityBar label="Rookie Class Depth" value={result.qualityBreakdown.rookieClassDepth} />
                <QualityBar label="Gradability" value={result.qualityBreakdown.gradability} />
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="relative overflow-hidden" data-testid="card-pro-gate">
          <div className="absolute inset-0 backdrop-blur-sm bg-background/60 z-10 flex items-center justify-center">
            <div className="text-center p-6">
              <Crown className="h-8 w-8 mx-auto mb-3 text-yellow-500" />
              <h3 className="text-lg font-semibold mb-2">Full ROI Breakdown</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upgrade to Pro for detailed hit breakdown, grading recommendations, star rookie spotlight, and quality score analysis
              </p>
              <Button asChild data-testid="button-upgrade">
                <Link href="/upgrade">
                  Upgrade to Pro
                </Link>
              </Button>
            </div>
          </div>
          <CardHeader>
            <CardTitle className="text-lg">Hit Breakdown & Grading</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg opacity-30">
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-32 mb-2" />
                    <div className="h-3 bg-muted rounded w-20" />
                  </div>
                  <div className="flex gap-4">
                    <div className="h-4 bg-muted rounded w-16" />
                    <div className="h-4 bg-muted rounded w-16" />
                    <div className="h-4 bg-muted rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProductSelector({
  label,
  sport,
  setSport,
  boxType,
  setBoxType,
  product,
  setProduct,
  customProduct,
  setCustomProduct,
  boxCost,
  setBoxCost,
  testIdSuffix,
}: {
  label: string;
  sport: string;
  setSport: (v: string) => void;
  boxType: string;
  setBoxType: (v: string) => void;
  product: string;
  setProduct: (v: string) => void;
  customProduct: string;
  setCustomProduct: (v: string) => void;
  boxCost: string;
  setBoxCost: (v: string) => void;
  testIdSuffix: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Sport</Label>
          <Select value={sport} onValueChange={(v) => { setSport(v); setProduct(""); }}>
            <SelectTrigger data-testid={`select-sport-${testIdSuffix}`}>
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
          <Label>Box Type</Label>
          <Select value={boxType} onValueChange={(v) => { setBoxType(v); setProduct(""); }}>
            <SelectTrigger data-testid={`select-box-type-${testIdSuffix}`}>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              {BOX_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Product</Label>
          <Select value={product} onValueChange={(v) => {
            setProduct(v);
            if (v !== "custom" && sport) {
              const p = SEALED_PRODUCTS[sport]?.find(pr => pr.name === v);
              if (p) setBoxCost(p.msrp.toString());
            }
          }}>
            <SelectTrigger data-testid={`select-product-${testIdSuffix}`}>
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {sport && SEALED_PRODUCTS[sport]
                ?.filter(p => boxType === "all" || p.type === boxType)
                .map(p => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name} (~${p.msrp})
                  </SelectItem>
                ))}
              <SelectItem value="custom">Other (custom entry)</SelectItem>
            </SelectContent>
          </Select>
          {product === "custom" && (
            <Input
              placeholder="e.g. 2025 Panini Prizm Football Blaster"
              value={customProduct}
              onChange={(e) => setCustomProduct(e.target.value)}
              data-testid={`input-custom-product-${testIdSuffix}`}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>Box Cost ($)</Label>
          <Input
            type="number"
            min="1"
            step="0.01"
            placeholder="e.g. 450.00"
            value={boxCost}
            onChange={(e) => setBoxCost(e.target.value)}
            data-testid={`input-box-cost-${testIdSuffix}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CompareView({
  sport, setSport, boxType, setBoxType, product, setProduct, customProduct, setCustomProduct, boxCost, setBoxCost,
  sportB, setSportB, boxTypeB, setBoxTypeB, productB, setProductB, customProductB, setCustomProductB, boxCostB, setBoxCostB,
  isAuthenticated, isPro, isComparing, error, comparisonResult, resultA, resultB, onCompare,
}: {
  sport: string; setSport: (v: string) => void;
  boxType: string; setBoxType: (v: string) => void;
  product: string; setProduct: (v: string) => void;
  customProduct: string; setCustomProduct: (v: string) => void;
  boxCost: string; setBoxCost: (v: string) => void;
  sportB: string; setSportB: (v: string) => void;
  boxTypeB: string; setBoxTypeB: (v: string) => void;
  productB: string; setProductB: (v: string) => void;
  customProductB: string; setCustomProductB: (v: string) => void;
  boxCostB: string; setBoxCostB: (v: string) => void;
  isAuthenticated: boolean;
  isPro: boolean;
  isComparing: boolean;
  error: string;
  comparisonResult: ComparisonResult | null;
  resultA: SealedProductResult | null;
  resultB: SealedProductResult | null;
  onCompare: () => void;
}) {
  const selectedA = product === "custom" ? customProduct : product;
  const selectedB = productB === "custom" ? customProductB : productB;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProductSelector
          label="Product A"
          sport={sport}
          setSport={setSport}
          boxType={boxType}
          setBoxType={setBoxType}
          product={product}
          setProduct={setProduct}
          customProduct={customProduct}
          setCustomProduct={setCustomProduct}
          boxCost={boxCost}
          setBoxCost={setBoxCost}
          testIdSuffix="a"
        />
        <ProductSelector
          label="Product B"
          sport={sportB}
          setSport={setSportB}
          boxType={boxTypeB}
          setBoxType={setBoxTypeB}
          product={productB}
          setProduct={setProductB}
          customProduct={customProductB}
          setCustomProduct={setCustomProductB}
          boxCost={boxCostB}
          setBoxCost={setBoxCostB}
          testIdSuffix="b"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center" data-testid="text-compare-error">{error}</p>
      )}

      {!isAuthenticated ? (
        <div className="p-4 bg-muted rounded-lg text-center space-y-2">
          <Lock className="h-5 w-5 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Sign in to compare products</p>
          <Button size="sm" asChild>
            <a href="/api/login" data-testid="link-sign-in-compare">Sign In</a>
          </Button>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={onCompare}
            disabled={isComparing || !sport || !selectedA || !sportB || !selectedB}
            data-testid="button-compare"
          >
            {isComparing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <Scale className="h-4 w-4 mr-2" />
                Compare Products
              </>
            )}
          </Button>
        </div>
      )}

      {isComparing && (
        <Card className="flex items-center justify-center min-h-[300px]">
          <CardContent className="text-center py-12">
            <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
            <h3 className="text-xl font-semibold mb-2">Analyzing Both Products...</h3>
            <p className="text-muted-foreground">
              Researching and comparing hit odds, values, and quality scores
            </p>
          </CardContent>
        </Card>
      )}

      {comparisonResult && (
        <div className="space-y-6" data-testid="card-comparison-results">
          <Card className="border-primary/30" data-testid="card-comparison-verdict">
            <CardContent className="pt-6">
              <div className="text-center mb-4">
                <Trophy className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                <h3 className="text-lg font-semibold">Comparison Result</h3>
              </div>
              <p className="text-center text-sm text-muted-foreground mb-6" data-testid="text-recommendation">
                {comparisonResult.recommendation}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className={`text-center p-4 rounded-lg border-2 ${comparisonResult.winner === "A" ? "border-green-500 bg-green-500/5" : "border-muted"}`}>
                  <p className="text-sm font-medium mb-1 truncate" data-testid="text-product-a-name">{comparisonResult.productA.productName}</p>
                  <p className="text-3xl font-bold" data-testid="text-score-a">{comparisonResult.productA.computedQualityScore}</p>
                  <p className="text-xs text-muted-foreground">Quality Score</p>
                  {comparisonResult.winner === "A" && (
                    <Badge className="mt-2 bg-green-500" data-testid="badge-winner-a">Winner</Badge>
                  )}
                </div>
                <div className={`text-center p-4 rounded-lg border-2 ${comparisonResult.winner === "B" ? "border-green-500 bg-green-500/5" : "border-muted"}`}>
                  <p className="text-sm font-medium mb-1 truncate" data-testid="text-product-b-name">{comparisonResult.productB.productName}</p>
                  <p className="text-3xl font-bold" data-testid="text-score-b">{comparisonResult.productB.computedQualityScore}</p>
                  <p className="text-xs text-muted-foreground">Quality Score</p>
                  {comparisonResult.winner === "B" && (
                    <Badge className="mt-2 bg-green-500" data-testid="badge-winner-b">Winner</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {isPro ? (
            <Card data-testid="card-comparison-breakdown">
              <CardHeader>
                <CardTitle className="text-lg">Score Breakdown</CardTitle>
                <CardDescription>Side-by-side comparison across key dimensions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: "Cost Efficiency", keyA: comparisonResult.productA.qualityBreakdown?.costEfficiency || 0, keyB: comparisonResult.productB.qualityBreakdown?.costEfficiency || 0 },
                    { label: "Hit Ceiling", keyA: comparisonResult.productA.qualityBreakdown?.hitCeiling || 0, keyB: comparisonResult.productB.qualityBreakdown?.hitCeiling || 0 },
                    { label: "Rookie Class Depth", keyA: comparisonResult.productA.qualityBreakdown?.rookieClassDepth || 0, keyB: comparisonResult.productB.qualityBreakdown?.rookieClassDepth || 0 },
                    { label: "Gradability", keyA: comparisonResult.productA.qualityBreakdown?.gradability || 0, keyB: comparisonResult.productB.qualityBreakdown?.gradability || 0 },
                  ].map((dim, i) => (
                    <div key={i} className="space-y-1" data-testid={`compare-dimension-${i}`}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{dim.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium w-8 text-right">{dim.keyA}</span>
                        <div className="flex-1 flex gap-1">
                          <div className="flex-1 h-3 bg-muted rounded-l-full overflow-hidden flex justify-end">
                            <div
                              className={`h-full rounded-l-full ${dim.keyA >= dim.keyB ? "bg-green-500" : "bg-blue-400"}`}
                              style={{ width: `${dim.keyA}%` }}
                            />
                          </div>
                          <div className="flex-1 h-3 bg-muted rounded-r-full overflow-hidden">
                            <div
                              className={`h-full rounded-r-full ${dim.keyB >= dim.keyA ? "bg-green-500" : "bg-blue-400"}`}
                              style={{ width: `${dim.keyB}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-medium w-8">{dim.keyB}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-center">{comparisonResult.productA.productName}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center p-2 bg-muted rounded">
                        <p className="font-bold">${comparisonResult.productA.boxCost?.toFixed(0)}</p>
                        <p className="text-muted-foreground">Box Cost</p>
                      </div>
                      <div className="text-center p-2 bg-muted rounded">
                        <p className={`font-bold ${comparisonResult.productA.evRatio >= 1 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {comparisonResult.productA.evRatio?.toFixed(2)}x
                        </p>
                        <p className="text-muted-foreground">EV Ratio</p>
                      </div>
                      <div className="text-center p-2 bg-muted rounded">
                        <p className="font-bold">{comparisonResult.productA.rookieCount}</p>
                        <p className="text-muted-foreground">Star Rookies</p>
                      </div>
                      <div className="text-center p-2 bg-muted rounded">
                        <p className="font-bold">{comparisonResult.productA.gradableHits}</p>
                        <p className="text-muted-foreground">Grade-worthy</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-center">{comparisonResult.productB.productName}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center p-2 bg-muted rounded">
                        <p className="font-bold">${comparisonResult.productB.boxCost?.toFixed(0)}</p>
                        <p className="text-muted-foreground">Box Cost</p>
                      </div>
                      <div className="text-center p-2 bg-muted rounded">
                        <p className={`font-bold ${comparisonResult.productB.evRatio >= 1 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {comparisonResult.productB.evRatio?.toFixed(2)}x
                        </p>
                        <p className="text-muted-foreground">EV Ratio</p>
                      </div>
                      <div className="text-center p-2 bg-muted rounded">
                        <p className="font-bold">{comparisonResult.productB.rookieCount}</p>
                        <p className="text-muted-foreground">Star Rookies</p>
                      </div>
                      <div className="text-center p-2 bg-muted rounded">
                        <p className="font-bold">{comparisonResult.productB.gradableHits}</p>
                        <p className="text-muted-foreground">Grade-worthy</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="relative overflow-hidden" data-testid="card-compare-pro-gate">
              <div className="absolute inset-0 backdrop-blur-sm bg-background/60 z-10 flex items-center justify-center">
                <div className="text-center p-6">
                  <Crown className="h-8 w-8 mx-auto mb-3 text-yellow-500" />
                  <h3 className="text-lg font-semibold mb-2">Detailed Score Breakdown</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upgrade to Pro for the full dimension-by-dimension comparison breakdown
                  </p>
                  <Button asChild data-testid="button-upgrade-compare">
                    <Link href="/upgrade">
                      Upgrade to Pro
                    </Link>
                  </Button>
                </div>
              </div>
              <CardHeader>
                <CardTitle className="text-lg">Score Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-1 opacity-30">
                      <div className="h-4 bg-muted rounded w-24" />
                      <div className="flex items-center gap-2">
                        <div className="h-3 bg-muted rounded w-8" />
                        <div className="flex-1 h-3 bg-muted rounded-full" />
                        <div className="h-3 bg-muted rounded w-8" />
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
  );
}
