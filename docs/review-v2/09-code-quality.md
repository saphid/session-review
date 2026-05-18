# Code quality

## Type safety

- `tsconfig.json` runs strict (verified by `npm run check` script: `tsc --noEmit && tsc --noEmit -p apps/web/tsconfig.json`).
- No `any` smell in spot-check of `lib/pi.ts`, `lib/sessions-count.ts`, `components/search/ResultsTable.tsx`. Where unknowns appear (`screen?: unknown`, `selectedItem?: unknown` in `PiSidebar`), they're explicitly `unknown`, not `any`.
- Provider IDs flow through a single `ProviderId` union type from `@core/types.js` into search-params parsing into the SQL filter into the display layer. No stringly-typed providers floating around.
- Sort fields and dirs are similarly union-typed (`SortKey`, `SortDir`).
- `parseSearchFilters` returns a `SessionFilters` typed object — the URL boundary is the only place strings touch the DB layer.

Score on types: solid.

## Modularity

| Concern | File | Lines | Notes |
|---|---|---:|---|
| App shell | `components/shell/AppShell.tsx` | ~30 | One job: stitch the three zones. |
| Search filters | `components/search/Filters.tsx` | (not measured) | URL state owner. |
| Search table | `components/search/ResultsTable.tsx` | 462 | Both the desktop `<table>` and the mobile card list, plus `Th`/`SortableTh`/`Row` helpers. Long but cohesive. |
| Pi sidebar | `components/pi/PiSidebar.tsx` | 362 | Streaming + abort + resize + chat-id all live here. Tight. |
| Pi bridge | `lib/pi.ts` | 287 | The strongest file in the repo. Sub-process lifecycle, structured errors, file pre-check, timeout, persistent session. |
| Session count | `lib/sessions-count.ts` | 43 | Tiny memoized helper. |
| URL params | `lib/search-params.ts` | (not read in detail) | Client-safe parser. |

The `client.ts` 1.7 k-line monolith from v1 is gone. Components are grouped by feature (`search/`, `session/`, `pi/`, `usage/`, `shell/`, `ui/`). A new contributor can guess where to look from the URL alone: `/tools` → `app/tools/page.tsx` → `components/usage/*`.

## Tests

| Layer | Count | Files |
|---|---:|---|
| Integration (`node:test` + real SQLite fixture) | 5 | `db.test.ts`, `search.test.ts`, `search-perf.test.ts`, `search-sort.test.ts`, `session-detail.test.ts` |
| Playwright e2e (real Next dev server) | 14 | `shell`, `full-flow`, `smoke`, `search-url-state`, `search-table`, `drawer`, `usage`, `usage-drilldown`, `mobile`, `pi-streaming`, `pi-error`, `tokens`, `transcript-noise`, `session-detail` |

19 specs total. The away_summary said "35/35 e2e green" — Playwright's default test runner reports per-test, not per-spec, so 14 specs × 2-3 tests each = ~35.

What's tested:
- ✅ FTS5 query correctness (`search.test.ts`)
- ✅ Sort ordering through SQL ORDER BY (`search-sort.test.ts`)
- ✅ Search latency budget (`search-perf.test.ts`)
- ✅ Session detail render (`session-detail.test.ts`)
- ✅ Full flow: ingest → search → drill (`full-flow.spec.ts`)
- ✅ URL state two-way bind (`search-url-state.spec.ts`)
- ✅ Pi streaming (`pi-streaming.spec.ts`)
- ✅ Pi error structured payloads (`pi-error.spec.ts`)
- ✅ Mobile card layout (`mobile.spec.ts`)
- ✅ Usage drill-down (`usage-drilldown.spec.ts`)

What's not tested:
- No unit tests on display helpers (`runtimeDisplay`, `formatTokens`, `displaySubtitle`). These are pure functions with simple shapes — would benefit from `node:test` coverage. ~half a day.
- No visual-regression tests. Playwright's `expect(page).toHaveScreenshot()` would catch the kind of CSS drift that shipped a hydration mismatch (commit `433bc2b`). ~half a day to add for the canonical viewports.
- No load test. Search perf is asserted at <X ms in `search-perf.test.ts` against a small fixture; behavior at 18 k real sessions is not exercised.

## Comments — on-trend, mostly good

The codebase has noticeably more comments than typical. Many are excellent:

- `lib/pi.ts:8-19` — explains *why* the structured-error sentinel exists and *when* each branch fires. Future-you reading this will save 20 minutes.
- `lib/sessions-count.ts:21-23` — explains why `cache()` matters for this specific helper.
- `components/shell/AppShell.tsx:8-15` — documents the optional `pi` slot override.

But some narrate the *past* (the rebuild) rather than the present:

- `components/search/ResultsTable.tsx:43-69` references PLAN T09 / T10 / T16 by ticket number. Useful when those are fresh; rot-prone in 6 months.
- `app/page.tsx:19-32` references "the redesign brief" and "T08/T09 own". Same problem — readers in 2027 won't know which bead owned which.
- `app/globals.css:5-10` says "Design tokens lifted from the redesign worktree (worktree-agent-a836d0033db4f6656)". The worktree is gone; the link is dead.

These are easy to clean up but they don't blocking anything. Style guide for the next pass: if the comment names a worktree branch or a ticket number, replace it with the *invariant* (e.g. "match the desktop and mobile sidebar to a single DB hit per request" rather than "T03 own"). The CLAUDE.md principle states it correctly: "don't reference the current task, fix, or callers — those belong in the PR description and rot as the codebase evolves."

## Style consistency

- Tailwind classes are prettier-formatted (sorted by `prettier-plugin-tailwindcss`).
- ESLint is wired with `typescript-eslint` and `@next/eslint-plugin-next`.
- Path aliases (`@/components/...`) used consistently.
- No mixed `import` styles, no orphan imports in spot-check.

## Risks

1. **`tests/fixtures/sessions.sqlite` shows as modified in git.** Either someone ran an ingest against the fixture, or `fixture:build` is non-deterministic. Should be the latter caught and either fixed or `.gitattributes`-marked as binary-rebuild-on-change. Worth investigating before committing the v2 review docs.
2. **`ResultsTable.tsx` at 462 lines** is starting to push the "split this" threshold. The sortable-`<th>` helpers, `RelationCell`, `Row`, and the URL-param plumbing could each move out. Not urgent — the file is cohesive — but worth flagging.
3. **`PiSidebar.tsx` at 362 lines** has both streaming logic and resize logic in one component. The resize block (`onPointerDown/Move/Up`, `onSeparatorKey`, `setWidthClamped`) could become a `useResizableWidth` hook. ~1 hour of mechanical extraction.

## Score: 8 / 10

Strong types, real test coverage, clean module boundaries. Loses points for the rot-prone PLAN-Tnn comments, missing unit tests on display helpers, and the brink-of-too-big files.
