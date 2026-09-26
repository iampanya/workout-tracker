import type { PrismaClient } from "@prisma/client";
import { toDateOnlyString } from "@/lib/date";
import { type CompletedSession, toCompletedSession } from "./serialize";
import { sessionDurationMinutes } from "./summary";

export type { CompletedSession };
export type SessionListStats = {
  exerciseCount: number;
  setCount: number;
  // Working sets only (warmups excluded), matching computeSessionSummary.
  volumeKg: number;
  durationMin: number | null;
};
export type CompletedSessionListItem = CompletedSession & {
  routineName: string | null;
  stats: SessionListStats;
};

export type SessionDetail = {
  session: CompletedSession & { routineName: string | null };
  exercises: {
    exerciseId: string;
    exerciseName: string;
    sets: { weight_kg: number; reps: number; is_warmup: boolean; set_number: number }[];
  }[];
} | null;

// The display label for a session: the name snapshotted at start, falling back to the linked
// routine's current name, then "Freeform Workout".
export function sessionDisplayName(session: {
  name: string | null;
  routineName?: string | null;
}): string {
  return session.name ?? session.routineName ?? "Freeform Workout";
}

export async function listCompletedSessions(
  db: PrismaClient,
  userId: string,
  options: { take?: number; skip?: number } = {}
): Promise<CompletedSessionListItem[]> {
  // RLS used to scope this to the caller; now the user_id filter does.
  const rows = await db.sessions.findMany({
    where: { user_id: userId, completed_at: { not: null } },
    orderBy: [{ session_date: "desc" }, { completed_at: "desc" }],
    include: {
      routines: { select: { name: true } },
      _count: { select: { session_exercises: true } },
    },
    take: options.take,
    skip: options.skip,
  });
  if (rows.length === 0) return [];

  const sets = await db.sets.findMany({
    where: { user_id: userId, session_exercises: { session_id: { in: rows.map((r) => r.id) } } },
    select: {
      weight_kg: true,
      reps: true,
      is_warmup: true,
      session_exercises: { select: { session_id: true } },
    },
  });
  const totals = new Map<string, { setCount: number; volumeKg: number }>();
  for (const set of sets) {
    const id = set.session_exercises.session_id;
    const entry = totals.get(id) ?? { setCount: 0, volumeKg: 0 };
    entry.setCount += 1;
    if (!set.is_warmup) entry.volumeKg += Number(set.weight_kg) * set.reps;
    totals.set(id, entry);
  }

  return rows.map(({ routines, _count, ...session }) => {
    const serialized = toCompletedSession(session);
    const total = totals.get(session.id) ?? { setCount: 0, volumeKg: 0 };
    return {
      ...serialized,
      routineName: routines?.name ?? null,
      stats: {
        exerciseCount: _count.session_exercises,
        setCount: total.setCount,
        volumeKg: Math.round(total.volumeKg),
        durationMin: sessionDurationMinutes(serialized.started_at, serialized.completed_at),
      },
    };
  });
}

export async function getSessionDetail(
  db: PrismaClient,
  userId: string,
  sessionId: string
): Promise<SessionDetail> {
  const sessionRow = await db.sessions.findFirst({
    where: { id: sessionId, user_id: userId },
    include: { routines: { select: { name: true } } },
  });
  if (!sessionRow) return null;
  const { routines, ...session } = sessionRow;
  const sessionWithRoutineName = {
    ...toCompletedSession(session),
    routineName: routines?.name ?? null,
  };

  const sessionExercises = await db.session_exercises.findMany({
    where: { session_id: sessionId, user_id: userId },
    orderBy: { position: "asc" },
    include: {
      exercises: { select: { id: true, name: true } },
      sets: { select: { weight_kg: true, reps: true, is_warmup: true, set_number: true } },
    },
  });

  const exercises = sessionExercises.map((se) => ({
    exerciseId: se.exercises.id,
    exerciseName: se.exercises.name,
    sets: [...se.sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({
        weight_kg: Number(s.weight_kg),
        reps: s.reps,
        is_warmup: s.is_warmup,
        set_number: s.set_number,
      })),
  }));

  return { session: sessionWithRoutineName, exercises };
}

export type PreviousSessionComparison = {
  sessionId: string;
  sessionDate: string;
  volumeKg: number;
};

// The most recent earlier completed session of the same routine, with its working-set volume,
// so a finished workout can say "+8% vs last Push Day". Null for freeform sessions or the
// routine's first run.
export async function getPreviousRoutineSession(
  db: PrismaClient,
  userId: string,
  sessionId: string
): Promise<PreviousSessionComparison | null> {
  const session = await db.sessions.findFirst({
    where: { id: sessionId, user_id: userId },
    select: { routine_id: true, started_at: true },
  });
  if (!session?.routine_id) return null;

  const previous = await db.sessions.findFirst({
    where: {
      user_id: userId,
      routine_id: session.routine_id,
      id: { not: sessionId },
      completed_at: { not: null },
      started_at: { lt: session.started_at },
    },
    orderBy: { started_at: "desc" },
    select: { id: true, session_date: true },
  });
  if (!previous) return null;

  const sets = await db.sets.findMany({
    where: { user_id: userId, is_warmup: false, session_exercises: { session_id: previous.id } },
    select: { weight_kg: true, reps: true },
  });
  return {
    sessionId: previous.id,
    sessionDate: toDateOnlyString(previous.session_date),
    volumeKg: Math.round(sets.reduce((sum, set) => sum + Number(set.weight_kg) * set.reps, 0)),
  };
}
