import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type CompletedSession = Database["public"]["Tables"]["sessions"]["Row"];

export type SessionDetail = {
  session: CompletedSession;
  exercises: {
    exerciseName: string;
    sets: { weight_kg: number; reps: number; is_warmup: boolean; set_number: number }[];
  }[];
} | null;

export async function listCompletedSessions(
  supabase: SupabaseClient<Database>
): Promise<CompletedSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .not("completed_at", "is", null)
    .order("session_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSessionDetail(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<SessionDetail> {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return null;

  const { data: sessionExercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("position, exercise:exercises(name), sets(weight_kg, reps, is_warmup, set_number)")
    .eq("session_id", sessionId)
    .order("position");
  if (exercisesError) throw new Error(exercisesError.message);

  const exercises = (
    sessionExercises as unknown as {
      exercise: { name: string };
      sets: { weight_kg: number; reps: number; is_warmup: boolean; set_number: number }[];
    }[]
  ).map((se) => ({
    exerciseName: se.exercise.name,
    sets: [...se.sets].sort((a, b) => a.set_number - b.set_number),
  }));

  return { session, exercises };
}
