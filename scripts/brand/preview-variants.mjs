// Renders 3 alternative HobbyAlpha mark concepts that work a sports
// card visual cue into the design. Outputs PNGs to .local/previews/
// for review. Does NOT touch any committed brand asset.
//
// Run: node scripts/brand/preview-variants.mjs

import { writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const BRAND = {
  navyDark: "#0B1220",
  navyMid: "#0F172A",
  navyLight: "#1E2A44",
  amber: "#F59E0B",
  amberHi: "#FBBF24",
  amberLo: "#F97316",
};

const FONT = `Inter, DejaVu Sans, Arial, sans-serif`;

// Shared <defs> block (gradients / glow).
const defs = `
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.navyMid}"/>
      <stop offset="100%" stop-color="${BRAND.navyDark}"/>
    </linearGradient>
    <linearGradient id="alphaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.amberHi}"/>
      <stop offset="55%" stop-color="${BRAND.amber}"/>
      <stop offset="100%" stop-color="${BRAND.amberLo}"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#142036"/>
      <stop offset="100%" stop-color="#0B1220"/>
    </linearGradient>
    <linearGradient id="holoBorder" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="${BRAND.amberHi}"/>
      <stop offset="35%"  stop-color="${BRAND.amber}"/>
      <stop offset="65%"  stop-color="${BRAND.amberLo}"/>
      <stop offset="100%" stop-color="${BRAND.amberHi}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="${BRAND.amber}" stop-opacity="0.55"/>
      <stop offset="60%"  stop-color="${BRAND.amber}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${BRAND.amber}" stop-opacity="0"/>
    </radialGradient>
  </defs>
`;

// Variant A — "Card on tile". Rounded navy tile (same container as today)
// with a vertical trading-card silhouette centered on it. The α is the
// "subject" on the card; thin amber refractor border + two stat lines.
function variantA() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${defs}
  <!-- Outer rounded tile -->
  <rect x="0" y="0" width="1024" height="1024" rx="225" ry="225" fill="url(#bgGrad)"/>
  <!-- Soft amber halo behind the card -->
  <circle cx="512" cy="500" r="380" fill="url(#glow)"/>

  <!-- Trading card, tilted ~6° -->
  <g transform="rotate(-6 512 512)">
    <!-- Refractor border (amber gradient) -->
    <rect x="278" y="178" width="468" height="668" rx="44" ry="44" fill="url(#holoBorder)"/>
    <!-- Card face -->
    <rect x="296" y="196" width="432" height="632" rx="34" ry="34" fill="url(#cardGrad)"/>
    <!-- Inner thin frame -->
    <rect x="320" y="220" width="384" height="584" rx="22" ry="22"
          fill="none" stroke="rgba(245,158,11,0.35)" stroke-width="3"/>
    <!-- Alpha glyph centered as the "player" -->
    <text x="512" y="552" text-anchor="middle" dominant-baseline="middle"
          font-family="${FONT}" font-weight="700" font-size="440"
          fill="url(#alphaGrad)">α</text>
    <!-- Stat lines at the bottom (mimic name / stats strip) -->
    <rect x="352" y="724" width="320" height="10" rx="5" fill="rgba(255,255,255,0.55)"/>
    <rect x="392" y="752" width="240" height="6"  rx="3" fill="rgba(245,158,11,0.75)"/>
  </g>
</svg>`;
}

// Variant B — "Card silhouette only". Drop the outer tile; the mark IS
// a vertical trading card. Reads strongly as a card, less generic.
function variantB() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${defs}
  <!-- Drop shadow under the card -->
  <ellipse cx="512" cy="900" rx="280" ry="22" fill="rgba(0,0,0,0.45)"/>

  <!-- Refractor border -->
  <rect x="180" y="80" width="664" height="864" rx="64" ry="64" fill="url(#holoBorder)"/>
  <!-- Card face -->
  <rect x="204" y="104" width="616" height="816" rx="50" ry="50" fill="url(#cardGrad)"/>
  <!-- Inner frame -->
  <rect x="240" y="140" width="544" height="744" rx="34" ry="34"
        fill="none" stroke="rgba(245,158,11,0.4)" stroke-width="4"/>

  <!-- Glow behind alpha -->
  <circle cx="512" cy="500" r="340" fill="url(#glow)"/>

  <!-- Alpha glyph -->
  <text x="512" y="540" text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-weight="700" font-size="520"
        fill="url(#alphaGrad)">α</text>

  <!-- Bottom name plate -->
  <rect x="288" y="780" width="448" height="72" rx="14" fill="rgba(245,158,11,0.95)"/>
  <text x="512" y="832" text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-weight="700" font-size="44"
        fill="${BRAND.navyDark}" letter-spacing="6">HOBBYALPHA</text>
</svg>`;
}

// Variant C — "Slab corners". Keep the current tile + α, but add the
// L-shaped corner brackets that read like a graded card slab label.
// Most subtle of the three; preserves continuity with what's shipped.
function variantC() {
  // Helper: an L-bracket as a path centered at (cx,cy) with arm length L.
  const bracket = (x, y, dx, dy, L = 90, w = 14) => {
    // dx,dy = direction the L faces (-1 or 1)
    return `<path d="M ${x} ${y + dy * L}
                    L ${x} ${y}
                    L ${x + dx * L} ${y}"
                  stroke="url(#holoBorder)" stroke-width="${w}"
                  stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  };

  const inset = 132;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${defs}
  <!-- Outer rounded tile -->
  <rect x="0" y="0" width="1024" height="1024" rx="225" ry="225" fill="url(#bgGrad)"/>
  <!-- Halo -->
  <circle cx="512" cy="512" r="360" fill="url(#glow)"/>

  <!-- Slab corner brackets -->
  ${bracket(inset, inset, 1, 1)}
  ${bracket(1024 - inset, inset, -1, 1)}
  ${bracket(inset, 1024 - inset, 1, -1)}
  ${bracket(1024 - inset, 1024 - inset, -1, -1)}

  <!-- Alpha glyph -->
  <text x="512" y="540" text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-weight="700" font-size="600"
        fill="url(#alphaGrad)">α</text>

  <!-- Tiny grade chip at the top, like a PSA grade label -->
  <rect x="432" y="78" width="160" height="46" rx="10" fill="rgba(245,158,11,0.95)"/>
  <text x="512" y="111" text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-weight="700" font-size="26"
        fill="${BRAND.navyDark}" letter-spacing="4">ALPHA 10</text>
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
  await rasterize(variantA(), ".local/previews/variant-a-card-on-tile.png", 512);
  await rasterize(variantB(), ".local/previews/variant-b-card-only.png", 512);
  await rasterize(variantC(), ".local/previews/variant-c-slab-corners.png", 512);
  console.log("Variants written to .local/previews/variant-{a,b,c}-*.png");
}

main().catch((e) => { console.error(e); process.exit(1); });
