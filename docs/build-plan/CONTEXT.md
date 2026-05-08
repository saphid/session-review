# Build plan — input context

## What exists today
- `src/server.ts` — Node http server, ~10 routes, no framework
- `src/db.ts` — SQLite + FTS5, ~17k indexed sessions, prepared statements
- `src/providers.ts` — per-provider parsers (Pi/Claude/Codex/Cursor)
- `src/analytics.ts` — usage aggregations
- `src/web/index.html` + `src/web/client.ts` — vanilla SPA, ~46KB + 1.7k LOC
- `src/cli.ts` — ingest/search/status

## What the user wants
Rebuild the **web tier** with **Next.js (App Router) + Tailwind CSS + TypeScript**, keeping the data tier (SQLite + parsers + analytics) and the Pi-subprocess pattern. Fix all the known issues from `docs/review/`. TDD with Playwright e2e proofs. Every code turn passes lint + check.

## The known issues to fix as part of the rebuild (from docs/review)
1. Search-page fabricated data (matchScore, turns, tools, duration) → real BM25, real usage_signals counts
2. `/api/session` cold load 10s → read transcript from disk, pre-derive at ingest, stream
3. `/api/search` 1s every time → de-N+1 (pre-compute parent_session_id at ingest)
4. URL state two-way (read `?query=` on load)
5. Wire sortable headers
6. Visible focus rings, real ARIA semantics
7. Mobile: card layout under 720px, no horizontal scroll
8. Pi sidebar: streaming, error path, attachable file list
9. Usage chart drill-down
10. Hide pi-opentelemetry.resource_snapshot first turn by default
11. Visual: token system, tighter rhythm, accent restraint

## The three reference worktrees with already-merged improvements
- `agent-a50f8e10a25f79b40` (polish — token cleanup) — branch `worktree-agent-a50f8e10a25f79b40`
- `agent-afac4afdc89656a93` (data truthfulness — real BM25, sortable, popstate, real tools) — branch `worktree-agent-afac4afdc89656a93`
- `agent-a836d0033db4f6656` (visual redesign — tokens, sticky headers) — branch `worktree-agent-a836d0033db4f6656`

The data-truthfulness one has real fixes to db.ts (BM25, real tool counts via usage_signals SUM, popstate cache) — port those queries directly into the new Next.js API routes.

## Constraints from the user
- TypeScript everywhere
- Next.js (App Router) + Tailwind for web pages
- TDD: red → green → refactor
- After every code turn: lint + check must pass
- E2E tests (Playwright) prove every feature
- Sub-agents in their own worktrees, mark tasks owned + in_progress
- xhigh reviewer validates each worktree before merge
- xhigh merge agent integrates worktrees and resolves conflicts
- Loop until everything is built + e2e tested
- No human blocking
