"use client";

import { useState } from "react";
import { addExerciseToRoutine } from "@/lib/actions/routines";

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
          className="flex-1 rounded border px-3 py-2"
        >
          {availableExercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? "Adding..." : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
