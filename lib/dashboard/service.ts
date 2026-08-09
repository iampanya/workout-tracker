import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type InProgressSession = Database["public"]["Tables"]["sessions"]["Row"];
export type SessionPr = { exerciseName: string; weightKg: number };

export async function listInProgressSessions(
  supabase: SupabaseClient<Database>
): Promise<InProgressSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .is("completed_at", null)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPrsFromLastCompletedSession(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<SessionPr[]> {
  const { data: lastSession, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!lastSession) return [];

  const { data: sets, error: setsError } = await supabase
    .from("sets")
    .select("weight_kg, exercise_id, exercises(name), session_exercises!inner(session_id)")
    .eq("session_exercises.session_id", lastSession.id)
    .eq("is_warmup", false);
  if (setsError) throw new Error(setsError.message);

  const { data: prs, error: prsError } = await supabase
    .from("exercise_prs")
    .select("exercise_id, pr_weight_kg")
    .eq("user_id", userId);
  if (prsError) throw new Error(prsError.message);

  const prByExercise = new Map((prs ?? []).map((p) => [p.exercise_id, Number(p.pr_weight_kg)]));
  const seen = new Set<string>();
  const results: SessionPr[] = [];

  for (const set of (sets ?? []) as unknown as {
    weight_kg: number;
    exercise_id: string;
    exercises: { name: string };
  }[]) {
    const prWeight = prByExercise.get(set.exercise_id);
    if (prWeight !== undefined && Number(set.weight_kg) === prWeight && !seen.has(set.exercise_id)) {
      seen.add(set.exercise_id);
      results.push({ exerciseName: set.exercises.name, weightKg: prWeight });
    }
  }

  return results;
}
