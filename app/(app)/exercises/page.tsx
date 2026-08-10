import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listExercises } from "@/lib/exercises/service";
import { AddExerciseForm } from "./AddExerciseForm";
import { ArchiveExerciseButton } from "./ArchiveExerciseButton";

const MUSCLE_GROUP_STYLES: Record<string, string> = {
  Chest: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  Back: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  Legs: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Shoulders: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Arms: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Core: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export default async function ExercisesPage() {
  const supabase = await createServerSupabaseClient();
  const exercises = await listExercises(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Exercises</h1>
      <AddExerciseForm />
      <ul className="divide-y divide-border">
        {exercises.map((exercise) => (
          <li key={exercise.id} className="flex items-center justify-between py-2">
            <span className="flex items-center gap-2">
              <Link href={`/exercises/${exercise.id}`} className="underline">
                {exercise.name}
              </Link>
              {exercise.muscle_group && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    MUSCLE_GROUP_STYLES[exercise.muscle_group] ?? "bg-border text-muted"
                  }`}
                >
                  {exercise.muscle_group}
                </span>
              )}
            </span>
            {!exercise.is_preset && <ArchiveExerciseButton exerciseId={exercise.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
