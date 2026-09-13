import { Prisma, type PrismaClient, type sessions, type session_exercises, type sets } from "@prisma/client";
import { startSessionSchema, logSetSchema, updateSetSchema } from "@/lib/validation";
import { isNewPr } from "@/lib/pr";
import { getRoutineWithExercises } from "@/lib/routines/service";

export type Session = sessions;
export type SessionExercise = session_exercises;
// weight_kg is a Postgres numeric → Prisma Decimal. Consumers (the logging UI) expect a plain
// number, so the service coerces it and the exported type reflects that.
export type SetRow = Omit<sets, "weight_kg"> & { weight_kg: number };

function toSetRow(s: sets): SetRow {
  return { ...s, weight_kg: Number(s.weight_kg) };
}

export async function startSessionForUser(
  db: PrismaClient,
  userId: string,
  input: unknown
): Promise<Session> {
  const parsed = startSessionSchema.parse(input);

  // Verify routine ownership BEFORE inserting the session (getRoutineWithExercises throws if the
  // routine isn't the caller's), so no orphaned session row can reference another user's routine.
  const exercises = parsed.routineId
    ? (await getRoutineWithExercises(db, userId, parsed.routineId)).exercises
    : [];

  const session = await db.sessions.create({
    data: {
      user_id: userId,
      routine_id: parsed.routineId ?? null,
      name: parsed.name ?? null,
      session_date: new Date(parsed.sessionDate),
    },
  });

  if (exercises.length > 0) {
    await db.session_exercises.createMany({
      data: exercises.map((entry) => ({
        session_id: session.id,
        user_id: userId,
        exercise_id: entry.exercise_id,
        position: entry.position,
      })),
    });
  }

  return session;
}

