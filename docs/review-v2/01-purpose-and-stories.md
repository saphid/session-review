# Purpose & user stories

## What it is

A local-first investigation tool for AI agent session transcripts. SQLite + FTS5 over Pi, Claude Code, Codex, and Cursor sessions, exposed as a CLI (`session-review search …`) and a Next.js web app on `localhost:8765`. Raw transcript files are the source of truth; the database and derived analytics are rebuildable views on top of them.

This is what `PRODUCT.md` says, and unusually for a product doc, the implementation matches.

## Who it serves

`PRODUCT.md` calls out two audiences:

1. **Today: Alex** — solo AI-heavy developer reviewing personal agent sessions, recovering prior context, and tracing decisions across providers.
2. **Later: similar developers and small work teams** who need local-first visibility into AI coding-agent activity.

Both are in *investigation mode* — resuming a thread, auditing what an agent did, finding a past fix, comparing tool/skill usage. They value speed, provenance, and direct access to raw transcript evidence over polished summaries. The product brief explicitly rejects "soft productivity UI that sacrifices density and control for empty space" — and the implementation honors that.

## Core user stories — coverage

| Story | Surface | Status | Evidence |
|---|---|---|---|
| "What did agent X do on date Y?" | Search filters (provider, date range, query) | ✅ | `Filters.tsx`; URL state round-trips via `?provider=…&startDate=…` |
| "Find the session where I did Z." | FTS5 search, BM25-ranked | ✅ | `search.ts` → `searchFilteredSessions`; `MatchPill` shows real BM25 |
| "Open this transcript and read what happened." | `/session/[id]` with stat strip + line list + turn detail | ✅ | `apps/web/app/session/[id]/page.tsx`, `TranscriptPane.tsx` |
| "What primary session was this subagent under?" | Search row drawer + RELATION column | ✅ | `RowDrawer.tsx`, `RelationCell` in `ResultsTable.tsx` |
| "Which tools/skills do I use most?" | `/tools` page with chart + table | ✅ | `UsageChart.tsx`, `UsageTable.tsx`, `series.ts` |
| "Drill from a tool spike to the sessions that caused it." | Click chart segment / legend / table row | ✅ | T15 wired drill-down; `usage-drilldown.spec.ts` covers it |
| "Ask Pi about what's on screen, with source attached." | Right Pi sidebar | ✅ | `PiSidebar.tsx` + `lib/pi.ts`; auto-attaches the active page's components |
| "Resume the same Pi conversation as I navigate." | Persistent `chatId` + `--continue` flag | ✅ | `runPiChat` reuses `sessionDir` + emits `x-pi-chat-id` header |
| "Cancel a Pi turn that's taking too long." | Stop button + AbortController + SIGTERM | ✅ | `stream.cancel()` in `lib/pi.ts` SIGTERMs the child |
| "Use this on my phone." | Mobile shell + cards + hamburger | ✅ partial | Card list works; nav drawer toggle didn't fire in `10-search-mobile-nav-open.png` (worth verifying) |
| "Know what changed since I last looked." | (none) | ❌ | No "new since X" or unread badge anywhere — but it's not in PRODUCT.md scope. |
| "Annotate or bookmark a session." | (none) | ❌ | Out of scope; raw transcript files are immutable per `PRODUCT.md`. |

The deliberate non-stories — annotation, bookmarks, redaction — are explicitly deferred in `PRODUCT.md` and `CLAUDE.md`. The implementation honors that boundary.

## Pi sidebar's place in the story map

The Pi sidebar isn't a generic "ask AI" panel grafted onto the side. It's the *follow-up* primitive for every other story — once you've found a session or opened a transcript, Pi answers questions about what's on screen with the relevant files already attached. The "premium chat header / selected context chip / message bubbles / composer" prompt language describes what was built: see `06-pi-sidebar.md` for a teardown of the implementation.

## Story gaps to consider

These aren't bugs; they're stories the product doesn't yet tell.

1. **Cross-session diff.** "Show me how this session diverged from the parent it forked from." Subagent → primary linkage exists (`relationFor()` in `search-display.ts`), but there's no diff view.
2. **Tool/skill timeline overlay on session detail.** The Tools page chart shows aggregate by date; a per-session timeline of tool calls inside the transcript view would round out the story "what did this session actually *do*?"
3. **Saved searches.** Filter URL state is shareable as a link, but there's no first-class "save this query" affordance.
4. **Cross-provider deduplication.** A claude+codex pair tackling the same task currently shows as two unrelated rows; the parent/child schema only links sessions inside one provider.

Each of these would require new schema (`session_links`, `session_tags`, `tool_events`) so they're proper next-PRD work, not polish.

## Summary

Score: **8 / 10**.

The product brief is tight, the user stories are well-mapped to surfaces, and every "today" story has a working implementation. The one unverified gap is mobile nav drawer behavior; the genuine stretches (cross-session diff, in-transcript tool overlay) are deliberately out of scope.
