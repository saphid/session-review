# Session-review — full review summary

## What this is

Local-first investigation tool for AI agent transcripts. SQLite + FTS5 over ~18k Pi/Claude/Codex/Cursor sessions. Single-binary node server, no framework on the frontend, intentionally small. Three pages — Search, Session detail, Usage — plus a persistent right-side Pi sub-process chat.

The bones are good. The biggest cracks are in (a) data honesty on the Search page, (b) cold-load latency on Session detail, and (c) an under-modularised frontend that's starting to bend under its own weight.

## Headline scores

| Area | Score | Notes |
|---|---:|---|
| Purpose & user stories | **7.5 / 10** | Tight problem; deep-link, accurate counts, pivot-from-Usage are obvious gaps |
| Architecture | **7 / 10** | Clear layering, FTS leverage, provider isolation; client.ts monolith and inline CSS are weights |
| Search page UI | **7 / 10** | Density, drawer, copy buttons all right |
| Search page truthfulness | **3 / 10** | matchScore, turns, tools, duration are fabricated on `main` |
| Session detail UI | **7 / 10** | Stat strip + TOC + Show more are excellent |
| Session detail performance | **3 / 10** | 10 s cold, 0.5 s warm — a 30× gap on a "local-first" tool |
| Usage page | **7.5 / 10** | Toolbar position, log scale, status line, sortable table — strongest page |
| Pi sidebar | **7.5 / 10** | Subprocess concept is excellent; lack of streaming + bare error path are the dents |
| Performance (server overall) | **4 / 10** | Search ~1 s, session ~10 s cold; both fixable in single-day work |
| Accessibility | **6.5 / 10** | Strong intent; faint focus rings + dishonest aria-sort + lying tooltip pull it down |
| Mobile responsiveness | **5 / 10** | Hamburger works; horizontal scroll on table; Pi feature absent |
| Code quality | **5.5 / 10** | TS clean; client.ts is 1.7 k lines; fabricated data; no unit tests |

**Composite: 5.9 / 10.** A polished, intentional tool with a credibility problem on the most-glanced numbers and a perf cliff on the most-loaded page.

## Ranking — what to fix first, biggest impact-per-hour

1. **Stop showing fabricated values in the Search table.** matchScore, turns, tools, duration. 1 day. Either wire to real data (already done in worktree `agent-afac4afdc89656a93`, commit `4252b7d`) or remove them. Single highest-leverage credibility fix in the project.
2. **Kill the 10-second cold load on Session detail.** Read transcript from disk instead of FTS body; pre-derive transcript items at ingest time; stream the response. ~1–2 days. Drops session detail from 10 s → ~500 ms.
3. **De-N+1 the search path.** Add `parent_session_id` to `sessions` at ingest, drop the per-row `findParentSession` lookup. ~half a day. Search drops from 1 s → ~50 ms.
4. **Wire the sortable headers** that already display `↕`. Done in worktree, ~1 hour.
5. **Make focus rings visible.** 14% opacity is invisible on a near-black surface. Polish-pass worktree change, ~10 minutes.
6. **Read `?query=…` on load.** URL ↔ search becomes two-way. ~30 minutes.
7. **Mobile: card layout for the table.** Replace `min-width:900 px` horizontal scroll with stacked cards under 720 px. ~half a day.
8. **Split client.ts.** No new behavior; just an afternoon of file moves so the next refactor has somewhere to land.
9. **Fold Pi `pi-opentelemetry.resource_snapshot` first turns by default.** Single-line fix, big readability win.
10. **Streaming for Pi sidebar.** Pi `--print` doesn't stream by default; this requires a streaming flag or a long-poll. Bigger lift but improves the most distinctive feature.

## What's already in flight (the worktrees)

| Worktree | Branch | Lands | Risk |
|---|---|---|---|
| `agent-a50f8e10a25f79b40` | `worktree-agent-a50f8e10a25f79b40` | Polish — token cleanup, focus ring, calmer hover | Low; no behavior change |
| `agent-afac4afdc89656a93` | `worktree-agent-afac4afdc89656a93` | Real BM25 match, real tool counts, sortable wiring, ARIA fix, popstate cache | Medium; touches db.ts, server contract |
| `agent-a836d0033db4f6656` | `worktree-agent-a836d0033db4f6656` | Visual redesign — token system, sticky headers, calmer density | Medium; ~334 lines of CSS rewritten |

All three branches are independent in the diff sense (different concerns), but they touch overlapping CSS regions. Recommended landing order:
1. **Data-truthfulness** (`afac4afdc89656a93`) — content fixes, lowest aesthetic risk.
2. **Polish** (`a50f8e10a25f79b40`) — small, low-risk CSS tightening.
3. **Redesign** (`a836d0033db4f6656`) — biggest visual swing; land after the others so it can absorb the polish/data changes without merge churn.

## Per-area docs

- [01-purpose-and-stories.md](01-purpose-and-stories.md) — what the app is for, who uses it, story coverage gaps.
- [02-architecture.md](02-architecture.md) — code layout, data flow, strengths and structural risks.
- [03-search-page.md](03-search-page.md) — the landing page; UI pros and the fabricated-data fail.
- [04-session-detail.md](04-session-detail.md) — transcript view; great skeleton, brutal cold load.
- [05-usage-page.md](05-usage-page.md) — analytics; strongest page in the app.
- [06-pi-sidebar.md](06-pi-sidebar.md) — subprocess Pi chat; concept ≫ implementation.
- [07-performance.md](07-performance.md) — measured latencies + concrete fixes.
- [08-accessibility.md](08-accessibility.md) — a11y intent vs reality.
- [09-code-quality.md](09-code-quality.md) — types, modularity, fabrication, tests.
- [10-mobile.md](10-mobile.md) — narrow-viewport behavior.

Screenshots referenced live in `output/screenshots/review/` (full-page) and `output/screenshots/review/crops/` (top/mid/bot panels).
