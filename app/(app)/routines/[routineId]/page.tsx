import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRoutineWithExercises } from "@/lib/routines/service";
import { listExercises } from "@/lib/exercises/service";
import { RoutineExerciseRow } from "./RoutineExerciseRow";
import { AddExerciseToRoutine } from "./AddExerciseToRoutine";

export default async function RoutineEditorPage({
  params,
}: {
  params: Promise<{ routineId: string }>;
}) {
  const { routineId } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ routine, exercises }, allExercises] = await Promise.all([
    getRoutineWithExercises(supabase, (await supabase.auth.getUser()).data.user!.id, routineId),
    listExercises(supabase),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{routine.name}</h1>
      <div className="space-y-2">
        {exercises.map((entry) => (
          <RoutineExerciseRow
            key={entry.id}
            routineId={routineId}
            routineExerciseId={entry.id}
            name={entry.exercise.name}
          />
        ))}
      </div>
      <AddExerciseToRoutine routineId={routineId} availableExercises={allExercises} />
    </div>
  );
}
