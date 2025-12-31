import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ChevronUp,
  AlertTriangle,
  ShoppingCart,
  Ban,
  BookOpen,
  Zap,
  FileText,
  TrendingUp,
  BarChart3,
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
      
      {(advisor.cards.buy.length > 0 || advisor.cards.avoid.length > 0) && (
        <AccordionSection
          title="Cards to Target"
          description="Specific cards to buy or avoid"
          icon={<Zap className="h-4 w-4 text-primary" />}
          testId="accordion-cards"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {advisor.cards.buy.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3 text-green-600" />
                  Cards to Buy
                </h5>
                <div className="flex flex-wrap gap-1">
                  {advisor.cards.buy.map((card, i) => (
                    <Badge key={i} variant="secondary" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                      {card}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {advisor.cards.avoid.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Ban className="h-3 w-3 text-red-600" />
                  Cards to Avoid
                </h5>
                <div className="flex flex-wrap gap-1">
                  {advisor.cards.avoid.map((card, i) => (
                    <Badge key={i} variant="secondary" className="text-xs bg-red-500/10 text-red-700 dark:text-red-400">
                      {card}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
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
      
      {outlook.evidence && (
        <AccordionSection
          title="Supporting Evidence"
          description="Data sources and analysis notes"
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          testId="accordion-evidence"
        >
          <div className="space-y-3">
            {outlook.evidence.compsSummary?.available && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">eBay Comps</p>
                <div className="flex flex-wrap gap-2">
                  {outlook.evidence.compsSummary.median && (
                    <Badge variant="outline" className="text-xs">
                      Median: ${outlook.evidence.compsSummary.median.toFixed(2)}
                    </Badge>
                  )}
                  {outlook.evidence.compsSummary.soldCount && (
                    <Badge variant="outline" className="text-xs">
                      {outlook.evidence.compsSummary.soldCount} sales
                    </Badge>
                  )}
                </div>
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
