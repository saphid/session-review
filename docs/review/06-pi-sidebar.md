# Pi sidebar (right-side chat panel)

A persistent 360-px right sidebar across every page. Its job is to let the user delegate analysis to a local Pi sub-process, with the visible page state and the relevant source files attached as `@file` arguments.

## What's on the screen

**Top.** "Pi Chat" title + "Persistent session with visible source context" subtitle, "New chat" button, "chat 308e0bec" id pill.

**Tabs.** "Chat 1" tab (INV-7+8 wrapped the inner button with `role="tab"` / `aria-selected`).

**Source chips.** "Session" + "1/1 source file" — shows what context is currently attached.

**Empty state** (before a question). Now reads: *"Ready. Follow-ups use the same persistent Pi session"* (INV-5+6 made this context-aware: shows selection info when an item is selected, file count when files attached, otherwise the default).

**Selected-item chip.** Currently shows `↳ Task: Final re-review life-pka.19 aft…` — the active selection passed as Pi context, italic + dimmed (INV-5+6 styling).

**Resize handle.** A vertical bar between the main content and the sidebar; `role="separator"` with `aria-valuenow` updated as the user drags. ArrowLeft widens the sidebar, ArrowRight narrows it; Home/End jump to min/max. INV-7+8 fixed the `aria-valuemin/max` to match the actual constraints.

**Bottom.** Multi-line input + "Send" button.

## How it actually works

`POST /api/pi/chat` (server.ts:79). Server:
1. Writes the page screen JSON to `output/pi-chat/<chatId>/<turnId>/screen-context.json`.
2. Bundles the relevant source files (always: `client.ts`, `index.html`, `server.ts`, `db.ts`; plus any user-attached transcript files).
3. Spawns `pi --print --thinking xhigh --session-dir <dir> [--continue] --tools read,grep,find,ls @file… "<prompt>"`.
4. Waits up to `SESSION_REVIEW_PI_CHAT_TIMEOUT_MS` (default 120 s).
5. Streams `stdout` back as the assistant reply.

This is unique. It treats Pi as a subprocess oracle rather than embedding an LLM SDK. It's also the most fragile part of the app.

## What works

1. **Persistent sub-session.** `--session-dir` + `--continue` after the first turn means follow-ups have memory. The user can ask, "OK why didn't that work? What about the parent session?" without re-attaching everything.
2. **Auto-attached source.** Pi gets the actual screen context, the open transcript, and the four key source files of *this* app, every turn. The user does not have to think about what to feed it.
3. **Honest state surface.** "Session" / "1/1 source file" pills tell the user what's attached, no silent magic.
4. **The new context preview** (INV-6) renders the screen-context JSON as a readable bullet list with collapsed Debug JSON underneath. Massive UX improvement over the prior raw dump.
5. **Resize works with keyboard** (INV-7+8). Rare and correct.

## What fails

1. **120-second timeout is too long for a panel that blocks visually.** The panel offers no in-progress visual cue beyond a status string; the user can't tell whether Pi is stuck. A shimmer / streaming output would help, but `pi --print` does not stream by default — it returns at exit. MED.
2. **No streaming.** `runPiPrint` collects stdout to a Buffer and resolves only on `close` (server.ts:191). For long answers the user stares at a frozen panel for a minute. HIGH for perceived UX, MED for actual.
3. **`spawn` errors are flattened to a generic `"Failed to start Pi."`** (server.ts:189). If the `pi` binary is missing from PATH the user gets no help. MED.
4. **The sidebar always renders, even when not needed.** On the search page, where Pi context is "the current results", attaching every source file plus the screen JSON is fine in principle but produces a noisy first turn. A "minimal context" mode (selected row only, or no source files) would be cheap. LOW.
5. **`relatedFiles()` is not visible to the user.** The user sees "1/1 source file" but not what file. A hover-tooltip listing the attached file paths would close that gap. LOW.
6. **`pi-chat-sessions/` accumulates forever** in the project root. `output/` is gitignored so the user won't notice, but no rotation/eviction means a year-old laptop has many MB of stale dirs. LOW.
7. **The "New chat" button replaces the chatId silently.** A two-second toast confirming the new chatId or showing the previous chat history in a list would make this less destructive. LOW.

## Score

**Concept: 9 / 10.** Spawning a real local agent with the real screen context is exactly right for a developer's tool, and a clear differentiator over a hosted-LLM panel.
**Implementation: 6 / 10.** No streaming and a bare error path on `spawn` failure are the obvious dents. Everything else is small polish.
**Composite: 7.5 / 10.**
