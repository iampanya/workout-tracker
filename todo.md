# TODO: Add an "Overview" stats section to the dashboard

> Saved from a `/grill-me` session on 2026-08-10. Not started yet — pick this up in the next session.

## Context

User reported the dashboard shows nothing but the "Start a Workout" button. Investigation against the real local DB (user `panya.piksawong@gmail.com`) showed this is **not a bug**: `listInProgressSessions` is empty because no session is in progress, and `listPrsFromLastCompletedSession` is empty because the last completed session's only set (Bicep Curl 15kg) didn't tie the all-time PR for that exercise (20kg) — exactly the intentional behavior locked in by commit `ebb6cf44` ("logic is correct as-is"). That logic stays untouched.

The user confirmed the underlying feeling is that the dashboard looks "weirdly empty" — both because there's genuinely no content shown after a normal (non-PR) workout, and because there's no polished empty/zero state. Rather than touching the PR-matching logic, the agreed fix is to add a new **Overview stats** section (streak / sessions this week / volume this week) that always renders with real numbers, including zeros — giving the dashboard content on every visit regardless of PR status.

## Requirements (decided with the user, do not re-litigate)

- Streak = consecutive **days** with a completed session (day streak, not week streak), gap of 1 day breaks it, today not-yet-logged doesn't zero it out.
- "This week" = Monday–Sunday, for both session count and volume.
- Volume = sum of `weight_kg × reps` over non-warmup sets only, in kg.
- All 3 stats always show, including real zeros for a brand-new user — no separate empty-state suppression needed.
- Page order: Start Workout → In Progress → **Overview (new)** → Top lifts from last workout.
- `listInProgressSessions` and `listPrsFromLastCompletedSession` are out of scope — do not modify.
- The ~102 stray `test-*@test.local` users/sessions found in the local DB during investigation are unrelated DB pollution from `test:db` runs not tearing down — explicitly deferred to a **separate, unrelated task**, not part of this change.

## Implementation plan

### 1. `lib/date.ts` — add week-boundary helpers

Add after `getLocalDateString`:

```ts
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
```

Build dates via the local `new Date(year, month, day)` constructor, never `new Date(dateString)` / `.toISOString()` (UTC-shifts the calendar day).

