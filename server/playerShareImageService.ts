import sharp from "sharp";
import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import { eq, ilike } from "drizzle-orm";
import type { InvestmentCall, InvestmentVerdict, DataConfidence } from "@shared/schema";

interface PlayerShareData {
  playerName: string;
  sport: string;
  position?: string;
  team?: string;
  investmentCall?: InvestmentCall;
  verdict?: InvestmentVerdict;
  postureLabel?: string;
  confidence?: DataConfidence;
  oneLineRationale?: string;
  whyBullets?: string[];
}

const VERDICT_COLORS: Record<InvestmentVerdict, { bg: string; text: string; accent: string }> = {
  ACCUMULATE: { bg: "#166534", text: "#FFFFFF", accent: "#22C55E" },
  HOLD_CORE: { bg: "#1E40AF", text: "#FFFFFF", accent: "#3B82F6" },
  TRADE_THE_HYPE: { bg: "#C2410C", text: "#FFFFFF", accent: "#F97316" },
  AVOID_NEW_MONEY: { bg: "#991B1B", text: "#FFFFFF", accent: "#EF4444" },
  SPECULATIVE_FLYER: { bg: "#7C3AED", text: "#FFFFFF", accent: "#A855F7" },
};

const VERDICT_LABELS: Record<InvestmentVerdict, string> = {
  ACCUMULATE: "ACCUMULATE",
  HOLD_CORE: "HOLD",
  TRADE_THE_HYPE: "TRADE THE HYPE",
  AVOID_NEW_MONEY: "AVOID",
  SPECULATIVE_FLYER: "SPECULATIVE",
};

const CONFIDENCE_LABELS: Record<DataConfidence, string> = {
  HIGH: "High Confidence",
  MEDIUM: "Medium Confidence",
  LOW: "Low Confidence",
};

const SPORT_ICONS: Record<string, string> = {
  basketball: "NBA",
  football: "NFL",
  baseball: "MLB",
  hockey: "NHL",
  soccer: "MLS",
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

export async function getPlayerShareData(playerSlug: string): Promise<PlayerShareData | null> {
  const playerName = playerSlug
    .replace(/-/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const cached = await db
    .select()
    .from(playerOutlookCache)
    .where(ilike(playerOutlookCache.playerName, playerName))
    .limit(1);

  if (!cached.length) {
    return {
      playerName,
      sport: "football",
    };
  }

  const record = cached[0];
  const outlook = record.outlookJson as any;

  return {
    playerName: record.playerName,
    sport: record.sport,
    position: outlook?.playerInfo?.position,
    team: outlook?.playerInfo?.team,
    investmentCall: outlook?.investmentCall,
    verdict: outlook?.investmentCall?.verdict,
    postureLabel: outlook?.investmentCall?.postureLabel,
    confidence: outlook?.investmentCall?.confidence,
    oneLineRationale: outlook?.investmentCall?.oneLineRationale,
    whyBullets: outlook?.investmentCall?.whyBullets,
  };
}

export async function generatePlayerOGImage(playerSlug: string): Promise<Buffer> {
  const data = await getPlayerShareData(playerSlug);
  
  const width = 1200;
  const height = 630;
  
  const playerName = data?.playerName || playerSlug.replace(/-/g, " ");
  const sport = data?.sport || "football";
  const position = data?.position || "";
  const team = data?.team || "";
  const verdict = data?.verdict || "HOLD_CORE";
  const postureLabel = data?.postureLabel || "";
  const confidence = data?.confidence || "LOW";
  const oneLineRationale = data?.oneLineRationale || "Analysis pending";
  const whyBullets = data?.whyBullets || [];

  const verdictConfig = VERDICT_COLORS[verdict];
  const verdictLabel = VERDICT_LABELS[verdict];
  const confidenceLabel = CONFIDENCE_LABELS[confidence];
  const sportLabel = SPORT_ICONS[sport.toLowerCase()] || sport.toUpperCase();

  const bulletText = whyBullets.slice(0, 2).map((b, i) => {
    const escaped = escapeXml(truncateText(b, 50));
    const yPos = 380 + i * 32;
    return `<text x="500" y="${yPos}" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#9CA3AF">• ${escaped}</text>`;
  }).join("\n");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0F172A;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1E293B;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${verdictConfig.accent};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${verdictConfig.accent};stop-opacity:0" />
        </linearGradient>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="0.5" opacity="0.3"/>
        </pattern>
      </defs>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#grid)"/>
      
      <!-- Left accent bar -->
      <rect x="0" y="0" width="8" height="${height}" fill="${verdictConfig.accent}"/>
      
      <!-- Top gradient accent -->
      <rect x="0" y="0" width="${width}" height="120" fill="url(#accent)"/>
      
      <!-- Player silhouette area (left side) -->
      <rect x="40" y="100" width="380" height="430" rx="16" fill="#1E293B" stroke="#334155" stroke-width="1"/>
      
      <!-- Sport badge -->
      <rect x="60" y="120" width="60" height="28" rx="6" fill="${verdictConfig.bg}"/>
      <text x="90" y="139" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">${sportLabel}</text>
      
      <!-- Player silhouette icon -->
      <circle cx="230" cy="280" r="100" fill="#334155"/>
      <circle cx="230" cy="240" r="45" fill="#475569"/>
      <ellipse cx="230" cy="350" rx="60" ry="50" fill="#475569"/>
      
      <!-- Position/Team under silhouette -->
      <text x="230" y="460" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#9CA3AF" text-anchor="middle">${escapeXml(position)}${position && team ? " | " : ""}${escapeXml(team)}</text>
      
      <!-- Player name under silhouette -->
      <text x="230" y="500" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(truncateText(playerName, 25))}</text>
      
      <!-- Right content area -->
      
      <!-- Verdict badge -->
      <rect x="480" y="100" width="280" height="80" rx="12" fill="${verdictConfig.bg}"/>
      <text x="620" y="150" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle">${verdictLabel}</text>
      
      <!-- Posture label -->
      ${postureLabel ? `<text x="500" y="220" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="${verdictConfig.accent}">${escapeXml(postureLabel)}</text>` : ""}
      
      <!-- One-line rationale -->
      <text x="500" y="270" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#E2E8F0">${escapeXml(truncateText(oneLineRationale, 55))}</text>
      ${oneLineRationale.length > 55 ? `<text x="500" y="298" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#E2E8F0">${escapeXml(truncateText(oneLineRationale.substring(55), 55))}</text>` : ""}
      
      <!-- Why bullets -->
      ${bulletText}
      
      <!-- Confidence chip -->
      <rect x="500" y="460" width="160" height="32" rx="16" fill="#334155"/>
      <text x="580" y="481" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#9CA3AF" text-anchor="middle">${confidenceLabel}</text>
      
      <!-- Modeled comps note if LOW confidence -->
      ${confidence === "LOW" ? `<text x="680" y="481" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#6B7280">Modeled comps</text>` : ""}
      
      <!-- Bottom branding -->
      <rect x="0" y="570" width="${width}" height="60" fill="#0F172A"/>
      <text x="60" y="608" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="white">Sports Card Portfolio</text>
      <text x="280" y="608" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#64748B">AI-Powered Investment Intelligence</text>
      
      <!-- Domain -->
      <text x="1140" y="608" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#64748B" text-anchor="end">sportscardportfolio.com</text>
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

export function getPlayerSlug(playerName: string): string {
  return playerName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
