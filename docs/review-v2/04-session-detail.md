# Session detail (`/session/[id]`)

## Screenshots

- `output/screenshots/review-v2/05-session-detail-desktop.png` — top of `/session/claude:fixture-perf-200` (a 200-turn fixture).
- `output/screenshots/review-v2/06-session-detail-transcript-desktop.png` — same page after a 360 px scroll.
- `output/screenshots/review-v2/11-session-detail-mobile.png` — same page on a 390 px viewport.

## Description (1440×900 desktop)

Reading top to bottom inside the main column:

1. **Page header** (`Topbar`-equivalent for this route): "Session details" 22 px headline with "Transcript evidence" muted subtitle.
2. **Back link**: `← Sessions` in muted text, links to `/`.
3. **Session title row**: `T06 perf fixture` h1 (28 px-ish, bold), followed by a chip row with the provider (`CLAUDE` in tonal pill), the started-at timestamp `15 Jan 2026, 06:00 pm`, and a `BATCH` chip when the session is part of a batch agent run.
4. **Path strip** (two columns of two rows each): `WORKING DIRECTORY` label + truncated path + copy button; `TRANSCRIPT PATH` label + truncated path + copy button. Both use `path-truncate.ts` to keep the head and tail visible (e.g. `/Users/alex/Personal/Projects/session-review`).
5. **Stat strip**: 4 evenly-distributed cards — `200 TURNS / 100 TOOLS / 50 SKILLS / 0 LINKED`. Each card is `--color-surface` with a hairline border and a centered headline number above an uppercase label. The "LINKED" zero is meaningful — it's the count of cross-session relations (parent or batch) and it's `0` for the fixture because it was generated as a standalone primary.
6. **Toolbar** above the transcript pane: "Type filter — all" `<select>`, "Expand all" / "Collapse all" buttons, a "▶ Display options" disclosure.
7. **Two-column transcript pane**:
   - **Left**: dense compact line list (Cursor-style minimap). Format `#1 u…  rebuild lane 0 — kick off the next workstream` with role-prefix abbreviations (`u…`, `assi…`, `tool`, `tool_…`) and one-line truncated turn previews. Click any line → scrolls the right pane to that turn and selects it.
   - **Right**: stacked turn cards. Each card has a uppercase header `#1 USER | 0 TOOLS · 0 SKILLS · -11 TOKENS`, then the turn body. Tool calls render as code wells; tool results render as quoted plaintext.

## What it gets right

1. **Cold load is 50 ms.** Down from ~10 s in v1. The win came from two changes: (a) `transcript_items` is now a derived table populated at ingest time, so the page reads pre-parsed turn metadata instead of re-parsing the JSONL on every request; (b) the body is read straight from the on-disk transcript path instead of being rehydrated from `sessions_fts.body`. See `07-performance.md`.
2. **Stat strip is honest.** `0 LINKED` shows zero rather than hiding the card. That's the right call: a user who knows what LINKED means will spot the zero and infer "no parent, no children." A user who doesn't know what it means will hover and learn from the column.
3. **Two-column transcript ≈ Cursor's gutter.** This is the explicit "Cursor and VS Code inspired" design from the prompt. Click line `#137` in the gutter → right pane scrolls to that turn. Tool/skill counts stay visible in the headers without obstructing the prose.
4. **`Type filter` is a real filter, not a search.** It hides turn types you don't want (e.g. only `user`/`assistant` to read the conversation; only `tool`/`tool_result` to audit calls). The filter UI is small and adjacent to the data, not buried in a side panel.
5. **`Expand all` / `Collapse all`** are pair operations on a long transcript. With 200 turns in this fixture they're load-bearing — without them you'd be clicking 200 times to fold the tool noise.
6. **`Display options` is a `<details>` disclosure**, not a modal. Hides the long-tail toggles (probably token visibility, role-color tinting, monospace mode) without taking permanent space. Honest progressive disclosure.
7. **CopyButton on every path.** Working directory and transcript path both have the copy affordance — exactly what an investigator wants to paste into a terminal.

## What it gets wrong

1. **Right pane does not scroll-anchor on first open.** Landing on the page directly puts the right pane at turn `#1`. The line list shows 200 turns; the user scrolling the gutter doesn't bring the right pane along — the right pane only follows on click. That's correct behavior for a TOC, but a user might expect the gutter and the pane to scroll together (synchronized scrolling). Worth deciding deliberately, not by default.
2. **No "permalink to this turn".** The URL is `/session/X` regardless of which turn is selected. A `?turn=137` query param would let you bookmark or share a specific evidence anchor. ~half a day of work; high value.
3. **Filter-noise toggle for `pi-opentelemetry`** (T12) defaults to hiding the resource_snapshot first turn — good. But there's no visible "noise filtered" status line, so a user comparing turn counts to the stat strip will see `200 TURNS` and only count `199` cards. A small `199 visible · 1 hidden` pill would clear it up. ~15 min.
4. **No keyboard navigation between turns.** `j`/`k` or `↑`/`↓` to step through turns is the natural binding for a Cursor-aesthetic interface. Currently the only way to jump turns is mouse-click in the gutter. Rough estimate: 1 hour with a `useEffect` listener.
5. **Stat strip cards aren't clickable.** `100 TOOLS` could link to `/tools?session=X` (or open a filter on the type-filter dropdown). Not strictly missing — the user can filter manually — but the Fitts-target is right there.
6. **Path strip on narrow desktop wraps awkwardly.** At 1280 px the working directory and transcript path can collide. `path-truncate.ts` already truncates by character count, but it doesn't measure; a CSS-only `text-overflow: ellipsis` with `min-width: 0` on the flex column would be more robust. Visible in `06-session-detail-transcript-desktop.png` — actually fine on this fixture, but worth verifying on a real long path.

## Mobile (`11-session-detail-mobile.png`)

The same elements stack into a single column. Stat strip becomes a 2×2 grid, paths stack vertically, and the two-pane transcript collapses to: the line list disappears, only the right-pane turn cards stack. That's a deliberate trade — the gutter has no room on a phone, and the user navigates by scrolling, not by clicking. Very readable. The `Type filter` dropdown remains accessible at the top of the transcript region.

## Score: 9 / 10

This is the best page in the app. The cold-load fix alone earns it, and the two-pane layout matches the "Cursor-inspired" prompt language exactly. Loses one point for the missing `?turn=` permalink and keyboard nav.
