import { expect, test } from "@playwright/test";

/**
 * Error spec — when the route returns a structured `PI_BINARY_NOT_FOUND`
 * error the panel must show the actionable remediation message, not the
 * legacy generic "Failed to start Pi." string.
 */
test.describe("Pi sidebar — structured errors", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders the binary-not-found remediation message", async ({ page }) => {
    await page.route("**/api/pi/chat", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "PI_BINARY_NOT_FOUND",
          message: "Set SESSION_REVIEW_PI_BIN or install pi on PATH.",
        }),
      });
    });

    await page.goto("/");

    const sidebar = page.getByRole("complementary", { name: "Pi assistant" });
    const input = sidebar.getByRole("textbox", { name: /message pi/i });
    await input.fill("test prompt");
    await sidebar.getByRole("button", { name: /^send$/i }).click();

    const errorBubble = sidebar.locator('[data-role="assistant"][data-error="true"]').last();
    await expect(errorBubble).toContainText(
      "Set SESSION_REVIEW_PI_BIN or install pi on PATH.",
    );
    // Make sure the legacy generic string is NOT what the user sees.
    await expect(errorBubble).not.toContainText("Failed to start Pi.");
  });
});
