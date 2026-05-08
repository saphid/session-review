# Purpose & user stories

## What it is

A local-first investigation tool for AI agent session transcripts. Ingests Pi, Claude, Codex, and Cursor session files from disk into a SQLite database with an FTS index, then exposes them through a CLI and a single-page web app. The web app provides three views — a faceted search/list of sessions, a detail view per session showing the full transcript and metadata, and a usage analytics view (tools and skills over time). A right-side panel lets the user open the local Pi binary in a sub-process to ask questions about the on-screen evidence.

The codebase is small and intentional. ~17k indexed sessions on the user's machine; SQLite schema with `sessions`, `sessions_fts`, `usage_signals`, `agent_runs`, etc. Server is a hand-rolled Node `http.createServer` (no framework). Frontend is a single ~1.7k-line TypeScript file producing DOM directly (no framework). CSS lives entirely in `<style>` inside `index.html`.

## Implicit user (the developer)

A developer and the only user. They:
- run many AI sessions per day across providers
- want to *find* a previous session by topic, file path, time, or relation (parent/subagent)
- want to *audit* what an agent did — turns, tools, skills used, linked sessions
- want to *aggregate* tool and skill usage over time as a behavioral signal
- want to *delegate* analysis questions to a local Pi sub-agent with attached source context

## User stories the UI tries to serve

1. **"Find that session about X."** — type into top search; results re-sort by FTS rank. Filters narrow by agent, project (cwd), path fragment, date range, batch mode.
2. **"What did this session actually do?"** — open a row, see token/turn/tool/skill stats, scrub the transcript, jump to linked subagents/parents.
3. **"Show me how often each tool was used this month."** — switch to the Usage tab, see a stacked bar chart per day/week with a tabular breakdown.
4. **"Ask Pi about what I'm looking at."** — right sidebar chat; selected row/turn/result becomes the focus context, source files attach automatically.
5. **"Copy this transcript path / session id."** — `⧉` copy buttons across the drawer and session detail.
6. **"Pivot from a result to its primary."** — relation pill ("subagent of"/"primary") + Linked sessions cards in the drawer.
7. **"Trust the data."** — status line "200 signals · 1192 data points · 187ms" surfaces query honesty.

## Stories the UI does not yet serve well

1. **"Bookmark or share a search."** — the search input does not read from `?query=...` on load. The URL state is one-way (writes), not two-way. Direct-linking a search is broken.
2. **"Sort by anything."** — only Match/Run time/Activity headers are sortable; project, agent, relation are not. The default order (started_at DESC) is invisible — no glyph until you hover.
3. **"Re-run a session, or jump to its CWD in the IDE."** — actions column has only "Pi" and copy. No "open in editor" or "open in Finder."
4. **"See accurate counts."** — `matchScore`, `turns`, `tools`, `duration` shown on each row are fabricated client-side from a hash. The user is being shown plausible-looking but wrong numbers (this is fixed in one of the worktrees but not on `main`).
5. **"Page far into history."** — pagination shows "1 to 25 of 100+" — total is intentionally not computed, so navigating to an old session by paging is impractical.
6. **"Find by tool name."** — Usage page shows tool names, but clicking a row does not pivot to "show me the sessions that used Bash 50+ times." Cross-page filtering is one-way (filter sessions narrows the chart, but not the reverse).
7. **"Read a transcript without scrolling through resource_snapshot JSON."** — the first turn of every Pi session is a CUSTOM/context dump. The UI shows the raw JSON; there is no fold-by-default for high-noise turn types.

## Score

**Purpose clarity: 9 / 10.** Tight, real problem; the app knows what it is.
**Story coverage: 6 / 10.** Core paths work; deep-link, accurate counts, pivot-from-Usage, and JSON-noise hiding are obvious gaps.
