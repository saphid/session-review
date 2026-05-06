# Session Review

Tiny local-first TypeScript CLI for ingesting AI coding agent sessions into SQLite FTS and querying them.

Supported MVP sources:

- Pi: `~/.pi/agent/sessions/**/*.jsonl`
- Claude Code: `~/.claude/projects/**/*.jsonl`
- Codex CLI: `~/.codex/sessions/**/*.jsonl`
- Cursor readable/exported sessions: `$CURSOR_SESSION_ROOT`, `~/.cursor/session-review`, `~/.cursor/sessions`

## Usage

```bash
npm install
npm run build
npm start -- ingest
npm start -- search "sqlite FTS"
npm start -- status
npm run derive
npm run app
```

Override DB path:

```bash
npm start -- --db /tmp/sessions.sqlite search "auth"
```

## Web app

```bash
npm run app
# open http://localhost:8765
```

If you are launching from another directory, use either a one-line `cd` or npm's prefix flag so npm finds this project's `package.json`:

```bash
cd /Users/alexsouthwell/Personal/Projects/session-review && PORT=8999 npm run app
# or
PORT=8999 npm --prefix /Users/alexsouthwell/Personal/Projects/session-review run app
```

The app supports session search, provider/cwd/path/date filters, grouping by working directory, agent/provider, or primary session + subagents, and tool/skill usage charts over time. Use the `Batch runs` filter to include all sessions, exclude likely batch/orchestration/subagent sessions, or show only those batch sessions. The primary-session grouping detects Pi nested `run-*` sessions and Claude `subagents/` sidechains, linking them to indexed parent logs when available and otherwise grouping them under a synthetic primary key from the path.

Run this after large ingests or code changes to rebuild tool/skill analytics for already-indexed sessions:

```bash
npm run derive
```

## Cursor exports

```bash
CURSOR_SESSION_ROOT=/path/to/cursor/exports npm start -- ingest --provider cursor
```
