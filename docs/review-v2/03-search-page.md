# Search page (`/`)

## Screenshots

- `output/screenshots/review-v2/01-search-default-desktop.png` — landing state, 9 fixture sessions.
- `output/screenshots/review-v2/02-search-query-desktop.png` — `?query=test` filter applied, 1 result.
- `output/screenshots/review-v2/03-search-drawer-expanded-desktop.png` — first row clicked, RowDrawer expanded.
- `output/screenshots/review-v2/04-search-filters-open-desktop.png` — `<details>` for advanced filters expanded.
- `output/screenshots/review-v2/12-search-wide-desktop.png` — same content, 1680×1000 viewport.
- `output/screenshots/review-v2/09-search-default-mobile.png` — mobile card list at 390 wide.

## Description (default desktop, 1440×900)

Three vertical zones, top to bottom:

1. **App chrome (top, 64 px tall).** Black canvas. Left of center: `>_` glyph + "Session Review" wordmark. Right of center: page title "Sessions" set in 22 px headline weight, with a muted "Evidence table" subtitle pinned beside it. The title region spans only the main column; the left sidebar carries its own brand block.
2. **Filters strip (under the title).** A single row: "Sessions… (press / to focus)" search input, an "AGENT" label + native `<select>` populated with `All / pi / claude / codex / cursor`, a primary "Run query" button (Recorder Blue, square corners, semibold label), and a right-aligned `9 results` count. Below the row sits a single-line `▶ ADVANCED FILTERS` `<details>` disclosure that expands to a 3-column grid of CWD, PATH CONTAINS, START DATE, END DATE, BATCH MODE, LIMIT — all consistently styled inputs with Field Black backgrounds.
3. **Results table.** 8 columns: AGENT (provider glyph centered in a small monospaced box), TASK (title + subtitle stacked, two-line clamp), PROJECT (humanized cwd), RELATION (`primary` / `subagent of …` / `batch` pill), Run time ↕ (date and 24-hour time stacked), Activity ↕ (tokens + tools count, both with monospaced labels), Match ↕ (BM25 pill — only present when a query is active), and a hidden-label Actions column with "Pi" + "Copy path" buttons. Rows are 56 px tall with hairline borders, hover-fill to `--color-surface-low`. Click anywhere on a row except a button → drawer expands underneath with the per-session details.

The right column, beyond the table, hosts the Pi sidebar (covered in `06-pi-sidebar.md`).

## What it gets right

1. **Real data in every column.** v1 fabricated `matchScore`, `turns`, `tools`, `duration`. v2 has only fields that map to real DB columns: `session_id`, `provider`, `cwd`, `path`, `started_at`, `last_event_at`, plus the `usage_signals` aggregate behind `tools`. `MatchPill` is null when there's no query — it doesn't lie a default. `RowDrawer` (T10) shows real top-tools and top-skills bars from `usage_signals`.
2. **Sortable headers actually sort.** `<SortableTh>` writes `aria-sort="ascending|descending|none"` honestly, renders `↕`/`↑`/`↓` to match, and on click does `router.replace("/?sort=runtime&dir=desc")` so the SQL ORDER BY actually changes. `tests/integration/search-sort.test.ts` and `tests/e2e/search-table.spec.ts` cover this. The arrow direction matches the aria-sort value, which is rare.
3. **URL ↔ filters two-way bind.** Type "test" in the search box, the URL becomes `/?query=test`. Reload — the search box still says "test" because `page.tsx` reads `searchParams` and seeds the form. Open advanced filters and pick a date — `?startDate=2026-01-15` appears. Share the link → the recipient gets the same view. T08 owns this.
4. **Drawer is non-modal and ESC-closeable.** Clicking a row toggles the drawer; clicking the same row again or pressing ESC closes it. Drawer content is fetched lazily via `/api/session?id=…` and shows session ID, raw transcript path, working directory (each with copy buttons), top tools, top skills. No loading spinner because the fetch is fast (~5 ms) but the empty container is announced via aria.
5. **Honest empty state.** "No sessions match the current filters." rendered into both the table tbody and the mobile card column, the same string. No "your data hasn't loaded" or "try a different query" upsell.
6. **Density matches the brief.** 9 rows fit comfortably in a 900 px viewport without crowding; row height + line-height balance the "dense, not crowded" goal.

## What it gets wrong

1. **`Run query` button vs Enter-key parity.** The form fires on Enter (search box is `type="search"`), and the `Run query` button explicitly submits the form. So the button is decorative more than necessary — it's an evidence anchor for a discoverability story (users seeing the button know the action exists). That's fine; just note that "Run query" is a *label*, not a load-bearing control. No fix needed.
2. **AGENT dropdown uses native `<select>`.** Looks dated against the rest of the UI — the rest of the controls have square Field Black fills, but the OS chrome makes the `<select>` look slightly raised on macOS. Rebuilding it as a styled custom dropdown is half a day's work and the only thing it buys is visual consistency. Defer.
3. **`Run time ↕` column header truncation on narrow desktop.** At 1440 px the column is 130 px and "Run time ↕" fits, but a few characters of slack would help; the table currently sets `min-width: 1060px` on the wrapper to avoid horizontal scroll on standard 13" laptops. Acceptable.
4. **ARIA: row click target ambiguity.** `<tr tabIndex={0} aria-expanded>` works for keyboard, but rows have no `role="button"` and don't announce as a click target to screen readers. The visual cursor changes to `cursor-pointer`; AT users get nothing. Either add `role="button"` or rely on the explicit "open" affordance from the actions column. Minor.
5. **Date/time format is hard-coded.** After the hydration-mismatch fix, both server and client render `15 Jan 2026 · 06:00`. That's fine for a developer tool but freezes locale; if the user wanted ISO `2026-01-15T06:00`, it'd require code. Not a bug — flag.
6. **No "clear filters" affordance.** When advanced filters are populated, the only way to clear them is to delete each value or hit `/`. A small "Clear all" link inside the advanced-filters disclosure would help.

## Mobile (`09-search-default-mobile.png`, 390×844)

`ResultsTable.tsx` renders both the desktop `<table>` and a mobile `<ResultCard>` list, with `md:hidden` / `hidden md:block` flipping which one is visible. The mobile cards stack vertically: title, project tag + primary/batch chip on the same line, token + tools counts, `Open` CTA + Pi/copy actions. No horizontal scroll. The hamburger button in the top-right opens the nav drawer (verified visually in `10-search-mobile-nav-open.png` — but the drawer didn't actually open in that capture; see `10-mobile.md`).

## Score: 8 / 10

The page does its job — find sessions fast, see real metadata, drill in, never lie. The remaining points (ARIA on rows, custom select, clear-filters link) are polish.
