"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isBootstrapContext } from "@/lib/transcript-noise";
import type { TranscriptItem } from "@/lib/types";
import { Toc, type TocEntry } from "./Toc";
import { Toolbar } from "./Toolbar";
import { TurnCard } from "./TurnCard";

interface TranscriptPaneProps {
  sessionId: string;
}

const DEFAULT_LINES_PER_TURN = 18;

function parseTurnParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Two-column transcript reader. Streams items from `/api/session?id=…`
 * line-by-line so the first cards mount before the full transcript has
 * been read; the TOC on the left mirrors the items as they arrive.
 *
 * The header line in the ndjson response is consumed and dropped — the
 * page's server component already has the header data. Only transcript
 * items are appended to local state.
 */
export function TranscriptPane({ sessionId }: TranscriptPaneProps) {
  const searchParams = useSearchParams();
  // Only consume the initial URL value — subsequent updates are driven by
  // user interaction (TOC clicks and j/k), not by external param changes.
  // We don't depend on `searchParams` so the URL ↔ state binding is
  // strictly one-way after mount.
  const initialTurnRef = useRef<number | null>(parseTurnParam(searchParams.get("turn")));
  const initialTurn = initialTurnRef.current;

  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [linesPerTurn, setLinesPerTurn] = useState(DEFAULT_LINES_PER_TURN);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [expandSignal, setExpandSignal] = useState<number | null>(null);
  const [collapseSignal, setCollapseSignal] = useState<number | null>(null);
  // Currently focused turn — drives `?turn=N` URL state and the j/k jump
  // target. `null` means "no explicit selection yet"; the first j/k or
  // TOC click resolves it.
  const [currentTurn, setCurrentTurn] = useState<number | null>(initialTurn);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setItems([]);
    setError(null);
    void streamSession(sessionId, controller.signal, (item) => {
      setItems((prev) => [...prev, item]);
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    });
    return () => {
      controller.abort();
    };
  }, [sessionId]);

  const tocEntries = useMemo<TocEntry[]>(
    () =>
      items.map((item) => ({
        index: item.index,
        role: item.role,
        preview: item.content.slice(0, 48).replace(/\s+/g, " "),
        isBootstrap: isBootstrapContext({
          role: item.role,
          content: item.content,
        }),
      })),
    [items],
  );

  const roleOptions = useMemo(() => {
    const roles = new Set<string>();
    for (const item of items) roles.add(item.role);
    return Array.from(roles).sort();
  }, [items]);

  const visibleItems = useMemo(() => {
    if (selectedRoles.length === 0) return items;
    return items.filter((item) => selectedRoles.includes(item.role));
  }, [items, selectedRoles]);

  const hiddenBootstrapCount = useMemo(
    () => tocEntries.filter((entry) => entry.isBootstrap).length,
    [tocEntries],
  );

  // When the selected turn changes, scroll its card into view and write
  // the turn index into the URL. We use `history.replaceState` directly
  // (not `router.replace`) so the section doesn't re-render and lose the
  // streaming state on every keystroke.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (currentTurn === null) {
      if (url.searchParams.has("turn")) {
        url.searchParams.delete("turn");
        window.history.replaceState(null, "", url.toString());
      }
      return;
    }
    const card = document.querySelector<HTMLElement>(
      `[data-turn-card="${currentTurn}"]`,
    );
    if (card) {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      card.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }
    if (url.searchParams.get("turn") !== String(currentTurn)) {
      url.searchParams.set("turn", String(currentTurn));
      window.history.replaceState(null, "", url.toString());
    }
  }, [currentTurn, items.length]);

  // Clamp `currentTurn` once items are loaded — a bad URL value (`?turn=99999`,
  // `?turn=-5`, `?turn=abc`) would otherwise sit in the URL forever with no
  // matching card. Drop it as soon as we can prove the index doesn't exist.
  useEffect(() => {
    if (currentTurn === null) return;
    if (items.length === 0) return;
    const exists = items.some((item) => item.index === currentTurn);
    if (!exists) {
      setCurrentTurn(null);
    }
  }, [currentTurn, items]);

  // j / k / ArrowDown / ArrowUp — step through visible turns. Bound at the
  // document level so the user doesn't need to focus a specific element
  // first; bails out if the user is typing in an input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as Element | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      let direction: 1 | -1;
      if (e.key === "j" || e.key === "ArrowDown") direction = 1;
      else if (e.key === "k" || e.key === "ArrowUp") direction = -1;
      else return;
      if (visibleItems.length === 0) return;
      e.preventDefault();
      setCurrentTurn((prev) => {
        const first = visibleItems[0];
        const last = visibleItems[visibleItems.length - 1];
        if (!first || !last) return prev;
        if (prev === null) {
          return direction === 1 ? first.index : last.index;
        }
        const idx = visibleItems.findIndex((it) => it.index === prev);
        if (idx === -1) return first.index;
        const nextPos = Math.max(
          0,
          Math.min(visibleItems.length - 1, idx + direction),
        );
        return visibleItems[nextPos]?.index ?? prev;
      });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visibleItems]);

  const onTurnSelect = useCallback((index: number) => {
    setCurrentTurn(index);
  }, []);

  return (
    <section className="grid gap-4 px-4 py-4 md:grid-cols-[260px_minmax(0,1fr)] md:px-6">
      <Toc
        entries={tocEntries}
        currentTurn={currentTurn}
        onSelect={onTurnSelect}
      />
      <div className="flex min-w-0 flex-col gap-3">
        <Toolbar
          roleOptions={roleOptions}
          selectedRoles={selectedRoles}
          onChangeRoles={setSelectedRoles}
          onExpandAll={() => setExpandSignal((prev) => (prev ?? 0) + 1)}
          onCollapseAll={() => setCollapseSignal((prev) => (prev ?? 0) + 1)}
          linesPerTurn={linesPerTurn}
          onApplyLinesPerTurn={setLinesPerTurn}
        />
        {hiddenBootstrapCount > 0 && items.length > 0 ? (
          <p
            data-testid="noise-filter-status"
            className="text-muted-strong text-[11px] tabular-nums"
          >
            {items.length - hiddenBootstrapCount} reading turn
            {items.length - hiddenBootstrapCount === 1 ? "" : "s"} ·{" "}
            {hiddenBootstrapCount} bootstrap turn
            {hiddenBootstrapCount === 1 ? "" : "s"} muted ·{" "}
            <span className="text-muted">j/k to step</span>
          </p>
        ) : items.length > 0 ? (
          <p className="text-muted text-[11px]">j/k to step turns</p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="border-danger/40 text-danger rounded-md border bg-[color:var(--color-canvas)] px-3 py-2 text-sm"
          >
            Failed to load transcript: {error}
          </p>
        ) : null}
        {items.length === 0 && error === null ? (
          <div
            role="status"
            aria-live="polite"
            aria-label="Loading transcript"
            className="flex flex-col gap-2"
          >
            <span className="sr-only">Loading transcript…</span>
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                className="border-border bg-surface motion-safe:animate-pulse rounded-md border-y border-l-2 border-r p-3"
                style={{ borderLeftColor: "var(--color-border)" }}
              >
                <div className="bg-surface-raised mb-2 h-3 w-32 rounded" />
                <div className="bg-surface-raised mb-1 h-2 w-full rounded" />
                <div className="bg-surface-raised h-2 w-2/3 rounded" />
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          {visibleItems.map((item) => (
            <TurnCard
              key={item.index}
              item={item}
              linesPerTurn={linesPerTurn}
              expandSignal={expandSignal}
              collapseSignal={collapseSignal}
              isCurrent={item.index === currentTurn}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

async function streamSession(
  sessionId: string,
  signal: AbortSignal,
  onItem: (item: TranscriptItem) => void,
): Promise<void> {
  const url = `/api/session?id=${encodeURIComponent(sessionId)}`;
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Response had no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawHeader = false;
  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx >= 0) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.length > 0) {
        if (!sawHeader) {
          sawHeader = true;
        } else {
          try {
            onItem(JSON.parse(line) as TranscriptItem);
          } catch {
            // Skip malformed line — the server is the source of truth
            // and a malformed line should not abort the entire stream.
          }
        }
      }
      newlineIdx = buffer.indexOf("\n");
    }
    if (done) break;
  }
  // Flush any trailing line without a newline.
  buffer += decoder.decode();
  if (buffer.trim().length > 0) {
    if (!sawHeader) {
      // Header-only response — nothing to do.
      return;
    }
    try {
      onItem(JSON.parse(buffer) as TranscriptItem);
    } catch {
      // Same rationale as the inner catch.
    }
  }
}
