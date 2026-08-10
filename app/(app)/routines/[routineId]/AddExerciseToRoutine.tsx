"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { addExerciseToRoutine } from "@/lib/actions/routines";
import { Button } from "@/components/ui/Button";

export function AddExerciseToRoutine({
  routineId,
  availableExercises,
}: {
  routineId: string;
  availableExercises: { id: string; name: string }[];
}) {
  const [exerciseId, setExerciseId] = useState(availableExercises[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!exerciseId) return;
    setPending(true);
    setError(null);
    try {
      await addExerciseToRoutine({ routineId, exerciseId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add exercise");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2"
        >
          {availableExercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} loading={pending} onClick={handleAdd}>
          Add
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
