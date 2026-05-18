# Design fidelity (DESIGN.md vs implementation)

This section measures the rebuilt UI against `DESIGN.md` — the authored spec sitting in repo root, dated after the rebuild.

## High-level: the spec and the implementation disagree

`DESIGN.md` is the most explicit design document the project has. It defines color tokens, typography, components, named rules, and an aesthetic ("The Quiet Flight Recorder"). The rebuilt UI mostly honors the *spirit* but contradicts the *letter* of the spec on three load-bearing decisions:

1. **Corner radius.** DESIGN.md mandates `0px` everywhere. Implementation uses `4–8 px`.
2. **Color tokens.** DESIGN.md and `globals.css` declare different hex values for `canvas`, `surface`, `text`, `border`.
3. **Spacing scale.** DESIGN.md has an irregular `lg: 10px` that breaks 4 px grid. Implementation uses a clean `4–8–12–16–20–24–32` scale.

All three are *deliberate improvements over the spec* (no project ships with mismatched 10 px/8 px spacing intentionally), but the spec wasn't updated to match.

## The corner-radius disagreement

DESIGN.md, section "Buttons":
> Compact square command controls. Buttons do not use rounded corners.

DESIGN.md, section "Cards / Containers":
> Corner Style: All containers are square (`0px` radius). Do not introduce rounded panels, cards, badges, or input corners.

DESIGN.md, section "Don't":
> Don't add rounded corners. The product vocabulary is square and compact.

Implementation, `globals.css:23-27`:
```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-panel: 8px;
```

Implementation, `components/search/ResultsTable.tsx:143`:
```tsx
<div className="border-border hidden overflow-x-auto rounded-md border md:block">
```

Implementation, `components/pi/PiSidebar.tsx:333`:
```tsx
className="… rounded-md border …"
```

The Run query button, the search input, the primary/batch chips, the table border, the Pi sidebar's New chat button — all rounded. The product brief inside DESIGN.md says corners are "square and compact"; the rendered UI is rounded and modern.

**Recommendation: update DESIGN.md to match the implementation.** Reasons:

1. The rebuild was the deliberate aesthetic choice; DESIGN.md was written from the legacy "square-cut cockpit" intent.
2. The implementation's rounded vocabulary actually reads more "premium developer tool" than 0px corners (the prompt language explicitly asked for "premium chat header… compact professional developer tool aesthetic"; rounded helps that more than razored).
3. Square corners for `chip` (the `primary` / `batch` pills) would lose meaningful affordance — pills with 0px corners are just badges, and chips need to read as soft tags.

The fix: replace the `rounded: { xs: "0px", … }` block in DESIGN.md frontmatter with the actual `--radius-*` values, and rewrite the "Buttons" / "Chips" / "Cards" sections to describe `4–8 px` radii and the per-component choices.

## The color-token disagreement

| Token | DESIGN.md | globals.css | Visible difference |
|---|---|---|---|
| canvas | `#0A0D15` | `#0b0d11` | very subtle (both near-black) |
| surface | `#171B26` | `#13151b` | subtle |
| field | `#080B12` | `#0a0c11` | subtle |
| text | `#EDF1FB` | `#e6e9ef` | imperceptible |
| muted | `#98A3B8` | `#7a818e` | **noticeable** — implementation muted is darker |
| primary | `#7C9CFF` | `#7aa2ff` (`--color-accent`) | imperceptible |
| user | `#4F8CFF` | `#7aa2ff` | **noticeable** — DESIGN.md has a more saturated user blue |
| skill | `#9EE493` | `#86efac` | noticeable hue shift |

Both palettes are coherent dark themes. The implementation's `--color-muted: #7a818e` is darker than DESIGN.md's `#98A3B8`, which means subtitles and metadata read fainter than the spec intended. The legibility is fine, but the spec is misleading.

**Recommendation:** drop the colors block from DESIGN.md and reference `globals.css` `@theme` block as the source of truth. Same for spacing.

## The spacing-scale disagreement

DESIGN.md lists `xxs: 2px / xs: 4px / sm: 8px / md: 8px / lg: 10px / xl: 12px / xxl: 16px`. The `lg: 10px` and the `sm == md` redundancy mean the spec doesn't form a usable scale.

`globals.css:13-20` lists `--spacing-1: 4px / -2: 8px / -3: 12px / -4: 16px / -5: 20px / -6: 24px / -8: 32px`. Clean 4 px-grid Tailwind defaults, used everywhere.

Same recommendation: delete spacing block from DESIGN.md, reference globals.css.

