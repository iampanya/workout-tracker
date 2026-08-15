import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getLocalDateString, getWeekStart, getWeekEnd } from "@/lib/date";
import { computeStreakDays } from "./streak";

export type InProgressSession = Database["public"]["Tables"]["sessions"]["Row"] & {
  routineName: string | null;
};
export type SessionPr = { exerciseName: string; weightKg: number };

export async function listInProgressSessions(
  supabase: SupabaseClient<Database>
): Promise<InProgressSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*, routine:routines(name)")
    .is("completed_at", null)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const { routine, ...session } = row as typeof row & { routine: { name: string } | null };
    return { ...session, routineName: routine?.name ?? null };
  });
}

// Request-scoped, deduplicated accessor for the in-progress list. The app layout
// (resume link) and the dashboard page both need this on a dashboard load; wrapping
// it in React.cache with a self-created client (no varying args) makes both callers
// share one query per render instead of issuing two identical round-trips. Mirrors
// getAuthUser in lib/supabase/auth.ts. Callers that pass their own client (e.g. tests)
// keep using listInProgressSessions directly. (Next docs: Reusing data with React.cache.)
export const getInProgressSessions = cache(async (): Promise<InProgressSession[]> => {
  const supabase = await createServerSupabaseClient();
  return listInProgressSessions(supabase);
});

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

export type WeeklyVolumePoint = { weekStart: string; volumeKg: number };

// Training volume (sum of weight_kg × reps over non-warmup sets) bucketed by the
// Monday-start week of each session's session_date, oldest→newest, zero-filled so
// the chart always shows a continuous `weeks`-wide window.
export async function getWeeklyVolume(
  supabase: SupabaseClient<Database>,
  userId: string,
  weeks = 8,
  now: Date = new Date()
): Promise<WeeklyVolumePoint[]> {
  // Build the ordered list of week-start labels (oldest → current).
  const buckets: WeeklyVolumePoint[] = [];
  const bucketIndex = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ref = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
    const weekStart = getWeekStart(ref);
    if (!bucketIndex.has(weekStart)) {
      bucketIndex.set(weekStart, buckets.length);
      buckets.push({ weekStart, volumeKg: 0 });
    }
  }
  const windowStart = buckets[0].weekStart;

  // Single round-trip: pull each non-warmup set together with its session's date via a
  // two-level inner join, filtering to completed sessions inside the window. The old
  // two-query form (fetch session ids, then sets in those ids) cost an extra serial
  // round-trip to build a session→week map that we can now derive per set inline.
  const { data: sets, error: setsError } = await supabase
    .from("sets")
    .select("weight_kg, reps, session_exercises!inner(sessions!inner(session_date, completed_at))")
    .eq("user_id", userId)
    .eq("is_warmup", false)
    .not("session_exercises.sessions.completed_at", "is", null)
    .gte("session_exercises.sessions.session_date", windowStart)
    .lte("session_exercises.sessions.session_date", getLocalDateString(now));
  if (setsError) throw new Error(setsError.message);

  for (const set of (sets ?? []) as unknown as {
    weight_kg: number;
    reps: number;
    session_exercises: { sessions: { session_date: string } };
  }[]) {
    const weekStart = getWeekStart(
      new Date(`${set.session_exercises.sessions.session_date}T00:00:00`)
    );
    const idx = bucketIndex.get(weekStart);
    if (idx === undefined) continue; // outside the window (shouldn't happen given the filter)
    buckets[idx].volumeKg += Number(set.weight_kg) * set.reps;
  }

  return buckets;
}

export type TopPr = { exerciseName: string; weightKg: number };

// All-time top lifts (max non-warmup weight per exercise), from the live exercise_prs view.
// Exercise names are fetched in a second query rather than a PostgREST embed: exercise_prs
// is a view without FK metadata, so `exercises(name)` embedding isn't reliably resolvable.
export async function listTopPrs(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 6
): Promise<TopPr[]> {
  const { data: prs, error: prsError } = await supabase
    .from("exercise_prs")
    .select("exercise_id, pr_weight_kg")
    .eq("user_id", userId)
    .order("pr_weight_kg", { ascending: false })
    .limit(limit);
  if (prsError) throw new Error(prsError.message);

  const rows = (prs ?? []).filter(
    (row): row is { exercise_id: string; pr_weight_kg: number } =>
      row.exercise_id !== null && row.pr_weight_kg !== null
  );
  if (rows.length === 0) return [];

  const { data: exercises, error: exercisesError } = await supabase
    .from("exercises")
    .select("id, name")
    .in(
      "id",
      rows.map((r) => r.exercise_id)
    );
  if (exercisesError) throw new Error(exercisesError.message);

  const nameById = new Map((exercises ?? []).map((e) => [e.id, e.name]));
  return rows
    .filter((row) => nameById.has(row.exercise_id))
    .map((row) => ({
      exerciseName: nameById.get(row.exercise_id)!,
      weightKg: Number(row.pr_weight_kg),
    }));
}

export async function listPrsFromLastCompletedSession(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<SessionPr[]> {
  const { data: lastSession, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!lastSession) return [];

  // The last session's sets and the all-time PR view are independent (sets keys off
  // lastSession.id, prs off userId), so fetch them in parallel — one round-trip pair
  // instead of two in series. This is the dashboard's longest fetch chain.
  const [setsResult, prsResult] = await Promise.all([
    supabase
      .from("sets")
      .select("weight_kg, exercise_id, exercises(name), session_exercises!inner(session_id)")
      .eq("session_exercises.session_id", lastSession.id)
      .eq("is_warmup", false),
    supabase.from("exercise_prs").select("exercise_id, pr_weight_kg").eq("user_id", userId),
  ]);
  const { data: sets, error: setsError } = setsResult;
  if (setsError) throw new Error(setsError.message);
  const { data: prs, error: prsError } = prsResult;
  if (prsError) throw new Error(prsError.message);

  const prByExercise = new Map((prs ?? []).map((p) => [p.exercise_id, Number(p.pr_weight_kg)]));
  const seen = new Set<string>();
  const results: SessionPr[] = [];

  for (const set of (sets ?? []) as unknown as {
    weight_kg: number;
    exercise_id: string;
    exercises: { name: string };
  }[]) {
    const prWeight = prByExercise.get(set.exercise_id);
    if (prWeight !== undefined && Number(set.weight_kg) === prWeight && !seen.has(set.exercise_id)) {
      seen.add(set.exercise_id);
      results.push({ exerciseName: set.exercises.name, weightKg: prWeight });
    }
  }

  return results;
}
