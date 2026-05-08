"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptItem } from "@/lib/types";
import { Toc, type TocEntry } from "./Toc";
import { Toolbar } from "./Toolbar";
import { TurnCard } from "./TurnCard";

interface TranscriptPaneProps {
  sessionId: string;
}

const DEFAULT_LINES_PER_TURN = 18;

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
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [linesPerTurn, setLinesPerTurn] = useState(DEFAULT_LINES_PER_TURN);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [expandSignal, setExpandSignal] = useState<number | null>(null);
  const [collapseSignal, setCollapseSignal] = useState<number | null>(null);
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

  return (
    <section className="grid gap-4 px-4 py-4 md:grid-cols-[260px_minmax(0,1fr)] md:px-6">
      <Toc entries={tocEntries} />
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
        {error ? (
          <p
            role="alert"
            className="border-danger/40 text-danger rounded-md border bg-[color:var(--color-canvas)] px-3 py-2 text-sm"
          >
            Failed to load transcript: {error}
          </p>
        ) : null}
        {items.length === 0 && error === null ? (
          <p className="text-muted text-sm">Loading transcript…</p>
        ) : null}
        <div className="flex flex-col gap-2">
          {visibleItems.map((item) => (
            <TurnCard
              key={item.index}
              item={item}
              linesPerTurn={linesPerTurn}
              expandSignal={expandSignal}
              collapseSignal={collapseSignal}
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
