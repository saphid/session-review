# Accessibility

`PRODUCT.md` sets the bar honestly: "accessibility is not a current product priority, but the UI should avoid choices that would make later accessibility work expensive." This review measures against that bar — *what's the next-easiest a11y improvement, and what would be expensive to retrofit?*

## What's in place

1. **`aria-sort` is honest.** `<SortableTh>` writes `"ascending" | "descending" | "none"` to active and inactive columns. Renders an arrow that matches. Most apps get this wrong; v2 gets it right. (`apps/web/components/search/ResultsTable.tsx:264-291`)
2. **Real `<button>` inside the `<th>`** — keyboard users get Tab+Enter on column sort. `focus-visible:outline-none focus-visible:ring-2` fires the ring on keyboard focus only.
3. **Resizable Pi sidebar uses `role="separator"`** with `aria-valuenow/min/max`, `aria-orientation="vertical"`, `aria-label="Resize Pi sidebar"`, `tabIndex={0}`, and arrow-key resizing. (`PiSidebar.tsx:308-321`) This is the textbook ARIA pattern — most apps using `<div onMouseDown>` don't even attempt it.
4. **`<table>` has `aria-label="Sessions results"`** and `<thead>`/`<tbody>` semantics. Sortable buttons are inside cells; provider glyphs use `aria-hidden="true"` with a `<span class="sr-only">` for the actual provider name.
5. **Mobile nav** uses `aria-controls="mobile-nav-drawer"` (per the `review-v2-shots.mjs` selector). Worth verifying that the drawer itself has the matching `id` and `role="dialog"`.
6. **ESC closes the row drawer.** Document-level keydown listener tied to `expandedRowId`. (`ResultsTable.tsx:84-91`)
7. **`<details>/<summary>` for advanced filters.** Native disclosure, native keyboard handling.
8. **Reduced-motion**: not tested but `globals.css` doesn't pin any animations that would offend. `@media (prefers-reduced-motion)` would still need an explicit pass.
9. **`prefers-color-scheme`**: dark mode is mandatory per `PRODUCT.md` and `DESIGN.md`. There is no light-mode and that's a deliberate product decision, not an a11y miss.

## What's missing or weak

1. **Focus ring contrast.** `--shadow-focus: 0 0 0 2px rgba(122,162,255,0.55)` is OK on `--color-canvas` (#0b0d11) but loses contrast on `--color-surface-low` (#101218). 55% alpha on a 122-blue against a dark blue-gray is borderline WCAG AA for non-text. Bump to 3 px / 75% alpha. ~5 minutes.
2. **`<tr>` row-click target ambiguity.** `tabIndex={0}` + `aria-expanded` lets keyboard users reach the row, but there's no `role="button"` to announce it as activatable. AT users hear "row, expanded" but not "button, click to expand." Add `role="button"` or commit to a separate "open" affordance and remove the row click. ~15 minutes.
3. **Provider glyph is `aria-hidden`** but the cell offers no other readable text; a screen reader reads only "session-review batch 16 Jan 2026 8.2k tok 100 tools." That's accurate but the provider name is a load-bearing column. The `<span class="sr-only">{row.provider}</span>` is in the same cell; verify it's actually announced (mac VoiceOver sometimes skips zero-width sr-only when neighboring elements are aria-hidden).
4. **`<select>` for AGENT and BATCH MODE** is a native form control — accessible but ugly. The styled custom dropdown replacement (if you do it) needs to maintain `role="listbox"` + arrow-key handling. Note: native is usually better than custom for a11y.
5. **No skip-to-content link.** A `<a class="sr-only-focusable" href="#main">Skip to results</a>` at the top of `<body>` would let keyboard users bypass the left sidebar. ~5 minutes.
6. **`<h1>` placement.** `Topbar` renders the page title, but I didn't verify it's an `<h1>` — should confirm. For `/session/[id]`, the session name should be the only `<h1>`.
7. **Tooltip-only affordances.** The `?` next to "0/0 source files" is a tooltip; it's not keyboard reachable as documented (`Read` showed no `aria-describedby` wiring). Fix with `<button aria-label="What are source files?">?</button>` + a popover. ~30 minutes.
8. **`aria-live` for streaming Pi answers.** When a Pi answer streams in, screen readers don't get notified. Wrapping the active assistant bubble in `<div aria-live="polite" aria-busy="true">` would announce it. ~10 minutes; test for over-chatter.
9. **Color-coding tools chart.** Two of the chart series are visually similar cyans (`#7aa2ff` chart-1 and `#22d3ee` chart-6); a colorblind user (deuteranopia) would struggle. Add pattern fills as a defensive layer, or pick a more distinct palette. ~30 minutes.
10. **Pi sidebar resize handle** has `tabIndex={0}` but it's only a 1 px-wide visual line. The hit target is fine for mouse (cursor changes to col-resize) but visually invisible until hover. Add a `:focus-visible` style that thickens it to 4 px. ~5 minutes.

## What would be expensive to retrofit

Nothing structural. The component layout is semantic (real `<table>`, real `<details>`, real `<button>`s, real labels), so the upgrades above are all <30 minutes each. The expensive a11y miss would have been "everything is `<div onClick>`" — and the rebuild explicitly avoided that.

## Score: 7 / 10

Better than v1 (6.5), kept by the honest `aria-sort` and the proper `role="separator"` on the resizer. Loses points for the focus ring contrast, missing skip-link, missing `aria-live` on streaming, and the row-click ambiguity. None are blockers; all are quick fixes when the product earns the priority.
