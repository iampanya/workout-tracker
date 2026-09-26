import type { PrismaClient, routines, routine_exercises } from "@prisma/client";
import {
  createRoutineSchema,
  addRoutineExerciseSchema,
  updateRoutineTargetSetsSchema,
} from "@/lib/validation";

export type Routine = routines;
export type RoutineExercise = routine_exercises;
export type RoutineExerciseWithExercise = RoutineExercise & {
  exercise: { id: string; name: string; muscle_group: string | null };
};

// A routine plus a preview of its contents for list rows ("5 exercises · Bench, Squat, Row").
export type RoutineListItem = Routine & { exerciseCount: number; exerciseNames: string[] };

const PREVIEW_NAMES = 3;

export async function listRoutines(db: PrismaClient, userId: string): Promise<RoutineListItem[]> {
  const rows = await db.routines.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    include: {
      routine_exercises: {
        where: { user_id: userId },
        orderBy: { position: "asc" },
        select: { exercises: { select: { name: true } } },
      },
    },
  });
  return rows.map(({ routine_exercises, ...routine }) => ({
    ...routine,
    exerciseCount: routine_exercises.length,
    exerciseNames: routine_exercises.slice(0, PREVIEW_NAMES).map((re) => re.exercises.name),
  }));
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

// Planned working sets for one exercise in a routine (null clears it). Shown as "2/4 sets"
// while logging a session started from the routine.
export async function updateRoutineExerciseTargetSetsForUser(
  db: PrismaClient,
  userId: string,
  routineExerciseId: string,
  input: unknown
): Promise<void> {
  const parsed = updateRoutineTargetSetsSchema.parse(input);
  const result = await db.routine_exercises.updateMany({
    where: { id: routineExerciseId, user_id: userId },
    data: { target_sets: parsed.targetSets },
  });
  if (result.count === 0) throw new Error("Routine exercise not found or not owned by user");
}

// routine_exercises.target_sets keyed by exercise_id, for a session started from `routineId`.
export async function getRoutineTargetSets(
  db: PrismaClient,
  userId: string,
  routineId: string
): Promise<Record<string, number>> {
  const rows = await db.routine_exercises.findMany({
    where: { routine_id: routineId, user_id: userId, target_sets: { not: null } },
    select: { exercise_id: true, target_sets: true },
  });
  return Object.fromEntries(rows.map((row) => [row.exercise_id, row.target_sets!]));
}
