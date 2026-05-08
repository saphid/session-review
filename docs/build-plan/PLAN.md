# Session-review rebuild — build plan

Orchestrator-executable plan. Foundation tasks run sequentially; the bulk fans out into parallel worktrees. Each task lists its acceptance criteria, the red Playwright test that proves it, and the merge slot.

---

## 1. Repo strategy

**Decision: replace `src/web/` and `src/server.ts` directly** in a sibling app folder named `apps/web/` (Next.js 15 App Router) and rewire `package.json` so `npm run dev` boots the Next app while `npm start --` keeps running the CLI. We do *not* maintain `src/web/index.html` or the legacy http server in parallel.

Rationale:

1. The legacy server has nine routes, all returning JSON. Re-implementing them as Next.js Route Handlers under `apps/web/app/api/**/route.ts` is a near-line-for-line port; running both servers wastes CI time and creates two truth surfaces.
2. The legacy frontend (`src/web/client.ts`, 1.7k LOC) is exactly the monolith the rebuild is supposed to retire. Keeping it alive while building the replacement invites style/data drift.
3. The data layer (`src/db.ts`, `src/providers.ts`, `src/analytics.ts`, `src/types.ts`, `src/text.ts`, `src/fs.ts`, `src/cli.ts`) is well-isolated, framework-free, and reused as-is. We import it from `apps/web/` via a workspace-style `tsconfig` path alias (`@core/*`), no bundler tricks needed.
4. `apps/web/` keeps a clean room. The CLI keeps living at `src/cli.ts` and `src/db.ts` — no workspace-split tooling debt.
5. Final layout:
   - `src/` — data layer + CLI (mostly unchanged).
   - `apps/web/` — Next.js app (App Router, server components by default, route handlers for /api/*, Playwright in `apps/web/tests/e2e/`).
   - Old `src/server.ts`, `src/web/index.html`, `src/web/client.ts` deleted in T17.

Toolchain:

- Next.js 15 (App Router), React 19, TypeScript strict.
- Tailwind v4 (CSS-first config, design tokens declared in `@theme`).
- ESLint flat config extending the existing root config; Prettier (Tailwind plugin).
- Playwright 1.59 (already a devDep).
- `better-sqlite3` runs in Node runtime — every route handler that touches the DB declares `export const runtime = "nodejs"`.

---

## 2. Foundation tasks (sequential)

### T01 — Scaffold Next.js workspace
**Effort**: M
**Blocked by**: —
**Files**: `apps/web/**/*`, `package.json` (scripts), `tsconfig.json` (paths), `eslint.config.js`
**Goal**: Next.js 15 App Router app at `apps/web/` with Tailwind v4, TS strict, ESLint flat extending repo root, Prettier with Tailwind plugin, Playwright config under `apps/web/playwright.config.ts`. `npm run dev` boots the app on `:8765`. `npm run lint`, `npm run check` (which runs `tsc --noEmit` over root + `apps/web`) both pass. Path alias `@core/*` resolves to `src/*`. The legacy server is renamed `src/legacy-server.ts` (still buildable but no longer the dev target) so the old e2e harness keeps working until T17.
**Red test**: `apps/web/tests/e2e/smoke.spec.ts` expects `GET /` → 200 and the page to contain "Session Review".
**Green**: scaffold, root layout, default page emits the wordmark.
**Done**: smoke spec passes; lint+check clean; commit on its branch.

### T02 — Port shared types and DB client module
**Effort**: S
**Blocked by**: T01
**Files**: `apps/web/lib/db.ts`, `apps/web/lib/types.ts`, `apps/web/lib/server-only.ts`
**Goal**: Single shared `getDb()` accessor in `apps/web/lib/db.ts` (cached per Node process, opens `process.env.SESSION_REVIEW_DB ?? defaultDb`, identical to `src/server.ts:13`). Re-export `SessionFilters`, `SearchResult`, `SessionDetails`, etc., from `@core/db.js` and `@core/types.js`. Mark file `import "server-only"` so it never reaches the client bundle. No business logic copied yet — just the bridge.
**Red test**: `apps/web/tests/integration/db.test.ts` calls `getDb()` and expects a non-zero `SELECT COUNT(*) FROM sessions`. (Integration tests run via `tsx --test` so they only execute when an actual DB is present; CI gates on a fixture DB at `apps/web/tests/fixtures/sessions.sqlite`.)
**Green**: bridge exports compile; integration test green against fixture.
**Done**: lint+check clean; integration test green.

### T03 — Tailwind tokens + global stylesheet from redesign worktree
**Effort**: S
**Blocked by**: T01
**Files**: `apps/web/app/globals.css`, `apps/web/tailwind.config.ts` (or `@theme` block)
**Goal**: Lift the `:root` token block from `worktree-agent-a836d0033db4f6656` `src/web/index.html` (lines 12–66) into Tailwind v4 `@theme`. Map: spacing (`gap-1..gap-8`), radii (`radius-sm..radius-panel`), surfaces (`canvas`, `surface`, `surface-low`, `surface-raised`, `field`), borders, text colors, role colors (user/assistant/tool/skill/system), accents, state, focus ring, code surfaces. Provide a small `@layer base` with the body background/font and the `.focus-ring` utility (`box-shadow: 0 0 0 2px rgb(var(--accent) / .55)`) used universally. Replace the legacy `--chrome-*` aliases — they are dead.
**Red test**: `apps/web/tests/e2e/tokens.spec.ts` asserts `getComputedStyle(document.body).backgroundColor === "rgb(11, 13, 17)"` (--canvas) and `getComputedStyle(document.documentElement).getPropertyValue("--accent")` is set.
**Green**: tokens declared in `@theme`; layout consumes `bg-canvas text-text font-sans`.
**Done**: spec passes; lint+check clean.

---

## 3. Parallel task tree (the bulk)

### T04 — Search list API route with real BM25 + tool counts
**Effort**: S
**Blocked by**: T02
**Files**: `apps/web/app/api/search/route.ts`, `apps/web/lib/search.ts`, `src/db.ts`, `src/types.ts`
**Goal**: Port `worktree-agent-afac4afdc89656a93` commit `4252b7d` SQL into `src/db.ts`: `bm25(sessions_fts) AS rawRank` in the matched CTE, `(SELECT SUM(count) FROM usage_signals WHERE session_id = s.id AND kind = 'tool')` as `toolUseCount`, and the rank-normalization in `enrichSearchResults`. Extend `SearchResult` with `matchScore: number | null` and `toolUseCount: number` (drop fabricated `turns`/`duration` from the type — they never existed there, only on the client). Build `apps/web/app/api/search/route.ts` (Node runtime) returning the result. Issues addressed: 1, 3 (the parent_session_id de-N+1 lands in T05).
**Red test**: `apps/web/tests/integration/search.test.ts` against fixture DB: `GET /api/search?query=react&limit=10` returns rows with `matchScore` in [0, 1] and `toolUseCount` ≥ 0; `GET /api/search?limit=10` (no query) returns rows with `matchScore: null`.
**Green**: SQL ports; route handler wraps it; types updated.
**Done**: integration test green; lint+check clean.

### T05 — De-N+1: pre-compute parent_session_id at ingest
**Effort**: M
**Blocked by**: T02
**Files**: `src/db.ts` (migration + `writeSession` + `searchFilteredSessions`), `src/cli.ts` (`derive` subcommand), `apps/web/tests/integration/search-perf.test.ts`
**Goal**: Add `parent_session_id` (TEXT, nullable) and `parent_title` (TEXT, nullable) columns to `sessions` via `ensureColumn`. Compute at `writeSession` time using the existing `parentPathCandidates` logic, looking up parents in the same transaction (use a deferred second pass when ingesting because parents may not yet exist — `npm run derive` re-runs the resolution after a full ingest). Replace the per-row `inferParentInfo` lookup in `enrichSearchResults` with a `LEFT JOIN sessions parent ON parent.id = s.parent_session_id` so the search query is a single round-trip. Keep `syntheticParentFromPath` as the fallback (still per-row but pure CPU). Issue addressed: 3.
**Red test**: integration test runs `searchFilteredSessions` 100 times with `limit=100` against a fixture and asserts p50 < 100 ms. Also asserts `parent_session_id` populated for known subagent rows.
**Green**: migration runs once; ingest writes parent ids; derive backfills; query joins.
**Done**: perf test green; existing search-correctness test still green; lint+check clean.

### T06 — Session detail API: read body from disk, pre-derive transcript
**Effort**: M
**Blocked by**: T02
**Files**: `src/db.ts` (new `transcript_items` table + ingest hook), `apps/web/app/api/session/route.ts`, `apps/web/lib/session-detail.ts`, `src/cli.ts` (derive backfill)
**Goal**: Stop reading the FTS body in `sessionDetails`. Add `transcript_items(session_id, idx, role, content_offset, content_length, tool_count, skill_count)` populated at `writeSession` from the in-memory body (so the regex split happens once at ingest, not per-request). For request-time content, read the actual transcript file by `sessions.path` with `node:fs/promises.readFile` and slice each item by stored offsets. The route handler returns header + stat strip immediately and streams transcript items as `application/x-ndjson` (or chunked JSON). Issue addressed: 2.
**Red test**: `apps/web/tests/integration/session-detail.test.ts` asserts `GET /api/session?id=<fixture>` returns header within 100 ms (TTFB) and full payload < 1 s on a 200-turn fixture.
**Green**: migration + ingest hook + streaming route.
**Done**: perf test green; existing CLI tests still pass; lint+check clean.

### T07 — App shell, route layout, sidebar nav
**Effort**: M
**Blocked by**: T03
**Files**: `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/components/shell/Sidebar.tsx`, `apps/web/components/shell/Topbar.tsx`, `apps/web/components/shell/AppShell.tsx`
**Goal**: Three-zone layout: left sidebar (216 px desktop, slide-over under 720 px), main column, right Pi sidebar slot (filled by T13). Sidebar nav has Sessions / Tools links that use `next/link`; `aria-current="page"` set on the active route, *removed* on the inactive (per the spec fix in `4252b7d`). Brand link has `aria-label="Session Review home"`. Drop the inert "admin" + gear from the bottom. Mobile hamburger toggles a real `<dialog>` or off-canvas drawer with `aria-expanded` and glyph swap. Issue addressed: 11 (visual rhythm); a11y items #1, #7.
**Red test**: `apps/web/tests/e2e/shell.spec.ts` asserts (a) sidebar visible at desktop, (b) `aria-current="page"` only on the active link, (c) at 390 px viewport, hamburger button is visible and toggles `aria-expanded`, (d) `:focus-visible` on the brand link shows a 2px outline (`expect(locator).toHaveCSS("box-shadow", /rgb\(122, 162, 255\)/)`).
**Green**: shell components, mobile drawer, focus-visible utility wired.
**Done**: spec passes; lint+check clean.

### T08 — Search page route + filters component (URL state two-way)
**Effort**: M
**Blocked by**: T04, T07
**Files**: `apps/web/app/page.tsx` (route), `apps/web/components/search/Filters.tsx`, `apps/web/components/search/SearchBar.tsx`, `apps/web/lib/search-params.ts`
**Goal**: Search page reads `?query`, `?provider`, `?cwd`, `?path`, `?startDate`, `?endDate`, `?batchMode`, `?limit`, `?sort`, `?dir` on load and writes them back via `useRouter().replace` whenever the user changes a control. `?query=react` deep-link populates the input *and* fires the search (server-side render fetches with those params; client hydrates with the same value). Filters drawer has Agent select inline; cwd / path / start / end / batchMode / limit live behind a `<details>` "Advanced filters". Keyboard shortcut `/` focuses the search input. Issue addressed: 4. Story #1 (deep link).
**Red test**: `apps/web/tests/e2e/search-url-state.spec.ts` opens `/?query=react&provider=pi`, asserts the search input contains `react` and the Agent select reads `pi`. Then changes the agent → asserts `?provider=claude` lands in the URL bar.
**Green**: server component reads `searchParams`; client filter component pushes URL.
**Done**: spec passes; lint+check clean.

### T09 — Search results table component + sortable headers
**Effort**: M
**Blocked by**: T04, T07
**Files**: `apps/web/components/search/ResultsTable.tsx`, `apps/web/components/search/RowActions.tsx`, `apps/web/components/search/MatchPill.tsx`
**Goal**: 8-column table (AGENT / TASK / PROJECT / RELATION / RUN TIME / ACTIVITY / MATCH / ACTIONS) rendered from real `SearchResult`. The "ACTIVITY" column shows `tokenEstimate` and `toolUseCount` only — no fabricated turns or duration. Match pill shows real `matchScore` formatted to 2 d.p., or `—` when null with the tooltip "No query — no relevance score." Headers Run Time / Activity / Match are clickable and keyboard-actionable; `aria-sort="ascending|descending|none"` updates honestly; clicking writes `?sort=...&dir=...` to the URL (re-rendering via T08). Tabular numerics on token / tool / match values. Issues addressed: 1, 5, a11y #2, #4. Story #4 (accurate counts).
**Red test**: `apps/web/tests/e2e/search-table.spec.ts`: (a) match pill renders a number for query rows and `—` for no-query, with the matching tooltip; (b) clicking the "Match" header toggles `aria-sort` between `ascending` and `descending` and the URL gains `?sort=match&dir=asc`; (c) Tab to header + Enter triggers the same sort.
**Green**: table component, sort state in URL, MatchPill, no fabrication.
**Done**: spec passes; lint+check clean.

### T10 — Search row drawer + real "Top tools / Top skills" from usage_signals
**Effort**: M
**Blocked by**: T04, T09
**Files**: `apps/web/components/search/RowDrawer.tsx`, `apps/web/app/api/session-summary/route.ts`, `apps/web/lib/session-summary.ts`
**Goal**: Click a row → expand inline drawer (4-column grid: SESSION ID + path / WORKING DIRECTORY / TOP TOOLS / TOP SKILLS / LINKED SESSIONS). The "Top tools" / "Top skills" data comes from a new `/api/session-summary?id=…` endpoint that returns the top 5 of each by `SUM(count)` from `usage_signals`. Copy buttons (`⧉`) on session id, path, cwd. Linked-session cards link to `/session/<id>` via `next/link`. Replaces the still-fabricated `usageRows()` flagged on every existing branch. Issue addressed: 1 (drawer half).
**Red test**: `apps/web/tests/e2e/drawer.spec.ts`: open a known fixture row, assert TOP TOOLS bars list real names from `usage_signals` (no `pi-tool-1` placeholder), and clicking copy on session id puts the id on the clipboard.
**Green**: drawer component, summary route, real signals.
**Done**: spec passes; lint+check clean.

### T11 — Session detail page + transcript pane
**Effort**: M
**Blocked by**: T06, T07
**Files**: `apps/web/app/session/[id]/page.tsx`, `apps/web/components/session/Header.tsx`, `apps/web/components/session/StatStrip.tsx`, `apps/web/components/session/TranscriptPane.tsx`, `apps/web/components/session/Toc.tsx`, `apps/web/components/session/TurnCard.tsx`
**Goal**: Server component fetches header/stats from `/api/session?id=…` (header-first chunk). Renders title + meta strip (provider pill, date, run-mode), CWD + path with middle-truncation + copy button, 4-stat strip (TURNS / TOOLS / SKILLS / LINKED). Two-column transcript pane: sticky TOC on the left (turn index, role icon, role name, count), turn cards on the right with collapsed/expanded state and per-turn header showing real tool / skill / token counts. The toolbar has been simplified to *three* controls: type filter (multi-select), Expand all, Collapse all (lines/turn moves into a `<details>` "Display options"). Header path uses middle-truncation (`/Users/alex…/pka-19-...`) with full path in `aria-label`. Issues addressed: 2 (UI half); review fail #2 (six controls). Story #7 partial.
**Red test**: `apps/web/tests/e2e/session-detail.spec.ts`: open `/session/<fixture-id>`, assert (a) the 4-stat strip reads non-zero values matching the fixture; (b) the toolbar contains three controls plus a `<details>` "Display options"; (c) clicking a TOC entry scrolls the corresponding turn card into view.
**Green**: page + components.
**Done**: spec passes; lint+check clean.

### T12 — Hide pi-opentelemetry.resource_snapshot first turn by default
**Effort**: S
**Blocked by**: T11
**Files**: `apps/web/components/session/TurnCard.tsx`, `apps/web/components/session/TranscriptPane.tsx`
**Goal**: When the first transcript item has `role` matching `/^(custom|context|pi-opentelemetry\.resource_snapshot)/i` *or* the content begins with `pi-opentelemetry.resource_snapshot`, the turn card renders collapsed by default with a "Show bootstrap context" affordance. The TOC entry is still listed but visually de-emphasized (muted text). Issue addressed: 10. Story #7.
**Red test**: `apps/web/tests/e2e/transcript-noise.spec.ts`: open a Pi fixture session whose first turn is the resource snapshot; assert the card is collapsed (`aria-expanded="false"`) and clicking "Show bootstrap context" reveals it.
**Green**: small predicate + initial collapsed state.
**Done**: spec passes; lint+check clean.

### T13 — Pi sidebar component (streaming, error path, attached file list)
**Effort**: M
**Blocked by**: T07
**Files**: `apps/web/components/pi/PiSidebar.tsx`, `apps/web/components/pi/PiMessageList.tsx`, `apps/web/components/pi/PiInput.tsx`, `apps/web/components/pi/AttachmentList.tsx`, `apps/web/app/api/pi/chat/route.ts`, `apps/web/lib/pi.ts`
**Goal**: Re-implement the Pi route handler with **streaming** via `ReadableStream` — the spawned `pi --print` child writes stdout, the route handler pipes it to the response as `text/event-stream` (or chunked plaintext lines). Client uses `fetch` with `body.getReader()` to append tokens to the assistant message in real time. Error path: distinguish "binary not found" (`ENOENT`), "non-zero exit", and "timeout" with concrete remediation strings ("Set `SESSION_REVIEW_PI_BIN` or install `pi` on PATH."). Attached file list: hover over the "1/1 source file" pill shows a tooltip listing every attached path; small "?" affordance opens a popover with the full list. Resize handle is a real `role="separator"` with arrow / Home / End / `aria-valuenow`. Issues addressed: 8.
**Red test**: `apps/web/tests/e2e/pi-streaming.spec.ts`: mock the API route to return a streamed body of `"hello\n"` then `"world\n"`; assert the message bubble shows `hello` before `world` arrives (i.e. between two `await page.waitForTimeout(50)` calls, the bubble grows). `apps/web/tests/e2e/pi-error.spec.ts`: stub the route to 500 with `{ message: "Pi binary not found" }`; assert the panel shows the actionable error message rather than "Failed to start Pi."
**Green**: streaming route, streaming client, structured error path, attachment popover.
**Done**: both specs pass; lint+check clean.

### T14 — Usage page: chart, legend, table
**Effort**: M
**Blocked by**: T02, T07
**Files**: `apps/web/app/tools/page.tsx`, `apps/web/components/usage/UsageChart.tsx`, `apps/web/components/usage/UsageLegend.tsx`, `apps/web/components/usage/UsageTable.tsx`, `apps/web/app/api/usage/route.ts`
**Goal**: Server component fetches `/api/usage?kind=tool&bucket=day`, renders log-scale stacked bar chart via Chart.js (or Recharts; pick whichever makes server-component hydration cleanest — *decision: Recharts*, because its React-native API plays well with App Router and avoids the canvas-aria gap). HTML legend below the chart with `role="list"`, focusable items. Status line is a real `role="status"` showing `<n> signals · <m> data points · <ms>ms`. Sortable table below. Bucket auto-picks `week` when the date span > 60 days, `day` otherwise. Issue addressed: 11; a11y #5 (chart aria-label).
**Red test**: `apps/web/tests/e2e/usage.spec.ts`: open `/tools`, assert (a) status line text matches `/\d+ signals · \d+ data points · \d+ms/`; (b) legend is a `<ul role="list">` with 8 focusable items; (c) chart `<svg>` has `aria-label` describing kind+bucket.
**Green**: chart, legend, table, route.
**Done**: spec passes; lint+check clean.

### T15 — Usage chart drill-down
**Effort**: S
**Blocked by**: T14, T08
**Files**: `apps/web/components/usage/UsageChart.tsx`, `apps/web/components/usage/UsageLegend.tsx`, `apps/web/components/usage/UsageTable.tsx`
**Goal**: Clicking a legend item navigates to `/?path=&query=tool:<name>&startDate=<bucket-start>&endDate=<bucket-end>` (or just `?query=…` if path-narrowing is too coarse). Clicking a stacked bar segment deep-links to the same URL with start/end set to that bucket. Clicking a table row drills the same way. Issue addressed: 9. Story #6.
**Red test**: `apps/web/tests/e2e/usage-drilldown.spec.ts`: click a known legend item, expect `/?...` URL with that tool's name in `query` and the page header reading "Sessions" with at least one row that contains the tool.
**Green**: click handlers + URL building.
**Done**: spec passes; lint+check clean.

### T16 — Mobile: card layout under 720 px, no horizontal scroll
**Effort**: M
**Blocked by**: T09, T11, T14
**Files**: `apps/web/components/search/ResultsTable.tsx`, `apps/web/components/search/ResultCard.tsx`, `apps/web/components/session/Header.tsx`, `apps/web/app/globals.css`
**Goal**: Below 720 px, the search ResultsTable swaps to stacked `ResultCard`s — one per row, each showing title, project, relation pill, activity (tokens · tools), match score, an "Open" link, and a "Pi" attach button. No horizontal scroll anywhere. Session detail header stat strip drops to 2×2 grid below 480 px instead of staying 4-up. The mobile sidebar's "Sessions / Tools" badges use `min-width: max-content` so the count never collapses to `—`. Issue addressed: 7; mobile fails #1, #2.
**Red test**: `apps/web/tests/e2e/mobile.spec.ts` (with `viewport: { width: 390, height: 844 }`): (a) `await expect(page.locator("body")).toHaveCSS("overflow-x", "hidden")`; (b) `await expect(page.locator(".result-card").first()).toBeVisible()`; (c) the sessions count badge text reads `100+`, not `—`.
**Green**: responsive variants, ResultCard component, badge fix.
**Done**: spec passes; lint+check clean.

### T17 — Delete legacy web/server, rewire dev scripts, end-to-end smoke
**Effort**: S
**Blocked by**: T08, T09, T10, T11, T12, T13, T14, T15, T16
**Files**: `package.json`, `src/server.ts` (delete), `src/web/index.html` (delete), `src/web/client.ts` (delete), `tests/e2e-session-page.mjs` (delete or relocate to `apps/web/tests/legacy/`), `README.md`
**Goal**: Once every parallel task has merged into the integration branch and its e2e is green, delete the legacy frontend and server. Update `package.json`: `dev` → `next dev -p 8765 apps/web`, `build` → `next build apps/web && tsc -p tsconfig.cli.json` (or split tsconfigs), `start` keeps targeting the CLI, `app` → `next start apps/web`. README updated to point at the new entry points.
**Red test**: `apps/web/tests/e2e/full-flow.spec.ts` runs through: open `/?query=pi` → click first row → expect to land on `/session/<id>` → expect TOC + transcript visible → switch to Tools → expect chart visible → click a legend item → expect to land back on filtered search. All within 5 s.
**Green**: legacy deletion + script rewire.
**Done**: full-flow spec passes; `npm run lint` + `npm run check` + `npm run build` all clean; CLI still runs.

---

## 4. Test strategy per task (recap)

| Task | Red (fails first) | Green (proves fix) | E2E seal |
|---|---|---|---|
| T01 | smoke.spec — `/` 200 + "Session Review" | scaffold + layout | smoke.spec |
| T02 | integration db test — count > 0 | bridge | integration |
| T03 | tokens.spec — body bg matches `--canvas` | `@theme` | tokens.spec |
| T04 | search.test — bm25 in [0,1], real tools | SQL port | search.test |
| T05 | search-perf.test — p50 < 100 ms | parent_session_id col + JOIN | perf test |
| T06 | session-detail.test — TTFB < 100 ms | disk read + transcript_items | perf test |
| T07 | shell.spec — aria-current + focus-visible | shell components | shell.spec |
| T08 | search-url-state.spec — `?query=` populates input | searchParams + URL writer | url-state.spec |
| T09 | search-table.spec — match `—` when no query, sort toggles | ResultsTable + sort state | table.spec |
| T10 | drawer.spec — real tool names, copy button | RowDrawer + summary route | drawer.spec |
| T11 | session-detail.spec — 3 toolbar controls, real stat strip | Detail page | detail.spec |
| T12 | transcript-noise.spec — first snapshot turn collapsed | predicate + collapse default | noise.spec |
| T13 | pi-streaming.spec + pi-error.spec — incremental output, structured errors | ReadableStream route + client reader | streaming + error specs |
| T14 | usage.spec — status line text + a11y legend | Tools page | usage.spec |
| T15 | usage-drilldown.spec — click → URL change | click handlers | drilldown.spec |
| T16 | mobile.spec — overflow-x hidden, ResultCard visible | responsive + ResultCard | mobile.spec |
| T17 | full-flow.spec — search → detail → tools → drill | legacy deletion | full-flow.spec |

Every task's red test goes in first on the task's worktree branch; each task ends with `npm run lint && npm run check && npm run -- playwright test <its-spec>` green before the agent hands off.

---

## 5. Merge strategy

Integration branch: `rebuild/integration` (cut from `main`).

Tasks merge into `rebuild/integration` as their worktree branches go green. The xhigh reviewer validates each worktree (its red test fails on `main`, passes on the branch; lint+check clean) before the merge agent fast-forwards or rebases.

Conflict-prone files:

- `src/db.ts` — touched by T04, T05, T06. Land **T04 first**, then T05 (additive migration + JOIN), then T06 (new table).
- `apps/web/app/page.tsx` — touched by T07 (shell), T08 (search route), T09 (table). Land T07 first, T08 second, T09 third.
- `apps/web/app/globals.css` — touched by T03 and T16. T03 establishes tokens; T16 adds breakpoint utilities. Easy three-way merge.

Final merge of `rebuild/integration` → `main` happens after T17's full-flow spec is green and the legacy code is deleted.

## 6. Total task count

3 foundation + 14 parallel = **17 tasks**. All bulk tasks are S or M. The largest (T05, T06, T13) are bounded by single-file scope or single-feature scope; if any agent finds a task running > one day, escalate to split (e.g. T13 streaming vs error-path could be split if Pi binary mocking eats the day).

---

## Merge order

T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11 → T12 → T13 → T14 → T15 → T16 → T17

Where parallelism is allowed (after foundations land):

- After T03 lands: T07 starts.
- After T02 lands: T04, T05, T06 start in parallel (all touch `src/db.ts` — they coordinate via merge order T04 → T05 → T06, not branch order).
- After T07 + T04 land: T08, T09 start in parallel.
- After T09 lands: T10 starts.
- After T07 + T06 land: T11 starts. After T11 lands: T12 starts.
- After T07 lands: T13 starts.
- After T07 + T02 land: T14 starts. After T14 + T08 land: T15 starts.
- After T09 + T11 + T14 land: T16 starts.
- After everything else lands: T17.
