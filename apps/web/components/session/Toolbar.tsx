"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

interface ToolbarProps {
  /** Distinct role names from the loaded transcript items. */
  roleOptions: string[];
  /** Currently-selected role names (`[]` = all). */
  selectedRoles: string[];
  onChangeRoles: (next: string[]) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  linesPerTurn: number;
  onApplyLinesPerTurn: (next: number) => void;
}

/**
 * Transcript controls — exactly three primary buttons (type filter,
 * expand all, collapse all) plus a `<details>` "Display options" with
 * a numeric "Lines/turn" + Apply control inside. The legacy six-control
 * toolbar (review #04, fail #2) collapses to this calmer surface.
 */
export function Toolbar({
  roleOptions,
  selectedRoles,
  onChangeRoles,
  onExpandAll,
  onCollapseAll,
  linesPerTurn,
  onApplyLinesPerTurn,
}: ToolbarProps) {
  const [open, setOpen] = useState(false);
  const [draftLines, setDraftLines] = useState(String(linesPerTurn));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftLines(String(linesPerTurn));
  }, [linesPerTurn]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const onToggleRole = useCallback(
    (role: string) => {
      if (selectedRoles.includes(role)) {
        onChangeRoles(selectedRoles.filter((entry) => entry !== role));
      } else {
        onChangeRoles([...selectedRoles, role]);
      }
    },
    [onChangeRoles, selectedRoles],
  );

  const onLinesChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraftLines(event.target.value);
  }, []);

  const onApply = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = Math.max(1, Math.floor(Number(draftLines)));
      if (Number.isFinite(parsed) && parsed > 0) onApplyLinesPerTurn(parsed);
    },
    [draftLines, onApplyLinesPerTurn],
  );

  const filterLabel =
    selectedRoles.length === 0
      ? "Type filter — all"
      : `Type filter — ${selectedRoles.length} selected`;

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Transcript controls"
      className="border-border bg-surface-low relative flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="border-border bg-surface text-text-secondary hover:text-text inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
      >
        {filterLabel}
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      <button
        type="button"
        onClick={onExpandAll}
        className="bg-accent-soft text-accent hover:bg-surface-raised inline-flex items-center rounded px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
      >
        Expand all
      </button>
      <button
        type="button"
        onClick={onCollapseAll}
        className="bg-accent-soft text-accent hover:bg-surface-raised inline-flex items-center rounded px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
      >
        Collapse all
      </button>
      <details className="border-border bg-surface text-text-secondary ml-auto rounded border px-2 py-1 text-sm">
        <summary className="hover:text-text cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55">
          Display options
        </summary>
        <form
          onSubmit={onApply}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <label className="text-muted-strong flex items-center gap-2 text-xs uppercase tracking-[0.07em]">
            <span>Lines/turn</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-label="Lines/turn"
              value={draftLines}
              onChange={onLinesChange}
              className="border-border bg-field text-text w-20 rounded border px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
            />
          </label>
          <button
            type="submit"
            className="border-border bg-surface-raised text-text-secondary hover:text-text inline-flex items-center rounded border px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
          >
            Apply
          </button>
        </form>
      </details>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="border-border bg-surface absolute left-3 top-full z-10 mt-1 flex w-64 flex-col gap-1 rounded-md border p-2 shadow-lg"
        >
          {roleOptions.length === 0 ? (
            <span className="text-muted px-2 py-1 text-xs">
              No turns loaded yet
            </span>
          ) : (
            roleOptions.map((role) => {
              const checked = selectedRoles.includes(role);
              return (
                <label
                  key={role}
                  role="option"
                  aria-selected={checked}
                  className="text-text-secondary hover:bg-surface-raised flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-accent h-3 w-3"
                    checked={checked}
                    onChange={() => onToggleRole(role)}
                  />
                  <span>{role}</span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
