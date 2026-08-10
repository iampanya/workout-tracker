import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type CompletedSession = Database["public"]["Tables"]["sessions"]["Row"];
export type CompletedSessionListItem = CompletedSession & { routineName: string | null };

export type SessionDetail = {
  session: CompletedSession & { routineName: string | null };
  exercises: {
    exerciseName: string;
    sets: { weight_kg: number; reps: number; is_warmup: boolean; set_number: number }[];
  }[];
} | null;

// The display label for a session: the name snapshotted at start, falling back to the
// linked routine's current name (covers sessions created before name-snapshotting existed),
// then to "Freeform Workout" for sessions started without a routine.
export function sessionDisplayName(session: {
  name: string | null;
  routineName?: string | null;
}): string {
  return session.name ?? session.routineName ?? "Freeform Workout";
}

export async function listCompletedSessions(
  supabase: SupabaseClient<Database>
): Promise<CompletedSessionListItem[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*, routine:routines(name)")
    .not("completed_at", "is", null)
    .order("session_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const { routine, ...session } = row as typeof row & { routine: { name: string } | null };
    return { ...session, routineName: routine?.name ?? null };
  });
}

export async function getSessionDetail(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<SessionDetail> {
  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .select("*, routine:routines(name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!sessionRow) return null;
  const { routine, ...session } = sessionRow as typeof sessionRow & {
    routine: { name: string } | null;
  };
  const sessionWithRoutineName = { ...session, routineName: routine?.name ?? null };

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

  return { session: sessionWithRoutineName, exercises };
}
