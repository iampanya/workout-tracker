"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createCustomExerciseForUser, archiveExerciseForUser } from "@/lib/exercises/service";

// Phase 1: identity still comes from the Supabase (GoTrue) session; data goes through Prisma.
async function currentUserId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function createCustomExercise(input: unknown) {
  const userId = await currentUserId();
  const result = await createCustomExerciseForUser(prisma, userId, input);
  revalidatePath("/exercises");
  return result;
}

export async function archiveExercise(exerciseId: string) {
  const userId = await currentUserId();
  await archiveExerciseForUser(prisma, userId, exerciseId);
  revalidatePath("/exercises");
}
