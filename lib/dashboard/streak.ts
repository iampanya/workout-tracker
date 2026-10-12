import { addDays } from "@/lib/date";

// Consecutive-day streak of completed sessions ending at (or the day before) today.
// Today not yet logged does not zero the streak — we start counting from yesterday.
export function computeStreakDays(sessionDates: readonly string[], todayStr: string): number {
  const dates = new Set(sessionDates);
  // today has no session yet — start from yesterday
  let cursor = dates.has(todayStr) ? todayStr : addDays(todayStr, -1);

  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
