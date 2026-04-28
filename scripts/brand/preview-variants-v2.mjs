// Round 2 of HobbyAlpha mark concepts — moving away from amber-on-dark
// (which reads as Amazon-adjacent) toward palettes / glyphs that say
// "trading card hobby" first.
//
// Run: node scripts/brand/preview-variants-v2.mjs

import { writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const FONT = `Inter, DejaVu Sans, Arial, sans-serif`;

// ---- Variant D: "Refractor" --------------------------------------------------
// Tilted trading card with the iconic holographic refractor border
// (cyan → magenta → yellow shimmer). White HA monogram on the card so
// no orange curve at all. Background is deep navy.
function variantD() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bgD" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#070B16"/>
    </linearGradient>
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#22D3EE"/>
      <stop offset="33%"  stop-color="#A78BFA"/>
      <stop offset="66%"  stop-color="#F472B6"/>
      <stop offset="100%" stop-color="#FACC15"/>
    </linearGradient>
    <linearGradient id="cardD" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#0B1220"/>
    </linearGradient>
    <radialGradient id="sheen" cx="35%" cy="20%" r="80%">
      <stop offset="0%"  stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>

  <rect x="0" y="0" width="1024" height="1024" rx="225" fill="url(#bgD)"/>

  <g transform="rotate(-7 512 512)">
    <!-- Holo border -->
    <rect x="270" y="160" width="484" height="704" rx="48" fill="url(#holo)"/>
    <!-- Card face -->
    <rect x="290" y="180" width="444" height="664" rx="36" fill="url(#cardD)"/>
    <!-- Subtle sheen on the card -->
    <rect x="290" y="180" width="444" height="664" rx="36" fill="url(#sheen)"/>
    <!-- Inner thin frame -->
    <rect x="316" y="206" width="392" height="612" rx="24"
          fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>

    <!-- HA monogram -->
    <text x="512" y="540" text-anchor="middle" dominant-baseline="middle"
          font-family="${FONT}" font-weight="800" font-size="320"
          fill="#FFFFFF" letter-spacing="-12">HA</text>

    <!-- Tagline strip -->
    <rect x="346" y="724" width="332" height="8" rx="4" fill="rgba(255,255,255,0.55)"/>
    <text x="512" y="772" text-anchor="middle" dominant-baseline="middle"
          font-family="${FONT}" font-weight="600" font-size="36"
          fill="rgba(255,255,255,0.7)" letter-spacing="8">HOBBYALPHA</text>
  </g>
</svg>`;
}

// ---- Variant E: "Gem Mint" --------------------------------------------------
// Emerald + champagne gold palette (graded-slab gem mint vibe). The
// glyph is a tight stack of three cards seen edge-on, with a small
// upward tick, so the sports-card + investment ideas land without any
// α curve.
function variantE() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bgE" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B3A2E"/>
      <stop offset="100%" stop-color="#062119"/>
    </linearGradient>
    <linearGradient id="goldE" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="55%" stop-color="#E8C26A"/>
      <stop offset="100%" stop-color="#A47A2C"/>
    </linearGradient>
    <linearGradient id="cardE" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#CBD5E1"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="1024" height="1024" rx="225" fill="url(#bgE)"/>

  <!-- Subtle gold grade-band at top, like a slab label -->
  <rect x="262" y="118" width="500" height="56" rx="12" fill="url(#goldE)"/>
  <text x="512" y="155" text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-weight="800" font-size="30"
        fill="#062119" letter-spacing="6">HOBBY ALPHA · GEM MINT</text>

  <!-- Stack of three cards, tilted, forming an upward staircase -->
  <g>
    <!-- back card -->
    <g transform="rotate(-12 512 600) translate(0,40)">
      <rect x="240" y="270" width="420" height="600" rx="30" fill="url(#cardE)" opacity="0.55"/>
      <rect x="240" y="270" width="420" height="600" rx="30" fill="none" stroke="url(#goldE)" stroke-width="6"/>
    </g>
    <!-- middle card -->
    <g transform="rotate(-3 512 600) translate(20,20)">
      <rect x="260" y="260" width="420" height="600" rx="30" fill="url(#cardE)" opacity="0.85"/>
      <rect x="260" y="260" width="420" height="600" rx="30" fill="none" stroke="url(#goldE)" stroke-width="6"/>
    </g>
    <!-- front card -->
    <g transform="rotate(6 512 600)">
      <rect x="280" y="250" width="420" height="600" rx="30" fill="url(#cardE)"/>
      <rect x="280" y="250" width="420" height="600" rx="30" fill="none" stroke="url(#goldE)" stroke-width="8"/>

      <!-- Up-trend chart line on the front card -->
      <polyline points="320,720 410,640 480,680 560,560 640,500 700,420"
                fill="none" stroke="#0B3A2E" stroke-width="14"
                stroke-linecap="round" stroke-linejoin="round"/>
      <!-- arrowhead -->
      <polygon points="700,420 680,460 720,440" fill="#0B3A2E"/>

      <!-- Footer plate -->
      <rect x="320" y="760" width="340" height="60" rx="10" fill="#0B3A2E"/>
      <text x="490" y="794" text-anchor="middle" dominant-baseline="middle"
            font-family="${FONT}" font-weight="800" font-size="34"
            fill="url(#goldE)" letter-spacing="3">HOBBYALPHA</text>
    </g>
  </g>
</svg>`;
}

