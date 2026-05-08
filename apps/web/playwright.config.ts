import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 8765);
const baseURL = `http://127.0.0.1:${PORT}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDb = path.resolve(__dirname, "tests/fixtures/sessions.sqlite");

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
      // Pin the fixture DB so e2e specs don't depend on the developer's
      // home-dir sqlite. The fixture is rebuilt deterministically by
      // `npm run fixture:build` (auto-run via `test:integration`).
      SESSION_REVIEW_DB: fixtureDb,
    },
  },
});
