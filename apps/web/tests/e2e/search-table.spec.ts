import { expect, test } from "@playwright/test";

// The dev server is launched against the fixture DB (see
// apps/web/playwright.config.ts) so these specs can assert deterministic
// row counts and column values.
//
// Fixture content (apps/web/tests/fixtures/build-fixture.ts):
//   - claude:fixture-001 — title "Plan the rebuild", body mentions "rebuild plan"
//   - codex:fixture-002 — title "Codex sweep", refactor the search module
//   - pi:fixture-003 — body mentions "triage failing tests" and "next failing test"
//   - cursor:fixture-004 — Cursor scratchpad
//   - claude:fixture-005-batch
//   - claude:fixture-006-primary + claude:fixture-007-subagent
//
// We query "test" because the fixture has multiple matches and "test" is a
// natural phrase we expect a search user to type.

test.describe("Search results table", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders match pill formatted to 2 d.p. for a query", async ({
    page,
  }) => {
    await page.goto("/?query=test");

    const table = page.getByRole("table", { name: /sessions|results/i });
    await expect(table).toBeVisible();

    const firstRow = table.getByRole("row").nth(1); // row 0 is the header
    await expect(firstRow).toBeVisible();

    const matchCell = firstRow.getByTestId("match-cell");
    const pill = matchCell.getByTestId("match-pill");
    await expect(pill).toBeVisible();
    // 2 d.p., values in [0, 1] — usually 0.NN but a perfect match is 1.00.
    await expect(pill).toHaveText(/^[01]\.\d{2}$/);
  });

  test("renders em-dash with explanatory tooltip when no query is supplied", async ({
    page,
  }) => {
    await page.goto("/");

    const table = page.getByRole("table", { name: /sessions|results/i });
    await expect(table).toBeVisible();

    const firstRow = table.getByRole("row").nth(1);
    const matchCell = firstRow.getByTestId("match-cell");
    const empty = matchCell.getByTestId("match-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toHaveText("—");
    await expect(empty).toHaveAttribute(
      "title",
      "No query — no relevance score.",
    );
  });

  test("clicking the Match header writes ?sort=match&dir=… and toggles dir on second click", async ({
    page,
  }) => {
    await page.goto("/?query=test");

    const matchHeader = page.getByRole("button", { name: /^Match/ });
    await expect(matchHeader).toBeVisible();

    await matchHeader.click();
    await page.waitForURL(/sort=match/);
    const firstUrl = new URL(page.url());
    expect(firstUrl.searchParams.get("sort")).toBe("match");
    const firstDir = firstUrl.searchParams.get("dir");
    expect(firstDir === "asc" || firstDir === "desc").toBe(true);

    await matchHeader.click();
    await page.waitForFunction(
      ([prev]) =>
        new URL(window.location.href).searchParams.get("dir") !== prev,
      [firstDir],
    );
    const secondUrl = new URL(page.url());
    const secondDir = secondUrl.searchParams.get("dir");
    expect(secondDir === "asc" || secondDir === "desc").toBe(true);
    expect(secondDir).not.toBe(firstDir);
  });

  test("keyboard parity — Tab to Match header, press Enter, URL toggles", async ({
    page,
  }) => {
    await page.goto("/?query=test");

    const matchHeader = page.getByRole("button", { name: /^Match/ });
    await matchHeader.focus();
    await expect(matchHeader).toBeFocused();

    await page.keyboard.press("Enter");
    await page.waitForURL(/sort=match/);
    const firstDir = new URL(page.url()).searchParams.get("dir");
    expect(firstDir === "asc" || firstDir === "desc").toBe(true);

    // Re-focus after the URL change re-renders the header.
    await matchHeader.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      ([prev]) =>
        new URL(window.location.href).searchParams.get("dir") !== prev,
      [firstDir],
    );
    const secondDir = new URL(page.url()).searchParams.get("dir");
    expect(secondDir).not.toBe(firstDir);
  });

  test("aria-sort is exclusive — only Match has it after clicking Match", async ({
    page,
  }) => {
    await page.goto("/?query=test");

    const matchHeader = page.getByRole("button", { name: /^Match/ });
    const runTimeHeader = page.getByRole("button", { name: /^Run time/i });
    const activityHeader = page.getByRole("button", { name: /^Activity/i });

    await matchHeader.click();
    await page.waitForURL(/sort=match/);

    const matchTh = page.getByTestId("th-match");
    const runTimeTh = page.getByTestId("th-runtime");
    const activityTh = page.getByTestId("th-activity");

    await expect(matchTh).toHaveAttribute("aria-sort", /^(ascending|descending)$/);
    // Other headers should be aria-sort="none" (or have the attribute absent).
    const runSort = await runTimeTh.getAttribute("aria-sort");
    expect(runSort === "none" || runSort === null).toBe(true);
    const actSort = await activityTh.getAttribute("aria-sort");
    expect(actSort === "none" || actSort === null).toBe(true);

    // Sanity: the buttons themselves stayed there for keyboard users.
    await expect(runTimeHeader).toBeVisible();
    await expect(activityHeader).toBeVisible();
  });
});