// ---- Variant F: "Diamond plate" ---------------------------------------------
// Drops the rounded square entirely. The mark is a baseball/poker
// diamond rotated card with a bold serifed "α" cut as a window. Royal
// purple + warm gold is far enough from Amazon's palette to be distinct
// and reads as collectible / premium.
function variantF() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bgF" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E1B4B"/>
      <stop offset="100%" stop-color="#0F0C2A"/>
    </linearGradient>
    <linearGradient id="diamondF" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="#312E81"/>
      <stop offset="100%" stop-color="#0F0C2A"/>
    </linearGradient>
    <linearGradient id="goldF" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#FDE68A"/>
      <stop offset="60%" stop-color="#D4A24C"/>
      <stop offset="100%" stop-color="#8B5A1A"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="1024" height="1024" rx="225" fill="url(#bgF)"/>

  <!-- Diamond (square rotated 45°) — references both baseball diamond
       and the "diamond" rarity tier on cards -->
  <g transform="rotate(45 512 512)">
    <rect x="156" y="156" width="712" height="712" rx="60"
          fill="url(#diamondF)" stroke="url(#goldF)" stroke-width="14"/>
    <rect x="196" y="196" width="632" height="632" rx="44"
          fill="none" stroke="rgba(253,230,138,0.35)" stroke-width="3"/>
  </g>

  <!-- Alpha glyph (upright, not rotated) sitting inside the diamond -->
  <text x="512" y="555" text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-weight="700" font-size="520"
        fill="url(#goldF)">α</text>

  <!-- Tiny grade chip at top -->
  <rect x="442" y="62" width="140" height="40" rx="8" fill="url(#goldF)"/>
  <text x="512" y="87" text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-weight="800" font-size="22"
        fill="#1E1B4B" letter-spacing="3">HOBBYALPHA</text>
</svg>`;
}

async function rasterize(svg, outPath, size = 512) {
  const buf = await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await writeFile(outPath, buf);
}

async function main() {
  await mkdir(".local/previews", { recursive: true });
  await rasterize(variantD(), ".local/previews/variant-d-refractor.png", 512);
  await rasterize(variantE(), ".local/previews/variant-e-gemmint.png", 512);
  await rasterize(variantF(), ".local/previews/variant-f-diamond.png", 512);
  console.log("V2 variants written to .local/previews/");
}

main().catch((e) => { console.error(e); process.exit(1); });
