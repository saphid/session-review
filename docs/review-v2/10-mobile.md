# Mobile

## Screenshots

- `output/screenshots/review-v2/09-search-default-mobile.png` — search page at 390×844.
- `output/screenshots/review-v2/10-search-mobile-nav-open.png` — same with the nav toggle clicked.
- `output/screenshots/review-v2/11-session-detail-mobile.png` — session detail at 390×844.

## What works

1. **Card layout under 720 px.** The desktop `<table>` is `min-width: 1060px` and would force horizontal scroll on a phone. `ResultsTable.tsx` renders both the table and a `<ResultCard>` list, with `md:hidden` / `hidden md:block` flipping which one is visible. T16 closed v1's biggest mobile fail.
2. **No horizontal scroll.** `globals.css` adds a defensive `overflow-x: hidden` on `body` under 720 px (`globals.css:106-110`). Belt-and-braces — the card layout removes the cause, the body rule prevents any future regression.
3. **Pi sidebar absent on mobile.** `PiSidebar` is `hidden … md:flex` so it doesn't waste screen real estate on a phone. Right call — the right-anchored chat panel is desktop-native.
4. **Hamburger toggle in the top-right** opens a drawer. The button has `aria-controls="mobile-nav-drawer"` (per the e2e shot script's selector).
5. **Session detail collapses cleanly.** Stat strip becomes a 2×2 grid, paths stack vertically, the two-pane transcript drops the gutter and renders only the right-pane turn cards. Readable on a 390 px viewport.
6. **Touch targets**: `Open` CTAs and Pi/copy buttons in the card are tall enough to tap (~40 px hit area).

## What's broken or weak

1. **The nav toggle didn't open the drawer in `10-search-mobile-nav-open.png`.** The screenshot is byte-identical (within compression noise) to `09-search-default-mobile.png` — same layout, no visible drawer overlay. The `review-v2-shots.mjs` selector is `button[aria-controls='mobile-nav-drawer'], [data-mobile-nav-toggle], button[aria-label*='nav' i], button[aria-label*='menu' i]` and it appears to have matched (the script doesn't error). Two possibilities:
   - The toggle button matched on `aria-label` (e.g. `"Open menu"`) but the drawer uses a different `id` than `mobile-nav-drawer` and never receives the open trigger.
   - The drawer opens but is rendered fixed at `inset-0 z-50` *under* the visible area on the captured viewport, and the screenshot didn't pick it up.
   Worth a manual verification: open `localhost:8765` on `390×844` in DevTools and click the hamburger. Possible 30-minute fix.
2. **Sidebar count badge.** The desktop sidebar shows `9` next to "Sessions"; the mobile drawer should match. Untested in this capture.
3. **No swipe-to-dismiss on the mobile drawer.** Touch-native UX would expect a swipe-left gesture to close. Current implementation (presumably) requires tapping outside or the X. Polish, not a blocker.
4. **Tools page on mobile** wasn't captured in this set. The chart should be full-width and the table scroll independently; verify before claiming the page is mobile-clean.
5. **Card list doesn't show RUN TIME.** The mobile `ResultCard` is denser than the desktop row but drops the date. For an investigator scanning their phone, "when did this happen" is one of the most-loaded columns. Worth adding.
6. **Session detail mobile is missing the gutter.** Trade-off is right (no room for the line list on 390 px), but a "Jump to turn #" affordance would help users navigate a 200-turn transcript on mobile. Could be a `<select>` or a `<datalist>`. ~half an hour.
7. **No bottom-tab navigation pattern.** The hamburger is fine but a 3-tab bottom nav (Sessions / Tools / Pi) would be more native to phones. Defer — depends on whether mobile becomes a real usage mode or stays a nice-to-have.

## Performance on mobile

Not measured directly — Playwright's mobile spec confirms function but not Web Vitals. Worth running Lighthouse against `npm run dev` in mobile mode before claiming "amazing because it's local."

## Score: 8 / 10

The big v1 mobile failures (horizontal scroll, table-on-phone, no Pi handling) are fixed. Loses points for the unverified nav drawer behavior and the missing date in card list. Both are quick fixes.
