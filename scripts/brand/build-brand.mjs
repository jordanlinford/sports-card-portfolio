// Builds the HobbyAlpha brand assets:
//   - client/src/assets/brand/logo-mark.svg
//   - client/src/assets/brand/logo-mark-maskable.svg
//   - client/src/assets/brand/wordmark-light.svg
//   - client/src/assets/brand/wordmark-dark.svg
//   - client/public/favicon.png
//   - client/public/icons/icon-{72..1024}.png
//   - client/public/og-default.png
//   - client/public/splash/apple-splash-{W}x{H}.png   (iOS PWA launch images)
//
// Run with: node scripts/brand/build-brand.mjs

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");

// HobbyAlpha palette: deep navy backdrop + holographic refractor accent.
// The holo gradient (cyan → violet → pink → gold) is the most iconic
// visual cue in modern sports-card collecting (Topps Chrome, Bowman
// refractors), which is what the mark is built around.
const BRAND = {
  navyDark: "#070B16",
  navyMid: "#0F172A",
  navyDeep: "#0B1220",
  cardEdge: "#1E293B",
  ink: "#0F172A",
  paper: "#FFFFFF",
  // Holo refractor stops, used in `holoGrad`.
  holo1: "#22D3EE", // cyan
  holo2: "#A78BFA", // violet
  holo3: "#F472B6", // pink
  holo4: "#FACC15", // gold
};

const FONT = `Inter, DejaVu Sans, Arial, sans-serif`;

// -- Building blocks ---------------------------------------------------------

// A reusable HobbyAlpha mark. Renders a tilted trading card with a
// holographic refractor border and a bold white "HA" monogram on the
// card face, sitting inside a rounded navy tile.
//
// Variants:
//   "rounded"  — rounded navy tile on a transparent background. Used
//                for the favicon, in-app logos, and the standard PWA
//                icon ladder (`purpose: any`).
//   "maskable" — full-bleed navy background so launchers can mask the
//                icon to any shape (`purpose: maskable`) without
//                clipping the card or the monogram.
function markSvg({ size = 1024, variant = "rounded" } = {}) {
  const isMaskable = variant === "maskable";
  // Inner safe inset for maskable. The card art lives inside this inset
  // so it survives the inner-80% safe zone any launcher may crop to.
  const inset = isMaskable ? 102 : 0;
  const tile = 1024 - inset * 2;
  const tileR = Math.round(tile * 0.22); // iOS-style rounded corner

  // Card geometry, expressed in the 1024 canvas. Slightly tilted so the
  // mark feels collectible and not just a generic app icon.
  // Ratio ~2:3 mimics a real trading card.
  const cardW = isMaskable ? 460 : 484;
  const cardH = isMaskable ? 660 : 700;
  const cardX = 512 - cardW / 2;
  const cardY = 512 - cardH / 2 - 6; // nudge up to balance shadow weight
  const cardR = 44;
  const borderInset = 18; // refractor border thickness
  const tilt = -7; // degrees

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.navyMid}"/>
      <stop offset="100%" stop-color="${BRAND.navyDark}"/>
    </linearGradient>
    <linearGradient id="cardFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.cardEdge}"/>
      <stop offset="100%" stop-color="${BRAND.navyDeep}"/>
    </linearGradient>
    <!-- Holographic refractor border. Stops cycle the four hobby
         colors so the gradient reads as "shimmer" at any size. -->
    <linearGradient id="holoGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="${BRAND.holo1}"/>
      <stop offset="33%"  stop-color="${BRAND.holo2}"/>
      <stop offset="66%"  stop-color="${BRAND.holo3}"/>
      <stop offset="100%" stop-color="${BRAND.holo4}"/>
    </linearGradient>
    <!-- Soft top-left sheen on the card face, like light hitting plastic. -->
    <radialGradient id="cardSheen" cx="32%" cy="18%" r="85%">
      <stop offset="0%"  stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <clipPath id="tileClip">
      <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${tileR}" ry="${tileR}"/>
    </clipPath>
  </defs>

  ${
    isMaskable
      ? `<rect x="0" y="0" width="1024" height="1024" fill="url(#bgGrad)"/>`
      : ""
  }

  <!-- Tile background -->
  <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}"
        rx="${tileR}" ry="${tileR}" fill="url(#bgGrad)"/>

  <!-- Card group, clipped to the tile so the tilt never bleeds out -->
  <g clip-path="url(#tileClip)">
    <g transform="rotate(${tilt} 512 512)">
      <!-- Soft drop shadow under the card -->
      <ellipse cx="512" cy="${cardY + cardH + 24}" rx="${cardW * 0.42}" ry="18"
               fill="rgba(0,0,0,0.55)"/>

      <!-- Refractor border (full card rectangle in holo gradient) -->
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}"
            rx="${cardR}" ry="${cardR}" fill="url(#holoGrad)"/>

      <!-- Card face (inset by border thickness) -->
      <rect x="${cardX + borderInset}" y="${cardY + borderInset}"
            width="${cardW - borderInset * 2}" height="${cardH - borderInset * 2}"
            rx="${cardR - 8}" ry="${cardR - 8}" fill="url(#cardFace)"/>

      <!-- Plastic sheen -->
      <rect x="${cardX + borderInset}" y="${cardY + borderInset}"
            width="${cardW - borderInset * 2}" height="${cardH - borderInset * 2}"
            rx="${cardR - 8}" ry="${cardR - 8}" fill="url(#cardSheen)"/>

      <!-- Inner thin frame, like a card's photo window -->
      <rect x="${cardX + borderInset + 22}" y="${cardY + borderInset + 22}"
            width="${cardW - (borderInset + 22) * 2}"
            height="${cardH - (borderInset + 22) * 2}"
            rx="${cardR - 18}" ry="${cardR - 18}"
            fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>

      <!-- HA monogram, the "subject" on the card -->
      <text x="512" y="${cardY + cardH * 0.52}"
            text-anchor="middle" dominant-baseline="middle"
            font-family="${FONT}" font-weight="800"
            font-size="${Math.round(cardH * 0.46)}"
            fill="${BRAND.paper}" letter-spacing="-12">HA</text>
    </g>
  </g>
