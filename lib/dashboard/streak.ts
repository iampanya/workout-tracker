import { getLocalDateString } from "@/lib/date";

// Consecutive-day streak of completed sessions ending at (or the day before) today.
// Today not yet logged does not zero the streak — we start counting from yesterday.
export function computeStreakDays(sessionDates: readonly string[], todayStr: string): number {
  const dates = new Set(sessionDates);
  const [y, m, d] = todayStr.split("-").map(Number);
  const cursor = new Date(y, m - 1, d);

  if (!dates.has(getLocalDateString(cursor))) {
    cursor.setDate(cursor.getDate() - 1); // today has no session yet — start from yesterday
  }

  let streak = 0;
  while (dates.has(getLocalDateString(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
