# Mobile responsiveness

Tested at 390 × 844 (iPhone 15 viewport).

## What's on the screen

**Search page mobile.**
- Top: sidebar collapses to a slim header bar — `>_` brand mark + "Session Review" wordmark, hamburger ☰ button on the right.
- Page heading "Sessions / Evidence table" stacks under it.
- The toolbar reflows: Filters button → All projects dropdown → Search input, each on its own full-width line.
- Below: the evidence table, which has `min-width: 900 px` on `main` — so on a 390-px viewport it horizontally scrolls. AGENT, TASK, and the start of PROJECT are visible; the rest is off-screen.
- The featured row's drawer wraps under it with each section stacking single-column.

**Mobile nav open.**
- Hamburger becomes ✕.
- Sidebar slides over (or replaces) the main content. "Sessions 100+" and "Tools" appear, with "More fea… 8" beneath. The Sessions badge renders as `—` (em-dash) instead of `100+` in the captured screenshot — appears to be a CSS overflow rendering bug (`min-width:0` on the badge plus `text-overflow: ellipsis` on a too-narrow container).

**Session detail mobile.**
- Header same as desktop (title, meta strip).
- The 4-stat strip stays 4 across — 289 / 50 / 21 / 26 — readable but tight.
- Transcript controls toolbar wraps to three rows: `Lines/turn 18 + Apply`, then `Expand all + Collapse all`, then `All types ▽ + Expand type + Collapse type`. Functional, busy.
- Path strings break across many lines with character-level wrapping.

## What works

1. **Hamburger nav with ARIA** — `aria-expanded`, glyph swap, body class toggle. INV-3+4 fix.
2. **Stat strip stays 4-up.** The numbers shrink but the rhythm holds.
3. **The Pi sidebar disappears on mobile** (`grid-template-columns` collapses), leaving the transcript full-width. Right call.
4. **Mobile breakpoints exist and are intentional.** `@media (max-width: 720 px)` is real and styled.

## What fails

1. **Evidence table requires horizontal scroll.** `min-width: 900 px` (relaxed in the polish branch but still 900 even there) means 390-px users always scroll horizontally. A native mobile pattern would be card-per-result, with each card showing title / project / relation / activity stacked. HIGH.
2. **Sessions count badge renders as `—`** when collapsed nav is open. (See screenshot 09.) Text overflow on a too-narrow flex item; needs a `min-width: max-content` or removal of the truncation rule on the badge. MED.
3. **"More fe…" truncation in nav** is visible on every viewport — even on the desktop sidebar — but it's worst on mobile where it's the only visible thing. Either widen the disclosure or use a tooltip + icon. MED.
4. **Path strings wrap mid-character** with hyphens between every segment break. A `direction: rtl; text-align: left; unicode-bidi: plaintext` middle-truncate (or a custom JS that shows `/User/alex…/pka-19-connector-hub-polish`) would be cheaper to scan. LOW.
5. **Transcript controls feel cramped.** Six controls do not need three rows on mobile — collapse "Expand type / Collapse type" behind the type-select, drop "Lines/turn + Apply" into a `<details>` "Display options". LOW.
6. **The detail drawer's 4-column grid stacks vertically.** Works, but the column order (SESSION ID → PATH → TOP TOOLS → TOP SKILLS → LINKED) means the tools/skills appear after a long path block. Re-ordering on mobile so the data-rich blocks come first would respect attention. LOW.
7. **No bottom-tab navigation alternative.** On a phone, tab-switching from the hamburger requires two taps. A persistent bottom bar with Sessions / Tools would be one tap. LOW.
8. **Pi chat is hidden on mobile.** Functionally fine — there's no good place for a 360-px sidebar at 390 px wide. But there's no affordance to reach it (e.g. a floating chat button). On mobile the Pi feature is silently absent. MED.

## Score

**Mobile-readiness: 5 / 10.** It loads and is usable; horizontal scroll on the table and the missing Pi affordance are the two big gaps.
