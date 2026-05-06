# Live / scheduled ingestion plan

## Requirement

Session files can be:

- complete historical transcripts;
- active sessions currently being appended to;
- resumed sessions whose files change again later.

The ingest process must therefore be repeatable and safe to run continuously.

## MVP behavior

`session-review ingest` is mtime/size based:

1. Discover candidate files for each provider.
2. For each file, compare current mtime/size with the indexed row.
3. Skip unchanged files.
4. Re-parse changed files and replace their FTS row.

This means active and resumed sessions are picked up on the next ingest pass.

## Live mode

Run:

```bash
npm start -- ingest --watch --interval 300
```

For a single provider:

```bash
npm start -- ingest --provider pi --watch --interval 60
```

The process prints progress to stderr every 100 parsed candidates and every 500 skipped candidates:

```text
[time] ingest pi: candidates=1200, changed=4, elapsed=1m10s
```

## Scheduled process

For launchd, create `~/Library/LaunchAgents/com.alex.session-review.plist` pointing at:

```bash
/opt/homebrew/bin/npm --prefix /Users/alexsouthwell/Personal/Projects/session-review start -- ingest --watch --interval 300
```

The long-running `--watch` process is preferred over a one-shot cron because it gives live progress and handles resumed session files by repeated mtime checks.

## Later improvements

- Persist ingest run state and last progress in SQLite.
- Add file-system watchers for low-latency updates.
- Add per-provider backoff and max file size overrides.
- Store per-event line/byte offsets for precise citations.
