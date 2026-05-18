import { expect, test } from "@playwright/test";

test.describe("App shell — desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders sidebar with brand link and the two nav items", async ({
    page,
  }) => {
    await page.goto("/");

    const sidebar = page.getByRole("complementary", {
      name: "Primary navigation",
    });
    await expect(sidebar).toBeVisible();

    const brand = sidebar.getByRole("link", { name: "Session Review home" });
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute("href", "/");

    await expect(sidebar.getByRole("link", { name: "Sessions" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Tools" })).toBeVisible();
  });

  test("aria-current is on active link, removed (not 'false') from inactive", async ({
    page,
  }) => {
    await page.goto("/");

    const sidebar = page.getByRole("complementary", {
      name: "Primary navigation",
    });
    const sessions = sidebar.getByRole("link", { name: "Sessions" });
    const tools = sidebar.getByRole("link", { name: "Tools" });

    await expect(sessions).toHaveAttribute("aria-current", "page");
    await expect(tools).not.toHaveAttribute("aria-current", /.*/);

    await tools.click();
    await page.waitForURL("**/tools");

    await expect(tools).toHaveAttribute("aria-current", "page");
    await expect(sessions).not.toHaveAttribute("aria-current", /.*/);
  });

  test("brand link shows a visible focus ring on :focus-visible", async ({
    page,
  }) => {
    await page.goto("/");

    const sidebar = page.getByRole("complementary", {
      name: "Primary navigation",
    });
    const brand = sidebar.getByRole("link", { name: "Session Review home" });

    // Reset focus to the document body. Without this, focus may have
    // landed on the Next.js dev-tools floating button (a portal-rendered
    // <button> outside the app shell) earlier in the suite, which would
    // make the first Tab press skip our brand link.
    await page.locator("body").click({ position: { x: 1, y: 1 } });

    // Tab through the document until focus lands on the brand link. The
    // skip-to-content anchor is the first focus stop on every page, and
    // the Next.js dev overlay injects a "Open Next.js Dev Tools" button
    // that is in the tab order under `next dev`; up to a few presses are
    // needed to skip past either on dev. In production builds the brand
    // link is the second tab stop (after skip-to-content).
    let tabs = 0;
    while (tabs < 12) {
      await page.keyboard.press("Tab");
      const onBrand = await brand.evaluate(
        (el) => document.activeElement === el,
      );
      if (onBrand) break;
      tabs++;
    }

    await expect(brand).toBeFocused();

    const ringDescriptor = await brand.evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.boxShadow} | ${cs.outline} | ${cs.outlineWidth}`;
    });
    // Either box-shadow ring or outline ring must contain a non-zero width.
    expect(ringDescriptor).toMatch(/\d+px/);
    // And the ring should not be the trivial "0px" everywhere.
    expect(ringDescriptor).not.toBe("none | none | 0px");
  });
});

test.describe("App shell — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hamburger toggles aria-expanded on the trigger", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: /toggle navigation/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
