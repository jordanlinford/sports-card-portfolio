import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const BASE =
  process.env.SCREENSHOT_BASE ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "http://localhost:5000");

const OUT_DIR = resolve(process.cwd(), "client/public/screenshots");

async function ensureDir(p) {
  await mkdir(dirname(p), { recursive: true });
}

const HIDE_DEV_BANNERS_CSS = `
  /* Hide Replit dev preview banner injected by the proxy */
  div[data-replit-deploy-banner],
  iframe[name="replit-dev-banner"],
  div[class*="replit-dev"],
  div[class*="DevBanner"],
  #replit-dev-banner,
  div[role="banner"][class*="preview"] {
    display: none !important;
    height: 0 !important;
  }
  /* Hide the in-app Google link banner so the screenshot focuses on product UI */
  [data-testid="banner-google-link"] { display: none !important; }
`;

async function preparePage(page) {
  await page.addStyleTag({ content: HIDE_DEV_BANNERS_CSS });
  // Mark the Google link banner as dismissed in case it renders before the style tag.
  await page
    .evaluate(() => {
      try {
        localStorage.setItem("google-link-banner-dismissed", "true");
      } catch {}
    })
    .catch(() => {});
}

async function takeWideShot(browser) {
  const context = await browser.newContext({
    viewport: { width: 1408, height: 768 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/alpha`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("text=Daily Alpha", { timeout: 30000 });
  await preparePage(page);
  await page.waitForTimeout(1500);

  const target = `${OUT_DIR}/screenshot-wide.png`;
  await ensureDir(target);
  await page.screenshot({ path: target, type: "png", fullPage: false });
  console.log(`Wrote ${target}`);
  await context.close();
}

async function qaLogin(context) {
  const token = process.env.QA_LOGIN_TOKEN;
  if (!token) throw new Error("QA_LOGIN_TOKEN env var is required for the narrow shot");
  const res = await context.request.post(`${BASE}/api/auth/qa-login`, {
    headers: { "x-qa-token": token, "content-type": "application/json" },
    data: {},
  });
  if (!res.ok()) {
    throw new Error(`QA login failed: ${res.status()} ${await res.text()}`);
  }
}

async function takeNarrowShot(browser) {
  const context = await browser.newContext({
    viewport: { width: 768, height: 1408 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  });

  await qaLogin(context);

  const page = await context.newPage();
  await page.goto(`${BASE}/player-outlook`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("text=Player Outlook", { timeout: 30000 });
  await preparePage(page);

  const input = page.locator('input[placeholder*="player name" i]').first();
  await input.click();
  await input.fill("Josh Allen");

  const analyze = page.getByRole("button", { name: /^analyze$/i }).first();
  await analyze.click();

  await page
    .waitForResponse(
      (resp) =>
        resp.url().includes("/api/player-outlook") &&
        resp.request().method() === "POST" &&
        resp.status() < 500,
      { timeout: 90000 },
    )
    .catch(() => {});

  await page
    .waitForSelector("text=/verdict|investment thesis|market temperature/i", { timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(2500);

  const target = `${OUT_DIR}/screenshot-narrow.png`;
  await ensureDir(target);
  await page.screenshot({ path: target, type: "png", fullPage: false });
  console.log(`Wrote ${target}`);
  await context.close();
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    await takeWideShot(browser);
    await takeNarrowShot(browser);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
