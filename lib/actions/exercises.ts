"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { createCustomExerciseForUser, archiveExerciseForUser } from "@/lib/exercises/service";

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
