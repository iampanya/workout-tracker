"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
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
  getLastSessionSets,
  updateSessionNotesForUser,
} from "@/lib/sessions/service";

export async function startSession(input: unknown) {
  const userId = await requireUserId();
  const session = await startSessionForUser(prisma, userId, input);
  // The (app) layout reads the in-progress session for the Resume links, so refresh it too.
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  return session;
}

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const userId = await requireUserId();
  const sessionExercise = await addExerciseToSessionForUser(prisma, userId, sessionId, exerciseId);
  const [prWeightKg, lastSessions] = await Promise.all([
    getPriorMaxWeight(prisma, userId, exerciseId),
    getLastSessionSets(prisma, userId, [exerciseId], sessionId),
  ]);
  return { ...sessionExercise, prWeightKg, lastSession: lastSessions[exerciseId] ?? null };
}

export async function removeExerciseFromSession(sessionExerciseId: string) {
  const userId = await requireUserId();
  await removeExerciseFromSessionForUser(prisma, userId, sessionExerciseId);
}

export async function logSet(input: unknown) {
  const userId = await requireUserId();
  return logSetForUser(prisma, userId, input);
}

export async function updateSet(setId: string, input: unknown) {
  const userId = await requireUserId();
  return updateSetForUser(prisma, userId, setId, input);
}

export async function deleteSet(setId: string) {
  const userId = await requireUserId();
  await deleteSetForUser(prisma, userId, setId);
}

export async function updateSessionNotes(sessionId: string, notes: string) {
  const userId = await requireUserId();
  await updateSessionNotesForUser(prisma, userId, sessionId, { notes });
  revalidatePath(`/history/${sessionId}`);
}

export async function finishSession(sessionId: string) {
  const userId = await requireUserId();
  await finishSessionForUser(prisma, userId, sessionId);
  // The (app) layout reads the in-progress session for the Resume links, so refresh it too.
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/history");
}

export async function discardSession(sessionId: string) {
  const userId = await requireUserId();
  await discardSessionForUser(prisma, userId, sessionId);
  // The (app) layout reads the in-progress session for the Resume links, so refresh it too.
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
}

// Deletes a completed workout from History (same cascade as discard).
export async function deleteCompletedSession(sessionId: string) {
  const userId = await requireUserId();
  await discardSessionForUser(prisma, userId, sessionId);
  revalidatePath("/history");
  revalidatePath("/dashboard");
}
