import { expect, test } from "@playwright/test";

/**
 * Session detail page spec for T11.
 *
 * The fixture session id matches `claude:fixture-perf-200` from
 * `apps/web/tests/fixtures/build-fixture.ts` — a 200-turn synthetic
 * transcript that exercises the role-prefix split and tool/skill
 * counters end-to-end.
 */
const FIXTURE_ID = "claude:fixture-perf-200";
const FIXTURE_TITLE = "T06 perf fixture";

test.describe("Session detail — header + stat strip + transcript", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders the title and a non-zero 4-stat strip from real fixture data", async ({
    page,
  }) => {
    await page.goto(`/session/${encodeURIComponent(FIXTURE_ID)}`);

    // Header title is rendered server-side from sessionHeader().
    await expect(
      page.getByRole("heading", { name: FIXTURE_TITLE, level: 1 }),
    ).toBeVisible();

    // 4-stat strip — TURNS · TOOLS · SKILLS · LINKED.
    const strip = page.getByRole("list", { name: "Session statistics" });
    await expect(strip).toBeVisible();

    const turns = strip.locator('[data-stat="turns"] [data-slot="value"]');
    const tools = strip.locator('[data-stat="tools"] [data-slot="value"]');
    const skills = strip.locator('[data-stat="skills"] [data-slot="value"]');
    const linked = strip.locator('[data-stat="linked"] [data-slot="value"]');

    await expect(turns).toHaveText("200");
    await expect(tools).toHaveText(/^\d+$/);
    await expect(skills).toHaveText(/^\d+$/);
    await expect(linked).toHaveText(/^\d+$/);

    // Tabular numerics on the stat numbers.
    const fontVariant = await turns.evaluate(
      (el) => getComputedStyle(el).fontVariantNumeric,
    );
    expect(fontVariant).toContain("tabular-nums");
  });

  test("toolbar exposes exactly three controls plus a Display options details", async ({
    page,
  }) => {
    await page.goto(`/session/${encodeURIComponent(FIXTURE_ID)}`);

    const toolbar = page.getByRole("toolbar", { name: "Transcript controls" });
    await expect(toolbar).toBeVisible();

    // The three primary controls.
    await expect(
      toolbar.getByRole("button", { name: /^type filter/i }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: /^expand all$/i }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: /^collapse all$/i }),
    ).toBeVisible();

    // The toolbar must contain exactly three top-level buttons (the
    // "Display options" disclosure is a <details>/<summary>, not a button).
    const buttons = toolbar.locator(":scope > button");
    await expect(buttons).toHaveCount(3);

    // Display options collapses a Lines/turn + Apply control.
    const display = toolbar.locator("details");
    await expect(display).toBeVisible();
    await expect(display.locator("summary")).toHaveText(/display options/i);
    await display.locator("summary").click();
    await expect(
      display.getByRole("spinbutton", { name: /lines\/turn/i }),
    ).toBeVisible();
    await expect(
      display.getByRole("button", { name: /^apply$/i }),
    ).toBeVisible();
  });

  test("clicking a TOC entry scrolls the matching turn card into view", async ({
    page,
  }) => {
    await page.goto(`/session/${encodeURIComponent(FIXTURE_ID)}`);

    // Wait for the transcript to finish streaming.
    const firstCard = page.locator('[data-turn-card="1"]');
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // TOC and a target deeper into the list (so scrolling actually has
    // somewhere to go).
    const targetIndex = 5;
    const toc = page.getByRole("navigation", { name: "Transcript turns" });
    await expect(toc).toBeVisible();

    const tocLink = toc.locator(`[data-toc-index="${targetIndex}"]`);
    await expect(tocLink).toBeVisible();
    await tocLink.click();

    const targetCard = page.locator(`[data-turn-card="${targetIndex}"]`);
    await expect(targetCard).toBeInViewport();
  });
});
