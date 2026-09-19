// Format a Prisma `@db.Date` column (e.g. sessions.session_date) as YYYY-MM-DD. Prisma
// returns a date-only column as a Date at UTC midnight, so slice the ISO string — do NOT use
// getLocalDateString here, whose local parts would shift the calendar day on a non-UTC server.
export function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Monday-based week boundaries as local YYYY-MM-DD strings. Build dates via the local
// `new Date(year, month, day)` constructor, never `new Date(dateString)` / `.toISOString()`,
// which UTC-shift the calendar day.
export function getWeekStart(d: Date = new Date()): string {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  return getLocalDateString(monday);
}

export function getWeekEnd(d: Date = new Date()): string {
  const day = d.getDay();
  const diffToSunday = day === 0 ? 0 : 7 - day;
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToSunday);
  return getLocalDateString(sunday);
}
