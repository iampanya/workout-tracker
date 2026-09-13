"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import {
  createRoutineForUser,
  deleteRoutineForUser,
  addExerciseToRoutineForUser,
  removeRoutineExerciseForUser,
  moveRoutineExerciseForUser,
} from "@/lib/routines/service";

// Identity still from the Supabase (GoTrue) session; data via prisma.
async function currentUserId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function createRoutine(input: unknown) {
  const userId = await currentUserId();
  const routine = await createRoutineForUser(prisma, userId, input);
  revalidatePath("/routines");
  return routine;
}

export async function deleteRoutine(routineId: string) {
  const userId = await currentUserId();
  await deleteRoutineForUser(prisma, userId, routineId);
  revalidatePath("/routines");
}

export async function addExerciseToRoutine(input: unknown) {
  const userId = await currentUserId();
  const parsed = input as { routineId: string };
  const result = await addExerciseToRoutineForUser(prisma, userId, input);
  revalidatePath(`/routines/${parsed.routineId}`);
  return result;
}

export async function removeRoutineExercise(routineExerciseId: string, routineId: string) {
  const userId = await currentUserId();
  await removeRoutineExerciseForUser(prisma, userId, routineExerciseId);
  revalidatePath(`/routines/${routineId}`);
}

export async function moveRoutineExercise(
  routineExerciseId: string,
  routineId: string,
  direction: "up" | "down"
) {
  const userId = await currentUserId();
  await moveRoutineExerciseForUser(prisma, userId, routineExerciseId, direction);
  revalidatePath(`/routines/${routineId}`);
}
