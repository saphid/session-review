---
name: Session Review
description: Dark local evidence interface for searching and inspecting AI agent sessions.
tokens-source: apps/web/app/globals.css
colors:
  canvas: "#0b0d11"
  surface: "#13151b"
  surface-low: "#101218"
  surface-raised: "#181a21"
  field: "#0a0c11"
  border: "rgba(148, 160, 184, 0.14)"
  border-strong: "rgba(148, 160, 184, 0.22)"
  text: "#e6e9ef"
  text-secondary: "#aab1bd"
  muted: "#7a818e"
  muted-strong: "#9097a3"
  user: "#7aa2ff"
  assistant: "#b6bccb"
  tool: "#c084fc"
  skill: "#86efac"
  system: "#7b8498"
  accent: "#7aa2ff"
  accent-soft: "rgba(122, 162, 255, 0.12)"
  ok: "#86efac"
  warn: "#fbbf24"
  danger: "#f87171"
  code-bg: "#0d1117"
  code-border: "rgba(148, 160, 184, 0.22)"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.07em"
    textTransform: "uppercase"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
radius:
  sm: "4px"
  md: "6px"
  lg: "8px"
  panel: "8px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
shadows:
  ambient: "0 8px 28px rgba(0,0,0,.2)"
  focus: "0 0 0 3px rgba(122, 162, 255, 0.75)"
breakpoints:
  md: "720px"
---

# Design System: Session Review

## 1. Overview

**Creative North Star: "The Quiet Flight Recorder"**

Session Review is a dark-mode-only local evidence interface. It feels like a calm black-box recorder for AI coding sessions: precise, durable, and built for long investigation work. The user is usually trying to recover context, trace a decision, inspect a transcript, or ask Pi about the current screen with source context attached.

The product uses a restrained dark surface vocabulary: opaque panels, full-border role tints, compact controls, source chips, and transcript-first hierarchy. It does not use decorative glass, side stripes, neon glow, metric-card hero layouts, or light-mode defaults. Density is allowed, but the density must be grouped and progressive: primary search first, advanced filters behind disclosure, transcript first, analytics secondary.

It explicitly rejects bright high-key SaaS dashboards, flashy AI landing-page aesthetics, decorative AI magic treatments, enterprise BI dashboards where charts dominate the workflow, overloaded observability screens, provenance-free chat, and soft productivity UI that sacrifices density and control for empty space.

**Key Characteristics:**
- Dark mode is the required canonical experience.
- Transcript evidence comes before analytics.
- Pi answers are framed by visible source context.
- Primary actions and focus use blue sparingly.
- Corners are quietly rounded (`4–8 px`) — enough to read as a modern developer tool, never enough to feel decorative or app-storey.
- Role identity uses full-border tint or badges, never side stripes.
- Mobile adapts structurally: single column, compact touch targets, no horizontal overflow.

## 2. Colors

Source of truth: `apps/web/app/globals.css` `@theme` block. The frontmatter above mirrors those values; if anything drifts, treat `globals.css` as authoritative and update this file.

The palette is a dark forensic cockpit: blue-black neutral surfaces, cold slate text, and a single recurring blue-violet evidence signal.

### Accent
- **Recorder Blue** (`accent` / `--color-accent`): Focus rings, selected outlines, evidence links, source context, primary action background, and active-state emphasis. It is an instrument light, not decoration.
- **Recorder Blue Soft** (`accent-soft` / `--color-accent-soft`): Tinted backgrounds for active state, primary chips, and source-context highlights.

### Role colors
- **User Blue** (`user`): User transcript turns and model-input evidence. Equal to `accent` by design — the user voice is the same blue as the action.
- **Assistant Slate** (`assistant`): Assistant transcript turns.
- **Tool Violet** (`tool`): Tool turns and Pi-related evidence accents.
- **Skill Green** (`skill`): Skill mentions and derived skill signals only.
- **System Slate** (`system`): System, summary, context, and neutral transcript roles.
- **Amber Warn** (`warn`): Search hits, attention states, and subagent-relation pills.
- **Danger Red** (`danger`): Error bubbles in the Pi sidebar; never used for routine state.

