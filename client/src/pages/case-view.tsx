import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { sanitizeCardField } from "@/lib/sanitizeCardField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  LayoutGrid, 
  ArrowLeft,
  Calendar,
  ImageIcon,
  Lock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  Edit,
  Share2,
  Link as LinkIcon,
  Download,
  Instagram,
  Smartphone,
  Trophy,
  Wallet,
  Zap,
  ShoppingCart,
  Sparkles,
  X,
  Target,
  AlertCircle,
  AlertTriangle,
  Check,
  Star,
  ArrowRight,
  Search,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card as CardUI, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasProAccess } from "@shared/schema";
import type { DisplayCaseWithCards, Card, User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CardDetailModal } from "@/components/card-detail-modal";
import { SocialFeatures } from "@/components/social-features";
import { PrestigeDisplay } from "@/components/prestige-display";
import { FollowButton } from "@/components/follow-button";
import { FollowStats } from "@/components/follow-stats";
import { MessageButton } from "@/components/message-button";
import { OutlookBadge } from "@/components/outlook-badge";
import { ProFeatureGate, ProBadge } from "@/components/pro-feature-gate";
import { Crown } from "lucide-react";

function PortfolioInsightLine({ cards }: { cards: Card[] }) {
  // Analyze the portfolio characteristics
  const positions: Record<string, number> = {};
  const sports: Record<string, number> = {};
  const legacyTiers: Record<string, number> = {};
  let rookieCount = 0;
  let autoCount = 0;
  let numberedCount = 0;
  
  cards.forEach(card => {
    if (card.position) positions[card.position] = (positions[card.position] || 0) + 1;
    if (card.sport) sports[card.sport] = (sports[card.sport] || 0) + 1;
    if (card.legacyTier) legacyTiers[card.legacyTier] = (legacyTiers[card.legacyTier] || 0) + 1;
    if (card.isRookie) rookieCount++;
    if (card.hasAuto) autoCount++;
    if (card.isNumbered) numberedCount++;
  });
  
  const totalCards = cards.length;
  const topPosition = Object.entries(positions).sort((a, b) => b[1] - a[1])[0];
  const topSport = Object.entries(sports).sort((a, b) => b[1] - a[1])[0];
  
  // Determine stability profile
  const retiredLegendCount = (legacyTiers["HOF"] || 0) + (legacyTiers["RETIRED"] || 0) + (legacyTiers["LEGEND_DECEASED"] || 0);
  const activeStarCount = (legacyTiers["SUPERSTAR"] || 0) + (legacyTiers["STAR"] || 0);
  const speculativeCount = (legacyTiers["PROSPECT"] || 0) + (legacyTiers["RISING_STAR"] || 0);
  
  // Build insight message
  let insight = "";
  
  if (retiredLegendCount >= totalCards * 0.6) {
    insight = "Legacy-focused collection with high stability and low volatility.";
  } else if (speculativeCount >= totalCards * 0.5) {
    insight = "Growth-oriented portfolio with higher upside potential and volatility.";
  } else if (rookieCount >= totalCards * 0.7) {
    insight = "Rookie-heavy collection - high upside but timing-sensitive.";
  } else if (topPosition && (topPosition[1] / totalCards) >= 0.8) {
    insight = `Concentrated in ${topPosition[0]}s - strong conviction, less diversification.`;
  } else if (activeStarCount >= totalCards * 0.5) {
    insight = "Balanced mix of proven stars - stable with moderate growth potential.";
  } else if (autoCount >= totalCards * 0.6 || numberedCount >= totalCards * 0.6) {
    insight = "Premium card focus with strong collector appeal and tighter supply.";
  } else {
    const sportCount = Object.keys(sports).length;
    if (sportCount >= 3) {
      insight = "Multi-sport diversification reduces single-market risk.";
    } else if (topSport) {
      insight = `${topSport[0].charAt(0).toUpperCase() + topSport[0].slice(1)}-focused collection with varied career stages.`;
    } else {
      insight = "Diversified collection across multiple player profiles.";
    }
  }
  
  return (
    <div className="mt-2 p-2 bg-muted/50 rounded-md" data-testid="portfolio-insight">
      <p className="text-sm text-muted-foreground italic">
        <Zap className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
        {insight}
      </p>
    </div>
  );
}

function ValueChangeIndicator({ card }: { card: Card }) {
  // Use manualValue if set, otherwise estimatedValue
  const currentValue = card.manualValue ?? card.estimatedValue;
  if (!currentValue || !card.previousValue || card.previousValue <= 0) return null;
  
  const change = currentValue - card.previousValue;
  if (Math.abs(change) < 0.01) return null;
  
  const percentChange = ((change / card.previousValue) * 100).toFixed(1);
  const isPositive = change > 0;
  
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPositive ? '+' : ''}{percentChange}%
    </span>
  );
}

interface CaseTier {
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  threshold: number;
}

function caseTier(total: number): CaseTier {
  if (total >= 100000) return { label: "Vault", textClass: "text-violet-600 dark:text-violet-300", bgClass: "bg-violet-500/10 dark:bg-violet-400/10", borderClass: "border-violet-500/30 dark:border-violet-400/30", threshold: 100000 };
  if (total >= 25000) return { label: "Platinum", textClass: "text-cyan-700 dark:text-cyan-300", bgClass: "bg-cyan-500/10 dark:bg-cyan-400/10", borderClass: "border-cyan-500/30 dark:border-cyan-400/30", threshold: 25000 };
  if (total >= 5000) return { label: "Gold", textClass: "text-amber-700 dark:text-amber-300", bgClass: "bg-amber-500/10 dark:bg-amber-400/10", borderClass: "border-amber-500/40 dark:border-amber-400/30", threshold: 5000 };
  if (total >= 500) return { label: "Silver", textClass: "text-slate-700 dark:text-slate-200", bgClass: "bg-slate-500/10 dark:bg-slate-400/10", borderClass: "border-slate-500/30 dark:border-slate-400/30", threshold: 500 };
  return { label: "Bronze", textClass: "text-orange-700 dark:text-orange-300", bgClass: "bg-orange-500/10 dark:bg-orange-400/10", borderClass: "border-orange-500/30 dark:border-orange-400/30", threshold: 0 };
}

