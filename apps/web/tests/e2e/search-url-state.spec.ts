import { expect, test } from "@playwright/test";

test.describe("Search page — URL state two-way binding", () => {
  test("query and provider in URL populate the controls on load", async ({
    page,
  }) => {
    await page.goto("/?query=react&provider=pi");

    const search = page.getByRole("searchbox", { name: "Search sessions" });
    await expect(search).toHaveValue("react");

    const agent = page.getByLabel("Agent");
    await expect(agent).toHaveValue("pi");
  });

  test("changing the Agent select writes provider back to the URL", async ({
    page,
  }) => {
    await page.goto("/?query=react&provider=pi");

    const agent = page.getByLabel("Agent");
    await agent.selectOption("claude");

    await expect.poll(() => new URL(page.url()).searchParams.get("provider")).toBe(
      "claude",
    );
    await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe(
      "react",
    );
  });

  test("'/' shortcut focuses the search input from a non-input element", async ({
    page,
  }) => {
    await page.goto("/");

    // Move focus to a known non-input element (the page body).
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      document.body.focus();
    });

    await page.keyboard.press("/");

    const search = page.getByRole("searchbox", { name: "Search sessions" });
    await expect(search).toBeFocused();
    // The "/" should not have been typed into the input.
    await expect(search).toHaveValue("");
  });
});
