"use client";

import { forwardRef, useEffect, useState } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Fires after the debounce window elapses. Filters wires this to a
   * `router.replace` so the URL only changes when the user pauses typing.
   */
  onCommit: (value: string) => void;
  /** Debounce window in ms. Defaults to 300. */
  debounceMs?: number;
}

/**
 * Top-bar search input. Two-way bound: `value`/`onChange` update the local
 * state immediately so the UI feels alive; `onCommit` fires once the user
 * stops typing for `debounceMs`. Pressing Enter commits without waiting.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar({ value, onChange, onCommit, debounceMs = 300 }, ref) {
    // Hold the latest value in local state to drive the debounce timer.
    const [pending, setPending] = useState(value);

    useEffect(() => {
      setPending(value);
    }, [value]);

    useEffect(() => {
      if (pending === value) return;
      const handle = window.setTimeout(() => onCommit(pending), debounceMs);
      return () => window.clearTimeout(handle);
    }, [pending, value, debounceMs, onCommit]);

    return (
      <input
        ref={ref}
        type="search"
        role="searchbox"
        aria-label="Search sessions"
        placeholder="Search sessions… (press / to focus)"
        value={pending}
        onChange={(e) => {
          const next = e.target.value;
          setPending(next);
          onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(pending);
          }
        }}
        className="border-border bg-field text-text placeholder:text-muted focus-visible:ring-accent/55 h-9 w-72 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
      />
    );
  },
);
