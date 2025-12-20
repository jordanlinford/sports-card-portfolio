import sharp from "sharp";

interface PageShareConfig {
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  bgAccent: string;
  icon: string;
  features?: string[];
}

const PAGE_CONFIGS: Record<string, PageShareConfig> = {
  "next-buys": {
    title: "Next Buys",
    subtitle: "AI-Powered Buy Recommendations",
    description: "Personalized card picks based on your portfolio composition, market conditions, and investment goals.",
    accentColor: "#22C55E",
    bgAccent: "#166534",
    icon: "cart",
    features: [
      "Portfolio-aware suggestions",
      "Diversification scoring",
      "Value opportunity detection"
    ]
  },
  "hidden-gems": {
    title: "Hidden Gems",
    subtitle: "Undervalued Opportunities",
    description: "Find players trading below their true worth. Market inefficiencies identified by AI analysis.",
    accentColor: "#A855F7",
    bgAccent: "#7C3AED",
    icon: "gem",
    features: [
      "Mispriced player alerts",
      "Repricing catalysts",
      "Risk assessment"
    ]
  },
  "portfolio-analytics": {
    title: "Portfolio Analytics",
    subtitle: "Track Your Collection Value",
    description: "Real-time insights into your sports card investments with AI-powered performance tracking.",
    accentColor: "#3B82F6",
    bgAccent: "#1E40AF",
    icon: "chart",
    features: [
      "Value tracking over time",
      "Exposure analysis",
      "Performance metrics"
    ]
  },
  "player-outlook": {
    title: "Player Outlook",
    subtitle: "Investment Intelligence",
    description: "AI-generated analysis with buy/hold/sell recommendations based on real market data.",
    accentColor: "#F97316",
    bgAccent: "#C2410C",
    icon: "target",
    features: [
      "5-verdict system",
      "Market temperature",
      "Action guidance"
    ]
  },
  "watchlist": {
    title: "Watchlist",
    subtitle: "Monitor Your Targets",
    description: "Track players you're considering. Get notified when market conditions change.",
    accentColor: "#EAB308",
    bgAccent: "#A16207",
    icon: "eye",
    features: [
      "Price alerts",
      "Trend tracking",
      "Entry point signals"
    ]
  }
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getIconSvg(icon: string, color: string): string {
  switch (icon) {
    case "cart":
      return `
        <circle cx="95" cy="95" r="50" fill="${color}" opacity="0.15"/>
        <path d="M75 75h10l5 35h30l5-25H85" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="95" cy="118" r="4" fill="${color}"/>
        <circle cx="110" cy="118" r="4" fill="${color}"/>
      `;
    case "gem":
      return `
        <circle cx="95" cy="95" r="50" fill="${color}" opacity="0.15"/>
        <polygon points="95,60 120,85 110,120 80,120 70,85" stroke="${color}" stroke-width="3" fill="none"/>
        <line x1="70" y1="85" x2="120" y2="85" stroke="${color}" stroke-width="2"/>
        <line x1="95" y1="60" x2="80" y2="85" stroke="${color}" stroke-width="2"/>
        <line x1="95" y1="60" x2="110" y2="85" stroke="${color}" stroke-width="2"/>
        <line x1="80" y1="85" x2="95" y2="120" stroke="${color}" stroke-width="2"/>
        <line x1="110" y1="85" x2="95" y2="120" stroke="${color}" stroke-width="2"/>
      `;
    case "chart":
      return `
        <circle cx="95" cy="95" r="50" fill="${color}" opacity="0.15"/>
        <polyline points="65,115 80,95 95,105 110,75 125,85" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="110" cy="75" r="4" fill="${color}"/>
      `;
    case "target":
      return `
        <circle cx="95" cy="95" r="50" fill="${color}" opacity="0.15"/>
        <circle cx="95" cy="95" r="30" stroke="${color}" stroke-width="3" fill="none"/>
        <circle cx="95" cy="95" r="18" stroke="${color}" stroke-width="3" fill="none"/>
        <circle cx="95" cy="95" r="6" fill="${color}"/>
      `;
    case "eye":
      return `
        <circle cx="95" cy="95" r="50" fill="${color}" opacity="0.15"/>
        <ellipse cx="95" cy="95" rx="35" ry="20" stroke="${color}" stroke-width="3" fill="none"/>
        <circle cx="95" cy="95" r="10" fill="${color}"/>
      `;
    default:
      return `<circle cx="95" cy="95" r="50" fill="${color}" opacity="0.15"/>`;
  }
}

export async function generatePageOGImage(pageSlug: string): Promise<Buffer> {
  const config = PAGE_CONFIGS[pageSlug];
  
  if (!config) {
    return generateDefaultPageImage(pageSlug);
  }

  const width = 1200;
  const height = 630;

  const features = config.features || [];
  const featureText = features.map((f, i) => {
    const yPos = 380 + i * 40;
    return `
      <rect x="480" y="${yPos - 24}" width="8" height="8" rx="4" fill="${config.accentColor}"/>
      <text x="500" y="${yPos - 16}" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#E2E8F0">${escapeXml(f)}</text>
    `;
  }).join("\n");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0F172A;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#1E293B;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0F172A;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${config.accentColor};stop-opacity:0.2" />
          <stop offset="100%" style="stop-color:${config.accentColor};stop-opacity:0" />
        </linearGradient>
        <linearGradient id="card-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${config.accentColor};stop-opacity:0.5" />
          <stop offset="100%" style="stop-color:${config.accentColor};stop-opacity:0.1" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      
      <!-- Radial glow -->
      <ellipse cx="250" cy="280" rx="300" ry="250" fill="url(#glow)"/>
      
      <!-- Accent lines -->
      <rect x="0" y="0" width="6" height="${height}" fill="${config.accentColor}"/>
      <rect x="${width - 6}" y="0" width="6" height="${height}" fill="${config.accentColor}" opacity="0.3"/>
      
      <!-- Left side - Icon area -->
      <rect x="60" y="80" width="350" height="380" rx="20" fill="#1E293B" fill-opacity="0.6" stroke="url(#card-border)" stroke-width="2"/>
      
      <!-- Icon -->
      <g transform="translate(140, 130)">
        ${getIconSvg(config.icon, config.accentColor)}
      </g>
      
      <!-- Page title in icon card -->
      <text x="235" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(config.title)}</text>
      <text x="235" y="355" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="${config.accentColor}" text-anchor="middle">${escapeXml(config.subtitle)}</text>
      
      <!-- Badge in icon card -->
      <rect x="160" y="390" width="150" height="36" rx="18" fill="${config.bgAccent}"/>
      <text x="235" y="414" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">PRO FEATURE</text>
      
      <!-- Right side - Description and features -->
      <text x="480" y="150" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="white">What You Get</text>
      
      <!-- Description wrapped -->
      <text x="480" y="200" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#94A3B8">${escapeXml(config.description.substring(0, 60))}</text>
      <text x="480" y="228" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#94A3B8">${escapeXml(config.description.substring(60, 120))}</text>
      ${config.description.length > 120 ? `<text x="480" y="256" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#94A3B8">${escapeXml(config.description.substring(120))}</text>` : ""}
      
      <!-- Divider -->
      <rect x="480" y="300" width="200" height="2" fill="${config.accentColor}" opacity="0.3"/>
      
      <!-- Key Features label -->
      <text x="480" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#64748B">KEY FEATURES</text>
      
      <!-- Features list -->
      ${featureText}
      
      <!-- Bottom branding bar -->
      <rect x="0" y="530" width="${width}" height="100" fill="#0F172A"/>
      <rect x="0" y="530" width="${width}" height="1" fill="${config.accentColor}" opacity="0.3"/>
      
      <!-- Logo area -->
      <rect x="60" y="555" width="50" height="50" rx="10" fill="${config.bgAccent}"/>
      <text x="85" y="590" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">SC</text>
      
      <!-- Brand name -->
      <text x="130" y="575" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="white">Sports Card Portfolio</text>
      <text x="130" y="600" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#64748B">AI-Powered Investment Intelligence</text>
      
      <!-- CTA -->
      <rect x="920" y="558" width="220" height="44" rx="22" fill="${config.bgAccent}"/>
      <text x="1030" y="587" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">Try It Free</text>
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateDefaultPageImage(pageSlug: string): Promise<Buffer> {
  const width = 1200;
  const height = 630;
  const title = pageSlug.replace(/-/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0F172A;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1E293B;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect x="0" y="0" width="6" height="${height}" fill="#3B82F6"/>
      
      <text x="600" y="280" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(title)}</text>
      <text x="600" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="#94A3B8" text-anchor="middle">Sports Card Portfolio</text>
      
      <rect x="0" y="530" width="${width}" height="100" fill="#0F172A"/>
      <rect x="60" y="555" width="50" height="50" rx="10" fill="#1E40AF"/>
      <text x="85" y="590" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">SC</text>
      <text x="130" y="575" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="white">Sports Card Portfolio</text>
      <text x="130" y="600" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#64748B">AI-Powered Investment Intelligence</text>
    </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

export function getPageShareData(pageSlug: string) {
  const config = PAGE_CONFIGS[pageSlug];
  if (!config) {
    return {
      title: pageSlug.replace(/-/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      description: "AI-powered sports card investment intelligence"
    };
  }
  return {
    title: config.title,
    subtitle: config.subtitle,
    description: config.description
  };
}
