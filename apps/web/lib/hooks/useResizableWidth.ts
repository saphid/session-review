"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

interface UseResizableWidthOptions {
  /** Minimum width in pixels. */
  min: number;
  /** Maximum width in pixels. */
  max: number;
  /** Initial width before localStorage rehydration. */
  initial: number;
  /**
   * `localStorage` key for persistence. Omit to disable persistence and use
   * pure in-memory state (useful for tests).
   */
  storageKey?: string;
  /**
   * Direction of drag → grow. Most right-anchored sidebars want
   * `"left-grows"` (dragging left widens). Default is `"left-grows"`.
   */
  direction?: "left-grows" | "right-grows";
  /** Pixel step used by the keyboard arrow handlers. Defaults to 16. */
  keyboardStep?: number;
}

interface UseResizableWidthReturn {
  width: number;
  pointerHandlers: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  };
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Pointer + keyboard width controller for a resizable side panel. Backed by
 * `localStorage` when `storageKey` is provided so the user's choice
 * survives a reload.
 *
 * Returns the current width plus the event handlers a `role="separator"`
 * element needs (`onPointerDown/Move/Up/Cancel` and `onKeyDown` for
 * Arrow / Home / End). The consumer wires them onto the drag handle and
 * applies `width` to the panel via inline style.
 */
export function useResizableWidth({
  min,
  max,
  initial,
  storageKey,
  direction = "left-grows",
  keyboardStep = 16,
}: UseResizableWidthOptions): UseResizableWidthReturn {
  const [width, setWidth] = useState<number>(initial);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Hydrate width from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    if (!storageKey) return;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      setWidth(parsed);
    }
  }, [max, min, storageKey]);

  const persist = useCallback(
    (value: number) => {
      if (!storageKey) return;
      if (typeof window === "undefined") return;
      window.localStorage.setItem(storageKey, String(value));
    },
    [storageKey],
  );

  const setClamped = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, Math.round(next)));
      setWidth(clamped);
      persist(clamped);
    },
    [max, min, persist],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startWidth: width };
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const raw = event.clientX - dragRef.current.startX;
      const delta = direction === "left-grows" ? -raw : raw;
      setClamped(dragRef.current.startWidth + delta);
    },
    [direction, setClamped],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (event.currentTarget as Element).releasePointerCapture(event.pointerId);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // For a left-anchored separator on a right-anchored sidebar:
      //   ArrowLeft  → make the sidebar wider (grow into the page)
      //   ArrowRight → make it narrower
      // For a right-grows panel the mapping flips.
      const grow = direction === "left-grows" ? -1 : 1;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setClamped(width + grow * -keyboardStep);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setClamped(width + grow * keyboardStep);
      } else if (event.key === "Home") {
        event.preventDefault();
        setClamped(max);
      } else if (event.key === "End") {
        event.preventDefault();
        setClamped(min);
      }
    },
    [direction, keyboardStep, max, min, setClamped, width],
  );

  return {
    width,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    onKeyDown,
  };
}
