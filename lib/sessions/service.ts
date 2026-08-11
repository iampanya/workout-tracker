import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { startSessionSchema, logSetSchema, updateSetSchema } from "@/lib/validation";
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

  // Verify routine ownership BEFORE inserting the session row: getRoutineWithExercises
  // throws if the routine doesn't exist or isn't owned by userId. Doing this first (rather
  // than after the sessions insert) prevents an orphaned sessions row from being created
  // that permanently references another user's routine_id — the FK only checks existence,
  // not ownership, so a check performed after the insert is too late to prevent that row.
  const exercises = parsed.routineId
    ? (await getRoutineWithExercises(supabase, userId, parsed.routineId)).exercises
    : [];

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

  // Verify the exercise exists and is visible to this user (RLS scopes visibility to
  // presets plus the caller's own custom exercises). Without this check, a caller could
  // insert a reference to a nonexistent or archived exercise, which later crashes
  // getSessionDetail's consumers when they read entry.exercise.name off a null join.
  const { data: exercise, error: exerciseError } = await supabase
    .from("exercises")
    .select("id")
    .eq("id", exerciseId)
    .single();
  if (exerciseError || !exercise) {
    throw new Error("Exercise not found or not visible to user");
  }

  // Use max(position) + 1, not count(*): removing an exercise from the middle of a
  // session leaves a gap in the position sequence, so count(*) would recompute a
  // position that collides with the unique(session_id, position) constraint.
  const { data: maxRow, error: maxError } = await supabase
    .from("session_exercises")
    .select("position")
    .eq("session_id", sessionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw new Error(maxError.message);
  const nextPosition = maxRow ? maxRow.position + 1 : 0;

  const { data, error } = await supabase
    .from("session_exercises")
    .insert({ session_id: sessionId, user_id: userId, exercise_id: exerciseId, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeExerciseFromSessionForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionExerciseId: string
): Promise<void> {
  // Scope the delete by user_id (mirror removeRoutineExerciseForUser): the RLS policy
  // already restricts to the caller's rows, but the explicit filter makes ownership
  // enforcement obvious and guards against a mis-scoped delete. `sets` cascade on delete;
  // the gap this leaves in the position sequence is fine (inserts use max(position)+1).
  const { data, error } = await supabase
    .from("session_exercises")
    .delete()
    .eq("id", sessionExerciseId)
    .eq("user_id", userId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Exercise not found or not owned by user");
  }
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

export async function getPriorMaxWeights(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseIds: string[]
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const { data, error } = await supabase
    .from("exercise_prs")
    .select("exercise_id, pr_weight_kg")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    (data ?? [])
      .filter(
        (row): row is { exercise_id: string; pr_weight_kg: number } =>
          row.exercise_id !== null && row.pr_weight_kg !== null
      )
      .map((row) => [row.exercise_id, Number(row.pr_weight_kg)])
  );
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

  // Use max(set_number) + 1, not count(*) + 1: deleting a set from the middle leaves
  // a gap in the set_number sequence, so count(*) would recompute a set_number that
  // collides with the unique(session_exercise_id, set_number) constraint.
  const { data: maxRow, error: maxError } = await supabase
    .from("sets")
    .select("set_number")
    .eq("session_exercise_id", parsed.sessionExerciseId)
    .order("set_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw new Error(maxError.message);
  const nextSetNumber = maxRow ? maxRow.set_number + 1 : 1;

  const { data: set, error } = await supabase
    .from("sets")
    .insert({
      session_exercise_id: parsed.sessionExerciseId,
      user_id: userId,
      exercise_id: exerciseId,
      set_number: nextSetNumber,
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

export async function updateSetForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  setId: string,
  input: unknown
): Promise<{ set: SetRow; isPr: boolean }> {
  const parsed = updateSetSchema.parse(input);

  const { data: existing, error: existingError } = await supabase
    .from("sets")
    .select("exercise_id")
    .eq("id", setId)
    .eq("user_id", userId)
    .single();
  if (existingError) throw new Error(existingError.message);

  const priorMax = parsed.isWarmup
    ? null
    : await getPriorMaxWeight(supabase, userId, existing.exercise_id);

  const { data: set, error } = await supabase
    .from("sets")
    .update({
      weight_kg: parsed.weightKg,
      reps: parsed.reps,
      is_warmup: parsed.isWarmup,
    })
    .eq("id", setId)
    .eq("user_id", userId)
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
  // A session can only be finished once it has at least one logged set (defense in
  // depth; the client blocks this too). Two ways to fall short: no exercises at all,
  // or an exercise carrying zero sets. Fetch each session_exercise with its sets
  // (inner-less left join) and check both.
  const { data: sessionExercises, error: seError } = await supabase
    .from("session_exercises")
    .select("id, sets(id)")
    .eq("session_id", sessionId)
    .eq("user_id", userId);
  if (seError) throw new Error(seError.message);

  const list =
    (sessionExercises as unknown as { id: string; sets: { id: string }[] }[] | null) ?? [];
  if (list.length === 0) {
    throw new Error("Add at least one exercise with a logged set before finishing");
  }
  if (list.some((se) => (se.sets ?? []).length === 0)) {
    throw new Error("Remove exercises with no sets before finishing");
  }

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
