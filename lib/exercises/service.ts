import { Prisma, type PrismaClient, type exercises } from "@prisma/client";
import { toDateOnlyString } from "@/lib/date";
import type { PrRecord } from "@/lib/pr";
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

export type ExerciseStats = { pr: PrRecord | null; lastDate: string | null };

// Per-exercise PR (exercise_prs view) and the date it was last done in a completed session,
// for the exercises list. Only exercises the user has logged appear in the result.
export async function listExerciseStats(
  db: PrismaClient,
  userId: string
): Promise<Record<string, ExerciseStats>> {
  const [prs, lastDone] = await Promise.all([
    db.$queryRaw<{ exercise_id: string; pr_weight_kg: string | number; pr_reps: number }[]>(Prisma.sql`
      select exercise_id::text as exercise_id, pr_weight_kg, pr_reps from exercise_prs
      where user_id::text = ${userId}`),
    db.$queryRaw<{ exercise_id: string; last_date: Date }[]>(Prisma.sql`
      select se.exercise_id::text as exercise_id, max(s.session_date) as last_date
      from session_exercises se
      join sessions s on s.id = se.session_id
      where se.user_id::text = ${userId} and s.user_id::text = ${userId}
        and s.completed_at is not null
      group by se.exercise_id`),
  ]);

  const stats: Record<string, ExerciseStats> = {};
  for (const row of lastDone) {
    stats[row.exercise_id] = { pr: null, lastDate: toDateOnlyString(row.last_date) };
  }
  for (const row of prs) {
    if (row.exercise_id === null || row.pr_weight_kg === null) continue;
    stats[row.exercise_id] = {
      lastDate: stats[row.exercise_id]?.lastDate ?? null,
      pr: { weightKg: Number(row.pr_weight_kg), reps: row.pr_reps },
    };
  }
  return stats;
}

// The user's most recently done exercises (completed sessions only), newest first — the
// picker's "Recent" section. Ties on session_date fall back to the session's completion time.
export async function listRecentExerciseIds(
  db: PrismaClient,
  userId: string,
  limit = 6
): Promise<string[]> {
  const rows = await db.$queryRaw<{ exercise_id: string }[]>(Prisma.sql`
    select se.exercise_id::text as exercise_id
    from session_exercises se
    join sessions s on s.id = se.session_id
    join exercises e on e.id = se.exercise_id
    where se.user_id::text = ${userId} and s.user_id::text = ${userId}
      and s.completed_at is not null and not e.is_archived
    group by se.exercise_id
    order by max(s.session_date) desc, max(s.completed_at) desc
    limit ${limit}`);
  return rows.map((row) => row.exercise_id);
}
