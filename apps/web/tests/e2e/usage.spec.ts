import { expect, test } from "@playwright/test";

test.describe("Tools (usage) page", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders status line, accessible chart, and focusable legend", async ({
    page,
  }) => {
    await page.goto("/tools");

    // Scope queries to the page's <main> region — the Pi sidebar (rendered by
    // the app shell) also exposes a `role="status"` live region, so a global
    // `getByRole("status")` collides under strict mode.
    const main = page.getByRole("main");

    // Wait for the chart SVG to mount (Recharts renders an <svg>).
    const chartSvg = main.locator("[data-slot='usage-chart'] svg").first();
    await expect(chartSvg).toBeVisible();

    // (a) Status line: role="status" with the canonical pattern
    //   `<n> signals · <a> active day(s) · <w>d window <ms>ms`.
    const status = main.getByRole("status");
    await expect(status).toBeVisible();
    // Numbers are formatted with locale grouping (e.g. "739,017"). Accept
    // commas in n/a/w. The trailing `<ms>ms` is the server-render time
    // and is whitespace-separated from the rest of the line.
    await expect(status).toHaveText(
      /[\d,]+ signals · [\d,]+ active days? · [\d,]+d window\s*\d+ms/,
    );

    // (b) Legend is a <ul role="list"> with at least 1 focusable item (button).
    const legend = main.getByRole("list", { name: /chart legend/i });
    await expect(legend).toBeVisible();
    expect(await legend.evaluate((el) => el.tagName.toLowerCase())).toBe("ul");
    const legendButtons = legend.getByRole("button");
    expect(await legendButtons.count()).toBeGreaterThanOrEqual(1);
    await legendButtons.first().focus();
    await expect(legendButtons.first()).toBeFocused();

    // (c) Chart <svg> has aria-label describing kind+bucket — must mention tools.
    await expect(chartSvg).toHaveAttribute("aria-label", /tool/i);
  });
});