### Neutral
- **Canvas** (`canvas`): Page background.
- **Surface / Surface-low / Surface-raised** (`surface`, `surface-low`, `surface-raised`): Panels, sidebars, empty states, and grouped controls. `surface-raised` is the shallowest hover state.
- **Field** (`field`): Inputs, textareas, code wells, and source-chip fills.
- **Border / Border-strong** (`border`, `border-strong`): Hairline separators and focusable-region outlines.
- **Text / Text-secondary** (`text`, `text-secondary`): Main reading text and high-confidence labels (`text`); secondary metadata that still reads as content (`text-secondary`).
- **Muted / Muted-strong** (`muted`, `muted-strong`): Compact labels, hints, status text, and table column headers.

### Named Rules

**The Dark Mode Canon Rule.** Dark mode is the product's native environment. Do not design a light-mode surface unless it is explicitly requested as a separate product decision.

**The Signal Rarity Rule.** Recorder Blue is reserved for action, focus, selection, and evidence anchors. If passive content glows blue, the hierarchy is wrong.

**The Role Border Rule.** Role colors identify evidence categories. They appear as full-border tints, badges, or metadata, never as side-stripe borders.

## 3. Typography

**Display Font:** None. This product does not use display type.
**Body Font:** ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif.
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Consolas, monospace for evidence, paths, counts, commands, code, and session identifiers.

**Character:** The type system is native, quiet, and utilitarian. Sans-serif carries UI structure; monospace is used only where fixed-width evidence improves scanning and trust.

### Hierarchy
- **Headline** (700, `22px`, `1.1`, `-0.03em`): Page titles in the Topbar and `Session details` h1.
- **Title** (600, `14px`, `1.25`): Panel titles, sidebar headings, and grouped-section headings.
- **Body** (400, `13px`, `1.55`): Result summaries, transcript prose, chat bubbles, empty-state text, and form text.
- **Label** (500, `11px`, `1.35`, `0.07em`, uppercase): Table column headers, status lines, legends, and compact metadata.
- **Mono** (400, `12px`, `1.5`): Paths, token counts, source chips, code captions, raw transcript text, and session identifiers.

### Named Rules

**The Evidence Mono Rule.** Monospace is mandatory for paths, commands, code, raw transcript text, token counts, and session identifiers. It is forbidden for generic marketing or decorative headings.

**The Native Type Rule.** Use platform-native sans-serif for the product shell. Do not import a trendy display or SaaS-default brand font for UI labels.

## 4. Elevation

Session Review uses tonal layered elevation. Top-level panels can have a sparse ambient shell shadow. Inner evidence surfaces are flat and separated by value, spacing, borders, and grouping. Blur, glassmorphism, and decorative glows are prohibited.

### Shadow Vocabulary
- **Ambient Shell** (`box-shadow: 0 8px 28px rgba(0,0,0,.2)`): Top-level modules only, such as main panels and the Pi sidebar.
- **Flat Evidence Surface** (`box-shadow: none`): Transcript cards, chat bubbles, source chips, grouped filters, empty states, and nested evidence containers.
- **Focus Ring** (`box-shadow: 0 0 0 3px rgba(122,162,255,.75)`): Keyboard focus and active source selection. Bright enough to clear WCAG non-text contrast on `surface-low`.

### Named Rules

**The Flat Evidence Rule.** Evidence surfaces do not float inside other surfaces. Use a border, spacing, and tonal contrast instead of another shadow.

**The No Glass Rule.** Backdrop blur and decorative glass panels are forbidden. This app is a local recorder, not an AI landing page.

## 5. Components

### Buttons
- **Shape:** Compact command controls with `radius.md` (`6px`) corners. Just enough rounding to read as modern.
- **Primary:** `accent`/`accent-soft` background, bright text, semibold label, compact padding (`px-3 py-1.5` or equivalent). No decorative gradient or lift.
- **Hover / Focus:** Hover brightens via opacity, no translate. Focus uses the Recorder Blue ring (`shadows.focus`). Disabled buttons dim and preserve layout.
- **Secondary / Ghost:** Dark fill (`surface` / `surface-raised`) with a hairline `border` outline. Active secondary state uses `accent-soft` background.

