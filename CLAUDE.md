# Session Review

Local-first tool to ingest AI agent session transcripts into SQLite/FTS and query them from a CLI or agent skill.

## Commands

```bash
npm install
npm start -- ingest
npm start -- search "query"
npm start -- status
```

## Principles

- Raw session files are the source of truth.
- SQLite is a rebuildable local index.
- Keep the MVP simple: ingest pi, Claude, Codex, and Cursor-readable exports; search with FTS.
- Redaction is not a v1 requirement. Later exposure detection can be added as a derived scan.

## Design flow reminder

For non-trivial changes use: `grill-me` → `ubiquitous-language` → `deep-module-architecture` → `intentional-prd` → `ai-tdd`.
