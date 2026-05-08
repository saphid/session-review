import { expect, test } from "@playwright/test";

test("home page returns 200 and renders the wordmark", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  expect(response?.status()).toBe(200);
  // Wordmark lives on the sidebar brand link; the page heading itself is
  // "Sessions" per the redesign in docs/review/03-search-page.md.
  await expect(
    page.getByRole("link", { name: "Session Review home" }),
  ).toBeVisible();
});