</svg>`;
}

// Horizontal wordmark: square mark + "HobbyAlpha" text. The text fill
// changes between the light/dark variants so the wordmark stays legible
// on both surface colors. "Alpha" picks up the holo gradient so the
// wordmark visually echoes the mark.
function wordmarkSvg({ variant = "light" } = {}) {
  // variant = "light"  → for dark backgrounds (white "Hobby" text)
  // variant = "dark"   → for light backgrounds (ink "Hobby" text)
  const hobbyFill = variant === "light" ? BRAND.paper : BRAND.ink;
  const w = 1320;
  const h = 260;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="alphaWord" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="${BRAND.holo1}"/>
      <stop offset="33%"  stop-color="${BRAND.holo2}"/>
      <stop offset="66%"  stop-color="${BRAND.holo3}"/>
      <stop offset="100%" stop-color="${BRAND.holo4}"/>
    </linearGradient>
  </defs>

  <!-- Mark, scaled into a 220x220 box on the left. -->
  <g transform="translate(0,20) scale(0.215)">
    ${markSvg({ size: 1024 }).replace(/^<\?xml.*?\?>\s*/, "").replace(/<svg [^>]*>/, "<g>").replace(/<\/svg>/, "</g>")}
  </g>

  <!-- Wordmark text. Inter is preferred in the browser; DejaVu is the
       fallback used by sharp/librsvg during server-side rasterization. -->
  <text font-family="${FONT}"
        font-weight="700"
        font-size="148"
        x="260"
        y="172"
        letter-spacing="-3">
    <tspan fill="${hobbyFill}">Hobby</tspan><tspan fill="url(#alphaWord)">Alpha</tspan>
  </text>
</svg>`;
}

