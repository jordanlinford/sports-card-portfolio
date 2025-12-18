import sharp from "sharp";
import { DisplayCaseWithCards, User } from "@shared/schema";
import https from "https";
import http from "http";

interface ShareImageOptions {
  format?: "social" | "story" | "teaser" | "brag-card" | "brag-portfolio";
  width?: number;
  height?: number;
}

async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http;
    const request = protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", () => resolve(null));
    });

    request.on("error", () => resolve(null));
    request.setTimeout(5000, () => {
      request.destroy();
      resolve(null);
    });
  });
}

async function loadCardImage(
  imagePath: string,
  baseUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer | null> {
  try {
    let fullUrl = imagePath;
    if (imagePath.startsWith("/")) {
      fullUrl = `${baseUrl}${imagePath}`;
    }

    const imageBuffer = await fetchImageAsBuffer(fullUrl);
    if (!imageBuffer) return null;

    return await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        fit: "cover",
        position: "center",
      })
      .png()
      .toBuffer();
  } catch (error) {
    console.error("Error loading card image:", error);
    return null;
  }
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString()}`;
}

export async function generateShareImage(
  displayCase: DisplayCaseWithCards,
  owner: User,
  baseUrl: string,
  options: ShareImageOptions = {}
): Promise<Buffer> {
  const format = options.format || "social";
  
  // Dimensions for each format
  const dimensions: Record<string, { width: number; height: number }> = {
    social: { width: 1200, height: 630 },      // Discord/Twitter/Facebook
    story: { width: 1080, height: 1920 },      // Instagram Story
    teaser: { width: 1080, height: 1350 },     // TikTok/Instagram Feed (4:5)
    "brag-card": { width: 1080, height: 1350 },     // Top Card Brag
    "brag-portfolio": { width: 1080, height: 1350 }, // Portfolio Value Brag
  };
  
  const { width, height } = dimensions[format] || dimensions.social;
  
  // Handle brag formats separately
  if (format === "brag-card" || format === "brag-portfolio") {
    return generateBragImage(displayCase, owner, baseUrl, format, width, height);
  }
  
  const cards = displayCase.cards || [];
  const cardCount = cards.length;
  const totalValue = cards.reduce((sum, card) => {
    return sum + (card.estimatedValue || card.purchasePrice || 0);
  }, 0);

  const ownerName = owner.firstName
    ? `${owner.firstName}${owner.lastName ? " " + owner.lastName : ""}`
    : "Collector";

  const isPro = owner.subscriptionStatus === "PRO";

  const maxCardsToShow = format === "story" ? 6 : 4;
  const cardsToShow = cards.slice(0, maxCardsToShow);

  const cardWidth = format === "story" ? 200 : 180;
  const cardHeight = format === "story" ? 280 : 250;
  const cardGap = 20;

  const composites: sharp.OverlayOptions[] = [];

  const gradientColors = getThemeGradient(displayCase.theme);

  const svgBackground = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${gradientColors.start};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${gradientColors.end};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
    </svg>
  `;

  const backgroundBuffer = await sharp(Buffer.from(svgBackground))
    .png()
    .toBuffer();

  const headerHeight = format === "story" ? 200 : 120;
  const footerHeight = format === "story" ? 180 : 100;

  const titleFontSize = format === "story" ? 48 : 36;
  const subtitleFontSize = format === "story" ? 28 : 20;
  const statsFontSize = format === "story" ? 32 : 24;

  const truncatedTitle = displayCase.name.length > 30 
    ? displayCase.name.substring(0, 27) + "..." 
    : displayCase.name;

  const headerSvg = `
    <svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
      <text x="40" y="${format === "story" ? 80 : 50}" 
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="${titleFontSize}" 
            font-weight="700" 
            fill="white">
        ${escapeXml(truncatedTitle)}
      </text>
      <text x="40" y="${format === "story" ? 130 : 85}" 
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="${subtitleFontSize}" 
            fill="rgba(255,255,255,0.8)">
        by ${escapeXml(ownerName)}${isPro ? " ★ PRO" : ""}
      </text>
    </svg>
  `;

  composites.push({
    input: await sharp(Buffer.from(headerSvg)).png().toBuffer(),
    top: 0,
    left: 0,
  });

  if (cardsToShow.length > 0) {
    const totalCardsWidth = cardsToShow.length * cardWidth + (cardsToShow.length - 1) * cardGap;
    let cardStartX = Math.floor((width - totalCardsWidth) / 2);
    const cardStartY = format === "story" 
      ? Math.floor((height - headerHeight - footerHeight - cardHeight) / 2) + headerHeight
      : headerHeight + 20;

    for (let i = 0; i < cardsToShow.length; i++) {
      const card = cardsToShow[i];
      const cardX = cardStartX + i * (cardWidth + cardGap);

      const cardImageBuffer = await loadCardImage(
        card.imagePath,
        baseUrl,
        cardWidth,
        cardHeight
      );

      if (cardImageBuffer) {
        const roundedImage = await sharp(cardImageBuffer)
          .composite([
            {
              input: Buffer.from(`
                <svg width="${cardWidth}" height="${cardHeight}">
                  <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" 
                        rx="12" ry="12" fill="white"/>
                </svg>
              `),
              blend: "dest-in",
            },
          ])
          .png()
          .toBuffer();

        composites.push({
          input: roundedImage,
          top: cardStartY,
          left: cardX,
        });

        const shadowSvg = `
          <svg width="${cardWidth + 8}" height="${cardHeight + 8}">
            <rect x="4" y="4" width="${cardWidth}" height="${cardHeight}" 
                  rx="12" ry="12" 
                  fill="rgba(0,0,0,0.3)" 
                  filter="blur(4px)"/>
          </svg>
        `;
        
      } else {
        const placeholderSvg = `
          <svg width="${cardWidth}" height="${cardHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${cardWidth}" height="${cardHeight}" rx="12" ry="12" fill="rgba(255,255,255,0.1)"/>
            <text x="${cardWidth / 2}" y="${cardHeight / 2}" 
                  text-anchor="middle" dominant-baseline="middle"
                  font-family="system-ui" font-size="14" fill="rgba(255,255,255,0.5)">
              Card
            </text>
          </svg>
        `;

        composites.push({
          input: await sharp(Buffer.from(placeholderSvg)).png().toBuffer(),
          top: cardStartY,
          left: cardX,
        });
      }
    }
  }

  const footerY = height - footerHeight;
  const valueDisplay = totalValue > 0 ? formatCurrency(totalValue) : "";
  const statsDisplay = `${cardCount} card${cardCount !== 1 ? "s" : ""}${valueDisplay ? ` • ${valueDisplay}` : ""}`;

  const footerSvg = `
    <svg width="${width}" height="${footerHeight}" xmlns="http://www.w3.org/2000/svg">
      <text x="40" y="${footerHeight / 2 - 10}" 
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="${statsFontSize}" 
            font-weight="600" 
            fill="white">
        ${escapeXml(statsDisplay)}
      </text>
      <text x="40" y="${footerHeight / 2 + 25}" 
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="${subtitleFontSize - 2}" 
            fill="rgba(255,255,255,0.7)">
        SportsCardPortfolio.com
      </text>
    </svg>
  `;

  composites.push({
    input: await sharp(Buffer.from(footerSvg)).png().toBuffer(),
    top: footerY,
    left: 0,
  });

  const finalImage = await sharp(backgroundBuffer)
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();

  return finalImage;
}

