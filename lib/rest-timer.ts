// Pure helpers for the logging screen's rest timer. The remaining time is always derived from
// the wall clock (startedAt + duration - now) rather than decremented per tick, so a
// backgrounded tab (throttled intervals) still shows the right value when it comes back.

export const REST_PRESETS = [60, 90, 120, 180] as const;
export const DEFAULT_REST_SECONDS = 90;

export function remainingSeconds(startedAt: number, durationSec: number, now: number): number {
  return Math.max(0, Math.ceil((startedAt + durationSec * 1000 - now) / 1000));
}

// 90 -> "1:30", 5 -> "0:05"
export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
