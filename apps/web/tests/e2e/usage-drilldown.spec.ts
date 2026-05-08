import { expect, test } from "@playwright/test";

/**
 * Usage page drill-down spec for T15.
 *
 * Goal: clicking a legend item on /tools navigates to the search page (`/`)
 * with `?query=<tool-name>` so the user pivots from the chart to the
 * matching sessions in one click. Bar segments add `startDate` / `endDate`
 * for the bucket they belong to; table rows behave like legend items.
 *
 * The fixture is small (build-fixture.ts produces ~6 sessions and 6 tool
 * names), so we keep assertions URL-shaped where possible: the drill is
 * verified by the URL, the page header, and the existence of the search
 * surface — not by row count, which would be fixture-fragile.
 */
test.describe("Usage drill-down — chart → search", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("clicking a legend item navigates to /?query=<name>", async ({ page }) => {
    await page.goto("/tools");

    const legend = page
      .getByRole("main")
      .getByRole("list", { name: /chart legend/i });
    await expect(legend).toBeVisible();

    const firstItem = legend.getByRole("button").first();
    await expect(firstItem).toBeVisible();

    // Capture the legend item's name BEFORE the click — once we navigate
    // away it's gone. The series name (raw, e.g. "bash") is exposed via
    // a stable `data-series-name` hook so the test reads exactly what
    // the click handler will encode into the URL.
    const seriesName = await firstItem.getAttribute("data-series-name");
    expect(seriesName, "legend item must expose data-series-name").toBeTruthy();

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/" && url.search.includes("query=")),
      firstItem.click(),
    ]);

    const params = new URL(page.url()).searchParams;
    expect(params.get("query")).toBe(seriesName);

    // The search page renders the "Sessions" topbar — confirms we landed
    // on `/` and not a filtered subroute.
    await expect(
      page.getByRole("heading", { name: "Sessions", level: 1 }),
    ).toBeVisible();

    // Either the results table or the empty state is visible — fixture
    // is small so we don't promise rows.
    const main = page.getByRole("main");
    const hasTable = await main.locator("table").first().isVisible();
    const hasEmpty = await main.getByText(/no sessions/i).isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test("clicking a usage table row navigates to /?query=<name>", async ({ page }) => {
    await page.goto("/tools");

    const tableRow = page
      .getByRole("main")
      .locator("[data-slot='usage-table'] tbody [data-row-name]")
      .first();
    await expect(tableRow).toBeVisible();
    const rowName = await tableRow.getAttribute("data-row-name");
    expect(rowName, "table row must expose data-row-name").toBeTruthy();

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/" && url.search.includes("query=")),
      tableRow.click(),
    ]);

    expect(new URL(page.url()).searchParams.get("query")).toBe(rowName);
  });

  test("clicking a stacked bar segment includes startDate and endDate", async ({
    page,
  }) => {
    await page.goto("/tools");

    // Wait for chart to mount.
    const chartSvg = page
      .getByRole("main")
      .locator("[data-slot='usage-chart'] svg")
      .first();
    await expect(chartSvg).toBeVisible();

    // Recharts renders each stacked segment as a <path> with class
    // `recharts-rectangle` inside a `<g class="recharts-bar-rectangle">`
    // wrapper. Click the first segment that's actually visible.
    const segment = chartSvg.locator(".recharts-bar-rectangle").first();
    await expect(segment).toBeVisible();
    await segment.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/" &&
        url.searchParams.has("query") &&
        url.searchParams.has("startDate"),
      { timeout: 5_000 },
    );

    const params = new URL(page.url()).searchParams;
    expect(params.get("query")).toBeTruthy();
    expect(params.get("startDate")).toBeTruthy();
    expect(params.get("endDate")).toBeTruthy();
  });
});
