import type { PrismaClient, routines, routine_exercises } from "@prisma/client";
import { createRoutineSchema, addRoutineExerciseSchema } from "@/lib/validation";

export type Routine = routines;
export type RoutineExercise = routine_exercises;
export type RoutineExerciseWithExercise = RoutineExercise & {
  exercise: { id: string; name: string; muscle_group: string | null };
};

export async function listRoutines(db: PrismaClient, userId: string): Promise<Routine[]> {
  return db.routines.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
  });
}

export async function createRoutineForUser(
  db: PrismaClient,
  userId: string,
  input: unknown
): Promise<Routine> {
  const parsed = createRoutineSchema.parse(input);
  return db.routines.create({
    data: { user_id: userId, name: parsed.name, notes: parsed.notes ?? null },
  });
}

export async function deleteRoutineForUser(
  db: PrismaClient,
  userId: string,
  routineId: string
): Promise<void> {
  // Scoped delete: a no-op if the routine isn't the caller's (replaces the RLS check).
  await db.routines.deleteMany({ where: { id: routineId, user_id: userId } });
}

export async function getRoutineWithExercises(
  db: PrismaClient,
  userId: string,
  routineId: string
): Promise<{ routine: Routine; exercises: RoutineExerciseWithExercise[] }> {
  const routine = await db.routines.findFirst({ where: { id: routineId, user_id: userId } });
  if (!routine) throw new Error("Routine not found or not owned by user");

  const rows = await db.routine_exercises.findMany({
    where: { routine_id: routineId, user_id: userId },
    orderBy: { position: "asc" },
    include: { exercises: { select: { id: true, name: true, muscle_group: true } } },
  });
  const exercises = rows.map(({ exercises: exercise, ...rest }) => ({ ...rest, exercise }));

  return { routine, exercises };
}

export async function addExerciseToRoutineForUser(
  db: PrismaClient,
  userId: string,
  input: unknown
): Promise<RoutineExercise> {
  const parsed = addRoutineExerciseSchema.omit({ position: true }).parse(input);

  const routine = await db.routines.findFirst({
    where: { id: parsed.routineId, user_id: userId },
    select: { id: true },
  });
  if (!routine) throw new Error("Routine not found or not owned by user");

  // Exercise must exist and be visible to this user (presets or their own). Without this a
  // caller could reference a nonexistent exercise, later crashing consumers that read
  // entry.exercise.name off a null join.
  const exercise = await db.exercises.findFirst({
    where: { id: parsed.exerciseId, OR: [{ user_id: null }, { user_id: userId }] },
    select: { id: true },
  });
  if (!exercise) throw new Error("Exercise not found or not visible to user");

  // max(position) + 1, not count(*): removing a middle exercise leaves a gap, so count(*) could
  // collide with the unique(routine_id, position) constraint.
  const maxRow = await db.routine_exercises.findFirst({
    where: { routine_id: parsed.routineId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = maxRow ? maxRow.position + 1 : 0;

  return db.routine_exercises.create({
    data: {
      routine_id: parsed.routineId,
      user_id: userId,
      exercise_id: parsed.exerciseId,
      position: nextPosition,
      target_sets: parsed.targetSets ?? null,
    },
  });
}

export async function removeRoutineExerciseForUser(
  db: PrismaClient,
  userId: string,
  routineExerciseId: string
): Promise<void> {
  await db.routine_exercises.deleteMany({ where: { id: routineExerciseId, user_id: userId } });
}

export async function moveRoutineExerciseForUser(
  db: PrismaClient,
  userId: string,
  routineExerciseId: string,
  direction: "up" | "down"
): Promise<void> {
  const current = await db.routine_exercises.findFirst({
    where: { id: routineExerciseId, user_id: userId },
    select: { id: true, routine_id: true, position: true },
  });
  if (!current) throw new Error("Routine exercise not found or not owned by user");

  const targetPosition = direction === "up" ? current.position - 1 : current.position + 1;

  const neighbor = await db.routine_exercises.findFirst({
    where: { routine_id: current.routine_id, position: targetPosition },
    select: { id: true },
  });
  if (!neighbor) return;

  // Swap via a temporary position (-1) to avoid the unique(routine_id, position) collision.
  await db.routine_exercises.update({ where: { id: current.id }, data: { position: -1 } });
  await db.routine_exercises.update({ where: { id: neighbor.id }, data: { position: current.position } });
  await db.routine_exercises.update({ where: { id: current.id }, data: { position: targetPosition } });
}
