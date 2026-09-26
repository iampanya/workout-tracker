// Pure, DB-free helpers for the session-detail (history) view. Kept separate from
// history.ts (which pulls in the Supabase client) so these can run under plain `npm test`.

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
  // Every logged set, warmups included — the honest count of what happened.
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
      setCount += 1;
      if (!set.is_warmup) {
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
    if (
      best === null ||
      set.weight_kg > best.weight_kg ||
      (set.weight_kg === best.weight_kg && set.reps > best.reps)
    ) {
      best = set;
    }
  }
  return best;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "2026-08-11" -> "Aug 11, 2026". Parses the calendar parts directly rather than
// `new Date(str)`, which would UTC-shift the day across timezones.
export function formatSessionDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1] ?? month;
  return `${monthName} ${Number(day)}, ${year}`;
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

// 45 -> "45 min", 58 -> "58 min", 75 -> "1h 15m".
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

// "2026-09-23" -> "Wed, Sep 23". The weekday comes from a UTC date built from the calendar
// parts, so it never shifts across timezones.
export function formatShortDate(dateStr: string): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  const weekday = WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
  return `${weekday}, ${MONTHS[parts.month - 1]} ${parts.day}`;
}

// "Today" / "Yesterday" / "Wed, Sep 23" (same year) / "Sep 23, 2025" (other years).
// `today` is the viewer's local calendar date (getLocalDateString), passed in to keep this pure.
export function formatRelativeDate(dateStr: string, today: string): string {
  const diff = dayDiff(dateStr, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const parts = parseDateParts(dateStr);
  const todayParts = parseDateParts(today);
  if (parts && todayParts && parts.year === todayParts.year) return formatShortDate(dateStr);
  return formatSessionDate(dateStr);
}

// "2026-09-23" -> "September 2026", used as a month group heading in History.
export function formatMonthHeading(dateStr: string): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return `${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
}
