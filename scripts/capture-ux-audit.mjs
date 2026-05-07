import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const baseUrl = process.env.BASE_URL ?? "http://localhost:8896";
const outDir = process.env.AUDIT_OUT_DIR
  ? new URL(`${process.env.AUDIT_OUT_DIR.replace(/\/$/u, "")}/`, `file://${process.cwd()}/`)
  : new URL("../output/ux-audit-round1/", import.meta.url);
await mkdir(outDir, { recursive: true });

function dbSessionId() {
  try {
    return execFileSync("sqlite3", [
      `${process.env.HOME}/.local/share/session-review/sessions.sqlite`,
      "select id from sessions order by started_at desc limit 1",
    ], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const sessionId = process.env.SESSION_ID || dbSessionId();
if (!sessionId) throw new Error("Could not find an indexed session id for screenshots");

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage({ viewport: { width: 1590, height: 992 }, deviceScaleFactor: 1 });
const shots = [];

async function waitForSearch() {
  await page.waitForFunction(() => document.getElementById("statusLine")?.textContent?.includes("Search completed"), null, { timeout: 20_000 });
}

async function waitForSession() {
  await page.getByRole("heading", { name: "Transcript", exact: true }).waitFor({ timeout: 20_000 });
}

async function shot(name, description, options = {}) {
  const path = new URL(`${name}.png`, outDir).pathname;
  await page.screenshot({ path, fullPage: false, ...options });
  shots.push({ name, description, path });
}

await page.goto(`${baseUrl}/?limit=25`);
await waitForSearch();
await shot("01-sessions-default", "Default Sessions evidence table with sidebar, toolbar, highlighted row, inline drawer, and pagination.");

await page.getByRole("button", { name: /Filters/ }).click();
await shot("02-sessions-filters-open", "Sessions page with filter panel open below toolbar.");
await page.getByRole("button", { name: /Filters/ }).click();

await page.locator("#query").fill("chat");
await page.keyboard.press("Enter");
await waitForSearch();
await shot("03-sessions-search-query", "Sessions table after using top search query.");

await page.getByRole("button", { name: /Tools/ }).click();
await page.waitForFunction(() => document.getElementById("statusLine")?.textContent?.includes("Usage query completed"), null, { timeout: 20_000 });
await shot("04-tools-usage", "Tools & Skills usage page with chart/table in redesigned shell.");

await page.getByRole("button", { name: /Sessions/ }).click();
await waitForSearch();
await page.goto(`${baseUrl}/session/${encodeURIComponent(sessionId)}`);
await waitForSession();
await shot("05-session-detail-top", "Session detail page top with transcript controls and Pi chat sidebar visible.");

await page.locator(".turn-card").nth(2).scrollIntoViewIfNeeded();
await shot("06-session-transcript-scrolled", "Session detail scrolled into transcript cards and turn sidebar.");

await page.getByText("Turn analytics and linked sessions").scrollIntoViewIfNeeded();
await page.getByText("Turn analytics and linked sessions").click();
await shot("07-session-analytics-open", "Session analytics disclosure open with chart, tools, skills, and linked sessions.");

await page.locator(".turn-card").first().click();
await shot("08-pi-selected-turn-context", "Pi sidebar showing selected transcript turn context.");

await page.locator(".source-picker > summary").click();
await page.locator(".source-picker-panel").waitFor({ timeout: 5_000 });
await shot("09-pi-source-picker-open", "Pi source file dropdown open for current session.");
await page.keyboard.press("Escape").catch(() => {});

await page.getByLabel("Message Pi").fill("Summarize this session in one sentence.");
await page.getByRole("button", { name: "Send" }).click();
await page.getByText("Fake Pi summary", { exact: false }).waitFor({ timeout: 20_000 });
await shot("10-pi-chat-response", "Pi chat after sending a message and receiving a response.");

const mobile = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await mobile.goto(`${baseUrl}/?limit=25`);
await mobile.waitForFunction(() => document.getElementById("statusLine")?.textContent?.includes("Search completed"), null, { timeout: 20_000 });
const mobilePath = new URL("11-mobile-sessions.png", outDir).pathname;
await mobile.screenshot({ path: mobilePath, fullPage: false });
shots.push({ name: "11-mobile-sessions", description: "Mobile/narrow viewport Sessions screen.", path: mobilePath });
await mobile.close();

await writeFile(new URL("manifest.json", outDir), `${JSON.stringify({ baseUrl, sessionId, shots }, null, 2)}\n`, "utf8");
await browser.close();
console.log(`Captured ${shots.length} screenshots to ${outDir.pathname}`);