// Open Graph share card (1200x630): mark on the left, wordmark and
// tagline on the right, navy backdrop with a soft holo glow.
function ogCardSvg() {
  const w = 1200;
  const h = 630;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND.navyDeep}"/>
      <stop offset="100%" stop-color="#111A2E"/>
    </linearGradient>
    <radialGradient id="halo" cx="22%" cy="50%" r="55%">
      <stop offset="0%"  stop-color="${BRAND.holo2}" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="${BRAND.holo3}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${BRAND.holo3}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="alphaGradOg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="${BRAND.holo1}"/>
      <stop offset="33%"  stop-color="${BRAND.holo2}"/>
      <stop offset="66%"  stop-color="${BRAND.holo3}"/>
      <stop offset="100%" stop-color="${BRAND.holo4}"/>
    </linearGradient>
    <linearGradient id="pinstripe" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${BRAND.holo1}"/>
      <stop offset="33%"  stop-color="${BRAND.holo2}"/>
      <stop offset="66%"  stop-color="${BRAND.holo3}"/>
      <stop offset="100%" stop-color="${BRAND.holo4}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#halo)"/>

  <!-- Pinstripe accents top + bottom, in holo gradient -->
  <rect x="0" y="0" width="${w}" height="6" fill="url(#pinstripe)"/>
  <rect x="0" y="${h - 6}" width="${w}" height="6" fill="url(#pinstripe)" opacity="0.6"/>

  <!-- Mark on the left, scaled into a ~280x280 box -->
  <g transform="translate(120,175) scale(0.273)">
    ${markSvg({ size: 1024 }).replace(/^<\?xml.*?\?>\s*/, "").replace(/<svg [^>]*>/, "<g>").replace(/<\/svg>/, "</g>")}
  </g>

  <!-- Wordmark and tagline, right of the mark -->
  <g font-family="${FONT}">
    <text x="450" y="295" font-size="104" font-weight="700" fill="${BRAND.paper}" letter-spacing="-3">Hobby<tspan fill="url(#alphaGradOg)">Alpha</tspan></text>
    <text x="450" y="360" font-size="30" font-weight="600" fill="#94A3B8" letter-spacing="3">AI BUY · HOLD · SELL VERDICTS</text>
    <text x="450" y="412" font-size="24" font-weight="400" fill="#64748B">Backed by real eBay sold comps · Free to use</text>
  </g>

  <!-- Site URL bottom-right -->
  <g font-family="${FONT}" text-anchor="end">
    <text x="${w - 120}" y="${h - 60}" font-size="28" font-weight="600" fill="#CBD5E1">hobbyalpha.com</text>
  </g>
</svg>`;
}

// iOS PWA splash screen. Renders the HobbyAlpha mark above a
// "HobbyAlpha" text wordmark, centered on the navy gradient background
// so the launch transition matches the home-screen icon and the app's
// own theme color. Sized to the device's portrait pixel resolution;
// iOS handles rotation itself by cropping/scaling the portrait splash.
//
// We deliberately render the wordmark as plain text here (not the
// reusable wordmark SVG) because the wordmark SVG embeds a small copy
// of the mark, which would duplicate the big mark above on the splash.
function splashSvg({ width, height }) {
  // Pick a mark size that scales with the shorter device edge so the
  // splash reads well on small iPhones and large iPads alike.
  const short = Math.min(width, height);
  const markSize = Math.round(short * 0.42);
  const markX = Math.round((width - markSize) / 2);
  // Sit the mark slightly above center, with the wordmark below it,
  // so the pair feels visually balanced (not bottom-heavy).
  const markY = Math.round(height / 2 - markSize * 0.62);

  // Wordmark text below the mark.
  const wordFontSize = Math.round(short * 0.085);
  const wordY = markY + markSize + Math.round(short * 0.09);

  // Inline a copy of the rounded mark so the splash rasterizes from a
  // single self-contained SVG (no external fetches at build time).
  const markInline = markSvg({ size: 1024, variant: "rounded" })
    .replace(/^<\?xml.*?\?>\s*/, "")
    .replace(/<svg [^>]*>/, `<svg x="${markX}" y="${markY}" width="${markSize}" height="${markSize}" viewBox="0 0 1024 1024">`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="splashBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.navyMid}"/>
      <stop offset="100%" stop-color="${BRAND.navyDark}"/>
    </linearGradient>
    <radialGradient id="splashHalo" cx="50%" cy="42%" r="48%">
      <stop offset="0%"  stop-color="${BRAND.holo2}" stop-opacity="0.18"/>
      <stop offset="60%" stop-color="${BRAND.holo3}" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="${BRAND.holo3}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="splashAlpha" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="${BRAND.holo1}"/>
      <stop offset="33%"  stop-color="${BRAND.holo2}"/>
      <stop offset="66%"  stop-color="${BRAND.holo3}"/>
      <stop offset="100%" stop-color="${BRAND.holo4}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#splashBg)"/>
  <rect width="${width}" height="${height}" fill="url(#splashHalo)"/>
  ${markInline}
  <text x="${width / 2}" y="${wordY}"
        text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-weight="700"
        font-size="${wordFontSize}"
        letter-spacing="${-Math.round(wordFontSize * 0.02)}">
    <tspan fill="${BRAND.paper}">Hobby</tspan><tspan fill="url(#splashAlpha)">Alpha</tspan>
  </text>
</svg>`;
}

// -- Output ------------------------------------------------------------------

const ICON_SIZES = [72, 96, 120, 128, 144, 152, 180, 192, 384, 512, 1024];

