# Pi sidebar

## Screenshots

- `output/screenshots/review-v2/01-search-default-desktop.png` (right column) — empty state.
- `output/screenshots/review-v2/08-pi-sidebar-empty.png` — same.
- `output/screenshots/review-v2/12-search-wide-desktop.png` (right column) — sidebar at wider viewport, empty state.

## Description

A right-anchored vertical column, 280–640 px wide, hidden under `md` breakpoint (720 px). Resizable via a 1 px hairline drag handle on its left edge.

Top to bottom:

1. **Header**: "Pi Chat" title in 14 px semibold, "Persistent session with visible source context" 11 px muted subtitle. A "New chat" button is right-aligned, square corners, hairline border.
2. **Source row**: a `Session` accent chip (Recorder Blue background, accent text) followed by a `0/0 source files ?` chip with a help affordance. When files are attached, the count flips to `4/4 source files` and the chip exposes an `AttachmentList` popover listing each path. The chat ID, once a turn has run, appears right-aligned in tiny mono (`chat 1a2b3c4d`).
3. **Message list** (flex-1, scrollable). Empty state: centered muted text "Ready. Ask Pi about the visible page — follow-ups reuse the same persistent session." During streaming, an assistant bubble fills with tokens as they arrive. Errors render as a distinct error bubble with structured payload from `PI_ERROR_SENTINEL`.
4. **Composer** at the bottom: `<textarea>` with placeholder "Ask Pi about the visible page…", a `⌘ + Enter to send` hint on the left, a `Send` button on the right (or `Stop` while streaming).

## What it gets right

1. **Streaming with abortable cleanup.** `apps/web/lib/pi.ts:99` returns a `ReadableStream<Uint8Array>` whose `cancel()` SIGTERMs the underlying `pi` child. The client's `useEffect` teardown aborts the in-flight `fetch`, which propagates to `cancel()`. No leaked subprocesses.
2. **Two-tier error shape.**
   - **Pre-stream**: route returns 500 with `{ error, message, code, stderr }` JSON. Client decodes via `await response.json()` and renders an error bubble.
   - **Mid-stream**: server emits ` PI_ERROR {json} PI_ERROR ` sentinel into the same stream. Client buffers, looks for the sentinel, peels off the JSON, replaces the assistant message with the error. Visible content before the sentinel is preserved (so a partial answer + a recoverable failure both surface).
   This is the right design for a sub-process whose error mode can change after headers have been flushed.
3. **Persistent chat reuses the `pi --continue` flag.** `runPiChat` checks the per-chat `sessionDir` for any `.jsonl`; if found, the spawn includes `--continue` so the model keeps the prior conversation context. Pure file-system state — no server-side memory needed.
4. **`x-pi-chat-id` response header.** The server returns the chat ID in a custom header so the client can persist it without baking it into the response body. Clean separation; the body stays a pure token stream.
5. **Resizable with persisted width.** `localStorage["session-review:pi-sidebar:width"]` clamps at `280–640 px`. The handle is a real ARIA `role="separator"` with `aria-valuenow/min/max`, keyboard `←/→/Home/End` resizing, and `pointerdown/move/up` for drag. This is the textbook implementation.
6. **Source-file pre-check.** `splitExistingFiles` checks each requested file with `stat` and splits into `existingFiles` / `missingFiles`. Missing files are surfaced in the response (could be shown in the UI; currently not surfaced explicitly). The model only ever gets attachments that exist.
7. **Auto-attaches the app's own source.** `sessionReviewSourceFiles()` includes `PiSidebar.tsx`, `route.ts`, `lib/pi.ts`, and `src/db.ts`. So Pi can answer questions about itself with real file evidence — a meta-investigation tool.
8. **Per-turn directory layout.** Each chat turn writes a `screen-context.json` and `prompt.md` under `output/pi-chat/<chatId>/<turnId>/`. Investigators can inspect what was actually sent. Treats observability as a feature, not a debug mode.
9. **Composer disabled while streaming.** `disabled={busy}` on `PiInput` — no double-sends.

## What it gets wrong

1. **Source-file chip lies on default state.** The sidebar shows `0/0 source files` on first load even though the route auto-attaches four source files via `sessionReviewSourceFiles()`. The chip is driven by the `files` prop passed to `<PiSidebar>`, not by the actual attached count returned from the server. Either drive the chip from the response (server tells client what it attached) or change the wording to `0 source files passed in (4 auto-attached)`. The first option is cleaner; ~20 minutes.
2. **No streaming indicator on the empty state.** First-turn UX: user types, hits Send, the chat ID hasn't arrived yet, and there's no visible "Pi is thinking…" beat between "user message inserted" and "first token arrives." `pi --thinking xhigh` can take several seconds before the first character. Add a low-key dots animation to the just-inserted assistant bubble. ~10 minutes.
3. **Empty state copy is too generic.** "Ready. Ask Pi about the visible page — follow-ups reuse the same persistent session." doesn't say *what* visible page. On `/session/X`, surface the session ID; on `/`, surface "the current search filters." Contextual empty state would make the provenance promise concrete. ~30 minutes.
4. **No retry button on errors.** When `PI_BINARY_NOT_FOUND` fires (e.g. `pi` not on PATH), the user gets an error bubble with the suggested env var to set, but they have to clear the chat and re-send. A "Retry" button on the error bubble would close the loop. ~15 minutes.
5. **`chatId` exposure is half-baked.** Once a turn runs, the chat ID appears in the chip row in tiny mono. There's no copy button on it. If a user wants to reproduce the session from CLI (`pi --continue --session-dir output/pi-chat-sessions/<chatId>`), they'd need to open DevTools to copy. Either add a copy button or remove the visible ID. ~5 minutes.
6. **Stop button replaces Send during streaming, but its keyboard binding is unclear.** ESC is a natural binding for "abort"; not currently wired. ~15 minutes.
7. **No history persistence across page navigation.** Navigating from `/` to `/tools` empties the message list and resets `chatId`. The "persistent session" promise survives across turns but not across routes. Could fix by lifting the messages array to a top-level Zustand-like store or to `localStorage`. Bigger lift; flag for later.
8. **`history` is sliced to last 12 turns** before being sent (`messages.slice(-12)`). Reasonable default, but unconfigurable; a long debugging session might want all-context. Not urgent.

## On the design brief

The mockup-prompt language asked for:

- ✅ "premium chat header" — the title + subtitle + New chat button reads premium.
- ✅ "selected context chip" — the `Session` accent chip and `0/0 source files` chip.
- ⚠️ "syntax-highlighted code block" — `highlight.js` is a dep but I didn't see code blocks in the empty-state captures; they likely render fine in answers (covered by `pi-streaming.spec.ts`). Worth a manual re-confirmation against a real Pi reply.
- ✅ "composer with send button" — square button with icon + text, disabled state.
- ✅ "subtle blue purple accents" — Recorder Blue chips, no decorative gradients.
- ✅ "compact professional developer tool aesthetic" — yes.

## Score: 8.5 / 10

The engineering is the strongest in the codebase. The half point off is for the lying source-file chip, the missing streaming indicator on first turn, and the navigation-resets-history smell. None are blockers.
