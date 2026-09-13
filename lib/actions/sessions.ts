"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  removeExerciseFromSessionForUser,
  logSetForUser,
  updateSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
  getPriorMaxWeight,
} from "@/lib/sessions/service";

// Identity still from the Supabase (GoTrue) session; data via prisma.
async function currentUserId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function startSession(input: unknown) {
  const userId = await currentUserId();
  const session = await startSessionForUser(prisma, userId, input);
  revalidatePath("/dashboard");
  return session;
}

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const userId = await currentUserId();
  const sessionExercise = await addExerciseToSessionForUser(prisma, userId, sessionId, exerciseId);
  const prWeightKg = await getPriorMaxWeight(prisma, userId, exerciseId);
  return { ...sessionExercise, prWeightKg };
}

export async function removeExerciseFromSession(sessionExerciseId: string) {
  const userId = await currentUserId();
  await removeExerciseFromSessionForUser(prisma, userId, sessionExerciseId);
}

export async function logSet(input: unknown) {
  const userId = await currentUserId();
  return logSetForUser(prisma, userId, input);
}

export async function updateSet(setId: string, input: unknown) {
  const userId = await currentUserId();
  return updateSetForUser(prisma, userId, setId, input);
}

export async function deleteSet(setId: string) {
  const userId = await currentUserId();
  await deleteSetForUser(prisma, userId, setId);
}

export async function finishSession(sessionId: string) {
  const userId = await currentUserId();
  await finishSessionForUser(prisma, userId, sessionId);
  revalidatePath("/dashboard");
  revalidatePath("/history");
}

export async function discardSession(sessionId: string) {
  const userId = await currentUserId();
  await discardSessionForUser(prisma, userId, sessionId);
  revalidatePath("/dashboard");
}

// Deletes a completed workout from History (same cascade as discard).
export async function deleteCompletedSession(sessionId: string) {
  const userId = await currentUserId();
  await discardSessionForUser(prisma, userId, sessionId);
  revalidatePath("/history");
  revalidatePath("/dashboard");
}
