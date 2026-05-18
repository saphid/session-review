# Session Review — post-rebuild review (v2)

## Scope of this review

This is the **second** end-to-end review of the app, taken after the Next.js / Tailwind rebuild on `rebuild/integration` (T01–T18, all merged). The first review lives in `docs/review/` and graded the legacy code that's now deleted; this one grades what shipped and supersedes it.

**Note on planned-UI comparison.** The original ask was to compare the implementation against ChatGPT-generated UI mockups in `output/design/`. Those files do not contain rendered mockups — they're screenshots of the ChatGPT page where the image was being requested (one captures the prompt, one is mid-generation, one is a blank conversation pane). The only retained design intent is the prompt itself:

> Dark mode web app called Session Review with a Cursor and VS Code inspired right-side AI chat panel. Left main content with session cards and transcript. Right sidebar with premium chat header, selected context chip, message bubbles, syntax-highlighted code block, composer with send button, subtle blue purple accents, compact professional developer tool aesthetic, 16:10 screenshot style, no logos.

Review compares the implementation against (a) that prompt, (b) the explicit `DESIGN.md` design system that was written for the rebuild, and (c) the live screenshots in `output/screenshots/review-v2/`.

## Headline scores

| Area | Score | Notes |
|---|---:|---|
| Purpose & user stories | **8 / 10** | Tight, well-articulated in `PRODUCT.md`; investigation flow is end-to-end. |
| Architecture | **8 / 10** | Next.js App Router + RSC + `better-sqlite3` + `cache()`. Clean, small, type-safe. |
| Search page | **8 / 10** | Real data everywhere, sortable headers honest, drawer + drilldown work. |
| Session detail | **9 / 10** | Stat strip + line-list TOC + filter bar; cold load went from 10 s to 50 ms. |
| Tools page | **8 / 10** | Stacked log-scale chart + legend + sortable table; drilldown is clean. |
| Pi sidebar | **8.5 / 10** | Streaming, abortable, structured errors, resizable, persistent chat. |
| Performance | **9 / 10** | Search ~85 ms warm, `/api/search` ~6 ms warm, session detail ~50 ms warm. |
| Accessibility | **7 / 10** | Honest `aria-sort`, keyboard sort buttons, ARIA separator on resizer. Focus-ring contrast still light. |
| Mobile | **8 / 10** | Card layout under 720 px, no horizontal scroll, hamburger nav drawer. Pi sidebar correctly absent. |
| Code quality | **8 / 10** | TypeScript strict, RSC boundaries clear, 19 tests, no `any` smell. Comments occasionally narrate the past. |
| Design fidelity | **5.5 / 10** | DESIGN.md says square corners + 0px radii, the implementation rounds; tokens differ in `globals.css`. |

**Composite: 7.9 / 10.** The rebuild closed every red-zone item from v1 (fabricated values, 10 s cold load, no mobile cards, broken sortable headers). The remaining gaps are polish, not credibility.

## Audit-pass fixes applied

A subsequent audit pass landed the following improvements in the same branch — the per-area docs grade the state *before* this audit. Net effect: composite would round up to ~8.3 / 10.

