import { expect, test } from "@playwright/test";

// T10 — Row drawer with real Top tools / Top skills.
//
// Fixture content (apps/web/tests/fixtures/build-fixture.ts) seeds
// `usage_signals` with deterministic tool/skill names per session. The
// drawer fetches /api/session-summary?id=... and renders the top 5 of each.
//
// We assert: (a) the drawer expands inline beneath the clicked row,
// (b) TOP TOOLS lists at least one real tool name from `usage_signals`
// (so the table never falls back to the `pi-tool-1` placeholder seen on
// the legacy frontend), and (c) the SESSION ID copy button writes the
// id shown in the drawer onto the clipboard.

test.describe("Search row drawer", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });

  test("expands inline below the clicked row and lists real tool names", async ({
    page,
  }) => {
    await page.goto("/?query=test");

    const table = page.getByRole("table", { name: /sessions|results/i });
    await expect(table).toBeVisible();

    const firstRow = table.getByRole("row").nth(1);
    await firstRow.click();

    const drawer = page.getByTestId("row-drawer");
    await expect(drawer).toBeVisible();

    const topTools = drawer.getByTestId("drawer-top-tools");
    await expect(topTools).toBeVisible();

    // The fixture seeds tool names from {bash, edit, read, write, lane}.
    // No `pi-tool-1` placeholder allowed — the drawer must read real
    // names from `usage_signals`.
    const toolItems = topTools.getByTestId("drawer-top-tools-item");
    await expect(toolItems.first()).toBeVisible();
    const firstToolText = (await toolItems.first().innerText()).toLowerCase();
    expect(firstToolText).not.toContain("pi-tool-");
    expect(firstToolText).toMatch(/bash|edit|read|write|lane|grep/);
  });

  test("copy button on session id writes the id to the clipboard", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/?query=test");

    const table = page.getByRole("table", { name: /sessions|results/i });
    const firstRow = table.getByRole("row").nth(1);
    await firstRow.click();

    const drawer = page.getByTestId("row-drawer");
    await expect(drawer).toBeVisible();

    const sessionIdValue = drawer.getByTestId("drawer-session-id-value");
    await expect(sessionIdValue).toBeVisible();
    const expected = (await sessionIdValue.innerText()).trim();

    const copyButton = drawer.getByTestId("drawer-copy-session-id");
    await copyButton.click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(expected);
  });
});
