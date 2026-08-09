import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ExerciseHistorySet = {
  id: string;
  session_date: string;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

export async function getExerciseHistory(
  supabase: SupabaseClient<Database>,
  exerciseId: string
): Promise<ExerciseHistorySet[]> {
  const { data, error } = await supabase
    .from("sets")
    .select(
      "id, weight_kg, reps, is_warmup, created_at, session_exercises!inner(sessions!inner(session_date))"
    )
    .eq("exercise_id", exerciseId)
    .order("created_at");
  if (error) throw new Error(error.message);

  return (
    data as unknown as {
      id: string;
      weight_kg: number;
      reps: number;
      is_warmup: boolean;
      session_exercises: { sessions: { session_date: string } };
    }[]
  ).map((row) => ({
    id: row.id,
    weight_kg: Number(row.weight_kg),
    reps: row.reps,
    is_warmup: row.is_warmup,
    session_date: row.session_exercises.sessions.session_date,
  }));
}

export async function getExercisePr(
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
