// Rule-based training analysis behind the /insights page: weekly sets per muscle group,
// per-exercise e1RM trends, a deload signal and consistency. Pure and DB-free (runs under
// `npm test`); dates are YYYY-MM-DD strings and nothing reads the local time zone.
import { addDays, getWeekStart } from "@/lib/date";
import { estimateOneRepMax } from "@/lib/pr";
import { MUSCLE_GROUPS, isMuscleGroup, type MuscleGroup } from "@/lib/validation";

export const WINDOW_WEEKS = 8;
const VOLUME_DAYS = 28;
export const LOW_SETS = 10;
export const HIGH_SETS = 20;
const MIN_TREND_SESSIONS = 4;
const RECENT_TREND_SESSIONS = 3;
const DECLINE_PCT = -5;
const DELOAD_MIN_DECLINING = 2;
const DELOAD_MIN_SHARE = 0.4;
const LIGHT_WEEK_RATIO = 0.6;
const LIGHT_WEEK_LOOKBACK = 4;
const SKIP_MIN_SESSIONS = 2;
const SKIP_SHARE = 0.5;
const MIN_SESSIONS = 2;

// Working sets only.
export type AnalysisSet = { weightKg: number; reps: number };
export type AnalysisExercise = { exerciseId: string; name: string; muscleGroup: string | null; sets: AnalysisSet[] };
export type AnalysisSession = { id: string; date: string; routineId: string | null; exercises: AnalysisExercise[] };
export type RoutineExerciseRef = { routineId: string; routineName: string; exerciseId: string; exerciseName: string };

export type VolumeBand = "low" | "optimal" | "high";
export type MuscleVolume = { group: MuscleGroup; setsPerWeek: number; sessionsPerWeek: number; band: VolumeBand };
export type TrendStatus = "progressing" | "plateau" | "declining";
export type ExerciseTrend = {
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  status: TrendStatus;
  changePct: number;
  sessions: number;
};
export type WeekTotal = { weekStart: string; volumeKg: number; sessions: number; partial: boolean };
export type DeloadSignal = { signal: boolean; declining: number; scored: number; weeksSinceLightWeek: number | null };
export type SkippedExercise = RoutineExerciseRef & { skipped: number; sessions: number };
export type Consistency = { weeks: WeekTotal[]; averagePerWeek: number; skipped: SkippedExercise[] };
export type Insights = {
  hasEnoughData: boolean;
  muscleVolume: MuscleVolume[];
  trends: ExerciseTrend[];
  deload: DeloadSignal;
  consistency: Consistency;
};

// The Monday-start weeks of the analysis window, oldest first; the last is the current week.
export function windowWeeks(todayStr: string): string[] {
  const current = getWeekStart(todayStr);
  return Array.from({ length: WINDOW_WEEKS }, (_, i) => addDays(current, -7 * (WINDOW_WEEKS - 1 - i)));
}

export function volumeBand(setsPerWeek: number): VolumeBand {
  if (setsPerWeek < LOW_SETS) return "low";
  if (setsPerWeek > HIGH_SETS) return "high";
  return "optimal";
}

// Average working sets (and sessions touching the group) per week over the last 28 days.
export function muscleVolume(sessions: AnalysisSession[], todayStr: string): MuscleVolume[] {
  const from = addDays(todayStr, -(VOLUME_DAYS - 1));
  const setCounts = new Map<MuscleGroup, number>();
  const sessionCounts = new Map<MuscleGroup, number>();
  for (const session of sessions) {
    if (session.date < from || session.date > todayStr) continue;
    const trained = new Set<MuscleGroup>();
    for (const exercise of session.exercises) {
      const group = exercise.muscleGroup;
      if (!isMuscleGroup(group) || exercise.sets.length === 0) continue;
      setCounts.set(group, (setCounts.get(group) ?? 0) + exercise.sets.length);
      trained.add(group);
    }
    for (const group of trained) sessionCounts.set(group, (sessionCounts.get(group) ?? 0) + 1);
  }
  const weeks = VOLUME_DAYS / 7;
  return MUSCLE_GROUPS.map((group) => {
    const setsPerWeek = (setCounts.get(group) ?? 0) / weeks;
    return { group, setsPerWeek, sessionsPerWeek: (sessionCounts.get(group) ?? 0) / weeks, band: volumeBand(setsPerWeek) };
  });
}

export function trendStatus(changePct: number): TrendStatus {
  if (changePct > 0) return "progressing";
  if (changePct <= DECLINE_PCT) return "declining";
  return "plateau";
}

