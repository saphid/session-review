import { expect, test } from "@playwright/test";

/**
 * Mobile spec for T16.
 *
 * Asserts the three mobile failure modes from `docs/review/10-mobile.md`:
 *   1. Search results table forces horizontal scroll (`min-width: 900-1060px`).
 *      Fix: render a stacked `ResultCard` list under the 720 px breakpoint
 *      and hide the desktop `<table>`.
 *   2. The body itself can scroll horizontally because the table overflows
 *      its container under mobile widths. Fix: `body { overflow-x: hidden }`
 *      under the `md` (720 px) breakpoint.
 *   3. The sidebar's Sessions count badge collapses to `—` when the badge
 *      element is too narrow to fit `100+`. Fix: `min-width: max-content`
 *      on the badge so the count text always renders intact.
 *
 * Also asserts the session detail StatStrip drops to a 2x2 grid below the
 * 480 px breakpoint instead of staying 4-up.
 */
const FIXTURE_ID = "claude:fixture-perf-200";

test.describe("Mobile — search page card layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("body has overflow-x: hidden under the md breakpoint", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("body")).toHaveCSS("overflow-x", "hidden");
  });

  test("renders ResultCard stack and hides the desktop table", async ({
    page,
  }) => {
    await page.goto("/");

    // At least one result card should be visible.
    const card = page.locator('[data-testid="result-card"]').first();
    await expect(card).toBeVisible();

    // The desktop `<table>` exists in the DOM (we keep it for ≥720 px) but
    // must be hidden at this viewport so the page is card-only.
    const table = page.getByRole("table", { name: /sessions|results/i });
    const tableCount = await table.count();
    if (tableCount > 0) {
      // Hidden via responsive class — `display: none` at this width.
      await expect(table).toHaveCSS("display", "none");
    }
  });

  test("page does not horizontally scroll", async ({ page }) => {
    await page.goto("/");

    // scrollWidth must not exceed clientWidth — no horizontal scrollbar.
    const overflow = await page.evaluate(() => {
      const html = document.documentElement;
      return {
        scrollWidth: html.scrollWidth,
        clientWidth: html.clientWidth,
      };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});

test.describe("Mobile — sidebar count badge", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Sessions count badge is not an em-dash when the drawer is open", async ({
    page,
  }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: /toggle navigation/i });
    await toggle.click();

    const drawer = page.locator("#mobile-nav-drawer");
    await expect(drawer).toBeVisible();

    const badge = drawer.locator('[data-slot="sessions-count"]');
    await expect(badge).toBeVisible();
    const text = (await badge.textContent())?.trim() ?? "";
    expect(text).not.toBe("—");
    // Either a digit count ("8", "12") or the "100+" overflow marker.
    expect(text).toMatch(/^(\d+\+?|100\+)$/);
  });
});

test.describe("Mobile — session detail stat strip", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("StatStrip is a 2x2 grid below 480 px", async ({ page }) => {
    await page.goto(`/session/${encodeURIComponent(FIXTURE_ID)}`);

    const strip = page.getByRole("list", { name: "Session statistics" });
    await expect(strip).toBeVisible();

    // grid-template-columns under 480 px should yield two tracks.
    const cols = await strip.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
    expect(cols).toBe(2);
  });
});

test.describe("Mobile — sidebar count badge keeps 100+ intact", () => {
  // Smaller viewport to be sure the badge never collapses, even when
  // every parent container is at its tightest.
  test.use({ viewport: { width: 360, height: 740 } });

  test("badge has min-width: max-content (never collapses to em-dash)", async ({
    page,
  }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: /toggle navigation/i });
    await toggle.click();

    const badge = page
      .locator("#mobile-nav-drawer")
      .locator('[data-slot="sessions-count"]');
    await expect(badge).toBeVisible();

    const minWidth = await badge.evaluate(
      (el) => getComputedStyle(el).minWidth,
    );
    // Tailwind `min-w-max` resolves to `max-content`.
    expect(minWidth).toBe("max-content");
  });
});

test.describe("Mobile — desktop spec still passes", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("desktop renders the table and no result cards", async ({ page }) => {
    await page.goto("/");

    const table = page.getByRole("table", { name: /sessions|results/i });
    await expect(table).toBeVisible();

    const card = page.locator('[data-testid="result-card"]').first();
    const cardCount = await page
      .locator('[data-testid="result-card"]')
      .count();
    if (cardCount > 0) {
      await expect(card).toBeHidden();
    }
  });
});
