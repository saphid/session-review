# Code quality

## What works

1. **TypeScript end-to-end.** `tsc --noEmit` passes. Strict types on `SessionRow`, `SessionDetails`, `ProviderId`. No `any` epidemic.
2. **No framework debt.** `package.json` has 4 runtime deps and 5 dev deps. No bundler, no Babel, no Vite, no React. The whole codebase compiles in <2 s.
3. **Provider parsers are isolated.** `providers.ts` has one function per provider, returning a normalized `SessionRow`. Adding a fifth provider is a 60-line patch, not a refactor.
4. **Prepared statements throughout `db.ts`.** Parameterised queries; no string interpolation into SQL. SQL injection-safe by construction.
5. **Lint + typecheck wired.** `npm run check` and `npm run lint` are real, fast, and clean.
6. **The CLI is real.** `cli.ts` exposes `ingest`, `search`, `status`, `derive` — the same code path the web app uses, no duplication.

## What hurts

### `src/web/client.ts` is a 1.7k-line monolith

```
   8 top-level let-bindings    (mutable global state)
  85 top-level functions
   4 different render passes (search, session, usage, pi-chat)
   1 file
```

Specific smells:
- `let activeTab`, `let selectedChatItem`, `let lastSearchRows`, `let piChatId`, etc. — every page renderer mutates this shared bag.
- `setTab`, `syncPanels`, `renderSearchPage`, `renderSessionPage`, `renderUsagePanel`, `renderChatMessages` are all in the same file and call into each other.
- Event listeners are attached inline during render, leading to listener leakage when the same node is re-rendered (no `removeEventListener` paired with the `addEventListener`s in `searchTableNode`).
- Helpers like `displayTitle`, `displaySubtitle`, `runtimeDisplay`, `activityMetrics`, `matchScore`, `relationFor`, `projectLabel` cluster near the top — fine for a 200-line file, painful at 1700.

Recommendation: split into `web/search.ts`, `web/session.ts`, `web/usage.ts`, `web/pi-chat.ts`, `web/state.ts` (the one file that holds the lets), and `web/dom.ts` (escape, copy, format). No bundler needed — ES modules import natively. This costs an afternoon and pays back every change.

### Fabricated data in production code

`client.ts` ships:
- `matchScore` — `stableHash(sessionId)` mapped to 0.86–0.93 (`client.ts:565–595`).
- `activityMetrics.turns` — `(stableHash >> 4) % 60`.
- `activityMetrics.tools` — `(stableHash >> 8) % 12`.
- `runtimeDisplay.duration` — `tokens / 850` clamped to 8–72 m.
- `usageRows()` for the drawer's "Top tools" + "Top skills" — same hash pattern with a hard-coded name list.

Every one of these is presented to the user as a measurement. This is the highest-severity code smell in the repo. The data-truthfulness worktree fixed four of the five; `usageRows()` is still synthetic on every branch.

### CSS in `index.html`

~25 KB of `<style>` inline. The polish-pass review surfaced four token-related issues (radius tokens defined as 0px, two near-identical radius tokens, leaked literal hex/rgba in 19 places, etc.) all of which trace to the same root cause: there is no canonical token surface, no naming convention, no review point. Either:
- (a) extract to `src/web/styles.css` and let the file become its own readable artifact, or
- (b) keep it inline but add a leading comment block defining the token system explicitly.

Either is fine. Doing nothing means every redesign attempt rebuilds the same partial system.

### `server.ts` shells out to `pi`

`runPiPrint` (server.ts:173) spawns the local `pi` binary with arguments built from user input (the `message` field is part of the `prompt` string written to a file, not an argv — so command injection is contained). However:
- The piBin path is `process.env.SESSION_REVIEW_PI_BIN || "pi"` — relies on `$PATH`.
- A failed spawn collapses to `"Failed to start Pi."` with the raw error string in `stderr`. No diagnostic for "binary not found" vs "not executable" vs "exited 127."
- The `--thinking xhigh` flag is hard-coded; not configurable.

### Untracked / one-off scripts

A dozen `tests/probe*.mjs`, `crops.mjs`, `polish-shots.mjs`, `zoom-shots.mjs`, `verify-inv.mjs`, `redesign-shots.mjs`. The session inventory shipped lots of one-off Playwright drivers and most are not deleted afterward. They live in `tests/` next to the one real e2e (`e2e-session-page.mjs`). It's hard to tell which one a future contributor should run. A `tests/` README, or moving one-offs to `scripts/captures/`, would help.

### "Untracked: " commit prefix

Every commit message starts with `Untracked: ` (e.g. `Untracked: Bead INV-7+8 — usage page controls and accessibility`). It looks like an automation artifact from a wrapper script. Not harmful, but readers will wonder.

## Type safety

- `db.ts` has well-typed return shapes for every prepared statement (`as SearchResult[]`, `as RawSearchResult[]`, etc.).
- `server.ts` parses query params through small allowlist functions (`parseProvider`, `parseBatchMode`, `parseTimeBucket`). Date strings are not parsed; bounds aren't enforced on `limit`. Acceptable for a single-user local tool, would not pass a security review for anything multi-tenant.
- `client.ts` has good types on the API responses but lots of inline `any` in event handlers (e.g. `(event: Event) => { const target = event.target as HTMLElement; … }`).

## Tests

- One real e2e: `tests/e2e-session-page.mjs`. Captures search → session-detail → highlight flow. Fragile (depends on a specific seed session id).
- The verify-inv harness is a smoke test, not a fix-quality test (see review).
- No unit tests for `providers.ts`, `db.ts`, `analytics.ts`. These would be cheap and high-value — provider parsing especially is the kind of code that breaks silently when an upstream format changes.

## Score

**Type safety: 7.5 / 10.**
**Modularity: 5 / 10.** client.ts is the biggest weight on the score.
**Test coverage: 3 / 10.**
**Honesty: 4 / 10** (until fabricated metrics are removed).
**Composite: 5.5 / 10.**
