import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { 
  TrendingDown, 
  Minus, 
  ShoppingCart, 
  Ban,
  Shield,
  Zap,
  Target,
  Scale,
  Heart,
} from "lucide-react";
import type { AdvisorOutlook } from "@shared/schema";
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
    case "SELL":
      return {
        bg: "bg-orange-500/10",
        border: "border-orange-500/30",
        text: "text-orange-700 dark:text-orange-400",
        icon: <TrendingDown className="h-5 w-5" />,
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

interface AdvisorSnapshotProps {
  advisor: AdvisorOutlook;
  playerName: string;
}

export function AdvisorSnapshot({ advisor, playerName }: AdvisorSnapshotProps) {
  const verdictStyles = getVerdictStyles(advisor.verdict);
  
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
                {advisor.verdict.replace("_", " ")}
              </h2>
              <p className="text-sm text-muted-foreground">{advisor.verdictLabel}</p>
            </div>
          </div>
          
          {/* Liquidity badge - shows overall market health for this player's cards */}
          {advisor.liquidityTier && (
            <LiquidityBadge tier={advisor.liquidityTier} />
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Advisor's Take - the core commentary */}
        {advisor.advisorTake && (
          <p className="text-sm text-foreground leading-relaxed" data-testid="text-advisor-take">
            {advisor.advisorTake}
          </p>
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
      </CardContent>
    </Card>
  );
}
