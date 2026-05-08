# Performance

## Environment

- 2.5 GB `sessions.sqlite`
- 18,301 sessions
- 18,301 FTS rows
- 28,634 usage rows
- ~17.6k Pi sessions, plus Claude / Codex / Cursor

The pitch is "local-first, instant." Reality is uneven.

## Measured latency (`PORT=4140 node dist/server.js`, prebuilt, warm DB cache after first cold hit)

| Endpoint | Cold | Warm | Payload |
|---|---:|---:|---:|
| `GET /api/filters` | 196 ms | 8 ms | 39 KB |
| `GET /api/usage?kind=tool&bucket=day` | 263 ms | 70 ms | 96 KB |
| `GET /api/search?limit=100` | **942 ms** | **907 ms** | 106 KB |
| `GET /api/search?query=react&limit=100` | 1192 ms | 648–1083 ms | 101 KB |
| `GET /api/session?id=<pi:…>` | **10.1 s** | 530 ms | 303 KB |

Two outliers ruin the experience:

### 1. `/api/search` is ~1 second every time

The query plan, from `src/db.ts:223–263`, is fine — a single ORDER BY started_at DESC LIMIT 100, or an FTS `MATCH` with a `WITH matched AS (... LIMIT 100)` to bound the snippet cost.

The cost is not in SQL. The cost is the **N+1 in `enrichSearchResults` (`db.ts:266–308`)**:

```ts
return rows.map((row) => {
  const parent = inferParentInfo(db, row);   // ← per row
  ...
});
```

`inferParentInfo` calls `findParentSession` (`db.ts:310`), which:

```ts
const lookup = db.prepare("SELECT id AS sessionId, title, started_at AS startedAt, path FROM sessions WHERE path = ? AND id != ? LIMIT 1");
for (const candidate of candidates) {
  const parent = lookup.get(candidate, sessionId) as ParentLookupRow | undefined;
  if (parent) return parent;
}
```

For 100 rows that's 100 prepares (`better-sqlite3` does cache, so OK) and ~100–300 single-row `SELECT … WHERE path = ? LIMIT 1` lookups. With a 2.5 GB db and a B-tree index on `path` it adds up.

**Fix.** One JOIN. Build a `parent_path` candidate set in a CTE, left-join to `sessions` once, return both rows together. Or, add a `parent_session_id` column to `sessions` populated at ingest time and just `LEFT JOIN sessions parent ON parent.id = s.parent_session_id`. The latter is the right answer — parent inference is deterministic at ingest, do it once.

Expected result: ~50 ms warm.

### 2. `/api/session` is 10 s cold

`sessionDetails` (`db.ts:437`) returns:
- The session row + the FTS body (~200–600 KB).
- `usage_signals` rows for this session.
- `deriveTranscriptItems(body, usage)` — splits the entire body by regex on every request and recomputes tool/skill counts per turn (`db.ts:496–510`).
- `findLinkedSessions` — three sub-queries (`db.ts:518–544`), each scanning paths.

With 289 turns and 200 KB of body, the regex split + per-turn tool count is the bottleneck. The body itself comes from `sessions_fts` (an FTS5 table) — column reads from FTS5 require uncompressed reconstruction of the indexed content, which is genuinely slow on a cold cache.

**Fixes, cheapest first.**
1. **Stop reading the body from `sessions_fts`.** Store the original transcript path on `sessions.path` (already done), and read the file directly with `readFile` in the API. FTS5 should be the search index, not the document store.
2. **Pre-derive transcript items at ingest time.** Cache them in a `transcript_items(session_id, idx, role, content, tool_count, skill_count)` table. Per-session detail then becomes a single indexed range scan.
3. **Stream the response.** A 303 KB JSON blob is fine; the issue is that nothing is sent until everything is computed. If the page can render the header + stat strip first (cheap query) and then progressively load transcript chunks, the perceived load time drops to ~500 ms.
4. **Send `Cache-Control: max-age=…`.** The transcript is immutable. The browser should not refetch on back-button navigation.

### 3. Cold-start variance

Even after rebuild, the first hit on each endpoint takes 2–5× warm. This is OS file cache rather than the app, but it means the very first page view feels slow even when "warm" feels fine.

**Fix.** Run a warm-up query at startup: a single `SELECT COUNT(*) FROM sessions` plus a `SELECT * FROM sessions_fts LIMIT 1` to prime the page cache. ~50 lines, big perceived-perf win.

## Other perf notes

- `bm25(sessions_fts)` is exposed by FTS5 but the search query does not surface it as a column. Adding it costs nothing and gives the search drawer a real `matchScore`. (Done in the data-truthfulness worktree.)
- `/api/filters` returns 39 KB of cwd strings. With 500-cap that is fine, but it is fetched on every page load. Could be cached client-side and `If-None-Match`-validated.
- The `usage_signals` query (`/api/usage`) is the cleanest endpoint and the fastest — proof the architecture *can* be fast.
- The transcript renderer (`client.ts`) blits all 289 turn DOM nodes at once. With heavy turns this should be virtualized; 289 doesn't justify a full virtual list, but a "render in chunks of 50 with `requestIdleCallback`" would smooth the scroll.

## Score

**Server perf as-is: 4 / 10.**
**Server perf if the two fixes ship: 8 / 10** (search ~50 ms, session detail ~500 ms cold).
**Frontend perf: 7 / 10.** Bundle is small, no framework, but no virtualization, no caching, ~289-node DOM blit on every session.

## What "amazing" would look like

- Search results in <100 ms warm.
- Session detail header + stats in <200 ms; transcript streamed in.
- Usage chart already there.
- An indexer that runs in the background so the DB stays warm.
- A persistent `Last-Modified` on every endpoint.