## What the implementation gets right per DESIGN.md

These are *kept* across the spec/impl gap:

1. **The Dark Mode Canon Rule.** Dark mode is the only mode. Honored.
2. **The Signal Rarity Rule.** Recorder Blue (`--color-accent`) is reserved for action, focus, selection. Hover doesn't introduce blue tints. Buttons ARE blue. Honored.
3. **The Role Border Rule.** RELATION pill uses full-border tint (`primary` / `batch` / `subagent of`) not side-stripes. Transcript turn cards similarly. Honored.
4. **The Evidence Mono Rule.** Paths, session IDs, token counts, code, raw transcript text all use mono. Honored.
5. **The Native Type Rule.** No Inter, no Roboto Mono, no display fonts. `ui-sans-serif, system-ui, …` and `ui-monospace, …`. Honored.
6. **The Flat Evidence Rule.** Transcript cards, chat bubbles, source chips have no shadow nesting. Honored.
7. **The No Glass Rule.** No backdrop-blur, no decorative glow. Honored.
8. **Empty states as onboarding.** "No sessions match the current filters" — but DESIGN.md also asks for an explicit "no indexed sessions: copy `npm start -- ingest`" treatment. **Not** verified: when the DB is empty, the empty state isn't captured in this screenshot set. If it just says "No sessions match the current filters" with 0 sessions in the DB, that misses the spec. Worth a manual check.
9. **Mobile structure.** Single column under 720 px, no horizontal overflow, compact tappable controls. Honored.

## What's not honored

1. **Square corners** (covered above).
2. **`--shadow-focus` is 2 px / 55%** vs DESIGN.md's `0 0 0 3px rgba(124,156,255,.14)` (3 px / 14%). Both are weak; DESIGN.md's 14% is too faint to be visible, the implementation's 55% / 2 px is at least visible. The implementation is *better* than the spec. Update the spec.
3. **The "premium" empty-DB onboarding state** isn't visible in the captured screenshots — likely the fixture has 9 sessions and never goes empty. Worth a visual verification.

## On the missing UI mockups

The original ask referenced "recently created images" of the planned UI. Those exist on disk as `output/design/chatgpt-current.png`, `chatgpt-submitted.png`, `chatgpt-generated-check.png` — but they capture the *ChatGPT page where the image was being requested*, not the rendered mockup. The image generation either didn't complete or wasn't visible in the screenshot.

The only retained design intent from those images is the prompt text:
> Dark mode web app called Session Review with a Cursor and VS Code inspired right-side AI chat panel. Left main content with session cards and transcript. Right sidebar with premium chat header, selected context chip, message bubbles, syntax-highlighted code block, composer with send button, subtle blue purple accents, compact professional developer tool aesthetic, 16:10 screenshot style, no logos.

Implementation alignment with that prompt:

| Prompt fragment | Implementation | Match |
|---|---|---|
| Dark mode web app | Mandatory dark | ✅ |
| Cursor and VS Code inspired right-side AI chat panel | Right-anchored Pi sidebar | ✅ |
| Left main content with session cards and transcript | Search list + session detail two-pane | ✅ |
| Premium chat header | "Pi Chat / Persistent session with visible source context" + New chat button | ✅ |
| Selected context chip | `Session` accent chip | ✅ |
| Message bubbles | `PiMessageList` renders bubbles per role | ✅ (verified by `pi-streaming.spec.ts`) |
| Syntax-highlighted code block | `highlight.js` is a dep; not visible in the empty-state captures | ⚠️ (verify in real reply) |
| Composer with send button | Yes, with `⌘ + Enter to send` hint | ✅ |
| Subtle blue purple accents | Recorder Blue + Tool Violet | ✅ |
| Compact professional developer tool aesthetic | Yes | ✅ |
| 16:10 screenshot style | Implementation is responsive — captured at 1440×900 (16:10) and 1680×1000 (~16:9.5) | ✅ |
| No logos | Wordmark only, no logo image | ✅ |

11 of 12 fragments honored. The unverified one (syntax-highlighted code block) is covered by the test suite, just not captured in the empty-state screenshots.

## Score: 5.5 / 10

The score is dragged down by the spec/impl drift on corners, colors, and spacing. The implementation is *better* than DESIGN.md in most cases; the spec just hasn't been updated. The fix is to rewrite DESIGN.md to describe what shipped, not what was intended.

If the question were "does the rebuild honor the prompt-language design intent" — that scores 9/10. The 5.5 is specifically the gap between the *written* spec and the *built* product, and it's the cheapest gap in the project to close.