export async function addExerciseToSessionForUser(
  db: PrismaClient,
  userId: string,
  sessionId: string,
  exerciseId: string
): Promise<SessionExercise> {
  // Ownership check: session_exercises RLS only checked the inserted row's user_id, not that the
  // session belongs to the caller — so verify session ownership explicitly.
  const session = await db.sessions.findFirst({
    where: { id: sessionId, user_id: userId },
    select: { id: true },
  });
  if (!session) throw new Error("Session not found or not owned by user");

  const exercise = await db.exercises.findFirst({
    where: { id: exerciseId, OR: [{ user_id: null }, { user_id: userId }] },
    select: { id: true },
  });
  if (!exercise) throw new Error("Exercise not found or not visible to user");

  // max(position) + 1, not count(*): a middle removal leaves a gap, so count(*) could collide
  // with unique(session_id, position).
  const maxRow = await db.session_exercises.findFirst({
    where: { session_id: sessionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = maxRow ? maxRow.position + 1 : 0;

  return db.session_exercises.create({
    data: { session_id: sessionId, user_id: userId, exercise_id: exerciseId, position: nextPosition },
  });
}

export async function removeExerciseFromSessionForUser(
  db: PrismaClient,
  userId: string,
  sessionExerciseId: string
): Promise<void> {
  const result = await db.session_exercises.deleteMany({
    where: { id: sessionExerciseId, user_id: userId },
  });
  if (result.count === 0) throw new Error("Exercise not found or not owned by user");
}

// exercise_prs is a view (not a Prisma model), so read it with raw SQL. Columns are compared as
// text to avoid uuid-vs-text parameter casting quirks.
export async function getPriorMaxWeight(
  db: PrismaClient,
  userId: string,
  exerciseId: string
): Promise<number | null> {
  const rows = await db.$queryRaw<{ pr_weight_kg: string | number }[]>`
    select pr_weight_kg from exercise_prs
    where user_id::text = ${userId} and exercise_id::text = ${exerciseId}
    limit 1`;
  return rows.length > 0 ? Number(rows[0].pr_weight_kg) : null;
}

export async function getPriorMaxWeights(
  db: PrismaClient,
  userId: string,
  exerciseIds: string[]
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const rows = await db.$queryRaw<{ exercise_id: string; pr_weight_kg: string | number }[]>(Prisma.sql`
    select exercise_id, pr_weight_kg from exercise_prs
    where user_id::text = ${userId} and exercise_id::text IN (${Prisma.join(exerciseIds)})`);
  return Object.fromEntries(
    rows
      .filter((row) => row.exercise_id !== null && row.pr_weight_kg !== null)
      .map((row) => [row.exercise_id, Number(row.pr_weight_kg)])
  );
}

export async function logSetForUser(
  db: PrismaClient,
  userId: string,
  input: unknown
): Promise<{ set: SetRow; isPr: boolean }> {
  const parsed = logSetSchema.parse(input);

  const sessionExercise = await db.session_exercises.findFirst({
    where: { id: parsed.sessionExerciseId, user_id: userId },
    select: { exercise_id: true },
  });
  if (!sessionExercise) throw new Error("Session exercise not found or not owned by user");
  const exerciseId = sessionExercise.exercise_id;

  const priorMax = parsed.isWarmup ? null : await getPriorMaxWeight(db, userId, exerciseId);

  // max(set_number) + 1, not count(*) + 1: a middle delete leaves a gap, so count(*) could collide
  // with unique(session_exercise_id, set_number).
  const maxRow = await db.sets.findFirst({
    where: { session_exercise_id: parsed.sessionExerciseId },
    orderBy: { set_number: "desc" },
    select: { set_number: true },
  });
  const nextSetNumber = maxRow ? maxRow.set_number + 1 : 1;

  const set = await db.sets.create({
    data: {
      session_exercise_id: parsed.sessionExerciseId,
      user_id: userId,
      exercise_id: exerciseId,
      set_number: nextSetNumber,
      weight_kg: parsed.weightKg,
      reps: parsed.reps,
      is_warmup: parsed.isWarmup,
    },
  });

  const isPr = !parsed.isWarmup && isNewPr(parsed.weightKg, priorMax);
  return { set: toSetRow(set), isPr };
}

export async function updateSetForUser(
  db: PrismaClient,
  userId: string,
  setId: string,
  input: unknown
): Promise<{ set: SetRow; isPr: boolean }> {
  const parsed = updateSetSchema.parse(input);

  const existing = await db.sets.findFirst({
    where: { id: setId, user_id: userId },
    select: { exercise_id: true },
  });
  if (!existing) throw new Error("Set not found or not owned by user");

  const priorMax = parsed.isWarmup
    ? null
    : await getPriorMaxWeight(db, userId, existing.exercise_id);

  const set = await db.sets.update({
    where: { id: setId },
    data: { weight_kg: parsed.weightKg, reps: parsed.reps, is_warmup: parsed.isWarmup },
  });

  const isPr = !parsed.isWarmup && isNewPr(parsed.weightKg, priorMax);
  return { set: toSetRow(set), isPr };
}

export async function deleteSetForUser(
  db: PrismaClient,
  userId: string,
  setId: string
): Promise<void> {
  await db.sets.deleteMany({ where: { id: setId, user_id: userId } });
}

export async function finishSessionForUser(
  db: PrismaClient,
  userId: string,
  sessionId: string
): Promise<void> {
  // A session needs at least one exercise, each with at least one set, before it can finish.
  const list = await db.session_exercises.findMany({
    where: { session_id: sessionId, user_id: userId },
    select: { id: true, sets: { select: { id: true } } },
  });
  if (list.length === 0) {
    throw new Error("Add at least one exercise with a logged set before finishing");
  }
  if (list.some((se) => se.sets.length === 0)) {
    throw new Error("Remove exercises with no sets before finishing");
  }

  await db.sessions.updateMany({
    where: { id: sessionId, user_id: userId },
    data: { completed_at: new Date() },
  });
}

export async function discardSessionForUser(
  db: PrismaClient,
  userId: string,
  sessionId: string
): Promise<void> {
  await db.sessions.deleteMany({ where: { id: sessionId, user_id: userId } });
}
