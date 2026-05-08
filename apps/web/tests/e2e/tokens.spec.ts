import { expect, test } from "@playwright/test";

test("design tokens are applied via @theme", async ({ page }) => {
  await page.goto("/");

  // Body background should resolve to --color-canvas (#0b0d11 → rgb(11, 13, 17))
  const bodyBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bodyBg).toBe("rgb(11, 13, 17)");

  // The accent token should be exposed as a CSS custom property and look like a color.
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim(),
  );
  expect(accent.length).toBeGreaterThan(0);
  expect(accent).toMatch(/^(#|rgb)/);
});