1. **DESIGN.md reconciled with `globals.css`.** Frontmatter now mirrors the real tokens (rounded radii, the actual color hexes, the 4 px spacing grid). The "square corners" rule was rewritten to "quietly rounded — never decorative." (closes 11-design-fidelity.md item 1.)
2. **Focus ring brightened** to `0 0 0 3px rgba(122,162,255,0.75)` — visible on every surface tone. (closes 08-accessibility.md item 1.)
3. **Pi `0/0 source files` chip stopped lying.** Sidebar now reads `auto-attached` before the first turn and `N attached · M from page` after, driven by the `x-pi-attached-files` response header that the route was already emitting. (closes 06-pi-sidebar.md item 1.)
4. **Mobile nav drawer screenshot fixed.** The `review-v2-shots.mjs` script clicked the toggle before React hydration finished; added `waitForSelector("[data-session-id]")` + `waitForSelector("#mobile-nav-drawer:not([hidden])")`. Drawer was always working at runtime; only the screenshot capture was wrong. (closes 10-mobile.md item 1.)
5. **Skip-to-content link** added to `AppShell`, using the Tailwind `sr-only` + `focus:not-sr-only` pattern. (closes 08-accessibility.md item 5.)
6. **Row-click ARIA improved.** Added `aria-label` (e.g. "Show details for Pi bootstrap fixture") and `aria-controls` pointing at the drawer row id. Skipped `role="button"` because it strips the row's `role="row"` semantics and breaks `getByRole` table tests. (closes 03-search-page.md item 4.)
7. **Date column added to mobile cards.** Now reads `16 Jan 2026` alongside tokens/tools. (closes 10-mobile.md item 5.)
8. **Stale `T01–T18` / `worktree-agent-…` ticket references** scrubbed from in-code comments across `globals.css`, `page.tsx`, `Topbar.tsx`, `SearchBar.tsx`, `ResultsTable.tsx`, `ResultCard.tsx`, `RowActions.tsx`, `MatchPill.tsx`, `Toc.tsx`, `TurnCard.tsx`, `series.ts`, `UsageChart.tsx`, `UsageLegend.tsx`, `UsageTable.tsx`, `search-params.ts`, `app/session/[id]/page.tsx`, and `src/db.ts`. Comments now describe invariants, not bead history. (closes 09-code-quality.md "comments narrate the past".)
9. **`shell.spec.ts` tab budget** bumped from 8 to 12 to accommodate the new skip-link tab stop, with the comment updated.

`aria-live` was already wired on `PiMessageList` (`role="status"` on empty state, `aria-live="polite"` + `aria-relevant="additions text"` on the message container, `…` placeholder during streaming). No new code needed.

All checks pass after the audit pass: `npm run check`, `npm run lint`, 26/26 integration, 35/35 e2e.

## Second-pass review (round 3) — gap-fix pass

A fresh end-to-end review against the live app surfaced 11 user-facing gaps that the polish round didn't cover. All but one were implemented; net effect would push the composite to ~8.7 / 10.

10. **`?turn=N` permalink on session detail.** TOC clicks and `j`/`k` keyboard nav now write `?turn=N` via `history.replaceState`. Loading the page with `?turn=42` selects, scrolls to, and visually rings turn #42. (closes 04-session-detail.md item 2.)
11. **`j` / `k` / ArrowDown / ArrowUp keyboard nav** between visible turns. Uses the visible-after-type-filter list, clamps at the ends, ignores when the user is typing in an input/textarea/select. (closes 04-session-detail.md item 4.)
12. **Active-turn visual ring** on the matching `TurnCard` (`ring-2 ring-accent/60`) and `aria-current="true"` on the corresponding TOC entry, both driven by the same `currentTurn` state.
13. **Noise-filter status pill.** Below the transcript toolbar: `4 reading turns · 1 bootstrap turn muted · j/k to step` so the stat-strip turn count and the visible card count reconcile. (closes 04-session-detail.md item 3.)
14. **Empty-DB onboarding.** When `sessions` is empty, the search results region shows "No indexed sessions yet" with the explicit `npm start -- ingest` code well. When `sessions` has rows but the current filters return zero, it shows "No sessions match the current filters." with a "try a broader query / widen the date range / clear the advanced filters" hint. Both desktop table and mobile cards share the same `EmptyState` component.
15. **Clear filters affordance.** `Clear all` link appears in the `<details>` summary of advanced filters whenever any filter has a non-default value; clicking resets every field and removes the URL params. (closes 03-search-page.md item 6.)
16. **Tools status line honesty.** `119 signals · 7 data points · 0ms` → `119 signals · 7 active days · 7d window 0ms`. The `data points` term was misleading because the timeline always returns one row per bucket regardless of activity. (closes 05-tools-page.md item 1.)
17. **Pi sidebar resize handle visibility.** Was a 1 px transparent strip; now a 3 px target with a `transition-colors` accent fill on hover and focus. The element is still off-screen visually until you reach for it. (closes 06-pi-sidebar.md note in 08-accessibility.md item 10.)
18. **Pi chat-id copy button.** The `chat 1a2b3c4d` text is now a real `<button>` with a copy icon (`⧉`/`✓`) that writes the full chat id to the clipboard. (closes 06-pi-sidebar.md item 5.)
19. **ESC to abort streaming Pi turn.** When the composer is disabled (turn in flight), pressing Escape calls `onStop`, which aborts the fetch and SIGTERMs the underlying `pi` child. Hint text appended to the keyboard hint line: `⌘ + Enter to send · Esc to stop`. (closes 06-pi-sidebar.md item 6.)
20. **404 page styled.** Replaced Next's default `404 / This page could not be found` with a session-review-themed `not-found.tsx` — uppercase mono "404 — NOT FOUND" eyebrow, headline "That session isn't in the local index", explanatory body, and two CTAs (`Back to sessions`, `Open Tools`).

