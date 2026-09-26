"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Timer, X } from "@phosphor-icons/react/ssr";
import {
  formatClock,
  remainingSeconds,
  REST_PRESETS,
  DEFAULT_REST_SECONDS,
} from "@/lib/rest-timer";

const STORAGE_KEY = "rest-timer-seconds";
const CHANGE_EVENT = "rest-timer-seconds-change";

// The chosen rest length lives in localStorage (a per-device preference). Read through
// useSyncExternalStore so the server render uses the default and the client swaps in the
// stored value without a hydration mismatch.
function readStoredDuration(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return (REST_PRESETS as readonly number[]).includes(stored) ? stored : DEFAULT_REST_SECONDS;
  } catch {
    return DEFAULT_REST_SECONDS;
  }
}

function subscribeDuration(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function storeDuration(seconds: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(seconds));
  } catch {
    // Storage unavailable (private mode) — the choice just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Rest countdown shown in the logging screen's sticky action bar. `startedAt` (ms epoch) is set by
// the parent whenever a set is logged; null means no rest in progress. The remaining time is
// derived from the wall clock each tick (see lib/rest-timer.ts), so it stays right in a
// backgrounded tab.
export function RestTimer({
  startedAt,
  onClear,
}: {
  startedAt: number | null;
  onClear: () => void;
}) {
  const duration = useSyncExternalStore(
    subscribeDuration,
    readStoredDuration,
    () => DEFAULT_REST_SECONDS
  );
  // "+30s" belongs to one rest period: keyed by its startedAt, so a new rest starts fresh.
  const [extra, setExtra] = useState<{ startedAt: number | null; seconds: number }>({
    startedAt: null,
    seconds: 0,
  });
  const [now, setNow] = useState(0);
  const buzzedFor = useRef<number | null>(null);

  const active = startedAt !== null;
  const total = duration + (extra.startedAt === startedAt ? extra.seconds : 0);
  // `now` lags a new startedAt by up to one tick; clamp so it never shows more than the total.
  const remaining = active ? Math.min(total, remainingSeconds(startedAt, total, now)) : 0;
  const done = active && remaining === 0;

  useEffect(() => {
    if (!active || done) return;
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [active, done]);

  useEffect(() => {
    if (done && buzzedFor.current !== startedAt) {
      buzzedFor.current = startedAt;
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [done, startedAt]);

  function cycleDuration() {
    const index = (REST_PRESETS as readonly number[]).indexOf(duration);
    storeDuration(REST_PRESETS[(index + 1) % REST_PRESETS.length]);
  }

  if (!active) {
    return (
      <button
        type="button"
        onClick={cycleDuration}
        aria-label={`Rest timer length ${duration} seconds, tap to change`}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted [touch-action:manipulation] hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Timer className="h-4 w-4" />
        {duration}s
      </button>
    );
  }

  return (
    <div
      className={`flex min-h-11 shrink-0 items-center gap-1 rounded-lg pl-3 ${
        done ? "bg-success/15 text-success" : "bg-surface-muted text-foreground"
      }`}
    >
      <Timer className="h-4 w-4 shrink-0" weight={done ? "fill" : "regular"} />
      <span className="min-w-[3.25rem] font-mono text-lg font-semibold tabular-nums">
        {done ? "Go!" : formatClock(remaining)}
      </span>
      {/* Announce only the end of the rest, not every tick. */}
      <span className="sr-only" aria-live="polite">
        {done ? "Rest over" : ""}
      </span>
      {!done && (
        <button
          type="button"
          onClick={() =>
            setExtra((prev) => ({
              startedAt,
              seconds: (prev.startedAt === startedAt ? prev.seconds : 0) + 30,
            }))
          }
          className="min-h-11 rounded-lg px-2 text-sm font-medium [touch-action:manipulation] hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          +30s
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label={done ? "Dismiss rest timer" : "Skip rest"}
        className="flex h-11 w-11 items-center justify-center rounded-lg [touch-action:manipulation] hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
