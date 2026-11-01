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

// An instant as an <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm") — wall time in
// `timeZone`, not the browser's zone.
export function toZonedDateTimeInput(instant: Date, timeZone: string = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// The zone's UTC offset at `instant`, in minutes ("GMT+07:00" -> 420, "GMT" -> 0).
function offsetMinutes(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")!.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

// A datetime-local value read as wall time in `timeZone`, as an ISO string with that zone's
// offset ("2026-10-12T00:30" -> "2026-10-12T00:30:00+07:00"). Null if it isn't a valid value.
export function fromZonedDateTimeInput(local: string, timeZone: string = TIME_ZONE): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Reject rollovers like month 13 or 25:00.
  if (new Date(wallAsUtc).toISOString().slice(0, 16) !== local) return null;
  // Offset at the guessed instant, then once more at the corrected one (DST edges).
  let offset = offsetMinutes(new Date(wallAsUtc), timeZone);
  offset = offsetMinutes(new Date(wallAsUtc - offset * 60_000), timeZone);
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local}:00${offset < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
