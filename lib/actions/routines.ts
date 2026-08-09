"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createRoutineForUser,
  deleteRoutineForUser,
  addExerciseToRoutineForUser,
  removeRoutineExerciseForUser,
  moveRoutineExerciseForUser,
} from "@/lib/routines/service";

async function currentUserId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function createRoutine(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  const routine = await createRoutineForUser(supabase, userId, input);
  revalidatePath("/routines");
  return routine;
}

export async function deleteRoutine(routineId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await deleteRoutineForUser(supabase, userId, routineId);
  revalidatePath("/routines");
}

export async function addExerciseToRoutine(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  const parsed = input as { routineId: string };
  const result = await addExerciseToRoutineForUser(supabase, userId, input);
  revalidatePath(`/routines/${parsed.routineId}`);
  return result;
}

export async function removeRoutineExercise(routineExerciseId: string, routineId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await removeRoutineExerciseForUser(supabase, userId, routineExerciseId);
  revalidatePath(`/routines/${routineId}`);
}

export async function moveRoutineExercise(
  routineExerciseId: string,
  routineId: string,
  direction: "up" | "down"
) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await moveRoutineExerciseForUser(supabase, userId, routineExerciseId, direction);
  revalidatePath(`/routines/${routineId}`);
}
