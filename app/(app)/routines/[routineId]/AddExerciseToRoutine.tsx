"use client";

import { useState } from "react";
import { CircleNotch } from "@phosphor-icons/react/ssr";
import { addExerciseToRoutine } from "@/lib/actions/routines";
import { ExerciseCombobox, type ExerciseOption } from "@/components/ui/ExerciseCombobox";

export function AddExerciseToRoutine({
  routineId,
  availableExercises,
}: {
  routineId: string;
  availableExercises: ExerciseOption[];
}) {
  // Starts empty so nothing gets added by accident; picking an exercise adds it immediately.
  const [exerciseId, setExerciseId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(id: string) {
    if (!id || pending) return;
    setExerciseId(id);
    setPending(true);
    setError(null);
    try {
      await addExerciseToRoutine({ routineId, exerciseId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add exercise");
    } finally {
      setPending(false);
      setExerciseId("");
    }
  }

  return (
    <div>
      <div className="flex items-end gap-2">
        <ExerciseCombobox
          label="Add exercise"
          exercises={availableExercises}
          value={exerciseId}
          onChange={handleAdd}
          wrapperClassName="flex-1"
        />
        {pending && (
          <span
            role="status"
            aria-label="Adding exercise"
            className="flex h-11 w-11 items-center justify-center text-muted"
          >
            <CircleNotch className="h-5 w-5 animate-spin" />
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