// `sessions` oldest first. Best e1RM of the last 3 sessions vs the best before them.
export function exerciseTrends(sessions: AnalysisSession[]): ExerciseTrend[] {
  const byExercise = new Map<string, { name: string; muscleGroup: string | null; bests: number[] }>();
  for (const session of sessions) {
    const bestInSession = new Map<string, number>();
    for (const exercise of session.exercises) {
      if (exercise.sets.length === 0) continue;
      const best = Math.max(...exercise.sets.map((s) => estimateOneRepMax(s.weightKg, s.reps)));
      bestInSession.set(exercise.exerciseId, Math.max(bestInSession.get(exercise.exerciseId) ?? 0, best));
      if (!byExercise.has(exercise.exerciseId)) {
        byExercise.set(exercise.exerciseId, { name: exercise.name, muscleGroup: exercise.muscleGroup, bests: [] });
      }
    }
    for (const [exerciseId, best] of bestInSession) byExercise.get(exerciseId)!.bests.push(best);
  }

  const trends: ExerciseTrend[] = [];
  for (const [exerciseId, { name, muscleGroup, bests }] of byExercise) {
    if (bests.length < MIN_TREND_SESSIONS) continue;
    const earlier = Math.max(...bests.slice(0, -RECENT_TREND_SESSIONS));
    const recent = Math.max(...bests.slice(-RECENT_TREND_SESSIONS));
    if (earlier <= 0) continue;
    const changePct = Math.round(((recent - earlier) / earlier) * 1000) / 10;
    trends.push({ exerciseId, name, muscleGroup, status: trendStatus(changePct), changePct, sessions: bests.length });
  }
  return trends.sort((a, b) => b.changePct - a.changePct);
}

// Sessions and working volume (Σ weight × reps) per window week; the current week is partial.
export function weeklyTotals(sessions: AnalysisSession[], todayStr: string): WeekTotal[] {
  const weeks = windowWeeks(todayStr);
  const current = weeks[weeks.length - 1];
  const totals = weeks.map((weekStart) => ({ weekStart, volumeKg: 0, sessions: 0, partial: weekStart === current }));
  const index = new Map(weeks.map((weekStart, i) => [weekStart, i]));
  for (const session of sessions) {
    if (session.date > todayStr) continue;
    const i = index.get(getWeekStart(session.date));
    if (i === undefined) continue;
    totals[i].sessions += 1;
    for (const exercise of session.exercises) {
      for (const s of exercise.sets) totals[i].volumeKg += s.weightKg * s.reps;
    }
  }
  return totals;
}

// Complete weeks oldest first. A week is light when its volume is under 60% of the mean of
// the (up to 4) weeks before it. Returns how many weeks ago the latest light week was.
export function weeksSinceLightWeek(completeWeekVolumes: number[]): number | null {
  let lastLight = -1;
  for (let i = 1; i < completeWeekVolumes.length; i++) {
    const prior = completeWeekVolumes.slice(Math.max(0, i - LIGHT_WEEK_LOOKBACK), i);
    const mean = prior.reduce((sum, v) => sum + v, 0) / prior.length;
    if (mean > 0 && completeWeekVolumes[i] < LIGHT_WEEK_RATIO * mean) lastLight = i;
  }
  return lastLight === -1 ? null : completeWeekVolumes.length - 1 - lastLight;
}

export function deloadSignal(trends: ExerciseTrend[], completeWeekVolumes: number[]): DeloadSignal {
  const declining = trends.filter((t) => t.status === "declining").length;
  const scored = trends.length;
  return {
    signal: declining >= DELOAD_MIN_DECLINING && declining / scored >= DELOAD_MIN_SHARE,
    declining,
    scored,
    weeksSinceLightWeek: weeksSinceLightWeek(completeWeekVolumes),
  };
}

// Current routine exercises with no logged working set in at least half of that routine's
// sessions (routines with 2+ sessions only).
export function skippedRoutineExercises(
  sessions: AnalysisSession[],
  routineExercises: RoutineExerciseRef[]
): SkippedExercise[] {
  const byRoutine = new Map<string, AnalysisSession[]>();
  for (const session of sessions) {
    if (!session.routineId) continue;
    byRoutine.set(session.routineId, [...(byRoutine.get(session.routineId) ?? []), session]);
  }
  const result: SkippedExercise[] = [];
  for (const ref of routineExercises) {
    const routineSessions = byRoutine.get(ref.routineId) ?? [];
    if (routineSessions.length < SKIP_MIN_SESSIONS) continue;
    const skipped = routineSessions.filter(
      (s) => !s.exercises.some((e) => e.exerciseId === ref.exerciseId && e.sets.length > 0)
    ).length;
    if (skipped / routineSessions.length >= SKIP_SHARE) result.push({ ...ref, skipped, sessions: routineSessions.length });
  }
  return result;
}

export function buildInsights(
  sessions: AnalysisSession[],
  routineExercises: RoutineExerciseRef[],
  todayStr: string
): Insights {
  const start = windowWeeks(todayStr)[0];
  const inWindow = sessions
    .filter((s) => s.date >= start && s.date <= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weeks = weeklyTotals(inWindow, todayStr);
  const complete = weeks.filter((w) => !w.partial);
  const trends = exerciseTrends(inWindow);
  return {
    hasEnoughData: inWindow.length >= MIN_SESSIONS,
    muscleVolume: muscleVolume(inWindow, todayStr),
    trends,
    deload: deloadSignal(trends, complete.map((w) => w.volumeKg)),
    consistency: {
      weeks,
      averagePerWeek: complete.reduce((sum, w) => sum + w.sessions, 0) / complete.length,
      skipped: skippedRoutineExercises(inWindow, routineExercises),
    },
  };
}
