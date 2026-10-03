"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A bottom sheet on phones, a centered dialog from `sm` up. Like ConfirmDialog it renders
// through a portal to document.body (an ancestor's backdrop-blur would trap position: fixed),
// closes on Escape / overlay tap, locks page scroll, and returns focus to whatever had it
// before opening (the trigger) when it closes.
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
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
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
