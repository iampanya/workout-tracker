"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import {
  createRoutineForUser,
  deleteRoutineForUser,
  addExerciseToRoutineForUser,
  removeRoutineExerciseForUser,
  moveRoutineExerciseForUser,
} from "@/lib/routines/service";

export async function createRoutine(input: unknown) {
  const userId = await requireUserId();
  const routine = await createRoutineForUser(prisma, userId, input);
  revalidatePath("/routines");
  return routine;
}

export async function deleteRoutine(routineId: string) {
  const userId = await requireUserId();
  await deleteRoutineForUser(prisma, userId, routineId);
  revalidatePath("/routines");
}

export async function addExerciseToRoutine(input: unknown) {
  const userId = await requireUserId();
  const parsed = input as { routineId: string };
  const result = await addExerciseToRoutineForUser(prisma, userId, input);
  revalidatePath(`/routines/${parsed.routineId}`);
  return result;
}

export async function removeRoutineExercise(routineExerciseId: string, routineId: string) {
  const userId = await requireUserId();
  await removeRoutineExerciseForUser(prisma, userId, routineExerciseId);
  revalidatePath(`/routines/${routineId}`);
}

export async function moveRoutineExercise(
  routineExerciseId: string,
  routineId: string,
  direction: "up" | "down"
) {
  const userId = await requireUserId();
  await moveRoutineExerciseForUser(prisma, userId, routineExerciseId, direction);
  revalidatePath(`/routines/${routineId}`);
}
