import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:9870";
const outDir = new URL("../output/screenshots/review-v2/", import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const desktop = { width: 1440, height: 900 };
const wide = { width: 1680, height: 1000 };
const mobile = { width: 390, height: 844 };

const ctx = await browser.newContext({ viewport: desktop });
const page = await ctx.newPage();
const perf = {};

async function shoot(name, viewport, doIt) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(150);
  const t0 = Date.now();
  await doIt();
  perf[name] = Date.now() - t0;
  await page.screenshot({ path: new URL(`${name}.png`, outDir).pathname, fullPage: false });
}

// Select the row inside the desktop wrapper specifically — the mobile card
// list has its own `data-session-id` carriers and the table is hidden by
// `hidden md:block` on small screens.
const DESKTOP_ROW = ".md\\:block table[aria-label='Sessions results'] tbody tr[data-session-id], div.md\\:block tbody tr[data-session-id]";
const MOBILE_ROW = "[data-testid='result-card']";

async function waitDesktopRow() {
  // wait for the data to be in the DOM (state: attached). The card elements
  // are hidden by md:hidden at desktop, but they still exist; once they're
  // attached the table rows are too.
  await page.waitForSelector("[data-session-id]", { state: "attached", timeout: 12_000 });
  await page.waitForTimeout(250);
}

await shoot("01-search-default-desktop", desktop, async () => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitDesktopRow();
});

await shoot("02-search-query-desktop", desktop, async () => {
  await page.goto(`${baseUrl}/?query=test`, { waitUntil: "domcontentloaded" });
  await waitDesktopRow();
});

await shoot("03-search-drawer-expanded-desktop", desktop, async () => {
  await page.goto(`${baseUrl}/?query=test`, { waitUntil: "domcontentloaded" });
  await waitDesktopRow();
  const firstRow = page.locator("table[aria-label='Sessions results'] tbody tr[data-session-id]").first();
  if (await firstRow.count()) await firstRow.click();
  await page.waitForTimeout(500);
});

await shoot("04-search-filters-open-desktop", desktop, async () => {
  await page.goto(`${baseUrl}/?query=test`, { waitUntil: "domcontentloaded" });
  // results may or may not exist depending on query; just give the page a beat
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(400);
  // open filters disclosure if collapsed
  const adv = page.locator("details summary", { hasText: "Advanced filters" }).first();
  if (await adv.count()) await adv.click();
  await page.waitForTimeout(300);
});

await shoot("05-session-detail-desktop", desktop, async () => {
  await page.goto(`${baseUrl}/session/claude:fixture-perf-200`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#sessionDetails .sd-panel, [data-testid='turn-card'], article[data-bootstrap], article", { timeout: 15_000 });
  await page.waitForTimeout(400);
});

await shoot("06-session-detail-transcript-desktop", desktop, async () => {
  // scroll a bit so we see the transcript pane
  await page.evaluate(() => window.scrollTo(0, 360));
  await page.waitForTimeout(200);
});

await shoot("07-tools-desktop", desktop, async () => {
  await page.goto(`${baseUrl}/tools`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg, canvas", { timeout: 15_000 });
  await page.waitForTimeout(800);
});

await shoot("08-pi-sidebar-empty", desktop, async () => {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitDesktopRow();
  // crop will be the right side; full screenshot is fine
});

await shoot("09-search-default-mobile", mobile, async () => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(MOBILE_ROW, { timeout: 12_000 });
});

await shoot("10-search-mobile-nav-open", mobile, async () => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  // Wait for hydration before clicking — the toggle's onClick handler is
  // attached during client hydration, not at HTML parse time. Without this
  // wait, the click fires on an unhydrated button and silently no-ops.
  await page.waitForSelector("[data-session-id]", { state: "attached", timeout: 12_000 });
  await page.waitForTimeout(250);
  const toggle = page.locator("button[aria-controls='mobile-nav-drawer']").first();
  await toggle.click();
  await page.waitForSelector("#mobile-nav-drawer:not([hidden])", { timeout: 5_000 });
});

await shoot("11-session-detail-mobile", mobile, async () => {
  await page.goto(`${baseUrl}/session/claude:fixture-perf-200`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
});

await shoot("12-search-wide-desktop", wide, async () => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitDesktopRow();
});

await writeFile(new URL("perf.json", outDir).pathname, JSON.stringify(perf, null, 2));
await browser.close();
console.log("done", perf);