function getThemeGradient(theme: string): { start: string; end: string } {
  const themeGradients: Record<string, { start: string; end: string }> = {
    classic: { start: "#1e3a5f", end: "#0d1b2a" },
    midnight: { start: "#0f0f23", end: "#1a1a2e" },
    "wood-grain": { start: "#4a3728", end: "#2d1810" },
    "velvet-red": { start: "#5c1a1a", end: "#2d0a0a" },
    "ocean-blue": { start: "#1a4a5c", end: "#0a2d3d" },
    emerald: { start: "#1a5c3a", end: "#0a2d1d" },
    "gold-luxury": { start: "#5c4a1a", end: "#2d250a" },
    "royal-purple": { start: "#3a1a5c", end: "#1d0a2d" },
    "dark-wood": { start: "#4a3728", end: "#2d1810" },
    gallery: { start: "#2a2a3a", end: "#1a1a2a" },
    neon: { start: "#1a2a3a", end: "#0a1520" },
    vintage: { start: "#4a4035", end: "#2d2520" },
    minimal: { start: "#3a3a3a", end: "#1a1a1a" },
  };

  return themeGradients[theme] || themeGradients.classic;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function generateBragImage(
  displayCase: DisplayCaseWithCards,
  owner: User,
  baseUrl: string,
  format: "brag-card" | "brag-portfolio",
  width: number,
  height: number
): Promise<Buffer> {
  const cards = displayCase.cards || [];
  const ownerName = owner.firstName
    ? `${owner.firstName}${owner.lastName ? " " + owner.lastName : ""}`
    : "Collector";
  const isPro = owner.subscriptionStatus === "PRO";

  const gradientColors = getThemeGradient(displayCase.theme);
  const composites: sharp.OverlayOptions[] = [];

  // Background
  const svgBackground = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${gradientColors.start};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${gradientColors.end};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
    </svg>
  `;

  const backgroundBuffer = await sharp(Buffer.from(svgBackground)).png().toBuffer();

  if (format === "brag-card") {
    // Top Card Flex - show the highest value card
    const topCard = cards.reduce((max, card) => {
      const currentValue = card.estimatedValue || 0;
      const maxValue = max?.estimatedValue || 0;
      return currentValue > maxValue ? card : max;
    }, cards[0]);

    if (topCard) {
      // Title
      const titleSvg = `
        <svg width="${width}" height="120" xmlns="http://www.w3.org/2000/svg">
          <text x="${width / 2}" y="70" text-anchor="middle"
                font-family="system-ui, -apple-system, sans-serif" 
                font-size="36" font-weight="700" fill="white">
            My Top Card
          </text>
          <text x="${width / 2}" y="105" text-anchor="middle"
                font-family="system-ui, -apple-system, sans-serif" 
                font-size="22" fill="rgba(255,255,255,0.7)">
            Highest Value in My Collection
          </text>
        </svg>
      `;
      composites.push({
        input: await sharp(Buffer.from(titleSvg)).png().toBuffer(),
        top: 60,
        left: 0,
      });

      // Large card image
      const cardWidth = 400;
      const cardHeight = 560;
      const cardX = (width - cardWidth) / 2;
      const cardY = 200;

      const cardImageBuffer = await loadCardImage(
        topCard.imagePath,
        baseUrl,
        cardWidth,
        cardHeight
      );

      if (cardImageBuffer) {
        const roundedImage = await sharp(cardImageBuffer)
          .composite([
            {
              input: Buffer.from(`
                <svg width="${cardWidth}" height="${cardHeight}">
                  <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" 
                        rx="16" ry="16" fill="white"/>
                </svg>
              `),
              blend: "dest-in",
            },
          ])
          .png()
          .toBuffer();

        composites.push({
          input: roundedImage,
          top: cardY,
          left: cardX,
        });
      }

      // Card info
      const cardTitle = topCard.title.length > 35 
        ? topCard.title.substring(0, 32) + "..." 
        : topCard.title;
      const cardValue = topCard.estimatedValue 
        ? formatCurrency(topCard.estimatedValue) 
        : "";

      const infoSvg = `
        <svg width="${width}" height="180" xmlns="http://www.w3.org/2000/svg">
          <text x="${width / 2}" y="50" text-anchor="middle"
                font-family="system-ui, -apple-system, sans-serif" 
                font-size="28" font-weight="600" fill="white">
            ${escapeXml(cardTitle)}
          </text>
          ${cardValue ? `
          <text x="${width / 2}" y="95" text-anchor="middle"
                font-family="system-ui, -apple-system, sans-serif" 
                font-size="48" font-weight="700" fill="#22c55e">
            ${cardValue}
          </text>
          ` : ""}
          <text x="${width / 2}" y="${cardValue ? 140 : 95}" text-anchor="middle"
                font-family="system-ui, -apple-system, sans-serif" 
                font-size="22" fill="rgba(255,255,255,0.7)">
            @${escapeXml(ownerName)}${isPro ? " ★ PRO" : ""}
          </text>
        </svg>
      `;
      composites.push({
        input: await sharp(Buffer.from(infoSvg)).png().toBuffer(),
        top: cardY + cardHeight + 30,
        left: 0,
      });
    }
  } else {
    // Portfolio Value Brag
    const totalValue = cards.reduce((sum, card) => sum + (card.estimatedValue || 0), 0);
    const cardCount = cards.length;
    const caseCount = 1; // Single case view

    // Title
    const titleSvg = `
      <svg width="${width}" height="120" xmlns="http://www.w3.org/2000/svg">
        <text x="${width / 2}" y="70" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="36" font-weight="700" fill="white">
          My Collection Value
        </text>
        <text x="${width / 2}" y="105" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="22" fill="rgba(255,255,255,0.7)">
          Portfolio on Sports Card Portfolio
        </text>
      </svg>
    `;
    composites.push({
      input: await sharp(Buffer.from(titleSvg)).png().toBuffer(),
      top: 100,
      left: 0,
    });

    // Big value number
    const valueSvg = `
      <svg width="${width}" height="200" xmlns="http://www.w3.org/2000/svg">
        <text x="${width / 2}" y="120" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="96" font-weight="800" fill="#22c55e">
          ${formatCurrency(totalValue)}
        </text>
        <text x="${width / 2}" y="170" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="28" fill="rgba(255,255,255,0.7)">
          Total Estimated Value
        </text>
      </svg>
    `;
    composites.push({
      input: await sharp(Buffer.from(valueSvg)).png().toBuffer(),
      top: 280,
      left: 0,
    });

    // Stats row
    const statsSvg = `
      <svg width="${width}" height="120" xmlns="http://www.w3.org/2000/svg">
        <text x="${width / 3}" y="50" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="48" font-weight="700" fill="white">
          ${cardCount}
        </text>
        <text x="${width / 3}" y="85" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="20" fill="rgba(255,255,255,0.6)">
          Cards
        </text>
        <text x="${(width * 2) / 3}" y="50" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="48" font-weight="700" fill="white">
          ${caseCount}
        </text>
        <text x="${(width * 2) / 3}" y="85" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="20" fill="rgba(255,255,255,0.6)">
          Display Case
        </text>
      </svg>
    `;
    composites.push({
      input: await sharp(Buffer.from(statsSvg)).png().toBuffer(),
      top: 550,
      left: 0,
    });

    // Show top 4 cards in a row
    const maxCardsToShow = 4;
    const cardsToShow = cards
      .sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0))
      .slice(0, maxCardsToShow);

    if (cardsToShow.length > 0) {
      const cardWidth = 180;
      const cardHeight = 250;
      const cardGap = 20;
      const totalCardsWidth = cardsToShow.length * cardWidth + (cardsToShow.length - 1) * cardGap;
      const cardStartX = (width - totalCardsWidth) / 2;
      const cardStartY = 720;

      for (let i = 0; i < cardsToShow.length; i++) {
        const card = cardsToShow[i];
        const cardX = cardStartX + i * (cardWidth + cardGap);

        const cardImageBuffer = await loadCardImage(card.imagePath, baseUrl, cardWidth, cardHeight);

        if (cardImageBuffer) {
          const roundedImage = await sharp(cardImageBuffer)
            .composite([
              {
                input: Buffer.from(`
                  <svg width="${cardWidth}" height="${cardHeight}">
                    <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" 
                          rx="12" ry="12" fill="white"/>
                  </svg>
                `),
                blend: "dest-in",
              },
            ])
            .png()
            .toBuffer();

          composites.push({
            input: roundedImage,
            top: cardStartY,
            left: cardX,
          });
        }
      }
    }

    // Owner info
    const ownerSvg = `
      <svg width="${width}" height="80" xmlns="http://www.w3.org/2000/svg">
        <text x="${width / 2}" y="40" text-anchor="middle"
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="24" fill="rgba(255,255,255,0.7)">
          @${escapeXml(ownerName)}${isPro ? " ★ PRO" : ""}
        </text>
      </svg>
    `;
    composites.push({
      input: await sharp(Buffer.from(ownerSvg)).png().toBuffer(),
      top: 1020,
      left: 0,
    });
  }

  // Footer branding
  const footerSvg = `
    <svg width="${width}" height="80" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="50" text-anchor="middle"
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="22" fill="rgba(255,255,255,0.5)">
        SportsCardPortfolio.com
      </text>
    </svg>
  `;
  composites.push({
    input: await sharp(Buffer.from(footerSvg)).png().toBuffer(),
    top: height - 80,
    left: 0,
  });

  const finalImage = await sharp(backgroundBuffer)
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();

  return finalImage;
}
