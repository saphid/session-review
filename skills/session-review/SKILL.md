---
name: session-review
description: Use when the user asks to find, review, or search past pi/Claude/Codex/Cursor agent sessions indexed by the local session-review SQLite/FTS tool.
---

# Session Review Skill

Use the local CLI from this project:

```bash
cd /Users/alexsouthwell/Personal/Projects/session-review && npm start -- search "query"
```

## Behavior

1. Prefer `search` for user questions about past session content.
2. Use `--provider pi|claude|codex|cursor` when the user scopes to one agent.
3. Use `--no-refresh` only when the user wants fast/stale results.
4. Treat raw transcript paths printed by the CLI as evidence pointers.
5. Do not claim complete coverage for Cursor unless `CURSOR_SESSION_ROOT` points at exported/readable Cursor sessions.

## Commands

```bash
npm start -- ingest
npm start -- ingest --provider pi
npm start -- search "sqlite FTS" --provider pi
npm start -- status
```

## Non-goals for MVP

- No redaction.
- No secret exposure detection yet.
- No summaries or skill usefulness scoring yet.
- No UI.
