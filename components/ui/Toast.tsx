"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react/ssr";

type ToastTone = "success" | "danger" | "neutral";

const toneClasses: Record<ToastTone, string> = {
  success: "border-success/40 text-success",
  danger: "border-danger/40 text-danger",
  neutral: "border-border text-foreground",
};

// A transient, non-blocking notice pinned under the top bar. Rendered through a portal to
// document.body for the same reason as ConfirmDialog (TopBar's backdrop-blur would trap a
// fixed element). Only mounted when `message` is set, which happens after an interaction, so
// the portal never renders on the server.
export function Toast({
  message,
  icon,
  tone = "neutral",
  duration = 4000,
  onDismiss,
}: {
  message: ReactNode | null;
  icon?: ReactNode;
  tone?: ToastTone;
  duration?: number;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (message === null) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4 lg:top-20">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border bg-surface py-2 pl-3 pr-1 font-medium shadow-lg motion-safe:animate-[toast-in_200ms_ease-out] ${toneClasses[tone]}`}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="text-sm">{message}</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}
