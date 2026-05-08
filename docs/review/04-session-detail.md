# Session detail page

URL: `/session/<sessionId>`. Reached by clicking a row title or the `↗` link in the drawer.

## What's on the screen

**Header.** Page title changes to "Session Details" + "Transcript evidence" subtitle. The toolbar's Filters / project / search controls remain visible but **dimmed to opacity .55** — a nice non-shouting cue that filters don't apply here.

**Above-the-fold panel.**
- `← Sessions` back link (top-left, blue, hoverable).
- Bold title: the full session title, multi-line if needed. (e.g. *"Task: Final re-review life-pka.19 after 20299df. Verify all runbook links route to actual docs including School Email, p"* — this title genuinely *is* truncated in the underlying data; the trailing "p" is the start of a cut-off word from the original prompt.)
- Meta strip: `pi` provider pill · "8 May 2026, 03:58 pm" date · `batch` run-mode badge.
- WORKING DIRECTORY label + path (long, wraps).
- TRANSCRIPT PATH label + path with a `⧉` copy button.
- 4-stat strip: **289 TURNS · 50 TOOLS · 21 SKILLS · 26 LINKED**. Big numerics, small uppercase labels. Real data — not fabricated here.

**Transcript controls toolbar.**
- "Lines/turn 18" numeric input + Apply button.
- Expand all / Collapse all (two solid blue buttons).
- "All types" dropdown + Expand type / Collapse type.

That's six controls. Busy.

**Transcript pane.** Two columns:
- Left: a thin nav list of turns, e.g. `#1` • `pi-opentelemetry.resource_snapshot {"sess…"`, `#2` • `skill-audit {"version":1,"phase":"turn_start"…}`. Acts as a sidebar TOC and lets you click to scroll.
- Right: the active turn card, headed `#1 CUSTOM context  18 TOOLS  3 SKILLS  810 TOKENS  Show more`, then the raw turn body (often unindented JSON for Pi sessions).

**Right sidebar — Pi Chat.**
- Header: "Pi Chat" title, "Persistent session with visible source context" subtitle, "New chat" button, "chat 308e0bec" pill.
- Tabs: "Chat 1".
- Chips: "Session" tag + "1/1 source file".
- Below: the chat conversation area (empty until you ask).
- Bottom: a passive `↳ Task: Final re-review life-pka.19 aft…` chip + an input.

## What works

1. **Dimmed toolbar tells you filters don't apply.** Subtle, correct, INV-5+6 fix.
2. **The 4-stat strip is excellent.** TURNS / TOOLS / SKILLS / LINKED in big tabular numerics gives a one-glance summary.
3. **Two-column transcript with sticky TOC.** The left rail keeps the user oriented across 289 turns. Clicking jumps and highlights.
4. **Per-turn header includes counts.** "18 TOOLS · 3 SKILLS · 810 TOKENS" surfaces density per turn — useful for finding where the real work happened.
5. **Show more per turn.** Default truncated (controlled by Lines/turn) with explicit reveal — keeps long turns from blowing the page out.
6. **Linked sessions become navigable cards.** Click a card and you're on its detail page; back link returns you to the prior search without re-fetching (INV-5+6).
7. **Pi context preview.** The Pi sidebar shows a bullet summary of "what is loaded for this screen" with a collapsed `<details>Debug JSON</details>` underneath — INV-6 fix; readable instead of raw.
8. **Copy buttons on session id and CWD.** INV-7+8.

## What fails

1. **Cold load is 10–17 seconds.** `/api/session?id=…` returns 303 KB and takes 10s on the first hit, 2.7s on the second, 0.5s when warm. Root cause: the SQL pulls `f.body` (the entire transcript) from the FTS table and then `deriveTranscriptItems` (db.ts:496) splits it with a regex on every request. For a 289-turn session with millions of bytes that is the bottleneck. HIGH. See `07-performance.md`.
2. **Six controls in the transcript toolbar.** Lines/turn + Apply + Expand all + Collapse all + All types + Expand type + Collapse type. The "Apply" pattern is non-standard — most apps update on input change. The two "type" buttons can be replaced by a "filter type" multi-select. MED.
3. **First turn is always raw `pi-opentelemetry.resource_snapshot` JSON.** This is the agent's bootstrap context and almost never the thing the user wants to read. The transcript should fold it by default (or hide CUSTOM/context turns behind a toggle). MED.
4. **Title can run into the right edge.** No padding-right beyond the column gap, so very long titles butt against the Pi sidebar boundary. LOW.
5. **WORKING DIRECTORY and TRANSCRIPT PATH are shown in full.** Both are long, and both wrap with hyphens. A path-aware middle-truncate (`/Users/alex…life-agent-workspace/pka-19-connector-hub-polish`) with an "expand" affordance + `⧉` copy would be calmer. LOW.
6. **No "open in Finder/IDE" action on the path.** The path is there to be acted on. Currently it's only copyable. LOW.
7. **`popstate` re-fetches.** When the user uses the browser back button from session detail, the search page re-issues `/api/search` — the in-memory `lastSearchRows` cache is bypassed. Inconsistent with the `← Sessions` back link, which does reuse the cache (INV-5+6). LOW. (Fixed in the data-truthfulness worktree.)
8. **`Pi Chat` panel takes ~360 px even when empty.** A toggle to collapse it would let the transcript breathe; currently the only "narrow" option is the resize handle (which does work, INV-7+8). LOW.

## Score

**UI quality: 7 / 10.** Strong skeleton, good progressive disclosure, the stat strip and TOC are great.
**Performance: 3 / 10.** A 10-second cold load is unacceptable on a tool that boasts "everything is local."
**Composite: 5.5 / 10.**
