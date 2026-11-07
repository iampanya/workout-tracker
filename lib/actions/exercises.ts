"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { createCustomExerciseForUser, archiveExerciseForUser } from "@/lib/exercises/service";
import { setWeightStepForUser } from "@/lib/exercises/settings";

export async function createCustomExercise(input: unknown) {
  const userId = await requireUserId();
  const result = await createCustomExerciseForUser(prisma, userId, input);
  revalidatePath("/exercises");
  return result;
}

export async function archiveExercise(exerciseId: string) {
  const userId = await requireUserId();
  await archiveExerciseForUser(prisma, userId, exerciseId);
  revalidatePath("/exercises");
}

export async function setExerciseWeightStep(exerciseId: string, weightStepKg: number | null) {
  const userId = await requireUserId();
  const step = await setWeightStepForUser(prisma, userId, exerciseId, { weightStepKg });
  revalidatePath(`/exercises/${exerciseId}`);
  return step;
}
