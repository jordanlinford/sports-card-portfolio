import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Ban,
  Eye,
  Sparkles,
  CircleDollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Lightbulb,
  Info,
  Heart,
} from "lucide-react";
import type { InvestmentCall, InvestmentVerdict, DataConfidence, InvestmentHorizon } from "@shared/schema";

interface InvestmentCallCardProps {
  call: InvestmentCall;
  playerName: string;
}

function getVerdictConfig(verdict: InvestmentVerdict) {
  const configs = {
    ACCUMULATE: {
      label: "Accumulate",
      icon: ShoppingCart,
      bgColor: "bg-green-500/10 dark:bg-green-500/20",
      textColor: "text-green-700 dark:text-green-400",
      borderColor: "border-green-500/30",
      description: "Build your position",
    },
    HOLD_CORE: {
      label: "Hold Core",
      icon: Eye,
      bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
      textColor: "text-blue-700 dark:text-blue-400",
      borderColor: "border-blue-500/30",
      description: "Keep what you have",
    },
    TRADE_THE_HYPE: {
      label: "Trade the Hype",
      icon: TrendingDown,
      bgColor: "bg-orange-500/10 dark:bg-orange-500/20",
      textColor: "text-orange-700 dark:text-orange-400",
      borderColor: "border-orange-500/30",
      description: "Take profits now",
    },
    AVOID_NEW_MONEY: {
      label: "Avoid",
      icon: Ban,
      bgColor: "bg-red-500/10 dark:bg-red-500/20",
      textColor: "text-red-700 dark:text-red-400",
      borderColor: "border-red-500/30",
      description: "Stay away",
    },
    SPECULATIVE_FLYER: {
      label: "Speculative",
      icon: Zap,
      bgColor: "bg-purple-500/10 dark:bg-purple-500/20",
      textColor: "text-purple-700 dark:text-purple-400",
      borderColor: "border-purple-500/30",
      description: "Lottery ticket only",
    },
    HOLD_ROLE_RISK: {
      label: "Hold (Role Risk)",
      icon: Eye,
      bgColor: "bg-amber-500/10 dark:bg-amber-500/20",
      textColor: "text-amber-700 dark:text-amber-400",
      borderColor: "border-amber-500/30",
      description: "Monitor role situation",
    },
    HOLD_INJURY_CONTINGENT: {
      label: "Hold (Injury Hedge)",
      icon: Eye,
      bgColor: "bg-cyan-500/10 dark:bg-cyan-500/20",
      textColor: "text-cyan-700 dark:text-cyan-400",
      borderColor: "border-cyan-500/30",
      description: "Value depends on opportunity",
    },
    SPECULATIVE_SUPPRESSED: {
      label: "Speculative Buy",
      icon: Zap,
      bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20",
      textColor: "text-emerald-700 dark:text-emerald-400",
      borderColor: "border-emerald-500/30",
      description: "Suppressed value opportunity",
    },
    AVOID_STRUCTURAL: {
      label: "Avoid",
      icon: Ban,
      bgColor: "bg-red-600/10 dark:bg-red-600/20",
      textColor: "text-red-800 dark:text-red-400",
      borderColor: "border-red-600/30",
      description: "Structural decline",
    },
  };
  return configs[verdict];
}

