import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { startSessionSchema, logSetSchema } from "@/lib/validation";
import { isNewPr } from "@/lib/pr";
import { getRoutineWithExercises } from "@/lib/routines/service";

export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type SessionExercise = Database["public"]["Tables"]["session_exercises"]["Row"];
export type SetRow = Database["public"]["Tables"]["sets"]["Row"];

export async function startSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<Session> {
  const parsed = startSessionSchema.parse(input);

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      routine_id: parsed.routineId ?? null,
      name: parsed.name ?? null,
      session_date: parsed.sessionDate,
    })
    .select()
    .single();
  if (sessionError) throw new Error(sessionError.message);

  if (parsed.routineId) {
    const { exercises } = await getRoutineWithExercises(supabase, userId, parsed.routineId);
    if (exercises.length > 0) {
      const { error: insertError } = await supabase.from("session_exercises").insert(
        exercises.map((entry) => ({
          session_id: session.id,
          user_id: userId,
          exercise_id: entry.exercise_id,
          position: entry.position,
        }))
      );
      if (insertError) throw new Error(insertError.message);
    }
  }

  return session;
}

export async function addExerciseToSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  exerciseId: string
): Promise<SessionExercise> {
  // Ownership check: the RLS policy on session_exercises only checks the
  // inserted row's own user_id, not that session_id belongs to that user —
  // without this, a malicious authenticated user could add rows to another
  // user's session (same class of gap fixed in Task 6's addExerciseToRoutineForUser).
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (sessionError || !session) throw new Error("Session not found or not owned by user");

  const { count, error: countError } = await supabase
    .from("session_exercises")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (countError) throw new Error(countError.message);

  const { data, error } = await supabase
    .from("session_exercises")
    .insert({ session_id: sessionId, user_id: userId, exercise_id: exerciseId, position: count ?? 0 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPriorMaxWeight(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("exercise_prs")
    .select("pr_weight_kg")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.pr_weight_kg) : null;
}

export async function logSetForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<{ set: SetRow; isPr: boolean }> {
  const parsed = logSetSchema.parse(input);

  const { data: sessionExercise, error: seError } = await supabase
    .from("session_exercises")
    .select("exercise_id")
    .eq("id", parsed.sessionExerciseId)
    .eq("user_id", userId)
    .single();
  if (seError) throw new Error(seError.message);
  const exerciseId = sessionExercise.exercise_id;

  const priorMax = parsed.isWarmup ? null : await getPriorMaxWeight(supabase, userId, exerciseId);

  const { count, error: countError } = await supabase
    .from("sets")
    .select("id", { count: "exact", head: true })
    .eq("session_exercise_id", parsed.sessionExerciseId);
  if (countError) throw new Error(countError.message);

  const { data: set, error } = await supabase
    .from("sets")
    .insert({
      session_exercise_id: parsed.sessionExerciseId,
      user_id: userId,
      exercise_id: exerciseId,
      set_number: (count ?? 0) + 1,
      weight_kg: parsed.weightKg,
      reps: parsed.reps,
      is_warmup: parsed.isWarmup,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const isPr = !parsed.isWarmup && isNewPr(parsed.weightKg, priorMax);
  return { set, isPr };
}

export async function deleteSetForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  setId: string
): Promise<void> {
  const { error } = await supabase.from("sets").delete().eq("id", setId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function finishSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function discardSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
): Promise<void> {
  const { error } = await supabase.from("sessions").delete().eq("id", sessionId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
