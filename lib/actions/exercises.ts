"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createCustomExerciseForUser, archiveExerciseForUser } from "@/lib/exercises/service";

export async function createCustomExercise(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const result = await createCustomExerciseForUser(supabase, user.id, input);
  revalidatePath("/exercises");
  return result;
}

export async function archiveExercise(exerciseId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await archiveExerciseForUser(supabase, user.id, exerciseId);
  revalidatePath("/exercises");
}
