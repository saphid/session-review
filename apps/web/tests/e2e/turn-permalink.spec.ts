import { expect, test } from "@playwright/test";

const PERF_FIXTURE = "/session/claude:fixture-perf-200";

test.describe("Session detail — ?turn= permalink + j/k nav", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("?turn=N selects and rings the matching card on load", async ({
    page,
  }) => {
    await page.goto(`${PERF_FIXTURE}?turn=10`);

    const card = page.locator("[data-turn-card='10']");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-current", "true");

    // The matching TOC entry is also marked active.
    const tocEntry = page.locator("button[data-toc-index='10']");
    await expect(tocEntry).toHaveAttribute("aria-current", "true");
  });

  test("invalid ?turn= values are dropped from the URL once items load", async ({
    page,
  }) => {
    await page.goto(`${PERF_FIXTURE}?turn=99999`);

    // Wait for the transcript to load.
    await page.locator("[data-turn-card='1']").waitFor({ state: "attached" });
    await page.waitForTimeout(300);

    // The bogus value should be cleared from both URL and state.
    const turnAfter = await page.evaluate(() =>
      new URL(window.location.href).searchParams.get("turn"),
    );
    expect(turnAfter).toBeNull();
    expect(await page.locator("[data-current='true']").count()).toBe(0);
  });

  test("j and k step through visible turns and write the URL", async ({
    page,
  }) => {
    await page.goto(`${PERF_FIXTURE}?turn=5`);
    await page.locator("[data-turn-card='5']").waitFor({ state: "attached" });

    // Move forward 3 with j.
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await page.keyboard.press("j");

    await expect
      .poll(async () =>
        page.evaluate(() =>
          new URL(window.location.href).searchParams.get("turn"),
        ),
      )
      .toBe("8");
    await expect(page.locator("[data-turn-card='8']")).toHaveAttribute(
      "data-current",
      "true",
    );

    // Step back twice with k.
    await page.keyboard.press("k");
    await page.keyboard.press("k");

    await expect
      .poll(async () =>
        page.evaluate(() =>
          new URL(window.location.href).searchParams.get("turn"),
        ),
      )
      .toBe("6");
  });

  test("j/k bails out when the user is typing in the search input", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator("[data-session-id]")
      .first()
      .waitFor({ state: "attached" });

    // Focus the search input and type — j/k should land in the field, not
    // navigate transcripts (we're not on a transcript page anyway, but the
    // handler should still bail).
    const search = page.getByRole("searchbox", { name: /search sessions/i });
    await search.click();
    await page.keyboard.type("jk");
    await expect(search).toHaveValue("jk");
  });
});

test.describe("Search filters — clear all", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Clear all empties the URL and the filter inputs", async ({ page }) => {
    await page.goto("/?query=test&cwd=/Users&startDate=2026-01-01");
    await page
      .locator("[data-session-id], [data-testid='result-card']")
      .first()
      .waitFor({ state: "attached" });

    await page.locator("details summary", { hasText: /advanced filters/i }).click();
    const clear = page.locator("[data-testid='clear-filters']");
    await expect(clear).toBeVisible();
    await clear.click();

    await expect.poll(() => page.url()).toMatch(/\/$|\/\?$/);
    // The clear-all link itself disappears now that no filters are active.
    await expect(clear).toHaveCount(0);
  });
});
