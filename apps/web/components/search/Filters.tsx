"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  serialize,
  type ParsedSearchParams,
} from "../../lib/search-params";
import { SearchBar } from "./SearchBar";

interface FiltersProps {
  initial: ParsedSearchParams;
  /** Number of result rows the server rendered for the current params. */
  resultCount: number;
}

/**
 * Search-page filter drawer + top search bar.
 *
 * URL is the source of truth: every committed change is pushed via
 * `router.replace(buildHref(params))`. On mount the component hydrates from
 * `initial` (which the server component parses from `searchParams`), so
 * deep links like `/?query=react&provider=pi` arrive populated.
 *
 * Keyboard:
 *   - `/` focuses the search input from any non-input element.
 */
export function Filters({ initial, resultCount }: FiltersProps) {
  const router = useRouter();
  const [params, setParams] = useState<ParsedSearchParams>(initial);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Keep local state in sync when the server re-renders with a new initial
  // (e.g. user navigated back/forward and the route remounts).
  useEffect(() => {
    setParams(initial);
  }, [initial]);

  const pushHref = useCallback(
    (next: ParsedSearchParams) => {
      const qs = serialize(next).toString();
      router.replace(qs ? `/?${qs}` : "/");
    },
    [router],
  );

  const updateAndPush = useCallback(
    (patch: Partial<ParsedSearchParams>) => {
      setParams((prev) => {
        const next = { ...prev, ...patch };
        pushHref(next);
        return next;
      });
    },
    [pushHref],
  );

  // Keyboard shortcut: "/" focuses the search input from non-input elements.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement) return;
      if (active instanceof HTMLTextAreaElement) return;
      if (active instanceof HTMLSelectElement) return;
      if (active instanceof HTMLElement && active.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          ref={searchRef}
          value={params.query}
          onChange={(value) => setParams((prev) => ({ ...prev, query: value }))}
          onCommit={(value) => updateAndPush({ query: value })}
        />
        <label className="text-muted flex items-center gap-2 text-xs uppercase tracking-wide">
          <span>Agent</span>
          <select
            aria-label="Agent"
            value={params.provider}
            onChange={(e) =>
              updateAndPush({
                provider: e.target.value as ParsedSearchParams["provider"],
              })
            }
            className="border-border bg-field text-text focus-visible:ring-accent/55 h-8 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          >
            <option value="">All</option>
            <option value="pi">pi</option>
            <option value="claude">claude</option>
            <option value="codex">codex</option>
            <option value="cursor">cursor</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => pushHref(params)}
          className="bg-accent text-canvas focus-visible:ring-accent/55 h-8 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
        >
          Run query
        </button>
        <span
          aria-live="polite"
          className="text-muted ml-auto text-xs"
          data-slot="result-count"
        >
          {resultCount} results
        </span>
      </div>

      <details className="border-border rounded-md border px-3 py-2">
        <summary className="text-muted cursor-pointer text-xs uppercase tracking-wide">
          Advanced filters
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-muted flex flex-col gap-1 text-xs uppercase tracking-wide">
            <span>cwd</span>
            <input
              type="text"
              value={params.cwd}
              onChange={(e) =>
                setParams((prev) => ({ ...prev, cwd: e.target.value }))
              }
              onBlur={(e) => updateAndPush({ cwd: e.target.value })}
              className="border-border bg-field text-text h-8 rounded-md border px-2 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="text-muted flex flex-col gap-1 text-xs uppercase tracking-wide">
            <span>path contains</span>
            <input
              type="text"
              value={params.path}
              onChange={(e) =>
                setParams((prev) => ({ ...prev, path: e.target.value }))
              }
              onBlur={(e) => updateAndPush({ path: e.target.value })}
              className="border-border bg-field text-text h-8 rounded-md border px-2 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="text-muted flex flex-col gap-1 text-xs uppercase tracking-wide">
            <span>start date</span>
            <input
              type="date"
              value={params.startDate}
              onChange={(e) => updateAndPush({ startDate: e.target.value })}
              className="border-border bg-field text-text h-8 rounded-md border px-2 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="text-muted flex flex-col gap-1 text-xs uppercase tracking-wide">
            <span>end date</span>
            <input
              type="date"
              value={params.endDate}
              onChange={(e) => updateAndPush({ endDate: e.target.value })}
              className="border-border bg-field text-text h-8 rounded-md border px-2 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="text-muted flex flex-col gap-1 text-xs uppercase tracking-wide">
            <span>batch mode</span>
            <select
              value={params.batchMode}
              onChange={(e) =>
                updateAndPush({
                  batchMode: e.target.value as ParsedSearchParams["batchMode"],
                })
              }
              className="border-border bg-field text-text h-8 rounded-md border px-2 text-sm normal-case tracking-normal"
            >
              <option value="include">Include batch</option>
              <option value="exclude">Exclude batch</option>
              <option value="only">Only batch</option>
            </select>
          </label>
          <label className="text-muted flex flex-col gap-1 text-xs uppercase tracking-wide">
            <span>limit</span>
            <input
              type="number"
              min={1}
              max={500}
              value={params.limit}
              onChange={(e) =>
                setParams((prev) => ({
                  ...prev,
                  limit: Number(e.target.value) || prev.limit,
                }))
              }
              onBlur={(e) =>
                updateAndPush({
                  limit: Number(e.target.value) || params.limit,
                })
              }
              className="border-border bg-field text-text h-8 rounded-md border px-2 text-sm normal-case tracking-normal"
            />
          </label>
        </div>
      </details>
    </div>
  );
}
