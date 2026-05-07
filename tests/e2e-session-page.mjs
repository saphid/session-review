import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const baseUrl = process.env.BASE_URL ?? "http://localhost:8999";
const outDir = new URL("../output/screenshots/", import.meta.url);
await mkdir(outDir, { recursive: true });

const sessionId = execFileSync("sqlite3", [
  `${process.env.HOME}/.local/share/session-review/sessions.sqlite`,
  "select id from sessions where path like '%90021c07-9cef-44f8-b0dd-75c372946c03%' limit 1",
], { encoding: "utf8" }).trim();

if (!sessionId) throw new Error("Could not find the chat.json SPA session");

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

await page.goto(`${baseUrl}/?query=chat.json&limit=20`);
await page.waitForFunction(
  () => document.querySelector("#statusLine")?.textContent?.includes("Search completed"),
  null,
  { timeout: 15_000 },
);
await page.locator(".evidence-table").waitFor({ timeout: 15_000 });
await page.screenshot({ path: new URL("search-e2e.png", outDir).pathname, fullPage: true });

await page.goto(`${baseUrl}/session/${encodeURIComponent(sessionId)}`);
await page.getByRole("heading", { name: "Transcript" }).waitFor({ timeout: 15_000 });
await page.screenshot({ path: new URL("session-top-e2e.png", outDir).pathname, fullPage: false });
await page.getByRole("heading", { name: "Transcript" }).scrollIntoViewIfNeeded();
await page.screenshot({ path: new URL("session-transcript-e2e.png", outDir).pathname, fullPage: false });

await page.getByText("Turn analytics and linked sessions").click();
const firstBar = page.locator("#sessionTurnChart");
await firstBar.click({ position: { x: 120, y: 220 } });
await page.locator(".turn-card.highlight").waitFor({ timeout: 5_000 });
await page.waitForTimeout(250);
await page.screenshot({ path: new URL("session-highlight-e2e.png", outDir).pathname, fullPage: false });

await browser.close();
console.log(`E2E screenshots written for ${sessionId}`);
