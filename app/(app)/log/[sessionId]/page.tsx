import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QueryProvider } from "./QueryProvider";
import { LoggingClient } from "./LoggingClient";

export default async function LogSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: session } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
  const { data: sessionExercises } = await supabase
    .from("session_exercises")
    .select("*, exercise:exercises(id, name), sets(*)")
    .eq("session_id", sessionId)
    .order("position");

  const exercises = (sessionExercises ?? []).map((se) => ({
    sessionExerciseId: se.id,
    exerciseId: se.exercise_id,
    exerciseName: (se as unknown as { exercise: { name: string } }).exercise.name,
    sets: ((se as unknown as { sets: { set_number: number }[] }).sets ?? []).sort(
      (a, b) => a.set_number - b.set_number
    ),
  }));

  return (
    <QueryProvider>
      <LoggingClient
        sessionId={sessionId}
        sessionName={session?.name ?? "Workout"}
        initialExercises={exercises as never}
      />
    </QueryProvider>
  );
}
