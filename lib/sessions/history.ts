import type { PrismaClient, sessions } from "@prisma/client";

export type CompletedSession = {
  id: string;
  user_id: string;
  routine_id: string | null;
  name: string | null;
  session_date: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
};
export type CompletedSessionListItem = CompletedSession & { routineName: string | null };

export type SessionDetail = {
  session: CompletedSession & { routineName: string | null };
  exercises: {
    exerciseName: string;
    sets: { weight_kg: number; reps: number; is_warmup: boolean; set_number: number }[];
  }[];
} | null;

// Serialize a Prisma sessions row back to the string-dated shape the UI consumes (session_date
// as YYYY-MM-DD, timestamps as ISO). Keeps the external contract stable across the DB-layer swap.
function toCompletedSession(s: sessions): CompletedSession {
  return {
    id: s.id,
    user_id: s.user_id,
    routine_id: s.routine_id,
    name: s.name,
    session_date: s.session_date.toISOString().slice(0, 10),
    started_at: s.started_at.toISOString(),
    completed_at: s.completed_at ? s.completed_at.toISOString() : null,
    notes: s.notes,
  };
}

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
  userId: string
): Promise<CompletedSessionListItem[]> {
  // RLS used to scope this to the caller; now the user_id filter does.
  const rows = await db.sessions.findMany({
    where: { user_id: userId, completed_at: { not: null } },
    orderBy: { session_date: "desc" },
    include: { routines: { select: { name: true } } },
  });
  return rows.map(({ routines, ...session }) => ({
    ...toCompletedSession(session),
    routineName: routines?.name ?? null,
  }));
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
      exercises: { select: { name: true } },
      sets: { select: { weight_kg: true, reps: true, is_warmup: true, set_number: true } },
    },
  });

  const exercises = sessionExercises.map((se) => ({
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
