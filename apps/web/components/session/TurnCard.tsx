"use client";

import { useState, type CSSProperties } from "react";
import { isBootstrapContext } from "@/lib/transcript-noise";
import type { TranscriptItem } from "@/lib/types";

interface TurnCardProps {
  item: TranscriptItem;
  /** Maximum lines rendered while collapsed; the user can flip to "Show more". */
  linesPerTurn: number;
  /** External expand/collapse signal from the toolbar. `null` = leave alone. */
  expandSignal: number | null;
  /** External collapse signal from the toolbar. */
  collapseSignal: number | null;
  /**
   * Whether this turn is the parent-controlled "current" one (driven by
   * `?turn=N` URL state and j/k keyboard nav). Adds an accent ring so the
   * keyboard cursor is visible even after `scrollIntoView` finishes.
   */
  isCurrent?: boolean;
}

const TOOL_LIKE = new Set(["tool", "tool_result", "bashexecution"]);

/**
 * Single transcript turn. Default-collapsed when content is taller than
 * `linesPerTurn`; the "Show more" button reveals the rest. The wrapping
 * `data-turn-card` attribute is the scroll target for the TOC.
 *
 * Bootstrap context turns (`pi-opentelemetry.resource_snapshot`,
 * `custom`/`context` harness wiring) start collapsed *regardless of
 * length* and surface a "Show bootstrap context" affordance. Once the
 * user opens them they stay open for the rest of the page lifetime;
 * reload returns them to the collapsed default.
 */
export function TurnCard({
  item,
  linesPerTurn,
  expandSignal,
  collapseSignal,
  isCurrent = false,
}: TurnCardProps) {
  const isBootstrap = isBootstrapContext({
    role: item.role,
    content: item.content,
  });
  const [expanded, setExpanded] = useState(false);
  const [lastExpand, setLastExpand] = useState<number | null>(null);
  const [lastCollapse, setLastCollapse] = useState<number | null>(null);
  if (expandSignal !== null && expandSignal !== lastExpand) {
    setLastExpand(expandSignal);
    if (!expanded) setExpanded(true);
  }
  if (collapseSignal !== null && collapseSignal !== lastCollapse) {
    setLastCollapse(collapseSignal);
    if (expanded) setExpanded(false);
  }

  const tokenEstimate = estimateTokens(item.content);
  const lineCount = countLines(item.content);
  // Bootstrap turns are *always* collapsible — the resource_snapshot can
  // be a single very long line that the line-clamp would otherwise miss.
  const isTruncated = isBootstrap || lineCount > linesPerTurn;
  const showContent = !isBootstrap || expanded;
  const collapsedStyle: CSSProperties = expanded
    ? {}
    : {
        display: "-webkit-box",
        WebkitLineClamp: linesPerTurn,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      };

  const toggleLabel = isBootstrap
    ? "Show bootstrap context"
    : expanded
      ? "Show less"
      : "Show more";
  // Bootstrap turns: once revealed, the user keeps it open for the
  // page lifetime — there is no per-card "Hide" toggle. The button
  // itself stays in the DOM with the same label so screen readers can
  // still read aria-expanded; clicks become a no-op once expanded.
  // Non-bootstrap turns keep the standard toggle behavior.
  const onToggleClick = (): void => {
    if (isBootstrap && expanded) return;
    setExpanded((prev) => !prev);
  };
  const showToggle = isTruncated || isBootstrap;

  return (
    <article
      data-turn-card={item.index}
      data-role={item.role}
      data-bootstrap={isBootstrap ? "true" : undefined}
      data-current={isCurrent ? "true" : undefined}
      tabIndex={-1}
      className={`border-border bg-surface focus:outline-none flex scroll-mt-4 flex-col gap-2 rounded-md border-l-2 border-y border-r p-3 ${roleAccent(item.role)} ${isCurrent ? "ring-accent/60 ring-2" : ""}`}
    >
      <header className="text-muted-strong flex flex-wrap items-baseline gap-2 text-xs uppercase tracking-[0.05em]">
        <span className="text-text-secondary tabular-nums">#{item.index}</span>
        <span className="text-text font-semibold">{item.role}</span>
        <span className="text-muted">|</span>
        <span className="tabular-nums">{item.toolCount} tools</span>
        <span className="tabular-nums">{item.skillCount} skills</span>
        <span className="tabular-nums">~{tokenEstimate} tokens</span>
      </header>
      {showContent ? (
        <pre
          className="text-text-secondary m-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed"
          style={collapsedStyle}
        >
          {item.content}
        </pre>
      ) : null}
      {showToggle ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggleClick}
          disabled={isBootstrap && expanded}
          className="text-accent hover:text-text self-start text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 disabled:cursor-default disabled:opacity-60"
        >
          {toggleLabel}
        </button>
      ) : null}
    </article>
  );
}

function estimateTokens(content: string): number {
  // Cheap, deterministic, no tokenizer required: ~4 chars per token.
  return Math.max(0, Math.round(content.length / 4));
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  let lines = 1;
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "\n") lines++;
  }
  return lines;
}

function roleAccent(role: string): string {
  if (role === "user") return "border-l-[color:var(--color-user)]";
  if (role === "assistant") return "border-l-[color:var(--color-assistant)]";
  if (TOOL_LIKE.has(role)) return "border-l-[color:var(--color-tool)]";
  return "border-l-[color:var(--color-system)]";
}
