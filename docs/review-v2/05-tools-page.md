# Tools page (`/tools`)

## Screenshots

- `output/screenshots/review-v2/07-tools-desktop.png` — full page at 1440×900 with the tooltip showing the per-tool breakdown for 2026-01-15.

## Description

Reading top to bottom:

1. **Header**: "Tools" 22 px headline, "Tool signals" muted subtitle.
2. **Status line**: `119 signals · 7 data points · 0ms` — count of underlying `usage_signals` rows, count of distinct dates, server-side render time. The `0ms` is honest — the page is RSC, the server time is well under 1 ms after warm-up.
3. **Stacked area / log-scale chart** (full width × ~340 px tall). The Y axis runs from 0.1 to 100 with explicit tick labels (0.1 / 0.2 / 0.5 / 1 / 2 / 5 / 10 / 20 / 50 / 100). The X axis has a single date label `2026-01-15`. On hover, a vertical guide and a card tooltip with each series' value appears: `Bash : 55 / Edit : 3 / Grep : 2 / Lane : 50 / Pipeline : 1 / Read : 6 / Write : 2`.
4. **Legend pills** below the chart: each tool name with a colored dot and a count, in descending order: `Bash 55 / Lane 50 / Read 6 / Edit 3 / Grep 2 / Write 2 / Pipeline 1`. Pills double as filters — clicking a pill toggles that series.
5. **Sortable detail table**: columns `Name / Uses ↓ / Sessions`. Sorted by Uses descending by default. Each row links to `/?tool=name` to drill back into the search.

## What it gets right

1. **Log scale by default.** Tool usage is power-law: bash and lane dwarf the rest by 10–25×. A linear chart would compress the long tail to invisibility. The log scale is the correct default and the y-axis tick density makes it readable.
2. **Toolbar status line is mono.** `119 signals · 7 data points · 0ms` in the same monospace as transcript text. Treats the metadata as evidence, not chrome.
3. **Tooltip alphabetizes.** The hover card sorts series alphabetically (Bash, Edit, Grep, Lane, Pipeline, Read, Write) instead of by value. That's a deliberate readability choice — alphabetical scans faster when you're looking for a specific tool. Worth keeping.
4. **Drill-down works at three points.** Clicking a chart bar segment, a legend pill, or a table row all funnel to a filtered `/`. T15 is well-tested by `usage-drilldown.spec.ts`.
5. **No "card-grid hero stats" anti-pattern.** The page is one chart + one legend + one table — the brief explicitly rejects "enterprise BI dashboards where charts dominate the workflow," and this page honors that by giving the table equal weight.
6. **Sortable table sorts honestly.** Same pattern as the search page — `aria-sort` matches the rendered arrow.

## What it gets wrong

1. **"7 data points" with one X-axis label.** The fixture only has one date with data, so the chart's stacked column shows all the activity in one column. That's a fixture limitation; on real data the chart would be more useful. The `0ms` makes the header read awkwardly with `7 data points` — there are 7 *date buckets*, only 1 of which has data. A more honest phrasing would be `119 signals · 1 active day · 7d window`.
2. **Y-axis labels are visually noisy.** `0.1 / 0.2 / 0.5 / 1 / 2 / 5 / 10 / 20 / 50 / 100` is 10 ticks; the chart would read cleaner with 4 (`1 / 10 / 100`) and minor gridlines for the rest. Let recharts decide the major/minor split.
3. **No date-range picker.** The default is "last 7 days" (presumably). Investigators looking at older activity have no way to widen the window without editing the URL. A small `7d / 30d / 90d / All` toggle pill row would be a useful addition.
4. **Legend pill colors don't match standard accessibility patterns.** Bash (cyan), Lane (green), Read (orange), Edit (red), Grep (purple), Write (cyan), Pipeline (rose). The two cyans are not identical (`--color-chart-1 = #7aa2ff` vs `--color-chart-6 = #22d3ee`) but they're close enough that a colorblind user would struggle. Consider distinct shapes or pattern fills as a defensive layer; current implementation is fine for the canonical user.
5. **No "compare to last week" overlay.** Trend would be more legible with a previous-period overlay (dotted line). Not needed for v2; flag for later.
6. **Hover tooltip shows zeros for missing series.** The fixture has only `2026-01-15` so on other dates the tooltip would presumably show `0` for every tool. A "no data" treatment for empty buckets would be cleaner than `Bash : 0`.

## Mobile

Not captured directly in the screenshot set, but the AppShell stack-to-column rule means the chart should be full-width and the table should scroll independently. Worth verifying with `npm run dev` + DevTools mobile mode; not blocking.

## Score: 8 / 10

This is the most "polished" page in the app — the prior reviewer (v1) called it 7.5/10 and the rebuild kept what worked while wiring the drill-down. Loses points for "7 data points" honesty, dense y-axis ticks, and no date-range picker.
