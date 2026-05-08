# Usage page

URL: same SPA root, `Tools` tab in the sidebar (`#usageTab`). Reveals the `#usagePanel` section.

## What's on the screen

**Header.** Page title becomes "Tools" + "Usage signals" subtitle. The toolbar's Filters / project / search controls are NOT dimmed here — they DO scope the chart. Good.

**`TOOL & SKILL USAGE` panel.**
- Toolbar above the chart (INV-7+8 fix): `Signal: Tools ▽` + `Bucket: Day ▽`.
- Status line: `200 signals · 1192 data points · 187ms` — `<p role="status">`. Honest about query cost.
- Chart: stacked bar chart, log-scale Y axis (0.1 → 50,000), 110+ daily buckets across ~3 months. 8 colour-coded series (Command, Exec Command, Write Stdin, Chunk, Apply Patch, Read, Bash, Wait Agent).
- HTML legend below the chart: 8 swatches with names, in a single row. `aria-label="Chart legend" role="list"` (INV-7+8).
- Below that, a tabular breakdown: `Name | Uses↓ | Sessions`, sorted by Uses descending. (e.g. Command 232,063 / 1,163 sessions.)

## What works

1. **Toolbar is right where it belongs** — signal/bucket above the chart, not buried in Advanced filters. INV-7+8 fix is a clear win.
2. **Status line is the honest pulse.** Query cost in milliseconds is rare in modern UIs and the right call for a developer-facing tool.
3. **Log scale.** With Command and Exec Command at >200k uses and rarer tools at single digits, log scale is essential. Done correctly (INV-D).
4. **HTML legend instead of Chart.js's canvas legend.** Keyboard-accessible, screen-reader-readable, INV-7+8.
5. **Humanized names.** "Exec Command" rather than `exec_command`, "Wait Agent" rather than `wait_agent`. Reads naturally.
6. **The bottom table is sortable** ("Uses↓" indicates active sort). One-click pivot from chart to detail.
7. **Server perf is good here.** `/api/usage` returns 96 KB in 70-260 ms. SQL is doing real work — `usage_signals` aggregations — and it's fast.

## What fails

1. **No drill-down from the chart or table.** Clicking "Bash" in the legend should filter to "sessions that used Bash." Clicking a date bar should jump to "sessions on this day." Currently the chart is a read-only artifact. MED.
2. **Bars are 1px wide on a wide screen.** 110 days × 8 stacked series at 1380 px viewport = unreadable bars. With `bucket=week` it's better; the default could be smarter (auto-pick day vs week based on date range). MED.
3. **"Apply Patch" colour collides with neighbours.** The yellow/green/teal portion of the palette has at least two confusable greens. Worth re-keying with a distinguishable scale (e.g. ColorBrewer's Set2). MED.
4. **The tooltip on hover is Chart.js default.** Workmanlike but bland. With sub-second queries available, a custom tooltip showing "8 sessions, top: Bash 14, Edit 12 …" would convert the chart from a glance into a probe. LOW.
5. **No top-N cap on the table.** With 200 distinct tools the long tail is dead weight; "Show more" or a top-20 default would calm the page. LOW.
6. **No CSV / JSON export.** This is the kind of view a developer naturally wants to take to a notebook. A "Copy as CSV" button would be a five-line addition. LOW.
7. **Bucket has only Day / Week.** Month / Year for long-term comparison would help on a multi-year corpus. LOW.

## Score

**UI quality: 7.5 / 10.** Toolbar position, legend, status line, log scale, sortable table — nearly everything that *exists* is good.
**Story coverage: 6 / 10.** The chart is read-only; you can see the trend but you can't pivot.
**Performance: 9 / 10.** Sub-second on a non-trivial aggregation.
**Composite: 7.5 / 10.** The strongest of the three pages.
