// Per-user exercise settings. Today that is only the weight step used by the next-session target:
// a custom value from exercise_settings, else inferred from the user's logged working weights, else
// the muscle-group default (resolveWeightStep). Every query is scoped to the user (no RLS).
import { Prisma, type PrismaClient } from "@prisma/client";
import { resolveWeightStep, type WeightStep } from "@/lib/insights/progression";
import { updateWeightStepSchema } from "@/lib/validation";

// Exercises the user can't see (another user's custom exercise, unknown id) are left out.
export async function getWeightSteps(
  db: PrismaClient,
  userId: string,
  exerciseIds: string[]
): Promise<Record<string, WeightStep>> {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return {};
  const [exercises, settings, weights] = await Promise.all([
    db.exercises.findMany({
      where: { id: { in: ids }, OR: [{ user_id: null }, { user_id: userId }] },
      select: { id: true, muscle_group: true },
    }),
    db.exercise_settings.findMany({
      where: { user_id: userId, exercise_id: { in: ids } },
      select: { exercise_id: true, weight_step_kg: true },
    }),
    // Distinct working weights per exercise (sets_user_exercise_idx covers the filter).
    db.$queryRaw<{ exercise_id: string; weight_kg: Prisma.Decimal | number }[]>(Prisma.sql`
      select distinct exercise_id::text as exercise_id, weight_kg
      from sets
      where user_id = ${userId}::uuid
        and exercise_id::text in (${Prisma.join(ids)})
        and not is_warmup
        and weight_kg > 0`),
  ]);

  const custom = new Map(settings.map((row) => [row.exercise_id, Number(row.weight_step_kg)]));
  const logged = new Map<string, number[]>();
  for (const row of weights) {
    const list = logged.get(row.exercise_id) ?? [];
    list.push(Number(row.weight_kg));
    logged.set(row.exercise_id, list);
  }
  return Object.fromEntries(
    exercises.map((exercise) => [
      exercise.id,
      resolveWeightStep({
        customKg: custom.get(exercise.id) ?? null,
        loggedWeights: logged.get(exercise.id) ?? [],
        muscleGroup: exercise.muscle_group,
      }),
    ])
  );
}

// `{ weightStepKg: null }` deletes the custom value (back to automatic). Returns the resolved step.
export async function setWeightStepForUser(
  db: PrismaClient,
  userId: string,
  exerciseId: string,
  input: unknown
): Promise<WeightStep> {
  const { weightStepKg } = updateWeightStepSchema.parse(input);
  const exercise = await db.exercises.findFirst({
    where: { id: exerciseId, OR: [{ user_id: null }, { user_id: userId }] },
    select: { id: true },
  });
  if (!exercise) throw new Error("Exercise not found");

  if (weightStepKg === null) {
    await db.exercise_settings.deleteMany({ where: { user_id: userId, exercise_id: exerciseId } });
  } else {
    await db.exercise_settings.upsert({
      where: { user_id_exercise_id: { user_id: userId, exercise_id: exerciseId } },
      create: { user_id: userId, exercise_id: exerciseId, weight_step_kg: weightStepKg },
      update: { weight_step_kg: weightStepKg, updated_at: new Date() },
    });
  }
  return (await getWeightSteps(db, userId, [exerciseId]))[exerciseId];
}
