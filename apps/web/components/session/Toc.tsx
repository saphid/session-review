"use client";

import { useCallback } from "react";

export interface TocEntry {
  index: number;
  role: string;
  preview: string;
  /**
   * Bootstrap context turns (`pi-opentelemetry.resource_snapshot`,
   * `custom`/`context` harness wiring). The TOC entry is still listed
   * and clickable, but rendered with a muted text class so the eye
   * skips past it on first scan.
   */
  isBootstrap?: boolean;
}

interface TocProps {
  entries: TocEntry[];
  /**
   * Optional currently-selected turn (driven by `?turn=` URL state and the
   * j/k keyboard nav in the parent). The matching entry renders with the
   * accent background so the user can see where the keyboard cursor is.
   */
  currentTurn?: number | null;
  /**
   * Optional click handler — when provided, the parent owns selection
   * state. The Toc still scrolls the matching turn into view itself.
   */
  onSelect?: (index: number) => void;
}

/**
 * Sticky transcript table of contents. Each entry is a button that
 * scrolls the matching turn card into view; we use buttons rather than
 * anchors because the cards mount progressively and we want the click
 * to do its own `scrollIntoView` rather than relying on the browser to
 * find an anchor that may not yet exist.
 */
export function Toc({ entries, currentTurn = null, onSelect }: TocProps) {
  const scrollTo = useCallback(
    (index: number) => {
      if (onSelect) onSelect(index);
      if (typeof document === "undefined") return;
      const card = document.querySelector<HTMLElement>(
        `[data-turn-card="${index}"]`,
      );
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      card.focus({ preventScroll: true });
    },
    [onSelect],
  );
  return (
    <nav
      aria-label="Transcript turns"
      className="border-border bg-surface-low sticky top-4 max-h-[calc(100vh-2rem)] overflow-auto rounded-md border p-2"
    >
      <ol className="flex flex-col gap-px">
        {entries.map((entry) => {
          const muted = entry.isBootstrap === true;
          const isActive = entry.index === currentTurn;
          // Bootstrap turns get the muted text class on the row label
          // so they read as background noise; the row stays clickable.
          // The active row uses the accent-soft background regardless
          // of bootstrap state — keyboard focus location wins over
          // visual de-emphasis.
          const baseClass =
            "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55";
          const stateClass = isActive
            ? "bg-accent-soft text-text"
            : muted
              ? "text-muted hover:bg-surface-raised hover:text-text-secondary"
              : "text-text-secondary hover:bg-surface-raised hover:text-text";
          return (
            <li key={entry.index}>
              <button
                type="button"
                data-toc-index={entry.index}
                data-bootstrap={muted ? "true" : undefined}
                aria-current={isActive ? "true" : undefined}
                onClick={() => scrollTo(entry.index)}
                className={`${baseClass} ${stateClass}`}
              >
                <span className="text-muted-strong w-8 shrink-0 text-right tabular-nums">
                  #{entry.index}
                </span>
                <span
                  className={
                    muted && !isActive
                      ? "text-muted truncate"
                      : "text-text truncate"
                  }
                >
                  {entry.role}
                </span>
                <span className="text-muted truncate">{entry.preview}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