**Tests** — add to `lib/date.test.ts`:
- Mid-week Wednesday `new Date(2026, 0, 7)` → start `"2026-01-05"`, end `"2026-01-11"`.
- Sunday `new Date(2026, 0, 11)` → start `"2026-01-05"` (back to that week's Monday).
- Monday `new Date(2026, 0, 5)` → start `"2026-01-05"` (itself), end `"2026-01-11"`.

### 2. `lib/dashboard/streak.ts` (new) — pure streak calculator

```ts
import { getLocalDateString } from "@/lib/date";

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
```

**Tests** — new file `lib/dashboard/streak.test.ts`, fixed `todayStr = "2026-01-08"`:
1. `[]` → `0`
2. `["2026-01-08", "2026-01-07", "2026-01-06"]` → `3` (today included)
3. `["2026-01-07", "2026-01-06"]` (today absent) → `2` (doesn't zero out)
4. `["2026-01-06"]` (today & yesterday absent) → `0`
5. `["2026-01-08", "2026-01-07", "2026-01-04"]` (gap at Jan 5–6) → `2`
6. `["2026-01-08", "2026-01-08", "2026-01-07"]` (duplicate) → `2`

**Wiring** — `package.json`: add `lib/dashboard/streak.test.ts` to the `"test"` script's file list, and add `--exclude lib/dashboard/streak.test.ts` to `"test:db"` (both scripts list files explicitly, not by glob — easy to miss).

### 3. `lib/dashboard/service.ts` — add `getOverviewStats`

```ts
import { getLocalDateString, getWeekStart, getWeekEnd } from "@/lib/date";
import { computeStreakDays } from "./streak";

export type OverviewStats = {
  streakDays: number;
  sessionsThisWeek: number;
  volumeThisWeekKg: number;
};

const STREAK_LOOKBACK_DAYS = 90;

// `now` is injectable (default wall-clock) so tests can pin "today". This runs
// server-side; `session_date` is written client-side using the browser's local
// calendar day (getLocalDateString in app/(app)/log/StartSessionButtons.tsx). If
// server and user are in different timezones, "today"/"this week" can be off by a
// day — a pre-existing property of how session_date works, not new here.
export async function getOverviewStats(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date()
): Promise<OverviewStats> {
  const todayStr = getLocalDateString(now);
  const lookbackStart = getLocalDateString(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - STREAK_LOOKBACK_DAYS)
  );
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  const { data: recentSessions, error: recentError } = await supabase
    .from("sessions")
    .select("id, session_date")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .gte("session_date", lookbackStart)
    .lte("session_date", todayStr)
    .order("session_date", { ascending: false });
  if (recentError) throw new Error(recentError.message);

  const streakDays = computeStreakDays(
    (recentSessions ?? []).map((s) => s.session_date),
    todayStr
  );

  const weekSessions = (recentSessions ?? []).filter(
    (s) => s.session_date >= weekStart && s.session_date <= weekEnd
  );
  const sessionsThisWeek = weekSessions.length;

  let volumeThisWeekKg = 0;
  if (weekSessions.length > 0) {
    const weekSessionIds = weekSessions.map((s) => s.id);
    const { data: weekSets, error: setsError } = await supabase
      .from("sets")
      .select("weight_kg, reps, session_exercises!inner(session_id)")
      .in("session_exercises.session_id", weekSessionIds)
      .eq("user_id", userId)
      .eq("is_warmup", false);
    if (setsError) throw new Error(setsError.message);
    volumeThisWeekKg = (weekSets ?? []).reduce(
      (sum, s) => sum + Number(s.weight_kg) * s.reps,
      0
    );
  }

  return { streakDays, sessionsThisWeek, volumeThisWeekKg };
}
```

One query always runs (streak + week-session lookup share the 90-day fetch), a second only if there are sessions this week. Reuses the exact `sets` + `session_exercises!inner(session_id)` + `.eq("user_id", userId)` filter shape already used in `listPrsFromLastCompletedSession` — no new migration or view, no new index (single-user, small volumes).

**Tests** — add to `lib/dashboard/service.test.ts`, new nested `describe("getOverviewStats", ...)` with its **own fresh test user** (separate `beforeAll` → `createTestUser(admin)`) so the existing top-level tests' seeded sessions (dated `2026-01-06`/`01-07`) can't pollute streak/week aggregation. Use three months >90 days apart, each starting on a Monday, to keep lookback windows from overlapping across `it()`s:

- **Streak + gap** (January, week starting `2026-01-05`): seed completed sessions `01-01` (isolated), `01-05`, `01-06`, `01-07`. Call with `now = 2026-01-08` (today not logged yet) → `streakDays === 3`.
- **Streak includes today**: add a completed session `01-08` to the same user, call again with `now = 2026-01-08` → `streakDays === 4`.
- **Week filtering** (May, week `05-04`..`05-10`): seed completed `05-04` (Mon, in), `05-10` (Sun, in), `05-03` (prev week, out), and a **started-but-not-finished** session `05-06` (in week but `completed_at` null, out). Call with `now = 2026-05-10` → `sessionsThisWeek === 2`.
- **Volume math + warmup exclusion** (September, week `09-07`..`09-13`): seed completed `09-08` with a warmup set (40kg×10, excluded) and two working sets (100kg×5, 90kg×8); seed completed `09-14` (next week) with a 999kg×1 working set. Call with `now = 2026-09-08` → `volumeThisWeekKg === 1220`, `sessionsThisWeek === 1` (cross-week set/session excluded).

Use existing seeding helpers already imported in this test file: `startSessionForUser`, `addExerciseToSessionForUser`, `logSetForUser`, `finishSessionForUser`, `createCustomExerciseForUser`.

### 4. `app/(app)/dashboard/page.tsx` — wire up the UI

- Import `getOverviewStats` from `@/lib/dashboard/service`, and `Fire`, `CalendarCheck`, `Barbell` from `@phosphor-icons/react/ssr` (all three confirmed present in that subpath).
- Add a third parallel call: `getOverviewStats(supabase, user!.id)` alongside the existing two in the `Promise.all`.
- Insert a new, **unconditionally rendered** section between "In Progress" and "Top lifts from your last workout":

```tsx
<section className="space-y-2">
  <h2 className="font-medium">Overview</h2>
  <div className="grid grid-cols-3 gap-2">
    <StatCard
      label="Streak"
      value={overview.streakDays}
      unit={overview.streakDays === 1 ? "day" : "days"}
      icon={<Fire className="h-4 w-4" />}
      tone={overview.streakDays > 0 ? "success" : "neutral"}
    />
    <StatCard
      label="This week"
      value={overview.sessionsThisWeek}
      unit={overview.sessionsThisWeek === 1 ? "session" : "sessions"}
      icon={<CalendarCheck className="h-4 w-4" />}
    />
    <StatCard
      label="Volume"
      value={Math.round(overview.volumeThisWeekKg).toLocaleString()}
      unit="kg"
      icon={<Barbell className="h-4 w-4" />}
    />
  </div>
</section>
```

Unlike the `inProgress`/`recentPrs` sections, this one has **no `.length > 0` guard** — it must always show, including all-zero for a new user. Use `gap-2` (not the PR grid's `gap-3`) and short labels ("Streak"/"This week"/"Volume") to fit 3 columns at 375px width; `StatCard`'s label already truncates and its value div wraps rather than clips, so this is a visual polish check during manual verification, not a correctness risk.

## Files touched

New: `lib/dashboard/streak.ts`, `lib/dashboard/streak.test.ts`
Modified: `lib/date.ts`, `lib/date.test.ts`, `lib/dashboard/service.ts`, `lib/dashboard/service.test.ts`, `app/(app)/dashboard/page.tsx`, `package.json`
Untouched (confirmed out of scope): `listInProgressSessions`, `listPrsFromLastCompletedSession`, no DB migration/view added.

## Verification (once implemented)

1. `npx tsc --noEmit && npm run lint`
2. `npm test` — confirms `lib/date.test.ts` (new week-boundary cases) and `lib/dashboard/streak.test.ts` pass without a DB.
3. `DOTENV_CONFIG_PATH=.env.local npm run test:db` (requires `supabase start` running) — confirms the new `getOverviewStats` describe block passes against the real local Supabase instance.
4. Manual browser check via dev server: load `/dashboard` as the real user (`panya.piksawong@gmail.com`), confirm the new "Overview" section renders between "In Progress" and "Top lifts" with real numbers; resize to 375px width and check the 3-column stat grid doesn't look cramped or wrap awkwardly.

## Follow-up (separate, unrelated task — not part of this change)

Clean up the ~102 stray `test-*@test.local` users and their orphaned sessions/sets in the local DB (leftover from `test:db` runs not tearing down).