// iOS PWA splash sizes. Each entry is { width, height, dWidth, dHeight,
// ratio } where width/height are the splash PNG resolution (device
// pixels) and dWidth/dHeight are the matching CSS-pixel device size
// used in the apple-touch-startup-image media query.
//
// Devices covered:
//   - 12.9" iPad Pro            (2048x2732, @2x)
//   - 11"   iPad Pro            (1668x2388, @2x)
//   - 9.7"  iPad / iPad Mini    (1536x2048, @2x)
//   - iPhone 12/13/14 Pro Max   (1284x2778, @3x)
//   - iPhone XS Max / 11 Pro Max(1242x2688, @3x)
//   - iPhone 12/13/14           (1170x2532, @3x)
//   - iPhone X / XS / 11 Pro    (1125x2436, @3x)
//   - iPhone XR / 11            (828x1792,  @2x)
//   - iPhone 6 / 7 / 8          (750x1334,  @2x)
const SPLASH_SIZES = [
  { width: 2048, height: 2732, dWidth: 1024, dHeight: 1366, ratio: 2 },
  { width: 1668, height: 2388, dWidth: 834,  dHeight: 1194, ratio: 2 },
  { width: 1536, height: 2048, dWidth: 768,  dHeight: 1024, ratio: 2 },
  { width: 1284, height: 2778, dWidth: 428,  dHeight: 926,  ratio: 3 },
  { width: 1242, height: 2688, dWidth: 414,  dHeight: 896,  ratio: 3 },
  { width: 1170, height: 2532, dWidth: 390,  dHeight: 844,  ratio: 3 },
  { width: 1125, height: 2436, dWidth: 375,  dHeight: 812,  ratio: 3 },
  { width: 828,  height: 1792, dWidth: 414,  dHeight: 896,  ratio: 2 },
  { width: 750,  height: 1334, dWidth: 375,  dHeight: 667,  ratio: 2 },
];

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function writePng(svg, outPath, size) {
  const buf = await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await writeFile(outPath, buf);
}

async function writeOg(svg, outPath) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(outPath, buf);
}

async function main() {
  const brandDir = resolve(ROOT, "client/src/assets/brand");
  const publicDir = resolve(ROOT, "client/public");
  const iconDir = resolve(publicDir, "icons");
  await ensureDir(brandDir);
  await ensureDir(iconDir);

  // 1. Save SVG sources used by the React app.
  const markRounded = markSvg({ size: 1024, variant: "rounded" });
  const markMaskable = markSvg({ size: 1024, variant: "maskable" });
  await writeFile(resolve(brandDir, "logo-mark.svg"), markRounded);
  await writeFile(resolve(brandDir, "logo-mark-maskable.svg"), markMaskable);
  await writeFile(resolve(brandDir, "wordmark-light.svg"), wordmarkSvg({ variant: "light" }));
  await writeFile(resolve(brandDir, "wordmark-dark.svg"), wordmarkSvg({ variant: "dark" }));

  // 2. Favicon — rounded mark, rasterized at 256.
  await writePng(markRounded, resolve(publicDir, "favicon.png"), 256);

  // 3. PWA icon ladder. The 192/512/1024 tiles also act as maskable so
  //    we use the full-bleed maskable variant to keep the card inside
  //    the inner safe zone any launcher will mask to.
  for (const size of ICON_SIZES) {
    const isMaskable = [192, 512, 1024].includes(size);
    const svg = isMaskable ? markMaskable : markRounded;
    await writePng(svg, resolve(iconDir, `icon-${size}x${size}.png`), size);
  }

  // 4. Open Graph share card.
  await writeOg(ogCardSvg(), resolve(publicDir, "og-default.png"));

  // 5. iOS PWA splash screens. Each PNG is sized to a real iPhone/iPad
  //    portrait pixel resolution and is referenced from index.html via
  //    a matching apple-touch-startup-image media query. Without these,
  //    iOS shows a plain white card during PWA launch.
  const splashDir = resolve(publicDir, "splash");
  await ensureDir(splashDir);
  for (const { width, height } of SPLASH_SIZES) {
    const svg = splashSvg({ width, height });
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    await writeFile(
      resolve(splashDir, `apple-splash-${width}x${height}.png`),
      buf,
    );
  }

  // Print the canonical <link> tags derived from SPLASH_SIZES so that
  // SPLASH_SIZES stays the single source of truth: if the device list
  // ever changes, copy this output into the iOS PWA splash block in
  // client/index.html instead of hand-editing media queries.
  console.log("\nApple touch startup image link tags (paste into client/index.html):");
  for (const { width, height, dWidth, dHeight, ratio } of SPLASH_SIZES) {
    console.log(
      `<link rel="apple-touch-startup-image" href="/splash/apple-splash-${width}x${height}.png"\n` +
      `      media="(device-width: ${dWidth}px) and (device-height: ${dHeight}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)" />`
    );
  }

  console.log("\nBrand assets generated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
