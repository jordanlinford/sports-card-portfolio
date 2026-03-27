import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { 
  TrendingDown, 
  TrendingUp,
  Minus, 
  ShoppingCart, 
  Ban,
  Shield,
  Zap,
  Target,
  Scale,
  Heart,
  Activity,
  BarChart3,
  BarChart2,
  Crosshair,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  User,
  Search,
} from "lucide-react";
import type { AdvisorOutlook, TradeTarget } from "@shared/schema";
import { LiquidityBadge } from "@/components/liquidity-badge";

function getVerdictStyles(verdict: AdvisorOutlook["verdict"]) {
  switch (verdict) {
    case "BUY":
      return {
        bg: "bg-green-500/10",
        border: "border-green-500/30",
        text: "text-green-700 dark:text-green-400",
        icon: <ShoppingCart className="h-5 w-5" />,
      };
    case "HOLD_CORE":
      return {
        bg: "bg-blue-500/10",
        border: "border-blue-500/30",
        text: "text-blue-700 dark:text-blue-400",
        icon: <Shield className="h-5 w-5" />,
      };
    case "HOLD":
      return {
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/30",
        text: "text-yellow-700 dark:text-yellow-400",
        icon: <Minus className="h-5 w-5" />,
      };
    case "TRADE_THE_HYPE":
      return {
        bg: "bg-orange-500/10",
        border: "border-orange-500/30",
        text: "text-orange-700 dark:text-orange-400",
        icon: <TrendingDown className="h-5 w-5" />,
      };
    case "SELL":
      return {
        bg: "bg-orange-500/10",
        border: "border-orange-500/30",
        text: "text-orange-700 dark:text-orange-400",
        icon: <TrendingDown className="h-5 w-5" />,
      };
    case "SPECULATIVE":
      return {
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        text: "text-amber-700 dark:text-amber-400",
        icon: <Zap className="h-5 w-5" />,
      };
    case "AVOID":
      return {
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        text: "text-red-700 dark:text-red-400",
        icon: <Ban className="h-5 w-5" />,
      };
    default:
      return {
        bg: "bg-muted",
        border: "border-muted",
        text: "text-muted-foreground",
        icon: <Minus className="h-5 w-5" />,
      };
  }
}

function getDecisionColor(action: string): string {
  if (action.includes("BUY") || action.includes("ADD")) return "text-green-700 dark:text-green-400";
  if (action.includes("SELL") || action.includes("EXIT") || action.includes("AVOID") || action.includes("DO NOT")) return "text-red-700 dark:text-red-400";
  if (action.includes("HOLD")) return "text-blue-700 dark:text-blue-400";
  return "text-amber-700 dark:text-amber-400";
}

function getDecisionBg(action: string): string {
  if (action.includes("BUY") || action.includes("ADD")) return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  if (action.includes("SELL") || action.includes("EXIT") || action.includes("AVOID") || action.includes("DO NOT")) return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
  if (action.includes("HOLD")) return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
  return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
}

function getPercentileColor(label: string, inverted: boolean = false): string {
  const num = parseInt(label.replace(/[^0-9]/g, ""), 10);
  const isTop = label.startsWith("Top");
  const isGood = inverted ? !isTop : isTop;
  const position = isGood ? num : 100 - num;
  if (position <= 15) return "text-green-600 border-green-300 dark:text-green-400 dark:border-green-600";
  if (position <= 35) return "text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-600";
  if (position <= 60) return "text-muted-foreground";
  return "text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-600";
}

interface AdvisorSnapshotProps {
  advisor: AdvisorOutlook;
  playerName: string;
}

