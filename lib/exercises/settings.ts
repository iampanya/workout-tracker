// Per-user exercise settings. Today that is only the weight step used by the next-session target:
// a custom value from exercise_settings, else inferred from the top working weight of each completed session, else
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
    // Per completed session, the heaviest working weight of each exercise (the "top set"). Ramp-ups
    // and drop sets inside one session thus count once. Served by sets_user_exercise_idx.
    db.$queryRaw<{ exercise_id: string; weight_kg: Prisma.Decimal | number }[]>(Prisma.sql`
      select st.exercise_id::text as exercise_id, max(st.weight_kg) as weight_kg
      from sets st
      join session_exercises se on se.id = st.session_exercise_id
      join sessions s on s.id = se.session_id
      where st.user_id = ${userId}::uuid
        and s.user_id = ${userId}::uuid
        and st.exercise_id = any(${ids}::uuid[])
        and s.completed_at is not null
        and not st.is_warmup
        and st.weight_kg > 0
      group by s.id, st.exercise_id`),
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
  const step = (await getWeightSteps(db, userId, [exerciseId]))[exerciseId];
  if (!step) throw new Error("Exercise not found");
  return step;
}
