"use client";

import { useEffect, useId, useRef, useState } from "react";

interface AttachmentListProps {
  files: string[];
}

/**
 * Small popover that lists every file attached to the current Pi turn. The
 * trigger is a `?` affordance on the source-files pill — review #5 calls out
 * that "1/1 source file" doesn't tell the user *which* file is attached.
 */
export function AttachmentList({ files }: AttachmentListProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`Show attached source files (${files.length})`}
        onClick={() => setOpen((prior) => !prior)}
        className="border-border text-muted-strong hover:border-border-strong hover:text-text focus-visible:focus-ring inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs leading-none focus-visible:outline-none"
      >
        ?
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Attached source files"
          className="border-border bg-surface-raised absolute right-0 top-7 z-30 w-80 rounded-md border p-3 shadow-lg"
        >
          <p className="text-muted text-xs">
            {files.length === 0
              ? "No files attached yet."
              : `Pi will receive ${files.length} file${files.length === 1 ? "" : "s"} as @-attachments:`}
          </p>
          {files.length > 0 ? (
            <ul className="mt-2 max-h-64 overflow-y-auto text-xs">
              {files.map((file) => (
                <li
                  key={file}
                  className="text-text-secondary truncate font-mono"
                  title={file}
                >
                  {file}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
