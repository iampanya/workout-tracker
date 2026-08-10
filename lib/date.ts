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
