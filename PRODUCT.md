# Product

## Register

product

## Users

The primary user today is Alex: an AI-heavy developer reviewing personal agent sessions, recovering prior context, and understanding what happened across Pi, Claude Code, Codex, and Cursor runs. The future user is similar: developers and work teams who need local-first visibility into AI coding-agent activity, especially when debugging workflows, tracing decisions, or finding useful prior work.

Users are usually in an investigation mode. They may be resuming a thread, checking what an agent did, searching for a past fix, reviewing subagent activity, or auditing tool and skill usage. They value speed, provenance, and the ability to inspect raw transcript evidence over polished summaries.

## Product Purpose

Session Review ingests AI agent session transcripts into a rebuildable local SQLite/FTS index and makes them searchable from a CLI and local web app. It helps users find sessions, inspect transcript turns, compare tool and skill usage, understand primary sessions and subagents, and ask follow-up questions with the current screen context attached.

Success means the user can answer “what happened?”, “where did I see that?”, and “what should I continue from?” without manually spelunking JSONL files across multiple agent directories. Raw session files remain the source of truth; the database and derived analytics are rebuildable views.

## Brand Personality

developer-native, calm, trustworthy

The product should feel like a serious developer tool rather than a generic analytics dashboard. It can borrow from Cursor and Raycast: command-oriented, fast, keyboard-friendly, dark, precise, and comfortable for long technical sessions. Dark mode is mandatory and should be treated as the canonical product experience. It should feel quiet enough for investigation, but capable enough for dense transcript work.

## Anti-references

- Bright, high-key SaaS dashboards.
- Flashy AI landing-page aesthetics or decorative “AI magic” treatments.
- Enterprise BI dashboards where charts dominate the workflow.
- Overloaded observability screens that bury the primary investigation path.
- Chat interfaces that produce answers without clear provenance or attached source context.
- Soft productivity UI that sacrifices density and control for empty space.

## Design Principles

1. **Evidence first.** Raw transcript paths, session metadata, selected turns, and source context should stay visible enough that answers feel traceable.
2. **Dense, not crowded.** The interface should carry lots of session detail, but hierarchy and grouping must keep it scan-friendly.
3. **Function before flourish.** Visual polish should support search, filtering, reading, grouping, and resuming work. Decoration never outranks workflow speed.
4. **Local trust.** Make the local-first, rebuildable-index model legible through honest status, paths, and clear data boundaries.
5. **Developer-native interaction.** Prefer keyboard-friendly controls, monospace where it clarifies evidence, command-like flows, and fast feedback over consumer-style onboarding.

## Accessibility & Inclusion

Accessibility is not a current product priority, but the UI should avoid choices that would make later accessibility work expensive. Reduced-motion support, keyboard navigation, readable contrast, and colorblind-safe status encoding are desirable as the product matures.
