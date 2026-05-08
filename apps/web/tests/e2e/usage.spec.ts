import { expect, test } from "@playwright/test";

test.describe("Tools (usage) page", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders status line, accessible chart, and focusable legend", async ({
    page,
  }) => {
    await page.goto("/tools");

    // Wait for the chart SVG to mount (Recharts renders an <svg>).
    const chartSvg = page.locator("[data-slot='usage-chart'] svg").first();
    await expect(chartSvg).toBeVisible();

    // (a) Status line: role="status" with the canonical "<n> signals · <m> data points · <ms>ms" pattern.
    const status = page.getByRole("status");
    await expect(status).toBeVisible();
    // Numbers are formatted with locale grouping (e.g. "739,017"). The brief
    // says `<n> signals · <m> data points · <ms>ms` — accept commas in n/m.
    await expect(status).toHaveText(/[\d,]+ signals · [\d,]+ data points · \d+ms/);

    // (b) Legend is a <ul role="list"> with at least 1 focusable item (button).
    const legend = page.getByRole("list", { name: /chart legend/i });
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
