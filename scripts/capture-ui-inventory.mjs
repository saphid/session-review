import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const baseUrl = process.env.BASE_URL ?? "http://localhost:8898";
const outDir = process.env.INVENTORY_OUT_DIR
  ? new URL(`${process.env.INVENTORY_OUT_DIR.replace(/\/$/u, "")}/`, `file://${process.cwd()}/`)
  : new URL("../output/ui-inventory/", import.meta.url);
await mkdir(outDir, { recursive: true });

function dbSessionId() {
  const dbPath = `${process.env.HOME}/.local/share/session-review/sessions.sqlite`;
  try {
    const stableSession = execFileSync("sqlite3", [
      dbPath,
      "select id from sessions where path like '%90021c07-9cef-44f8-b0dd-75c372946c03%' limit 1",
    ], { encoding: "utf8" }).trim();
    if (stableSession) return stableSession;
    return execFileSync("sqlite3", [dbPath, "select id from sessions order by started_at desc limit 1"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const sessionId = process.env.SESSION_ID || dbSessionId();
if (!sessionId) throw new Error("Could not find an indexed session id for screenshots");

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage({ viewport: { width: 1590, height: 992 }, deviceScaleFactor: 1 });
const screens = [];

async function waitForSearch(p = page) {
  await p.waitForFunction(() => document.getElementById("statusLine")?.textContent?.includes("Search completed"), null, { timeout: 20_000 });
}

async function waitForUsage() {
  await page.waitForFunction(() => document.getElementById("statusLine")?.textContent?.includes("Usage query completed"), null, { timeout: 20_000 });
}

async function waitForSession() {
  await page.locator("#sessionDetails .sd-panel").waitFor({ timeout: 20_000 });
  await page.locator("#transcript .turn-card").first().waitFor({ timeout: 20_000 });
}

async function capture(name, description, p = page) {
  const screenshotPath = new URL(`${name}.png`, outDir).pathname;
  const domPath = new URL(`${name}.dom.html`, outDir).pathname;
  await p.screenshot({ path: screenshotPath, fullPage: false });
  const dom = await p.evaluate(() => document.body.outerHTML);
  await writeFile(domPath, dom, "utf8");
  screens.push({ name, description, screenshotPath, domPath });
}

await page.goto(`${baseUrl}/?limit=25`);
await waitForSearch();
await capture("01-sessions-default", "Default Sessions evidence table with selected row, inline drawer, footer pagination.");

await page.getByRole("button", { name: /Filters/ }).click();
await capture("02-sessions-filters-open", "Sessions screen with filter controls open.");
await page.getByRole("button", { name: /Filters/ }).click();

await page.locator("#query").fill("chat");
await page.keyboard.press("Enter");
await waitForSearch();
await capture("03-sessions-search-query", "Sessions screen after searching for chat.");

await page.getByRole("button", { name: /Tools/ }).click();
await waitForUsage();
await capture("04-tools-usage", "Tools usage chart and usage table screen.");

await page.getByRole("button", { name: /Sessions/ }).click();
await waitForSearch();
await page.goto(`${baseUrl}/session/${encodeURIComponent(sessionId)}`);
await waitForSession();
await capture("05-session-detail-top", "Session detail top, metadata panel, transcript controls, Pi sidebar.");

await page.locator("#transcript .turn-card").nth(2).scrollIntoViewIfNeeded();
await capture("06-session-transcript-scrolled", "Transcript scrolled view with turn sidebar and turn cards.");

await page.getByText("Turn analytics and linked sessions").scrollIntoViewIfNeeded();
await page.getByText("Turn analytics and linked sessions").click();
await capture("07-session-analytics-open", "Session analytics disclosure open with chart, usage tables, linked sessions.");

await page.locator("#transcript .turn-card").first().click();
await capture("08-pi-selected-turn-context", "Pi sidebar after selecting a transcript turn.");

await page.locator(".source-picker > summary").click();
await page.locator(".source-picker-panel").waitFor({ timeout: 5_000 });
await capture("09-pi-source-picker-open", "Pi source picker dropdown open.");
await page.locator(".source-picker > summary").click().catch(() => {});

await page.getByLabel("Message Pi").fill("Summarize this session in one sentence.");
await page.getByRole("button", { name: "Send" }).click();
await page.getByText("Fake Pi summary", { exact: false }).waitFor({ timeout: 20_000 });
await capture("10-pi-chat-response", "Pi chat after sending a message and receiving a response.");

const mobile = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await mobile.goto(`${baseUrl}/?limit=25`);
await waitForSearch(mobile);
await capture("11-mobile-sessions", "Mobile/narrow viewport Sessions screen.", mobile);
await mobile.getByRole("button", { name: "Toggle navigation" }).click();
await capture("12-mobile-nav-open", "Mobile/narrow viewport with navigation drawer open.", mobile);
await mobile.close();

await writeFile(new URL("manifest.json", outDir), `${JSON.stringify({ baseUrl, sessionId, screens }, null, 2)}\n`, "utf8");
await browser.close();
console.log(`Captured ${screens.length} screens with DOM and AX snapshots to ${outDir.pathname}`);
