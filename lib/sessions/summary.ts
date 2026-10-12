// Pure, DB-free helpers for the session-detail (history) view. Kept separate from
// history.ts (which pulls in the Prisma client) so these can run under plain `npm test`.

import { isBetterSet, type PrRecord } from "@/lib/pr";

export type SetSummary = {
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
  set_number: number;
};

export type ExerciseSummary = {
  exerciseName: string;
  sets: SetSummary[];
};

export type SessionSummary = {
  exerciseCount: number;
  // Working sets only — warmups are excluded here just as they are from volume and PRs.
  setCount: number;
  // Volume load = weight × reps summed over working sets only (warmups excluded, matching
  // how PRs are computed elsewhere).
  totalVolumeKg: number;
};

export function computeSessionSummary(exercises: ExerciseSummary[]): SessionSummary {
  let setCount = 0;
  let totalVolumeKg = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.is_warmup) {
        setCount += 1;
        totalVolumeKg += set.weight_kg * set.reps;
      }
    }
  }
  return {
    exerciseCount: exercises.length,
    setCount,
    totalVolumeKg: Math.round(totalVolumeKg),
  };
}

// The heaviest working set of an exercise (warmups ignored), ties broken by higher reps.
// Returns null when the exercise has only warmups or no sets at all.
export function topWorkingSet(sets: SetSummary[]): SetSummary | null {
  let best: SetSummary | null = null;
  for (const set of sets) {
    if (set.is_warmup) continue;
    if (best === null || isBetterSet(toRecord(set), toRecord(best))) best = set;
  }
  return best;
}

function toRecord(set: SetSummary): PrRecord {
  return { weightKg: set.weight_kg, reps: set.reps };
}

// Display set numbers: each working set's position among the working sets, in the given (logged)
// order; warmups get null and are shown as "W". Never the stored set_number, which counts warmups
// and keeps gaps after a delete. e.g. [W, W, work, work, W, work] -> [null, null, 1, 2, null, 3].
export function workingSetNumbers(sets: { is_warmup: boolean }[]): (number | null)[] {
  let n = 0;
  return sets.map((set) => (set.is_warmup ? null : ++n));
}

// Per-exercise counts, rendered by the `common.setCount` message ("2 sets + 2W" / "2 เซ็ต + 2W").
export function countSets(sets: { is_warmup: boolean }[]): { working: number; warmups: number } {
  const warmups = sets.filter((s) => s.is_warmup).length;
  return { working: sets.length - warmups, warmups };
}

// Formats calendar parts as a UTC date so no timezone can shift the day. `locale` "th" gives
// Buddhist Era years.
function formatUtcDate(dateStr: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  );
}

// "2026-08-11" -> "Aug 11, 2026" (en) / "11 ส.ค. 2569" (th).
export function formatSessionDate(dateStr: string, locale: string): string {
  return formatUtcDate(dateStr, locale, { month: "short", day: "numeric", year: "numeric" });
}

// Whole minutes between start and completion, or null if either timestamp is missing
// or the result isn't a positive duration.
export function sessionDurationMinutes(
  startedAt: string | null,
  completedAt: string | null
): number | null {
  if (!startedAt || !completedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const minutes = Math.round((end - start) / 60000);
  return minutes > 0 ? minutes : null;
}

// 75 -> { hours: 1, minutes: 15, mm: "15" }, rendered by the `common.duration` message
// ("45 min" / "1h 15m"; "45 นาที" / "1 ชม. 15 นาที").
export function splitDuration(minutes: number): { hours: number; minutes: number; mm: string } {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return { hours, minutes: rest, mm: String(rest).padStart(2, "0") };
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// Whole days from `from` to `to` (both YYYY-MM-DD), computed in UTC so no timezone can shift it.
function dayDiff(from: string, to: string): number | null {
  const a = parseDateParts(from);
  const b = parseDateParts(to);
  if (!a || !b) return null;
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

// "2026-09-23" -> "Wed, Sep 23" (en) / "พ. 23 ก.ย." (th).
export function formatShortDate(dateStr: string, locale: string): string {
  return formatUtcDate(dateStr, locale, { weekday: "short", month: "short", day: "numeric" });
}

// Today / Yesterday (the caller's translated labels), the short form within the same year,
// else the full date. `today` is the user's calendar date in TIME_ZONE (getTodayString).
export function formatRelativeDate(
  dateStr: string,
  today: string,
  locale: string,
  labels: { today: string; yesterday: string }
): string {
  const diff = dayDiff(dateStr, today);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  const parts = parseDateParts(dateStr);
  const todayParts = parseDateParts(today);
  if (parts && todayParts && parts.year === todayParts.year) return formatShortDate(dateStr, locale);
  return formatSessionDate(dateStr, locale);
}

// "2026-09-23" -> "September 2026" / "กันยายน 2569", the month group heading in History.
export function formatMonthHeading(dateStr: string, locale: string): string {
  return formatUtcDate(dateStr, locale, { month: "long", year: "numeric" });
}

// "2026-09-23" -> "9/23" (en) / "23/9" (th) for compact chart axes.
export function formatAxisDate(dateStr: string, locale: string): string {
  return formatUtcDate(dateStr, locale, { month: "numeric", day: "numeric" });
}