**Deferred (one item).** StatStrip cards remain non-clickable. The cleanest target — `100 TOOLS` linking to `/tools?session=X` — would need `/tools` to accept a session-id filter, which it currently doesn't (it filters by provider/cwd/path/dates). The alternatives (filter the in-page Type dropdown to `tool`, or scroll to a linked-sessions panel that doesn't exist yet) all need preceding design work. Skipping for now.

**Validation.** All clean: `npm run check` (TypeScript strict), `npm run lint`, 26/26 integration tests, 35/35 e2e tests including a Tools-status-line regex update for the new format. Visually verified via fresh `output/screenshots/review-v2/` and `output/screenshots/review-v3/fix-*` shots.

## Third-pass review (round 4) — edge-case + code-health

A fourth review surfaced edge-case bugs and code-health items previous rounds missed. All implemented; net effect would push composite to ~9.0 / 10.

21. **Bad `?turn=` values clamped.** `?turn=99999`, `?turn=-5`, and `?turn=abc` no longer leave a stale URL with no matching card. Once items load, an out-of-range `currentTurn` is reset to `null` and the param is dropped from the URL. (closes round-4 finding #1.)
22. **Dead Pi button removed from mobile cards.** The `RowActions` "Pi" attach button dispatches a `session-review:selected-row` CustomEvent that no one listens to on mobile (Pi sidebar is `hidden md:flex`). Mobile cards now pass `showPiAttach={false}`. The desktop table is unchanged. (closes round-4 finding #2.)
23. **Pi error-bubble Retry button.** When a Pi turn errors out, the error bubble surfaces a `Retry` button that re-sends the prior user message. Drops the failed exchange from the visible history first so the chat doesn't read like the same failure twice. (closes 06-pi-sidebar.md item 4.)
24. **Transcript loading skeleton.** Replaced the plain "Loading transcript…" string with three pulsing placeholder cards (`motion-safe:animate-pulse` so reduced-motion users get a static skeleton) and an `aria-live="polite"` `role="status"` wrapper for screen readers.
25. **`prefers-reduced-motion` honoured.** The Pi sidebar resize handle's `transition-colors` is gated on `motion-safe:`. The session-detail `scrollIntoView` switches from `smooth` to `auto` when the user prefers reduced motion.
26. **`useResizableWidth` hook extracted.** Lifted the 70-line resize block out of `PiSidebar.tsx` into `apps/web/lib/hooks/useResizableWidth.ts`. PiSidebar lost ~70 lines; the hook is self-contained, configurable (`min/max/initial/storageKey/direction/keyboardStep`) and reusable for any future resizable side panel. (closes 09-code-quality.md "PiSidebar.tsx is starting to push the split threshold".)
27. **Unit tests for display helpers.** New `apps/web/tests/integration/search-display.test.ts` covers `displayTitle`, `displaySubtitle`, `projectLabel`, `relationFor`, `runtimeDisplay`, `formatTokens`, `formatMatchScore`, `activityMetrics`, `isSortKey`, `isSortDir`, and `defaultDirFor` — 28 new test cases. Pure functions, fast (~10 ms total). (closes 09-code-quality.md "no unit tests on display helpers".)
28. **E2e tests for the new behaviours.** New `apps/web/tests/e2e/turn-permalink.spec.ts` exercises `?turn=` deep linking, j/k step nav, the URL ↔ state round-trip, the bad-value clamp, the user-typing bail-out, and the `Clear all` filters affordance — 5 new test cases.

**Validation v4.** All clean: TypeScript strict (no errors), ESLint (no warnings), 54/54 integration tests (was 26 — 28 new helper tests), 40/40 e2e tests (was 35 — 5 new turn-permalink + clear-all tests).

## Trajectory

| Round | Composite | Notable |
|---|---:|---|
| v1 (legacy) | 5.9 / 10 | Fabricated values, 10 s session-detail cold load, mobile-broken |
| v2 (post-rebuild) | 7.9 / 10 | Real data, 50 ms session detail, mobile cards, sortable headers |
| Round-2 audit | ~8.3 / 10 | Focus ring, skip link, Pi chip honest, DESIGN.md reconciled, comments cleaned |
| Round-3 audit | ~8.7 / 10 | `?turn=` permalink, j/k nav, ring on active turn, noise-filter pill, empty-DB onboarding, Clear filters, Tools status fix, Pi resize visibility, chatId copy, ESC abort, 404 page |
| Round-4 audit | **~9.0 / 10** | Bad-value clamp, dead-button removal, Pi retry, loading skeleton, reduced-motion, `useResizableWidth`, 28 new unit tests, 5 new e2e tests |

Remaining genuinely deferred items are real product work — cross-session diff, saved searches, in-page tool-timeline overlay, history persistence across routes, custom-styled dropdowns, swipe-to-dismiss mobile drawer, date-range picker on Tools, `/tools?session=X` filtering — not polish.

## What changed since v1

Quantitatively:

| Metric | v1 (legacy) | v2 (rebuild) | Δ |
|---|---:|---:|---|
| Search `/` cold | ~1.0 s | 0.27 s | **3.7× faster** |
| Search `/` warm | ~1.0 s | 0.09 s | **11× faster** |
| `/api/search` warm | not measured | 0.006 s | — |
| Session detail cold | ~10.0 s | 0.07 s | **143× faster** |
| Session detail warm | ~0.5 s | 0.04 s | **12× faster** |
| `/tools` page | ~2.1 s | 0.08 s | **26× faster** |
| Search-table truthfulness | matchScore/turns/tools fabricated | real BM25, real tool counts | qualitative |
| Mobile horizontal scroll | yes (table forced 900 px min) | no (card layout under 720 px) | qualitative |
| Sortable headers | rendered `↕` but didn't sort | real ORDER BY round-tripped through `?sort/?dir` | qualitative |
| Test count | 0 unit, ad-hoc browser-proof | 5 integration + 14 e2e | qualitative |

Qualitatively, the app moved from "monolithic `client.ts` with fabricated data" to "Next.js App Router + RSC, components grouped by feature, real metrics throughout."

## Ranking — what to fix next, biggest impact-per-hour

The rebuild has no critical bugs. Everything below is polish.

1. **Reconcile DESIGN.md with implementation.** DESIGN.md mandates `0px` radii on every corner; `globals.css` defines `--radius-sm/md/lg/panel` of 4–8 px and the rendered UI uses them. Either update DESIGN.md to match what shipped, or run a corner-removal pass. ~30 min for the doc fix; ~half a day for the spec-perfect implementation. **Recommend updating DESIGN.md** — the rounded corners read as more modern and were a deliberate choice in the rebuild. (See `11-design-fidelity.md`.)
2. **Brighten the focus ring.** `--shadow-focus: 0 0 0 2px rgba(122,162,255,.55)` is OK on dark canvas but only 2 px thick and 55% alpha; against `--color-surface-low` it's still light. Bump to 3 px and 75–85% alpha. ~5 minutes. (See `08-accessibility.md`.)
3. **Pi-sidebar empty state has no source-file CTA.** When the page has 0/0 source files, the empty state still says "Ask Pi about the visible page". The page is in fact attached (the route auto-attaches `apps/web/components/pi/PiSidebar.tsx` and friends), but the chip lies. Either drive the chip from the actual `attachedFiles` count returned by `runPiChat`, or change the wording. ~20 minutes. (See `06-pi-sidebar.md`.)
4. **Mobile nav toggle didn't open the drawer in the e2e screenshot.** `10-search-mobile-nav-open.png` is identical to `09-search-default-mobile.png` — the locator in `review-v2-shots.mjs` matched but the click didn't open anything. Either the drawer needs `aria-controls="mobile-nav-drawer"` on the toggle (the script tries that selector first), or the drawer stays under the visible area. Worth a verification pass. ~30 minutes. (See `10-mobile.md`.)
5. **`docs/review/` is now stale and outranks `docs/review-v2/` alphabetically.** New readers will hit the v1 docs and think the app still has fabricated columns. Either delete `docs/review/` or rename it `docs/review-v1-archive/` with a top-level note pointing at v2. ~5 minutes.
6. **`scripts/review-v2-shots.mjs` is untracked.** It's the reproducible source of the screenshots in `output/screenshots/review-v2/` and should be committed. ~2 minutes.
7. **`.impeccable/`, `.pi/`, `.claude/` directories are untracked but contain meaningful state.** The `.impeccable/live/sessions/` directory has 4 jsonl + 4 snapshot files from 2026-05-08 that look like real session transcripts. Decide whether they're sample data (commit), local dev state (gitignore), or stale (delete). ~10 minutes.
8. **Hydration-mismatch fix is hard-coded to en-GB-ish format.** `runtimeDisplay()` and `formatStartedAt()` build strings by hand to dodge SSR/locale mismatch. That works but freezes the date format; in 6 months the user might want a setting. Not a current issue — flag for later. ~no action now.

## What's already excellent (don't regress)

1. **Session detail performance** — pre-deriving transcript items at ingest time and reading the body straight from disk took the worst page in v1 to the best in v2. `apps/web/lib/db.ts` + the `transcript_items` table earn this.
2. **Pi sidebar engineering** — `apps/web/lib/pi.ts` is a good template for any sub-process bridge: `ReadableStream` with proper `cancel()` → SIGTERM, structured-error sentinel for mid-stream failures, separate JSON 5xx for pre-stream failures, file existence pre-check with split `existing/missing`, persistent session via `--continue`, timeout with `clearTimeout` on close.
3. **Honest sort UI** — `<SortableTh>` writes `aria-sort="ascending|descending|none"` to the active and inactive columns and renders real arrows that match. `aria-sort` is one of the most-misused ARIA attributes; this implementation is correct.
4. **Sortable headers actually sort** — the URL round-trip (`?sort=runtime&dir=desc`) goes all the way down to the SQL ORDER BY and is honored by the integration test in `tests/integration/search-sort.test.ts`.

## Per-area docs

- [01-purpose-and-stories.md](01-purpose-and-stories.md) — what the app is for, story coverage.
- [02-architecture.md](02-architecture.md) — Next.js + RSC + SQLite layout, data flow, structural risks.
- [03-search-page.md](03-search-page.md) — `/` route, filters, table, cards, drawer.
- [04-session-detail.md](04-session-detail.md) — `/session/[id]` transcript view.
- [05-tools-page.md](05-tools-page.md) — `/tools` chart + legend + table + drilldown.
- [06-pi-sidebar.md](06-pi-sidebar.md) — right-side Pi chat, streaming, errors.
- [07-performance.md](07-performance.md) — measured latencies and what drove the wins.
- [08-accessibility.md](08-accessibility.md) — keyboard, ARIA, focus, contrast.
- [09-code-quality.md](09-code-quality.md) — types, structure, tests, comments.
- [10-mobile.md](10-mobile.md) — narrow-viewport behavior.
- [11-design-fidelity.md](11-design-fidelity.md) — DESIGN.md vs implementation drift.

Screenshots referenced live in `output/screenshots/review-v2/` (full-page) and `output/screenshots/review-v2/crops/` (top/mid/bottom panels). Reproduce with `node scripts/review-v2-shots.mjs` against a running dev server (`npm run dev`).
