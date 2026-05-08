"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { AttachmentList } from "./AttachmentList";
import { PiInput } from "./PiInput";
import { PiMessageList, type PiMessage } from "./PiMessageList";

const PI_ERROR_SENTINEL = " PI_ERROR ";
const MIN_WIDTH = 280;
const MAX_WIDTH = 640;
const STORAGE_KEY = "session-review:pi-sidebar:width";

interface PiSidebarProps {
  /**
   * Optional source files to attach to the next Pi turn. Wired by the page
   * that renders the sidebar; defaults to no extra attachments (the route
   * handler always attaches the app's own source files).
   */
  files?: string[];
  /** Optional screen JSON to send as `screen` context. */
  screen?: unknown;
  /** Optional selected item passed verbatim to the route. */
  selectedItem?: unknown;
}

interface PiErrorPayload {
  error: string;
  message: string;
  code?: number | null;
  stderr?: string;
}

export function PiSidebar({ files = [], screen = null, selectedItem = null }: PiSidebarProps) {
  const [messages, setMessages] = useState<PiMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState<number>(MIN_WIDTH + 40);
  const sidebarId = useId();
  const activeController = useRef<AbortController | null>(null);

  // Abort any in-flight stream when the sidebar unmounts so the
  // server-side `pi` child can be SIGTERM'd via `request.signal`.
  useEffect(() => {
    return () => {
      activeController.current?.abort();
      activeController.current = null;
    };
  }, []);

  const stopStreaming = useCallback(() => {
    activeController.current?.abort();
    activeController.current = null;
    setBusy(false);
  }, []);

  // Hydrate width from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
      setWidth(parsed);
    }
  }, []);

  const persistWidth = useCallback((next: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  const setWidthClamped = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(next)));
      setWidth(clamped);
      persistWidth(clamped);
    },
    [persistWidth],
  );

  // Pointer-driven resize.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - event.clientX; // dragging left widens
    setWidthClamped(dragRef.current.startWidth + delta);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (event.currentTarget as Element).releasePointerCapture(event.pointerId);
  };

  const onSeparatorKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const STEP = 16;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setWidthClamped(width + STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setWidthClamped(width - STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      setWidthClamped(MAX_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setWidthClamped(MIN_WIDTH);
    }
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const userId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const history = messages
        .filter((message) => !message.isError)
        .slice(-12)
        .map((message) => ({ role: message.role, content: message.content }));

      setMessages((prior) => [
        ...prior,
        { id: userId, role: "user", content: text },
        { id: assistantId, role: "assistant", content: "", isStreaming: true },
      ]);
      setBusy(true);

      const controller = new AbortController();
      activeController.current = controller;
      try {
        const response = await fetch("/api/pi/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chatId,
            message: text,
            screen,
            selectedItem,
            files,
            history,
          }),
          signal: controller.signal,
        });

        const headerChatId = response.headers.get("x-pi-chat-id");
        if (headerChatId) setChatId(headerChatId);

        if (!response.ok) {
          // Structured JSON error (route returned before stream started).
          let payload: PiErrorPayload | null = null;
          try {
            payload = (await response.json()) as PiErrorPayload;
          } catch {
            payload = null;
          }
          const errMessage =
            payload?.message ||
            `Pi request failed (${response.status}). Check the local Pi process.`;
          setMessages((prior) =>
            prior.map((message) =>
              message.id === assistantId
                ? { ...message, content: errMessage, isError: true, isStreaming: false }
                : message,
            ),
          );
          return;
        }

        if (!response.body) {
          throw new Error("Response had no body to stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let inlineError: PiErrorPayload | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          buffer += decoder.decode(value, { stream: true });

          // Pull any inline error sentinels out of the buffer.
          const errorIndex = buffer.indexOf(PI_ERROR_SENTINEL);
          if (errorIndex !== -1) {
            const closeIndex = buffer.indexOf(
              PI_ERROR_SENTINEL,
              errorIndex + PI_ERROR_SENTINEL.length,
            );
            if (closeIndex !== -1) {
              const visible = buffer.slice(0, errorIndex);
              const json = buffer.slice(
                errorIndex + PI_ERROR_SENTINEL.length,
                closeIndex,
              );
              buffer = buffer.slice(closeIndex + PI_ERROR_SENTINEL.length);
              try {
                inlineError = JSON.parse(json) as PiErrorPayload;
              } catch {
                inlineError = { error: "PI_PARSE_ERROR", message: json };
              }
              setMessages((prior) =>
                prior.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: visible }
                    : message,
                ),
              );
              continue;
            }
          }

          setMessages((prior) =>
            prior.map((message) =>
              message.id === assistantId ? { ...message, content: buffer } : message,
            ),
          );
        }

        // Drain decoder.
        const tail = decoder.decode();
        if (tail) {
          buffer += tail;
          setMessages((prior) =>
            prior.map((message) =>
              message.id === assistantId ? { ...message, content: buffer } : message,
            ),
          );
        }

        if (inlineError) {
          setMessages((prior) =>
            prior.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: inlineError.message,
                    isError: true,
                    isStreaming: false,
                  }
                : message,
            ),
          );
        } else {
          setMessages((prior) =>
            prior.map((message) =>
              message.id === assistantId
                ? { ...message, isStreaming: false }
                : message,
            ),
          );
        }
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        const message = aborted
          ? "Pi turn cancelled."
          : error instanceof Error
            ? error.message
            : String(error);
        setMessages((prior) =>
          prior.map((entry) =>
            entry.id === assistantId
              ? {
                  ...entry,
                  content: aborted ? message : `Pi request failed: ${message}`,
                  isError: !aborted,
                  isStreaming: false,
                }
              : entry,
          ),
        );
      } finally {
        if (activeController.current === controller) {
          activeController.current = null;
        }
        setBusy(false);
      }
    },
    [chatId, files, messages, screen, selectedItem],
  );

  const startNewChat = () => {
    setMessages([]);
    setChatId(null);
  };

  return (
    <aside
      id={sidebarId}
      aria-label="Pi assistant"
      className="border-border bg-surface-low relative hidden shrink-0 flex-col border-l md:flex"
      style={{ width: `${width}px` }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Pi sidebar"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onSeparatorKey}
        className="hover:bg-accent/40 focus-visible:bg-accent/60 absolute inset-y-0 left-0 w-1 cursor-col-resize focus-visible:outline-none"
      />

      <header className="border-border flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-text text-sm font-semibold">Pi Chat</h2>
          <p className="text-muted text-[11px] leading-tight">
            Persistent session with visible source context
          </p>
        </div>
        <button
          type="button"
          onClick={startNewChat}
          className="border-border text-muted-strong hover:text-text hover:border-border-strong focus-visible:focus-ring rounded-md border px-2 py-1 text-[11px] focus-visible:outline-none"
        >
          New chat
        </button>
      </header>

      <div className="border-border flex items-center gap-2 border-b px-4 py-2 text-[11px]">
        <span className="bg-accent-soft text-accent rounded px-2 py-0.5 font-medium">
          Session
        </span>
        <span className="border-border text-muted-strong inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5">
          {files.length}/{files.length} source file{files.length === 1 ? "" : "s"}
          <AttachmentList files={files} />
        </span>
        {chatId ? (
          <span className="text-muted ml-auto font-mono text-[10px]">
            chat {chatId.slice(0, 8)}
          </span>
        ) : null}
      </div>

      <PiMessageList
        messages={messages}
        emptyState="Ready. Ask Pi about the visible page — follow-ups reuse the same persistent session."
      />

      <PiInput disabled={busy} onSubmit={sendMessage} onStop={stopStreaming} />
    </aside>
  );
}
