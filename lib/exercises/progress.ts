import { Prisma, type PrismaClient } from "@prisma/client";

export type ExerciseHistorySet = {
  id: string;
  session_date: string;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

// Cap on how many recent sets we load for the progress chart. Fetch newest-first (so the cap
// keeps recent data) then reverse to chronological order, which consumers rely on.
const HISTORY_LIMIT = 500;

export async function getExerciseHistory(
  db: PrismaClient,
  userId: string,
  exerciseId: string
): Promise<ExerciseHistorySet[]> {
  const rows = await db.sets.findMany({
    where: { user_id: userId, exercise_id: exerciseId },
    orderBy: { created_at: "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      weight_kg: true,
      reps: true,
      is_warmup: true,
      session_exercises: { select: { sessions: { select: { session_date: true } } } },
    },
  });

  return rows
    .map((row) => ({
      id: row.id,
      weight_kg: Number(row.weight_kg),
      reps: row.reps,
      is_warmup: row.is_warmup,
      session_date: row.session_exercises.sessions.session_date.toISOString().slice(0, 10),
    }))
    .reverse();
}

export async function getExercisePr(
  db: PrismaClient,
  userId: string,
  exerciseId: string
): Promise<number | null> {
  const rows = await db.$queryRaw<{ pr_weight_kg: string | number }[]>(Prisma.sql`
    select pr_weight_kg from exercise_prs
    where user_id::text = ${userId} and exercise_id::text = ${exerciseId}
    limit 1`);
  return rows.length > 0 ? Number(rows[0].pr_weight_kg) : null;
}
