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

    // Trigger focus-visible via keyboard navigation.
    await page.keyboard.press("Tab");

    const focusedHref = await page.evaluate(
      () => (document.activeElement as HTMLAnchorElement | null)?.href,
    );
    expect(focusedHref).toBeTruthy();

    // Confirm the brand is focused (it should be the first tab stop in the doc).
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
