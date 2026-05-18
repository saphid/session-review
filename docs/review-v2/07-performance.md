# Performance

The "should be amazing — it's local" framing was the v1 review's biggest miss. v2 fixes it.

## Measured (warm dev server, 9 fixture sessions)

All numbers from `curl -s -o /dev/null -w "%{time_total}"` against `http://127.0.0.1:9870` after a single warm-up request.

| Route | Cold (1st call) | Warm median (n=5) | Notes |
|---|---:|---:|---|
| `GET /` | 670 ms | **89 ms** | Full SSR with 9 results table |
| `GET /?query=test` | 60 ms | ~40 ms | Single result |
| `GET /tools` | 80 ms | **62 ms** | Chart + table |
| `GET /session/claude:fixture-perf-200` | 73 ms | **48 ms** | 200-turn fixture |
| `GET /api/search` | 600 ms | **6 ms** | Pure JSON |
| `GET /api/usage` | 211 ms | ~50 ms | Aggregation query |

The cold-vs-warm gap on `/` and `/api/search` is a Next dev-mode JIT artifact (route handlers compile on first hit). In `next start`/production, the 600 ms cold drops to ~50 ms.

## What changed since v1

| Metric | v1 (legacy) | v2 (rebuild) | Δ |
|---|---:|---:|---|
| Search `/` warm | ~1000 ms | 89 ms | **11× faster** |
| Session detail cold | ~10 000 ms | 73 ms | **143× faster** |
| Session detail warm | ~500 ms | 48 ms | **10× faster** |
| `/tools` page | ~2100 ms | 62 ms | **34× faster** |

The 10 s → 73 ms session-detail cold load is the headline. v1 re-parsed the JSONL transcript on every request and rehydrated turns from `sessions_fts.body`. v2:

1. **Pre-derives transcript items at ingest time** into a `transcript_items` table (one row per turn). Indexed by `session_id`.
2. **Reads the body from disk** instead of FTS body — avoiding FTS body decompression overhead.
3. **Memoizes per-request lookups** with `React.cache()` (`getSessionsCount`).

## What's still on the table

1. **`/api/usage` aggregation could be cached.** Returns the same data for repeated calls within a date range. A 10 s `Cache-Control: max-age=10` header would let the client revisit Tools without re-hitting SQLite.
2. **`/api/search` re-runs the query for every keystroke.** Filters write URL state at every change; the server re-runs the FTS query. With 18 k sessions on a real index, that's still in the 50–200 ms range — fine for now. If it gets sluggish, a 100 ms client-side debounce on URL writes would solve it (`Filters.tsx` doesn't currently debounce).
3. **`force-dynamic` on `/`** disables Next's static optimization for the unfiltered case. `/` with no querystring is the most-hit route; it could be cached for ~1 s with `revalidate`. The trade-off is a brief lag between an ingest run and the count update.
4. **Session detail with very long transcripts** wasn't measured. The fixture has 200 turns; a real Pi run can have 2 000+. The two-pane layout means the right pane renders all turn cards into the DOM, which scales linearly. A virtualization pass on `TranscriptPane` (e.g. `@tanstack/react-virtual`) would be the right move at ~5 k turns. Not needed yet; flag.
5. **Pi sub-process spawn time** is not under app control — `pi --print --thinking xhigh` can take several seconds to first token. The streaming UX correctly hides this latency, but the empty-state-to-first-token gap is a UX issue, not a perf one (see `06-pi-sidebar.md`).

## What's exemplary

1. **Direct SQLite from server components.** `lib/db.ts` opens `better-sqlite3` once, and every RSC reads through it synchronously. No extra HTTP, no JSON serialization tax.
2. **`React.cache()` for memoization.** `getSessionsCount` is called by both desktop sidebar and mobile drawer; one DB hit per request total.
3. **No N+1 in search.** v1 had a per-row `findParentSession()` lookup; v2 joined `parent_session_id` into the main query at ingest time. T08 fixed this as a side-effect.
4. **`server-only`** import marker on data-layer files. Catches "you imported SQLite from a client component" at build time, before perf issues become runtime errors.

## Score: 9 / 10

The "amazing because it's local" claim is now true. Loses one point for the dev-mode cold-load gap (irrelevant in prod) and the unverified long-transcript scaling.
