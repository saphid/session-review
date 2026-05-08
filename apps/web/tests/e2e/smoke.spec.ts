import { expect, test } from "@playwright/test";

test("home page returns 200 and renders the wordmark", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Session Review" })).toBeVisible();
});
