"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  startSessionForUser,
  addExerciseToSessionForUser,
  logSetForUser,
  updateSetForUser,
  deleteSetForUser,
  finishSessionForUser,
  discardSessionForUser,
} from "@/lib/sessions/service";

async function currentUserId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function startSession(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  const session = await startSessionForUser(supabase, userId, input);
  revalidatePath("/dashboard");
  return session;
}

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  return addExerciseToSessionForUser(supabase, userId, sessionId, exerciseId);
}

export async function logSet(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  return logSetForUser(supabase, userId, input);
}

export async function updateSet(setId: string, input: unknown) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  return updateSetForUser(supabase, userId, setId, input);
}

export async function deleteSet(setId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await deleteSetForUser(supabase, userId, setId);
}

export async function finishSession(sessionId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await finishSessionForUser(supabase, userId, sessionId);
  revalidatePath("/dashboard");
  revalidatePath("/history");
}

export async function discardSession(sessionId: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await currentUserId(supabase);
  await discardSessionForUser(supabase, userId, sessionId);
  revalidatePath("/dashboard");
}
