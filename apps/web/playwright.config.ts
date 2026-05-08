import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 8765);
const baseURL = `http://127.0.0.1:${PORT}`;

// Point the Next dev server at the committed fixture DB so e2e specs can
// assert deterministic content (row counts, fixture titles, match-pill
// shape). The integration tests already do this via process.env.
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDb = path.resolve(here, "tests", "fixtures", "sessions.sqlite");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx next dev apps/web -p ${PORT}`,
    cwd: "../..",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      SESSION_REVIEW_DB: process.env.SESSION_REVIEW_DB ?? fixtureDb,
    },
  },
});
