# Architecture

## Layout

```
src/
  cli.ts          5  KB   command surface: ingest, search, status, derive
  server.ts      11  KB   raw http.createServer; ~10 routes; /api/pi/chat spawns the local pi binary
  db.ts          23  KB   schema, prepared statements, ingest, query helpers — the heart
  providers.ts    9  KB   per-provider parsers (Pi/Claude/Codex/Cursor) → normalized session rows
  analytics.ts    5  KB   usageSummary, usageTimeline, derivations
  text.ts         2  KB   shared snippet/tokenize utilities
  fs.ts           1  KB   path helpers
  types.ts        1  KB   shared types (ProviderId, SessionDetails, etc.)
  web/
    index.html  ~46  KB   shell + all CSS (~25 KB) + minimal markup; rendered by client.ts
    client.ts   ~75  KB   single file, all rendering, all event handling, no framework
```

No build framework, no bundler, no React, no Vite. `tsc` produces `dist/` and the server serves `dist/web/client.js` as plain ES module.

## Data flow

```
~/.pi/agent/sessions/...        ─┐
~/.claude/projects/...           ├─→  providers.ts (parse JSONL → SessionRow)
~/.codex/sessions/...            ├─→  db.ts (upsert into sessions + sessions_fts + usage_signals)
~/.cursor/.../*export.json       ─┘     │
                                        ▼
                              SQLite at  ~/.local/share/session-review/sessions.sqlite
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                         CLI (cli.ts)        web (server.ts → /api/*)
                                                  │
                                                  ▼
                                   src/web/client.ts (renders search, session, usage)
```

## Strengths

1. **Boring on purpose.** No framework debt; `tsc + tsx` is the whole toolchain. Dependencies: `better-sqlite3`, `chart.js`, `highlight.js`, `playwright` (dev). Total `package.json` is ~30 lines.
2. **Single source of truth.** Raw session files are authoritative; SQLite is a rebuildable derived index. The README states this explicitly. Reflected in the code — `npm start -- ingest` is idempotent.
3. **FTS5 is leveraged.** `sessions_fts` virtual table + `bm25()` rank + `snippet()` for highlighted excerpts. This is exactly the right primitive.
4. **Provider parsing isolated.** `providers.ts` keeps per-provider quirks (Pi's nested run-N directories, Claude's project hashing, Codex's session.jsonl shape, Cursor's chat exports) in one place; the rest of the code sees only `SessionRow`.
5. **Server ≈ 10 endpoints, all returning JSON.** Easy to scan, easy to debug. One imperative file.

## Weaknesses

1. **client.ts is a monolith.** ~1.7k lines, every page renderer, every event handler, the Pi chat client, the source-file picker, the resize-handle keyboard logic, the FTS-result table, the chart legend, all in one file. Ad-hoc top-level `let` state (`activeTab`, `selectedChatItem`, `lastSearchRows`, `piChatId`). Refactoring later will hurt because there's no module boundary.
2. **CSS sits inside `index.html`.** ~25KB of `<style>`. No layering, no naming convention beyond accidental BEM-ish. Worktree review revealed several rounds of token migration leaks because there's no canonical place to put a token. A separate `styles.css` (or a `:root` token block at the top of one file) would be cheap.
3. **No client-side state separation.** `lastSearchRows` is a global cache that drives back-button restoration; if a server-side render ever exists, this would need to be reworked. Tab routing reads `location.pathname` but never `location.search`, so URL → state is one-way.
4. **Server has no input validation layer.** `parseProvider`, `parseBatchMode`, etc. are minimal allowlist parsers; the rest of the search params flow straight into SQL via `better-sqlite3` parameterized queries (which is safe), but date strings are passed through unvalidated and the limit is `Number(...)` without bounds.
5. **N+1 in the search path.** `enrichSearchResults` (db.ts:266) calls `inferParentInfo` per row, which calls `findParentSession` per row, which prepares a statement and runs up to ~3 lookups against `sessions` per row. With limit=100 that's ~300 lookups for every search — see `07-performance.md`.
6. **Schema and migrations are implicit.** `openDb` (db.ts) creates tables if missing, but there is no version table and no migration story. Changing a column type means rebuilding from scratch, which is currently the design — but it ought to be stated.
7. **Several derived fields are fabricated.** `matchScore`, `turns`, `tools`, `duration` shown in the search table are computed from `stableHash(sessionId)` in `client.ts:565–595`. They look real. They are not. (Fixed in one worktree, not on `main`.)
8. **`usageRows()` in the drawer is also faked.** The "Top tools" bars and "Top skills" pills in the row-detail drawer use the same hash-derived synthesis. The data exists in `usage_signals` — the drawer just isn't joining to it.

## Score

**Architecture clarity: 8 / 10.** Layout is comprehensible; provider isolation, FTS leverage, and "raw files = truth" are excellent.
**Code-shape risk: 6 / 10.** client.ts and inline CSS will both bite during the next round of changes; truthfulness of derived fields is a real bug.
