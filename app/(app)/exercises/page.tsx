import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listExercises } from "@/lib/exercises/service";
import { AddExerciseForm } from "./AddExerciseForm";
import { ArchiveExerciseButton } from "./ArchiveExerciseButton";

export default async function ExercisesPage() {
  const supabase = await createServerSupabaseClient();
  const exercises = await listExercises(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Exercises</h1>
      <AddExerciseForm />
      <ul className="divide-y">
        {exercises.map((exercise) => (
          <li key={exercise.id} className="flex items-center justify-between py-2">
            <span>
              {exercise.name}
              {exercise.muscle_group && (
                <span className="ml-2 text-sm text-gray-500">{exercise.muscle_group}</span>
              )}
            </span>
            {!exercise.is_preset && <ArchiveExerciseButton exerciseId={exercise.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
