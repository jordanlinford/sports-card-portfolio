import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ShoppingCart, 
  Ban,
  Clock,
  Shield,
  Zap,
  AlertCircle,
  Target,
  Scale,
} from "lucide-react";
import type { AdvisorOutlook } from "@shared/schema";

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

function getConfidenceStyles(confidence: AdvisorOutlook["confidence"]) {
  switch (confidence) {
    case "HIGH":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    case "MED":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "LOW":
      return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  }
}

function getHorizonStyles(_horizon: AdvisorOutlook["horizon"]) {
  return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
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
          
          <div className="flex flex-wrap gap-2">
            <Badge className={getConfidenceStyles(advisor.confidence)} data-testid="badge-confidence">
              <Zap className="h-3 w-3 mr-1" />
              {advisor.confidence} Confidence
            </Badge>
            <Badge className={getHorizonStyles(advisor.horizon)} data-testid="badge-horizon">
              <Clock className="h-3 w-3 mr-1" />
              {advisor.horizon}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground leading-relaxed" data-testid="text-advisor-take">
          {advisor.advisorTake}
        </p>
        
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {advisor.evidenceNote}
        </p>
        
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
