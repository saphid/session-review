# Accessibility

## What's been done well

The INV-1..8 inventory pass clearly cared about a11y. From the source on `main`:

- **Native semantics where they belong.** Anchor titles are real `<a>` tags (`client.ts:.task-title`); copy/Pi actions are `<button>`s. The earlier wrapper `role="button"` div around the row was removed in INV-1+2.
- **`aria-label` on every row.** Each result row gets `aria-label="Session: <title>"` for screen readers (`client.ts:427`).
- **`aria-current="page"` on nav.** `setTab` writes `aria-current="page"` on the active tab and `"false"` on the inactive (the latter is non-spec — the data-truthfulness worktree fixes this to `removeAttribute`).
- **`role="status"` on the usage status line.** Polite live region, count and elapsed time announced (`#usageStatusLine`, INV-7+8).
- **`role="separator"` on the resize handle.** With `aria-valuenow` updated as you drag, and Arrow / Home / End keyboard support (`client.ts:183`). INV-7+8 fixed `aria-valuemin/max`.
- **HTML chart legend instead of canvas legend.** `#chartLegend.chart-legend-html role="list"` with focusable `.legend-item`s (INV-7+8).
- **Provider avatars carry `aria-label`.** `agent-avatar--pi` etc. with `aria-label="<provider> agent"`.
- **Linked-card avatar `aria-label="Open linked session …"`** (INV-7+8).
- **Mobile hamburger toggles `aria-expanded`** and swaps glyph `☰`/`✕` (INV-3+4).
- **Filter button shows active state via class + dot**, not colour alone.
- **Tab-able inputs throughout, with no positive `tabindex`.**
- **Skip-to-content?** No — but on a single-pane SPA without much chrome, less critical.
- **Focus rings.** On `main` they exist but are very faint (`rgba(124,156,255,.14)` — basically invisible). The polish worktree raises this to `.55` opacity, which is the right level. On `main`, focus visibility is the single biggest a11y gap.

## What's still off

1. **`aria-current="false"` is not spec.** ARIA defines `aria-current` as a token enum; the standard pattern is to set the attribute on the active item only and remove it from the inactive ones. Writes still announce "false" on some assistive tech. (Fixed in worktree.) MED.
2. **Sortable headers have `aria-sort` set, but no click handler on `main`.** A keyboard user pressing Enter on a sortable header gets no feedback because the click handler doesn't exist. The `aria-sort` value is a lie. HIGH on a screen reader. (Fixed in worktree.)
3. **Focus rings barely visible on `main`.** On the dark theme, a 14% opacity blue ring on a near-black surface is a contrast failure. (Polish worktree raises to .55 / .28 soft.) HIGH.
4. **Match column tooltip lies.** The `[title]` claims "Relevance score 0–1. Higher = stronger keyword and semantic match." but the value is hash-derived. A screen-reader user is being deceived more than a sighted user (who at least sees the numbers all cluster around .85–.92). HIGH.
5. **Chart bar hover lacks ARIA.** Chart.js renders to canvas; the underlying values are announced only in the HTML legend, not on hover. The `<canvas>` should at minimum have an `aria-label` describing the chart. MED.
6. **Long path strings wrap mid-character.** `WORKING DIRECTORY` and `TRANSCRIPT PATH` use `word-break: break-all` (or similar), which screen readers read awkwardly character by character. A `aria-label` with the path and `aria-hidden="true"` on the wrapped visual could clean this up. LOW.
7. **`>_` brand mark has no text label.** A screen reader reads it as "greater-than underscore." Wrapping the existing brand link with an `aria-label="Session Review home"` would fix it. The wordmark next to it is text, so this is not a blocker, just untidy. LOW.
8. **Touch targets are 30 px in the redesign worktree** — borderline for WCAG 2.5.8. `main`'s default 36 px is fine; the redesign needs to bump back to 32–34 minimum. (Flagged in redesign review.) MED for that branch.
9. **Colour is the only difference for several states.** Match pill colour (green ↔ orange ↔ red), relation pill colour (subagent orange ↔ primary grey). Pair colour with shape or icon for colour-blind users. LOW.
10. **`<details>` elements with custom summaries** generally work for screen readers, but the "More features (8)" disclosure announces "More features (8) collapsed details" — verbose. A short `aria-label` on the summary would help. LOW.

## Score

**a11y on `main`: 6.5 / 10.** Strong intent; faint focus rings, dishonest `aria-sort`, fabricated tooltip drag the score down.
**a11y if polish + data-truthfulness worktrees ship: 8 / 10.**
