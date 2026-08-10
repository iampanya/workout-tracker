import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listExercises } from "@/lib/exercises/service";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { AddExerciseForm } from "./AddExerciseForm";
import { ArchiveExerciseButton } from "./ArchiveExerciseButton";

const MUSCLE_GROUP_TONE: Record<string, BadgeTone> = {
  Chest: "chest",
  Back: "back",
  Legs: "legs",
  Shoulders: "shoulders",
  Arms: "arms",
  Core: "core",
};

export default async function ExercisesPage() {
  const supabase = await createServerSupabaseClient();
  const exercises = await listExercises(supabase);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Exercises</h1>
      <AddExerciseForm />
      <div className="space-y-2">
        {exercises.map((exercise) => (
          <Card key={exercise.id} padding={false} className="flex items-center justify-between gap-2">
            <Link
              href={`/exercises/${exercise.id}`}
              className="flex flex-1 items-center justify-between gap-2 p-4"
            >
              <span className="flex items-center gap-2">
                {exercise.name}
                {exercise.muscle_group && (
                  <Badge tone={MUSCLE_GROUP_TONE[exercise.muscle_group] ?? "neutral"}>
                    {exercise.muscle_group}
                  </Badge>
                )}
              </span>
              <CaretRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
            {!exercise.is_preset && (
              <div className="pr-2">
                <ArchiveExerciseButton exerciseId={exercise.id} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
