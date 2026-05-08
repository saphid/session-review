import { expect, test } from "@playwright/test";

/**
 * T12 — bootstrap context turns (the `custom:pi-opentelemetry.resource_snapshot`
 * harness wiring at the head of every Pi session) render collapsed by
 * default. The user can click "Show bootstrap context" to expand. The
 * TOC entry is still present but visually muted.
 */
const FIXTURE_ID = "pi:fixture-bootstrap-008";

test.describe("Transcript noise — bootstrap turns collapse by default", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("first bootstrap turn is collapsed and reveals on click", async ({
    page,
  }) => {
    await page.goto(`/session/${encodeURIComponent(FIXTURE_ID)}`);

    // Wait for the transcript stream to deliver the first card.
    const firstCard = page.locator('[data-turn-card="1"]');
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // Affordance for bootstrap turns reads "Show bootstrap context"
    // (not the generic "Show more" used for organic turns).
    const reveal = firstCard.getByRole("button", {
      name: /show bootstrap context/i,
    });
    await expect(reveal).toBeVisible();
    await expect(reveal).toHaveAttribute("aria-expanded", "false");

    // Content is hidden while collapsed — the resource-snapshot marker
    // should not appear in the rendered (visible) text.
    await expect(firstCard).not.toContainText(
      "pi-opentelemetry.resource_snapshot",
    );

    // Click reveals the bootstrap content.
    await reveal.click();
    await expect(reveal).toHaveAttribute("aria-expanded", "true");
    await expect(firstCard).toContainText(
      "pi-opentelemetry.resource_snapshot",
    );
  });

  test("TOC entry for the bootstrap turn is muted but still clickable", async ({
    page,
  }) => {
    await page.goto(`/session/${encodeURIComponent(FIXTURE_ID)}`);

    const firstCard = page.locator('[data-turn-card="1"]');
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    const tocEntry = page
      .getByRole("navigation", { name: "Transcript turns" })
      .locator('[data-toc-index="1"]');
    await expect(tocEntry).toBeVisible();
    await expect(tocEntry).toHaveAttribute("data-bootstrap", "true");

    // Still clickable — scrolls to the card.
    await tocEntry.click();
    await expect(firstCard).toBeInViewport();
  });
});