export function AdvisorSnapshot({ advisor, playerName }: AdvisorSnapshotProps) {
  const verdictStyles = getVerdictStyles(advisor.verdict);
  const [showDetails, setShowDetails] = useState(false);

  const holderTargets = advisor.tradeTargets?.targets.filter(t => t.action === "SELL") || [];
  const buyerTargets = advisor.tradeTargets?.targets.filter(t => t.action === "BUY" || t.action === "WATCH") || [];
  
  return (
    <Card className={`border-2 ${verdictStyles.border}`} data-testid="card-advisor-snapshot">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${verdictStyles.bg} ${verdictStyles.text}`}>
              {verdictStyles.icon}
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${verdictStyles.text}`} data-testid="text-advisor-verdict">
                {advisor.verdict === "TRADE_THE_HYPE" ? "TRADE THE HYPE" : advisor.verdict === "SPECULATIVE" ? "SPECULATIVE FLYER" : advisor.verdict.replace(/_/g, " ")}
              </h2>
              <p className="text-sm text-muted-foreground">{advisor.verdictLabel}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {advisor.conviction && (
              <Badge 
                variant="outline" 
                className={`text-xs font-medium ${
                  advisor.conviction.level === "High Conviction" ? "text-green-600 border-green-300 dark:text-green-400 dark:border-green-500" :
                  advisor.conviction.level === "Medium Conviction" ? "text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-500" :
                  advisor.conviction.level === "Low Conviction" ? "text-yellow-600 border-yellow-300 dark:text-yellow-400 dark:border-yellow-500" :
                  "text-red-600 border-red-300 dark:text-red-400 dark:border-red-500"
                }`}
                data-testid="badge-conviction"
              >
                {advisor.conviction.level}
              </Badge>
            )}
            {advisor.liquidityTier && (
              <LiquidityBadge tier={advisor.liquidityTier} />
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {advisor.decisions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="section-decisions">
            <div className={`rounded-lg border p-4 ${getDecisionBg(advisor.decisions.holder.action)}`} data-testid="decision-holder">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">If you own</span>
              </div>
              <p className={`text-lg font-bold ${getDecisionColor(advisor.decisions.holder.action)}`} data-testid="text-holder-action">
                → {advisor.decisions.holder.action}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{advisor.decisions.holder.reason}</p>
              {holderTargets.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {holderTargets.slice(0, 2).map((target, i) => (
                    <InlineTarget key={i} target={target} index={i} prefix="holder" />
                  ))}
                </div>
              )}
            </div>

            <div className={`rounded-lg border p-4 ${getDecisionBg(advisor.decisions.buyer.action)}`} data-testid="decision-buyer">
              <div className="flex items-center gap-2 mb-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">If you want exposure</span>
              </div>
              <p className={`text-lg font-bold ${getDecisionColor(advisor.decisions.buyer.action)}`} data-testid="text-buyer-action">
                → {advisor.decisions.buyer.action}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{advisor.decisions.buyer.reason}</p>
              {buyerTargets.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {buyerTargets.slice(0, 2).map((target, i) => (
                    <InlineTarget key={i} target={target} index={i} prefix="buyer" />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {advisor.tradeTargets && advisor.tradeTargets.caveat && advisor.tradeTargets.targets.length === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 border border-border" data-testid="trade-targets-caveat">
            <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">{advisor.tradeTargets.caveat}</span>
          </div>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2"
          data-testid="button-show-analysis"
        >
          {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showDetails ? "Hide analysis" : "Show analysis"}
        </button>

        {showDetails && (
          <div className="space-y-4 pt-2 border-t border-border" data-testid="section-analysis-details">
            {advisor.advisorTake && (
              <p className="text-sm text-foreground leading-relaxed" data-testid="text-advisor-take">
                {advisor.advisorTake}
              </p>
            )}

            {advisor.conviction?.narrative && (
              <p className="text-xs text-muted-foreground italic" data-testid="text-conviction-narrative">
                {advisor.conviction.narrative}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {advisor.marketPhase && (
                <Badge variant="secondary" className="text-xs font-medium" data-testid="badge-market-phase">
                  <Activity className="h-3 w-3 mr-1" />
                  {advisor.marketPhase}
                </Badge>
              )}
              {advisor.timing && (
                <Badge 
                  variant="outline" 
                  className={`text-xs font-medium ${
                    advisor.timing === "Early" ? "text-green-600 border-green-300" :
                    advisor.timing === "Overextended" ? "text-red-600 border-red-300" :
                    advisor.timing === "Late" ? "text-orange-600 border-orange-300" :
                    "text-muted-foreground"
                  }`}
                  data-testid="badge-timing"
                >
                  {advisor.timing}
                </Badge>
              )}
              {advisor.structure && (
                <Badge 
                  variant="outline" 
                  className={`text-xs font-medium ${
                    advisor.structure === "Strong" ? "text-green-600 border-green-300" :
                    advisor.structure === "Weak" ? "text-red-600 border-red-300" :
                    "text-yellow-600 border-yellow-300"
                  }`}
                  data-testid="badge-structure"
                >
                  {advisor.structure}
                </Badge>
              )}
            </div>

            {advisor.topSignals && advisor.topSignals.length > 0 && (
              <div className="flex flex-wrap gap-2" data-testid="row-top-signals">
                {advisor.topSignals.map((signal, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal">
                    {signal}
                  </Badge>
                ))}
              </div>
            )}

            {advisor.shortTermTrend && (
              <div className="space-y-1" data-testid="row-short-term-trend">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Short-term outlook ({advisor.horizon})</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {advisor.shortTermTrend.priceTrend7d && (
                    <span className="flex items-center gap-1">
                      {advisor.shortTermTrend.priceTrend7d.startsWith("+") ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="font-medium">{advisor.shortTermTrend.priceTrend7d}</span> 7d
                    </span>
                  )}
                  {advisor.shortTermTrend.priceTrend14d && (
                    <span className="flex items-center gap-1">
                      {advisor.shortTermTrend.priceTrend14d.startsWith("+") ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="font-medium">{advisor.shortTermTrend.priceTrend14d}</span> ~14d
                    </span>
                  )}
                  {advisor.shortTermTrend.priceTrend30d && (
                    <span className="flex items-center gap-1">
                      {advisor.shortTermTrend.priceTrend30d.startsWith("+") ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="font-medium">{advisor.shortTermTrend.priceTrend30d}</span> 30d
                    </span>
                  )}
                  {advisor.shortTermTrend.volumeDirection && (
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" />
                      Vol {advisor.shortTermTrend.volumeDirection}
                    </span>
                  )}
                  {advisor.shortTermTrend.soldCount7d !== undefined && (
                    <span>{advisor.shortTermTrend.soldCount7d} sold/7d</span>
                  )}
                  {advisor.shortTermTrend.soldCount30d !== undefined && (
                    <span>{advisor.shortTermTrend.soldCount30d} sold/30d</span>
                  )}
                  {advisor.shortTermTrend.avgPrice && (
                    <span>{advisor.shortTermTrend.avgPrice} avg</span>
                  )}
                </div>
              </div>
            )}

            {advisor.percentiles && (
              <div className="space-y-1" data-testid="row-percentile-rankings">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <BarChart2 className="h-3 w-3" />
                  Relative Ranking
                  {advisor.percentiles.sampleSize && advisor.percentiles.sampleSize < 100 && (
                    <span className="font-normal text-muted-foreground/60 ml-1">(limited sample: {advisor.percentiles.sampleSize} players)</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {advisor.percentiles.marketScore && (
                    <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.marketScore)}`} data-testid="badge-pct-market">
                      Market: {advisor.percentiles.marketScore}
                    </Badge>
                  )}
                  {advisor.percentiles.demand && (
                    <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.demand)}`} data-testid="badge-pct-demand">
                      Demand: {advisor.percentiles.demand}
                    </Badge>
                  )}
                  {advisor.percentiles.momentum && (
                    <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.momentum)}`} data-testid="badge-pct-momentum">
                      Momentum: {advisor.percentiles.momentum}
                    </Badge>
                  )}
                  {advisor.percentiles.hype && (
                    <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.hype)}`} data-testid="badge-pct-hype">
                      Hype: {advisor.percentiles.hype}
                    </Badge>
                  )}
                  {advisor.percentiles.quality && (
                    <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.quality)}`} data-testid="badge-pct-quality">
                      Quality: {advisor.percentiles.quality}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {advisor.packHitReaction && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-sm font-medium" data-testid="text-pack-hit-reaction">
                  Pack Hit: {advisor.packHitReaction}
                </span>
              </div>
            )}
            
            {advisor.collectorTip && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-pink-500/10 dark:bg-pink-500/20 border border-pink-500/30">
                <Heart className="h-4 w-4 text-pink-600 dark:text-pink-400 shrink-0" />
                <span className="text-sm text-pink-700 dark:text-pink-300" data-testid="text-collector-tip">
                  {advisor.collectorTip}
                </span>
              </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Top Reasons
                </h4>
                <ul className="space-y-1">
                  {advisor.topReasons.map((reason, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Scale className="h-3 w-3" />
                  Action Plan
                </h4>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs shrink-0">Now</Badge>
                    <span className="text-sm text-foreground">{advisor.actionPlan.now}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs shrink-0">Entry</Badge>
                    <span className="text-sm text-foreground">{advisor.actionPlan.entryRule}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs shrink-0">Size</Badge>
                    <span className="text-sm text-foreground">{advisor.actionPlan.sizingRule}</span>
                  </div>
                </div>
              </div>
            </div>

            {advisor.tradeTargets && advisor.tradeTargets.targets.length > 0 && (
              <TradeTargetsSection data={advisor.tradeTargets} verdict={advisor.verdict} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InlineTarget({ target, index, prefix }: { target: TradeTarget; index: number; prefix: string }) {
  const actionColor = target.action === "BUY" ? "text-green-600 dark:text-green-400" 
    : target.action === "SELL" ? "text-red-600 dark:text-red-400"
    : "text-amber-600 dark:text-amber-400";

  return (
    <div className="flex items-center gap-2 text-xs" data-testid={`${prefix}-target-${index}`}>
      <span className={`font-semibold ${actionColor}`}>{target.action}</span>
      <span className="text-foreground truncate">{target.card}</span>
      {target.price && <span className="text-muted-foreground shrink-0">{target.price}</span>}
    </div>
  );
}

function getActionStyles(action: TradeTarget["action"]) {
  switch (action) {
    case "BUY":
      return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", border: "border-green-200 dark:border-green-800" };
    case "SELL":
      return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800" };
    case "WATCH":
      return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" };
  }
}

function TradeTargetsSection({ data, verdict }: { data: NonNullable<AdvisorOutlook["tradeTargets"]>; verdict: AdvisorOutlook["verdict"] }) {
  const headerColor = verdict === "BUY" || verdict === "HOLD_CORE"
    ? "text-green-700 dark:text-green-400"
    : verdict === "SELL" || verdict === "AVOID" || verdict === "TRADE_THE_HYPE"
    ? "text-red-700 dark:text-red-400"
    : "text-amber-700 dark:text-amber-400";

  return (
    <div className="pt-4 mt-4 border-t border-border" data-testid="section-trade-targets">
      <h4 className={`text-sm font-semibold mb-3 flex items-center gap-1.5 ${headerColor}`}>
        <Crosshair className="h-4 w-4" />
        Trade Targets
      </h4>
      
      <p className="text-xs text-muted-foreground mb-3">{data.headline}</p>

      {data.targets.length > 0 && (
        <div className="space-y-2">
          {data.targets.map((target, i) => {
            const styles = getActionStyles(target.action);
            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-2.5 rounded-md border ${styles.border} ${styles.bg}`}
                data-testid={`trade-target-${i}`}
              >
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${styles.text} bg-transparent border ${styles.border}`}>
                  {target.action === "WATCH" ? <Eye className="h-3 w-3 mr-0.5" /> : null}
                  {target.action}
                </Badge>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">{target.card}</span>
                  <span className="text-xs text-muted-foreground">{target.tag}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {target.price && (
                    <span className="font-medium">{target.price}</span>
                  )}
                  {target.liquidity && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {target.liquidity}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.caveat && data.targets.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2 italic">{data.caveat}</p>
      )}
    </div>
  );
}