function CaseStatsStrip({ cards }: { cards: Card[] }) {
  if (!cards || cards.length === 0) return null;

  // Total value (manualValue overrides estimatedValue, same as elsewhere in the page).
  const totalValue = cards.reduce((sum, c) => sum + (c.manualValue ?? c.estimatedValue ?? 0), 0);

  // Weighted recent change: sum(currentValue - prevValue) / sum(prevValue) for cards that have both.
  // This is a value-weighted % rather than simple-average so a $5k card moves the needle more than a $5 card.
  let prevTotal = 0;
  let curTotalForChange = 0;
  let topMover: { card: Card; pct: number } | null = null;
  for (const c of cards) {
    const cur = c.manualValue ?? c.estimatedValue ?? 0;
    const prev = c.previousValue ?? 0;
    if (prev > 0 && cur > 0) {
      prevTotal += prev;
      curTotalForChange += cur;
      const pct = ((cur - prev) / prev) * 100;
      if (!topMover || Math.abs(pct) > Math.abs(topMover.pct)) topMover = { card: c, pct };
    }
  }
  const weightedChangePct = prevTotal > 0 ? ((curTotalForChange - prevTotal) / prevTotal) * 100 : null;

  // Verdict tally — uses the same outlookAction values OutlookBadge knows about.
  const verdictCounts: Record<string, number> = {};
  for (const c of cards) {
    if (!c.outlookAction) continue;
    const key = c.outlookAction.toUpperCase();
    verdictCounts[key] = (verdictCounts[key] || 0) + 1;
  }
  const verdictEntries = Object.entries(verdictCounts).sort((a, b) => b[1] - a[1]);
  const totalWithVerdict = verdictEntries.reduce((s, [, n]) => s + n, 0);
  const dominantVerdict = verdictEntries[0]?.[0] || null;
  const dominantShare = dominantVerdict ? Math.round((verdictCounts[dominantVerdict] / totalWithVerdict) * 100) : 0;
  const verdictColor = (v: string) => {
    if (v === "BUY") return { dot: "bg-green-500", text: "text-green-700 dark:text-green-400" };
    if (v === "SELL") return { dot: "bg-red-500", text: "text-red-700 dark:text-red-400" };
    return { dot: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-400" };
  };

  const tier = caseTier(totalValue);
  const gradedCount = cards.filter((c) => c.grade && String(c.grade).trim() !== "").length;

  // Layout: 2-col on mobile, 5-col from md up. Always renders on the page background
  // (never inside a themed mat) so contrast is predictable across all 8 case themes.
  return (
    <div
      className="rounded-xl border bg-card/50 backdrop-blur-sm p-4 md:p-5 mb-6 grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6"
      data-testid="case-stats-strip"
    >
      {/* Case Value + tier */}
      <div className="col-span-2 md:col-span-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Case Value</div>
        <div className="text-2xl md:text-3xl font-semibold leading-none" data-testid="stat-case-value">
          ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div className="mt-2">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${tier.bgClass} ${tier.textClass} ${tier.borderClass}`}
            data-testid={`badge-case-tier-${tier.label.toLowerCase()}`}
          >
            <Trophy className="h-2.5 w-2.5" />
            {tier.label} Tier
          </span>
        </div>
      </div>

      {/* Recent change */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Recent Change</div>
        {weightedChangePct === null ? (
          <div className="text-lg font-medium text-muted-foreground leading-none" data-testid="stat-recent-change-empty">—</div>
        ) : (
          <div
            className={`text-2xl font-semibold leading-none inline-flex items-center gap-1 ${weightedChangePct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            data-testid="stat-recent-change"
          >
            {weightedChangePct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {weightedChangePct >= 0 ? '+' : ''}{weightedChangePct.toFixed(1)}%
          </div>
        )}
        <div className="text-[11px] text-muted-foreground mt-2">value-weighted</div>
      </div>

      {/* Cards count + breakdown */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Cards</div>
        <div className="text-2xl font-semibold leading-none" data-testid="stat-card-count">{cards.length}</div>
        <div className="text-[11px] text-muted-foreground mt-2">
          {gradedCount} graded
        </div>
      </div>

      {/* Dominant verdict */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Dominant Signal</div>
        {dominantVerdict ? (
          <>
            <div className="flex items-center gap-2" data-testid="stat-dominant-verdict">
              <span className={`w-2 h-2 rounded-full ${verdictColor(dominantVerdict).dot}`} />
              <span className={`text-xl md:text-2xl font-semibold leading-none ${verdictColor(dominantVerdict).text}`}>
                {dominantVerdict === "MONITOR" ? "Monitor" : dominantVerdict === "BUY" ? "Buy" : dominantVerdict === "SELL" ? "Sell" : dominantVerdict}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">{dominantShare}% of signaled cards</div>
          </>
        ) : (
          <>
            <div className="text-lg font-medium text-muted-foreground leading-none">—</div>
            <div className="text-[11px] text-muted-foreground mt-2">no signals yet</div>
          </>
        )}
      </div>

      {/* Top mover */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Top Mover</div>
        {topMover ? (
          <>
            <div className="text-sm md:text-base font-medium leading-tight truncate" data-testid="stat-top-mover-name" title={topMover.card.title}>
              {topMover.card.title}
            </div>
            <div
              className={`text-sm font-semibold mt-1 inline-flex items-center gap-0.5 ${topMover.pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              data-testid="stat-top-mover-pct"
            >
              {topMover.pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {topMover.pct >= 0 ? '+' : ''}{topMover.pct.toFixed(1)}%
            </div>
          </>
        ) : (
          <>
            <div className="text-lg font-medium text-muted-foreground leading-none">—</div>
            <div className="text-[11px] text-muted-foreground mt-2">no price history</div>
          </>
        )}
      </div>
    </div>
  );
}

type ThemeStyle = {
  bg: string;
  frame: string;
  glass: string;
  mat: string;
  text: string;
  textMuted: string;
  isHolo?: boolean;
};

const THEME_STYLES: Record<string, ThemeStyle> = {
  "classic": {
    bg: "bg-gradient-to-b from-amber-100 to-amber-200 dark:from-amber-950 dark:to-amber-900",
    frame: "bg-amber-800 dark:bg-amber-900 border-amber-900 dark:border-amber-950",
    glass: "bg-white/10 dark:bg-white/5",
    mat: "bg-amber-50 dark:bg-amber-950/50",
    text: "text-stone-900 dark:text-amber-100",
    textMuted: "text-stone-600 dark:text-amber-300/70",
  },
  "midnight": {
    bg: "bg-gradient-to-b from-slate-900 to-slate-950",
    frame: "bg-slate-800 border-slate-900",
    glass: "bg-white/5",
    mat: "bg-slate-800/50",
    text: "text-slate-100",
    textMuted: "text-slate-300/80",
  },
  "wood": {
    bg: "bg-gradient-to-b from-amber-950 to-stone-950",
    frame: "bg-stone-900 border-stone-950",
    glass: "bg-white/5",
    mat: "bg-stone-900/80",
    text: "text-amber-100",
    textMuted: "text-amber-200/70",
  },
  "velvet": {
    bg: "bg-gradient-to-b from-red-950 to-rose-950",
    frame: "bg-stone-800 border-stone-900",
    glass: "bg-white/5",
    mat: "bg-red-950/50",
    text: "text-rose-100",
    textMuted: "text-rose-200/70",
  },
  "ocean": {
    bg: "bg-gradient-to-b from-blue-950 to-cyan-950",
    frame: "bg-blue-900 border-blue-950",
    glass: "bg-white/5",
    mat: "bg-blue-900/50",
    text: "text-cyan-100",
    textMuted: "text-cyan-200/70",
  },
  "emerald": {
    bg: "bg-gradient-to-b from-emerald-950 to-green-950",
    frame: "bg-emerald-900 border-emerald-950",
    glass: "bg-white/5",
    mat: "bg-emerald-900/50",
    text: "text-emerald-100",
    textMuted: "text-emerald-200/70",
  },
  "gold": {
    bg: "bg-gradient-to-b from-yellow-950 to-amber-950",
    frame: "bg-yellow-900 border-yellow-950",
    glass: "bg-white/5",
    mat: "bg-yellow-900/50",
    text: "text-yellow-100",
    textMuted: "text-yellow-200/70",
  },
  "purple": {
    bg: "bg-gradient-to-b from-purple-950 to-violet-950",
    frame: "bg-purple-900 border-purple-950",
    glass: "bg-white/5",
    mat: "bg-purple-900/50",
    text: "text-purple-100",
    textMuted: "text-purple-200/70",
  },
  "holo": {
    // Deep iridescent base with a subtle radial spectrum bloom in the center.
    bg: "bg-[radial-gradient(ellipse_at_center,_#1e1b4b_0%,_#0f0a1f_50%,_#020617_100%)]",
    frame: "bg-slate-800 border-slate-900",
    glass: "bg-white/5",
    // Dark mat so the conic shimmer + tilt on each card pop without competing.
    mat: "bg-slate-900/80",
    text: "text-slate-50",
    textMuted: "text-slate-300/70",
    isHolo: true,
  },
};

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="aspect-square">
          <Skeleton className="w-full h-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// Reads prefers-reduced-motion once on mount. SSR-safe.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

// Cursor-tracking 3D tilt. Uses a ref + requestAnimationFrame so we never
// trigger a React re-render on mousemove. When `enabled` is false (or the
// user prefers reduced motion) we render children inert.
interface TiltWrapperProps {
  enabled: boolean;
  maxDeg?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function TiltWrapper({ enabled, maxDeg = 8, className, style, children }: TiltWrapperProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const reduced = usePrefersReducedMotion();
  const active = enabled && !reduced;

  useEffect(() => {
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!active) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const x = (py - 0.5) * -maxDeg;
    const y = (px - 0.5) * maxDeg;
    if (rafRef.current !== undefined) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = undefined;
      if (innerRef.current) {
        innerRef.current.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
      }
    });
  };

  const handleLeave = () => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    if (innerRef.current) {
      innerRef.current.style.transform = "rotateX(0deg) rotateY(0deg)";
    }
  };

  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
      style={{ perspective: "1000px", ...style }}
    >
      <div
        ref={innerRef}
        className="transition-transform duration-200 ease-out"
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
      >
        {children}
      </div>
    </div>
  );
}

// Iridescent conic-gradient overlay. Sits over the card image and blends in
// via color-dodge. Strengthens on hover via the parent `group`.
function HoloShimmer({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-25 group-hover:opacity-50 transition-opacity duration-300 pointer-events-none"
      style={{
        background:
          "conic-gradient(from 210deg at 50% 50%, #06b6d4, #8b5cf6, #ec4899, #f59e0b, #06b6d4)",
        mixBlendMode: "color-dodge",
        filter: "blur(20px)",
      }}
      data-testid="holo-shimmer"
    />
  );
}

interface CardItemProps {
  card: Card;
  theme: ThemeStyle;
  onClick: () => void;
  featured?: boolean;
  compact?: boolean;
}

function CardItem({ card, theme, onClick, featured = false, compact = false }: CardItemProps) {
  const holo = !!theme.isHolo;
  return (
    <button
      onClick={onClick}
      className={`group relative text-left cursor-pointer w-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
        holo ? "" : "transition-transform duration-200 hover:scale-[1.02]"
      }`}
      data-testid={`card-public-${card.id}`}
    >
      <div className={`${theme.mat} rounded-lg ${compact ? 'p-1.5' : 'p-2'} shadow-lg`}>
        <TiltWrapper enabled={holo} maxDeg={8}>
          <div className="relative rounded overflow-hidden shadow-inner bg-black/20">
            <div style={{ paddingBottom: '140%' }} className="relative">
              <img
                src={card.imagePath || undefined}
                alt={card.title}
                className="absolute inset-0 w-full h-full object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <HoloShimmer enabled={holo} />
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent pointer-events-none" />
            {card.outlookAction && !compact && (
              <div className="absolute top-1 left-1 flex items-center gap-1">
                <OutlookBadge action={card.outlookAction} size="sm" />
                {card.outlookBigMover && (
                  <div
                    className="bg-purple-500/90 p-1 rounded"
                    title="Big Mover Potential"
                    data-testid={`badge-big-mover-${card.id}`}
                  >
                    <Zap className="h-3 w-3 text-white" />
                  </div>
                )}
                {card.outlookSupplyGrowth === "surging" && (
                  <div
                    className="bg-yellow-500/90 p-1 rounded"
                    title="Supply Saturation Alert"
                    data-testid={`badge-supply-alert-${card.id}`}
                  >
                    <AlertTriangle className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
            )}
          </div>
        </TiltWrapper>

        <div className={`mt-2 px-1 ${compact ? 'hidden sm:block' : ''}`}>
          <p className={`font-medium ${compact ? 'text-xs' : 'text-sm'} truncate ${theme.text}`}>{card.title}</p>
          {!compact && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {card.year && (
                <span className={`text-xs ${theme.textMuted}`}>{card.year}</span>
              )}
              {sanitizeCardField(card.variation) && (
                <Badge variant="outline" className={`text-xs bg-transparent border-current ${theme.textMuted}`}>
                  {sanitizeCardField(card.variation)}
                </Badge>
              )}
              {card.grade && (
                <Badge variant="secondary" className="text-xs">
                  {card.grade}
                </Badge>
              )}
            </div>
          )}
          {(card.manualValue ?? card.estimatedValue) && !compact && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-xs text-primary font-semibold">
                ${(card.manualValue ?? card.estimatedValue)?.toFixed(2)}
              </span>
              <ValueChangeIndicator card={card} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

interface PortfolioNextBuyRecommendation {
  playerName: string;
  cardSuggestion: string;
  sport: string;
  position?: string;
  estimatedPrice: number;
  whyItFits: string;
  investmentRationale: string;
}

interface PortfolioThemeAnalysis {
  identifiedTheme: string;
  themeDescription: string;
  detectedPatterns: {
    teams: string[];
    sports: string[];
    positions: string[];
    eras: string[];
    players: string[];
    cardTypes: string[];
  };
  recommendations: PortfolioNextBuyRecommendation[];
  displayCaseId: number;
  generatedAt: string;
}

type SortKey =
  | "default"
  | "value-desc"
  | "value-asc"
  | "change-desc"
  | "date-desc"
  | "outlook-buy"
  | "title-asc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "Default order" },
  { value: "value-desc", label: "Value (high to low)" },
  { value: "value-asc", label: "Value (low to high)" },
  { value: "change-desc", label: "Recent change %" },
  { value: "date-desc", label: "Recently added" },
  { value: "outlook-buy", label: "Outlook (Buy first)" },
  { value: "title-asc", label: "Title (A to Z)" },
];

// Chips are grouped by facet. Within a facet (e.g. outlook) chips OR together
// — selecting Buy + Sell means "either Buy or Sell". Across facets they AND
// — Buy + Graded means "Buy AND Graded". Mutually exclusive chips like
// Buy/Sell/Monitor MUST share the same group, otherwise their combination
// would always collapse to zero results.
type FilterGroup = "outlook" | "bigMover" | "graded" | "rookies";

const FILTER_CHIPS: {
  id: string;
  label: string;
  group: FilterGroup;
  match: (c: Card) => boolean;
}[] = [
  { id: "buy", label: "Buy", group: "outlook", match: (c) => c.outlookAction === "BUY" },
  { id: "sell", label: "Sell", group: "outlook", match: (c) => c.outlookAction === "SELL" },
  { id: "monitor", label: "Monitor", group: "outlook", match: (c) => c.outlookAction === "MONITOR" },
  { id: "big-mover", label: "Big movers", group: "bigMover", match: (c) => c.outlookBigMover === true },
  { id: "graded", label: "Graded", group: "graded", match: (c) => !!c.grade },
  { id: "rookies", label: "Rookies", group: "rookies", match: (c) => c.isRookie === true },
];

function getCardValue(c: Card): number | null {
  return c.manualValue ?? c.estimatedValue ?? null;
}

function getCardChangePct(c: Card): number | null {
  const v = getCardValue(c);
  const p = c.previousValue ?? null;
  if (v == null || p == null || p <= 0) return null;
  return ((v - p) / p) * 100;
}

function applyCaseFilters(
  cards: Card[],
  search: string,
  activeFilters: Set<string>,
  sortKey: SortKey,
): Card[] {
  let out = cards;

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    out = out.filter((c) => {
      const t = c.title?.toLowerCase() ?? "";
      const p = c.playerName?.toLowerCase() ?? "";
      return t.includes(q) || p.includes(q);
    });
  }

  if (activeFilters.size > 0) {
    // Group active chips by their facet so we can OR within / AND across.
    const byGroup: Record<string, ((c: Card) => boolean)[]> = {};
    Array.from(activeFilters).forEach((id) => {
      const chip = FILTER_CHIPS.find((f) => f.id === id);
      if (!chip) return;
      (byGroup[chip.group] ||= []).push(chip.match);
    });
    const groupMatchers = Object.values(byGroup);
    out = out.filter((c) =>
      // OR within a facet (some), AND across facets (every).
      groupMatchers.every((matchers) => matchers.some((m: (c: Card) => boolean) => m(c))),
    );
  }

  if (sortKey !== "default") {
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case "value-desc": {
          const av = getCardValue(a) ?? -Infinity;
          const bv = getCardValue(b) ?? -Infinity;
          return bv - av;
        }
        case "value-asc": {
          const av = getCardValue(a) ?? Infinity;
          const bv = getCardValue(b) ?? Infinity;
          return av - bv;
        }
        case "change-desc": {
          const ac = getCardChangePct(a);
          const bc = getCardChangePct(b);
          if (ac == null && bc == null) return 0;
          if (ac == null) return 1;
          if (bc == null) return -1;
          return bc - ac;
        }
        case "date-desc": {
          const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bt - at;
        }
        case "outlook-buy": {
          const order: Record<string, number> = { BUY: 0, MONITOR: 1, SELL: 2 };
          const ao = a.outlookAction ? (order[a.outlookAction] ?? 3) : 3;
          const bo = b.outlookAction ? (order[b.outlookAction] ?? 3) : 3;
          return ao - bo;
        }
        case "title-asc":
          return (a.title ?? "").localeCompare(b.title ?? "");
        default:
          return 0;
      }
    });
  }

  return out;
}

interface CaseToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  activeFilters: Set<string>;
  onToggleFilter: (id: string) => void;
  onClearFilters: () => void;
  sortKey: SortKey;
  onSort: (v: SortKey) => void;
  filteredCount: number;
  totalCount: number;
}

function CaseToolbar({
  search,
  onSearch,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  sortKey,
  onSort,
  filteredCount,
  totalCount,
}: CaseToolbarProps) {
  const isFiltering = activeFilters.size > 0 || search.trim().length > 0 || sortKey !== "default";

  return (
    <div
      className="rounded-xl border bg-card/50 backdrop-blur-sm p-3 sm:p-4 mb-6"
      data-testid="case-toolbar"
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search title or player..."
            className="pl-9"
            data-testid="input-case-search"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
          {FILTER_CHIPS.map((chip) => {
            const on = activeFilters.has(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onToggleFilter(chip.id)}
                aria-pressed={on}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}
                data-testid={`chip-filter-${chip.id}`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-56">
          <Select value={sortKey} onValueChange={(v) => onSort(v as SortKey)}>
            <SelectTrigger data-testid="select-case-sort">
              <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} data-testid={`option-sort-${opt.value}`}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isFiltering && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
          <span data-testid="text-filter-count">
            Showing <span className="font-semibold text-foreground">{filteredCount}</span> of {totalCount} cards
          </span>
          <button
            type="button"
            onClick={onClearFilters}
            className="font-medium text-foreground hover:underline"
            data-testid="button-clear-filters"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

interface HeroCenterpieceProps {
  card: Card;
  theme: ThemeStyle;
  onClick: () => void;
}

function HeroCenterpiece({ card, theme, onClick }: HeroCenterpieceProps) {
  const value = card.manualValue ?? card.estimatedValue ?? null;
  const prev = card.previousValue ?? null;
  const changePct = value != null && prev != null && prev > 0 ? ((value - prev) / prev) * 100 : null;
  const variation = sanitizeCardField(card.variation);
  const holo = !!theme.isHolo;

  return (
    <div
      className={`mb-6 rounded-lg ${theme.frame} border-4 p-1 shadow-2xl`}
      data-testid={`hero-centerpiece-${card.id}`}
    >
      <div className={`relative ${theme.bg} rounded-md p-4 sm:p-6`}>
        <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-semibold uppercase tracking-wide shadow">
          <Star className="h-3 w-3 fill-current" />
          Centerpiece
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-center mt-6 md:mt-0">
          <button
            type="button"
            onClick={onClick}
            className={`group relative text-left cursor-pointer w-full max-w-xs mx-auto md:mx-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg ${
              holo ? "" : "transition-transform duration-200 hover:scale-[1.02]"
            }`}
            data-testid={`hero-image-${card.id}`}
          >
            <div className={`${theme.mat} rounded-lg p-2 shadow-lg`}>
              <TiltWrapper enabled={holo} maxDeg={6}>
                <div className="relative rounded overflow-hidden shadow-inner bg-black/20">
                  <div style={{ paddingBottom: "140%" }} className="relative">
                    <img
                      src={card.imagePath || undefined}
                      alt={card.title}
                      className="absolute inset-0 w-full h-full object-contain"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  </div>
                  <HoloShimmer enabled={holo} />
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent pointer-events-none" />
                  {card.outlookAction && (
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <OutlookBadge action={card.outlookAction} size="sm" />
                      {card.outlookBigMover && (
                        <div className="bg-purple-500/90 p-1 rounded" title="Big Mover Potential">
                          <Zap className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TiltWrapper>
            </div>
          </button>

          <div className={`space-y-3 ${theme.text} px-1 md:px-2`}>
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold leading-tight" data-testid={`hero-title-${card.id}`}>{card.title}</h3>
              {(card.set || card.year) && (
                <p className={`text-sm mt-1 ${theme.textMuted}`}>
                  {[card.year, card.set].filter(Boolean).join(" \u00b7 ")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {card.grade && (
                <Badge variant="outline" className={`bg-transparent border-current ${theme.text}`} data-testid={`hero-grade-${card.id}`}>
                  {card.grade}
                </Badge>
              )}
              {variation && (
                <Badge variant="outline" className={`bg-transparent border-current ${theme.textMuted}`}>
                  {variation}
                </Badge>
              )}
              {card.isRookie && (
                <Badge variant="outline" className={`bg-transparent border-current ${theme.textMuted}`}>
                  Rookie
                </Badge>
              )}
            </div>

            {value != null && (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-bold tabular-nums" data-testid={`hero-value-${card.id}`}>
                  ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                {changePct != null && (
                  <span
                    className={`text-sm font-semibold ${changePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    data-testid={`hero-change-${card.id}`}
                  >
                    {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%
                  </span>
                )}
              </div>
            )}

            {card.outlookExplanationShort && (
              <p className={`text-sm ${theme.textMuted} leading-relaxed`} data-testid={`hero-outlook-${card.id}`}>
                {card.outlookExplanationShort}
              </p>
            )}

            <button
              type="button"
              onClick={onClick}
              className={`inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline ${theme.text} opacity-90 hover:opacity-100`}
              data-testid={`hero-details-${card.id}`}
            >
              View card details
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CaseView() {
  const { id } = useParams<{ id: string }>();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showProUpgradeModal, setShowProUpgradeModal] = useState(false);
  const [showNextBuysModal, setShowNextBuysModal] = useState(false);
  const [nextBuysAnalysis, setNextBuysAnalysis] = useState<PortfolioThemeAnalysis | null>(null);
  const [caseSearch, setCaseSearch] = useState("");
  const [caseFilters, setCaseFilters] = useState<Set<string>>(new Set());
  const [caseSort, setCaseSort] = useState<SortKey>("default");
  const { toast } = useToast();

  const toggleCaseFilter = (id: string) => {
    setCaseFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearCaseFilters = () => {
    setCaseFilters(new Set());
    setCaseSearch("");
    setCaseSort("default");
  };

  // Filters are scoped per-case. Navigating to a different case starts fresh,
  // otherwise persisted filters could hide every card on the new case with no
  // toolbar visible to clear them (when the new case has fewer than 6 cards).
  useEffect(() => {
    setCaseSearch("");
    setCaseFilters(new Set());
    setCaseSort("default");
  }, [id]);

  const { data: displayCase, isLoading, error } = useQuery<DisplayCaseWithCards>({
    queryKey: [`/api/display-cases/${id}/public`],
  });

  const { data: user } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
  });

  const isOwner = user?.id === displayCase?.userId;
  const isPro = hasProAccess(user);

  const [refreshStatus, setRefreshStatus] = useState<{ status: string; total: number; completed: number; failed: number; results?: any[] } | null>(null);
  const refreshPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshAllPricesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/display-cases/${id}/refresh-prices`);
    },
    onSuccess: (data) => {
      if (data.status === "running") {
        setRefreshStatus({ status: "running", total: data.total, completed: 0, failed: 0 });
        if (refreshPollRef.current) clearInterval(refreshPollRef.current);
        let pollFailCount = 0;
        refreshPollRef.current = setInterval(async () => {
          try {
            const res = await fetch(`/api/display-cases/${id}/refresh-prices/status`, { credentials: "include" });
            if (!res.ok) {
              pollFailCount++;
              if (pollFailCount > 5) {
                if (refreshPollRef.current) clearInterval(refreshPollRef.current);
                refreshPollRef.current = null;
                setRefreshStatus(null);
              }
              return;
            }
            pollFailCount = 0;
            const status = await res.json();
            if (status.status === "complete" || status.status === "idle") {
              if (refreshPollRef.current) clearInterval(refreshPollRef.current);
              refreshPollRef.current = null;
              if (status.status === "complete") {
                setRefreshStatus(status);
                queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
                queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
                queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}/public`] });
                const updatedCount = status.results?.filter((r: any) => r.oldValue !== r.newValue).length || 0;
                toast({
                  title: "Values Refreshed",
                  description: `Processed ${status.total} cards. ${updatedCount} values updated.`,
                });
              }
              setTimeout(() => setRefreshStatus(null), 3000);
            } else {
              setRefreshStatus(status);
            }
          } catch (e) {
            pollFailCount++;
            if (pollFailCount > 5) {
              if (refreshPollRef.current) clearInterval(refreshPollRef.current);
              refreshPollRef.current = null;
              setRefreshStatus(null);
            }
          }
        }, 2000);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh card values",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    return () => {
      if (refreshPollRef.current) clearInterval(refreshPollRef.current);
    };
  }, []);

  const portfolioNextBuysMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/display-cases/${id}/next-buys`);
    },
    onSuccess: (data: PortfolioThemeAnalysis) => {
      setNextBuysAnalysis(data);
      setShowNextBuysModal(true);
    },
    onError: (error: any) => {
      if (error.message?.includes("Pro feature") || error.proRequired) {
        setShowProUpgradeModal(true);
      } else {
        toast({
          title: "Couldn't Generate Recommendations",
          description: error.message || "Failed to generate recommendations for this portfolio",
          variant: "destructive",
        });
      }
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <CardGridSkeleton />
      </div>
    );
  }

  if (error || !displayCase) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Display Case Not Found</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          This display case doesn't exist, is private, or has been removed.
        </p>
        <Link href="/">
          <Button className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go Home
          </Button>
        </Link>
      </div>
    );
  }

  const cardCount = displayCase.cards?.length || 0;
  const totalValue = displayCase.cards?.reduce((sum, card) => sum + (card.manualValue ?? card.estimatedValue ?? 0), 0) || 0;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = "/"}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4 bg-transparent border-none cursor-pointer p-0"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-case-title">
                  {displayCase.name}
                </h1>
                {isOwner && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/cases/${id}/edit`}>
                      <Button variant="outline" size="sm" className="gap-2" data-testid="button-edit-case">
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    </Link>
                    {hasProAccess(user) && displayCase.cards && displayCase.cards.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => refreshAllPricesMutation.mutate()}
                        disabled={refreshAllPricesMutation.isPending || refreshStatus?.status === "running"}
                        data-testid="button-refresh-all-prices"
                      >
                        {refreshStatus?.status === "running" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : refreshAllPricesMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {refreshStatus?.status === "running"
                          ? `Refreshing ${refreshStatus.completed}/${refreshStatus.total}...`
                          : refreshAllPricesMutation.isPending
                            ? "Starting..."
                            : "Refresh Values"}
                      </Button>
                    )}
                    {displayCase.cards && displayCase.cards.length > 0 && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-2"
                        onClick={() => portfolioNextBuysMutation.mutate()}
                        disabled={portfolioNextBuysMutation.isPending}
                        data-testid="button-portfolio-next-buys"
                      >
                        {portfolioNextBuysMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShoppingCart className="h-4 w-4" />
                        )}
                        {portfolioNextBuysMutation.isPending ? "Analyzing..." : "Next Buys"}
                        {!isPro && <Crown className="h-3 w-3 text-yellow-500" />}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {displayCase.description && (
                <p className="text-muted-foreground text-lg max-w-2xl" data-testid="text-case-description">
                  {displayCase.description}
                </p>
              )}
              
              {displayCase.cards && displayCase.cards.length >= 3 && (
                <PortfolioInsightLine cards={displayCase.cards} />
              )}
              
              {(displayCase.showCardCount || displayCase.showTotalValue) && (
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  {displayCase.showCardCount && (
                    <Badge variant="secondary" className="text-sm gap-1.5 px-3 py-1">
                      <ImageIcon className="h-4 w-4" />
                      {cardCount} {cardCount === 1 ? "Card" : "Cards"}
                    </Badge>
                  )}
                  {displayCase.showTotalValue && totalValue > 0 && (
                    <Badge variant="secondary" className="text-sm gap-1.5 px-3 py-1">
                      <DollarSign className="h-4 w-4" />
                      ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Est. Value
                    </Badge>
                  )}
                </div>
              )}
              <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ImageIcon className="h-4 w-4" />
                  {cardCount} {cardCount === 1 ? "card" : "cards"}
                </span>
                {displayCase.createdAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Created {format(new Date(displayCase.createdAt), "MMMM d, yyyy")}
                  </span>
                )}
              </div>
              {displayCase.userId && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <PrestigeDisplay userId={displayCase.userId} compact />
                    {user && !isOwner && (
                      <>
                        <FollowButton userId={displayCase.userId} compact />
                        <MessageButton userId={displayCase.userId} compact />
                      </>
                    )}
                  </div>
                  <FollowStats userId={displayCase.userId} compact />
                </div>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-share">
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem 
                  onClick={() => {
                    const url = `${window.location.origin}/case/${id}`;
                    navigator.clipboard.writeText(url);
                    toast({
                      title: "Link Copied",
                      description: "Case link copied to clipboard!",
                    });
                  }}
                  data-testid="button-copy-link"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Copy Link
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Download Images</DropdownMenuLabel>
                
                <DropdownMenuItem 
                  onClick={() => {
                    const imageUrl = `/api/share-image/case/${id}?format=teaser`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-teaser.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "TikTok/Instagram teaser image downloading.",
                    });
                  }}
                  data-testid="button-download-teaser"
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Teaser Image (4:5)
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => {
                    const imageUrl = `/api/share-image/case/${id}?format=story`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-story.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "Instagram Story image downloading.",
                    });
                  }}
                  data-testid="button-download-story"
                >
                  <Instagram className="h-4 w-4 mr-2" />
                  Story Image (9:16)
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => {
                    const imageUrl = `/api/share-image/case/${id}`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-share.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "Social share image downloading.",
                    });
                  }}
                  data-testid="button-download-social"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Social Preview (16:9)
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1">
                  Brag Images
                  {!isPro && <ProBadge />}
                </DropdownMenuLabel>
                
                <DropdownMenuItem 
                  onClick={() => {
                    if (!isPro) {
                      setShowProUpgradeModal(true);
                      return;
                    }
                    const imageUrl = `/api/share-image/case/${id}?format=brag-card`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-top-card.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "Top card brag image downloading.",
                    });
                  }}
                  className={!isPro ? "opacity-60" : ""}
                  data-testid="button-download-brag-card"
                >
                  <Trophy className="h-4 w-4 mr-2" />
                  Top Card Flex
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => {
                    if (!isPro) {
                      setShowProUpgradeModal(true);
                      return;
                    }
                    const imageUrl = `/api/share-image/case/${id}?format=brag-portfolio`;
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `${displayCase.name.replace(/[^a-zA-Z0-9]/g, '-')}-portfolio.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast({
                      title: "Downloading...",
                      description: "Portfolio value image downloading.",
                    });
                  }}
                  className={!isPro ? "opacity-60" : ""}
                  data-testid="button-download-brag-portfolio"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Portfolio Value
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {cardCount === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No cards yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              This display case is empty. Check back later for some amazing cards!
            </p>
          </div>
        ) : (
          (() => {
            const theme = THEME_STYLES[displayCase.theme || "classic"] || THEME_STYLES.classic;
            const stripCards = displayCase.cards ?? [];
            const heroCard = displayCase.heroCardId
              ? stripCards.find((c) => c.id === displayCase.heroCardId) ?? null
              : null;
            const gridCards = heroCard
              ? stripCards.filter((c) => c.id !== heroCard.id)
              : stripCards;
            const displayedCards = applyCaseFilters(gridCards, caseSearch, caseFilters, caseSort);
            const showToolbar = gridCards.length >= 6;
            const hasActiveFilters =
              caseFilters.size > 0 || caseSearch.trim().length > 0 || caseSort !== "default";
            // Empty-state should fire whenever filters/search hide every grid card,
            // regardless of toolbar visibility. (Filters auto-reset on case-id change,
            // so this typically only triggers when the toolbar IS visible — but we
            // keep it independent for defense in depth.)
            const noMatches = hasActiveFilters && gridCards.length > 0 && displayedCards.length === 0;
            return (
              <>
                <CaseStatsStrip cards={stripCards} />
                {heroCard && (
                  <HeroCenterpiece
                    card={heroCard}
                    theme={theme}
                    onClick={() => setSelectedCard(heroCard)}
                  />
                )}
                {showToolbar && (
                  <CaseToolbar
                    search={caseSearch}
                    onSearch={setCaseSearch}
                    activeFilters={caseFilters}
                    onToggleFilter={toggleCaseFilter}
                    onClearFilters={clearCaseFilters}
                    sortKey={caseSort}
                    onSort={setCaseSort}
                    filteredCount={displayedCards.length}
                    totalCount={gridCards.length}
                  />
                )}
              <div className={`relative rounded-lg ${theme.frame} border-4 p-1 shadow-2xl`}>
                <div className={`absolute inset-0 rounded-md ${theme.glass} pointer-events-none`} />
                <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-stone-400/50" />
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-stone-400/50" />
                <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-stone-400/50" />
                <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-stone-400/50" />
                
                <div className={`${theme.bg} rounded-md p-6 sm:p-8`}>
                  {gridCards.length === 0 ? (
                    <div className={`text-center py-8 ${theme.textMuted} text-sm`} data-testid="text-grid-only-hero">
                      This case has only the centerpiece card above.
                    </div>
                  ) : noMatches ? (
                    <div className={`text-center py-8 ${theme.textMuted} text-sm`} data-testid="text-no-filter-matches">
                      No cards match your filters.
                      <button
                        type="button"
                        onClick={clearCaseFilters}
                        className={`ml-2 underline ${theme.text}`}
                        data-testid="button-clear-filters-empty"
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Grid Layout (default) */}
                      {(!displayCase.layout || displayCase.layout === "grid") && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
                          {displayedCards.map((card) => (
                            <CardItem key={card.id} card={card} theme={theme} onClick={() => setSelectedCard(card)} />
                          ))}
                        </div>
                      )}

                      {/* Row Layout - horizontal scrollable row */}
                      {displayCase.layout === "row" && (
                        <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 scrollbar-thin">
                          {displayedCards.map((card) => (
                            <div key={card.id} className="flex-shrink-0 w-40 sm:w-48 md:w-56">
                              <CardItem card={card} theme={theme} onClick={() => setSelectedCard(card)} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Showcase Layout - featured first card, grid for rest */}
                      {displayCase.layout === "showcase" && displayedCards.length > 0 && (
                        <div className="space-y-6">
                          {/* Featured first card - larger */}
                          <div className="flex justify-center">
                            <div className="w-full max-w-sm">
                              <CardItem
                                card={displayedCards[0]}
                                theme={theme}
                                onClick={() => setSelectedCard(displayedCards[0])}
                                featured
                              />
                            </div>
                          </div>
                          {/* Rest of cards in a grid */}
                          {displayedCards.length > 1 && (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
                              {displayedCards.slice(1).map((card) => (
                                <CardItem key={card.id} card={card} theme={theme} onClick={() => setSelectedCard(card)} compact />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              </>
            );
          })()
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SocialFeatures displayCaseId={parseInt(id || "0")} user={user || null} caseName={displayCase.name} />
      </div>

      <div className="border-t mt-16 py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-xl font-semibold mb-2">
            Want to create your own display case?
          </h3>
          <p className="text-muted-foreground mb-6">
            Showcase your collection in a beautiful, shareable display case.
          </p>
          <a href="/api/login">
            <Button className="gap-2" data-testid="button-create-own">
              <LayoutGrid className="h-4 w-4" />
              Create Your Free Display Case
            </Button>
          </a>
        </div>
      </div>

      <CardDetailModal
        card={selectedCard}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        displayCaseId={parseInt(id || "0")}
        canEdit={isOwner}
        isPro={hasProAccess(user)}
        isAuthenticated={!!user}
        ownerUserId={displayCase?.userId}
      />

      <ProUpgradeDialog
        open={showProUpgradeModal}
        onOpenChange={setShowProUpgradeModal}
        featureName="Portfolio Next Buys"
        featureDescription="Upgrade to Pro to get AI-powered recommendations tailored to each of your portfolios."
      />

      {/* Portfolio Next Buys Modal */}
      <Dialog open={showNextBuysModal} onOpenChange={setShowNextBuysModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Next Buys for This Portfolio</DialogTitle>
                {nextBuysAnalysis && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Theme: {nextBuysAnalysis.identifiedTheme}
                  </p>
                )}
              </div>
            </div>
            {nextBuysAnalysis && (
              <DialogDescription className="text-sm">
                {nextBuysAnalysis.themeDescription}
              </DialogDescription>
            )}
          </DialogHeader>

          {nextBuysAnalysis && nextBuysAnalysis.recommendations.length > 0 ? (
            <div className="space-y-3 py-2">
              {nextBuysAnalysis.recommendations.map((rec, index) => (
                <CardUI key={index} className="hover-elevate">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          {rec.playerName}
                          <Badge variant="secondary" className="text-xs">
                            {rec.sport}
                          </Badge>
                          {rec.position && (
                            <Badge variant="outline" className="text-xs">
                              {rec.position}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {rec.cardSuggestion}
                        </CardDescription>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-lg font-semibold text-primary">
                          ~${typeof rec.estimatedPrice === 'number' ? rec.estimatedPrice.toLocaleString() : '???'}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">{rec.whyItFits}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">{rec.investmentRationale}</p>
                    </div>
                  </CardContent>
                </CardUI>
              ))}
            </div>
          ) : nextBuysAnalysis ? (
            <div className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No recommendations available for this portfolio yet.
              </p>
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setShowNextBuysModal(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PRO_BENEFITS = [
  "Unlimited display cases",
  "Premium themes",
  "AI-powered price lookups",
  "Card outlook analysis",
  "Premium sharing formats",
];

function ProUpgradeDialog({
  open,
  onOpenChange,
  featureName,
  featureDescription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  featureDescription?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Crown className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-xl">Unlock {featureName}</DialogTitle>
          </div>
          <DialogDescription>
            {featureDescription || `Upgrade to Pro to access ${featureName.toLowerCase()} and many more premium features.`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm font-medium mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            What you get with Pro:
          </p>
          <ul className="space-y-2">
            {PRO_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-primary flex-shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>
          <Link href="/upgrade">
            <Button className="gap-2 w-full sm:w-auto" data-testid="button-upgrade-modal">
              <Crown className="h-4 w-4" />
              Upgrade to Pro
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
