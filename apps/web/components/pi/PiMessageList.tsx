"use client";

import { useEffect, useRef } from "react";

export interface PiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  isStreaming?: boolean;
}

interface PiMessageListProps {
  messages: PiMessage[];
  emptyState: string;
  /**
   * Optional retry handler — when present, error bubbles render a "Retry"
   * button that re-sends the previous user turn.
   */
  onRetry?: () => void;
}

export function PiMessageList({
  messages,
  emptyState,
  onRetry,
}: PiMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    // Auto-scroll to keep the newest token visible while streaming.
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="text-muted flex flex-1 items-center justify-center px-4 py-6 text-center text-sm"
        role="status"
        aria-live="polite"
      >
        {emptyState}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          data-role={message.role}
          data-error={message.isError ? "true" : undefined}
          data-streaming={message.isStreaming ? "true" : undefined}
          className={
            message.role === "user"
              ? "self-end max-w-[85%] rounded-md bg-accent-soft px-3 py-2 text-sm text-text"
              : message.isError
                ? "border-danger/40 bg-danger/10 text-danger max-w-full rounded-md border px-3 py-2 text-sm"
                : "border-border bg-surface max-w-full rounded-md border px-3 py-2 text-sm text-text-secondary"
          }
        >
          <div className="text-muted-strong mb-1 text-[10px] font-semibold uppercase tracking-wider">
            {message.role === "user" ? "You" : message.isError ? "Pi · error" : "Pi"}
          </div>
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content || (message.isStreaming ? "…" : "")}
          </div>
          {message.isError && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-danger hover:text-text focus-visible:focus-ring mt-2 inline-flex items-center rounded border border-current/40 px-2 py-0.5 text-[11px] font-medium focus-visible:outline-none"
              data-testid="pi-retry"
            >
              Retry
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
