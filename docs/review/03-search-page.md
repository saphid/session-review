# Search / sessions list page

URL: `/`. The default landing surface.

## What's on the screen

**Left sidebar** (216 px wide, full height, dark surface darker than canvas).
- Brand: `>_` glyph + "Session Review" wordmark, top-left. Wrapped in `.brand-link` so it's keyboard-navigable home.
- Nav: "Sessions" (active, blue indicator strip + "100+" pill), "Tools" (with `⊙` icon — used for the Usage page), then a `<details>` disclosure "More fea…  8" — this is the collapsed "More features (8)" stub group of disabled future-features. Truncates to "More fea…" at this width, which is unfortunate.
- Sidebar bottom: a circular "A" admin avatar with the label "admin" and a settings gear. The "admin" label is dead weight on a single-user local tool.

**Top toolbar.**
- Page title: "Sessions" + "Evidence table" subtitle (small grey).
- Right-aligned cluster: "▽ Filters" button → "All projects" project dropdown → top search input with a `/`-key hint.

**Filters area** (when expanded). Initially shows a single "Agent" select with two action buttons "Run query" (solid blue) and "Clear filters" (blue outline). Below that is a one-line shortcuts hint: `/ focuses search, 1 opens Sessions, 2 opens Tools & Skills, Escape clears selected Pi context.` Below that is a `▶ Advanced filters` disclosure (cwd, path contains, start/end date, batch mode, limit).

**Evidence table.** 8 columns, dense. Per row:
- AGENT — provider glyph (`>_`, etc.).
- TASK — bold title (truncates with ellipsis), small subtitle showing snippet OR a `…/dir/file` shortened path.
- PROJECT — humanized project name, parent-segment-disambiguated when duplicates exist.
- RELATION — orange "subagent of" pill or grey "primary" pill, with a parent name underneath.
- RUN TIME — locale date + "HH:MM PM · 72m" duration. Subtitle row is muted.
- ACTIVITY — three stacked metrics: tokens (e.g. "85k"), turns (e.g. "42"), tools (e.g. "3"), each with an "estimated" tooltip on tokens.
- MATCH — green pill, e.g. "0.89".
- ACTIONS — "Pi" attach button + `⧉` copy-path button.

A row, when clicked, expands an in-place **detail drawer** below it. The drawer shows: PARENT SESSION (full long title), RELATION pill + parent name, OPENED date, then a 4-column block — SESSION ID + RAW TRANSCRIPT PATH + WORKING DIRECTORY (each with `⧉` copy buttons), TOP TOOLS (horizontal bars), TOP SKILLS (pill list with counts), LINKED SESSIONS (vertical card stack). A close × in the top-right.

**Pagination footer.** "Showing 1 to 25 of 100+ sessions" left, page numbers `‹ 1 2 3 4 ›` right, "25 / page" dropdown far right.

## What works

1. **Density is calibrated.** 8-column table with subtitle rows reads at-a-glance without feeling cramped. Activity stack (tokens / turns / tools) is the right level of compression.
2. **Relation column carries a lot of meaning.** Pill colour conveys role (subagent vs primary), parent name gives context, no extra clicks needed for the common pivot.
3. **Drawer is the right pattern for this data.** Inline, no full-page navigation, no modal. The 4-column drawer surfaces high-value secondary fields without forcing a click into session detail.
4. **Copy buttons everywhere.** Path, session id, working directory all have `⧉`. Honors a developer's actual workflow.
5. **Filter discipline.** Single Agent dropdown shown by default; date / path / cwd / limit are all behind `▶ Advanced filters`. The Filters button itself shows an active-state dot when constraints are present.
6. **Sortable headers** (Run time, Activity, Match) with `↕` glyph and `aria-sort` updates — but see fail #1.
7. **Tabular numerics.** Token / turns / tools / match values use `font-variant-numeric: tabular-nums` so columns don't dance on hover.
8. **Status line "Showing 1 to 25 of 100+"** is honest about the cost of `COUNT(*)` on 17k sessions.

## What fails

1. **`matchScore` is a fabricated value.** `client.ts:565-595` computes `0.86 + (hash(sessionId) % 7) / 100` and shows it in the green "Match" pill, with a tooltip that lies: *"Relevance score 0–1. Higher = stronger keyword and semantic match."* When there is no query the column is meaningless; when there is one, the value is still a hash. (Fixed in worktree `agent-afac4afdc89656a93` against real `bm25()`. Not on main.) HIGH.
2. **`activityMetrics.turns` and `tools` are also fabricated.** Same hash, different denominator. This is the headline data of the page. HIGH.
3. **`runtimeDisplay.duration` ("72m" suffix) is `tokens / 850` clamped 8–72m.** Plausible, wrong. HIGH.
4. **The sortable header shows `↕` but does nothing.** No click handler is wired in `client.ts` for the `.sortable` class on `main`. The glyph is decoration; the user is invited to interact with a no-op. HIGH. (Wired in the data-truthfulness worktree.)
5. **URL ↔ search is one-way.** `client.ts:1713` writes URLSearchParams when the query changes, but no code reads `location.search` on load. `?query=react` is silently ignored. MED.
6. **`displaySubtitle` strips `[` and `]`** (`client.ts:538`). Designed for FTS-rendered `[hit]` markers from `snippet()`, but also corrupts code/markdown content that legitimately contains brackets. MED.
7. **"More fea…" + "100+" badges in the sidebar.** Truncated label and capped count. Fine on desktop wide; ugly on the 216-px sidebar. The badge "—" appears on mobile (renders as em-dash on overflow), which looks like a bug. MED.
8. **The drawer is full-width below the row.** When you have a wide screen the drawer's "Linked sessions" cards stretch into a hard-to-track column. The 4-column grid breaks at narrower desktop (1380 px) but the `min-width:1160` on the table forces horizontal scroll well before that. MED.
9. **Pagination total is "100+"** with no way to know real count. Fine for casual scrolling, painful for "I know the session is from January." Could add a date-jump or a one-click "load 1000" pre-filter. LOW.
10. **"admin" + gear in sidebar bottom** is functionally inert on a local-first tool. Could be removed or repurposed (e.g. theme toggle, ingest status). LOW.
11. **`mark`/`.hit` highlight in snippets uses solid amber** (`#815d00` on dark, calmed in the polish worktree) — on `main` it's still saturated. LOW.

## Score

**UI quality: 7 / 10.** The skeleton is excellent; density, hierarchy, copy buttons, drawer pattern are right.
**Truthfulness: 3 / 10.** Three of the table's most-glanced columns are made up. This is the single biggest credibility problem.
**Composite: 5 / 10.**
