# Architecture

## Stack

- **Web app**: Next.js 15 (App Router), React 19, Tailwind v4, TypeScript strict.
- **Data**: `better-sqlite3` 11 against the local `sessions.sqlite` (FTS5).
- **CLI**: `tsx`-driven `src/cli.ts` for ingest, search, derive.
- **Charts**: `recharts` for the Tools page chart.
- **Pi bridge**: `node:child_process` `spawn`, exposed as a `ReadableStream<Uint8Array>` to the route handler.
- **Tests**: Node's built-in `node:test` for integration (5 specs); Playwright for e2e (14 specs).

## Layout

```
apps/web/
├── app/                          ← App Router
│   ├── page.tsx                  ← /            Sessions search
│   ├── layout.tsx                ← AppShell wrapper
│   ├── globals.css               ← @theme tokens (Tailwind v4)
│   ├── tools/page.tsx            ← /tools       Tools usage chart + table
│   ├── session/[id]/page.tsx     ← /session/X   Transcript detail
│   └── api/
│       ├── search/route.ts
│       ├── usage/route.ts
│       ├── session/route.ts
│       ├── session-summary/route.ts
│       └── pi/chat/route.ts      ← Streaming Pi sub-process bridge
├── components/                   ← Grouped by feature
│   ├── shell/    AppShell, Sidebar, Topbar, MobileNav, NavLink
│   ├── search/   SearchBar, Filters, ResultsTable, ResultCard, RowDrawer, RowActions, MatchPill
│   ├── session/  Header, StatStrip, Toc, TranscriptPane, TurnCard, Toolbar, CopyButton
│   ├── pi/       PiSidebar, PiInput, PiMessageList, AttachmentList
│   ├── usage/    UsageChart, UsageLegend, UsageTable, series.ts
│   └── ui/       (shared primitives)
├── lib/                          ← Server-only data + helpers
│   ├── db.ts                     ← getDb() singleton
│   ├── search.ts                 ← parseSearchFilters
│   ├── server-search.ts          ← searchSessionsForPage RSC helper
│   ├── search-params.ts          ← typed URL parse (RSC-safe)
│   ├── search-display.ts         ← row → display projections
│   ├── sessions-count.ts         ← cache()-memoized total
│   ├── pi.ts                     ← runPiChat + spawn bridge
│   ├── session-summary.ts        ← linked session lookup
│   ├── transcript-noise.ts       ← Pi opentelemetry filter
│   ├── path-truncate.ts
│   ├── usage.ts
│   └── types.ts
└── tests/
    ├── integration/    ← node:test, real SQLite fixture
    └── e2e/            ← Playwright, real dev server
```

## Data flow

```
ingest CLI
  └── src/db.ts (sessions, sessions_fts, transcript_items, usage_signals)
                                    │
                                    ▼
       Next.js RSC page  →  lib/server-search.ts  →  better-sqlite3
                                    │
                                    ▼
        ResultsTable (client)    React.cache()-memoized helpers
        Filters (client, URL)         (sessions-count.ts)
                                    │
                                    ▼
                     `<Topbar>` + `<Filters>` + `<ResultsTable>`
                                    │
                                    ▼
                        `<RowDrawer>`  (client, lazy fetch via /api/session)
                                    │
                                    ▼
                         /session/[id] (RSC) + `<TranscriptPane>`

          PiSidebar (client) ─POST→  /api/pi/chat  ─spawn→  pi --print --continue
                       ◀──ReadableStream<Uint8Array>──┘
```

The data path is straight: SQLite → server component → React serialization → client. The only client→server roundtrip is for **drawer** content, **Pi chat**, and **sortable header** updates (which `router.replace()` the URL with `scroll: false` to keep the page anchored).

## Strengths

1. **RSC boundaries are clean.** Server components read SQLite directly via `getDb()`; client components are clearly marked with `"use client"`. No "I forgot which side this runs on" smell.
2. **`React.cache()` for the sidebar count.** `getSessionsCount` is called by both the desktop sidebar and the mobile nav drawer. `cache()` makes that one DB hit per request, not two. Small thing, exemplary RSC habit.
3. **`server-only` import** at the top of `lib/db.ts`, `lib/pi.ts`, `lib/sessions-count.ts`, `lib/search.ts`. This is what catches "oops, you imported a Node-only module from a client component" at build time.
4. **Provider-typed throughout.** `ProviderId = "pi" | "claude" | "codex" | "cursor"` flows from `@core/types.js` into search-params parsing into the SQL filter into the display layer. No stringly-typed provider strings floating around.
5. **`@core/*` aliases.** `apps/web/tsconfig.json` is presumably pointed at the parent `src/` for the shared schema types. Worth double-checking, but the pattern is right.
6. **Hand-rolled URL params parser** in `search-params.ts` rather than a heavy library. Fits a tool whose entire goal is local + minimal dependencies.

## Structural risks

1. **`globals.css` and `DESIGN.md` disagree on radius and palette.** DESIGN.md mandates `0px` radius across every component vocabulary; `globals.css` declares `--radius-sm/md/lg/panel: 4–8px` and the rendered UI uses them (search input, run button, primary chip, table border). The DESIGN.md file is dated *after* the rebuild — it's a written-up spec, but it doesn't match what shipped. Either (a) update DESIGN.md to match, (b) sweep the implementation back to square. (See `11-design-fidelity.md`.)
2. **`lib/pi.ts` hard-codes attached source files** in `sessionReviewSourceFiles()`. If a new file becomes critical to Pi context (e.g. `lib/db.ts` — already there — or a future `lib/transcript.ts`), the array has to be updated by hand. Not a bug, but a known-stale list.
3. **`force-dynamic` on `/`.** `apps/web/app/page.tsx` exports `dynamic = "force-dynamic"` because results depend on URL state. That's correct, but it forecloses Next's static optimization for the *empty* state — first-time-with-no-filters should be cacheable. Low priority.
4. **No `core/` package boundary inside the repo.** `apps/web/` reaches into `@core/*` (presumably `src/`); fine for one app but the moment you add a second consumer you'll need to extract a real workspace package.
5. **`tests/fixtures/sessions.sqlite` is checked in but `git status` shows it modified.** That suggests an ingest run mutated the fixture. Either the fixture-build script is non-deterministic or someone ran `npm start -- ingest` against the test DB. The integration tests should rebuild this from scratch (`fixture:build`) so the diff shouldn't matter; worth a checked re-run before committing the v2 review docs.

## What v1 had that v2 dropped (intentionally)

- **`src/web/index.html` + `client.ts` monolith** — gone. Replaced by Next App Router. Removed in T17.
- **Inline-CSS embedded in HTML** — gone. Now `globals.css` + Tailwind utilities.
- **Per-page hand-rolled fetch loops** — gone. RSC + client islands.
- **`script:type=module` ad-hoc bundling** — gone. Next does it.

The diff is large but the principle was simple: *every legacy file was deleted in T17* once T01–T16 had stood up replacements, and the e2e suite stayed green throughout.

## Score: 8 / 10

The architecture is right-sized for the product. Strict TypeScript, clean RSC boundaries, server-only marked, real test coverage. Loses a point for DESIGN.md drift and the hard-coded Pi attachment list.
