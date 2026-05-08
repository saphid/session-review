"use client";

import { useState, type CSSProperties } from "react";
import type { TranscriptItem } from "@/lib/types";

interface TurnCardProps {
  item: TranscriptItem;
  /** Maximum lines rendered while collapsed; the user can flip to "Show more". */
  linesPerTurn: number;
  /** External expand/collapse signal from the toolbar. `null` = leave alone. */
  expandSignal: number | null;
  /** External collapse signal from the toolbar. */
  collapseSignal: number | null;
}

const TOOL_LIKE = new Set(["tool", "tool_result", "bashexecution"]);

/**
 * Single transcript turn. Default-collapsed when content is taller than
 * `linesPerTurn`; the "Show more" button reveals the rest. The wrapping
 * `data-turn-card` attribute is the scroll target for the TOC.
 */
export function TurnCard({
  item,
  linesPerTurn,
  expandSignal,
  collapseSignal,
}: TurnCardProps) {
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
  const isTruncated = lineCount > linesPerTurn;
  const collapsedStyle: CSSProperties = expanded
    ? {}
    : {
        display: "-webkit-box",
        WebkitLineClamp: linesPerTurn,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      };

  return (
    <article
      data-turn-card={item.index}
      data-role={item.role}
      tabIndex={-1}
      className={`border-border bg-surface focus:outline-none flex scroll-mt-4 flex-col gap-2 rounded-md border-l-2 border-y border-r p-3 ${roleAccent(item.role)}`}
    >
      <header className="text-muted-strong flex flex-wrap items-baseline gap-2 text-xs uppercase tracking-[0.05em]">
        <span className="text-text-secondary tabular-nums">#{item.index}</span>
        <span className="text-text font-semibold">{item.role}</span>
        <span className="text-muted">|</span>
        <span className="tabular-nums">{item.toolCount} tools</span>
        <span className="tabular-nums">{item.skillCount} skills</span>
        <span className="tabular-nums">~{tokenEstimate} tokens</span>
      </header>
      <pre
        className="text-text-secondary m-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed"
        style={collapsedStyle}
      >
        {item.content}
      </pre>
      {isTruncated ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="text-accent hover:text-text self-start text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
        >
          {expanded ? "Show less" : "Show more"}
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
