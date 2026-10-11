"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A bottom sheet on phones, a centered dialog from `sm` up. Like ConfirmDialog it renders
// through a portal to document.body (an ancestor's backdrop-blur would trap position: fixed),
// closes on Escape / overlay tap, locks page scroll, and returns focus to whatever had it
// before opening (the trigger) when it closes.
//
// While open it also pushes a same-URL history entry, so the Android / browser Back button
// closes the sheet instead of leaving the page. Closing any other way pops that entry again.
// (Next's patched pushState copies its router state into the entry; popping back to the page's
// own entry is a same-URL traverse that restores from cache — no reload, client state kept.)
const SHEET_HISTORY_KEY = "__sheet";
export function Sheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the element that titles the sheet. */
  labelledBy: string;
  children: ReactNode;
}) {
  // Latest onClose without re-running the open/close effect (which would steal focus back).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const token = crypto.randomUUID();
    window.history.pushState({ [SHEET_HISTORY_KEY]: token }, "");
    // Back popped our entry: just close (the entry is already gone).
    function onPopState() {
      onCloseRef.current();
    }
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Remove before history.back() below, so our own pop doesn't call onClose again.
      window.removeEventListener("popstate", onPopState);
      document.body.style.overflow = previousOverflow;
      // Closed via the UI: pop our entry so the next Back leaves the page as expected. Skipped
      // when Back already popped it, or when we're unmounting because the route changed (the
      // current entry then belongs to the new page and must not be undone).
      if (window.history.state?.[SHEET_HISTORY_KEY] === token) window.history.back();
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-lg motion-safe:animate-[sheet-up_220ms_ease-out] sm:h-[min(80vh,640px)] sm:max-w-lg sm:rounded-2xl sm:pb-0 sm:motion-safe:animate-[dialog-in_180ms_ease-out]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
