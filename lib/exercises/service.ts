import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createExerciseSchema } from "@/lib/validation";

export type Exercise = Database["public"]["Tables"]["exercises"]["Row"];

// Only the columns the list UIs actually read (picker, exercises index, archive button).
// Selecting these instead of `*` avoids shipping user_id/created_at/notes over the wire.
export type ExerciseListItem = Pick<Exercise, "id" | "name" | "muscle_group" | "is_preset">;

export async function listExercises(
  supabase: SupabaseClient<Database>,
  options: { includeArchived?: boolean } = {}
): Promise<ExerciseListItem[]> {
  let query = supabase
    .from("exercises")
    .select("id, name, muscle_group, is_preset")
    .order("muscle_group")
    .order("name");
  if (!options.includeArchived) {
    query = query.eq("is_archived", false);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCustomExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown
): Promise<Exercise> {
  const parsed = createExerciseSchema.parse(input);
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      user_id: userId,
      name: parsed.name,
      muscle_group: parsed.muscleGroup ?? null,
      is_preset: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function archiveExerciseForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  exerciseId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("exercises")
    .update({ is_archived: true })
    .eq("id", exerciseId)
    .eq("user_id", userId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Exercise not found or not owned by user");
  }
}
