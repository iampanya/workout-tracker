import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listExercises } from "@/lib/exercises/service";
import { getPriorMaxWeights } from "@/lib/sessions/service";
import { sessionDisplayName } from "@/lib/sessions/history";
import { QueryProvider } from "./QueryProvider";
import { LoggingClient } from "./LoggingClient";

export default async function LogSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("*, routine:routines(name)")
    .eq("id", sessionId)
    .single();
  if (!sessionRow) {
    notFound();
  }
  const { routine, ...session } = sessionRow as typeof sessionRow & {
    routine: { name: string } | null;
  };
  const displayName = sessionDisplayName({ name: session.name, routineName: routine?.name ?? null });
  const [{ data: sessionExercises }, availableExercises] = await Promise.all([
    supabase
      .from("session_exercises")
      .select("*, exercise:exercises(id, name), sets(*)")
      .eq("session_id", sessionId)
      .order("position"),
    listExercises(supabase),
  ]);

  const exerciseIds = [...new Set((sessionExercises ?? []).map((se) => se.exercise_id))];
  const prMap = await getPriorMaxWeights(supabase, user!.id, exerciseIds);

  const exercises = (sessionExercises ?? []).map((se) => ({
    sessionExerciseId: se.id,
    exerciseId: se.exercise_id,
    exerciseName: (se as unknown as { exercise: { name: string } }).exercise.name,
    sets: ((se as unknown as { sets: { set_number: number }[] }).sets ?? []).sort(
      (a, b) => a.set_number - b.set_number
    ),
    prWeightKg: prMap[se.exercise_id] ?? null,
  }));

  return (
    <QueryProvider>
      <LoggingClient
        sessionId={sessionId}
        sessionName={displayName}
        initialExercises={exercises as never}
        availableExercises={availableExercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscle_group,
        }))}
      />
    </QueryProvider>
  );
}