### Chips
- **Style:** Source and metadata chips have `radius.md` corners with compact padding (`px-2 py-0.5`), dark fill, slate-blue text, and hairline borders.
- **Pill chips:** The active sidebar nav item, the `Session` accent chip in the Pi header, and the small `n source files` chip use a fully rounded corner (`radius.pill`) — these are the only places `pill` shows up. Reserve for state markers, not for content.
- **State:** Source chips expose tab, file count, session, and selected context. Long values truncate with ellipsis and keep full text in the title attribute.

### Cards / Containers
- **Corner Style:** Containers use `radius.md` (`6–8 px`). Panels, transcript cards, the row drawer, and chat bubbles all share this.
- **Background:** Panels use opaque `surface` fills. Inner containers use `field` or `surface-low`.
- **Shadow Strategy:** Only top-level panels use Ambient Shell. Transcript cards, empty states, grouped filters, chat bubbles, and metadata strips are flat.
- **Border:** Hairline `border` separates panels and groups. Transcript role categories use full-border tint only.
- **Internal Padding:** Panels use `12 px`. Transcript cards use `10 px 12 px`. Dense grouped controls use `8 px`.

### Inputs / Fields
- **Style:** `field` background, subtle slate border, `radius.md` corners, compact padding (`px-3 py-1.5`), and bright text.
- **Focus:** Recorder Blue border plus the focus ring (`shadows.focus`).
- **Error / Disabled:** Errors render as explicit empty or chat error states with retry or recovery copy. Disabled controls dim and preserve layout.

### Navigation
- **Style:** Tabs are button-like command controls. Session navigation is compact and sticky on desktop, static and scrollable on mobile.
- **Default / Hover / Active:** Muted text by default. Hover and active states use a dark row fill, bright text, and full-border tint.
- **Mobile:** Header becomes static, app shell stacks to one column, Pi sidebar becomes static, controls stay compact while remaining tappable, and horizontal overflow is forbidden.

### Empty States

Empty states are onboarding surfaces. They explain whether there are no indexed sessions, no matching sessions, no usage signals, no linked sessions, or no transcript turns. They include the next action when useful, such as clearing filters, retrying, or copying `npm start -- ingest`.

### Transcript Turn Cards

Transcript cards are the signature evidence component. They use a dark flat surface, full-border role tint, uppercase metadata, action buttons, input/output/context badges, and monospace body text. They are keyboard selectable as Pi source context.

### Pi Chat Sidebar

The Pi sidebar is an evidence assistant, not a generic chat widget. It must show the persistent chat ID, active source chips, selected context, context preview, and attached source notes on assistant replies. It must never ask the user to trust an answer without visible provenance.

## 6. Do's and Don'ts

### Do:
- **Do** keep dark mode as the required canonical experience.
- **Do** make transcript evidence and source context visible before analytics or summaries.
- **Do** keep Pi provenance visible through source chips, selected context, context preview, and attached-source notes.
- **Do** use Recorder Blue only for action, focus, selection, and evidence anchors.
- **Do** use full-border role tint or role badges for transcript roles.
- **Do** use monospace for paths, commands, code, token counts, source chips, raw transcript text, and session IDs.
- **Do** use empty states as onboarding: no indexed sessions must explain `npm start -- ingest`.
- **Do** preserve mobile structure: one column, compact tappable controls, no horizontal overflow.
- **Do** validate with `npm run check`, `npm run lint`, `npm run e2e:screenshots`, browser proof, and `npx --yes impeccable --json src/web/index.html` after UI changes.

### Don't:
- **Don't** introduce a light-mode-first UI or treat dark mode as optional.
- **Don't** make bright, high-key SaaS dashboards.
- **Don't** add flashy AI landing-page aesthetics or decorative AI magic treatments.
- **Don't** use glassmorphism, backdrop blur, neon gradients, or decorative glows.
- **Don't** use side-stripe borders for cards, transcript turns, callouts, or navigation states.
- **Don't** make enterprise BI dashboards where charts dominate the workflow.
- **Don't** create overloaded observability screens that bury the primary investigation path.
- **Don't** ship chat interfaces that produce answers without clear provenance or attached source context.
- **Don't** use soft productivity UI that sacrifices density and control for empty space.
- **Don't** add `radius.lg` or larger rounding to interactive controls. The product vocabulary is quietly rounded, not pillowy.
- **Don't** import display fonts or generic SaaS brand fonts for this product shell.
