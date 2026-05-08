# Session Review

Local-first tool that ingests AI coding-agent session transcripts into SQLite/FTS and lets you query them from a CLI or a Next.js web app.

Supported MVP sources:

- Pi: `~/.pi/agent/sessions/**/*.jsonl`
- Claude Code: `~/.claude/projects/**/*.jsonl`
- Codex CLI: `~/.codex/sessions/**/*.jsonl`
- Cursor readable/exported sessions: `$CURSOR_SESSION_ROOT`, `~/.cursor/session-review`, `~/.cursor/sessions`

## Layout

```
src/        # data layer + CLI (better-sqlite3, FTS, providers, analytics)
apps/web/   # Next.js 15 App Router app (search, session detail, tools)
```

The CLI and the web app share the same SQLite database. `SESSION_REVIEW_DB`
overrides the default path (`$HOME/.local/share/session-review/sessions.sqlite`).

## CLI

```bash
npm install
npm start -- ingest        # walk known provider roots and upsert sessions
npm start -- search "test" # FTS query against indexed bodies
npm start -- status        # row counts per provider
npm run derive             # rebuild tool/skill analytics for indexed sessions
```

Override the DB path:

```bash
npm start -- --db /tmp/sessions.sqlite search "auth"
```

Cursor exports:

```bash
CURSOR_SESSION_ROOT=/path/to/cursor/exports npm start -- ingest --provider cursor
```

## Web app (Next.js)

```bash
npm run dev    # next dev on http://localhost:8765
npm run build  # next build apps/web && tsc (CLI dist)
npm run app    # next start on http://localhost:8765 (after build)
```

If you launch from another directory, use `cd` or npm's `--prefix` so npm
finds this project's `package.json`:

```bash
cd /path/to/session-review && PORT=8999 npm run dev
# or
PORT=8999 npm --prefix /path/to/session-review run dev
```

The web app supports session search with FTS scoring, provider/cwd/path/date
filters, primary/subagent/batch grouping, syntax-highlighted transcript code
blocks, per-turn estimated token counts, transcript expand/collapse controls,
a configurable default lines-per-turn limit, a right-hand Pi chat sidebar, and
tool/skill usage charts with click-through drill-down to filtered search.

The Pi chat sidebar writes a screen-context JSON bundle under `output/pi-chat/`
and calls `pi --print --thinking xhigh --session-dir output/pi-chat-sessions/<chat-id> --continue`
after the first message, so follow-up questions share a persistent Pi
session. Each turn attaches the current screen context plus the contents of
every transcript/source file loaded for the current screen. Override the Pi
binary with `SESSION_REVIEW_PI_BIN`.

## Quality gates

```bash
npm run lint              # eslint src + apps/web
npm run check             # tsc --noEmit (root + apps/web)
npm run test:integration  # tsx --test against the fixture DB
npm run e2e:web           # Playwright suite (boots next dev on :8765)
```

## Principles

- Raw session files are the source of truth.
- SQLite is a rebuildable local index.
- Keep the MVP simple: ingest pi, Claude, Codex, and Cursor exports; search with FTS.
- Redaction is not a v1 requirement. Later exposure detection can be added as a derived scan.
