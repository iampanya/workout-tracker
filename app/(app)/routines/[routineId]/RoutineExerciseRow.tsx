"use client";

import { removeRoutineExercise, moveRoutineExercise } from "@/lib/actions/routines";

export function RoutineExerciseRow({
  routineId,
  routineExerciseId,
  name,
}: {
  routineId: string;
  routineExerciseId: string;
  name: string;
}) {
  return (
    <li className="flex items-center justify-between py-2">
      <span>{name}</span>
      <div className="flex gap-2 text-sm">
        <button onClick={() => moveRoutineExercise(routineExerciseId, routineId, "up")}>↑</button>
        <button onClick={() => moveRoutineExercise(routineExerciseId, routineId, "down")}>↓</button>
        <button
          onClick={() => removeRoutineExercise(routineExerciseId, routineId)}
          className="text-gray-500 underline"
        >
          Remove
        </button>
      </div>
    </li>
  );
}