function getConfidenceConfig(confidence: DataConfidence) {
  const configs = {
    HIGH: { label: "High Confidence", color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" },
    MEDIUM: { label: "Medium Confidence", color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
    LOW: { label: "Low Confidence", color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" },
  };
  return configs[confidence];
}

function getHorizonConfig(horizon: InvestmentHorizon) {
  const configs = {
    SHORT: { label: "1-3 months", icon: Clock },
    MID: { label: "3-12 months", icon: Clock },
    LONG: { label: "1+ years", icon: Clock },
  };
  return configs[horizon];
}

export function InvestmentCallCard({ call, playerName }: InvestmentCallCardProps) {
  const [showTriggers, setShowTriggers] = useState(false);
  
  const verdictConfig = getVerdictConfig(call.verdict);
  const confConfig = getConfidenceConfig(call.confidence);
  const horizonConfig = getHorizonConfig(call.timeHorizon);
  const VerdictIcon = verdictConfig.icon;

  return (
    <Card 
      className={`overflow-visible ${verdictConfig.borderColor} border-2`}
      data-testid="card-investment-call"
    >
      <CardHeader className="pb-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div 
            className={`flex items-center gap-3 px-4 py-3 rounded-lg ${verdictConfig.bgColor} ${verdictConfig.textColor} min-w-fit`}
            data-testid="badge-verdict"
          >
            <VerdictIcon className="h-6 w-6" />
            <div>
              <div className="font-bold text-lg">{verdictConfig.label}</div>
              <div className="text-sm opacity-80">{verdictConfig.description}</div>
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={confConfig.color} data-testid="badge-confidence">
                {confConfig.label}
              </Badge>
              <Badge variant="outline" className="bg-muted/50" data-testid="badge-horizon">
                <horizonConfig.icon className="h-3 w-3 mr-1" />
                {horizonConfig.label}
              </Badge>
              <Badge variant="outline" className="bg-muted/50" data-testid="badge-posture">
                {call.postureLabel}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-rationale">
              {call.oneLineRationale}
            </p>
            
            {call.confidenceNote && (
              <div className="flex items-start gap-2 mt-2 p-2 rounded bg-muted/50 border border-muted" data-testid="text-confidence-note">
                <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span className="text-xs text-muted-foreground">{call.confidenceNote}</span>
              </div>
            )}
            
            {call.collectorTip && (
              <div className="flex items-start gap-2 mt-2 p-2 rounded bg-pink-500/10 dark:bg-pink-500/20 border border-pink-500/30" data-testid="text-collector-tip">
                <Heart className="h-4 w-4 text-pink-600 dark:text-pink-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-pink-700 dark:text-pink-300">{call.collectorTip}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Why This Call
            </h4>
            <ul className="space-y-1.5">
              {call.whyBullets.map((bullet, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Action Plan
            </h4>
            <div className="space-y-2 text-sm">
              <div className="p-2 rounded bg-muted/50">
                <span className="font-medium">Now:</span>{" "}
                <span className="text-muted-foreground">{call.actionPlan.whatToDoNow}</span>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <span className="font-medium">Entry:</span>{" "}
                <span className="text-muted-foreground">{call.actionPlan.entryPlan}</span>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <span className="font-medium">Size:</span>{" "}
                <span className="text-muted-foreground">{call.actionPlan.positionSizing}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              What Breaks This
            </h4>
            <ul className="space-y-1.5">
              {call.thesisBreakers.map((breaker, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-destructive mt-1">•</span>
                  <span>{breaker}</span>
                </li>
              ))}
            </ul>
          </div>

          {call.actionGuidance && (
            <div className="space-y-2" data-testid="section-action-guidance">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                {call.actionGuidance.header}
              </h4>
              <ul className="space-y-1.5">
                {call.actionGuidance.bullets.map((bullet, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-amber-500 mt-1">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {((call.whatToBuy?.length ?? 0) > 0 || (call.whatToSell?.length ?? 0) > 0 || (call.whatToAvoid?.length ?? 0) > 0) && (
          <div className="pt-4 border-t">
            <div className="grid gap-4 md:grid-cols-3">
              {call.whatToBuy && call.whatToBuy.length > 0 && (
                <div className="space-y-2" data-testid="section-what-to-buy">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
                    <ShoppingCart className="h-4 w-4" />
                    Cards to Buy
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {call.whatToBuy.map((card, i) => (
                      <Badge key={i} variant="outline" className="bg-green-500/5 text-green-700 dark:text-green-400 border-green-500/20 text-xs">
                        {card}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {call.whatToSell && call.whatToSell.length > 0 && (
                <div className="space-y-2" data-testid="section-what-to-sell">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-orange-700 dark:text-orange-400">
                    <CircleDollarSign className="h-4 w-4" />
                    Cards to Sell
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {call.whatToSell.map((card, i) => (
                      <Badge key={i} variant="outline" className="bg-orange-500/5 text-orange-700 dark:text-orange-400 border-orange-500/20 text-xs">
                        {card}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {call.whatToAvoid && call.whatToAvoid.length > 0 && (
                <div className="space-y-2" data-testid="section-what-to-avoid">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
                    <Ban className="h-4 w-4" />
                    Cards to Avoid
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {call.whatToAvoid.map((card, i) => (
                      <Badge key={i} variant="outline" className="bg-red-500/5 text-red-700 dark:text-red-400 border-red-500/20 text-xs">
                        {card}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {((call.triggersToUpgrade?.length ?? 0) > 0 || (call.triggersToDowngrade?.length ?? 0) > 0) && (
          <Collapsible open={showTriggers} onOpenChange={setShowTriggers}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-2">
              {showTriggers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showTriggers ? "Hide" : "Show"} What Changes This Call
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                {call.triggersToUpgrade && call.triggersToUpgrade.length > 0 && (
                  <div className="space-y-2 p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                    <h5 className="font-medium text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
                      <ArrowUpCircle className="h-4 w-4" />
                      Upgrade Triggers
                    </h5>
                    <ul className="space-y-1">
                      {call.triggersToUpgrade.map((trigger, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-green-600 mt-1">+</span>
                          <span>{trigger}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {call.triggersToDowngrade && call.triggersToDowngrade.length > 0 && (
                  <div className="space-y-2 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    <h5 className="font-medium text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
                      <ArrowDownCircle className="h-4 w-4" />
                      Downgrade Triggers
                    </h5>
                    <ul className="space-y-1">
                      {call.triggersToDowngrade.map((trigger, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-red-600 mt-1">-</span>
                          <span>{trigger}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
