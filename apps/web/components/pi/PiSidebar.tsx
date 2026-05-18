"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useResizableWidth } from "@/lib/hooks/useResizableWidth";
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
  const { width, pointerHandlers, onKeyDown: onSeparatorKey } =
    useResizableWidth({
      min: MIN_WIDTH,
      max: MAX_WIDTH,
      initial: MIN_WIDTH + 40,
      storageKey: STORAGE_KEY,
      direction: "left-grows",
    });
  // Real count of files attached to the underlying `pi` child, sourced from
  // the server's `x-pi-attached-files` response header. The prop `files` is
  // the *additional* set the page passes in; the route always also attaches
  // the app's own source. `null` until the first turn completes.
  const [serverAttachedCount, setServerAttachedCount] = useState<number | null>(null);
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

  // Track the last user message text so the retry button on an error
  // bubble can re-send it without the user re-typing. Cleared once a
  // healthy response arrives or the user starts a new chat.
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const userId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      setLastUserMessage(text);
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

        const headerAttached = response.headers.get("x-pi-attached-files");
        if (headerAttached !== null) {
          const parsed = Number(headerAttached);
          if (Number.isFinite(parsed) && parsed >= 0) {
            setServerAttachedCount(parsed);
          }
        }

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
    setLastUserMessage(null);
  };

  const retryLast = useCallback(() => {
    if (busy) return;
    const text = lastUserMessage;
    if (!text) return;
    // Drop the failed exchange (last user + last assistant) so retrying
    // doesn't leave the error bubble in the history. The retry creates
    // fresh entries via sendMessage.
    setMessages((prior) => {
      const next = [...prior];
      while (next.length > 0) {
        const tail = next[next.length - 1];
        if (!tail) break;
        if (tail.role === "user") {
          next.pop();
          break;
        }
        next.pop();
      }
      return next;
    });
    void sendMessage(text);
  }, [busy, lastUserMessage, sendMessage]);

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
        {...pointerHandlers}
        onKeyDown={onSeparatorKey}
        // 3px wide and transparent at rest so the handle has a real hit
        // target without being visually heavy. On hover/focus the accent
        // colour fills the strip — the user can see what they're about
        // to grab. Negative left offset bleeds the strip into the
        // border-l line so the visual width feels narrower than the hit
        // target. The transition is `motion-safe:` so it respects the
        // user's `prefers-reduced-motion` setting.
        className="hover:bg-accent focus-visible:bg-accent motion-safe:transition-colors absolute inset-y-0 -left-[1px] w-[3px] cursor-col-resize focus-visible:outline-none"
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
        <span
          className="border-border text-muted-strong inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
          title={
            serverAttachedCount === null
              ? "Source files are attached automatically by the server before the first turn."
              : `${serverAttachedCount} file${serverAttachedCount === 1 ? "" : "s"} attached on the last turn` +
                (files.length > 0
                  ? ` (${files.length} passed in by this page, plus the app's auto-attached source)`
                  : " (the app's auto-attached source).")
          }
        >
          {serverAttachedCount === null ? (
            <>auto-attached</>
          ) : (
            <>
              {serverAttachedCount} attached
              {files.length > 0 ? ` · ${files.length} from page` : ""}
            </>
          )}
          <AttachmentList files={files} />
        </span>
        {chatId ? (
          <ChatIdBadge chatId={chatId} />
        ) : null}
      </div>

      <PiMessageList
        messages={messages}
        emptyState="Ready. Ask Pi about the visible page — follow-ups reuse the same persistent session."
        {...(lastUserMessage ? { onRetry: retryLast } : {})}
      />

      <PiInput disabled={busy} onSubmit={sendMessage} onStop={stopStreaming} />
    </aside>
  );
}

function ChatIdBadge({ chatId }: { chatId: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(chatId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard rejected — fail silently, badge keeps showing the ID */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={`Copy chat id ${chatId}`}
      aria-label={
        copied ? `Copied chat id ${chatId}` : `Copy chat id ${chatId}`
      }
      className="text-muted hover:text-text-secondary focus-visible:focus-ring ml-auto inline-flex items-center gap-1 font-mono text-[10px] focus-visible:outline-none"
    >
      <span>chat {chatId.slice(0, 8)}</span>
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}
