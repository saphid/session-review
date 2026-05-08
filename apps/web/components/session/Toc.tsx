"use client";

import { useCallback } from "react";

export interface TocEntry {
  index: number;
  role: string;
  preview: string;
}

interface TocProps {
  entries: TocEntry[];
}

/**
 * Sticky transcript table of contents. Each entry is a button that
 * scrolls the matching turn card into view; we use buttons rather than
 * anchors because the cards mount progressively and we want the click
 * to do its own `scrollIntoView` rather than relying on the browser to
 * find an anchor that may not yet exist.
 */
export function Toc({ entries }: TocProps) {
  const scrollTo = useCallback((index: number) => {
    if (typeof document === "undefined") return;
    const card = document.querySelector<HTMLElement>(
      `[data-turn-card="${index}"]`,
    );
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.focus({ preventScroll: true });
  }, []);
  return (
    <nav
      aria-label="Transcript turns"
      className="border-border bg-surface-low sticky top-4 max-h-[calc(100vh-2rem)] overflow-auto rounded-md border p-2"
    >
      <ol className="flex flex-col gap-px">
        {entries.map((entry) => (
          <li key={entry.index}>
            <button
              type="button"
              data-toc-index={entry.index}
              onClick={() => scrollTo(entry.index)}
              className="text-text-secondary hover:bg-surface-raised hover:text-text flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
            >
              <span className="text-muted-strong w-8 shrink-0 text-right tabular-nums">
                #{entry.index}
              </span>
              <span className="text-text truncate">{entry.role}</span>
              <span className="text-muted truncate">{entry.preview}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
