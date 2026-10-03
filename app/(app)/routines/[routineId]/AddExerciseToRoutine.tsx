"use client";

import { addExerciseToRoutine } from "@/lib/actions/routines";
import { ExercisePicker, type ExerciseOption } from "@/components/ui/ExercisePicker";

export function AddExerciseToRoutine({
  routineId,
  availableExercises,
  recentExerciseIds,
  addedExerciseIds,
}: {
  routineId: string;
  availableExercises: ExerciseOption[];
  recentExerciseIds: string[];
  addedExerciseIds: string[];
}) {
  // Errors propagate to ExercisePicker, which shows them in the sheet and serializes adds; the
  // action's revalidatePath refreshes the routine list (and addedExerciseIds) behind the sheet.
  async function handleAdd(exercise: ExerciseOption) {
    await addExerciseToRoutine({ routineId, exerciseId: exercise.id });
  }

  return (
    <ExercisePicker
      exercises={availableExercises}
      recentIds={recentExerciseIds}
      addedIds={addedExerciseIds}
      onAdd={handleAdd}
    />
  );
}
