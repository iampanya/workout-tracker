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

  async function handleAdd() {
    if (!exerciseId) return;
    await addExerciseToRoutine({ routineId, exerciseId });
  }

  return (
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
      <button onClick={handleAdd} className="rounded bg-black px-3 py-2 text-white">
        Add
      </button>
    </div>
  );
}
