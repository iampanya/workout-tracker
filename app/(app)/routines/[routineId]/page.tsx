import { notFound } from "next/navigation";
import { ListPlus } from "@phosphor-icons/react/ssr";
import { getAuthUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getRoutineWithExercises } from "@/lib/routines/service";
import { listExercises, listRecentExerciseIds } from "@/lib/exercises/service";
import { EmptyState } from "@/components/ui/EmptyState";
import { RoutineExerciseRow } from "./RoutineExerciseRow";
import { AddExerciseToRoutine } from "./AddExerciseToRoutine";
import { StartRoutineButton } from "../StartRoutineButton";

export default async function RoutineEditorPage({
  params,
}: {
  params: Promise<{ routineId: string }>;
}) {
  const { routineId } = await params;
  const userId = (await getAuthUser())!.id;
  const [routineResult, allExercises, recentExerciseIds] = await Promise.all([
    // getRoutineWithExercises throws for a missing / not-owned routine → 404 instead of a crash.
    getRoutineWithExercises(prisma, userId, routineId).catch(() => null),
    listExercises(prisma, userId),
    listRecentExerciseIds(prisma, userId),
  ]);
  if (!routineResult) {
    notFound();
  }
  const { routine, exercises } = routineResult;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{routine.name}</h1>
          <p className="text-sm text-muted">
            {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
          </p>
        </div>
        {exercises.length > 0 && (
          <StartRoutineButton
            routine={{ id: routine.id, name: routine.name }}
            className="shrink-0"
          />
        )}
      </div>

      {exercises.length === 0 ? (
        <EmptyState
          icon={<ListPlus className="h-6 w-6" />}
          title="No exercises in this routine"
          description="Add exercises below in the order you'll do them."
        />
      ) : (
        <div className="space-y-2">
          {exercises.map((entry, index) => (
            <RoutineExerciseRow
              key={entry.id}
              routineId={routineId}
              routineExerciseId={entry.id}
              name={entry.exercise.name}
              muscleGroup={entry.exercise.muscle_group}
              targetSets={entry.target_sets}
              isFirst={index === 0}
              isLast={index === exercises.length - 1}
            />
          ))}
        </div>
      )}

      <AddExerciseToRoutine
        routineId={routineId}
        availableExercises={allExercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscle_group,
        }))}
        recentExerciseIds={recentExerciseIds}
        addedExerciseIds={exercises.map((entry) => entry.exercise.id)}
      />
    </div>
  );
}
