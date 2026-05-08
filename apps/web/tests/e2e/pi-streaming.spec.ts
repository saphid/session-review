import { expect, test } from "@playwright/test";

/**
 * Streaming spec for the Pi sidebar.
 *
 * Playwright's `route.fulfill` does not expose a chunked-body API, so we
 * stub `window.fetch` directly via `addInitScript`. The stub returns a
 * Response whose body is a real `ReadableStream` that emits two chunks
 * 150 ms apart. The assistant bubble must show "hello" before the second
 * chunk arrives — proving the client uses `body.getReader()`, not
 * `response.json()` or `response.text()`.
 */
test.describe("Pi sidebar — streaming", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("appends streamed tokens incrementally", async ({ page }) => {
    await page.addInitScript(() => {
      const realFetch = window.fetch.bind(window);
      window.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes("/api/pi/chat")) return realFetch(input, init);
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(encoder.encode("hello "));
            await new Promise((resolve) => setTimeout(resolve, 200));
            controller.enqueue(encoder.encode("world"));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "x-pi-chat-id": "test-chat",
          },
        });
      };
    });

    await page.goto("/");

    const sidebar = page.getByRole("complementary", { name: "Pi assistant" });
    await expect(sidebar).toBeVisible();

    const input = sidebar.getByRole("textbox", { name: /message pi/i });
    await input.fill("test prompt");
    await sidebar.getByRole("button", { name: /^send$/i }).click();

    const assistantBubble = sidebar.locator('[data-role="assistant"]').last();

    // First chunk: "hello " arrives almost immediately. The bubble should
    // contain "hello" well before the 200 ms delay finishes.
    await expect(assistantBubble).toContainText("hello", { timeout: 150 });
    // The second chunk hasn't fired yet — the bubble should not yet have
    // "world".
    await expect(assistantBubble).not.toContainText("world");

    // After the delay, both chunks land.
    await expect(assistantBubble).toContainText("hello world");
  });
});
