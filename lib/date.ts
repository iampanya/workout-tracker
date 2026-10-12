import { TIME_ZONE } from "@/i18n/config";

// Calendar days are YYYY-MM-DD strings throughout. Nothing here reads the runtime's local time
// zone: "today" is computed in the app's TIME_ZONE (Vercel runs in UTC, users are in Bangkok),
// and day/week arithmetic is done in UTC on the date-only string, so the result is the same on
// any server or browser.

// Format a Prisma `@db.Date` column (e.g. sessions.session_date) as YYYY-MM-DD. Prisma
// returns a date-only column as a Date at UTC midnight, so slice the ISO string — do NOT use
// getTodayString here, which would shift the calendar day by the TIME_ZONE offset.
export function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// The calendar date of the instant `now` in `timeZone` (default: the app's TIME_ZONE) — the
// user's "today" for Today/Yesterday labels, streaks, week boundaries and a new session's date.
export function getTodayString(now: Date = new Date(), timeZone: string = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function toUtcDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// "2026-01-31" + 1 -> "2026-02-01". Negative `days` go back.
export function addDays(dateStr: string, days: number): string {
  const d = toUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnlyString(d);
}

// Monday-based week boundaries of a YYYY-MM-DD calendar day.
export function getWeekStart(dateStr: string): string {
  const day = toUtcDate(dateStr).getUTCDay(); // 0=Sun..6=Sat
  return addDays(dateStr, day === 0 ? -6 : 1 - day);
}

export function getWeekEnd(dateStr: string): string {
  return addDays(getWeekStart(dateStr), 6);
}
