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
  HOLD_ROLE_RISK: { bg: "#1E40AF", text: "#FFFFFF", accent: "#60A5FA" },
  HOLD_INJURY_CONTINGENT: { bg: "#1E40AF", text: "#FFFFFF", accent: "#FCD34D" },
  SPECULATIVE_SUPPRESSED: { bg: "#4B5563", text: "#FFFFFF", accent: "#9CA3AF" },
  AVOID_STRUCTURAL: { bg: "#991B1B", text: "#FFFFFF", accent: "#F87171" },
};

const VERDICT_LABELS: Record<InvestmentVerdict, string> = {
  ACCUMULATE: "ACCUMULATE",
  HOLD_CORE: "HOLD",
  TRADE_THE_HYPE: "TRADE THE HYPE",
  AVOID_NEW_MONEY: "AVOID",
  SPECULATIVE_FLYER: "SPECULATIVE",
  HOLD_ROLE_RISK: "HOLD (ROLE RISK)",
  HOLD_INJURY_CONTINGENT: "HOLD (INJURY)",
  SPECULATIVE_SUPPRESSED: "SPECULATIVE",
  AVOID_STRUCTURAL: "AVOID",
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
  
  const playerName = data?.playerName || playerSlug.replace(/-/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const sport = data?.sport || "football";
  const position = data?.position || "";
  const team = data?.team || "";
  const verdict = data?.verdict || "HOLD_CORE";
  const postureLabel = data?.postureLabel || "";
  const confidence = data?.confidence || "MEDIUM";
  const hasRealData = !!data?.oneLineRationale;
  const oneLineRationale = data?.oneLineRationale || "Get AI-powered investment analysis for this player";
  const whyBullets = data?.whyBullets || [];

  const verdictConfig = VERDICT_COLORS[verdict];
  const verdictLabel = VERDICT_LABELS[verdict];
  const confidenceLabel = CONFIDENCE_LABELS[confidence];
  const sportLabel = SPORT_ICONS[sport.toLowerCase()] || sport.toUpperCase();

  // Build bullet points (up to 2)
  const bulletText = whyBullets.slice(0, 2).map((b, i) => {
    const escaped = escapeXml(truncateText(b, 45));
    const yPos = 420 + i * 36;
    return `<text x="600" y="${yPos}" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#94A3B8" text-anchor="middle">${escaped}</text>`;
  }).join("\n");

  // Word wrap for rationale - centered layout
  const rationaleLines = wrapText(oneLineRationale, 50);
  const rationaleText = rationaleLines.slice(0, 2).map((line, i) => {
    const yPos = 340 + i * 32;
    return `<text x="600" y="${yPos}" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="#E2E8F0" text-anchor="middle">${escapeXml(line)}</text>`;
  }).join("\n");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0F172A;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#1E293B;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0F172A;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="verdict-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${verdictConfig.accent};stop-opacity:0.15" />
          <stop offset="50%" style="stop-color:${verdictConfig.accent};stop-opacity:0.08" />
          <stop offset="100%" style="stop-color:${verdictConfig.accent};stop-opacity:0" />
        </linearGradient>
        <linearGradient id="card-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${verdictConfig.accent};stop-opacity:0.5" />
          <stop offset="100%" style="stop-color:${verdictConfig.accent};stop-opacity:0.1" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      
      <!-- Radial glow behind main content -->
      <ellipse cx="600" cy="280" rx="500" ry="300" fill="url(#verdict-glow)"/>
      
      <!-- Accent lines -->
      <rect x="0" y="0" width="6" height="${height}" fill="${verdictConfig.accent}"/>
      <rect x="${width - 6}" y="0" width="6" height="${height}" fill="${verdictConfig.accent}" opacity="0.3"/>
      
      <!-- Main card container -->
      <rect x="80" y="60" width="${width - 160}" height="450" rx="20" fill="#1E293B" fill-opacity="0.6" stroke="url(#card-border)" stroke-width="2"/>
      
      <!-- Sport badge (top left of card) -->
      <rect x="110" y="85" width="70" height="32" rx="8" fill="${verdictConfig.bg}"/>
      <text x="145" y="107" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">${sportLabel}</text>
      
      <!-- Player name - large, centered -->
      <text x="600" y="150" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(truncateText(playerName, 22))}</text>
      
      <!-- Position and team line -->
      ${(position || team) ? `<text x="600" y="185" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#94A3B8" text-anchor="middle">${escapeXml(position)}${position && team ? " • " : ""}${escapeXml(team)}</text>` : ""}
      
      <!-- Verdict badge - prominent, centered -->
      <rect x="420" y="210" width="360" height="90" rx="16" fill="${verdictConfig.bg}"/>
      <rect x="420" y="210" width="360" height="90" rx="16" fill="none" stroke="${verdictConfig.accent}" stroke-width="1" opacity="0.5"/>
      <text x="600" y="270" font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="bold" fill="white" text-anchor="middle">${verdictLabel}</text>
      
      <!-- One-line rationale - centered below verdict -->
      ${rationaleText}
      
      <!-- Why bullets if present -->
      ${bulletText}
      
      <!-- Confidence chip - bottom of card -->
      <rect x="520" y="460" width="160" height="36" rx="18" fill="#334155" stroke="#475569" stroke-width="1"/>
      <text x="600" y="485" font-family="system-ui, -apple-system, sans-serif" font-size="15" fill="#94A3B8" text-anchor="middle">${confidenceLabel}</text>
      
      <!-- Bottom branding bar -->
      <rect x="0" y="530" width="${width}" height="100" fill="#0F172A"/>
      <rect x="0" y="530" width="${width}" height="1" fill="${verdictConfig.accent}" opacity="0.3"/>
      
      <!-- Logo area -->
      <rect x="60" y="555" width="50" height="50" rx="10" fill="${verdictConfig.bg}"/>
      <text x="85" y="590" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">SC</text>
      
      <!-- Brand name -->
      <text x="130" y="575" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="white">Sports Card Portfolio</text>
      <text x="130" y="600" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#64748B">AI-Powered Investment Intelligence</text>
      
      <!-- CTA on right -->
      ${!hasRealData ? `
        <rect x="920" y="558" width="220" height="44" rx="22" fill="${verdictConfig.bg}"/>
        <text x="1030" y="587" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">Get Full Analysis</text>
      ` : `
        <text x="1140" y="585" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#64748B" text-anchor="end">sportscardportfolio.io</text>
      `}
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

export function getPlayerSlug(playerName: string): string {
  return playerName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
