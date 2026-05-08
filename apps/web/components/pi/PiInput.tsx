"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";

interface PiInputProps {
  disabled: boolean;
  onSubmit: (message: string) => void;
  onStop?: () => void;
}

export function PiInput({ disabled, onSubmit, onStop }: PiInputProps) {
  const [value, setValue] = useState("");
  const labelId = useId();

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-surface-low border-t p-3"
      aria-label="Send a message to Pi"
    >
      <label id={labelId} className="sr-only" htmlFor="pi-message-input">
        Message Pi
      </label>
      <textarea
        id="pi-message-input"
        aria-labelledby={labelId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask Pi about the visible page…"
        rows={3}
        className="border-border bg-field text-text placeholder:text-muted focus-visible:focus-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted text-[11px]">⌘ + Enter to send</span>
        <div className="flex items-center gap-2">
          {disabled && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="border-border text-muted-strong hover:text-text hover:border-border-strong focus-visible:focus-ring rounded-md border px-3 py-1.5 text-xs font-semibold focus-visible:outline-none"
            >
              Stop
            </button>
          ) : null}
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="bg-accent text-canvas hover:bg-accent/90 focus-visible:focus-ring rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </form>
  );
}
