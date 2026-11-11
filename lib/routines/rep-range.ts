// A routine exercise's target rep range and how it round-trips through the routine page's
// <select> and the routine_exercises.target_reps_min/max columns. Pure and DB-free.

export type RepRange = { min: number; max: number };

// Used when the session didn't come from a routine, or the routine entry has no range.
export const DEFAULT_REP_RANGE: RepRange = { min: 8, max: 12 };

// Choices on the routine page.
export const REP_RANGE_PRESETS: RepRange[] = [
  { min: 3, max: 5 },
  { min: 5, max: 8 },
  { min: 6, max: 10 },
  { min: 8, max: 12 },
  { min: 10, max: 15 },
  { min: 12, max: 20 },
  { min: 15, max: 25 },
];

// The stored columns as a range; both are set or both are NULL (= use the default).
export function toRepRange(min: number | null, max: number | null): RepRange | null {
  return min !== null && max !== null ? { min, max } : null;
}

// <select> value for a range ("" = use the default).
export function repRangeValue(range: RepRange | null): string {
  return range ? `${range.min}-${range.max}` : "";
}

export function parseRepRange(value: string): RepRange | null {
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (!match) return null;
  const range = { min: Number(match[1]), max: Number(match[2]) };
  return range.min <= range.max ? range : null;
}
