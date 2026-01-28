import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ChevronUp,
  AlertTriangle,
  ShoppingCart,
  BookOpen,
  FileText,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Layers,
  Target,
  DollarSign,
  Eye,
} from "lucide-react";
import type { AdvisorOutlook, PlayerOutlookResponse } from "@shared/schema";

interface AccordionSectionProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  testId: string;
}

function AccordionSection({ title, description, icon, defaultOpen = false, children, testId }: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card data-testid={testId}>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {icon}
                {title}
              </CardTitle>
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
            {description && <CardDescription className="text-left">{description}</CardDescription>}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface OutlookAccordionsProps {
  advisor: AdvisorOutlook;
  outlook: PlayerOutlookResponse;
}

export function OutlookAccordions({ advisor, outlook }: OutlookAccordionsProps) {
  return (
    <div className="space-y-3">
      {advisor.whatChangesMyMind.length > 0 && (
        <AccordionSection
          title="What Changes My Mind"
          description="Conditions that would break this thesis"
          icon={<AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
          testId="accordion-what-changes"
        >
          <ul className="space-y-2">
            {advisor.whatChangesMyMind.map((item, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </AccordionSection>
      )}
      
      {advisor.buyTriggers.length > 0 && (
        <AccordionSection
          title="Buy Triggers"
          description="What would make this a buy opportunity"
          icon={<TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />}
          testId="accordion-buy-triggers"
        >
          <ul className="space-y-2">
            {advisor.buyTriggers.map((item, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </AccordionSection>
      )}
      
      {outlook.thesis && outlook.thesis.length > 0 && (
        <AccordionSection
          title="Full Thesis"
          description="Complete investment rationale"
          icon={<BookOpen className="h-4 w-4 text-primary" />}
          testId="accordion-thesis"
        >
          <ul className="space-y-2">
            {outlook.thesis.map((bullet, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </AccordionSection>
      )}
      
      {outlook.marketRealityCheck && outlook.marketRealityCheck.length > 0 && (
        <AccordionSection
          title="Market Reality Check"
          description="Uncomfortable truths to consider"
          icon={<AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
          testId="accordion-reality-check"
        >
          <ul className="space-y-2">
            {outlook.marketRealityCheck.map((check, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">−</span>
                <span>{check}</span>
              </li>
            ))}
          </ul>
        </AccordionSection>
      )}
      
      {outlook.peakTiming && (
        <AccordionSection
          title="Peak Timing Analysis"
          description="Where is this player in their value cycle?"
          icon={<BarChart3 className="h-4 w-4 text-primary" />}
          testId="accordion-peak-timing"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {outlook.peakTiming.peakStatus.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-foreground">{outlook.peakTiming.peakReason}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-2 rounded bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-1">Short-Term (3-6m)</p>
                <p className="text-sm text-foreground">{outlook.peakTiming.shortTermOutlook}</p>
              </div>
              <div className="p-2 rounded bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-1">Long-Term (1-2y)</p>
                <p className="text-sm text-foreground">{outlook.peakTiming.longTermOutlook}</p>
              </div>
            </div>
          </div>
        </AccordionSection>
      )}
      
      {outlook.tieredRecommendations && (
        <AccordionSection
          title="Tiered Card Strategy"
          description="Different advice for different card types"
          icon={<Layers className="h-4 w-4 text-primary" />}
          testId="accordion-tiered"
        >
          <div className="space-y-3">
            {[
              { key: "baseCards", label: "Base Cards", desc: "Common base cards ($1-5)", data: outlook.tieredRecommendations.baseCards },
              { key: "midTierParallels", label: "Mid-Tier Parallels", desc: "Numbered parallels, inserts ($10-100)", data: outlook.tieredRecommendations.midTierParallels },
              { key: "premiumGraded", label: "Premium Graded", desc: "PSA 10 rookies, autos ($100+)", data: outlook.tieredRecommendations.premiumGraded },
            ].filter(t => t.data?.verdict).map((tier) => (
              <div key={tier.key} className="p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <Badge className={`min-w-[60px] justify-center ${
                    tier.data!.verdict === "BUY" ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30" :
                    tier.data!.verdict === "SELL" ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30" :
                    "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30"
                  }`}>
                    {tier.data!.verdict === "BUY" ? <ShoppingCart className="h-3 w-3 mr-1" /> :
                     tier.data!.verdict === "SELL" ? <TrendingDown className="h-3 w-3 mr-1" /> :
                     <Eye className="h-3 w-3 mr-1" />}
                    {tier.data!.verdict}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{tier.label}</p>
                    <p className="text-xs text-muted-foreground">{tier.desc}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground sm:max-w-[50%] sm:text-right">{tier.data!.reasoning}</p>
              </div>
            ))}
          </div>
        </AccordionSection>
      )}
      
      {outlook.discountAnalysis && (outlook.discountAnalysis.whyDiscounted?.length || outlook.discountAnalysis.repricingCatalysts?.length) && (
        <AccordionSection
          title="Hidden Gem Analysis"
          description="Why this player might be underpriced"
          icon={<Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          testId="accordion-discount"
        >
          <div className="space-y-4">
            {outlook.discountAnalysis.whyDiscounted && outlook.discountAnalysis.whyDiscounted.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Why Discounted</h4>
                <ul className="space-y-2">
                  {outlook.discountAnalysis.whyDiscounted.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outlook.discountAnalysis.repricingCatalysts && outlook.discountAnalysis.repricingCatalysts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Repricing Catalysts</h4>
                <ul className="space-y-2">
                  {outlook.discountAnalysis.repricingCatalysts.map((catalyst, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <span className="text-foreground">{catalyst}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outlook.discountAnalysis.trapRisks && outlook.discountAnalysis.trapRisks.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Value Trap Risks</h4>
                <ul className="space-y-2">
                  {outlook.discountAnalysis.trapRisks.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <span className="text-foreground">{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </AccordionSection>
      )}
      
      {outlook.evidence && (
        <AccordionSection
          title="Supporting Evidence"
          description="Data sources and analysis notes"
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          testId="accordion-evidence"
        >
          <div className="space-y-3">
            {outlook.evidence.compsSummary?.available && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Comps</p>
                <div className="flex flex-wrap gap-2">
                  {outlook.evidence.compsSummary.median && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-comps-avg">
                      Avg: ${outlook.evidence.compsSummary.median.toFixed(2)}
                    </Badge>
                  )}
                  {outlook.evidence.compsSummary.estimatedVolume && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-comps-volume">
                      Volume: {outlook.evidence.compsSummary.estimatedVolume}
                    </Badge>
                  )}
                  {outlook.evidence.compsSummary.volumeTrend && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        outlook.evidence.compsSummary.volumeTrend === "up" ? "text-green-600" :
                        outlook.evidence.compsSummary.volumeTrend === "down" ? "text-red-600" : ""
                      }`}
                      data-testid="badge-comps-trend"
                    >
                      Trend: {outlook.evidence.compsSummary.volumeTrend === "up" ? "↑" : 
                              outlook.evidence.compsSummary.volumeTrend === "down" ? "↓" : "→"}
                    </Badge>
                  )}
                  {outlook.evidence.compsSummary.soldCount && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-comps-sales">
                      {outlook.evidence.compsSummary.soldCount} sales
                    </Badge>
                  )}
                </div>
                {/* Category breakdown from Gemini search */}
                {outlook.evidence.compsSummary.breakdown && outlook.evidence.compsSummary.breakdown.length > 0 && (
                  <div className="mt-2 space-y-1" data-testid="comps-breakdown">
                    <p className="text-xs text-muted-foreground">Price by Category:</p>
                    <div className="grid grid-cols-2 gap-1">
                      {outlook.evidence.compsSummary.breakdown.map((cat, i) => (
                        <div key={i} className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1" data-testid={`comps-category-${i}`}>
                          <span className="font-medium">{cat.category}:</span> ${cat.avgPrice.toFixed(2)}
                          <span className="text-muted-foreground/60 ml-1">({cat.priceRange})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {outlook.evidence.notes && outlook.evidence.notes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Analysis Notes</p>
                <ul className="space-y-1">
                  {outlook.evidence.notes.map((note, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outlook.evidence.newsSnippets && outlook.evidence.newsSnippets.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">News Context</p>
                <ul className="space-y-1">
                  {outlook.evidence.newsSnippets.slice(0, 3).map((snippet, i) => (
                    <li key={i} className="text-sm text-muted-foreground p-2 rounded bg-muted/30">
                      "{snippet}"
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outlook.cacheStatus && (
              <p className="text-xs text-muted-foreground">
                Cache status: {outlook.cacheStatus}
                {outlook.generatedAt && ` • Generated: ${new Date(outlook.generatedAt).toLocaleString()}`}
              </p>
            )}
          </div>
        </AccordionSection>
      )}
    </div>
  );
}
