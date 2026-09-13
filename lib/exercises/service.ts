import type { PrismaClient, exercises } from "@prisma/client";
import { createExerciseSchema } from "@/lib/validation";

export type Exercise = exercises;

// Only the columns the list UIs actually read (picker, exercises index, archive button).
export type ExerciseListItem = Pick<Exercise, "id" | "name" | "muscle_group" | "is_preset">;

// Presets (user_id null) plus the user's own exercises. RLS used to scope this implicitly;
// now the OR filter does it explicitly — dropping the userId would leak nothing (presets only)
// but would also hide the user's custom exercises, so it is required.
export async function listExercises(
  db: PrismaClient,
  userId: string,
  options: { includeArchived?: boolean } = {}
): Promise<ExerciseListItem[]> {
  return db.exercises.findMany({
    where: {
      OR: [{ user_id: null }, { user_id: userId }],
      ...(options.includeArchived ? {} : { is_archived: false }),
    },
    select: { id: true, name: true, muscle_group: true, is_preset: true },
    orderBy: [{ muscle_group: "asc" }, { name: "asc" }],
  });
}

export async function createCustomExerciseForUser(
  db: PrismaClient,
  userId: string,
  input: unknown
): Promise<Exercise> {
  const parsed = createExerciseSchema.parse(input);
  return db.exercises.create({
    data: {
      user_id: userId,
      name: parsed.name,
      muscle_group: parsed.muscleGroup ?? null,
      is_preset: false,
    },
  });
}

export async function archiveExerciseForUser(
  db: PrismaClient,
  userId: string,
  exerciseId: string
): Promise<void> {
  // Scope the update by user_id so a user can only archive their own exercise; count === 0
  // means the row doesn't exist or isn't theirs (replaces the RLS ownership check).
  const result = await db.exercises.updateMany({
    where: { id: exerciseId, user_id: userId },
    data: { is_archived: true },
  });
  if (result.count === 0) {
    throw new Error("Exercise not found or not owned by user");
  }
}
