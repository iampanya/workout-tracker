import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createRoutineSchema, addRoutineExerciseSchema } from "@/lib/validation";

export type Routine = Database["public"]["Tables"]["routines"]["Row"];
export type RoutineExercise = Database["public"]["Tables"]["routine_exercises"]["Row"];
export type RoutineExerciseWithExercise = RoutineExercise & {
  exercise: { id: string; name: string; muscle_group: string | null };
};

export async function listRoutines(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Routine[]> {
  const { data, error } = await supabase
    .from("routines")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRoutineForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<Routine> {
  const parsed = createRoutineSchema.parse(input);
  const { data, error } = await supabase
    .from("routines")
    .insert({ user_id: userId, name: parsed.name, notes: parsed.notes ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRoutineForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  routineId: string
): Promise<void> {
  const { error } = await supabase
    .from("routines")
    .delete()
    .eq("id", routineId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function getRoutineWithExercises(
  supabase: SupabaseClient<Database>,
  userId: string,
  routineId: string
): Promise<{ routine: Routine; exercises: RoutineExerciseWithExercise[] }> {
  const { data: routine, error: routineError } = await supabase
    .from("routines")
    .select("*")
    .eq("id", routineId)
    .eq("user_id", userId)
    .single();
  if (routineError) throw new Error(routineError.message);

  const { data: exercises, error: exercisesError } = await supabase
    .from("routine_exercises")
    .select("*, exercise:exercises(id, name, muscle_group)")
    .eq("routine_id", routineId)
    .order("position");
  if (exercisesError) throw new Error(exercisesError.message);

  return { routine, exercises: (exercises ?? []) as unknown as RoutineExerciseWithExercise[] };
}

export async function addExerciseToRoutineForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<RoutineExercise> {
  const parsed = addRoutineExerciseSchema.omit({ position: true }).parse(input);

  const { data: routine, error: routineError } = await supabase
    .from("routines")
    .select("id")
    .eq("id", parsed.routineId)
    .eq("user_id", userId)
    .single();
  if (routineError || !routine) {
    throw new Error("Routine not found or not owned by user");
  }

  // Verify the exercise exists and is visible to this user (RLS scopes visibility to
  // presets plus the caller's own custom exercises). Without this check, a caller could
  // insert a reference to a nonexistent or archived exercise, which later crashes
  // getRoutineWithExercises' consumers when they read entry.exercise.name off a null join.
  const { data: exercise, error: exerciseError } = await supabase
    .from("exercises")
    .select("id")
    .eq("id", parsed.exerciseId)
    .single();
  if (exerciseError || !exercise) {
    throw new Error("Exercise not found or not visible to user");
  }

  // Use max(position) + 1, not count(*): removing an exercise from the middle of a
  // routine leaves a gap (e.g. positions [0,2] after removing 1), so count(*) would
  // recompute a position that collides with the unique(routine_id, position) constraint.
  const { data: maxRow, error: maxError } = await supabase
    .from("routine_exercises")
    .select("position")
    .eq("routine_id", parsed.routineId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw new Error(maxError.message);
  const nextPosition = maxRow ? maxRow.position + 1 : 0;

  const { data, error } = await supabase
    .from("routine_exercises")
    .insert({
      routine_id: parsed.routineId,
      user_id: userId,
      exercise_id: parsed.exerciseId,
      position: nextPosition,
      target_sets: parsed.targetSets ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeRoutineExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  routineExerciseId: string
): Promise<void> {
  const { error } = await supabase
    .from("routine_exercises")
    .delete()
    .eq("id", routineExerciseId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function moveRoutineExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  routineExerciseId: string,
  direction: "up" | "down"
): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from("routine_exercises")
    .select("id, routine_id, position")
    .eq("id", routineExerciseId)
    .eq("user_id", userId)
    .single();
  if (currentError) throw new Error(currentError.message);

  const targetPosition = direction === "up" ? current.position - 1 : current.position + 1;

  const { data: neighbor, error: neighborError } = await supabase
    .from("routine_exercises")
    .select("id, position")
    .eq("routine_id", current.routine_id)
    .eq("position", targetPosition)
    .maybeSingle();
  if (neighborError) throw new Error(neighborError.message);
  if (!neighbor) return;

  const { error: e1 } = await supabase
    .from("routine_exercises")
    .update({ position: -1 })
    .eq("id", current.id);
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from("routine_exercises")
    .update({ position: current.position })
    .eq("id", neighbor.id);
  if (e2) throw new Error(e2.message);

  const { error: e3 } = await supabase
    .from("routine_exercises")
    .update({ position: targetPosition })
    .eq("id", current.id);
  if (e3) throw new Error(e3.message);
}
