import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  TrendingDown, 
  TrendingUp,
  Minus, 
  ShoppingCart, 
  Ban,
  Shield,
  Zap,
  Target,
  Heart,
  Activity,
  BarChart3,
  BarChart2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  User,
  Search,
  ArrowRight,
  Briefcase,
  LineChart,
  Info,
} from "lucide-react";
import type { AdvisorOutlook, TradeTarget } from "@shared/schema";
import { LiquidityBadge } from "@/components/liquidity-badge";

function getVerdictStyles(verdict: AdvisorOutlook["verdict"]) {
  switch (verdict) {
    case "BUY":
      return { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-700 dark:text-green-400", icon: <ShoppingCart className="h-4 w-4" /> };
    case "HOLD_CORE":
      return { bg: "bg-blue-500/10", border: "border-blue-500/40", text: "text-blue-700 dark:text-blue-400", icon: <Shield className="h-4 w-4" /> };
    case "HOLD":
      return { bg: "bg-yellow-500/10", border: "border-yellow-500/40", text: "text-yellow-700 dark:text-yellow-400", icon: <Minus className="h-4 w-4" /> };
    case "TRADE_THE_HYPE":
      return { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-700 dark:text-orange-400", icon: <TrendingDown className="h-4 w-4" /> };
    case "SELL":
      return { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-700 dark:text-orange-400", icon: <TrendingDown className="h-4 w-4" /> };
    case "SPECULATIVE":
      return { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-700 dark:text-amber-400", icon: <Zap className="h-4 w-4" /> };
    case "AVOID":
      return { bg: "bg-red-500/10", border: "border-red-500/40", text: "text-red-700 dark:text-red-400", icon: <Ban className="h-4 w-4" /> };
    default:
      return { bg: "bg-muted", border: "border-muted", text: "text-muted-foreground", icon: <Minus className="h-4 w-4" /> };
  }
}

function getDecisionColor(action: string): { text: string; bg: string; border: string; iconBg: string } {
  if (action.includes("BUY") || action.includes("ADD")) return { text: "text-green-700 dark:text-green-300", bg: "bg-green-50 dark:bg-green-950/40", border: "border-green-300/60 dark:border-green-700/60", iconBg: "bg-green-100 dark:bg-green-900/50" };
  if (action.includes("SELL") || action.includes("EXIT") || action.includes("AVOID") || action.includes("DO NOT")) return { text: "text-red-700 dark:text-red-300", bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-300/60 dark:border-red-700/60", iconBg: "bg-red-100 dark:bg-red-900/50" };
  if (action.includes("WAIT")) return { text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-300/60 dark:border-amber-700/60", iconBg: "bg-amber-100 dark:bg-amber-900/50" };
  if (action.includes("HOLD")) return { text: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-300/60 dark:border-blue-700/60", iconBg: "bg-blue-100 dark:bg-blue-900/50" };
  return { text: "text-muted-foreground", bg: "bg-muted/50", border: "border-border", iconBg: "bg-muted" };
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
  playerStage?: string;
}

export function AdvisorSnapshot({ advisor, playerName, playerStage }: AdvisorSnapshotProps) {
  const v = getVerdictStyles(advisor.verdict);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const holderTargets = advisor.tradeTargets?.targets.filter(t => t.action === "SELL") || [];
  const buyerTargets = advisor.tradeTargets?.targets.filter(t => t.action === "BUY" || t.action === "WATCH") || [];

  const hasMarketData = advisor.shortTermTrend || advisor.percentiles || advisor.topSignals;
  const hasWhy = advisor.advisorTake || advisor.topReasons?.length > 0;
  const hasPlaybook = advisor.actionPlan;
  const hasCollector = advisor.packHitReaction || advisor.collectorTip;

  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

  const convictionColor = advisor.conviction?.level === "High Conviction" ? "text-green-600 dark:text-green-400" :
    advisor.conviction?.level === "Medium Conviction" ? "text-blue-600 dark:text-blue-400" :
    advisor.conviction?.level === "Low Conviction" ? "text-yellow-600 dark:text-yellow-400" :
    "text-red-600 dark:text-red-400";

  const verdictDisplay = advisor.verdict === "TRADE_THE_HYPE" ? "Trade the Hype" : advisor.verdict === "SPECULATIVE" ? "Speculative" : advisor.verdict.replace(/_/g, " ").split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

  return (
    <Card className={`border ${v.border} shadow-md`} data-testid="card-advisor-snapshot">
      <CardContent className="p-0">
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 text-sm" data-testid="text-advisor-verdict">
            <span className={`${v.text}`}>{v.icon}</span>
            <span className={`font-bold ${convictionColor}`}>
              {advisor.conviction?.level || ""}
            </span>
            <span className="text-muted-foreground">•</span>
            <span className={`font-semibold ${v.text}`}>{verdictDisplay}</span>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {playerStage === "PROSPECT" && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400" data-testid="prospect-caveat">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>Pre-debut prospect — signals based on hype, not MLB/NFL/NBA performance</span>
            </div>
          )}
          {advisor.decisions && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="section-decisions">
              <DecisionCard
                icon={<User className="h-4 w-4" />}
                label="If you own"
                action={advisor.decisions.holder.action}
                reason={advisor.decisions.holder.reason}
                targets={holderTargets}
                prefix="holder"
                testId="decision-holder"
              />
              <DecisionCard
                icon={<Search className="h-4 w-4" />}
                label="If you want exposure"
                action={advisor.decisions.buyer.action}
                reason={advisor.decisions.buyer.reason}
                targets={buyerTargets}
                prefix="buyer"
                testId="decision-buyer"
                caveat={advisor.tradeTargets?.caveat && advisor.tradeTargets.targets.length === 0 ? advisor.tradeTargets.caveat : undefined}
              />
            </div>
          )}

          {advisor.advisorTake && (
            <p className="text-sm text-muted-foreground leading-snug" data-testid="text-advisor-take">
              {advisor.advisorTake}
            </p>
          )}

          <div className="border-t border-border pt-4 space-y-1" data-testid="section-analysis-details">
            {hasMarketData && (
              <AccordionSection
                id="market"
                icon={<LineChart className="h-4 w-4" />}
                title="Market Data"
                badges={buildMarketBadges(advisor)}
                isOpen={openSection === "market"}
                onToggle={() => toggle("market")}
              >
                <MarketDataContent advisor={advisor} />
              </AccordionSection>
            )}

            {hasWhy && (
              <AccordionSection
                id="why"
                icon={<Info className="h-4 w-4" />}
                title="Why"
                badges={advisor.conviction?.narrative ? [advisor.conviction.narrative] : undefined}
                isOpen={openSection === "why"}
                onToggle={() => toggle("why")}
              >
                <WhyContent advisor={advisor} />
              </AccordionSection>
            )}

            {hasPlaybook && (
              <AccordionSection
                id="playbook"
                icon={<Briefcase className="h-4 w-4" />}
                title="Playbook"
                badges={[advisor.actionPlan.now]}
                isOpen={openSection === "playbook"}
                onToggle={() => toggle("playbook")}
              >
                <PlaybookContent advisor={advisor} />
              </AccordionSection>
            )}

            {hasCollector && (
              <AccordionSection
                id="collector"
                icon={<Heart className="h-4 w-4" />}
                title="Collector Corner"
                isOpen={openSection === "collector"}
                onToggle={() => toggle("collector")}
              >
                <CollectorContent advisor={advisor} />
              </AccordionSection>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionCard({ icon, label, action, reason, targets, prefix, testId, caveat }: {
  icon: React.ReactNode;
  label: string;
  action: string;
  reason: string;
  targets: TradeTarget[];
  prefix: string;
  testId: string;
  caveat?: string;
}) {
  const colors = getDecisionColor(action);

  return (
    <div className={`rounded-xl border-2 p-4 ${colors.bg} ${colors.border} transition-all`} data-testid={testId}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${colors.iconBg}`}>
          {icon}
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <ArrowRight className={`h-5 w-5 shrink-0 ${colors.text}`} />
        <p className={`text-xl font-extrabold tracking-tight ${colors.text}`} data-testid={`text-${prefix}-action`}>
          {action}
        </p>
      </div>
      <p className="text-sm text-muted-foreground leading-snug">{reason}</p>
      {targets.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
          {targets.slice(0, 2).map((target, i) => (
            <InlineTarget key={i} target={target} index={i} prefix={prefix} />
          ))}
        </div>
      )}
      {caveat && (
        <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5 italic">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          {caveat}
        </p>
      )}
    </div>
  );
}

function InlineTarget({ target, index, prefix }: { target: TradeTarget; index: number; prefix: string }) {
  const actionColor = target.action === "BUY" ? "text-green-600 dark:text-green-400" 
    : target.action === "SELL" ? "text-red-600 dark:text-red-400"
    : "text-amber-600 dark:text-amber-400";

  return (
    <div className="flex items-center gap-2 text-xs" data-testid={`${prefix}-target-${index}`}>
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${actionColor} border-current`}>{target.action}</Badge>
      <span className="text-foreground truncate font-medium">{target.card}</span>
      {target.price && <span className="text-muted-foreground shrink-0 tabular-nums">{target.price}</span>}
    </div>
  );
}

function AccordionSection({ id, icon, title, badges, isOpen, onToggle, children }: {
  id: string;
  icon: React.ReactNode;
  title: string;
  badges?: string[];
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={`accordion-${id}`}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full py-2.5 text-left group hover:bg-muted/30 rounded-lg px-2 -mx-2 transition-colors"
        data-testid={`button-toggle-${id}`}
      >
        <div className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="text-muted-foreground shrink-0">{icon}</div>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {!isOpen && badges && badges.length > 0 && (
          <span className="text-xs text-muted-foreground truncate ml-auto max-w-[50%]">
            {badges[0].length > 60 ? badges[0].slice(0, 60) + "…" : badges[0]}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="pl-8 pr-2 pb-3 pt-1 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function buildMarketBadges(advisor: AdvisorOutlook): string[] | undefined {
  const parts: string[] = [];
  if (advisor.shortTermTrend?.priceTrend7d) parts.push(`${advisor.shortTermTrend.priceTrend7d} 7d`);
  if (advisor.shortTermTrend?.avgPrice) parts.push(advisor.shortTermTrend.avgPrice);
  if (advisor.marketPhase) parts.push(advisor.marketPhase);
  return parts.length > 0 ? [parts.join(" · ")] : undefined;
}

function MarketDataContent({ advisor }: { advisor: AdvisorOutlook }) {
  const riskLevel = advisor.structure === "Weak" ? "High Risk" : advisor.structure === "Strong" ? "Low Risk" : "Moderate Risk";
  const riskColor = advisor.structure === "Weak" ? "text-red-600 border-red-300" : advisor.structure === "Strong" ? "text-green-600 border-green-300" : "text-yellow-600 border-yellow-300";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {advisor.marketPhase && (
          <Badge variant="secondary" className="text-xs font-medium" data-testid="badge-market-phase">
            <Activity className="h-3 w-3 mr-1" />
            {advisor.marketPhase}
          </Badge>
        )}
        {advisor.structure && (
          <Badge variant="outline" className={`text-xs font-medium ${riskColor}`} data-testid="badge-structure">
            {riskLevel}
          </Badge>
        )}
      </div>

      {advisor.shortTermTrend && (
        <div className="space-y-1.5" data-testid="row-short-term-trend">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Price & Volume ({advisor.horizon})</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {advisor.shortTermTrend.priceTrend7d && (
              <span className="flex items-center gap-1">
                {advisor.shortTermTrend.priceTrend7d.startsWith("+") ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                <span className="font-semibold text-foreground">{advisor.shortTermTrend.priceTrend7d}</span> 7d
              </span>
            )}
            {advisor.shortTermTrend.priceTrend14d && (
              <span className="flex items-center gap-1">
                {advisor.shortTermTrend.priceTrend14d.startsWith("+") ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                <span className="font-semibold text-foreground">{advisor.shortTermTrend.priceTrend14d}</span> ~14d
              </span>
            )}
            {advisor.shortTermTrend.priceTrend30d && (
              <span className="flex items-center gap-1">
                {advisor.shortTermTrend.priceTrend30d.startsWith("+") ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                <span className="font-semibold text-foreground">{advisor.shortTermTrend.priceTrend30d}</span> 30d
              </span>
            )}
            {advisor.shortTermTrend.volumeDirection && (
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Vol {advisor.shortTermTrend.volumeDirection}
              </span>
            )}
            {advisor.shortTermTrend.soldCount7d !== undefined && <span>{advisor.shortTermTrend.soldCount7d} sold/7d</span>}
            {advisor.shortTermTrend.soldCount30d !== undefined && <span>{advisor.shortTermTrend.soldCount30d} sold/30d</span>}
            {advisor.shortTermTrend.avgPrice && <span>{advisor.shortTermTrend.avgPrice} avg</span>}
          </div>
        </div>
      )}

      {advisor.topSignals && advisor.topSignals.length > 0 && (
        <div data-testid="row-top-signals">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Key Signals</p>
          <div className="flex flex-wrap gap-1.5">
            {advisor.topSignals.map((signal, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal">{signal}</Badge>
            ))}
          </div>
        </div>
      )}

      {advisor.percentiles && (
        <div data-testid="row-percentile-rankings">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <BarChart2 className="h-3 w-3" />
            Relative Ranking
            {advisor.percentiles.sampleSize && advisor.percentiles.sampleSize < 100 && (
              <span className="font-normal text-muted-foreground/60 ml-1">({advisor.percentiles.sampleSize} players)</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {advisor.percentiles.marketScore && <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.marketScore)}`} data-testid="badge-pct-market">Market: {advisor.percentiles.marketScore}</Badge>}
            {advisor.percentiles.demand && <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.demand)}`} data-testid="badge-pct-demand">Demand: {advisor.percentiles.demand}</Badge>}
            {advisor.percentiles.momentum && <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.momentum)}`} data-testid="badge-pct-momentum">Momentum: {advisor.percentiles.momentum}</Badge>}
            {advisor.percentiles.hype && <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.hype)}`} data-testid="badge-pct-hype">Hype: {advisor.percentiles.hype}</Badge>}
            {advisor.percentiles.quality && <Badge variant="outline" className={`text-xs font-medium ${getPercentileColor(advisor.percentiles.quality)}`} data-testid="badge-pct-quality">Quality: {advisor.percentiles.quality}</Badge>}
          </div>
        </div>
      )}
    </>
  );
}

function WhyContent({ advisor }: { advisor: AdvisorOutlook }) {
  return (
    <>
      {advisor.conviction?.narrative && (
        <p className="text-xs text-muted-foreground italic" data-testid="text-conviction-narrative">
          {advisor.conviction.narrative}
        </p>
      )}
      {advisor.topReasons && advisor.topReasons.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <Target className="h-3 w-3" />
            Top Reasons
          </p>
          <ul className="space-y-1">
            {advisor.topReasons.map((reason, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5 font-bold">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function PlaybookContent({ advisor }: { advisor: AdvisorOutlook }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Badge variant="outline" className="text-[11px] shrink-0 font-semibold">Now</Badge>
        <span className="text-sm text-foreground">{advisor.actionPlan.now}</span>
      </div>
      <div className="flex items-start gap-2">
        <Badge variant="outline" className="text-[11px] shrink-0 font-semibold">Entry</Badge>
        <span className="text-sm text-foreground">{advisor.actionPlan.entryRule}</span>
      </div>
      <div className="flex items-start gap-2">
        <Badge variant="outline" className="text-[11px] shrink-0 font-semibold">Size</Badge>
        <span className="text-sm text-foreground">{advisor.actionPlan.sizingRule}</span>
      </div>
    </div>
  );
}

function CollectorContent({ advisor }: { advisor: AdvisorOutlook }) {
  return (
    <div className="space-y-2">
      {advisor.packHitReaction && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <Zap className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm font-medium" data-testid="text-pack-hit-reaction">
            {advisor.packHitReaction}
          </span>
        </div>
      )}
      {advisor.collectorTip && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-pink-500/5 border border-pink-500/20">
          <Heart className="h-4 w-4 text-pink-500 shrink-0" />
          <span className="text-sm text-pink-700 dark:text-pink-300" data-testid="text-collector-tip">
            {advisor.collectorTip}
          </span>
        </div>
      )}
    </div>
  );
}
