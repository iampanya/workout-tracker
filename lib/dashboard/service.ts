import { Prisma, type PrismaClient, type sessions } from "@prisma/client";
import { getLocalDateString, getWeekStart, getWeekEnd, toDateOnlyString } from "@/lib/date";
import { type CompletedSession, toCompletedSession } from "@/lib/sessions/serialize";
import { computeStreakDays } from "./streak";

export type InProgressSession = CompletedSession & { routineName: string | null };
export type SessionPr = { exerciseName: string; weightKg: number };

function serializeSession(s: sessions, routineName: string | null): InProgressSession {
  return { ...toCompletedSession(s), routineName };
}

export async function listInProgressSessions(
  db: PrismaClient,
  userId: string
): Promise<InProgressSession[]> {
  const rows = await db.sessions.findMany({
    where: { user_id: userId, completed_at: null },
    orderBy: { started_at: "desc" },
    include: { routines: { select: { name: true } } },
  });
  return rows.map(({ routines, ...session }) => serializeSession(session, routines?.name ?? null));
}

export type OverviewStats = {
  streakDays: number;
  sessionsThisWeek: number;
  volumeThisWeekKg: number;
};

const STREAK_LOOKBACK_DAYS = 90;

// `now` is injectable (default wall-clock) so tests can pin "today".
export async function getOverviewStats(
  db: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<OverviewStats> {
  const todayStr = getLocalDateString(now);
  const lookbackStart = getLocalDateString(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - STREAK_LOOKBACK_DAYS)
  );
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  const recentRows = await db.sessions.findMany({
    where: {
      user_id: userId,
      completed_at: { not: null },
      session_date: { gte: new Date(lookbackStart), lte: new Date(todayStr) },
    },
    orderBy: { session_date: "desc" },
    select: { id: true, session_date: true },
  });
  const recentSessions = recentRows.map((s) => ({ id: s.id, session_date: toDateOnlyString(s.session_date) }));

  const streakDays = computeStreakDays(
    recentSessions.map((s) => s.session_date),
    todayStr
  );

  const weekSessions = recentSessions.filter(
    (s) => s.session_date >= weekStart && s.session_date <= weekEnd
  );
  const sessionsThisWeek = weekSessions.length;

  let volumeThisWeekKg = 0;
  if (weekSessions.length > 0) {
    const weekSets = await db.sets.findMany({
      where: {
        user_id: userId,
        is_warmup: false,
        session_exercises: { session_id: { in: weekSessions.map((s) => s.id) } },
      },
      select: { weight_kg: true, reps: true },
    });
    volumeThisWeekKg = weekSets.reduce((sum, s) => sum + Number(s.weight_kg) * s.reps, 0);
  }

  return { streakDays, sessionsThisWeek, volumeThisWeekKg };
}

export type WeeklyVolumePoint = { weekStart: string; volumeKg: number };

// Training volume (Σ weight_kg × reps over non-warmup sets) bucketed by Monday-start week of
// each session's session_date, oldest→newest, zero-filled across the window.
export async function getWeeklyVolume(
  db: PrismaClient,
  userId: string,
  weeks = 8,
  now: Date = new Date()
): Promise<WeeklyVolumePoint[]> {
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

  const sets = await db.sets.findMany({
    where: {
      user_id: userId,
      is_warmup: false,
      session_exercises: {
        sessions: {
          completed_at: { not: null },
          session_date: { gte: new Date(windowStart), lte: new Date(getLocalDateString(now)) },
        },
      },
    },
    select: {
      weight_kg: true,
      reps: true,
      session_exercises: { select: { sessions: { select: { session_date: true } } } },
    },
  });

  for (const set of sets) {
    const dateStr = toDateOnlyString(set.session_exercises.sessions.session_date);
    const weekStart = getWeekStart(new Date(`${dateStr}T00:00:00`));
    const idx = bucketIndex.get(weekStart);
    if (idx === undefined) continue;
    buckets[idx].volumeKg += Number(set.weight_kg) * set.reps;
  }

  return buckets;
}

export type TopPr = { exerciseName: string; weightKg: number };

// All-time top lifts from the live exercise_prs view (read via raw SQL — it's a view, not a
// Prisma model). Names are fetched in a second query.
export async function listTopPrs(
  db: PrismaClient,
  userId: string,
  limit = 6
): Promise<TopPr[]> {
  const prs = await db.$queryRaw<{ exercise_id: string; pr_weight_kg: string | number }[]>(Prisma.sql`
    select exercise_id, pr_weight_kg from exercise_prs
    where user_id::text = ${userId}
    order by pr_weight_kg desc
    limit ${limit}`);

  const rows = prs.filter((row) => row.exercise_id !== null && row.pr_weight_kg !== null);
  if (rows.length === 0) return [];

  const exercises = await db.exercises.findMany({
    where: { id: { in: rows.map((r) => r.exercise_id) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));
  return rows
    .filter((row) => nameById.has(row.exercise_id))
    .map((row) => ({ exerciseName: nameById.get(row.exercise_id)!, weightKg: Number(row.pr_weight_kg) }));
}

export async function listPrsFromLastCompletedSession(
  db: PrismaClient,
  userId: string
): Promise<SessionPr[]> {
  const lastSession = await db.sessions.findFirst({
    where: { user_id: userId, completed_at: { not: null } },
    orderBy: { completed_at: "desc" },
    select: { id: true },
  });
  if (!lastSession) return [];

  const [sets, prs] = await Promise.all([
    db.sets.findMany({
      where: {
        user_id: userId,
        is_warmup: false,
        session_exercises: { session_id: lastSession.id },
      },
      select: { weight_kg: true, exercise_id: true, exercises: { select: { name: true } } },
    }),
    db.$queryRaw<{ exercise_id: string; pr_weight_kg: string | number }[]>(Prisma.sql`
      select exercise_id, pr_weight_kg from exercise_prs where user_id::text = ${userId}`),
  ]);

  const prByExercise = new Map(prs.map((p) => [p.exercise_id, Number(p.pr_weight_kg)]));
  const seen = new Set<string>();
  const results: SessionPr[] = [];

  for (const set of sets) {
    const prWeight = prByExercise.get(set.exercise_id);
    if (prWeight !== undefined && Number(set.weight_kg) === prWeight && !seen.has(set.exercise_id)) {
      seen.add(set.exercise_id);
      results.push({ exerciseName: set.exercises.name, weightKg: prWeight });
    }
  }

  return results;
}
